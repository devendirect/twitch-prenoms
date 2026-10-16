import { describe, expect, it } from 'vitest';
import {
  ETAT_INITIAL, histogramme, REGLAGES, transition, type Effet, type Etat, type Evenement,
} from '../src/manche.js';
import { donneesExtrait, joueur } from './aide.js';

const d = donneesExtrait();
// Courbes réelles : Camille (F) culmine en 1998, Léo en 2019, Emma en 2005 et 2006.
const CAMILLE = d.get('CAMILLE', 'F')!;
const LEO = d.get('LÉO', 'M')!;
const EMMA = d.get('EMMA', 'F')!;
const ALICE = joueur('Alice');
const BOB = joueur('Bob');
const CHLOE = joueur('Chloé');

const T0 = Date.UTC(2026, 9, 16, 20, 0, 0);
const demarrer = (...prenoms: (typeof CAMILLE)[]): Extract<Evenement, { type: 'demarrer' }> => ({
  type: 'demarrer', prenoms, reglages: REGLAGES, premiere: 1900, derniere: 2025,
});
const repondre = (j: typeof ALICE, annee: number, messageId: string | null = null): Evenement => ({ type: 'reponse', joueur: j, annee, messageId });

/** Rejoue des événements datés (secondes depuis T0) ; garde tous les effets. */
function jouer(etapes: [secondes: number, ev: Evenement][], depart: Etat = ETAT_INITIAL) {
  let etat = depart;
  const effets: Effet[] = [];
  for (const [s, ev] of etapes) {
    const t = transition(etat, ev, new Date(T0 + s * 1000));
    etat = t.etat;
    effets.push(...t.effets);
  }
  return { etat, effets };
}

const tic = (s: number): [number, Evenement] => [s, { type: 'tic' }];
const dits = (effets: Effet[]) => effets.flatMap((e) => (e.type === 'dire' ? [e.cle] : []));
const points = (effets: Effet[]) => effets.flatMap((e) => (e.type === 'points' ? [[e.joueur.displayName, e.points, e.victoire]] : []));
const fermetures = (effets: Effet[]) => effets.flatMap((e) => (e.type === 'manche-fermee' ? [e.statut] : []));

