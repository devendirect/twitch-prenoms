import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { chargerDonnees, ErreurDonnees, lireDonnees } from '../src/donnees.js';
import { donneesExtrait, fichierExtrait } from './aide.js';

describe('donnees : chargement', () => {
  const d = donneesExtrait();

  it('retrouve les courbes réelles', () => {
    expect(d.prenoms).toHaveLength(10);
    expect([d.premiereAnnee, d.derniereAnnee]).toEqual([1900, 2025]);
    expect(d.source.edition).toBe(2026);
    expect(d.get('CAMILLE', 'F')).toMatchObject({ nom: 'Camille', pics: [1998], effectifPic: 7455, total: 209_870 });
    expect(d.get('MARIE-CHRISTINE', 'F')?.anneesPresentes).toBe(88);
    expect(d.get('EMMA', 'F')?.pics).toEqual([2005, 2006]);
  });

  const casse = (modifier: (f: ReturnType<typeof fichierExtrait>) => void) => {
    const f = fichierExtrait();
    modifier(f);
    return () => lireDonnees(f);
  };

  it.each([
    ['source absente', (f: any) => delete f.source, /source/],
    ['années inversées', (f: any) => (f.derniereAnnee = 1800), /années de début et de fin/],
    ['aucun prénom', (f: any) => (f.prenoms = []), /aucun prénom/],
    ['sexe inconnu', (f: any) => (f.prenoms[0].s = 'X'), /sexe/],
    ['effectif négatif', (f: any) => (f.prenoms[0].e[0] = -5), /courbe invalide/],
    ['courbe après 2025', (f: any) => f.prenoms[0].e.push(5), /hors de 1900-2025/],
    ['total modifié', (f: any) => (f.prenoms[0].t += 5), /incohérentes/],
    ['pic modifié', (f: any) => (f.prenoms[0].k = [1950]), /incohérentes/],
  ])('refuse : %s', (_, modifier, attendu) => {
    expect(casse(modifier)).toThrow(ErreurDonnees);
    expect(casse(modifier)).toThrow(attendu);
  });

  it('fichier illisible : erreur qui dit quoi faire', () => {
    expect(() => chargerDonnees(new URL('./fixtures/absent.json', import.meta.url))).toThrow(/npm run preparer/);
  });
});

describe('donnees : recherche de !prenom', () => {
  const d = donneesExtrait();
  const trouve = (texte: string) => {
    const r = d.chercher(texte);
    return r.type === 'trouve' ? [r.prenom.prenom, r.prenom.sexe, r.autres] : r.type;
  };

  it('« kevin », « KEVIN » et « Kévin » trouvent les bonnes lignes', () => {
    expect(trouve('kevin')).toEqual(['KEVIN', 'M', ['Kévin']]);
    expect(trouve('KEVIN')).toEqual(['KEVIN', 'M', ['Kévin']]);
    expect(trouve('Kévin')).toEqual(['KÉVIN', 'M', ['Kevin']]);
  });

  it('sans la forme exacte, la forme sans accents la plus fréquente', () => {
    expect(trouve('Kèvin')).toEqual(['KEVIN', 'M', ['Kévin']]);
    expect(trouve('leo')).toEqual(['LÉO', 'M', []]);
  });

  it('entre les deux sexes, le plus fréquent', () => {
    expect(trouve('camille')).toEqual(['CAMILLE', 'F', []]);
  });

  it('tirets, apostrophes (droite ou typographique) et espaces', () => {
    expect(trouve('jean-baptiste')).toEqual(['JEAN-BAPTISTE', 'M', []]);
    expect(trouve("n'golo")).toEqual(["N'GOLO", 'M', []]);
    expect(trouve('N’Golo')).toEqual(["N'GOLO", 'M', []]);
    expect(trouve('  m   barka ')).toEqual(['M BARKA', 'F', []]);
  });

  it('prénom absent du fichier', () => {
    expect(trouve('Zorglub')).toBe('inconnu');
  });

  it.each([
    ['/ban alice'],
    ['.timeout bob'],
    ['<img src=x>'],
    ['a'.repeat(200)],
    ['a'.repeat(31)],
    [`Kevin${String.fromCharCode(0x202e)}`],
    ['1987'],
    ['-'],
    [''],
  ])('refuse sans chercher : %j', (texte) => {
    expect(d.chercher(texte)).toEqual({ type: 'invalide' });
  });

  it('30 caractères passent', () => {
    expect(d.chercher('a'.repeat(30))).toEqual({ type: 'inconnu' });
  });
});

const PRENOMS_JSON = new URL('../data/prenoms.json', import.meta.url);
describe.skipIf(!existsSync(PRENOMS_JSON))('fichier préparé (data/prenoms.json)', () => {
  it('se charge en entier', () => {
    const d = chargerDonnees(PRENOMS_JSON);
    expect(d.prenoms).toHaveLength(52_340);
    expect(d.chercher('kevin')).toMatchObject({ type: 'trouve', prenom: { prenom: 'KEVIN', pics: [1991] } });
  });
});
