# MyKurtains · Home demos

Un seul site, plusieurs maisons : la page d'accueil liste les maisons, et chaque maison s'ouvre sur une maquette
légère où l'on choisit l'habillage de chaque fenêtre (rideaux et voilages à plis ondulés, stores, volets intérieurs).
*One site, many houses: a landing page lists the houses; each opens on a lightweight glass model where every
window gets its own curtains, blinds or shutters.*

## Organisation / Layout

```
houses.json                 ← liste des maisons affichées sur la page d'accueil (nom, client, description, vignette)
houses/<id>/                ← une maison = un dossier = une application Vite + React autonome (CSS 3D + SVG, sans WebGL)
site/                       ← gabarit de la page d'accueil (index.html, styles.css)
scripts/build-all.mjs       ← construit toutes les maisons + la page d'accueil dans dist/
scripts/serve.mjs           ← aperçu local de dist/
```

Site construit :

```
dist/index.html             ← page d'accueil
dist/houses/<id>/           ← chaque maison, servie sous /houses/<id>/
```

| Dossier | Maison | Détails |
|---|---|---|
| [`houses/sara`](houses/sara) | Maison Sara — 6274, boul. des Rossignols, Laval — maison à deux étages avec garage et sous-sol aménagé | 4 chambres à l'étage + 2 au sous-sol, 27 fenêtres habillables |

## Déploiement sur Vercel (un seul projet) / Deploy to Vercel (single project)

1. Sur [vercel.com/new](https://vercel.com/new), importez ce dépôt. Laissez **Root Directory** à la racine.
2. `vercel.json` fixe tout : build `npm run build`, sortie `dist`, pas de framework. Node 22 (`engines` dans `package.json`). Cliquez **Deploy**.
3. Le site est servi à la racine du domaine ; chaque maison à `/houses/<id>/`.

Chaque push sur `main` reconstruit toutes les maisons (quelques secondes par maison).

## Ajouter une maison / Add a house

1. Copiez `houses/sara` vers `houses/<id-de-la-nouvelle-maison>`.
2. Transcrivez les plans dans `src/data/house.ts` (niveaux, murs, ouvertures, `hemAbove` pour les fenêtres au-dessus
   d'un comptoir ou d'un bain, et `HOUSE_META` : nom, client, adresse) et ajustez les habillages par défaut dans
   `src/data/coverings.ts`. La maquette, les dessins et l'interface se construisent seuls à partir de ces données.
3. Ajoutez une entrée dans `houses.json` (id = nom du dossier, nom, client, adresse, description, statistiques).
4. `npm run screenshot -- --preview` dans le dossier de la maison crée la vignette `public/preview.jpg`.

L'ancienne visite photoréaliste (WebGL) est archivée dans `legacy/sara-walkthrough/` (non déployée).

## Développement / Development

```bash
# une maison seule, avec rechargement à chaud
cd houses/sara && npm install && npm run dev

# le site complet (toutes les maisons + page d'accueil)
npm run build && npm run preview      # http://localhost:4321
node scripts/build-all.mjs --house sara   # une seule maison
node scripts/build-all.mjs --site-only                # page d'accueil seulement
```

Chaque maison reste aussi déployable seule (son propre `vercel.json`) en choisissant son dossier comme Root Directory.
Voir `README.md` et `ARCHITECTURE.md` dans chaque dossier de maison.
