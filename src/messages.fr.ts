import { pseudo } from 'socle';
import type { Sexe } from './insee.js';

/**
 * Textes du bot, en français. `messages.en.ts` a exactement les mêmes clés (test).
 *
 * Chaque message commence par un texte fixe : jamais par une donnée du chat. Les
 * prénoms cités viennent du fichier de l'Insee, jamais de ce qu'un spectateur a tapé.
 * Les effectifs sont arrondis à 5 par l'Insee : « environ ».
 */

export interface Gagnant { pseudo: string; annee: number; ecart: number; points: number }
export interface Podium { pseudo: string; points: number; victoires: number }

const nombre = (n: number) => n.toLocaleString('fr-FR');
const sexe = (s: Sexe) => (s === 'F' ? 'fille' : 'garçon');
const annees = (pics: readonly number[]) => (pics.length > 1 ? `${pics.slice(0, -1).join(', ')} et ${pics.at(-1)}` : String(pics[0]));
const pluriel = (n: number, mot: string) => `${nombre(n)} ${mot}${n > 1 ? 's' : ''}`;
const record = (p: { nom: string; pics: readonly number[]; effectif: number }) =>
  `${p.nom} : record en ${annees(p.pics)}, environ ${nombre(p.effectif)} naissances`;

export const messagesFr = {
  aide: () => 'Devinez l’année où le prénom affiché a été le plus donné : tapez-la (ex. 1987). La courbe d’un prénom : !prenom Léa',

  annonce: (p: { numero: number; total: number; nom: string; sexe: Sexe; premiere: number; derniere: number }) => [
    `Manche ${p.numero}/${p.total} : ${p.nom} (${sexe(p.sexe)}). En quelle année ce prénom a-t-il été le plus donné ? Tape l’année, de ${p.premiere} à ${p.derniere} !`,
    `Manche ${p.numero}/${p.total} : ${p.nom} (${sexe(p.sexe)}). Son année record ? Tape-la, de ${p.premiere} à ${p.derniere} !`,
  ],

  resultat: (p: { nom: string; pics: number[]; effectif: number; gagnants: Gagnant[] }) =>
    `🏁 ${record(p)}. ${p.gagnants.length > 1 ? 'Gagnants' : 'Gagnant'} : ${p.gagnants
      .map((g) => `@${pseudo(g.pseudo)} (${g.annee}, ${g.points} pts)`)
      .join(', ')}`,

  personne: (p: { nom: string; pics: number[]; effectif: number }) => `🏁 ${record(p)}. Personne n’a répondu.`,

  sansGagnant: (p: { nom: string; pics: number[]; effectif: number; reponses: number }) =>
    `🏁 ${record(p)}. ${pluriel(p.reponses, 'réponse')}, aucune à moins de 10 ans : pas de gagnant.`,

  passe: (p: { numero: number }) => [`Manche ${p.numero} passée : on change de prénom.`, `Manche ${p.numero} : prénom changé.`],

  fin: (p: { podium: Podium[] }) =>
    p.podium.length === 0
      ? 'Fin de la partie, sans joueur cette fois.'
      : `🏆 Fin de la partie ! ${p.podium
          .map((l, i) => `${i + 1}. ${pseudo(l.pseudo)} (${pluriel(l.victoires, 'victoire')}, ${nombre(l.points)} pts)`)
          .join(' · ')}`,

  partieArretee: () => 'Partie arrêtée : la manche en cours ne compte pas.',

  tirageVide: () => 'Plus aucun prénom à tirer ce soir.',

  prenomCourbe: (p: {
    nom: string; sexe: Sexe; pics: number[]; effectif: number; total: number; premiere: number; autres: string[]; pseudo: string;
  }) =>
    `Prénom ${p.nom} (${sexe(p.sexe)}) : record en ${annees(p.pics)}, environ ${nombre(p.effectif)} naissances, ` +
    `${nombre(p.total)} en tout depuis ${p.premiere}.${p.autres.length ? ` Autres orthographes : ${p.autres.slice(0, 3).join(', ')}.` : ''}` +
    ` Demandé par @${pseudo(p.pseudo)}`,

  prenomInconnu: (p: { pseudo: string }) => `@${pseudo(p.pseudo)} : prénom introuvable dans le fichier de l’Insee.`,
};
