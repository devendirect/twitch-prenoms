import { readFileSync } from 'node:fs';
import { decrire, type Preparation, type Prenom, type Sexe } from './insee.js';

/**
 * `data/prenoms.json` : écrit par `npm run preparer`, lu au démarrage du jeu, et
 * recherche de `!prenom` (BRIEF.md, sections 3 et 5).
 */

export interface Source {
  producteur: string;
  titre: string;
  edition: number;
  publiee: string;
  page: string;
  licence: string;
  sha256: string;
  arrondi: number;
  preparee: string;
}

/** Format compact du fichier : 52 000 courbes. `n`, `t`, `k`, `m` sont recalculés et comparés au chargement. */
interface FicheJson { p: string; n: string; s: Sexe; d: number; e: number[]; t: number; k: number[]; m: number }
export interface FichierPrenoms { source: Source; premiereAnnee: number; derniereAnnee: number; prenoms: FicheJson[] }

export function compacter(p: Preparation, source: Source): FichierPrenoms {
  return {
    source,
    premiereAnnee: p.premiereAnnee,
    derniereAnnee: p.derniereAnnee,
    prenoms: [...p.prenoms.values()].map((x) => ({
      p: x.prenom, n: x.nom, s: x.sexe, d: x.debut, e: x.effectifs, t: x.total, k: x.pics, m: x.effectifPic,
    })),
  };
}

export class ErreurDonnees extends Error {
  override name = 'ErreurDonnees';
  constructor(message: string) {
    super(`data/prenoms.json : ${message}. Relancer « npm run preparer ».`);
  }
}

const entier = (v: unknown): v is number => Number.isInteger(v);

/** Le texte tapé après `!prenom`, une fois nettoyé : lettres, tiret, apostrophe, espace. */
const DEMANDE = /^\p{L}[\p{L}' -]*$/u;
export const DEMANDE_MAX = 30;

/** Sans accents, pour la seconde recherche : « KÉVIN » → « KEVIN ». */
const sansAccents = (texte: string) => texte.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');

export type Recherche =
  | { type: 'invalide' }
  | { type: 'inconnu' }
  /** `autres` : les autres orthographes au même nom sans accents, les plus fréquentes d'abord. */
  | { type: 'trouve'; prenom: Prenom; autres: string[] };

export class Donnees {
  readonly #exact = new Map<string, Prenom[]>();
  readonly #sansAccents = new Map<string, Prenom[]>();
  readonly #parCle = new Map<string, Prenom>();

  constructor(
    readonly source: Source,
    readonly premiereAnnee: number,
    readonly derniereAnnee: number,
    readonly prenoms: readonly Prenom[],
  ) {
    for (const p of prenoms) {
      this.#parCle.set(`${p.prenom}|${p.sexe}`, p);
      ajouter(this.#exact, p.prenom, p);
      ajouter(this.#sansAccents, sansAccents(p.prenom), p);
    }
  }

  get(prenom: string, sexe: Sexe): Prenom | undefined {
    return this.#parCle.get(`${prenom}|${sexe}`);
  }

  /**
   * `!prenom Kévin` : forme exacte d'abord (majuscules ignorées, accents comptés), puis
   * sans accents. Entre les deux sexes (Camille), le plus fréquent.
   */
  chercher(texte: string): Recherche {
    const propre = texte.normalize('NFC').replace(/[’ʼ]/gu, "'").replace(/\s+/gu, ' ').trim();
    if ([...propre].length > DEMANDE_MAX || !DEMANDE.test(propre)) return { type: 'invalide' };
    const majuscules = propre.toLocaleUpperCase('fr-FR');
    const plie = sansAccents(majuscules);
    const candidats = this.#exact.get(majuscules) ?? this.#sansAccents.get(plie);
    if (!candidats) return { type: 'inconnu' };
    const prenom = plusFrequent(candidats);
    const parForme = new Map<string, Prenom>();
    for (const p of this.#sansAccents.get(plie) ?? []) {
      if (p.prenom === prenom.prenom) continue;
      const deja = parForme.get(p.prenom);
      if (!deja || p.total > deja.total) parForme.set(p.prenom, p);
    }
    const autres = [...parForme.values()].sort((a, b) => b.total - a.total).map((p) => p.nom);
    return { type: 'trouve', prenom, autres };
  }
}

function ajouter(index: Map<string, Prenom[]>, cle: string, p: Prenom) {
  const liste = index.get(cle);
  if (liste) liste.push(p);
  else index.set(cle, [p]);
}

const plusFrequent = (liste: readonly Prenom[]) => liste.reduce((a, b) => (b.total > a.total ? b : a));

/** Vérifie le fichier (forme, années, cohérence des valeurs recalculées) et l'indexe. */
export function lireDonnees(json: unknown): Donnees {
  const f = json as Partial<FichierPrenoms> | null;
  const s = f?.source as Partial<Source> | undefined;
  if (!s || !entier(s.edition) || typeof s.licence !== 'string' || typeof s.titre !== 'string' || !entier(s.arrondi)) {
    throw new ErreurDonnees('source absente ou incomplète');
  }
  const { premiereAnnee: debut, derniereAnnee: fin } = f!;
  if (!entier(debut) || !entier(fin) || debut > fin) throw new ErreurDonnees('années de début et de fin invalides');
  if (!Array.isArray(f!.prenoms) || f!.prenoms.length === 0) throw new ErreurDonnees('aucun prénom');
  const prenoms = f!.prenoms.map((x, i) => {
    const ou = `prénom n° ${i + 1}`;
    if (typeof x?.p !== 'string' || (x.s !== 'M' && x.s !== 'F')) throw new ErreurDonnees(`${ou} : nom ou sexe invalide`);
    if (!entier(x.d) || !Array.isArray(x.e) || x.e.length === 0 || !x.e.every((v) => entier(v) && v >= 0)) {
      throw new ErreurDonnees(`${ou} (${x.p}) : courbe invalide`);
    }
    if (x.d < debut || x.d + x.e.length - 1 > fin) throw new ErreurDonnees(`${ou} (${x.p}) : années hors de ${debut}-${fin}`);
    const p = decrire(x.p, x.s, x.d, x.e);
    if (p.nom !== x.n || p.total !== x.t || p.effectifPic !== x.m || p.pics.join() !== x.k?.join()) {
      throw new ErreurDonnees(`${ou} (${x.p}) : valeurs incohérentes avec la courbe`);
    }
    return p;
  });
  return new Donnees(s as Source, debut, fin, prenoms);
}

export function chargerDonnees(chemin: string | URL): Donnees {
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(chemin, 'utf8'));
  } catch (erreur) {
    throw new ErreurDonnees(erreur instanceof Error ? erreur.message : String(erreur));
  }
  return lireDonnees(json);
}
