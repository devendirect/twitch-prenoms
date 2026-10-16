// @vitest-environment jsdom
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/**
 * L'overlay dans un DOM (jsdom), sur des vues bâties avec l'extrait réel du fichier
 * Insee. BRIEF.md, section 9 : mention de source dans chaque état et chaque format,
 * aucun texte sous 28 px, rien du chat interprété comme du HTML.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { geometrie } from '../public/js/graphe.js';
import { creerOverlay } from '../public/js/overlay.js';
import { TEXTES, chrono, ecart } from '../public/js/textes.js';
import { histogramme } from '../src/manche.js';
import type { VuePrenoms } from '../src/jeu.js';
import { donneesExtrait } from './aide.js';

const d = donneesExtrait();
const CAMILLE = d.get('CAMILLE', 'F')!;
const EMMA = d.get('EMMA', 'F')!;
const courbe = (p: typeof CAMILLE) => ({ debut: p.debut, effectifs: p.effectifs, pics: p.pics, effectifPic: p.effectifPic });
const PIEGE = '<img src=x onerror=alert(1)>';
const LONG = 'MarieAntoinetteDuDimancheEtDuLundi';

type Phase = VuePrenoms['phase'];
const PHASES: Phase[] = ['attente', 'annonce', 'ouvert', 'revelation', 'scores', 'fin'];

/** Une vue comme la diffuse `jeu.ts`, pour Camille (pic réel 1998). */
function vue(phase: Phase, prenom = CAMILLE): VuePrenoms {
  const reponses = [{ annee: 1998 }, { annee: 1996 }, { annee: 1950 }];
  const manche = phase === 'attente' || phase === 'fin' ? null : {
    numero: 3,
    total: 10,
    nom: prenom.nom,
    sexe: prenom.sexe,
    reponses: reponses.length,
    histogramme: histogramme(reponses, d.premiereAnnee, d.derniereAnnee),
    courbe: phase === 'revelation' || phase === 'scores' ? courbe(prenom) : null,
    meilleurs: phase === 'revelation' || phase === 'scores'
      ? [
          { pseudo: PIEGE, annee: 1998, ecart: 0, points: 100, victoire: true },
          { pseudo: LONG, annee: 1996, ecart: -2, points: 60, victoire: false },
        ]
      : [],
  };
  const classementDe = phase === 'attente' ? 'soiree' : phase === 'scores' || phase === 'fin' ? 'partie' : null;
  return {
    phase,
    source: d.source,
    axe: { premiere: d.premiereAnnee, derniere: d.derniereAnnee },
    restantMs: 18_000,
    dureeMs: 30_000,
    manche,
    classement: classementDe ? [{ pseudo: PIEGE, points: 100, victoires: 1 }, { pseudo: LONG, points: 60, victoires: 0 }] : [],
    classementDe,
    carte: null,
  };
}

/** Chaque lettre fait 58 px à 100 px (jsdom n'a pas de canvas). */
const mesurer = (texte: string) => [...texte].length * 58;

let racine: HTMLElement;
beforeEach(() => {
  document.body.replaceChildren();
  racine = document.createElement('div');
  document.body.append(racine);
});
const monter = (format: string, carte: string | null = null, langue = 'fr') => creerOverlay({ racine, format, carte, langue, mesurer });

const MENTION_FR = 'Source : Insee, Fichier des prénoms (édition 2026) · Licence Ouverte 2.0 · effectifs arrondis à 5';

