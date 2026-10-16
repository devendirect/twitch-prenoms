# Devine l'année de mon prénom

Mini-jeu de chat Twitch : un prénom s'affiche (« Camille, fille »), le chat a 30 secondes
pour taper l'année où il a été le plus donné en France, puis la vraie courbe depuis 1900
se dessine et les plus proches gagnent des points. Données réelles de l'Insee.

Le pourquoi de chaque choix est dans [`BRIEF.md`](BRIEF.md).

## Installer

Node 22 ou plus.

```
npm install          # installe aussi le socle (chat, points, serveur), depuis GitHub
npm run preparer     # télécharge le fichier des prénoms de l'Insee et prépare les données
npm test
```

`npm run preparer` télécharge une fois le zip de l'Insee (4 Mo) dans `data/brut/`,
vérifie son empreinte, et écrit `data/prenoms.json` et `data/tirage.json`. Aucun appel
réseau ensuite pendant le jeu.

## Lancer

Sans stream, avec de faux spectateurs :

```
npm run simu -- --joueurs 20 --graine 42
```

Sur une vraie chaîne : copier `.env.example` en `.env`, renseigner `TWITCH_CHANNEL`, et le
compte du bot (`TWITCH_BOT_USERNAME`, `TWITCH_BOT_TOKEN`, scopes `chat:read chat:edit`)
pour que le jeu annonce les manches. Sans bot, le jeu reste jouable en lecture seule.

```
npm start
```

| Adresse | Pour |
|---|---|
| `http://127.0.0.1:3001/panel.html` | le panneau : lancer une partie, passer, arrêter, voir la réponse |
| `http://127.0.0.1:3001/overlay.html` | OBS, source navigateur 1920 × 1080 (format « bloc ») |
| `…/overlay.html?format=plein` | une scène dédiée au jeu |
| `…/overlay.html?format=deux&carte=prenom` et `&carte=graphique` | deux sources séparées |

Les messages tapés par le compte du bot sont ignorés : si le bot est ton compte de
streamer, pilote depuis le panneau et laisse jouer les spectateurs.

## Commandes du chat

- `1987`, ou `!annee 1987` / `!year 1987` : répondre (la dernière réponse compte).
- `!prenom Léa` / `!name Lea` : la courbe d'un prénom, entre deux manches.
- `!points`, `!classement`, `!donnees`, `!oubliemoi`, `!aide` (et leurs alias anglais).
- `!jeu start`, `!jeu skip`, `!jeu stop` : streamer et modérateurs.

`LANGUE=en` dans `.env` passe le bot et l'overlay en anglais.

## Données

Insee, *Fichier des prénoms* (état civil), fichier national, édition 2026 (naissances de
1900 à 2025), https://www.insee.fr/fr/statistiques/8595130 — Licence Ouverte 2.0.
Effectifs arrondis à 5 par l'Insee. La mention s'affiche en permanence sur l'overlay.

## Développer avec le socle

Le jeu dépend du [socle](https://github.com/stanBPS/socle) à une version fixe (voir
`package.json`). Pour modifier le socle et le jeu en même temps, cloner les deux côte à
côte, puis dans `prenoms/` :

```
npm link ../socle    # le jeu utilise le socle local au lieu de la version GitHub
npm install          # revient à la version de package.json
```
