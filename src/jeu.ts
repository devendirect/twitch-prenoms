import { z, type ActionModeration, type Commande, type FabriqueJeu, type Joueur, type MessageJoueur } from 'socle';
import { COMMANDES } from './commandes.js';
import type { Donnees, Source } from './donnees.js';
import type { Niveau, Prenom, Sexe } from './insee.js';
import { ETAT_INITIAL, histogramme, REGLAGES, transition, type Effet, type Etat, type Evenement, type Reglages } from './manche.js';
import { messagesEn } from './messages.en.js';
import { messagesFr } from './messages.fr.js';
import { Tirage, type Jouable } from './tirage.js';

/**
 * Le jeu branché sur le socle (contrat `MiniJeu`) : traduit le chat en événements de la
 * machine (`manche.ts`), exécute ses effets, gère `!prenom`, et calcule la vue.
 */

/** `!prenom` : 3 demandes en file au plus, 1 par personne toutes les 2 minutes, 8 s à l'écran. */
export const PRENOM = { file: 3, fenetreMs: 120_000, dureeMs: 8_000 } as const;

/** Bornes des réglages du panneau. */
export const LIMITES_PANNEAU = { manches: { min: 1, max: 20 }, ouvertSecondes: { min: 10, max: 120 } } as const;

/** `POST /api/jeu` : lancer une partie avec ses réglages. Champ inconnu refusé (socle). */
export const SCHEMA_PANNEAU = z
  .object({
    action: z.literal('demarrer'),
    manches: z.number().int().min(LIMITES_PANNEAU.manches.min).max(LIMITES_PANNEAU.manches.max),
    ouvertSecondes: z.number().int().min(LIMITES_PANNEAU.ouvertSecondes.min).max(LIMITES_PANNEAU.ouvertSecondes.max),
  })
  .strict();

/** Réglage de durée de chaque état. */
const DUREES = {
  annonce: 'annonceMs', ouvert: 'ouvertMs', revelation: 'revelationMs', scores: 'scoresMs', fin: 'finMs',
} as const satisfies Record<Exclude<Etat['phase'], 'attente'>, keyof Reglages>;

/** Une réponse : quatre chiffres seuls (« 1987 »), ou l'argument de `!annee`. */
const ANNEE = /^\d{4}$/;

export interface Courbe {
  debut: number;
  effectifs: number[];
  pics: number[];
  effectifPic: number;
}

export interface VuePrenoms {
  phase: Etat['phase'];
  /** Mention de source, dans la langue de l'overlay : jamais écrite en dur. */
  source: Pick<Source, 'producteur' | 'titre' | 'edition' | 'licence' | 'arrondi'>;
  axe: { premiere: number; derniere: number };
  /** Millisecondes avant la fin de l'état en cours. */
  restantMs: number;
  /** Durée totale de l'état en cours (barre de temps). */
  dureeMs: number;
  manche: {
    numero: number;
    total: number;
    nom: string;
    sexe: Sexe;
    reponses: number;
    /** Anonyme : par décennie. */
    histogramme: { decennie: number; n: number }[];
    /** Seulement à partir de la révélation : la vue ne dévoile rien avant. */
    courbe: Courbe | null;
    meilleurs: { pseudo: string; annee: number; ecart: number; points: number; victoire: boolean }[];
  } | null;
  /** Classement de la partie (scores, fin) ou de la soirée (attente). */
  classement: { pseudo: string; points: number; victoires: number }[];
  classementDe: 'partie' | 'soiree' | null;
  /** Carte `!prenom` en cours. */
  carte: { nom: string; sexe: Sexe; demandePar: string; courbe: Courbe; restantMs: number } | null;
}

interface Demande {
  prenom: Prenom;
  autres: string[];
  joueur: Joueur;
}

export interface OptionsJeu {
  donnees: Donnees;
  jouables: readonly Jouable[];
  reglages?: Reglages;
}

const courbe = (p: Prenom): Courbe => ({ debut: p.debut, effectifs: p.effectifs, pics: p.pics, effectifPic: p.effectifPic });

