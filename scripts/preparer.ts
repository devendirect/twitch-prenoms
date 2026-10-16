/**
 * Préparation des données, une fois par édition du fichier Insee (BRIEF.md, section 5) :
 *   npm run preparer
 * 1. data/brut/ : télécharge le zip national s'il manque, vérifie son empreinte SHA-256 ;
 * 2. lit le CSV qu'il contient (sans l'écrire sur disque) ;
 * 3. écrit data/prenoms.json (toutes les courbes) et data/tirage.json (prénoms jouables).
 * Seule étape qui touche au réseau ; le jeu, lui, ne lit que ces deux fichiers.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EDITION, preparer, lireExclus, type Niveau, type Refus } from '../src/insee.js';
import { extraireZip } from '../src/zip.js';
import { compacter, type Source } from '../src/donnees.js';
import { mesureurPrenom } from '../src/taille.js';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const brut = join(racine, 'data', 'brut');
const cheminZip = join(brut, EDITION.zip.split('/').at(-1)!);
const cheminExclus = join(racine, 'data', 'exclus.txt');

function arreter(message: string): never {
  console.error(`\nPréparation arrêtée : ${message}`);
  process.exit(1);
}

async function telecharger(): Promise<void> {
  console.log(`Téléchargement de ${EDITION.zip}`);
  const reponse = await fetch(EDITION.zip, { redirect: 'follow', signal: AbortSignal.timeout(120_000) });
  if (!reponse.ok) arreter(`l'Insee répond ${reponse.status} ${reponse.statusText}`);
  mkdirSync(brut, { recursive: true });
  writeFileSync(cheminZip, Buffer.from(await reponse.arrayBuffer()));
}

if (!existsSync(cheminZip)) await telecharger();
const zip = readFileSync(cheminZip);
const empreinte = createHash('sha256').update(zip).digest('hex');
if (empreinte !== EDITION.sha256) {
  arreter(
    `${cheminZip} n'est pas le fichier constaté (SHA-256 ${empreinte}). ` +
      `Nouvelle édition ? Relire le fichier, puis mettre à jour EDITION (src/insee.ts) et le brief.`,
  );
}

let texte: string;
try {
  texte = new TextDecoder('utf-8', { fatal: true }).decode(extraireZip(zip, EDITION.csv));
} catch (erreur) {
  arreter(erreur instanceof Error ? erreur.message : String(erreur));
}

const exclus = existsSync(cheminExclus) ? lireExclus(readFileSync(cheminExclus, 'utf8')) : new Set<string>();
// Taille du prénom à l'écran : mesurée dans la police servie à l'overlay.
const mesure = mesureurPrenom();
let p: ReturnType<typeof preparer>;
try {
  p = preparer(texte, exclus, mesure.taille);
} catch (erreur) {
  arreter(erreur instanceof Error ? erreur.message : String(erreur));
}
if (p.premiereAnnee !== EDITION.premiereAnnee || p.derniereAnnee !== EDITION.derniereAnnee) {
  arreter(`années ${p.premiereAnnee}-${p.derniereAnnee}, attendu ${EDITION.premiereAnnee}-${EDITION.derniereAnnee}`);
}
const inconnus = [...exclus].filter((e) => ![...p.prenoms.values()].some((x) => x.prenom === e));
if (inconnus.length) console.warn(`exclus.txt : absents du fichier (accent ?) : ${inconnus.join(', ')}`);

const source: Source = {
  producteur: 'Insee',
  titre: 'Fichier des prénoms',
  edition: EDITION.annee,
  publiee: EDITION.publiee,
  page: EDITION.page,
  licence: EDITION.licence,
  sha256: EDITION.sha256,
  arrondi: 5,
  preparee: new Date().toISOString(),
};

// Format compact : le fichier complet garde 52 000 courbes pour !prenom.
const sortiePrenoms = join(racine, 'data', 'prenoms.json');
writeFileSync(sortiePrenoms, JSON.stringify(compacter(p, source)));

const jouables: { prenom: string; sexe: string; niveau: Niveau }[] = [];
const refus = new Map<Refus, number>();
for (const [k, v] of p.verdicts) {
  const x = p.prenoms.get(k)!;
  if (v.jouable) jouables.push({ prenom: x.prenom, sexe: x.sexe, niveau: v.niveau });
  else refus.set(v.raison, (refus.get(v.raison) ?? 0) + 1);
}
jouables.sort((a, b) => a.prenom.localeCompare(b.prenom, 'fr') || a.sexe.localeCompare(b.sexe));
const sortieTirage = join(racine, 'data', 'tirage.json');
writeFileSync(sortieTirage, `${JSON.stringify({ source, jouables }, null, 1)}\n`);

const compter = (n: Niveau) => jouables.filter((j) => j.niveau === n).length;
const aPicsMultiples = jouables
  .map((j) => p.prenoms.get(`${j.prenom}|${j.sexe}`)!)
  .filter((x) => x.pics.length > 1)
  .map((x) => `${x.nom} (${x.pics.join(', ')})`);
const plusLongs = [...jouables].sort((a, b) => b.prenom.length - a.prenom.length).slice(0, 5).map((j) => j.prenom);
const ko = (chemin: string) => `${Math.round(readFileSync(chemin).length / 1024)} Ko`;

console.log(`Insee, Fichier des prénoms, édition ${EDITION.annee} : ${p.premiereAnnee}-${p.derniereAnnee}`);
console.log(`${p.prenoms.size} couples (prénom, sexe) → ${sortiePrenoms} (${ko(sortiePrenoms)})`);
console.log(`${jouables.length} jouables : ${compter('facile')} faciles, ${compter('moyen')} moyens, ${compter('difficile')} difficiles → ${sortieTirage}`);
console.log(`refusés : ${[...refus].map(([r, n]) => `${r} ${n}`).join(', ')}`);
console.log(`pics à égalité (arrondi à 5) : ${aPicsMultiples.join(', ') || 'aucun'}`);
console.log(`plus longs : ${plusLongs.join(', ')}`);

// BRIEF.md, section 9 : les 20 plus petites tailles d'affichage parmi les jouables.
const tailles = jouables
  .map((j) => ({ nom: p.prenoms.get(`${j.prenom}|${j.sexe}`)!.nom }))
  .map(({ nom }) => ({ nom, m: mesure.detail(nom)! }))
  .sort((a, b) => a.m.taille - b.m.taille)
  .slice(0, 20);
console.log('plus petites tailles du prénom (format, état) :');
for (const { nom, m } of tailles) console.log(`  ${m.taille} px  ${nom}${m.lignes.length > 1 ? ' (2 lignes)' : ''}  ${m.format} ${m.etat}`);
