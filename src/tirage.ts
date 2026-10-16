import { juger, type Niveau, type Prenom, type TailleAffichee } from './insee.js';
import type { Donnees } from './donnees.js';

/**
 * Tirage des prénoms d'une partie (BRIEF.md, section 5).
 *
 * Les règles sont celles de la préparation (`juger`), réappliquées au démarrage : un
 * prénom ajouté à `data/exclus.txt` sort du tirage sans relancer `npm run preparer`.
 * Une soirée (un lancement du jeu) ne tire jamais deux fois le même prénom.
 */

/** Une partie de 10 manches : 4 faciles, 4 moyens, 2 difficiles. Coupé ou répété pour une autre longueur. */
const MOTIF: readonly Niveau[] = ['facile', 'moyen', 'facile', 'moyen', 'difficile', 'facile', 'moyen', 'facile', 'moyen', 'difficile'];

export interface Jouable {
  prenom: Prenom;
  niveau: Niveau;
}

export function jouables(donnees: Donnees, exclus: ReadonlySet<string>, taille?: TailleAffichee): Jouable[] {
  const resultat: Jouable[] = [];
  for (const p of donnees.prenoms) {
    const autre = donnees.get(p.prenom, p.sexe === 'M' ? 'F' : 'M');
    const verdict = juger(p, autre?.total ?? 0, exclus, taille);
    if (verdict.jouable) resultat.push({ prenom: p, niveau: verdict.niveau });
  }
  return resultat;
}

export class Tirage {
  readonly #niveaux = new Map<Niveau, Prenom[]>();
  readonly #aleatoire: () => number;

  constructor(candidats: readonly Jouable[], aleatoire: () => number) {
    this.#aleatoire = aleatoire;
    for (const { prenom, niveau } of candidats) {
      const liste = this.#niveaux.get(niveau) ?? [];
      liste.push(prenom);
      this.#niveaux.set(niveau, liste);
    }
  }

  /** Prénoms encore disponibles ce soir. */
  get restants(): number {
    return [...this.#niveaux.values()].reduce((n, l) => n + l.length, 0);
  }

  /** Retire un prénom de la soirée (sa courbe a été montrée par `!prenom`). Son niveau, s'il était jouable. */
  retirer(prenom: Prenom): Niveau | null {
    for (const [niveau, liste] of this.#niveaux) {
      const i = liste.indexOf(prenom);
      if (i !== -1) {
        liste.splice(i, 1);
        return niveau;
      }
    }
    return null;
  }

  /** Niveaux des `n` manches d'une partie, dans un ordre mélangé. */
  plan(n: number): Niveau[] {
    const niveaux = Array.from({ length: n }, (_, i) => MOTIF[i % MOTIF.length]!);
    for (let i = niveaux.length - 1; i > 0; i--) {
      const j = Math.floor(this.#aleatoire() * (i + 1));
      [niveaux[i], niveaux[j]] = [niveaux[j]!, niveaux[i]!];
    }
    return niveaux;
  }

  /**
   * Un prénom du niveau demandé, retiré de la soirée. Niveau épuisé : un autre, du plus
   * proche au plus lointain. Tout épuisé : `null`.
   */
  tirer(niveau: Niveau): Prenom | null {
    const ordre: Record<Niveau, Niveau[]> = {
      facile: ['facile', 'moyen', 'difficile'],
      moyen: ['moyen', 'facile', 'difficile'],
      difficile: ['difficile', 'moyen', 'facile'],
    };
    for (const n of ordre[niveau]) {
      const liste = this.#niveaux.get(n);
      if (!liste?.length) continue;
      const [p] = liste.splice(Math.floor(this.#aleatoire() * liste.length), 1);
      return p!;
    }
    return null;
  }
}