export function mentionSource(s: Source): string {
  return `Source : ${s.producteur}, ${s.titre} (édition ${s.edition}) · ${s.licence} · effectifs arrondis à ${s.arrondi}`;
}

export function creerJeu(options: OptionsJeu): FabriqueJeu<VuePrenoms> {
  const { donnees } = options;
  const reglages = options.reglages ?? REGLAGES;

  return (outils) => {
    const tirage = new Tirage(options.jouables, outils.aleatoire);
    const niveaux = new Map<Prenom, Niveau>(options.jouables.map((j) => [j.prenom, j.niveau]));
    const limitePrenom = outils.limites.creer({ max: 1, fenetreMs: PRENOM.fenetreMs });
    let etat: Etat = ETAT_INITIAL;
    const file: Demande[] = [];
    let carte: (Demande & { finAt: number }) | null = null;
    /** Simulateur seulement : qui a déjà répondu à quelle manche. */
    const repondus = new Set<string>();

    const executer = (effets: Effet[]) => {
      for (const e of effets) {
        switch (e.type) {
          case 'dire':
            outils.chat.dire(e.cle, e.params);
            break;
          case 'points':
            outils.scores.award(e.joueur, e.points, { victoire: e.victoire });
            break;
          case 'manche-ouverte':
            outils.manches.ouvrir(e.id);
            break;
          case 'manche-fermee':
            outils.manches.fermer(e.id, e.statut);
            break;
          case 'diffuser':
            outils.diffuser();
            break;
        }
      }
    };

    const appliquer = (ev: Evenement, now: Date) => {
      const t = transition(etat, ev, now);
      etat = t.etat;
      executer(t.effets);
    };

    /** Une carte `!prenom` ne commence qu'entre deux manches. */
    const avancerCartes = (now: Date) => {
      const t = now.getTime();
      if (carte && t >= carte.finAt) {
        carte = null;
        outils.diffuser();
      }
      if (carte || !['attente', 'scores', 'fin'].includes(etat.phase)) return;
      const demande = file.shift();
      if (!demande) return;
      carte = { ...demande, finAt: t + PRENOM.dureeMs };
      const { prenom: p } = demande;
      // Sa courbe est montrée : il ne sera plus tiré ce soir, ni joué plus tard dans cette partie.
      tirage.retirer(p);
      const niveau = niveaux.get(p);
      if (niveau && etat.phase !== 'attente' && etat.partie.aVenir.includes(p)) {
        appliquer({ type: 'remplacer', ancien: p, nouveau: tirage.tirer(niveau) }, now);
      }
      outils.chat.dire(
        'prenomCourbe',
        {
          nom: p.nom, sexe: p.sexe, pics: p.pics, effectif: p.effectifPic, total: p.total,
          premiere: donnees.premiereAnnee, autres: demande.autres, pseudo: demande.joueur.displayName,
        },
        { essentiel: false },
      );
      outils.diffuser();
    };

    /** Réglages de la dernière partie lancée depuis le panneau ; `!jeu start` les reprend. */
    let reglagesCourants = reglages;

    /** Tire les prénoms et lance la partie ; faux si une partie est déjà en cours. */
    const demarrer = (r: Reglages, now: Date): boolean => {
      if (etat.phase !== 'attente' && etat.phase !== 'fin') return false;
      const prenoms = tirage
        .plan(r.manches)
        .map((n) => tirage.tirer(n))
        .filter((p): p is Prenom => p !== null);
      appliquer({ type: 'demarrer', prenoms, reglages: r, premiere: donnees.premiereAnnee, derniere: donnees.derniereAnnee }, now);
      avancerCartes(now);
      return true;
    };

    const repondre = (joueur: Joueur, texte: string | undefined, messageId: string | null, now: Date) => {
      // `Number` seul lirait « 0x7C3 » ou « 1987.0 » comme 1987. La phase et les années
      // du fichier sont contrôlées par la machine.
      if (texte === undefined || !ANNEE.test(texte)) return;
      appliquer({ type: 'reponse', joueur, annee: Number(texte), messageId }, now);
    };

    const demanderPrenom = (commande: Commande, now: Date) => {
      const recherche = donnees.chercher(commande.args.join(' '));
      // Texte refusé (commande Twitch, HTML, trop long) ou file pleine : silence.
      if (recherche.type === 'invalide' || file.length >= PRENOM.file) return;
      if (!limitePrenom.autoriser(commande.joueur.userId)) return;
      if (recherche.type === 'inconnu') {
        outils.chat.dire('prenomInconnu', { pseudo: commande.joueur.displayName }, { essentiel: false });
        return;
      }
      file.push({ prenom: recherche.prenom, autres: recherche.autres, joueur: commande.joueur });
      avancerCartes(now);
    };

    const vueManche = (now: number): VuePrenoms['manche'] => {
      if (etat.phase === 'attente' || etat.phase === 'fin') return null;
      const { manche, partie } = etat;
      const revele = etat.phase === 'revelation' || etat.phase === 'scores';
      return {
        numero: manche.numero,
        total: partie.total,
        nom: manche.prenom.nom,
        sexe: manche.prenom.sexe,
        reponses: manche.reponses.length,
        histogramme: histogramme(manche.reponses, partie.premiere, partie.derniere),
        courbe: revele ? courbe(manche.prenom) : null,
        // Le résultat n'existe qu'à partir de la révélation.
        meilleurs: (manche.resultat ?? []).slice(0, 3).map((r) => ({
          pseudo: r.reponse.joueur.displayName, annee: r.reponse.annee, ecart: r.ecart, points: r.points, victoire: r.victoire,
        })),
      };
    };

    return {
      id: 'prenoms',
      attribution: mentionSource(donnees.source),
      commandes: COMMANDES,
      messages: { fr: messagesFr, en: messagesEn },

      surCommande(commande: Commande, now: Date) {
        if (commande.nom === 'annee') repondre(commande.joueur, commande.args[0], commande.messageId, now);
        else if (commande.nom === 'prenom') demanderPrenom(commande, now);
      },

      surMessage(message: MessageJoueur, now: Date) {
        // Quatre chiffres seuls, et seulement en `ouvert` : ailleurs, c'est de la conversation.
        repondre(message.joueur, message.texte.trim(), message.id, now);
      },

      surRetrait(messageIds: string[], userId?: string) {
        appliquer({ type: 'retrait', messageIds, userId }, outils.clock.now());
        if (userId === undefined) return;
        // Banni, ou `!oubliemoi` : ses demandes `!prenom` disparaissent aussi (son pseudo s'y affiche).
        for (let i = file.length - 1; i >= 0; i--) if (file[i]!.joueur.userId === userId) file.splice(i, 1);
        if (carte?.joueur.userId === userId) carte = null;
        limitePrenom.oublier(userId);
        outils.diffuser();
      },

      surModeration(action: ActionModeration, now: Date) {
        if (action === 'start') {
          demarrer(reglagesCourants, now);
        } else if (action === 'stop') {
          appliquer({ type: 'arreter' }, now);
        } else {
          // Un remplaçant n'est tiré que s'il sert (manche pas encore jouée).
          const remplacant =
            etat.phase === 'annonce' || etat.phase === 'ouvert' ? tirage.tirer(niveaux.get(etat.manche.prenom) ?? 'moyen') : null;
          appliquer({ type: 'passer', remplacant }, now);
        }
        avancerCartes(now);
      },

      tic(now: Date) {
        appliquer({ type: 'tic' }, now);
        avancerCartes(now);
      },

      vue(now: Date): VuePrenoms {
        /** Partie (scores, fin) ; soirée sur l'écran d'accueil ; rien pendant une manche. */
        const classement = (): Pick<VuePrenoms, 'classement' | 'classementDe'> => {
          if (etat.phase === 'scores' || etat.phase === 'fin') {
            return {
              classementDe: 'partie',
              classement: etat.partie.cumul.slice(0, 5).map((c) => ({ pseudo: c.joueur.displayName, points: c.points, victoires: c.victoires })),
            };
          }
          if (etat.phase === 'attente') {
            return {
              classementDe: 'soiree',
              classement: outils.scores.classement(5).map((p) => ({ pseudo: p.displayName, points: p.points, victoires: p.wins })),
            };
          }
          return { classementDe: null, classement: [] };
        };
        const t = now.getTime();
        const { producteur, titre, edition, licence, arrondi } = donnees.source;
        return {
          phase: etat.phase,
          source: { producteur, titre, edition, licence, arrondi },
          axe: { premiere: donnees.premiereAnnee, derniere: donnees.derniereAnnee },
          restantMs: etat.phase === 'attente' ? 0 : Math.max(0, etat.finAt - t),
          dureeMs: etat.phase === 'attente' ? 0 : etat.partie.reglages[DUREES[etat.phase]],
          manche: vueManche(t),
          ...classement(),
          carte: carte
            ? {
                nom: carte.prenom.nom,
                sexe: carte.prenom.sexe,
                demandePar: carte.joueur.displayName,
                courbe: courbe(carte.prenom),
                restantMs: Math.max(0, carte.finAt - t),
              }
            : null,
        };
      },

      panneau: {
        // Pour le streamer seul (/api/jeu, jamais diffusé) : la réponse et les prénoms à venir.
        etat(now: Date) {
          const t = now.getTime();
          const prenom = (p: Prenom) => ({ nom: p.nom, sexe: p.sexe, niveau: niveaux.get(p) ?? null, pics: p.pics, effectifPic: p.effectifPic, total: p.total });
          return {
            phase: etat.phase,
            restantMs: etat.phase === 'attente' ? 0 : Math.max(0, etat.finAt - t),
            reglages: { manches: reglagesCourants.manches, ouvertSecondes: reglagesCourants.ouvertMs / 1000 },
            limites: LIMITES_PANNEAU,
            restantsCeSoir: tirage.restants,
            manche:
              etat.phase === 'attente' || etat.phase === 'fin'
                ? null
                : { numero: etat.manche.numero, total: etat.partie.total, prenom: prenom(etat.manche.prenom), reponses: etat.manche.reponses.length },
            aVenir: etat.phase === 'attente' ? [] : etat.partie.aVenir.map(prenom),
            classement: etat.phase === 'attente' ? [] : etat.partie.cumul.slice(0, 10).map((c) => ({ pseudo: c.joueur.displayName, points: c.points, victoires: c.victoires })),
            fileDemandes: file.length,
          };
        },
        schema: SCHEMA_PANNEAU,
        executer(commande: unknown, now: Date) {
          const c = commande as z.infer<typeof SCHEMA_PANNEAU>;
          const r: Reglages = { ...reglages, manches: c.manches, ouvertMs: c.ouvertSecondes * 1000 };
          if (!demarrer(r, now)) return { erreur: 'Une partie est déjà en cours : arrête-la d’abord.' };
          reglagesCourants = r;
        },
      },

      profilSimu: {
        // Le profil lit l'état interne : la vue, elle, ne dévoile pas le pic avant la révélation.
        reponse(_vue, aleatoire, nom) {
          if (etat.phase === 'ouvert') {
            // Environ 1 sur 5 change d'avis : une fois répondu, rarement une seconde réponse.
            const cle = `${etat.manche.id}|${nom}`;
            if (repondus.has(cle) && aleatoire() > 0.1) return null;
            repondus.add(cle);
            const pic = etat.manche.prenom.pics[0]!;
            // La plupart à moins de 15 ans du pic, quelques-uns n'importe où.
            const annee =
              aleatoire() < 0.85
                ? Math.round(pic + (aleatoire() + aleatoire() + aleatoire() - 1.5) * 20)
                : donnees.premiereAnnee + Math.floor(aleatoire() * (donnees.derniereAnnee - donnees.premiereAnnee + 1));
            const borne = Math.min(donnees.derniereAnnee, Math.max(donnees.premiereAnnee, annee));
            return aleatoire() < 0.5 ? String(borne) : `!annee ${borne}`;
          }
          if ((etat.phase === 'scores' || etat.phase === 'attente') && aleatoire() < 0.03) {
            const j = options.jouables[Math.floor(aleatoire() * options.jouables.length)];
            return j ? `!prenom ${j.prenom.nom}` : null;
          }
          return null;
        },
      },
    };
  };
}
