# Maison Sara · Habillage de fenêtres

6274 Blvd. des Rossignols, Laval, QC H7L 5V6, Canada

Visite virtuelle 3D de la maison de Sara (plans d’architecte — rez-de-chaussée, étage, sous-sol et élévations) dans laquelle on se
promène à la première personne et on choisit, **fenêtre par fenêtre**, l'habillage : rideaux, voilages, store à rouleau,
store romain, store cellulaire, store vénitien, store vertical ou persiennes, dans la couleur de son choix, avec le degré
d'ouverture et l'inclinaison des lames.

*A first-person 3D walkthrough of the house where every window gets its own curtains, blinds or shutters.*

## Démo locale / Run locally

```bash
npm install
npm run dev        # http://localhost:5173
```

## Déployer sur Vercel / Deploy to Vercel

Le projet est un site statique Vite : aucune configuration serveur n'est nécessaire.

1. Poussez ce dépôt sur GitHub (déjà fait si vous lisez ceci sur GitHub).
2. Sur [vercel.com/new](https://vercel.com/new), importez le dépôt.
3. Vercel détecte le preset **Vite** automatiquement (`vercel.json` le confirme) :
   * Build command : `npm run build`
   * Output directory : `dist`
4. Cliquez **Deploy**. Chaque push sur la branche déclenche un nouveau déploiement.

Ou en ligne de commande :

```bash
npm i -g vercel
vercel          # aperçu
vercel --prod   # production
```

## Commandes / Commands

| Commande | Rôle |
|---|---|
| `npm run dev` | serveur de développement |
| `npm run build` | vérification TypeScript + build de production dans `dist/` |
| `npm run preview` | sert `dist/` localement |
| `npm run typecheck` | `tsc -b` seul |
| `npx tsx scripts/validate-house.ts` | vérifie les données du plan : ouvertures, normales, et que chaque pièce et chaque fenêtre est accessible à pied |
| `npm run screenshot` | build + Chromium headless (Playwright) : capture des vues clés dans `screenshots/` |

## Utilisation / How to use

* **Visite** : `W A S D` ou flèches pour marcher, souris pour regarder (cliquez d'abord sur la scène), `Maj` pour courir,
  `1 / 2 / 3` pour sauter au sous-sol / rez-de-chaussée / étage, `Tab` pour la vue maquette, `M` plan, `L` liste des fenêtres, `H` aide.
* **Choisir un habillage** : visez une fenêtre (elle se surligne) et cliquez, ou appuyez sur `E`. Le panneau permet de
  choisir le type, la couleur, l'ouverture, l'inclinaison des lames, d'ajouter un voilage derrière des rideaux, et
  d'appliquer le même choix à toute la pièce, à l'étage ou à la maison entière.
* **Sur téléphone / tablette** : joystick à gauche pour marcher, glisser à droite pour regarder, bouton *Choisir* pour la fenêtre visée.
* **Vue maquette** : la maison vue de dessus, étage par étage (sans plafond), pour cliquer sur n'importe quelle fenêtre.
* Les choix sont enregistrés dans le navigateur (localStorage).

## Architecture

Voir [ARCHITECTURE.md](ARCHITECTURE.md) : modèle de données (`src/data`), géométrie dérivée, store, composition de la scène et de l'interface.

Les plans ont été transcrits en pieds dans `src/data/house.ts` (murs, ouvertures, escaliers, plateformes) puis convertis en mètres.
Toute la 3D est procédurale (aucune ressource externe), ce qui rend le déploiement trivial et le chargement rapide.