describe('manche : déroulé', () => {
  it('annonce → ouvert → revelation → scores → manche suivante, aux bonnes heures', () => {
    const debut = jouer([[0, demarrer(CAMILLE, LEO)]]);
    expect(debut.etat).toMatchObject({ phase: 'annonce', manche: { numero: 1, prenom: { prenom: 'CAMILLE' } }, partie: { total: 2 } });
    expect(debut.effets[0]).toEqual({ type: 'manche-ouverte', id: expect.any(String) });
    expect(debut.effets[1]).toMatchObject({ type: 'dire', cle: 'annonce', params: { numero: 1, total: 2, nom: 'Camille', sexe: 'F' } });

    const phases: string[] = [];
    let etat = debut.etat;
    for (const s of [2, 3, 32, 33, 42, 43, 47, 48]) {
      etat = transition(etat, { type: 'tic' }, new Date(T0 + s * 1000)).etat;
      phases.push(etat.phase);
    }
    expect(phases).toEqual(['annonce', 'ouvert', 'ouvert', 'revelation', 'revelation', 'scores', 'scores', 'annonce']);
    expect(etat).toMatchObject({ manche: { numero: 2, prenom: { prenom: 'LÉO' } } });
  });

  it('une manche complète : points à la fin de ouvert, résultat dit aux scores seulement', () => {
    const { etat, effets } = jouer([
      [0, demarrer(CAMILLE, LEO)],
      tic(3),
      [10, repondre(ALICE, 1995)],
      [11, repondre(BOB, 1998)],
      [12, repondre(CHLOE, 1950)],
    ]);
    expect(etat.phase).toBe('ouvert');
    expect(dits(effets)).toEqual(['annonce']);

    const fin = transition(etat, { type: 'tic' }, new Date(T0 + 33_000));
    expect(fin.etat.phase).toBe('revelation');
    expect(points(fin.effets)).toEqual([['Bob', 100, true], ['Alice', 30, false], ['Chloé', 0, false]]);
    expect(fermetures(fin.effets)).toEqual(['terminee']);
    expect(dits(fin.effets)).toEqual([]);

    const scores = transition(fin.etat, { type: 'tic' }, new Date(T0 + 43_000));
    expect(scores.effets[0]).toEqual({
      type: 'dire', cle: 'resultat',
      params: { nom: 'Camille', sexe: 'F', pics: [1998], effectif: 7455, gagnants: [{ pseudo: 'Bob', annee: 1998, ecart: 0, points: 100 }] },
    });
    expect(scores.etat).toMatchObject({ partie: { cumul: [{ joueur: BOB, points: 100, victoires: 1 }, { joueur: ALICE, points: 30 }, { joueur: CHLOE, points: 0 }] } });
  });

  it('deux joueurs au même écart gagnent tous les deux ; pics à égalité : le plus proche', () => {
    const { effets } = jouer([
      [0, demarrer(EMMA)], tic(3),
      [5, repondre(ALICE, 2004)],
      [6, repondre(BOB, 2007)],
      tic(33),
    ]);
    expect(points(effets)).toEqual([['Alice', 60, true], ['Bob', 60, true]]);
  });

  it('personne ne répond : aucun gagnant, le bot le dit, la partie continue', () => {
    const { etat, effets } = jouer([[0, demarrer(CAMILLE, LEO)], tic(3), tic(33), tic(43), tic(48)]);
    expect(points(effets)).toEqual([]);
    expect(dits(effets)).toEqual(['annonce', 'personne', 'annonce']);
    expect(etat).toMatchObject({ phase: 'annonce', manche: { numero: 2 } });
  });

  it('des réponses, toutes à plus de 10 ans : pas de gagnant, dit autrement', () => {
    const { effets } = jouer([[0, demarrer(CAMILLE)], tic(3), [5, repondre(ALICE, 1930)], tic(33), tic(43)]);
    expect(points(effets)).toEqual([['Alice', 0, false]]);
    expect(dits(effets)).toEqual(['annonce', 'sansGagnant']);
  });

  it('fin de partie : podium, puis attente ; un nouveau départ est possible', () => {
    const { etat, effets } = jouer([[0, demarrer(CAMILLE)], tic(3), [5, repondre(ALICE, 1998)], tic(33), tic(43), tic(48)]);
    expect(etat.phase).toBe('fin');
    expect(effets.at(-2)).toEqual({ type: 'dire', cle: 'fin', params: { podium: [{ pseudo: 'Alice', points: 100, victoires: 1 }] } });
    expect(transition(etat, { type: 'tic' }, new Date(T0 + 57_000)).etat.phase).toBe('fin');
    expect(transition(etat, { type: 'tic' }, new Date(T0 + 58_000)).etat.phase).toBe('attente');
    expect(transition(etat, demarrer(LEO), new Date(T0 + 50_000)).etat).toMatchObject({ phase: 'annonce', manche: { numero: 1 } });
  });

  it('démarrer pendant une partie : ignoré ; tirage vide : dit, rien ne démarre', () => {
    const { etat } = jouer([[0, demarrer(CAMILLE)]]);
    expect(transition(etat, demarrer(LEO), new Date(T0 + 1000))).toEqual({ etat, effets: [] });
    expect(transition(ETAT_INITIAL, demarrer(), new Date(T0))).toEqual({
      etat: ETAT_INITIAL, effets: [{ type: 'dire', cle: 'tirageVide', params: {} }],
    });
  });

  it('le nombre de manches des réglages limite la partie', () => {
    const { etat } = jouer([[0, { ...demarrer(CAMILLE, LEO, EMMA), reglages: { ...REGLAGES, manches: 2 } }]]);
    expect(etat).toMatchObject({ partie: { total: 2, aVenir: [LEO] } });
  });
});

