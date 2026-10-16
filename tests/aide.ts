import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Joueur } from 'socle';
import { compacter, lireDonnees, type Source } from '../src/donnees.js';
import { EDITION, preparer } from '../src/insee.js';

/** Extrait réel du fichier Insee (édition 2026) : toutes les années de 10 couples, CRLF compris. */
// Chemin relatif au projet (vitest y tourne) : sous jsdom, import.meta.url n'est pas une adresse file:.
export const EXTRAIT = readFileSync(path.resolve('tests/fixtures/extrait-insee.csv'), 'utf8');

export const SOURCE: Source = {
  producteur: 'Insee', titre: 'Fichier des prénoms', edition: EDITION.annee, publiee: EDITION.publiee, page: EDITION.page,
  licence: EDITION.licence, sha256: EDITION.sha256, arrondi: 5, preparee: '2026-10-16T00:00:00.000Z',
};

/** Comme `data/prenoms.json`, aller-retour JSON compris. */
export const fichierExtrait = () => JSON.parse(JSON.stringify(compacter(preparer(EXTRAIT, new Set()), SOURCE)));
export const donneesExtrait = () => lireDonnees(fichierExtrait());

/**
 * Identifiant donné par `TransportSimule` du socle (`userIdDe`, non exporté) : même calcul,
 * pour viser un joueur dans un `CLEARCHAT` simulé.
 */
export const userIdDe = (nom: string) =>
  String(parseInt(createHash('sha256').update(nom.toLowerCase()).digest('hex').slice(0, 8), 16));

export const joueur =(nom: string): Joueur => ({ userId: `id-${nom}`, login: nom.toLowerCase(), displayName: nom, estModo: false });
