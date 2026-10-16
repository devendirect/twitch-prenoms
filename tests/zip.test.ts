import { crc32, deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { ErreurZip, extraireZip, listerZip } from '../src/zip.js';

interface Fichier { nom: string; contenu: Buffer; methode: 0 | 8 }

/** Fabrique une archive minimale, conforme au format zip (en-têtes locaux, répertoire central, fin). */
function fabriquerZip(fichiers: Fichier[]): Buffer {
  const locaux: Buffer[] = [];
  const centraux: Buffer[] = [];
  let decalage = 0;
  for (const f of fichiers) {
    const nom = Buffer.from(f.nom, 'utf8');
    const donnees = f.methode === 8 ? deflateRawSync(f.contenu) : f.contenu;
    const crc = crc32(f.contenu);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(f.methode, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(donnees.length, 18);
    local.writeUInt32LE(f.contenu.length, 22);
    local.writeUInt16LE(nom.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(f.methode, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(donnees.length, 20);
    central.writeUInt32LE(f.contenu.length, 24);
    central.writeUInt16LE(nom.length, 28);
    central.writeUInt32LE(decalage, 42);
    const bloc = Buffer.concat([local, nom, donnees]);
    locaux.push(bloc);
    centraux.push(Buffer.concat([central, nom]));
    decalage += bloc.length;
  }
  const repertoire = Buffer.concat(centraux);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(fichiers.length, 8);
  fin.writeUInt16LE(fichiers.length, 10);
  fin.writeUInt32LE(repertoire.length, 12);
  fin.writeUInt32LE(decalage, 16);
  return Buffer.concat([...locaux, repertoire, fin]);
}

const CSV = Buffer.from('sexe;prenom;periode;valeur;rang\r\n1;LÉO;2019;4660;3\r\n'.repeat(50), 'utf8');

describe('extraireZip', () => {
  it('extrait un fichier compressé (deflate) ou stocké', () => {
    const zip = fabriquerZip([
      { nom: 'lisez-moi.txt', contenu: Buffer.from('bonjour'), methode: 0 },
      { nom: 'prenoms.csv', contenu: CSV, methode: 8 },
    ]);
    expect(listerZip(zip)).toEqual(['lisez-moi.txt', 'prenoms.csv']);
    expect(extraireZip(zip, 'prenoms.csv').equals(CSV)).toBe(true);
    expect(extraireZip(zip, 'lisez-moi.txt').toString()).toBe('bonjour');
  });

  it('nomme le contenu quand le fichier demandé manque', () => {
    const zip = fabriquerZip([{ nom: 'autre.csv', contenu: CSV, methode: 8 }]);
    expect(() => extraireZip(zip, 'prenoms.csv')).toThrow(/absent de l'archive \(contenu : autre\.csv\)/);
  });

  it('refuse un contenu dont le CRC ne correspond pas', () => {
    const zip = fabriquerZip([{ nom: 'prenoms.csv', contenu: CSV, methode: 0 }]);
    // Un octet du contenu modifié (après l'en-tête local de 30 octets et le nom).
    const i = 30 + 'prenoms.csv'.length + 5;
    zip.writeUInt8(zip.readUInt8(i) ^ 0xff, i);
    expect(() => extraireZip(zip, 'prenoms.csv')).toThrow(/CRC incorrect/);
  });

  it('refuse une taille annoncée différente', () => {
    const zip = fabriquerZip([{ nom: 'prenoms.csv', contenu: CSV, methode: 8 }]);
    const central = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    zip.writeUInt32LE(CSV.length + 1, central + 24);
    expect(() => extraireZip(zip, 'prenoms.csv')).toThrow(ErreurZip);
  });

  it('refuse une archive qui annonce un fichier démesuré (bombe)', () => {
    const zip = fabriquerZip([{ nom: 'prenoms.csv', contenu: CSV, methode: 8 }]);
    const central = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    zip.writeUInt32LE(500 * 1024 * 1024, central + 24);
    expect(() => extraireZip(zip, 'prenoms.csv')).toThrow(/au-delà de la limite/);
  });

  it('refuse zip64, chiffrement, méthode inconnue, archive tronquée ou vide', () => {
    const modifier = (decalageCentral: number, ecrire: (zip: Buffer, c: number) => void) => {
      const zip = fabriquerZip([{ nom: 'prenoms.csv', contenu: CSV, methode: 8 }]);
      ecrire(zip, zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])) + decalageCentral);
      return () => extraireZip(zip, 'prenoms.csv');
    };
    expect(modifier(24, (z, c) => z.writeUInt32LE(0xffffffff, c))).toThrow(/zip64/);
    expect(modifier(8, (z, c) => z.writeUInt16LE(1, c))).toThrow(/chiffrée/);
    expect(modifier(10, (z, c) => z.writeUInt16LE(12, c))).toThrow(/méthode de compression 12/);
    const zip = fabriquerZip([{ nom: 'prenoms.csv', contenu: CSV, methode: 8 }]);
    expect(() => extraireZip(zip.subarray(0, 40), 'prenoms.csv')).toThrow(ErreurZip);
    expect(() => extraireZip(Buffer.alloc(10), 'prenoms.csv')).toThrow(/trop courte/);
  });
});
