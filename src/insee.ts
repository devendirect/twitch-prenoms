/**
 * Lecture du fichier national des prénoms de l'Insee et choix des prénoms jouables.
 * Format constaté sur l'édition du 16/07/2026 : BRIEF.md, section 5. Toute surprise
 * (en-tête, colonne, valeur) arrête la préparation avec le numéro de ligne : on ne
 * devine pas, on relit le fichier et on met le brief à jour.
 */

export const EDITION = {
  annee: 2026,
  publiee: '2026-07-16',
  page: 'https://www.insee.fr/fr/statistiques/8595130',
  zip: 'https://www.insee.fr/fr/statistiques/fichier/8595130/prenoms-2025-nat_csv.zip',
  sha256: '4c3662bbc75a021a2203b9bed0beff7e85c7928779b88602814ed407cfee512e',
  csv: 'prenoms-2025-nat.csv',
  premiereAnnee: 1900,
  derniereAnnee: 2025,
  licence: 'Licence Ouverte 2.0',
} as const;

export const ENTETE = 'sexe;prenom;periode;valeur;rang';

export type Sexe = 'M' | 'F';

export interface LigneInsee {
  sexe: Sexe;
  prenom: string;
  annee: number;
  valeur: number;
}

export class ErreurInsee extends Error {
  override name = 'ErreurInsee';
  constructor(readonly ligne: number, message: string) {
    super(`ligne ${ligne} : ${message}`);
  }
}

