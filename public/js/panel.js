/**
 * Panneau du streamer (BRIEF.md, section 6) : lancer une partie (nombre de manches,
 * durée pour répondre), passer, arrêter, voir la manche en cours — réponse comprise,
 * ce qui n'apparaît jamais à l'overlay. Lit `/api/jeu` chaque seconde.
 *
 * Tout texte passe par dom.js du socle. Si le serveur exige `PANEL_TOKEN`, il est
 * demandé une fois et gardé pour l'onglet (sessionStorage).
 */
import { element, remplacer, texte } from '/socle/dom.js';

const $ = (id) => document.getElementById(id);
const PHASES = {
  attente: 'en attente',
  annonce: 'annonce',
  ouvert: 'le chat répond',
  revelation: 'révélation',
  scores: 'scores',
  fin: 'fin de partie',
};
const NIVEAUX = { facile: 'facile', moyen: 'moyen', difficile: 'difficile' };
const nombre = (n) => n.toLocaleString('fr-FR');
const annees = (pics) => (pics.length > 1 ? `${pics.slice(0, -1).join(', ')} et ${pics.at(-1)}` : String(pics[0]));
const sexe = (s) => (s === 'F' ? 'fille' : 'garçon');
const secondes = (ms) => `${Math.ceil(ms / 1000)} s`;

function lireJeton() {
  try {
    return sessionStorage.getItem('jeton-panneau') ?? '';
  } catch {
    return '';
  }
}
let jeton = lireJeton();

async function api(chemin, corps) {
  const entetes = { ...(jeton ? { authorization: `Bearer ${jeton}` } : {}) };
  const reponse = await fetch(chemin, corps === undefined
    ? { headers: entetes }
    : { method: 'POST', headers: { ...entetes, 'content-type': 'application/json' }, body: JSON.stringify(corps) });
  $('connexion').hidden = reponse.status !== 401;
  const donnees = await reponse.json().catch(() => ({}));
  if (!reponse.ok) throw new Error(donnees.error ?? `Erreur ${reponse.status}`);
  return donnees;
}

function message(texteMessage, erreur = false) {
  texte($('message'), texteMessage, 200);
  $('message').classList.toggle('erreur', erreur);
}

async function agir(chemin, corps, reussite) {
  try {
    await api(chemin, corps);
    message(reussite);
    await rafraichir();
  } catch (e) {
    message(e.message, true);
  }
}

let reglagesPoses = false;

function rendre(e) {
  if (!reglagesPoses) {
    reglagesPoses = true;
    for (const [id, cle] of [['manches', 'manches'], ['ouvert', 'ouvertSecondes']]) {
      $(id).min = String(e.limites[cle].min);
      $(id).max = String(e.limites[cle].max);
      $(id).value = String(e.reglages[cle]);
    }
  }
  const enCours = e.phase !== 'attente' && e.phase !== 'fin';
  $('lancer').disabled = enCours;
  $('passer').disabled = !enCours;
  $('arreter').disabled = e.phase === 'attente';
  texte($('phase'), `${PHASES[e.phase] ?? e.phase}${e.phase === 'attente' ? '' : ` · ${secondes(e.restantMs)}`}`);

  const m = e.manche;
  if (!m) {
    remplacer($('manche'), element('p', 'vide', 'Aucune manche en cours.'));
  } else {
    const p = m.prenom;
    const lignes = [
      element('p', 'titre-manche', `Manche ${m.numero} / ${m.total} : ${p.nom} (${sexe(p.sexe)}${p.niveau ? `, ${NIVEAUX[p.niveau]}` : ''})`, 120),
      element('p', 'reponse', `Réponse : ${annees(p.pics)} · environ ${nombre(p.effectifPic)} naissances (${nombre(p.total)} au total)`, 120),
      element('p', 'discret', `${nombre(m.reponses)} réponse${m.reponses > 1 ? 's' : ''} · ne pas montrer cet écran au stream`, 120),
    ];
    remplacer($('manche'), ...lignes);
  }

  remplacer(
    $('a-venir'),
    ...(e.aVenir.length
      ? e.aVenir.map((p) => element('li', null, `${p.nom} (${sexe(p.sexe)}${p.niveau ? `, ${NIVEAUX[p.niveau]}` : ''}) · ${annees(p.pics)}`, 80))
      : [element('li', 'vide', 'Rien à venir.')]),
  );
  remplacer(
    $('classement'),
    ...(e.classement.length
      ? e.classement.map((c) => element('li', null, `${c.pseudo} · ${c.victoires} victoire${c.victoires > 1 ? 's' : ''} · ${nombre(c.points)} pts`, 80))
      : [element('li', 'vide', 'Personne pour l’instant.')]),
  );
  texte($('soiree'), `Prénoms encore disponibles ce soir : ${nombre(e.restantsCeSoir)} · demandes !prenom en attente : ${e.fileDemandes}`, 200);
}

async function rafraichir() {
  try {
    rendre(await api('/api/jeu'));
  } catch (e) {
    message(e.message, true);
  }
}

async function etatServeur() {
  try {
    const e = await api('/api/etat');
    $('simulation').hidden = !e.simulation;
    const chat = { anonymous: 'lecture seule (sans jeton du bot)', pending: 'connexion…', authenticated: 'bot connecté', refused: 'jeton du bot refusé' };
    texte($('chat'), `Chat : ${e.chat.connecte ? chat[e.chat.etat] ?? e.chat.etat : 'déconnecté'} · langue ${e.langue}`, 120);
  } catch {
    texte($('chat'), 'Serveur injoignable');
  }
}

$('form-partie').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const corps = { action: 'demarrer', manches: Number($('manches').value), ouvertSecondes: Number($('ouvert').value) };
  void agir('/api/jeu', corps, `Partie lancée : ${corps.manches} manches, ${corps.ouvertSecondes} s pour répondre.`);
});
$('passer').addEventListener('click', () => void agir('/api/moderation', { action: 'skip' }, 'Manche passée.'));
$('arreter').addEventListener('click', () => void agir('/api/moderation', { action: 'stop' }, 'Partie arrêtée.'));
$('form-jeton').addEventListener('submit', (ev) => {
  ev.preventDefault();
  jeton = $('jeton').value;
  try {
    sessionStorage.setItem('jeton-panneau', jeton);
  } catch {
    // Navigation privée : le jeton reste en mémoire pour cette page.
  }
  void etatServeur();
  void rafraichir();
});

void etatServeur();
void rafraichir();
setInterval(rafraichir, 1000);
setInterval(etatServeur, 5000);
