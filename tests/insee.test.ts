import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  EDITION, ENTETE, ErreurInsee, casseNormale, cle, juger, lireCsv, lireExclus, preparer, regrouper,
  type LigneInsee, type Prenom,
} from '../src/insee.js';
import { extraireZip } from '../src/zip.js';

// Extrait du vrai fichier (édition 2026), toutes les années de 10 couples, CRLF compris.
const EXTRAIT = readFileSync(new URL('./fixtures/extrait-insee.csv', import.meta.url), 'utf8');
const CRLF = String.fromCharCode(13, 10);

describe('lireCsv : format constaté', () => {
  it("lit l'extrait réel", () => {
    const lignes = lireCsv(EXTRAIT);
    expect(lignes).toHaveLength(848);
    expect(lignes).toContainEqual({ sexe: 'F', prenom: 'CAMILLE', annee: 1998, valeur: 7455 });
    expect(lignes).toContainEqual({ sexe: 'M', prenom: "N'GOLO", annee: 2025, valeur: 5 });
  });

  const avec = (...lignes: string[]) => [ENTETE, ...lignes].join(CRLF) + CRLF;
  const erreur = (texte: string) => {
    try {
      lireCsv(texte);
    } catch (e) {
      expect(e).toBeInstanceOf(ErreurInsee);
      return (e as Error).message;
    }
    throw new Error('aucune erreur levée');
  };

  it('accepte une ligne normale', () => {
    expect(lireCsv(avec('2;MARIE-CHRISTINE;1957;4755;12'))).toEqual([{ sexe: 'F', prenom: 'MARIE-CHRISTINE', annee: 1957, valeur: 4755 }]);
  });

  it.each([
    ['BOM', String.fromCharCode(0xfeff) + avec('1;LÉO;2019;4660;3'), /ligne 1 : BOM/],
    ['en-tête différent', ['SEXE;PRENOM;PERIODE;VALEUR;RANG', '1;LÉO;2019;4660;3'].join(CRLF), /ligne 1 : en-tête/],
    ['quatre colonnes', avec('1;LÉO;2019;4660'), /ligne 2 : 4 colonnes/],
    ['sexe 3', avec('3;LÉO;2019;4660;3'), /ligne 2 : sexe/],
    ['prénom en minuscules', avec('1;Léo;2019;4660;3'), /ligne 2 : prénom/],
    ['prénom avec chiffre', avec('1;LÉO2;2019;4660;3'), /ligne 2 : prénom/],
    ['tiret final', avec('1;JEAN-;2019;5;3'), /ligne 2 : prénom/],
    ['ligne « prénoms rares »', avec('1;_PRENOMS_RARES;2019;5;3'), /ligne 2 : prénom/],
    ['accent décomposé (NFD)', avec(`1;LE${String.fromCharCode(0x301)}O;2019;5;3`), /ligne 2 : prénom/],
    ['année XXXX', avec('1;LÉO;XXXX;5;3'), /ligne 2 : année/],
    ['effectif non multiple de 5', avec('1;LÉO;2019;4661;3'), /ligne 2 : effectif/],
    ['effectif nul', avec('1;LÉO;2019;0;3'), /ligne 2 : effectif/],
    ['effectif vide', avec('1;LÉO;2019;;3'), /ligne 2 : effectif/],
    ['rang absent', avec('1;LÉO;2019;5;'), /ligne 2 : rang/],
    ['erreur plus bas', avec('1;LÉO;2019;5;3', '1;LÉO;2020;7;3'), /ligne 3 : effectif/],
  ])('refuse : %s', (_, texte, attendu) => {
    expect(erreur(texte)).toMatch(attendu);
  });
});

describe('regrouper : courbes réelles (BRIEF.md, section 5)', () => {
  const prenoms = regrouper(lireCsv(EXTRAIT));
  const p = (prenom: string, sexe: 'M' | 'F') => prenoms.get(cle(prenom, sexe))!;

  it.each([
    ['CAMILLE', 'F', 1998, 7455, 209870],
    ['CAMILLE', 'M', 1910, 1595, 82820],
    ['LÉO', 'M', 2019, 4660, 125760],
    ['MARIE-CHRISTINE', 'F', 1957, 4755, 75605],
    ['JEAN-BAPTISTE', 'M', 1991, 1440, 49215],
    ['KEVIN', 'M', 1991, 13255, 152655],
    ['KÉVIN', 'M', 1996, 1200, 14560],
  ] as const)('%s (%s) : pic %i, %i naissances, total %i', (prenom, sexe, pic, effectif, total) => {
    const x = p(prenom, sexe);
    expect(x.pics).toEqual([pic]);
    expect(x.effectifPic).toBe(effectif);
    expect(x.total).toBe(total);
  });

  it('remplit par 0 les années absentes du fichier', () => {
    const x = p('MARIE-CHRISTINE', 'F');
    expect(x.anneesPresentes).toBe(88);
    expect(x.effectifs.filter((v) => v > 0)).toHaveLength(88);
    expect(x.effectifs.length).toBeGreaterThan(88);
    expect(x.effectifs[0]).toBeGreaterThan(0);
    expect(x.effectifs.at(-1)).toBeGreaterThan(0);
    expect(x.effectifs[1957 - x.debut]).toBe(4755);
  });

  it("garde les deux années quand l'arrondi crée une égalité au pic", () => {
    expect(p('EMMA', 'F').pics).toEqual([2005, 2006]);
  });

  it('refuse un doublon (prénom, sexe, année)', () => {
    const l: LigneInsee = { sexe: 'M', prenom: 'LÉO', annee: 2019, valeur: 5 };
    expect(() => regrouper([l, { ...l }])).toThrow(/ligne 3 : doublon LÉO/);
  });

  it('casse normale', () => {
    expect(p('JEAN-BAPTISTE', 'M').nom).toBe('Jean-Baptiste');
    expect(p("N'GOLO", 'M').nom).toBe("N'Golo");
    expect(p('M BARKA', 'F').nom).toBe('M Barka');
    expect(p('LÉO', 'M').nom).toBe('Léo');
    expect(casseNormale('MARIE-THÉRÈSE')).toBe('Marie-Thérèse');
    expect(casseNormale('ÉLODIE')).toBe('Élodie');
  });
});

