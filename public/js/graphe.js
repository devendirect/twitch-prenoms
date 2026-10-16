/**
 * Géométrie du graphique (maquette `Chart.dc.html`, thème Plateau), sans DOM : barres
 * de l'histogramme des réponses, courbe réelle, pic, graduations et repères des
 * meilleurs. Testée en Node ; `overlay.js` la dessine.
 */

/** Hauteur réservée sous l'axe aux années. */
const SOUS_AXE = 44;
/** Étiquette du pic : hauteur, et largeur d'un caractère d'IBM Plex Mono à 28 px (0,6 em). */
const ETIQUETTE_H = 48;
const CHASSE_MONO = 16.8;

/**
 * @param {object} o
 * @param {number} o.largeur
 * @param {number} o.hauteur
 * @param {{premiere: number, derniere: number}} o.axe
 * @param {boolean} o.compact       graduations tous les 20 ans, repères en ronds numérotés
 * @param {{decennie: number, n: number}[]} [o.histogramme]
 * @param {{debut: number, effectifs: number[], pics: number[], effectifPic: number}} [o.courbe]
 * @param {string} [o.etiquettePic]  « 1998 · 7 455 naissances »
 * @param {{pseudo: string, annee: number}[]} [o.meilleurs]
 * @param {number[]} [o.graduations] années à graduer, à la place du pas régulier
 */
export function geometrie(o) {
  const { largeur: w, hauteur: h, axe, compact } = o;
  const basTrace = h - SOUS_AXE;
  const etendue = axe.derniere + 1 - axe.premiere;
  const X = (annee) => ((annee - axe.premiere) / etendue) * w;
  const revele = Boolean(o.courbe);

  const histo = o.histogramme ?? [];
  const maxN = Math.max(0, ...histo.map((b) => b.n));
  const ecart = compact ? 3 : 5;
  const hautMax = basTrace * 0.85;
  const barres = histo.map((b) => {
    const x0 = X(Math.max(b.decennie, axe.premiere));
    const x1 = X(Math.min(b.decennie + 10, axe.derniere + 1));
    const hb = maxN === 0 ? 4 : Math.max(4, (b.n / maxN) * hautMax);
    return { x: x0 + ecart, l: x1 - x0 - 2 * ecart, y: basTrace - hb, h: hb };
  });

  const pas = compact ? 20 : 10;
  const annees = o.graduations ?? [];
  if (!o.graduations) for (let a = Math.ceil(axe.premiere / pas) * pas; a <= axe.derniere; a += pas) annees.push(a);
  // Une graduation qui toucherait la précédente est omise (1900 calé à gauche, puis 1920 en compact).
  const graduations = [];
  let finPrecedente = -Infinity;
  for (const a of annees) {
    const texte = String(a);
    const centre = a !== axe.premiere;
    const largeurTexte = texte.length * CHASSE_MONO;
    const debut = centre ? X(a) - largeurTexte / 2 : X(a);
    if (debut < finPrecedente + 12) continue;
    graduations.push({ x: X(a), texte, centre });
    finPrecedente = debut + largeurTexte;
  }

  const g = { largeur: w, hauteur: h, basTrace, barres, graduations, revele, compact };
  if (!revele) return g;

  const c = o.courbe;
  const hautCourbe = ETIQUETTE_H + 22;
  const echelle = (basTrace - hautCourbe) / (c.effectifPic || 1);
  const points = [];
  // L'axe entier : 0 avant la première année présente et après la dernière.
  for (let a = axe.premiere; a <= axe.derniere; a++) {
    const v = c.effectifs[a - c.debut] ?? 0;
    points.push([X(a + 0.5), basTrace - v * echelle]);
  }
  const trace = 'M' + points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L');
  g.trait = trace;
  g.aire = `${trace}L${X(axe.derniere + 1).toFixed(1)},${basTrace}L${X(axe.premiere).toFixed(1)},${basTrace}Z`;
  g.pics = c.pics.map((a) => ({ x: X(a + 0.5), y: hautCourbe }));
  g.hautEtiquette = ETIQUETTE_H;
  const texte = o.etiquettePic ?? '';
  const largeurEtiquette = [...texte].length * CHASSE_MONO + 32;
  const milieu = g.pics.reduce((s, p) => s + p.x, 0) / g.pics.length;
  g.etiquette = { texte, x: Math.max(0, Math.min(w - largeurEtiquette, milieu - largeurEtiquette / 2)) };

  g.reperes = (o.meilleurs ?? []).slice(0, 3).map((m, k) => {
    const x = X(m.annee + 0.5);
    if (compact) {
      const y = basTrace - 28 - k * 44;
      return { rang: k + 1, x, y };
    }
    const y = basTrace - 44 - k * 64;
    const estimee = 36 + 28 + [...m.pseudo].length * 15.5 + 64 + 32;
    return { rang: k + 1, x, y, pseudo: m.pseudo, annee: m.annee, aGauche: x + estimee > w };
  });
  return g;
}
