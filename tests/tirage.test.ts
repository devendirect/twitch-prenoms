import { existsSync } from 'node:fs';
import { mulberry32 } from 'socle';
import { describe, expect, it } from 'vitest';
import { chargerDonnees } from '../src/donnees.js';
import { REGLES } from '../src/insee.js';
import { jouables, Tirage } from '../src/tirage.js';
import { donneesExtrait } from './aide.js';

describe('tirage', () => {
  const d = donneesExtrait();
  const liste = jouables(d, new Set());
  const noms = (l: { prenom: { prenom: string; sexe: string } }[]) => l.map((j) => `${j.prenom.prenom} ${j.prenom.sexe}`).sort();

  it("sur l'extrait réel : seuils, sexe majoritaire, vrai pic", () => {
    expect(noms(liste)).not.toContain('CAMILLE M');
    expect(noms(liste)).not.toContain('KÉVIN M');
    for (const { prenom } of liste) {
      expect(prenom.total).toBeGreaterThanOrEqual(REGLES.totalMin);
      expect(prenom.effectifPic).toBeGreaterThanOrEqual(REGLES.facteurPic * (prenom.total / prenom.anneesPresentes));
    }
    expect(liste.find((j) => j.prenom.prenom === 'CAMILLE')?.niveau).toBe('facile');
    expect(liste.find((j) => j.prenom.prenom === 'LÉO')?.niveau).toBe('moyen');
    expect(liste.find((j) => j.prenom.prenom === 'JEAN-BAPTISTE')?.niveau).toBe('difficile');
  });

  it("un prénom d'exclus.txt n'est jamais tiré", () => {
    const sans = jouables(d, new Set(['KEVIN']));
    expect(noms(sans)).toEqual(noms(liste).filter((n) => n !== 'KEVIN M'));
    const t = new Tirage(sans, mulberry32(1));
    // Boucle bornée : tout tirer, et rien de plus.
    for (let i = 0; i < sans.length; i++) expect(t.tirer('facile')?.prenom).not.toBe('KEVIN');
    expect(t.tirer('facile')).toBeNull();
  });

  it('pas de doublon dans une soirée, puis tirage épuisé', () => {
    const t = new Tirage(liste, mulberry32(7));
    const tires: string[] = [];
    for (let i = 0; i < liste.length; i++) tires.push(t.tirer(i % 2 ? 'facile' : 'difficile')!.prenom);
    expect(new Set(tires).size).toBe(liste.length);
    expect(t.restants).toBe(0);
    expect(t.tirer('moyen')).toBeNull();
  });

  it('niveau épuisé : le plus proche', () => {
    const t = new Tirage(liste.filter((j) => j.niveau !== 'difficile'), mulberry32(3));
    const p = t.tirer('difficile')!;
    expect(liste.find((j) => j.prenom === p)?.niveau).toBe('moyen');
  });

  it('une partie de 10 : 4 faciles, 4 moyens, 2 difficiles, mélangés ; même graine, même plan', () => {
    const plan = new Tirage(liste, mulberry32(42)).plan(10);
    const compte = (n: string) => plan.filter((x) => x === n).length;
    expect([compte('facile'), compte('moyen'), compte('difficile')]).toEqual([4, 4, 2]);
    expect(new Tirage(liste, mulberry32(42)).plan(10)).toEqual(plan);
    expect(new Tirage(liste, mulberry32(1)).plan(5)).toHaveLength(5);
  });
});

const PRENOMS_JSON = new URL('../data/prenoms.json', import.meta.url);
describe.skipIf(!existsSync(PRENOMS_JSON))('fichier préparé (data/prenoms.json)', () => {
  it('527 jouables, comme la préparation', () => {
    const liste = jouables(chargerDonnees(PRENOMS_JSON), new Set());
    expect(liste).toHaveLength(527);
    expect(liste.filter((j) => j.niveau === 'facile')).toHaveLength(87);
  });
});
