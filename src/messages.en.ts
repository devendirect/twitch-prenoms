import { pseudo } from 'socle';
import type { Sexe } from './insee.js';
import type { Gagnant, Podium } from './messages.fr.js';

/** Bot texts in English: same keys as `messages.fr.ts` (tested). */

const nombre = (n: number) => n.toLocaleString('en-US');
const sexe = (s: Sexe) => (s === 'F' ? 'girl' : 'boy');
const annees = (pics: readonly number[]) => (pics.length > 1 ? `${pics.slice(0, -1).join(', ')} and ${pics.at(-1)}` : String(pics[0]));
const pluriel = (n: number, mot: string) => `${nombre(n)} ${mot}${n > 1 ? 's' : ''}`;
const record = (p: { nom: string; pics: readonly number[]; effectif: number }) =>
  `${p.nom}: peak in ${annees(p.pics)}, about ${nombre(p.effectif)} births`;

export const messagesEn = {
  aide: () => 'Guess the year this French first name was most given: type it (e.g. 1987). A name’s curve: !name Lea',

  annonce: (p: { numero: number; total: number; nom: string; sexe: Sexe; premiere: number; derniere: number }) => [
    `Round ${p.numero}/${p.total}: ${p.nom} (${sexe(p.sexe)}). In which year was it given the most in France? Type the year, ${p.premiere} to ${p.derniere}!`,
    `Round ${p.numero}/${p.total}: ${p.nom} (${sexe(p.sexe)}). Its peak year? Type it, ${p.premiere} to ${p.derniere}!`,
  ],

  resultat: (p: { nom: string; pics: number[]; effectif: number; gagnants: Gagnant[] }) =>
    `🏁 ${record(p)}. ${p.gagnants.length > 1 ? 'Winners' : 'Winner'}: ${p.gagnants
      .map((g) => `@${pseudo(g.pseudo)} (${g.annee}, ${g.points} pts)`)
      .join(', ')}`,

  personne: (p: { nom: string; pics: number[]; effectif: number }) => `🏁 ${record(p)}. Nobody answered.`,

  sansGagnant: (p: { nom: string; pics: number[]; effectif: number; reponses: number }) =>
    `🏁 ${record(p)}. ${pluriel(p.reponses, 'answer')}, none within 10 years: no winner.`,

  passe: (p: { numero: number }) => [`Round ${p.numero} skipped: new name coming.`, `Round ${p.numero}: name changed.`],

  fin: (p: { podium: Podium[] }) =>
    p.podium.length === 0
      ? 'Game over, no players this time.'
      : `🏆 Game over! ${p.podium
          .map((l, i) => `${i + 1}. ${pseudo(l.pseudo)} (${pluriel(l.victoires, 'win')}, ${nombre(l.points)} pts)`)
          .join(' · ')}`,

  partieArretee: () => 'Game stopped: the current round does not count.',

  tirageVide: () => 'No names left to draw tonight.',

  prenomCourbe: (p: {
    nom: string; sexe: Sexe; pics: number[]; effectif: number; total: number; premiere: number; autres: string[]; pseudo: string;
  }) =>
    `Name ${p.nom} (${sexe(p.sexe)}): peak in ${annees(p.pics)}, about ${nombre(p.effectif)} births, ` +
    `${nombre(p.total)} in total since ${p.premiere}.${p.autres.length ? ` Other spellings: ${p.autres.slice(0, 3).join(', ')}.` : ''}` +
    ` Requested by @${pseudo(p.pseudo)}`,

  prenomInconnu: (p: { pseudo: string }) => `@${pseudo(p.pseudo)}: name not found in the Insee file.`,
};
