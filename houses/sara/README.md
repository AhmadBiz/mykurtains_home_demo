# Maison Sara · Habillage de fenêtres

6274, boul. des Rossignols, Laval (Québec) H7L 5V6

Maquette « verre » de la maison (rez-de-chaussée, étage, sous-sol), construite à partir des plans d'architecte : on
touche une fenêtre sur la maquette ou dans la liste, et on choisit son habillage (rideaux et voilages à plis ondulés sur
rail au plafond, stores à rouleau, romains, cellulaires, vénitiens, verticaux, volets intérieurs), sa couleur et son
ouverture. Un dessin de face, à l'échelle, montre le résultat.

Ultra léger : HTML, CSS 3D et SVG, aucune 3D WebGL, aucune texture (≈ 130 Ko au premier chargement).

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # tsc + vite build → dist/
npm run screenshot   # captures bureau et téléphone dans screenshots/ (+ --preview → public/preview.jpg)
```

Voir `DESIGN.md` : objectifs, budgets, modèle de données, rôle de chaque fichier.