describe('manche : réponses', () => {
  const ouvert = jouer([[0, demarrer(CAMILLE)], tic(3)]).etat;
  const reponses = (etat: Etat) => (etat.phase === 'ouvert' ? etat.manche.reponses.map((r) => [r.joueur.displayName, r.annee]) : null);

  it('la seconde réponse d’une même personne remplace la première', () => {
    const { etat } = jouer([[5, repondre(ALICE, 1980)], [6, repondre(BOB, 1990)], [7, repondre(ALICE, 1998)]], ouvert);
    expect(reponses(etat)).toEqual([['Bob', 1990], ['Alice', 1998]]);
  });

  it.each([1899, 2026, 1850, 2099, 19871, 1987.5])('année %d hors du fichier : ignorée', (annee) => {
    expect(transition(ouvert, repondre(ALICE, annee), new Date(T0 + 5000))).toEqual({ etat: ouvert, effets: [] });
  });

  it('bornes du fichier acceptées', () => {
    expect(reponses(jouer([[5, repondre(ALICE, 1900)], [6, repondre(BOB, 2025)]], ouvert).etat)).toEqual([['Alice', 1900], ['Bob', 2025]]);
  });

  it('hors de ouvert : ignorée (annonce, révélation)', () => {
    const annonce = jouer([[0, demarrer(CAMILLE)]]).etat;
    expect(transition(annonce, repondre(ALICE, 1998), new Date(T0 + 1000)).etat).toBe(annonce);
    const revelation = jouer([tic(33)], ouvert).etat;
    expect(transition(revelation, repondre(ALICE, 1998), new Date(T0 + 34_000)).etat).toBe(revelation);
  });
});

describe('manche : retraits', () => {
  const avecReponses = jouer([
    [0, demarrer(CAMILLE, LEO)], tic(3),
    [5, repondre(ALICE, 1998, 'm-alice')],
    [6, repondre(BOB, 1997, 'm-bob')],
  ]).etat;

  it('message supprimé par un modérateur (CLEARMSG) : réponse retirée, ne gagne rien', () => {
    const { effets } = jouer([[10, { type: 'retrait', messageIds: ['m-alice'] }], tic(33)], avecReponses);
    expect(points(effets)).toEqual([['Bob', 60, true]]);
  });

  it('joueur banni (CLEARCHAT) ou !oubliemoi pendant ouvert : réponse retirée', () => {
    const { effets } = jouer([[10, { type: 'retrait', messageIds: [], userId: BOB.userId }], tic(33)], avecReponses);
    expect(points(effets)).toEqual([['Alice', 100, true]]);
  });

  it('une réponse remplacée : supprimer l’ancien message ne retire pas la nouvelle', () => {
    const { effets } = jouer([[7, repondre(ALICE, 1990, 'm-alice-2')], [10, { type: 'retrait', messageIds: ['m-alice'] }], tic(33)], avecReponses);
    expect(points(effets).map((p) => p[0])).toEqual(['Bob', 'Alice']);
  });

  it('après les points : !oubliemoi efface le joueur de l’écran et du classement de la partie', () => {
    const revelation = jouer([tic(33)], avecReponses).etat;
    const { etat } = jouer([[34, { type: 'retrait', messageIds: [], userId: ALICE.userId }]], revelation);
    expect(etat).toMatchObject({ phase: 'revelation' });
    if (etat.phase !== 'revelation') return;
    expect(etat.manche.resultat?.map((r) => r.reponse.joueur.displayName)).toEqual(['Bob']);
    expect(etat.partie.cumul.map((c) => c.joueur.displayName)).toEqual(['Bob']);
  });
});

