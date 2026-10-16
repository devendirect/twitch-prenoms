/**
 * `npm run simu -- --joueurs 25 --graine 42 --vitesse 2` : une partie sans stream, avec
 * de faux spectateurs (profil dans `src/jeu.ts`). Tape « !jeu start » pour lancer.
 */
import { fileURLToPath } from 'node:url';
import { lancerSimu } from 'socle';
import { chargerJeu } from '../src/charger.js';

await lancerSimu(chargerJeu(), { dossierPublic: fileURLToPath(new URL('../public/', import.meta.url)) });
