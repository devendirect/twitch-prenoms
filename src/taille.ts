import type { TailleAffichee } from './insee.js';
import { chassesPrenom } from './police.js';
import { tailleMinimale } from '../public/js/taille.js';

export interface Mesure {
  taille: number;
  lignes: string[];
  format: string;
  etat: string;
}

/**
 * Taille du prénom à l'écran, calculée comme l'overlay (public/js/taille.js) mais
 * mesurée dans la police elle-même. Un caractère absent de la police s'afficherait
 * dans une autre : taille 0, le prénom n'est pas jouable.
 */
export function mesureurPrenom(): { taille: TailleAffichee; detail: (nom: string) => Mesure | null } {
  const police = chassesPrenom();
  const detail = (nom: string): Mesure | null => {
    if (police.mesurer(nom) === null) return null;
    return tailleMinimale(nom, (texte: string) => police.mesurer(texte) ?? Infinity) as Mesure;
  };
  return { detail, taille: (nom) => detail(nom)?.taille ?? 0 };
}