describe('manche : passer et arrêter', () => {
  const ouvert = jouer([[0, demarrer(CAMILLE, LEO)], tic(3), [5, repondre(ALICE, 1998)]]).etat;

  it('passer en plein ouvert : manche annulée sans points, remplaçant au même numéro', () => {
    const { etat, effets } = jouer([[6, { type: 'passer', remplacant: EMMA }]], ouvert);
    expect(fermetures(effets)).toEqual(['annulee']);
    expect(points(effets)).toEqual([]);
    expect(dits(effets)).toEqual(['passe', 'annonce']);
    expect(etat).toMatchObject({ phase: 'annonce', manche: { numero: 1, prenom: EMMA, reponses: [] }, partie: { total: 2 } });
    if (etat.phase === 'annonce' && ouvert.phase === 'ouvert') expect(etat.manche.id).not.toBe(ouvert.manche.id);
  });

  it('passer sans remplaçant (tirage épuisé) : la partie compte une manche de moins', () => {
    const { etat } = jouer([[6, { type: 'passer', remplacant: null }]], ouvert);
    expect(etat).toMatchObject({ phase: 'annonce', manche: { numero: 1, prenom: LEO }, partie: { total: 1 } });
  });

  it('passer pendant la révélation : points gardés, manche suivante', () => {
    const revelation = jouer([tic(33)], ouvert).etat;
    const { etat, effets } = jouer([[34, { type: 'passer', remplacant: EMMA }]], revelation);
    expect(fermetures(effets)).toEqual([]);
    expect(etat).toMatchObject({ phase: 'annonce', manche: { numero: 2, prenom: LEO } });
  });

  it('passer en fin de partie : attente ; en attente : rien', () => {
    expect(transition(ETAT_INITIAL, { type: 'passer', remplacant: EMMA }, new Date(T0))).toEqual({ etat: ETAT_INITIAL, effets: [] });
  });

  it('arrêter en plein ouvert : aucun point, manche annulée, attente', () => {
    const { etat, effets } = jouer([[6, { type: 'arreter' }], tic(40)], ouvert);
    expect(etat).toEqual(ETAT_INITIAL);
    expect(points(effets)).toEqual([]);
    expect(fermetures(effets)).toEqual(['annulee']);
    expect(dits(effets)).toEqual(['partieArretee']);
  });

  it('remplacer un prénom à venir (montré par !prenom) ; tirage épuisé : une manche de moins', () => {
    const { etat } = jouer([[6, { type: 'remplacer', ancien: LEO, nouveau: EMMA }]], ouvert);
    expect(etat).toMatchObject({ partie: { aVenir: [EMMA], total: 2 } });
    const sans = jouer([[6, { type: 'remplacer', ancien: LEO, nouveau: null }]], ouvert).etat;
    expect(sans).toMatchObject({ partie: { aVenir: [], total: 1 } });
    // Le prénom de la manche en cours, ou un prénom hors partie : rien.
    expect(transition(ouvert, { type: 'remplacer', ancien: CAMILLE, nouveau: EMMA }, new Date(T0 + 6000)).etat).toBe(ouvert);
  });

  it('arrêter aux scores : rien à annuler en base', () => {
    const scores = jouer([tic(33), tic(43)], ouvert).etat;
    expect(fermetures(transition(scores, { type: 'arreter' }, new Date(T0 + 44_000)).effets)).toEqual([]);
  });
});

describe('histogramme par décennie', () => {
  it('axe 1900 → 2025 : 13 barres, bornes comprises', () => {
    const h = histogramme([{ annee: 1900 }, { annee: 1909 }, { annee: 1910 }, { annee: 2025 }, { annee: 1987 }], 1900, 2025);
    expect(h).toHaveLength(13);
    expect(h[0]).toEqual({ decennie: 1900, n: 2 });
    expect(h[1]).toEqual({ decennie: 1910, n: 1 });
    expect(h[8]).toEqual({ decennie: 1980, n: 1 });
    expect(h[12]).toEqual({ decennie: 2020, n: 1 });
  });
});
