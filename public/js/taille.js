/**
 * Taille du prénom (BRIEF.md, section 6) : partagée par l'overlay (mesure sur canvas)
 * et par `npm run preparer` (mesure d'après la police, src/police.ts). Aucun accès au
 * DOM ici : la fonction de mesure est fournie.
 */

/** Espacement des lettres du prénom (thème Plateau) : -0,02 em. */
export const ESPACEMENT = -0.02;
/** Hauteur d'une ligne, en multiple de la taille. */
export const INTERLIGNE = 1.05;
/** Aucun texte sous 28 px (BRIEF.md, section 6). */
export const TAILLE_MIN = 28;
/** On passe sur deux lignes si une seule ligne tombe sous 62 % de la taille maximale. */
const SEUIL_DEUX_LIGNES = 0.62;

/**
 * Cadres du prénom, relevés dans la maquette Plateau : taille maximale, largeur et
 * hauteur disponibles. `deux` : la carte prénom ; `carte` : la carte `!prenom`.
 */
export const CADRES = {
  plein: { annonce: [160, 1600, 380], ouvert: [104, 1180, 160], revelation: [104, 1180, 160], scores: [104, 1180, 160] },
  bloc: { annonce: [120, 656, 300], ouvert: [72, 400, 108], revelation: [56, 440, 72], scores: [56, 440, 72] },
  // Carte prénom du format deux : moins haute que la maquette, qui n'y mettait pas la mention de source.
  deux: { annonce: [120, 536, 150], ouvert: [88, 536, 96], revelation: [88, 536, 96], scores: [88, 536, 96] },
  carte: { prenom: [88, 576, 150] },
};

/** Coupure au tiret (gardé en fin de ligne) ou à l'espace le plus central, ou `null`. */
export function couper(nom) {
  const lettres = [...nom];
  let mieux = null;
  for (let i = 1; i < lettres.length - 1; i++) {
    const c = lettres[i];
    if (c !== '-' && c !== ' ') continue;
    const lignes = [lettres.slice(0, c === '-' ? i + 1 : i).join(''), lettres.slice(i + 1).join('')];
    const pire = Math.max([...lignes[0]].length, [...lignes[1]].length);
    if (!mieux || pire < mieux.pire) mieux = { lignes, pire };
  }
  return mieux ? mieux.lignes : null;
}

/**
 * Plus grande taille (entière) qui tient dans le cadre.
 * `mesurer(texte)` : largeur à 100 px, sans espacement des lettres.
 */
export function ajuster(nom, mesurer, [max, largeur, hauteur]) {
  const essai = (lignes) => {
    const parPx = Math.max(...lignes.map((l) => mesurer(l) / 100 + ESPACEMENT * [...l].length));
    return Math.floor(Math.min(max, largeur / parPx, hauteur / (lignes.length * INTERLIGNE)));
  };
  const une = essai([nom]);
  const coupe = couper(nom);
  if (coupe && une < max * SEUIL_DEUX_LIGNES) {
    const deux = essai(coupe);
    if (deux > une) return { taille: deux, lignes: coupe };
  }
  return { taille: une, lignes: [nom] };
}

/** La plus petite taille du prénom, tous formats et états confondus, et où. */
export function tailleMinimale(nom, mesurer) {
  let min = null;
  for (const [format, etats] of Object.entries(CADRES)) {
    for (const [etat, cadre] of Object.entries(etats)) {
      const r = ajuster(nom, mesurer, cadre);
      if (!min || r.taille < min.taille) min = { taille: r.taille, lignes: r.lignes, format, etat };
    }
  }
  return min;
}
