/**
 * Libellés de l'overlay, en français et en anglais (BRIEF.md, section 6 : ils suivent
 * `LANGUE`). Mêmes clés dans les deux langues (test).
 */

const pluriel = (n, un, plusieurs) => (n > 1 ? plusieurs : un);

export const TEXTES = {
  fr: {
    nombre: (n) => n.toLocaleString('fr-FR'),
    titre: 'Devine l’année de mon prénom',
    manche: (n, total) => `Manche ${n} / ${total}`,
    sexe: (s) => (s === 'F' ? 'Prénom féminin' : 'Prénom masculin'),
    reponses: (n) => `${n.toLocaleString('fr-FR')} ${pluriel(n, 'réponse', 'réponses')}`,
    pics: (pics) => (pics.length > 1 ? `${pics.slice(0, -1).join(', ')} et ${pics.at(-1)}` : String(pics[0])),
    naissances: 'naissances',
    pic: (texte) => `Pic : ${texte}`,
    gagnants: 'Gagnants de la manche',
    aucunGagnant: 'Pas de gagnant cette fois',
    classementPartie: 'Classement de la partie',
    classementSoiree: 'Classement de la soirée',
    terminee: 'Terminée',
    proposees: 'Années proposées par le chat',
    parAnnee: 'Naissances par année',
    repondez: (a, b) => `Répondez dans le chat : une année entre ${a} et ${b}`,
    accueil: 'Tapez !prenom Léa pour voir la courbe d’un prénom',
    demandePar: (p) => `demandé par ${p}`,
    fin: 'Fin de la partie',
    points: (n) => `${n.toLocaleString('fr-FR')} pts`,
    /** Le classement trie par victoires, puis par points : les deux se voient. */
    victoires: (n) => `${n} ${pluriel(n, 'victoire', 'victoires')}`,
    mention: (s) =>
      `Source : ${s.producteur}, ${s.titre} (édition ${s.edition}) · ${s.licence} · effectifs arrondis à ${s.arrondi}`,
  },
  en: {
    nombre: (n) => n.toLocaleString('en-US'),
    titre: 'Guess the year of my name',
    manche: (n, total) => `Round ${n} / ${total}`,
    sexe: (s) => (s === 'F' ? 'Girl’s name' : 'Boy’s name'),
    reponses: (n) => `${n.toLocaleString('en-US')} ${pluriel(n, 'answer', 'answers')}`,
    pics: (pics) => (pics.length > 1 ? `${pics.slice(0, -1).join(', ')} and ${pics.at(-1)}` : String(pics[0])),
    naissances: 'births',
    pic: (texte) => `Peak: ${texte}`,
    gagnants: 'Round winners',
    aucunGagnant: 'No winner this time',
    classementPartie: 'Game leaderboard',
    classementSoiree: 'Tonight’s leaderboard',
    terminee: 'Finished',
    proposees: 'Years suggested by chat',
    parAnnee: 'Births per year',
    repondez: (a, b) => `Answer in chat: a year between ${a} and ${b}`,
    accueil: 'Type !name Lea to see a name’s curve',
    demandePar: (p) => `requested by ${p}`,
    fin: 'Game over',
    points: (n) => `${n.toLocaleString('en-US')} pts`,
    victoires: (n) => `${n} ${pluriel(n, 'win', 'wins')}`,
    mention: (s) =>
      `Source: ${s.producteur}, ${s.titre} (${s.edition} edition) · ${s.licence} · counts rounded to ${s.arrondi}`,
  },
};

/** « ±0 », « +1 », « −2 » (vrai signe moins). */
export function ecart(e) {
  if (e === 0) return '±0';
  return `${e > 0 ? '+' : '−'}${Math.abs(e)}`;
}

/** « 0:18 » */
export function chrono(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
