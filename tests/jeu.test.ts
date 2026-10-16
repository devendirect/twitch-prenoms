/**
 * Le jeu branché sur le socle, par le même chemin qu'en direct (entrée, commandes, jeu,
 * sortie, base), sur l'extrait réel du fichier Insee. BRIEF.md, section 9.
 */
import { chercherHtmlBrut, demarrerJeu, mulberry32, Simulateur, TransportSimule, type Clock } from 'socle';
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PRENOM, creerJeu, type VuePrenoms } from '../src/jeu.js';
import { messagesEn } from '../src/messages.en.js';
import { messagesFr } from '../src/messages.fr.js';
import { REGLAGES } from '../src/manche.js';
import { jouables } from '../src/tirage.js';
import { donneesExtrait, userIdDe } from './aide.js';

const silencieux = { info: () => {}, warn: () => {} };
const donnees = donneesExtrait();
const liste = jouables(donnees, new Set());

async function monter(options: { env?: Record<string, string>; graine?: number } = {}) {
  let t = Date.parse('2026-10-16T20:00:00Z');
  const clock: Clock = { now: () => new Date(t), describe: () => 'horloge de test' };
  const transport = new TransportSimule();
  const socle = await demarrerJeu(creerJeu({ donnees, jouables: liste }), {
    env: { DB_PATH: ':memory:', ...options.env },
    transport,
    clock,
    aleatoire: mulberry32((options.graine ?? 1) + 1),
    logger: silencieux,
    ecouter: false,
    ticMs: null,
    sortie: { intervalleMs: 0 },
  });
  const vue = (): VuePrenoms => socle.jeu.vue(clock.now());
  /** Avance de `secondes`, un tic par seconde, comme le minuteur. */
  const attendre = (secondes: number) => {
    for (let i = 0; i < secondes; i++) {
      t += 1000;
      socle.tic();
    }
  };
  const envoyes = async () => {
    await socle.sortie.attendreVide(1000);
    return transport.envoyes;
  };
  const streamer = (texte: string) => transport.injecter('streamer', texte, { diffuseur: true });
  /** La manche en cours, telle que la machine la voit (pic compris). */
  const pic = () => {
    const nom = vue().manche!.nom;
    return liste.find((j) => j.prenom.nom === nom && j.prenom.sexe === vue().manche!.sexe)!.prenom.pics[0]!;
  };
  return { socle, transport, clock, vue, attendre, envoyes, streamer, pic, avancer: (ms: number) => void (t += ms) };
}

/** Lance une partie et va jusqu'à `ouvert`. */
async function ouvert(options: Parameters<typeof monter>[0] = {}) {
  const m = await monter(options);
  m.streamer('!jeu start');
  m.attendre(REGLAGES.annonceMs / 1000);
  expect(m.vue().phase).toBe('ouvert');
  return m;
}

describe('réponses', () => {
  it.each(['1987', '!annee 1987', '!année 1987', '!year 1987', '!YEAR 1987', '  1987  '])('« %s » compte', async (texte) => {
    const { socle, transport, vue } = await ouvert();
    transport.injecter('alice', texte);
    expect(vue().manche?.reponses).toBe(1);
    await socle.arreter();
  });

  it.each(['1850', '2099', '19871', 'l’an 1987', '1987 !', '!annee', '!annee mille', '!annee 19871', '0x7C3', '!annee 1987.0', '+1987', '1987.'])('« %s » est ignoré', async (texte) => {
    const { socle, transport, vue } = await ouvert();
    transport.injecter('alice', texte);
    expect(vue().manche?.reponses).toBe(0);
    await socle.arreter();
  });

  it('la seconde réponse d’une même personne remplace la première', async () => {
    const { socle, transport, vue, attendre, pic } = await ouvert();
    const annee = pic();
    transport.injecter('alice', String(annee - 30));
    transport.injecter('alice', String(annee));
    expect(vue().manche?.reponses).toBe(1);
    attendre(30);
    expect(socle.outils.scores.get(userIdDe('alice'))?.points).toBe(100);
    await socle.arreter();
  });

  it('« 1987 » hors de ouvert : rien (annonce, attente)', async () => {
    const { socle, transport, vue, streamer } = await monter();
    transport.injecter('alice', '1987');
    streamer('!jeu start');
    transport.injecter('alice', '1987');
    expect(vue().phase).toBe('annonce');
    expect(vue().manche?.reponses).toBe(0);
    await socle.arreter();
  });
});

