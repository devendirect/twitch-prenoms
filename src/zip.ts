import { crc32, inflateRawSync } from 'node:zlib';

/**
 * Extrait un fichier d'une archive zip, sans dépendance : le zip de l'Insee ne contient
 * qu'un CSV, compressé en « deflate ». On lit le répertoire central (fin de l'archive),
 * puis l'en-tête local, et on vérifie taille et CRC du contenu extrait.
 * Zip64 et chiffrement ne sont pas gérés : erreur explicite.
 */

const SIG_FIN = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;
/** Garde-fou contre une archive piégée : le CSV national fait 16,5 Mo. */
const TAILLE_MAX = 200 * 1024 * 1024;

export class ErreurZip extends Error {
  override name = 'ErreurZip';
}

function trouverFin(zip: Buffer): number {
  // L'enregistrement de fin fait 22 octets, plus un commentaire de 65 535 octets au plus.
  const debut = Math.max(0, zip.length - 22 - 0xffff);
  for (let i = zip.length - 22; i >= debut; i--) {
    if (zip.readUInt32LE(i) === SIG_FIN) return i;
  }
  throw new ErreurZip('archive zip illisible : fin du répertoire central introuvable');
}

/** Noms des fichiers de l'archive, dans l'ordre du répertoire central. */
export function listerZip(zip: Buffer): string[] {
  return entrees(zip).map((e) => e.nom);
}

interface Entree {
  nom: string;
  methode: number;
  drapeaux: number;
  crc: number;
  tailleCompressee: number;
  taille: number;
  local: number;
}

function entrees(zip: Buffer): Entree[] {
  if (zip.length < 22) throw new ErreurZip('archive zip trop courte');
  const fin = trouverFin(zip);
  const nombre = zip.readUInt16LE(fin + 10);
  let pos = zip.readUInt32LE(fin + 16);
  const liste: Entree[] = [];
  for (let i = 0; i < nombre; i++) {
    if (pos + 46 > zip.length || zip.readUInt32LE(pos) !== SIG_CENTRAL) {
      throw new ErreurZip('archive zip illisible : répertoire central abîmé');
    }
    const longueurNom = zip.readUInt16LE(pos + 28);
    const longueurExtra = zip.readUInt16LE(pos + 30);
    const longueurCommentaire = zip.readUInt16LE(pos + 32);
    liste.push({
      nom: zip.toString('utf8', pos + 46, pos + 46 + longueurNom),
      drapeaux: zip.readUInt16LE(pos + 8),
      methode: zip.readUInt16LE(pos + 10),
      crc: zip.readUInt32LE(pos + 16),
      tailleCompressee: zip.readUInt32LE(pos + 20),
      taille: zip.readUInt32LE(pos + 24),
      local: zip.readUInt32LE(pos + 42),
    });
    pos += 46 + longueurNom + longueurExtra + longueurCommentaire;
  }
  return liste;
}

export function extraireZip(zip: Buffer, nom: string): Buffer {
  const e = entrees(zip).find((x) => x.nom === nom);
  if (!e) throw new ErreurZip(`« ${nom} » absent de l'archive (contenu : ${listerZip(zip).join(', ') || 'vide'})`);
  if (e.taille === 0xffffffff || e.tailleCompressee === 0xffffffff) throw new ErreurZip('archive zip64 non gérée');
  if (e.drapeaux & 1) throw new ErreurZip('archive chiffrée non gérée');
  if (e.taille > TAILLE_MAX) throw new ErreurZip(`« ${nom} » annonce ${e.taille} octets, au-delà de la limite`);
  if (e.local + 30 > zip.length || zip.readUInt32LE(e.local) !== SIG_LOCAL) {
    throw new ErreurZip('archive zip illisible : en-tête local introuvable');
  }
  const debut = e.local + 30 + zip.readUInt16LE(e.local + 26) + zip.readUInt16LE(e.local + 28);
  const donnees = zip.subarray(debut, debut + e.tailleCompressee);
  if (donnees.length !== e.tailleCompressee) throw new ErreurZip('archive zip tronquée');
  let contenu: Buffer;
  if (e.methode === 0) contenu = Buffer.from(donnees);
  else if (e.methode === 8) contenu = inflateRawSync(donnees, { maxOutputLength: TAILLE_MAX });
  else throw new ErreurZip(`méthode de compression ${e.methode} non gérée`);
  if (contenu.length !== e.taille) throw new ErreurZip(`taille extraite ${contenu.length} au lieu de ${e.taille}`);
  if (crc32(contenu) !== e.crc) throw new ErreurZip(`« ${nom} » : CRC incorrect, archive abîmée`);
  return contenu;
}
