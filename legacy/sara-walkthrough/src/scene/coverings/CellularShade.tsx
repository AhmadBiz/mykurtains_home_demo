/**
 * CELLULAR (honeycomb) SHADE (store cellulaire): inside mount. An aluminium headrail, the
 * honeycomb body and an aluminium bottom rail with a pull tab (cordless). The body is a real
 * extrusion of the single-cell honeycomb side profile (hexagonal cells 3.8 cm tall × 3.8 cm deep,
 * each a hole in the profile) swept along X across the width: the ends show the open hexagonal
 * cells and their walls, the front and back are crisp zig-zag pleats with true normals.
 * Body height = available height × (1 − open), never less than 3 cm — the extrusion is built at
 * full height and scaled in Y, so the cells visibly flatten into a tight stack as the shade rises
 * without rebuilding geometry. Light-filtering colours are slightly translucent (opacity 0.9).
 *
 * Local frame (see ./types.ts): origin = centre of the opening on the interior wall face,
 * +X along the wall, +Y up, +Z into the room; the glass is at z = −reveal. Everything hangs in
 * front of the window's mullions (see fabric.ts mullionFrontZ). Pure & prop-driven: no store
 * access; the geometry depends on the window size only.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { CoveringProps } from './types';
import { clamp, clamp01, clearOpening, finite, lighten, mullionFrontZ, useDisposable, useFabricMaps } from './fabric';

/** Cell pitch and depth when fully lowered (m). */
const CELL = 0.038;
const DEPTH = 0.038;
/** Fabric thickness of the cell walls in the profile (m). */
const WALL = 0.0022;
const HEAD_H = 0.045;
const HEAD_D = 0.045;
const RAIL_H = 0.02;
const RAIL_D = 0.042;
/** Compressed stack height when fully raised (m). */
const MIN_BODY = 0.03;

/**
 * The honeycomb body: the side profile (x = depth from the front face, y = height from the bottom)
 * of `n` stacked hexagonal cells — zig-zag front and back, each cell an inset hexagonal hole —
 * extruded across the width and turned so the extrusion runs along X. The front face is at
 * z = 0 and the back at z = −DEPTH; the bottom is at y = 0. UVs come out in metres.
 */
function buildHoneycomb(w: number, n: number): THREE.BufferGeometry {
  const D = DEPTH;
  const H = CELL;
  const shape = new THREE.Shape();
  // front zig-zag, bottom → top (points at mid-cell, creases at the joins)
  shape.moveTo(D / 4, 0);
  for (let i = 0; i < n; i++) {
    shape.lineTo(0, i * H + H / 2);
    shape.lineTo(D / 4, (i + 1) * H);
  }
  // back zig-zag, top → bottom
  shape.lineTo((3 * D) / 4, n * H);
  for (let i = n - 1; i >= 0; i--) {
    shape.lineTo(D, i * H + H / 2);
    shape.lineTo((3 * D) / 4, i * H);
  }
  shape.closePath();
  // one hexagonal hole per cell, inset by the fabric thickness
  const t = WALL;
  const tx = WALL * 1.2;
  for (let i = 0; i < n; i++) {
    const y0 = i * H;
    const y1 = y0 + H;
    const ym = y0 + H / 2;
    const hole = new THREE.Path();
    hole.moveTo(D / 4 + tx, y0 + t);
    hole.lineTo((3 * D) / 4 - tx, y0 + t);
    hole.lineTo(D - tx, ym);
    hole.lineTo((3 * D) / 4 - tx, y1 - t);
    hole.lineTo(D / 4 + tx, y1 - t);
    hole.lineTo(tx, ym);
    hole.closePath();
    shape.holes.push(hole);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false, steps: 1, curveSegments: 1 });
  geo.rotateY(Math.PI / 2); // extrusion (z) → +x, profile depth (x) → −z
  geo.translate(-w / 2, 0, 0);
  geo.computeBoundingSphere();
  return geo;
}

export function CellularShade(props: CoveringProps) {
  const { reveal, state, color } = props;
  const { innerW, innerTop, innerBottom } = clearOpening(props.width, props.height);
  const open = clamp01(finite(state.open, 0));

  // ---- layout (inside mount, in front of the mullions) -----------------------------------------
  const w = Math.max(0.04, innerW - 0.006);
  const backZ = mullionFrontZ(reveal) + 0.003;
  const headTop = innerTop - 0.003;
  const bodyTop = headTop - HEAD_H;
  const maxBody = Math.max(MIN_BODY, bodyTop - (innerBottom + 0.003 + RAIL_H));
  const nCells = clamp(Math.round(maxBody / CELL), 2, 200);
  const fullH = nCells * CELL;
  const bodyH = clamp(maxBody * (1 - open), MIN_BODY, maxBody);
  const railY = bodyTop - bodyH - RAIL_H / 2;

  // ---- geometry ---------------------------------------------------------------------------------
  const bodyGeo = useDisposable(() => buildHoneycomb(w, nCells), [w, nCells]);
  const headGeo = useDisposable(() => new RoundedBoxGeometry(w, HEAD_H, HEAD_D, 1, 0.003), [w]);
  const railGeo = useDisposable(() => new RoundedBoxGeometry(w, RAIL_H, RAIL_D, 1, 0.003), [w]);
  const tabGeo = useDisposable(() => new RoundedBoxGeometry(0.05, 0.012, 0.006, 1, 0.002), []);

  // ---- materials --------------------------------------------------------------------------------
  const maps = useFabricMaps('linen', 0.5);
  const translucent = (color.translucency ?? 0) > 0;
  const body = useDisposable(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: color.hex,
        normalMap: maps.normalMap ?? null,
        normalScale: maps.normalScale,
        roughnessMap: maps.roughnessMap ?? null,
        roughness: 1,
        metalness: 0,
        sheen: 0.3,
        sheenColor: lighten(color.hex, 0.4),
        sheenRoughness: 0.8,
        side: THREE.DoubleSide,
        transparent: translucent,
        opacity: translucent ? 0.9 : 1,
        envMapIntensity: 0.6,
      }),
    [color.hex, translucent, maps],
  );
  const alu = useDisposable(
    () => new THREE.MeshStandardMaterial({ color: lighten(color.hex, 0.25).lerp(new THREE.Color('#c9cac7'), 0.5), metalness: 0.7, roughness: 0.4, envMapIntensity: 1 }),
    [color.hex],
  );

  return (
    <group name="cellular-shade">
      <mesh geometry={headGeo} material={alu} position={[0, headTop - HEAD_H / 2, backZ + HEAD_D / 2]} castShadow />
      <mesh geometry={bodyGeo} material={body} position={[0, bodyTop - bodyH, backZ + DEPTH]} scale={[1, bodyH / fullH, 1]} castShadow receiveShadow />
      <mesh geometry={railGeo} material={alu} position={[0, railY, backZ + RAIL_D / 2]} castShadow />
      {/* pull tab under the middle of the bottom rail */}
      <mesh geometry={tabGeo} material={alu} position={[0, railY - RAIL_H / 2 - 0.005, backZ + RAIL_D - 0.008]} />
    </group>
  );
}
