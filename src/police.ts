import { readFileSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';

/**
 * Largeur d'un texte dans IBM Plex Sans, lue dans les polices que le socle sert à
 * l'overlay (`public/vendor/fonts`), sans dépendance : `npm run preparer` vérifie ainsi
 * qu'aucun prénom jouable ne s'affiche sous 28 px (BRIEF.md, sections 6 et 9).
 *
 * Ces polices sont **variables** (axe `wght`) : la chasse en gras = chasse par défaut
 * (`hmtx`) + variation (`HVAR`), à la graisse demandée normalisée (`fvar`).
 * Le crénage (`GPOS`) est ignoré : écart de l'ordre du pixel, vérifié contre Chrome.
 */

export class ErreurPolice extends Error {
  override name = 'ErreurPolice';
}

/**
 * Étiquettes connues de WOFF2 (spécification W3C, section 4.1), dans l'ordre des indices :
 * 4 caractères (« cvt  » compte son espace) et une espace de séparation.
 */
const LISTE =
  'cmap head hhea hmtx maxp name OS/2 post cvt  fpgm glyf loca prep CFF  VORG EBDT EBLC gasp hdmx kern LTSH PCLT VDMX ' +
  'vhea vmtx BASE GDEF GPOS GSUB EBSC JSTF MATH CBDT CBLC COLR CPAL SVG  sbix acnt avar bdat bloc bsln cvar fdsc feat fmtx ' +
  'fvar gvar hsty just lcar mort morx opbd prop trak Zapf Silf Glat Gloc Feat Sill';
const ETIQUETTES = Array.from({ length: (LISTE.length + 1) / 5 }, (_, i) => LISTE.slice(i * 5, i * 5 + 4));

/** Tables d'une police WOFF2, décompressées (les tables transformées ne sont pas reconstruites). */
export function lireWoff2(octets: Buffer): Map<string, Buffer> {
  if (octets.toString('latin1', 0, 4) !== 'wOF2') throw new ErreurPolice('pas une police WOFF2');
  const nombre = octets.readUInt16BE(12);
  const tailleCompressee = octets.readUInt32BE(20);
  let pos = 48;
  const base128 = () => {
    let v = 0;
    for (let i = 0; i < 5; i++) {
      const c = octets[pos++]!;
      v = v * 128 + (c & 0x7f);
      if (!(c & 0x80)) return v;
    }
    throw new ErreurPolice('entier UIntBase128 invalide');
  };
  const entrees: { etiquette: string; longueur: number; transformee: boolean }[] = [];
  for (let i = 0; i < nombre; i++) {
    const drapeaux = octets[pos++]!;
    const indice = drapeaux & 0x3f;
    let etiquette: string;
    if (indice === 63) {
      etiquette = octets.toString('latin1', pos, pos + 4);
      pos += 4;
    } else {
      etiquette = ETIQUETTES[indice] ?? '????';
    }
    const version = (drapeaux >> 6) & 3;
    let longueur = base128();
    // glyf et loca : version 0 = transformées ; les autres : version 0 = telles quelles.
    const transformee = etiquette === 'glyf' || etiquette === 'loca' ? version !== 3 : version !== 0;
    if (transformee) longueur = base128();
    entrees.push({ etiquette, longueur, transformee });
  }
  const donnees = brotliDecompressSync(octets.subarray(pos, pos + tailleCompressee));
  const tables = new Map<string, Buffer>();
  let decalage = 0;
  for (const e of entrees) {
    if (!e.transformee) tables.set(e.etiquette, donnees.subarray(decalage, decalage + e.longueur));
    decalage += e.longueur;
  }
  return tables;
}

const f2dot14 = (b: Buffer, o: number) => b.readInt16BE(o) / 16384;
const fixe = (b: Buffer, o: number) => b.readInt32BE(o) / 65536;

function table(tables: Map<string, Buffer>, etiquette: string): Buffer {
  const t = tables.get(etiquette);
  if (!t) throw new ErreurPolice(`table ${etiquette} absente ou transformée`);
  return t;
}

/** Caractère → glyphe (sous-tables Unicode, formats 4 et 12). */
function lireCmap(cmap: Buffer): Map<number, number> {
  const resultat = new Map<number, number>();
  const n = cmap.readUInt16BE(2);
  const sousTables: number[] = [];
  for (let i = 0; i < n; i++) {
    const plateforme = cmap.readUInt16BE(4 + i * 8);
    const codage = cmap.readUInt16BE(6 + i * 8);
    if (plateforme === 0 || (plateforme === 3 && (codage === 1 || codage === 10))) sousTables.push(cmap.readUInt32BE(8 + i * 8));
  }
  for (const o of sousTables) {
    const format = cmap.readUInt16BE(o);
    if (format === 4) {
      const segments = cmap.readUInt16BE(o + 6) / 2;
      const fins = o + 14;
      const debuts = fins + segments * 2 + 2;
      const deltas = debuts + segments * 2;
      const decalages = deltas + segments * 2;
      for (let s = 0; s < segments; s++) {
        const fin = cmap.readUInt16BE(fins + s * 2);
        const debut = cmap.readUInt16BE(debuts + s * 2);
        const delta = cmap.readInt16BE(deltas + s * 2);
        const dec = cmap.readUInt16BE(decalages + s * 2);
        for (let c = debut; c <= fin && c !== 0xffff; c++) {
          let glyphe: number;
          if (dec === 0) glyphe = (c + delta) & 0xffff;
          else {
            const g = cmap.readUInt16BE(decalages + s * 2 + dec + (c - debut) * 2);
            glyphe = g === 0 ? 0 : (g + delta) & 0xffff;
          }
          if (glyphe) resultat.set(c, glyphe);
        }
      }
    } else if (format === 12) {
      const groupes = cmap.readUInt32BE(o + 12);
      for (let g = 0; g < groupes; g++) {
        const p = o + 16 + g * 12;
        const debut = cmap.readUInt32BE(p);
        const fin = cmap.readUInt32BE(p + 4);
        const premier = cmap.readUInt32BE(p + 8);
        for (let c = debut; c <= fin; c++) resultat.set(c, premier + c - debut);
      }
    }
  }
  return resultat;
}

/**
 * Coordonnée normalisée de chaque axe (fvar). La graisse doit être le minimum, le
 * défaut ou le maximum de l'axe : `avar` ne déplace jamais ces trois points (-1, 0, 1),
 * il n'y a donc pas à l'appliquer. Une graisse intermédiaire est refusée.
 */
function coordonnee(tables: Map<string, Buffer>, graisse: number): number[] {
  const fvar = table(tables, 'fvar');
  const debutAxes = fvar.readUInt16BE(4);
  const nbAxes = fvar.readUInt16BE(8);
  const tailleAxe = fvar.readUInt16BE(10);
  const coords: number[] = [];
  for (let a = 0; a < nbAxes; a++) {
    const o = debutAxes + a * tailleAxe;
    const etiquette = fvar.toString('latin1', o, o + 4);
    const [min, defaut, max] = [fixe(fvar, o + 4), fixe(fvar, o + 8), fixe(fvar, o + 12)];
    if (etiquette !== 'wght' || graisse === defaut) coords.push(0);
    else if (graisse === min) coords.push(-1);
    else if (graisse === max) coords.push(1);
    else throw new ErreurPolice(`graisse ${graisse} : seules ${min}, ${defaut} et ${max} sont gérées (avar ignoré)`);
  }
  return coords;
}

/** Variation de chasse de chaque glyphe à ces coordonnées (HVAR, magasin de variations). */
function variations(hvar: Buffer, coords: number[]): (glyphe: number) => number {
  const magasin = hvar.readUInt32BE(4);
  const correspondance = hvar.readUInt32BE(8);
  const regions = magasin + hvar.readUInt32BE(magasin + 2);
  const nbAxes = hvar.readUInt16BE(regions);
  const nbRegions = hvar.readUInt16BE(regions + 2);
  const facteurs: number[] = [];
  for (let r = 0; r < nbRegions; r++) {
    let f = 1;
    for (let a = 0; a < nbAxes; a++) {
      const o = regions + 4 + (r * nbAxes + a) * 6;
      const [debut, pic, fin] = [f2dot14(hvar, o), f2dot14(hvar, o + 2), f2dot14(hvar, o + 4)];
      const c = coords[a] ?? 0;
      if (pic === 0 || c === pic || debut > pic || pic > fin || (debut < 0 && fin > 0)) continue;
      if (c <= debut || c >= fin) {
        f = 0;
        break;
      }
      f *= c < pic ? (c - debut) / (pic - debut) : (fin - c) / (fin - pic);
    }
    facteurs.push(f);
  }
  const nbDonnees = hvar.readUInt16BE(magasin + 6);
  const donnees = Array.from({ length: nbDonnees }, (_, i) => magasin + hvar.readUInt32BE(magasin + 8 + i * 4));

  const delta = (externe: number, interne: number) => {
    const o = donnees[externe];
    if (o === undefined) return 0;
    const nbItems = hvar.readUInt16BE(o);
    const mots = hvar.readUInt16BE(o + 2);
    const longs = (mots & 0x8000) !== 0;
    const nbMots = mots & 0x7fff;
    const nbIndices = hvar.readUInt16BE(o + 4);
    if (interne >= nbItems) return 0;
    const indices = Array.from({ length: nbIndices }, (_, i) => hvar.readUInt16BE(o + 6 + i * 2));
    const tailleLigne = longs ? nbMots * 4 + (nbIndices - nbMots) * 2 : nbMots * 2 + (nbIndices - nbMots);
    let p = o + 6 + nbIndices * 2 + interne * tailleLigne;
    let somme = 0;
    for (let k = 0; k < nbIndices; k++) {
      let d: number;
      if (k < nbMots) {
        d = longs ? hvar.readInt32BE(p) : hvar.readInt16BE(p);
        p += longs ? 4 : 2;
      } else {
        d = longs ? hvar.readInt16BE(p) : hvar.readInt8(p);
        p += longs ? 2 : 1;
      }
      somme += d * (facteurs[indices[k]!] ?? 0);
    }
    return somme;
  };

  if (correspondance === 0) return (g) => delta(0, g);
  const format = hvar.readUInt8(correspondance);
  const entree = hvar.readUInt8(correspondance + 1);
  const nb = format === 0 ? hvar.readUInt16BE(correspondance + 2) : hvar.readUInt32BE(correspondance + 2);
  const debut = correspondance + (format === 0 ? 4 : 6);
  const taille = ((entree >> 4) & 3) + 1;
  const bitsInternes = (entree & 0xf) + 1;
  return (g) => {
    const i = Math.min(g, nb - 1);
    let v = 0;
    for (let b = 0; b < taille; b++) v = v * 256 + hvar.readUInt8(debut + i * taille + b);
    return delta(Math.floor(v / 2 ** bitsInternes), v & (2 ** bitsInternes - 1));
  };
}

export interface Chasses {
  /** Largeur du texte à 100 px. `null` si un caractère manque dans toutes les polices. */
  mesurer(texte: string): number | null;
}

/** Chasses à une graisse donnée ; plusieurs fichiers = sous-ensembles (latin, latin-ext). */
export function chasses(fichiers: readonly Buffer[], graisse: number): Chasses {
  const polices = fichiers.map((octets) => {
    const tables = lireWoff2(octets);
    const unites = table(tables, 'head').readUInt16BE(18);
    const nbMetriques = table(tables, 'hhea').readUInt16BE(34);
    const hmtx = table(tables, 'hmtx');
    const hvar = tables.get('HVAR');
    const variation = hvar && tables.has('fvar') ? variations(hvar, coordonnee(tables, graisse)) : () => 0;
    const cmap = lireCmap(table(tables, 'cmap'));
    const chasse = (g: number) => hmtx.readUInt16BE(Math.min(g, nbMetriques - 1) * 4) + variation(g);
    return { cmap, unites, chasse };
  });
  return {
    mesurer(texte) {
      let total = 0;
      for (const c of texte) {
        const point = c.codePointAt(0)!;
        const police = polices.find((p) => p.cmap.has(point));
        if (!police) return null;
        total += (police.chasse(police.cmap.get(point)!) / police.unites) * 100;
      }
      return total;
    },
  };
}

/** IBM Plex Sans gras (700), telle que servie à l'overlay. */
export function chassesPrenom(): Chasses {
  const dossier = new URL('../node_modules/socle/public/vendor/fonts/', import.meta.url);
  const fichiers = ['ibm-plex-sans-700-latin.woff2', 'ibm-plex-sans-700-latin-ext.woff2'].map((f) => readFileSync(new URL(f, dossier)));
  return chasses(fichiers, 700);
}
