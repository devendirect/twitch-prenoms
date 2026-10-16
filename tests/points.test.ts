import { describe, expect, it } from 'vitest';
import { classer, ecartSigne, pointsPourEcart } from '../src/points.js';

describe('points (BRIEF.md, section 4)', () => {
  it.each([
    [0, 100],
    [1, 60],
    [2, 60],
    [3, 30],
    [5, 30],
    [6, 10],
    [10, 10],
    [11, 0],
    [80, 0],
  ])('écart de %i an(s) : %i points', (ecart, points) => {
    expect(pointsPourEcart(ecart)).toBe(points);
  });

  it('écart signé, à la plus proche des années du pic', () => {
    expect(ecartSigne(1999, [1998])).toBe(1);
    expect(ecartSigne(1996, [1998])).toBe(-2);
    // Emma : 2005 et 2006 à égalité (données réelles).
    expect(ecartSigne(2006, [2005, 2006])).toBe(0);
    expect(ecartSigne(2008, [2005, 2006])).toBe(2);
    expect(ecartSigne(2003, [2005, 2006])).toBe(-2);
    // Christian : 1949 et 1955 ; à égale distance, le premier pic.
    expect(ecartSigne(1952, [1949, 1955])).toBe(3);
  });

  it('classe du plus proche au plus loin ; seul le plus proche gagne', () => {
    const r = classer([
      { qui: 'a', annee: 2000 },
      { qui: 'c', annee: 1990 },
      { qui: 'd', annee: 1999 },
    ], [1998]);
    expect(r.map((x) => [x.reponse.qui, x.ecart, x.points, x.victoire])).toEqual([
      ['d', 1, 60, true],
      ['a', 2, 60, false],
      ['c', -8, 10, false],
    ]);
  });

  it('deux joueurs au même écart gagnent tous les deux, dans l’ordre reçu', () => {
    const r = classer([
      { qui: 'a', annee: 2000 },
      { qui: 'b', annee: 1996 },
      { qui: 'c', annee: 1990 },
    ], [1998]);
    expect(r.map((x) => [x.reponse.qui, x.ecart, x.victoire])).toEqual([
      ['a', 2, true],
      ['b', -2, true],
      ['c', -8, false],
    ]);
  });

  it('victoire seulement à 10 points au moins', () => {
    expect(classer([{ annee: 1988 }], [1998])[0]).toMatchObject({ points: 10, victoire: true });
    expect(classer([{ annee: 1987 }, { annee: 2020 }], [1998]).map((x) => x.victoire)).toEqual([false, false]);
  });

  it('personne ne répond : aucun gagnant', () => {
    expect(classer([], [1998])).toEqual([]);
  });
});
