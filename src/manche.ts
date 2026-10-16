import type { Joueur } from 'socle';
import type { Prenom } from './insee.js';
import { classer, type Classee } from './points.js';

/**
 * Machine à états d'une partie — PURE, comme celle du SNCF (BRIEF.md, section 2).
 *
 * Elle ne connaît ni le chat, ni la base, ni l'horloge : un état, un événement et un
 * instant donnent un nouvel état et des effets, que `jeu.ts` exécute (dire, donner les
 * points, suivre la manche en base, rediffuser). Le tirage est fait avant : `demarrer`
 * apporte les prénoms de la partie, `passer` le remplaçant.
 *
 *   attente → annonce → ouvert → revelation → scores → annonce … → fin → attente
 */

export interface Reglages {
  manches: number;
  annonceMs: number;
  ouvertMs: number;
  revelationMs: number;
  scoresMs: number;
  finMs: number;
}

export const REGLAGES: Reglages = {
  manches: 10,
  annonceMs: 3_000,
  ouvertMs: 30_000,
  revelationMs: 10_000,
  scoresMs: 5_000,
  finMs: 10_000,
};

export interface Reponse {
  joueur: Joueur;
  annee: number;
  messageId: string | null;
}

export interface Manche {
  /** Pour le suivi en base (`outils.manches`) : unique, même pour un remplaçant. */
  id: string;
  numero: number;
  prenom: Prenom;
  /** Une par joueur, la dernière reçue. */
  reponses: readonly Reponse[];
  /** Calculé à la fin de `ouvert`. */
  resultat: readonly Classee<Reponse>[] | null;
}

export interface Cumul {
  joueur: Joueur;
  points: number;
  victoires: number;
}

export interface Partie {
  id: string;
  reglages: Reglages;
  /** Années acceptées : celles du fichier. */
  premiere: number;
  derniere: number;
  /** Nombre de manches annoncé (« 3 / 10 »). */
  total: number;
  /** Prénoms des manches suivantes. */
  aVenir: readonly Prenom[];
  /** Manches lancées, remplaçants compris : sert aux identifiants. */
  lancees: number;
  /** Classement de la partie : victoires, puis points. */
  cumul: readonly Cumul[];
}

export type PhaseManche = 'annonce' | 'ouvert' | 'revelation' | 'scores';

export type Etat =
  | { phase: 'attente' }
  | { phase: PhaseManche; partie: Partie; manche: Manche; finAt: number }
  | { phase: 'fin'; partie: Partie; finAt: number };

export type Evenement =
  | { type: 'demarrer'; prenoms: readonly Prenom[]; reglages: Reglages; premiere: number; derniere: number }
  | { type: 'reponse'; joueur: Joueur; annee: number; messageId: string | null }
  /** `CLEARMSG`, `CLEARCHAT` ciblé ou `!oubliemoi`. */
  | { type: 'retrait'; messageIds: readonly string[]; userId?: string | undefined }
  /** `remplacant` : nouveau prénom pour la même manche, `null` si le tirage est épuisé. */
  | { type: 'passer'; remplacant: Prenom | null }
  /**
   * `!prenom` a montré la courbe d'un prénom prévu plus tard dans la partie : il est
   * remplacé (`null` : tirage épuisé, la partie compte une manche de moins).
   */
  | { type: 'remplacer'; ancien: Prenom; nouveau: Prenom | null }
  | { type: 'arreter' }
  | { type: 'tic' };

export type Effet =
  | { type: 'dire'; cle: string; params: Record<string, unknown> }
  | { type: 'manche-ouverte'; id: string }
  | { type: 'manche-fermee'; id: string; statut: 'terminee' | 'annulee' }
  | { type: 'points'; joueur: Joueur; points: number; victoire: boolean }
  /** Sans état : `jeu.ts` publie la vue courante. */
  | { type: 'diffuser' };

export interface Transition {
  etat: Etat;
  effets: Effet[];
}

export const ETAT_INITIAL: Etat = { phase: 'attente' };

const rien = (etat: Etat): Transition => ({ etat, effets: [] });

function lancer(partie: Partie, numero: number, prenom: Prenom, now: number): Transition {
  const p: Partie = { ...partie, lancees: partie.lancees + 1 };
  const manche: Manche = { id: `${p.id}-${p.lancees}`, numero, prenom, reponses: [], resultat: null };
  return {
    etat: { phase: 'annonce', partie: p, manche, finAt: now + p.reglages.annonceMs },
    effets: [
      { type: 'manche-ouverte', id: manche.id },
      {
        type: 'dire',
        cle: 'annonce',
        params: { numero, total: p.total, nom: prenom.nom, sexe: prenom.sexe, premiere: p.premiere, derniere: p.derniere },
      },
      { type: 'diffuser' },
    ],
  };
}

