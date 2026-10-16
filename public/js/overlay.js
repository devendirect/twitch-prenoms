/**
 * Overlay « Devine l'année de mon prénom », thème Plateau (BRIEF.md, section 6 ;
 * maquette/Overlay.dc.html). Trois formats : `plein`, `bloc` (par défaut), `deux`
 * (deux cartes, chacune une source OBS : `carte=prenom` ou `carte=graphique`).
 *
 * Tout texte passe par dom.js du socle (`textContent`), jamais par du HTML. La page est
 * reconstruite quand la manche change ; chaque seconde, seuls le chrono et les barres
 * de temps bougent (la courbe ne se redessine pas).
 */
import { PSEUDO_MAX, element, remplacer } from '/socle/dom.js';
import { geometrie } from './graphe.js';
import { CADRES, ajuster } from './taille.js';
import { TEXTES, chrono, ecart } from './textes.js';

const SVG = 'http://www.w3.org/2000/svg';
export const FORMATS = ['plein', 'bloc', 'deux'];

/**
 * @param {object} o
 * @param {HTMLElement} o.racine
 * @param {string} [o.format]   plein | bloc | deux
 * @param {string|null} [o.carte] prenom | graphique (format deux) ; absent : les deux
 * @param {string} [o.langue]   fr | en
 * @param {(texte: string) => number} o.mesurer  largeur du texte à 100 px, prénom en gras
 */
