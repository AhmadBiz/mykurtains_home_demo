# MyKurtains · Home demos

Maquettes 3D interactives de maisons, pour choisir l'habillage de chaque fenêtre (rideaux, voilages, stores,
persiennes) en se promenant dans la maison. *Interactive 3D house demos for choosing window coverings room by room.*

## Organisation du dépôt / Repository layout

**Chaque maison est un dossier autonome dans `houses/`** — sa propre application Vite + React + three.js, son propre
`package.json`, déployable seule sur Vercel.

| Dossier | Maison | Détails |
|---|---|---|
| [`houses/caprea-2-storey`](houses/caprea-2-storey) | Cottage 2 étages avec garage et sous-sol aménagé (plans Caprea) | 4 chambres à l'étage + 2 au sous-sol, 27 fenêtres habillables |

Pour ajouter une maison : copiez un dossier existant dans `houses/<nom-de-la-maison>/`, remplacez `src/data/house.ts`
(murs, ouvertures, escaliers transcrits depuis les plans) et `src/data/coverings.ts` (choix par défaut), puis ajustez
les meubles (`src/scene/Furniture.tsx`). Le reste (visite, interface, habillages) est réutilisé tel quel.

## Déployer une maison sur Vercel / Deploy a house to Vercel

1. Sur [vercel.com/new](https://vercel.com/new), importez ce dépôt.
2. Dans **Root Directory**, choisissez le dossier de la maison, par ex. `houses/caprea-2-storey`.
3. Vercel détecte le preset **Vite** (build `npm run build`, sortie `dist`). Cliquez **Deploy**.

Un projet Vercel par maison → une URL par maison. Chaque push sur `main` redéploie les projets concernés.

## Développement / Development

```bash
cd houses/caprea-2-storey
npm install
npm run dev
```

Voir le `README.md` et `ARCHITECTURE.md` de chaque maison pour les détails.
