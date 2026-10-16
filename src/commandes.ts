import type { TableAlias } from 'socle';

/**
 * Commandes du jeu, ajoutées à celles du socle (BRIEF.md, section 3). Le socle ignore
 * majuscules et accents sur le nom : `!année`, `!YEAR` et `!prénom` passent.
 * La réponse la plus courante, « 1987 » seul, n'est pas une commande : `surMessage`.
 */
export const COMMANDES = {
  annee: ['annee', 'year'],
  prenom: ['prenom', 'name'],
} as const satisfies TableAlias;