describe('une manche par le chat', () => {
  it('annonce, points au plus proche, résultat aux scores, en français', async () => {
    const { socle, transport, vue, attendre, envoyes, pic } = await ouvert();
    const annee = pic();
    transport.injecter('alice', String(annee + 1));
    transport.injecter('bob', String(annee - 1));
    transport.injecter('chloe', String(annee + 20));
    // La vue ne dévoile pas la réponse avant la révélation.
    expect(vue().manche?.courbe).toBeNull();
    expect(JSON.stringify(vue())).not.toContain('"pics"');
    attendre(30);
    expect(vue().phase).toBe('revelation');
    expect(vue().manche?.courbe?.pics).toContain(annee);
    expect(vue().manche?.meilleurs.map((m) => [m.pseudo, m.points, m.victoire])).toEqual([
      ['alice', 60, true], ['bob', 60, true], ['chloe', 0, false],
    ]);
    attendre(10);
    const lignes = await envoyes();
    expect(lignes[0]).toMatch(/^Manche 1\/\d+ : /);
    expect(lignes.at(-1)).toMatch(/^🏁 .* : record en \d{4}, environ [\d\s ]+ naissances\. Gagnants : @alice \(\d{4}, 60 pts\), @bob/);
    expect(socle.outils.scores.classement().map((p) => [p.displayName, p.wins, p.points])).toEqual([
      ['alice', 1, 60], ['bob', 1, 60], ['chloe', 0, 0],
    ]);
    await socle.arreter();
  });

  it('personne ne répond : le bot le dit, la partie continue', async () => {
    const { socle, vue, attendre, envoyes } = await ouvert();
    attendre(30 + 10 + 5);
    expect(vue()).toMatchObject({ phase: 'annonce', manche: { numero: 2 } });
    expect((await envoyes()).some((l) => /Personne n’a répondu/.test(l))).toBe(true);
    expect(socle.outils.scores.classement()).toEqual([]);
    await socle.arreter();
  });

  it('LANGUE=en : annonce et résultat en anglais', async () => {
    const { socle, transport, attendre, envoyes, pic } = await ouvert({ env: { LANGUE: 'en' } });
    transport.injecter('alice', String(pic()));
    attendre(40);
    const lignes = await envoyes();
    expect(lignes[0]).toMatch(/^Round 1\/\d+: .* \((girl|boy)\)/);
    expect(lignes.at(-1)).toMatch(/^🏁 .*: peak in \d{4}, about [\d,]+ births\. Winner: @alice/);
    await socle.arreter();
  });
});

describe('modération', () => {
  it('!jeu start, skip, stop d’un modérateur agissent ; d’un spectateur, rien', async () => {
    const { socle, transport, vue, streamer } = await monter();
    transport.injecter('alice', '!jeu start');
    expect(vue().phase).toBe('attente');
    transport.injecter('mod', '!jeu start', { modo: true });
    const premier = vue().manche!.nom;
    transport.injecter('alice', '!jeu skip');
    expect(vue().manche!.nom).toBe(premier);
    streamer('!jeu skip');
    expect(vue().manche).toMatchObject({ numero: 1 });
    expect(vue().manche!.nom).not.toBe(premier);
    transport.injecter('alice', '!jeu stop');
    expect(vue().phase).toBe('annonce');
    transport.injecter('mod', '!game stop', { modo: true });
    expect(vue().phase).toBe('attente');
    await socle.arreter();
  });

  it('arrêter en plein ouvert : aucun point', async () => {
    const { socle, transport, streamer, pic, envoyes } = await ouvert();
    transport.injecter('alice', String(pic()));
    streamer('!jeu stop');
    expect(socle.outils.scores.classement()).toEqual([]);
    expect((await envoyes()).at(-1)).toBe('Partie arrêtée : la manche en cours ne compte pas.');
    await socle.arreter();
  });
});

