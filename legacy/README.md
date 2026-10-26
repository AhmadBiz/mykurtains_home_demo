# Legacy

`sara-walkthrough/` is the first, photoreal version of Maison Sara: a WebGL (three.js) first-person walkthrough with
PBR textures, HDRI lighting and procedural 3D models of every covering type. It was replaced on the live site by the
lightweight glass model in `houses/sara/` because it was too heavy to open quickly (about 8 MB and a GPU-heavy scene).

It is kept, not built or deployed, because its 3D covering models (`src/scene/coverings/`) and texture pack are the
starting point for the AR visualizer described in `docs/visualizer-specs.md`. To run it: `cd legacy/sara-walkthrough &&
npm install && npm run dev`.