describe('juger : prénoms jouables', () => {
  const { prenoms, verdicts } = preparer(EXTRAIT, new Set());
  const v = (prenom: string, sexe: 'M' | 'F') => verdicts.get(cle(prenom, sexe));

  it("sur l'extrait réel", () => {
    expect(v('CAMILLE', 'F')).toEqual({ jouable: true, niveau: 'facile' });
    expect(v('CAMILLE', 'M')).toEqual({ jouable: false, raison: 'sexe-minoritaire' });
    expect(v('LÉO', 'M')).toEqual({ jouable: true, niveau: 'moyen' });
    expect(v('JEAN-BAPTISTE', 'M')).toEqual({ jouable: true, niveau: 'difficile' });
    expect(v('KÉVIN', 'M')).toEqual({ jouable: false, raison: 'total' });
    expect(v('EMMA', 'F')?.jouable).toBe(true);
    expect(prenoms.size).toBe(10);
  });

  // Courbes fabriquées : on teste les bornes des règles, rien de tout ça ne s'affiche.
  const fabrique = (o: Partial<Prenom>): Prenom => ({
    prenom: 'TEST', nom: 'Test', sexe: 'F', debut: 1900, effectifs: [], total: 100_000,
    pics: [1950], effectifPic: 10_000, anneesPresentes: 100, ...o,
  });

  it('bornes du total et des niveaux', () => {
    expect(juger(fabrique({ total: 19_995, effectifPic: 5_000 }), 0, new Set())).toEqual({ jouable: false, raison: 'total' });
    expect(juger(fabrique({ total: 20_000, effectifPic: 5_000 }), 0, new Set())).toEqual({ jouable: true, niveau: 'difficile' });
    expect(juger(fabrique({ total: 50_000 }), 0, new Set())).toEqual({ jouable: true, niveau: 'moyen' });
    expect(juger(fabrique({ total: 200_000, effectifPic: 10_000 }), 0, new Set())).toEqual({ jouable: true, niveau: 'facile' });
  });

  it('vrai pic : au moins 3 fois la moyenne des années présentes', () => {
    // Moyenne 100 000 / 100 = 1 000.
    expect(juger(fabrique({ effectifPic: 3_000 }), 0, new Set())).toEqual({ jouable: true, niveau: 'moyen' });
    expect(juger(fabrique({ effectifPic: 2_995 }), 0, new Set())).toEqual({ jouable: false, raison: 'pic-plat' });
  });

  it('sexe majoritaire, une lettre, exclus', () => {
    expect(juger(fabrique({}), 100_005, new Set())).toEqual({ jouable: false, raison: 'sexe-minoritaire' });
    expect(juger(fabrique({ prenom: 'Ô' }), 0, new Set())).toEqual({ jouable: false, raison: 'une-lettre' });
    expect(juger(fabrique({}), 0, new Set(['TEST']))).toEqual({ jouable: false, raison: 'exclu' });
  });

  it('exclus.txt : casse ignorée, accent gardé, commentaires', () => {
    const exclus = lireExclus(['# commentaire', '', '  kévin ', 'Jean-Baptiste'].join(CRLF));
    expect([...exclus]).toEqual(['KÉVIN', 'JEAN-BAPTISTE']);
    const r = preparer(EXTRAIT, exclus);
    expect(r.verdicts.get(cle('JEAN-BAPTISTE', 'M'))).toEqual({ jouable: false, raison: 'exclu' });
    expect(r.verdicts.get(cle('KEVIN', 'M'))?.jouable).toBe(true);
  });
});

// Le vrai fichier n'est pas versionné : ce test ne tourne qu'après « npm run preparer ».
const ZIP = new URL(`../data/brut/${EDITION.zip.split('/').at(-1)}`, import.meta.url);
describe.skipIf(!existsSync(ZIP))('fichier complet (data/brut)', () => {
  it('empreinte, années et nombre de jouables du brief', () => {
    const zip = readFileSync(ZIP);
    expect(createHash('sha256').update(zip).digest('hex')).toBe(EDITION.sha256);
    const r = preparer(extraireZip(zip, EDITION.csv).toString('utf8'), new Set());
    expect([r.premiereAnnee, r.derniereAnnee]).toEqual([1900, 2025]);
    expect(r.prenoms.size).toBe(52_340);
    const jouables = [...r.verdicts.values()].filter((v) => v.jouable);
    expect(jouables).toHaveLength(527);
  });
});
