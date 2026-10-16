/**
 * Point d'entrée de overlay.html : lit l'adresse (`?format=plein|bloc|deux&carte=…`),
 * attend les polices (la taille du prénom se mesure avec elles), demande la langue au
 * serveur, puis branche le flux `/events` du socle.
 */
import { live } from '/socle/live.js';
import { creerOverlay } from './overlay.js';

const parametres = new URLSearchParams(location.search);
const contexte = document.createElement('canvas').getContext('2d');
const mesurer = (texte) => {
  contexte.font = "700 100px 'IBM Plex Sans'";
  return contexte.measureText(texte).width;
};

async function demarrer() {
  await Promise.all(
    ["700 100px 'IBM Plex Sans'", "600 28px 'IBM Plex Sans'", "600 28px 'IBM Plex Mono'"].map((police) =>
      document.fonts.load(police).catch(() => null),
    ),
  );
  let langue = 'fr';
  try {
    const etat = await (await fetch('/api/etat')).json();
    if (etat.langue === 'en') langue = 'en';
  } catch {
    // Serveur pas encore prêt : français, et live() se reconnectera.
  }
  const overlay = creerOverlay({
    racine: document.getElementById('scene'),
    format: parametres.get('format') ?? 'bloc',
    carte: parametres.get('carte'),
    langue,
    mesurer,
  });
  live((diffusee) => overlay.rendre(diffusee.jeu));
}

void demarrer();
