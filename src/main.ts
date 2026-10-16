/** `npm start` : le jeu sur la vraie chaîne (configuration dans `.env`). */
import { fileURLToPath } from 'node:url';
import { lancer } from 'socle';
import { chargerJeu } from './charger.js';

await lancer(chargerJeu(), { dbParDefaut: 'data/prenoms.db', dossierPublic: fileURLToPath(new URL('../public/', import.meta.url)) });
