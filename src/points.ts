/**
 * Points d'une manche (BRIEF.md, section 4).
 *
 * L'écart se mesure à l'année du pic, ou à la plus proche des années du pic quand
 * l'arrondi à 5 crée une égalité (Emma : 2005 et 2006). Pas de prime à la vitesse :
 * la réponse est remplaçable, l'heure ne départage pas.
 */

/** Écart maximal (inclus) → points. Au-delà de 10 ans : 0. */
export const BAREME: readonly (readonly [ecartMax: number, points: number])[] = [
  [0, 100],
  [2, 60],
  [5, 30],
  [10, 10],
];

/** Points minimaux pour gagner la manche. */
export const POINTS_VICTOIRE = 10;

export function pointsPourEcart(ecart: number): number {
  return BAREME.find(([max]) => ecart <= max)?.[1] ?? 0;
}

/**
 * Écart signé à l'année du pic la plus proche : « +1 » = un an trop tard.
 * À égale distance de deux pics (Christian : 1949 et 1955, réponse 1952), le premier.
 */
export function ecartSigne(annee: number, pics: readonly number[]): number {
  if (pics.length === 0) throw new Error('aucune année de pic');
  let meilleur = annee - pics[0]!;
  for (const pic of pics) {
    if (Math.abs(annee - pic) < Math.abs(meilleur)) meilleur = annee - pic;
  }
  return meilleur;
}

export interface Classee<T> {
  reponse: T;
  /** Écart signé (affiché « ±0 », « +1 », « −2 »). */
  ecart: number;
  points: number;
  victoire: boolean;
}

/**
 * Classe les réponses, de la plus proche à la plus lointaine ; à écart égal, l'ordre
 * reçu est gardé. Gagnent le ou les plus proches, s'ils ont au moins 10 points.
 */
export function classer<T extends { annee: number }>(reponses: readonly T[], pics: readonly number[]): Classee<T>[] {
  const liste = reponses
    .map((reponse) => {
      const ecart = ecartSigne(reponse.annee, pics);
      return { reponse, ecart, points: pointsPourEcart(Math.abs(ecart)), victoire: false };
    })
    .sort((a, b) => Math.abs(a.ecart) - Math.abs(b.ecart));
  const premier = liste[0];
  if (premier && premier.points >= POINTS_VICTOIRE) {
    for (const c of liste) c.victoire = Math.abs(c.ecart) === Math.abs(premier.ecart);
  }
  return liste;
}