export function creerOverlay({ racine, format = 'bloc', carte = null, langue = 'fr', mesurer }) {
  const f = FORMATS.includes(format) ? format : 'bloc';
  const t = TEXTES[langue] ?? TEXTES.fr;
  const doc = racine.ownerDocument;
  let cle = null;
  /** Ce qui change chaque seconde sans tout reconstruire. */
  let dynamiques = [];

  const el = (balise, classe, valeur, max) => element(balise, classe, valeur, max);
  const svg = (balise, classe, attributs = {}) => {
    const n = doc.createElementNS(SVG, balise);
    if (classe) n.setAttribute('class', classe);
    for (const [k, v] of Object.entries(attributs)) n.setAttribute(k, String(v));
    return n;
  };
  const px = (n) => `${n}px`;
  const placer = (n, gauche, haut) => {
    n.style.left = px(gauche);
    n.style.top = px(haut);
    return n;
  };

  // ─── Morceaux communs ────────────────────────────────────────────────────────

  function nom(texte, cadre, classe = '') {
    const r = ajuster(texte, mesurer, cadre);
    const bloc = el('div', `nom ${classe}`.trim());
    bloc.style.fontSize = px(r.taille);
    for (const ligne of r.lignes) bloc.append(el('span', null, ligne, 40));
    return bloc;
  }

  const mention = (vue) => el('div', 'source', t.mention(vue.source), 200);

  function entete(gauche, droite, classeGauche = 'clair', classeDroite = 'doux') {
    const e = el('div', 'entete');
    e.append(el('div', classeGauche, gauche ?? '', 80), el('div', classeDroite, droite ?? '', 80));
    return e;
  }

  function piste(classe, part) {
    const p = el('div', `piste ${classe}`);
    const i = el('i');
    p.append(i);
    dynamiques.push((vue) => {
      i.style.width = `${Math.max(0, Math.min(100, part(vue) * 100)).toFixed(1)}%`;
    });
    return p;
  }

  function minuteur(classe) {
    const m = el('div', `chrono ${classe}`, '0:00');
    dynamiques.push((vue) => {
      // Après la fermeture, le chrono reste à 0:00 (le temps restant est celui de l'état suivant).
      m.textContent = chrono(vue.phase === 'ouvert' ? vue.restantMs : 0);
      m.classList.toggle('fige', vue.phase !== 'ouvert');
    });
    return m;
  }

  const partRestante = (vue) => (vue.phase === 'ouvert' && vue.dureeMs ? vue.restantMs / vue.dureeMs : 0);
  const etiquettePic = (c) => `${t.pics(c.pics)} · ${t.nombre(c.effectifPic)} ${t.naissances}`;

  /** `seul` : la carte !prenom, sa courbe sans les réponses de la manche en cours. */
  function graphe(vue, largeur, hauteur, compact, mode, { courbe = vue.manche?.courbe, graduations, seul = false } = {}) {
    const m = seul ? null : vue.manche;
    const g = geometrie({
      largeur,
      hauteur,
      axe: vue.axe,
      compact,
      graduations,
      histogramme: mode === 'vide' || !m ? [] : m.histogramme,
      courbe: mode === 'revele' ? courbe : undefined,
      etiquettePic: courbe ? etiquettePic(courbe) : '',
      meilleurs: mode === 'revele' && m ? m.meilleurs : [],
    });
    const zone = el('div', `graphe${g.revele ? ' revele' : ''}`);
    zone.style.width = px(largeur);
    zone.style.height = px(hauteur);
    for (const b of g.barres) {
      const barre = placer(el('div', 'barre'), b.x, b.y);
      barre.style.width = px(b.l);
      barre.style.height = px(b.h);
      zone.append(barre);
    }
    if (g.revele) {
      const dessin = svg('svg', 'trace', { width: largeur, height: g.basTrace });
      dessin.append(svg('path', 'aire', { d: g.aire }), svg('path', 'courbe', { d: g.trait, pathLength: 1 }));
      for (const p of g.pics) {
        dessin.append(svg('line', 'pointille apparait', { x1: p.x, y1: g.hautEtiquette, x2: p.x, y2: g.basTrace }));
      }
      for (const r of g.reperes) {
        dessin.append(svg('line', 'tige apparait', { x1: r.x, y1: g.basTrace, x2: r.x, y2: r.y }));
      }
      for (const p of g.pics) dessin.append(svg('circle', 'point apparait', { cx: p.x, cy: p.y, r: 11 }));
      zone.append(dessin);
      zone.append(placer(el('div', 'etiquette-pic apparait', g.etiquette.texte, 80), g.etiquette.x, 0));
      for (const r of g.reperes) {
        if (compact) {
          zone.append(placer(el('div', 'rond apparait', String(r.rang)), r.x - 20, r.y - 20));
        } else {
          const pastille = placer(el('div', `pastille apparait${r.aGauche ? ' a-gauche' : ''}`), r.x, r.y - 26);
          pastille.append(el('span', 'rang', String(r.rang)), el('span', 'qui', r.pseudo, PSEUDO_MAX), el('span', 'annee', String(r.annee)));
          zone.append(pastille);
        }
      }
    }
    const axe = placer(el('div', 'axe'), 0, g.basTrace);
    axe.style.width = px(largeur);
    zone.append(axe);
    for (const gr of g.graduations) {
      zone.append(placer(el('div', `graduation${gr.centre ? ' centre' : ''}`, gr.texte), gr.x, g.basTrace + 8));
    }
    if (mode === 'vide') {
      const message = el('div', 'invite', t.repondez(vue.axe.premiere, vue.axe.derniere), 120);
      message.style.width = px(largeur);
      message.style.height = px(g.basTrace);
      zone.append(message);
    }
    return zone;
  }

  /** Les 3 meilleurs, sous le graphique révélé : rang, pseudo, année, écart. */
  function listeEcarts(vue) {
    const liste = el('div', 'liste ecarts');
    for (const [i, m] of (vue.manche?.meilleurs ?? []).entries()) {
      const r = el('div', 'rangee');
      r.append(el('div', 'rond', String(i + 1)), el('div', 'qui', m.pseudo, PSEUDO_MAX), el('div', 'mono', String(m.annee)), el('div', 'mono doux ecart', ecart(m.ecart)));
      liste.append(r);
    }
    return liste;
  }

  /** Gagnants de la manche (points), et classement de la partie ou de la soirée. */
  function listes(vue, { annee = true, colonnes = false } = {}) {
    const gagnants = (vue.manche?.meilleurs ?? []).filter((m) => m.victoire);
    const gauche = el('div', 'liste gagnants');
    gauche.append(el('div', 'libelle', t.gagnants));
    if (gagnants.length === 0) gauche.append(el('div', 'rangee doux', t.aucunGagnant));
    for (const [i, m] of gagnants.entries()) {
      const r = el('div', 'rangee');
      r.append(el('div', 'rond', String(i + 1)), el('div', 'qui', m.pseudo, PSEUDO_MAX));
      if (annee) r.append(el('div', 'mono doux', String(m.annee)));
      r.append(el('div', 'mono accent points', `+${m.points}`));
      gauche.append(r);
    }
    const droite = classement(vue);
    if (!colonnes) {
      const tout = el('div', 'listes');
      tout.append(gauche, droite);
      return tout;
    }
    const grille = el('div', 'listes colonnes');
    grille.append(gauche, droite);
    return grille;
  }

  function classement(vue) {
    const bloc = el('div', 'liste classement');
    bloc.append(el('div', 'libelle', vue.classementDe === 'soiree' ? t.classementSoiree : t.classementPartie));
    for (const [i, c] of vue.classement.entries()) {
      const r = el('div', 'rangee');
      r.append(
        el('div', 'mono doux rang', String(i + 1)),
        el('div', 'qui', c.pseudo, PSEUDO_MAX),
        el('div', 'mono doux victoires', t.victoires(c.victoires)),
        el('div', 'mono total', t.points(c.points)),
      );
      bloc.append(r);
    }
    return bloc;
  }

  const sexe = (vue, classe = '') => el('div', `sexe ${classe}`.trim(), t.sexe(vue.manche.sexe));
  const reponses = (vue, classe = '') => el('div', `nb-reponses ${classe}`.trim(), t.reponses(vue.manche.reponses));
  const titreManche = (vue) => t.manche(vue.manche.numero, vue.manche.total);

  // ─── Format plein : panneau 1792 × 952 ───────────────────────────────────────

  function plein(vue) {
    const p = el('div', 'panneau plein');
    const m = vue.manche;
    p.append(entete(t.titre, m ? titreManche(vue) : '', 'doux', 'clair'));
    const corps = el('div', 'corps');
    const cadre = (etat) => CADRES.plein[etat];
    if (!m) corps.append(accueilOuFin(vue, 'plein'));
    else if (vue.phase === 'annonce') {
      const c = el('div', 'centre');
      c.append(nom(m.nom, cadre('annonce')), sexe(vue, 'grand'));
      corps.append(c);
    } else if (vue.phase === 'scores') {
      const haut = el('div', 'ligne-nom scores');
      const gauche = el('div', 'gauche');
      gauche.append(nom(m.nom, cadre('scores')), sexe(vue));
      haut.append(gauche, el('div', 'puce-pic', etiquettePic(m.courbe), 80));
      corps.append(haut, listes(vue, { colonnes: true }));
    } else {
      const haut = el('div', 'ligne-nom');
      const gauche = el('div', 'gauche');
      gauche.append(nom(m.nom, cadre(vue.phase)), sexe(vue));
      const droite = el('div', 'temps');
      droite.append(minuteur('grand'), piste('epaisse', partRestante), reponses(vue));
      haut.append(gauche, droite);
      corps.append(haut, graphe(vue, 1680, 430, false, vue.phase === 'revelation' ? 'revele' : 'histo'));
    }
    p.append(corps, mention(vue));
    return [p];
  }

  // ─── Format bloc : 720 × 680 en bas à droite ─────────────────────────────────

  function bloc(vue) {
    const p = el('div', 'panneau bloc');
    const m = vue.manche;
    const cadre = (etat) => CADRES.bloc[etat];
    if (!m) {
      p.append(entete(t.titre, ''), accueilOuFin(vue, 'bloc'));
    } else if (vue.phase === 'annonce') {
      p.append(entete(titreManche(vue), ''));
      const c = el('div', 'centre');
      c.append(nom(m.nom, cadre('annonce')), sexe(vue));
      p.append(c);
    } else if (vue.phase === 'ouvert') {
      p.append(entete(titreManche(vue), t.sexe(m.sexe)));
      const haut = el('div', 'ligne-nom h108');
      const droite = el('div', 'temps');
      droite.append(minuteur('moyen'), reponses(vue));
      haut.append(nom(m.nom, cadre('ouvert')), droite);
      const bas = el('div', 'pousse-bas');
      bas.append(graphe(vue, 656, 290, true, 'histo'));
      p.append(haut, piste('fine', partRestante), bas);
    } else if (vue.phase === 'revelation') {
      p.append(entete(titreManche(vue), t.sexe(m.sexe)));
      const haut = el('div', 'ligne-nom h72');
      haut.append(nom(m.nom, cadre('revelation')), reponses(vue));
      p.append(haut, graphe(vue, 656, 232, true, 'revele'), listeEcarts(vue));
    } else {
      p.append(entete(`${m.nom} · ${titreManche(vue)}`, t.pic(t.pics(m.courbe.pics))), listes(vue, { annee: false }));
    }
    p.append(mention(vue));
    return [p];
  }

  // ─── Format deux : carte prénom 600 × 400, carte graphique 960 × 600 ─────────

  function deux(vue) {
    const m = vue.manche;
    const cartes = [];
    if (carte !== 'graphique') {
      const c = el('div', 'panneau carte-a');
      if (!m) {
        c.append(entete(vue.phase === 'fin' ? t.fin : t.titre, ''));
        const centre = el('div', 'centre');
        centre.append(el('div', 'invite-texte', t.accueil, 80));
        c.append(centre);
      } else {
        // 400 px de haut, mention de source comprise (3 lignes) : chrono et pic dans
        // l'en-tête ; le nombre de réponses est sur la carte graphique.
        const e = entete(titreManche(vue), '');
        if (vue.phase === 'ouvert' || vue.phase === 'revelation') e.lastChild.replaceWith(minuteur('entete'));
        else if (vue.phase === 'scores') e.lastChild.replaceWith(el('div', 'puce-pic entete', t.pic(t.pics(m.courbe.pics)), 40));
        c.append(e);
        const centre = el('div', `centre${vue.phase === 'annonce' ? '' : ' a-gauche'}`);
        centre.append(nom(m.nom, CADRES.deux[vue.phase]), sexe(vue, 'moyen'));
        c.append(centre);
        if (vue.phase === 'ouvert') c.append(piste('fine', partRestante));
      }
      c.append(mention(vue));
      cartes.push(c);
    }
    if (carte !== 'prenom' && (m || vue.phase === 'fin' || vue.classement.length > 0)) {
      const c = el('div', 'panneau carte-b');
      if (!m) {
        c.append(classement(vue));
      } else if (vue.phase === 'scores') {
        c.append(listes(vue));
      } else {
        const titre = vue.phase === 'revelation' ? t.parAnnee : vue.phase === 'ouvert' ? t.proposees : '';
        c.append(entete(titre, vue.phase === 'ouvert' ? t.reponses(m.reponses) : '', 'doux', 'clair'));
        const zone = el('div', 'pousse-bas');
        const mode = vue.phase === 'annonce' ? 'vide' : vue.phase === 'revelation' ? 'revele' : 'histo';
        zone.append(graphe(vue, 896, vue.phase === 'revelation' ? 266 : 390, true, mode));
        c.append(zone);
        if (vue.phase === 'revelation') c.append(listeEcarts(vue));
      }
      c.append(mention(vue));
      cartes.push(c);
    }
    return cartes;
  }

  /** Accueil (titre, `!prenom`, classement de la soirée) ou fin de partie (classement). */
  function accueilOuFin(vue, variante) {
    const c = el('div', `accueil ${variante}`);
    c.append(el('div', 'grand-titre', vue.phase === 'fin' ? t.fin : t.titre, 80));
    if (vue.phase !== 'fin') c.append(el('div', 'invite-texte', t.accueil, 80));
    if (vue.classement.length > 0) c.append(classement(vue));
    return c;
  }

  // ─── Carte !prenom : 640 de large, en bas à gauche ───────────────────────────

  function cartePrenom(vue) {
    const d = vue.carte;
    const c = el('div', 'panneau carte-prenom');
    const haut = el('div', 'haut');
    haut.append(el('span', 'commande', langue === 'en' ? '!name' : '!prenom'), el('span', 'demande', t.demandePar(d.demandePar), 60));
    c.append(haut, piste('fine', (v) => (v.carte ? v.carte.restantMs / 8000 : 0)));
    c.append(nom(d.nom, CADRES.carte.prenom), el('div', 'sexe', t.sexe(d.sexe)));
    const graduations = [1900, 1960, 2020].filter((a) => a >= vue.axe.premiere && a <= vue.axe.derniere);
    c.append(graphe(vue, 576, 180, true, 'revele', { courbe: d.courbe, graduations, seul: true }));
    c.append(mention(vue));
    return c;
  }

  // ─── Rendu ───────────────────────────────────────────────────────────────────

  function rendre(vue) {
    const m = vue.manche;
    const nouvelle = JSON.stringify([
      vue.phase, langue, vue.source, m && [m.numero, m.total, m.nom, m.sexe, m.reponses, m.histogramme, m.meilleurs, Boolean(m.courbe)],
      vue.classement, vue.classementDe, vue.carte && [vue.carte.nom, vue.carte.demandePar],
    ]);
    if (nouvelle !== cle) {
      cle = nouvelle;
      dynamiques = [];
      const morceaux = f === 'plein' ? plein(vue) : f === 'deux' ? deux(vue) : bloc(vue);
      // La carte !prenom ne va que sur une source : celle du graphique en format deux.
      if (vue.carte && !(f === 'deux' && carte === 'prenom')) morceaux.push(cartePrenom(vue));
      racine.dataset.format = f;
      racine.dataset.phase = vue.phase;
      remplacer(racine, ...morceaux);
    }
    for (const maj of dynamiques) maj(vue);
  }

  return { rendre };
}