/** Manche suivante, ou fin de partie avec son podium. */
function suivante(partie: Partie, numero: number, now: number): Transition {
  const [prochain, ...reste] = partie.aVenir;
  if (prochain) return lancer({ ...partie, aVenir: reste }, numero + 1, prochain, now);
  return {
    etat: { phase: 'fin', partie, finAt: now + partie.reglages.finMs },
    effets: [
      { type: 'dire', cle: 'fin', params: { podium: partie.cumul.slice(0, 3).map(versPodium) } },
      { type: 'diffuser' },
    ],
  };
}

const versPodium = (c: Cumul) => ({ pseudo: c.joueur.displayName, points: c.points, victoires: c.victoires });

function trierCumul(cumul: Cumul[]): Cumul[] {
  return cumul.sort(
    (a, b) => b.victoires - a.victoires || b.points - a.points || a.joueur.displayName.localeCompare(b.joueur.displayName, 'fr'),
  );
}

/** Fin de `ouvert` : classement, points, et manche close en base. */
function fermer(partie: Partie, manche: Manche, now: number): Transition {
  // L'heure ne départage pas : à écart égal, ordre alphabétique (affichage stable).
  const triees = [...manche.reponses].sort((a, b) => a.joueur.displayName.localeCompare(b.joueur.displayName, 'fr'));
  const resultat = classer(triees, manche.prenom.pics);
  const cumul = new Map(partie.cumul.map((c) => [c.joueur.userId, c]));
  for (const r of resultat) {
    const avant = cumul.get(r.reponse.joueur.userId) ?? { joueur: r.reponse.joueur, points: 0, victoires: 0 };
    cumul.set(r.reponse.joueur.userId, {
      joueur: r.reponse.joueur,
      points: avant.points + r.points,
      victoires: avant.victoires + (r.victoire ? 1 : 0),
    });
  }
  return {
    etat: {
      phase: 'revelation',
      partie: { ...partie, cumul: trierCumul([...cumul.values()]) },
      manche: { ...manche, resultat },
      finAt: now + partie.reglages.revelationMs,
    },
    effets: [
      ...resultat.map((r): Effet => ({ type: 'points', joueur: r.reponse.joueur, points: r.points, victoire: r.victoire })),
      { type: 'manche-fermee', id: manche.id, statut: 'terminee' },
      { type: 'diffuser' },
    ],
  };
}

/** Ce que le bot dit en passant aux scores (le chat ne doit pas connaître la réponse avant la courbe). */
function direResultat(manche: Manche): Effet {
  const { nom, sexe, pics, effectifPic: effectif } = manche.prenom;
  const resultat = manche.resultat ?? [];
  const base = { nom, sexe, pics, effectif };
  if (resultat.length === 0) return { type: 'dire', cle: 'personne', params: base };
  const gagnants = resultat
    .filter((r) => r.victoire)
    .map((r) => ({ pseudo: r.reponse.joueur.displayName, annee: r.reponse.annee, ecart: r.ecart, points: r.points }));
  if (gagnants.length === 0) return { type: 'dire', cle: 'sansGagnant', params: { ...base, reponses: resultat.length } };
  return { type: 'dire', cle: 'resultat', params: { ...base, gagnants } };
}

