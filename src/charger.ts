import { existsSync, readFileSync } from 'node:fs';
import { chargerDonnees } from './donnees.js';
import { lireExclus } from './insee.js';
import { creerJeu, type OptionsJeu } from './jeu.js';
import { mesureurPrenom } from './taille.js';
import { jouables } from './tirage.js';

/** Données préparées et `exclus.txt`, lus au démarrage (`npm start` et `npm run simu`). */
export function chargerJeu(options: Omit<OptionsJeu, 'donnees' | 'jouables'> = {}) {
  const prenoms = new URL('../data/prenoms.json', import.meta.url);
  if (!existsSync(prenoms)) {
    console.error('\n  data/prenoms.json absent : lance d’abord « npm run preparer ».\n');
    process.exit(1);
  }
  const donnees = chargerDonnees(prenoms);
  const cheminExclus = new URL('../data/exclus.txt', import.meta.url);
  const exclus = existsSync(cheminExclus) ? lireExclus(readFileSync(cheminExclus, 'utf8')) : new Set<string>();
  const liste = jouables(donnees, exclus, mesureurPrenom().taille);
  console.log(`  ${donnees.prenoms.length} prénoms chargés, ${liste.length} jouables (${exclus.size} exclu(s) dans data/exclus.txt).`);
  return creerJeu({ ...options, donnees, jouables: liste });
}