describe('retraits', () => {
  it('CLEARMSG, CLEARCHAT ciblé et !oubliemoi pendant ouvert retirent la réponse : rien gagné', async () => {
    const { socle, transport, vue, attendre, pic } = await ouvert();
    const id = transport.injecter('alice', String(pic()));
    transport.injecter('bob', String(pic()));
    transport.injecter('chloe', String(pic()));
    transport.retirer({ type: 'message', messageId: id });
    transport.retirer({ type: 'utilisateur', userId: userIdDe('bob'), login: 'bob', dureeSecondes: null });
    expect(vue().manche?.reponses).toBe(1);
    transport.injecter('chloe', '!oubliemoi');
    expect(vue().manche?.reponses).toBe(0);
    attendre(30);
    expect(socle.outils.scores.classement()).toEqual([]);
    await socle.arreter();
  });
});

describe('!prenom', () => {
  it('« kevin », « KEVIN » et « Kévin » : la forme du fichier, jamais le texte tapé', async () => {
    const { socle, transport, vue, avancer, envoyes, attendre } = await monter();
    transport.injecter('alice', '!prenom kevin');
    expect(vue().carte).toMatchObject({ nom: 'Kevin', sexe: 'M', demandePar: 'alice', courbe: { pics: [1991] } });
    attendre(PRENOM.dureeMs / 1000);
    expect(vue().carte).toBeNull();
    transport.injecter('bob', '!prénom Kévin');
    avancer(1);
    const lignes = await envoyes();
    expect(lignes[0]).toMatch(/^Prénom Kevin \(garçon\) : record en 1991, environ 13.255 naissances, 152.655 en tout depuis 1900\. Autres orthographes : Kévin\. Demandé par @alice$/);
    expect(lignes[1]).toMatch(/^Prénom Kévin \(garçon\) : record en 1996/);
    await socle.arreter();
  });

  it('prénom absent : message prévu, sans recopier le texte', async () => {
    const { socle, transport, envoyes } = await monter();
    transport.injecter('alice', '!prenom Zorglub');
    expect(await envoyes()).toEqual(['@alice : prénom introuvable dans le fichier de l’Insee.']);
    await socle.arreter();
  });

  it.each([
    ['!prenom /ban alice'],
    ['!prenom .timeout bob 600'],
    [`!prenom ${'a'.repeat(200)}`],
    [`!prenom Kevin${String.fromCharCode(0x202e)}nivek`],
    ['!prenom <img src=x onerror=alert(1)>'],
    ['!prenom'],
  ])('sécurité : %s → aucune réponse, rien à l’écran', async (texte) => {
    const { socle, transport, vue, envoyes } = await monter();
    transport.injecter('mallory', texte);
    expect(await envoyes()).toEqual([]);
    expect(vue().carte).toBeNull();
    await socle.arreter();
  });

  it('aucune réponse du bot ne commence par « / » ou « . », même avec un pseudo piégé', async () => {
    const { socle, transport, envoyes } = await monter();
    transport.injecter('/ban', '!prenom Zorglub');
    transport.injecter('.timeout', '!prenom Kevin');
    for (const ligne of await envoyes()) expect(ligne).not.toMatch(/^[/.]/);
    await socle.arreter();
  });

  it('une demande par personne toutes les 2 minutes, file de 3 au plus', async () => {
    const { socle, transport, vue, attendre, avancer } = await monter();
    transport.injecter('alice', '!prenom Kevin');
    transport.injecter('alice', '!prenom Emma');
    attendre(PRENOM.dureeMs / 1000);
    expect(vue().carte).toBeNull();
    // Trois autres personnes pendant une carte : la carte en cours + 3 en file, la 4e refusée.
    transport.injecter('a1', '!prenom Emma');
    for (const nom of ['a2', 'a3', 'a4', 'a5']) transport.injecter(nom, '!prenom Léo');
    const vus: string[] = [];
    for (let i = 0; i < 6; i++) {
      if (vue().carte) vus.push(vue().carte!.demandePar);
      attendre(PRENOM.dureeMs / 1000);
    }
    expect(vus).toEqual(['a1', 'a2', 'a3', 'a4']);
    avancer(PRENOM.fenetreMs);
    transport.injecter('alice', '!prenom Emma');
    expect(vue().carte?.demandePar).toBe('alice');
    await socle.arreter();
  });

  it('pendant ouvert : mise en file, montrée après la manche', async () => {
    const { socle, transport, vue, attendre } = await ouvert();
    transport.injecter('alice', '!prenom Kevin');
    expect(vue().carte).toBeNull();
    attendre(30);
    expect(vue().phase).toBe('revelation');
    expect(vue().carte).toBeNull();
    attendre(10);
    expect(vue().phase).toBe('scores');
    expect(vue().carte?.nom).toBe('Kevin');
    await socle.arreter();
  });

  it('un prénom montré par !prenom n’est plus joué dans la partie', async () => {
    const { socle, transport, vue, attendre, streamer } = await monter();
    const vus = new Set<string>();
    // Kevin est jouable dans l'extrait : on le montre avant, il ne doit jamais sortir.
    transport.injecter('alice', '!prenom Kevin');
    attendre(PRENOM.dureeMs / 1000);
    streamer('!jeu start');
    for (let s = 0; s < 600 && vue().phase !== 'attente'; s++) {
      if (vue().manche) vus.add(vue().manche!.nom);
      attendre(1);
    }
    expect(vus.size).toBeGreaterThan(0);
    expect(vus).not.toContain('Kevin');
    await socle.arreter();
  });

  it('un prénom prévu plus tard dans la partie et montré par !prenom est retiré de la partie', async () => {
    const { socle, transport, vue, attendre } = await ouvert();
    // L'extrait n'a que quelques jouables : une partie de 10 les tire tous dès le départ.
    expect(vue().manche!.total).toBe(liste.length);
    const enCours = vue().manche!.nom;
    const montre = liste.find((j) => j.prenom.nom !== enCours)!.prenom.nom;
    transport.injecter('alice', `!prenom ${montre}`);
    attendre(40);
    expect(vue()).toMatchObject({ phase: 'scores', carte: { nom: montre } });
    // Tirage épuisé : pas de remplaçant, une manche de moins.
    expect(vue().manche!.total).toBe(liste.length - 1);
    const vus = new Set<string>();
    for (let s = 0; s < 600 && vue().phase !== 'attente'; s++) {
      if (vue().manche) vus.add(vue().manche!.nom);
      attendre(1);
    }
    expect(vus).not.toContain(montre);
    await socle.arreter();
  });

  it('!oubliemoi retire aussi les demandes en file et la carte affichée', async () => {
    const { socle, transport, vue } = await monter();
    transport.injecter('alice', '!prenom Kevin');
    expect(vue().carte?.demandePar).toBe('alice');
    transport.injecter('alice', '!oubliemoi');
    expect(vue().carte).toBeNull();
    await socle.arreter();
  });

  it('!oubliemoi retire aussi une demande encore en file', async () => {
    const { socle, transport, vue, attendre } = await monter();
    transport.injecter('bob', '!prenom Kevin');
    transport.injecter('alice', '!prenom Emma');
    transport.injecter('alice', '!oubliemoi');
    attendre(PRENOM.dureeMs / 1000);
    expect(vue().carte).toBeNull();
    await socle.arreter();
  });
});