// Majuscules (accents compris), et entre deux lettres : tiret, apostrophe droite, espace.
// Un accent décomposé (NFD) est un caractère à part, hors de \p{Lu} : refusé aussi.
const PRENOM_INSEE = /^\p{Lu}(?:[\p{Lu}' -]*\p{Lu})?$/u;
const ANNEE = /^\d{4}$/;
const EFFECTIF = /^[1-9]\d*$/;
const RANG = /^\d+$/;

const apercu = (texte: string) => JSON.stringify(texte.length > 60 ? `${texte.slice(0, 60)}…` : texte);

/** Lit tout le CSV ; s'arrête à la première ligne qui ne ressemble pas à ce qui a été constaté. */
export function lireCsv(texte: string): LigneInsee[] {
  if (texte.charCodeAt(0) === 0xfeff) throw new ErreurInsee(1, 'BOM inattendu (le fichier constaté n\'en a pas)');
  const lignes = texte.split(/\r?\n/);
  if (lignes.at(-1) === '') lignes.pop();
  if (lignes[0] !== ENTETE) throw new ErreurInsee(1, `en-tête inattendu ${apercu(lignes[0] ?? '')}, attendu ${apercu(ENTETE)}`);
  const resultat: LigneInsee[] = [];
  for (let i = 1; i < lignes.length; i++) {
    const n = i + 1;
    const champs = (lignes[i] ?? '').split(';');
    if (champs.length !== 5) throw new ErreurInsee(n, `${champs.length} colonnes au lieu de 5 : ${apercu(lignes[i] ?? '')}`);
    const [sexe, prenom, periode, valeur, rang] = champs as [string, string, string, string, string];
    if (sexe !== '1' && sexe !== '2') throw new ErreurInsee(n, `sexe ${apercu(sexe)} (attendu 1 ou 2)`);
    if (!PRENOM_INSEE.test(prenom)) {
      throw new ErreurInsee(n, `prénom ${apercu(prenom)} hors du format constaté`);
    }
    if (!ANNEE.test(periode)) throw new ErreurInsee(n, `année ${apercu(periode)}`);
    if (!EFFECTIF.test(valeur) || Number(valeur) % 5 !== 0) {
      throw new ErreurInsee(n, `effectif ${apercu(valeur)} (attendu un multiple de 5, non nul)`);
    }
    if (!RANG.test(rang)) throw new ErreurInsee(n, `rang ${apercu(rang)}`);
    resultat.push({ sexe: sexe === '1' ? 'M' : 'F', prenom, annee: Number(periode), valeur: Number(valeur) });
  }
  return resultat;
}

/** « JEAN-BAPTISTE » → « Jean-Baptiste », « N'GOLO » → « N'Golo », « M BARKA » → « M Barka ». */
export function casseNormale(prenom: string): string {
  let resultat = '';
  let debutMot = true;
  for (const c of prenom.toLocaleLowerCase('fr-FR')) {
    resultat += debutMot ? c.toLocaleUpperCase('fr-FR') : c;
    debutMot = c === '-' || c === "'" || c === ' ';
  }
  return resultat;
}

export const cle = (prenom: string, sexe: Sexe) => `${prenom}|${sexe}`;

export interface Prenom {
  /** Forme du fichier, en majuscules accentuées. */
  prenom: string;
  /** Forme affichée. */
  nom: string;
  sexe: Sexe;
  /** Première année présente ; `effectifs[0]` la concerne. */
  debut: number;
  /** Effectifs de `debut` à la dernière année présente, 0 pour les années absentes du fichier. */
  effectifs: number[];
  total: number;
  /** Année(s) du pic : plusieurs quand l'arrondi à 5 crée une égalité (« EMMA » : 2005 et 2006). */
  pics: number[];
  effectifPic: number;
  /** Nombre d'années présentes dans le fichier (effectif d'au moins 5). */
  anneesPresentes: number;
}

/** Fiche d'un couple (prénom, sexe) à partir de sa courbe ; `effectifs` ne contient que des multiples de 5. */
export function decrire(prenom: string, sexe: Sexe, debut: number, effectifs: number[]): Prenom {
  const effectifPic = Math.max(...effectifs);
  const pics: number[] = [];
  effectifs.forEach((v, i) => {
    if (v === effectifPic) pics.push(debut + i);
  });
  return {
    prenom,
    nom: casseNormale(prenom),
    sexe,
    debut,
    effectifs,
    total: effectifs.reduce((a, b) => a + b, 0),
    pics,
    effectifPic,
    anneesPresentes: effectifs.filter((v) => v > 0).length,
  };
}

export function regrouper(lignes: readonly LigneInsee[]): Map<string, Prenom> {
  const parCle = new Map<string, Map<number, number>>();
  lignes.forEach((l, i) => {
    const k = cle(l.prenom, l.sexe);
    let annees = parCle.get(k);
    if (!annees) parCle.set(k, (annees = new Map()));
    // Ligne 1 = en-tête : la donnée i est à la ligne i + 2.
    if (annees.has(l.annee)) throw new ErreurInsee(i + 2, `doublon ${l.prenom} (${l.sexe}) en ${l.annee}`);
    annees.set(l.annee, l.valeur);
  });
  const resultat = new Map<string, Prenom>();
  for (const [k, annees] of parCle) {
    const [prenom, sexe] = k.split('|') as [string, Sexe];
    const liste = [...annees.keys()].sort((a, b) => a - b);
    const debut = liste[0]!;
    const fin = liste.at(-1)!;
    // Une valeur du fichier n'est jamais 0 : les années à 0 sont exactement les absentes.
    const effectifs = Array.from({ length: fin - debut + 1 }, (_, i) => annees.get(debut + i) ?? 0);
    resultat.set(k, decrire(prenom, sexe, debut, effectifs));
  }
  return resultat;
}

/** Règles de la section 5 du brief. */
export const REGLES = { totalMin: 20_000, facteurPic: 3, facile: 200_000, moyen: 50_000 } as const;

export type Niveau = 'facile' | 'moyen' | 'difficile';
export type Refus = 'une-lettre' | 'exclu' | 'total' | 'sexe-minoritaire' | 'pic-plat' | 'trop-long';
export type Verdict = { jouable: true; niveau: Niveau } | { jouable: false; raison: Refus };

/** Plus petite taille d'affichage du prénom (px), tous formats confondus : public/js/taille.js. */
export type TailleAffichee = (nom: string) => number;
/** Aucun texte sous 28 px à l'écran (BRIEF.md, section 6). */
export const TAILLE_MIN = 28;

export function juger(p: Prenom, totalAutreSexe: number, exclus: ReadonlySet<string>, taille?: TailleAffichee): Verdict {
  if ([...p.prenom].length < 2) return { jouable: false, raison: 'une-lettre' };
  if (exclus.has(p.prenom)) return { jouable: false, raison: 'exclu' };
  if (p.total < REGLES.totalMin) return { jouable: false, raison: 'total' };
  if (p.total < totalAutreSexe) return { jouable: false, raison: 'sexe-minoritaire' };
  // « Vrai pic » : au moins 3 fois la moyenne des années présentes dans le fichier.
  if (p.effectifPic < REGLES.facteurPic * (p.total / p.anneesPresentes)) return { jouable: false, raison: 'pic-plat' };
  if (taille && taille(p.nom) < TAILLE_MIN) return { jouable: false, raison: 'trop-long' };
  const niveau: Niveau = p.total >= REGLES.facile ? 'facile' : p.total >= REGLES.moyen ? 'moyen' : 'difficile';
  return { jouable: true, niveau };
}

/**
 * `data/exclus.txt` : un prénom par ligne, écrit comme on veut (« Kévin », « kevin » ne
 * sont pas la même chose : l'accent compte, la casse non). Lignes vides et « # » ignorées.
 */
export function lireExclus(texte: string): Set<string> {
  const exclus = new Set<string>();
  for (const brut of texte.split(/\r?\n/)) {
    const ligne = brut.trim();
    if (ligne === '' || ligne.startsWith('#')) continue;
    exclus.add(ligne.normalize('NFC').toLocaleUpperCase('fr-FR'));
  }
  return exclus;
}

export interface Preparation {
  prenoms: Map<string, Prenom>;
  verdicts: Map<string, Verdict>;
  premiereAnnee: number;
  derniereAnnee: number;
}

export function preparer(texteCsv: string, exclus: ReadonlySet<string>, taille?: TailleAffichee): Preparation {
  const lignes = lireCsv(texteCsv);
  if (lignes.length === 0) throw new ErreurInsee(2, 'aucune donnée');
  const prenoms = regrouper(lignes);
  let premiereAnnee = Infinity;
  let derniereAnnee = -Infinity;
  for (const l of lignes) {
    premiereAnnee = Math.min(premiereAnnee, l.annee);
    derniereAnnee = Math.max(derniereAnnee, l.annee);
  }
  const verdicts = new Map<string, Verdict>();
  for (const [k, p] of prenoms) {
    const autre = prenoms.get(cle(p.prenom, p.sexe === 'M' ? 'F' : 'M'));
    verdicts.set(k, juger(p, autre?.total ?? 0, exclus, taille));
  }
  return { prenoms, verdicts, premiereAnnee, derniereAnnee };
}