describe('mention de source (BRIEF.md, section 5)', () => {
  const cas = PHASES.flatMap((phase) =>
    [['plein', null], ['bloc', null], ['deux', 'prenom'], ['deux', 'graphique'], ['deux', null]].map(([f, c]) => [phase, f, c] as const),
  );

  it.each(cas)('%s, format %s, carte %s : chaque panneau la porte', (phase, format, carte) => {
    monter(format!, carte).rendre(vue(phase));
    const panneaux = [...racine.querySelectorAll('.panneau')];
    if (format === 'deux' && carte === 'graphique' && phase === 'annonce') expect(panneaux).toHaveLength(1);
    for (const p of panneaux) expect(p.querySelector('.source')?.textContent).toBe(MENTION_FR);
    // Un format seul montre toujours au moins un panneau, sauf la carte graphique à l'accueil sans classement.
    expect(panneaux.length).toBeGreaterThan(0);
  });

  it('la carte !prenom aussi, et en anglais', () => {
    const v = { ...vue('scores'), carte: { nom: 'Emma', sexe: 'F' as const, demandePar: 'Pixel_Lapin', courbe: courbe(EMMA), restantMs: 4000 } };
    monter('bloc', null, 'en').rendre(v);
    const carte = racine.querySelector('.carte-prenom')!;
    expect(carte.querySelector('.source')?.textContent).toBe('Source: Insee, Fichier des prénoms (2026 edition) · Licence Ouverte 2.0 · counts rounded to 5');
    // Pics à égalité (arrondi à 5) : les deux années.
    expect(carte.querySelector('.etiquette-pic')?.textContent).toBe('2005 and 2006 · 7,075 births');
  });
});

describe('ce qui vient du chat reste du texte', () => {
  it('un pseudo en HTML ne crée aucun élément', () => {
    for (const phase of ['revelation', 'scores'] as const) {
      for (const format of ['plein', 'bloc', 'deux']) {
        monter(format).rendre(vue(phase));
        expect(racine.querySelector('img')).toBeNull();
        // Coupé à 25 caractères, mais en texte : « <img src=x onerror=alert… ».
        expect(racine.textContent).toContain(PIEGE.slice(0, 24));
      }
    }
  });

  it('un pseudo long est coupé à 25 caractères', () => {
    monter('plein').rendre(vue('scores'));
    expect(racine.textContent).toContain('MarieAntoinetteDuDimanch…');
    expect(racine.textContent).not.toContain(LONG);
  });
});

describe('états', () => {
  it('la courbe n’existe pas avant la révélation', () => {
    monter('bloc').rendre(vue('ouvert'));
    expect(racine.querySelector('path.courbe')).toBeNull();
    expect(racine.querySelectorAll('.barre')).toHaveLength(13);
    monter('bloc').rendre(vue('revelation'));
    expect(racine.querySelector('path.courbe')).not.toBeNull();
    // Séparateur des milliers en français : espace fine insécable (U+202F).
    expect(racine.querySelector('.etiquette-pic')?.textContent).toBe(`1998 · 7${String.fromCharCode(0x202f)}455 naissances`);
  });

  it('chrono et barre de temps suivent la vue sans reconstruire la page', () => {
    const o = monter('bloc');
    o.rendre(vue('ouvert'));
    const chronoAvant = racine.querySelector('.chrono')!;
    expect(chronoAvant.textContent).toBe('0:18');
    expect((racine.querySelector('.piste i') as HTMLElement).style.width).toBe('60%');
    o.rendre({ ...vue('ouvert'), restantMs: 3_000 });
    expect(racine.querySelector('.chrono')).toBe(chronoAvant);
    expect(chronoAvant.textContent).toBe('0:03');
  });

  it('après la fermeture, le chrono reste à 0:00', () => {
    monter('plein').rendre(vue('revelation'));
    expect(racine.querySelector('.chrono')?.textContent).toBe('0:00');
  });

  it('gagnants : seulement ceux qui ont gagné ; classement avec victoires et points', () => {
    monter('bloc').rendre(vue('scores'));
    const gagnants = racine.querySelectorAll('.gagnants .rangee');
    expect(gagnants).toHaveLength(1);
    expect(racine.querySelector('.classement')?.textContent).toContain('1 victoire');
    expect(racine.querySelector('.classement')?.textContent).toContain('100 pts');
  });

  it('format inconnu : bloc', () => {
    monter('geant').rendre(vue('ouvert'));
    expect(racine.querySelector('.panneau.bloc')).not.toBeNull();
  });

  it('la carte !prenom montre sa courbe seule, sans les réponses de la manche', () => {
    const v = { ...vue('revelation'), carte: { nom: 'Emma', sexe: 'F' as const, demandePar: 'x', courbe: courbe(EMMA), restantMs: 4000 } };
    monter('bloc').rendre(v);
    const carte = racine.querySelector('.carte-prenom')!;
    expect(carte.querySelector('path.courbe')).not.toBeNull();
    expect(carte.querySelectorAll('.barre, .rond, .pastille')).toHaveLength(0);
  });

  it('format deux, carte prenom : jamais la carte !prenom (elle va sur la source graphique)', () => {
    const v = { ...vue('scores'), carte: { nom: 'Emma', sexe: 'F' as const, demandePar: 'x', courbe: courbe(EMMA), restantMs: 4000 } };
    monter('deux', 'prenom').rendre(v);
    expect(racine.querySelector('.carte-prenom')).toBeNull();
    monter('deux', 'graphique').rendre(v);
    expect(racine.querySelector('.carte-prenom')).not.toBeNull();
  });
});