describe('simulateur', () => {
  async function partie(graine: number) {
    const m = await monter({ graine });
    const simulateur = new Simulateur({
      transport: m.transport, joueurs: 25, graine, profil: m.socle.jeu.profilSimu, vue: () => m.socle.jeu.vue(m.clock.now()),
    });
    m.streamer('!jeu start');
    for (let s = 0; s < 600 && m.vue().phase !== 'attente'; s++) {
      simulateur.pas();
      m.attendre(1);
    }
    const classement = m.socle.outils.scores.classement(10).map((p) => [p.displayName, p.wins, p.points]);
    const fin = m.vue().phase;
    await m.socle.arreter();
    return { classement, fin, envoyes: m.transport.envoyes };
  }

  it('partie complète avec la graine 42 : deux lancements, même classement', async () => {
    const a = await partie(42);
    const b = await partie(42);
    expect(a.fin).toBe('attente');
    expect(a.classement.length).toBeGreaterThan(3);
    expect(b.classement).toEqual(a.classement);
    expect(a.envoyes.some((l) => l.startsWith('🏆 Fin de la partie'))).toBe(true);
  });
});

describe('textes', () => {
  it('mêmes clés en français et en anglais', () => {
    expect(Object.keys(messagesEn).sort()).toEqual(Object.keys(messagesFr).sort());
  });

  it('aucun texte ne commence par une donnée du chat', () => {
    const piege = '/ban x';
    const params = {
      numero: 1, total: 10, nom: 'Camille', sexe: 'F', premiere: 1900, derniere: 2025, pics: [1998], effectif: 7455,
      gagnants: [{ pseudo: piege, annee: 1998, ecart: 0, points: 100 }], reponses: 2,
      podium: [{ pseudo: piege, points: 100, victoires: 1 }], autres: [], pseudo: piege,
    };
    for (const messages of [messagesFr, messagesEn]) {
      for (const [cle, message] of Object.entries(messages)) {
        const textes = [message(params as never)].flat();
        // Texte fixe, ou mention « @pseudo » : jamais le texte tapé en tête.
        for (const t of textes) expect(t, cle).not.toMatch(/^([/.]|\/ban)/);
      }
    }
  });

  it('pas de HTML brut dans les pages du jeu', () => {
    if (existsSync('public')) expect(chercherHtmlBrut('public')).toEqual([]);
  });
});

