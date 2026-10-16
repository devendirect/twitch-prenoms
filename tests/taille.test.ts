import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CADRES, ajuster, couper, tailleMinimale } from '../public/js/taille.js';
import { chargerDonnees } from '../src/donnees.js';
import { juger, TAILLE_MIN } from '../src/insee.js';
import { chasses, chassesPrenom, ErreurPolice } from '../src/police.js';
import { mesureurPrenom } from '../src/taille.js';
import { jouables } from '../src/tirage.js';
import { donneesExtrait } from './aide.js';

/** Largeurs à 100 px mesurées dans Chrome (canvas, IBM Plex Sans 700), le 16/10/2026. */
const CHROME: Record<string, number> = {
  Camille: 356,
  Léo: 164.6,
  Inès: 209.4,
  'Jean-Christophe': 784.6,
  'Marie-Françoise': 759.1,
  'Jean-Yves': 484.9,
};

describe('mesure dans la police (src/police.ts)', () => {
  const police = chassesPrenom();

  it.each(Object.entries(CHROME))('%s : à 2 %% près de Chrome (%d)', (nom, chrome) => {
    const mesure = police.mesurer(nom)!;
    expect(Math.abs(mesure - chrome) / chrome).toBeLessThan(0.02);
  });

  it('police variable : la graisse change la chasse (sans HVAR, le gras serait du maigre)', () => {
    const fichier = readFileSync(new URL('../node_modules/socle/public/vendor/fonts/ibm-plex-sans-700-latin.woff2', import.meta.url));
    const maigre = chasses([fichier], 100).mesurer('Camille')!;
    const normal = chasses([fichier], 400).mesurer('Camille')!;
    expect(maigre).toBeLessThan(normal);
    expect(normal).toBeLessThan(police.mesurer('Camille')!);
  });

  it('graisse intermédiaire refusée (avar non appliqué)', () => {
    const fichier = readFileSync(new URL('../node_modules/socle/public/vendor/fonts/ibm-plex-sans-700-latin.woff2', import.meta.url));
    expect(() => chasses([fichier], 600)).toThrow(/graisse 600/);
  });

  it('caractère absent de la police : null', () => {
    expect(police.mesurer('李')).toBeNull();
  });

  it('autre chose qu’une police WOFF2 : erreur', () => {
    expect(() => chasses([Buffer.from('pas une police')], 700)).toThrow(ErreurPolice);
  });
});

describe('taille du prénom (public/js/taille.js)', () => {
  /** Chaque lettre fait 60 px à 100 px. */
  const fixe = (texte: string) => [...texte].length * 60;

  it('coupe au tiret ou à l’espace le plus central', () => {
    expect(couper('Jean-Baptiste')).toEqual(['Jean-', 'Baptiste']);
    expect(couper('M Barka')).toEqual(['M', 'Barka']);
    // 11 caractères au plus d'un côté comme de l'autre : la première coupure.
    expect(couper('Marie-Anne-Sophie')).toEqual(['Marie-', 'Anne-Sophie']);
    expect(couper('Jean-Pierre-Marie-Luc')).toEqual(['Jean-Pierre-', 'Marie-Luc']);
    expect(couper('Léo')).toBeNull();
    expect(couper('-Léo')).toBeNull();
  });

  it('un prénom court prend la taille maximale', () => {
    expect(ajuster('Léo', fixe, [120, 656, 300])).toEqual({ taille: 120, lignes: ['Léo'] });
  });

  it('réduit pour tenir en largeur (espacement des lettres compris)', () => {
    // 10 lettres : (0,60 − 0,02) × 10 = 5,8 px par px de taille ; 400 / 5,8 = 68.
    expect(ajuster('Maximilien', fixe, [120, 400, 300])).toEqual({ taille: 68, lignes: ['Maximilien'] });
  });

  it('réduit pour tenir en hauteur', () => {
    expect(ajuster('Léo', fixe, [120, 656, 72]).taille).toBe(68);
  });

  it('passe sur deux lignes seulement si une ligne tombe sous 62 % du maximum', () => {
    expect(ajuster('Jean-Christophe', fixe, [120, 400, 300]).lignes).toEqual(['Jean-', 'Christophe']);
    expect(ajuster('Jean-Luc', fixe, [120, 656, 300]).lignes).toEqual(['Jean-Luc']);
    // Une ligne à 103 px (86 % du maximum) : on la garde, même si deux lignes donneraient 120.
    expect(ajuster('Jean-Christophe', fixe, [120, 900, 300])).toEqual({ taille: 103, lignes: ['Jean-Christophe'] });
  });

  it('chaque cadre est relevé dans la maquette', () => {
    expect(CADRES.plein.annonce).toEqual([160, 1600, 380]);
    expect(CADRES.bloc.revelation).toEqual([56, 440, 72]);
    expect(CADRES.carte.prenom).toEqual([88, 576, 150]);
  });

  it('taille minimale : le plus petit de tous les cadres', () => {
    const m = tailleMinimale('Jean-Christophe', fixe)!;
    const toutes = Object.values(CADRES).flatMap((etats) => Object.values(etats).map((c) => ajuster('Jean-Christophe', fixe, c as [number, number, number]).taille));
    expect(m.taille).toBe(Math.min(...toutes));
  });
});

describe('aucun prénom sous 28 px (BRIEF.md, section 9)', () => {
  it('un prénom affiché sous 28 px n’est pas jouable', () => {
    const d = donneesExtrait();
    const camille = d.get('CAMILLE', 'F')!;
    expect(juger(camille, 0, new Set(), () => TAILLE_MIN - 1)).toEqual({ jouable: false, raison: 'trop-long' });
    expect(juger(camille, 0, new Set(), () => TAILLE_MIN)).toEqual({ jouable: true, niveau: 'facile' });
    expect(jouables(d, new Set(), () => 27)).toEqual([]);
  });

  it('mesure réelle : Jean-Christophe tient à 53 px au plus petit (bloc, ouvert)', () => {
    expect(mesureurPrenom().detail('Jean-Christophe')).toMatchObject({ taille: 53, format: 'bloc', etat: 'ouvert' });
  });

  const PRENOMS_JSON = new URL('../data/prenoms.json', import.meta.url);
  it.skipIf(!existsSync(PRENOMS_JSON))('fichier préparé : les 527 jouables tiennent tous', () => {
    expect(jouables(chargerDonnees(PRENOMS_JSON), new Set(), mesureurPrenom().taille)).toHaveLength(527);
  });
});