describe('aucun texte sous 28 px', () => {
  it('overlay.css', () => {
    const css = readFileSync('public/css/overlay.css', 'utf8');
    const tailles = [...css.matchAll(/font-size:\s*(\d+)px/g)].map((m) => Number(m[1]));
    expect(tailles.length).toBeGreaterThan(10);
    expect(Math.min(...tailles)).toBeGreaterThanOrEqual(28);
  });

  it('prénoms : la taille calculée est appliquée', () => {
    monter('bloc').rendre(vue('annonce'));
    expect((racine.querySelector('.nom') as HTMLElement).style.fontSize).toBe('120px');
  });
});

describe('textes et géométrie', () => {
  it('mêmes clés en français et en anglais', () => {
    expect(Object.keys(TEXTES.en).sort()).toEqual(Object.keys(TEXTES.fr).sort());
  });

  it('écart et chrono', () => {
    expect([ecart(0), ecart(1), ecart(-2)]).toEqual(['±0', '+1', '−2']);
    expect([chrono(18_000), chrono(17_001), chrono(0), chrono(-5)]).toEqual(['0:18', '0:18', '0:00', '0:00']);
  });

  it('axe 1900 → 2025 : 1900 à gauche, 2025 au bout, pic au milieu de son année', () => {
    const g: any = geometrie({ largeur: 1260, hauteur: 400, axe: { premiere: 1900, derniere: 2025 }, compact: false, courbe: courbe(CAMILLE), etiquettePic: 'x' });
    expect(g.graduations[0]).toEqual({ x: 0, texte: '1900', centre: false });
    expect(g.graduations.at(-1)?.texte).toBe('2020');
    expect(g.pics[0]!.x).toBeCloseTo(((1998.5 - 1900) / 126) * 1260);
  });

  it('graduations compactes qui se toucheraient : la seconde est omise', () => {
    const g = geometrie({ largeur: 656, hauteur: 290, axe: { premiere: 1900, derniere: 2025 }, compact: true });
    expect(g.graduations.map((x) => x.texte)).toEqual(['1900', '1940', '1960', '1980', '2000', '2020']);
  });

  it('étiquette du pic gardée dans le cadre', () => {
    const tard = { ...courbe(CAMILLE), pics: [2025] };
    const g: any = geometrie({ largeur: 576, hauteur: 180, axe: { premiere: 1900, derniere: 2025 }, compact: true, courbe: tard, etiquettePic: '2025 · 4 660 naissances' });
    expect(g.etiquette.x + 23 * 16.8 + 32).toBeLessThanOrEqual(576 + 0.01);
  });
});