describe('panneau (/api/jeu)', () => {
  const LOCAL = { host: 'localhost:3001' };
  const POST = { ...LOCAL, 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', origin: 'http://localhost:3001' };
  type Monte = Awaited<ReturnType<typeof monter>>;
  const lire = async (m: Monte) => (await m.socle.app.inject({ method: 'GET', url: '/api/jeu', headers: LOCAL })).json();
  const lancer = (m: Monte, payload: object) => m.socle.app.inject({ method: 'POST', url: '/api/jeu', headers: POST, payload });

  it('lance une partie avec ses réglages ; !jeu start les reprend ensuite', async () => {
    const m = await monter();
    expect((await lancer(m, { action: 'demarrer', manches: 3, ouvertSecondes: 15 })).statusCode).toBe(200);
    expect(m.vue().manche?.total).toBe(3);
    m.attendre(3);
    expect(m.vue()).toMatchObject({ phase: 'ouvert', dureeMs: 15_000 });
    m.attendre(15);
    expect(m.vue().phase).toBe('revelation');
    m.streamer('!jeu stop');
    m.streamer('!jeu start');
    expect(m.vue().manche?.total).toBe(3);
    await m.socle.arreter();
  });

  it('partie déjà en cours : 409, rien ne change', async () => {
    const m = await monter();
    m.streamer('!jeu start');
    const nom = m.vue().manche?.nom;
    const res = await lancer(m, { action: 'demarrer', manches: 2, ouvertSecondes: 20 });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/déjà en cours/);
    expect(m.vue().manche?.nom).toBe(nom);
    await m.socle.arreter();
  });

  it.each([
    [{ action: 'demarrer', manches: 0, ouvertSecondes: 30 }],
    [{ action: 'demarrer', manches: 21, ouvertSecondes: 30 }],
    [{ action: 'demarrer', manches: 10, ouvertSecondes: 9 }],
    [{ action: 'demarrer', manches: 10, ouvertSecondes: 121 }],
    [{ action: 'demarrer', manches: 1.5, ouvertSecondes: 30 }],
    [{ action: 'demarrer', manches: '10', ouvertSecondes: 30 }],
    [{ action: 'demarrer', manches: 10, ouvertSecondes: 30, prenom: 'KEVIN' }],
    [{ action: 'arreter' }],
  ])('refus 400 : %j', async (payload) => {
    const m = await monter();
    expect((await lancer(m, payload)).statusCode).toBe(400);
    expect(m.vue().phase).toBe('attente');
    await m.socle.arreter();
  });

  it('le streamer voit la réponse et les prénoms à venir ; l’overlay non', async () => {
    const m = await ouvert();
    const etat = await lire(m);
    expect(etat.manche.prenom.pics).toEqual([m.pic()]);
    expect(etat.aVenir.length).toBe(liste.length - 1);
    expect(etat.reglages).toEqual({ manches: 10, ouvertSecondes: 30 });
    expect(JSON.stringify(m.vue())).not.toMatch(/"pics"|aVenir/);
    await m.socle.arreter();
  });
});