export function transition(etat: Etat, ev: Evenement, date: Date): Transition {
  const now = date.getTime();

  switch (ev.type) {
    case 'demarrer': {
      if (etat.phase !== 'attente' && etat.phase !== 'fin') return rien(etat);
      const [premier, ...reste] = ev.prenoms.slice(0, ev.reglages.manches);
      if (!premier) return { etat, effets: [{ type: 'dire', cle: 'tirageVide', params: {} }] };
      const partie: Partie = {
        id: `prenoms-${now}`,
        reglages: ev.reglages,
        premiere: ev.premiere,
        derniere: ev.derniere,
        total: reste.length + 1,
        aVenir: reste,
        lancees: 0,
        cumul: [],
      };
      return lancer(partie, 1, premier, now);
    }

    case 'reponse': {
      if (etat.phase !== 'ouvert') return rien(etat);
      const { partie, manche } = etat;
      if (!Number.isInteger(ev.annee) || ev.annee < partie.premiere || ev.annee > partie.derniere) return rien(etat);
      const reponse: Reponse = { joueur: ev.joueur, annee: ev.annee, messageId: ev.messageId };
      const reponses = [...manche.reponses.filter((r) => r.joueur.userId !== ev.joueur.userId), reponse];
      return { etat: { ...etat, manche: { ...manche, reponses } }, effets: [{ type: 'diffuser' }] };
    }

    case 'retrait': {
      if (etat.phase === 'attente') return rien(etat);
      const { partie } = etat;
      const vise = (r: Reponse) => r.joueur.userId === ev.userId || (r.messageId !== null && ev.messageIds.includes(r.messageId));
      // Après la fin de `ouvert`, les points sont donnés : seul un joueur entier (ban,
      // !oubliemoi) disparaît encore de l'écran et du classement de la partie.
      const cumul = ev.userId === undefined ? partie.cumul : partie.cumul.filter((c) => c.joueur.userId !== ev.userId);
      const p = cumul === partie.cumul ? partie : { ...partie, cumul };
      if (etat.phase === 'fin') return { etat: { ...etat, partie: p }, effets: [{ type: 'diffuser' }] };
      const { manche } = etat;
      const m: Manche =
        etat.phase === 'annonce' || etat.phase === 'ouvert'
          ? { ...manche, reponses: manche.reponses.filter((r) => !vise(r)) }
          : { ...manche, resultat: manche.resultat?.filter((r) => r.reponse.joueur.userId !== ev.userId) ?? null };
      return { etat: { ...etat, partie: p, manche: m }, effets: [{ type: 'diffuser' }] };
    }

    case 'passer': {
      if (etat.phase === 'attente') return rien(etat);
      if (etat.phase === 'fin') return { etat: ETAT_INITIAL, effets: [{ type: 'diffuser' }] };
      const { partie, manche } = etat;
      // Révélation ou scores : les points sont donnés, on avance seulement.
      if (etat.phase === 'revelation' || etat.phase === 'scores') return suivante(partie, manche.numero, now);
      // Annonce ou ouvert : manche annulée, aucun point, prénom passé non révélé dans le chat.
      const annulee: Effet[] = [
        { type: 'manche-fermee', id: manche.id, statut: 'annulee' },
        { type: 'dire', cle: 'passe', params: { numero: manche.numero } },
      ];
      const t = ev.remplacant
        ? lancer(partie, manche.numero, ev.remplacant, now)
        : // Tirage épuisé : la partie compte une manche de moins.
          suivante({ ...partie, total: partie.total - 1 }, manche.numero - 1, now);
      return { etat: t.etat, effets: [...annulee, ...t.effets] };
    }

    case 'remplacer': {
      if (etat.phase === 'attente' || !etat.partie.aVenir.includes(ev.ancien)) return rien(etat);
      const { partie } = etat;
      const aVenir = ev.nouveau
        ? partie.aVenir.map((p) => (p === ev.ancien ? ev.nouveau! : p))
        : partie.aVenir.filter((p) => p !== ev.ancien);
      const total = ev.nouveau ? partie.total : partie.total - 1;
      return { etat: { ...etat, partie: { ...partie, aVenir, total } }, effets: [{ type: 'diffuser' }] };
    }

    case 'arreter': {
      if (etat.phase === 'attente') return rien(etat);
      const effets: Effet[] = [];
      if (etat.phase === 'annonce' || etat.phase === 'ouvert') {
        effets.push({ type: 'manche-fermee', id: etat.manche.id, statut: 'annulee' });
      }
      effets.push({ type: 'dire', cle: 'partieArretee', params: {} }, { type: 'diffuser' });
      return { etat: ETAT_INITIAL, effets };
    }

    case 'tic': {
      if (etat.phase === 'attente' || now < etat.finAt) return rien(etat);
      if (etat.phase === 'fin') return { etat: ETAT_INITIAL, effets: [{ type: 'diffuser' }] };
      const { partie, manche } = etat;
      switch (etat.phase) {
        case 'annonce':
          return { etat: { ...etat, phase: 'ouvert', finAt: now + partie.reglages.ouvertMs }, effets: [{ type: 'diffuser' }] };
        case 'ouvert':
          return fermer(partie, manche, now);
        case 'revelation':
          return {
            etat: { ...etat, phase: 'scores', finAt: now + partie.reglages.scoresMs },
            effets: [direResultat(manche), { type: 'diffuser' }],
          };
        case 'scores':
          return suivante(partie, manche.numero, now);
      }
    }
  }
}

/** Histogramme anonyme des réponses par décennie, sur l'axe du fichier (écran `ouvert`). */
export function histogramme(reponses: readonly { annee: number }[], premiere: number, derniere: number): { decennie: number; n: number }[] {
  const premiereDecennie = Math.floor(premiere / 10);
  const barres = Array.from({ length: Math.floor(derniere / 10) - premiereDecennie + 1 }, (_, i) => ({
    decennie: (premiereDecennie + i) * 10,
    n: 0,
  }));
  for (const r of reponses) {
    const barre = barres[Math.floor(r.annee / 10) - premiereDecennie];
    if (barre) barre.n += 1;
  }
  return barres;
}
