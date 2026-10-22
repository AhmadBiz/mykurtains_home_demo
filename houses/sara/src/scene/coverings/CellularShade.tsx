/**
 * CELLULAR (honeycomb) SHADE (store cellulaire): inside mount. A headrail, the honeycomb body and a
 * bottom rail. The body is a box 4 cm deep whose front/back faces carry a procedural pleat-band
 * texture (lit upper face / shaded lower face, one band per 2.5 cm cell) and whose side faces show
 * the honeycomb profile (a chain of hexagons). Body height = height · (1 − open), min 3 cm — the
 * cell count is fixed, so the cells visibly compress into a tight stack as the shade rises.
 * Light-filtering colours (translucency > 0) are slightly translucent (opacity 0.92).
 *
 * Local frame (see ./types.ts): origin = centre of the opening on the interior wall face,
 * +X along the wall, +Y up, +Z into the room; the glass is at z = −reveal. Inside mount at
 * z = −reveal · 0.4. Pure & prop-driven; the body is a unit-height box scaled in Y, so changing
 * `open` never rebuilds geometry.
 */
import * as THREE from 'three';
import type { CoveringProps } from './types';
import { clamp, clamp01, makeCanvasTexture, safeSize, useDisposable } from './fabric';

/** Cell pitch when fully lowered (m). */
const CELL = 0.025;
/** Body depth (m). */
const DEPTH = 0.04;
const HEADRAIL_H = 0.045;
const HEADRAIL_D = 0.05;
const RAIL_H = 0.02;
const RAIL_D = 0.045;
/** Compressed stack height when fully raised (m). */
const MIN_BODY = 0.03;

/**
 * Grey-scale textures (tinted by the material colour), one cell tall, built lazily once and
 * shared by every cellular shade in the scene. Vertical tiling comes from scaled geometry UVs.
 */
let shared: { front: THREE.CanvasTexture; side: THREE.CanvasTexture } | null = null;
function sharedTextures() {
  if (!shared) {
    shared = {
      front: makeCanvasTexture(8, 64, (ctx, w, h) => {
        // one cell seen from the front: the upper face catches the light, the lower face is in
        // shadow, with a crisp crease between them and a bright fold line at the top
        const upper = ctx.createLinearGradient(0, 0, 0, h / 2);
        upper.addColorStop(0, '#ffffff');
        upper.addColorStop(1, '#e2e2e2');
        ctx.fillStyle = upper;
        ctx.fillRect(0, 0, w, h / 2);
        const lower = ctx.createLinearGradient(0, h / 2, 0, h);
        lower.addColorStop(0, '#a6a6a6');
        lower.addColorStop(1, '#d0d0d0');
        ctx.fillStyle = lower;
        ctx.fillRect(0, h / 2, w, h / 2);
        ctx.fillStyle = '#8a8a8a';
        ctx.fillRect(0, h / 2 - 1, w, 2);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, 1);
      }),
      side: makeCanvasTexture(32, 64, (ctx, w, h) => {
        // one cell seen from the side: a hexagon with its points at the front and back faces and
        // flat top / bottom edges shared with the neighbouring cells
        ctx.fillStyle = '#b4b4b4';
        ctx.fillRect(0, 0, w, h);
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w * 0.25, 0);
        ctx.lineTo(w * 0.75, 0);
        ctx.lineTo(w, h / 2);
        ctx.lineTo(w * 0.75, h);
        ctx.lineTo(w * 0.25, h);
        ctx.closePath();
        ctx.fillStyle = '#e8e8e8';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#7f7f7f';
        ctx.stroke();
      }),
    };
  }
  return shared;
}

export function CellularShade(props: CoveringProps) {
  const { reveal, state, color } = props;
  const width = safeSize(props.width);
  const height = safeSize(props.height);
  const open = clamp01(Number.isFinite(state.open) ? state.open : 0);

  // inside mount, a little in front of the glass
  const z0 = -Math.max(0, Number.isFinite(reveal) ? reveal : 0) * 0.4;
  const w = Math.max(0.04, width - 0.012); // clear the jambs
  const topY = height / 2;
  const usable = Math.max(MIN_BODY, height - HEADRAIL_H - RAIL_H);
  const bodyH = clamp(height * (1 - open) - HEADRAIL_H - RAIL_H, MIN_BODY, usable);
  const bodyTop = topY - HEADRAIL_H;
  const nCells = clamp(Math.round(height / CELL), 2, 200);

  // ---- geometry: a unit-height box, scaled in Y; UVs pre-scaled so one texture tile = one cell ----
  const bodyGeo = useDisposable(() => {
    const g = new THREE.BoxGeometry(w - 0.004, 1, DEPTH);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * nCells);
    uv.needsUpdate = true;
    return g;
  }, [w, nCells]);
  const headGeo = useDisposable(() => new THREE.BoxGeometry(w, HEADRAIL_H, HEADRAIL_D), [w]);
  const railGeo = useDisposable(() => new THREE.BoxGeometry(w, RAIL_H, RAIL_D), [w]);
  const tabGeo = useDisposable(() => new THREE.BoxGeometry(0.03, 0.012, 0.008), []);

  // ---- materials: BoxGeometry groups are [+x, −x, +y, −y, +z, −z] ----------------------------------
  const translucent = (color.translucency ?? 0) > 0;
  const mats = useDisposable(() => {
    const { front, side } = sharedTextures();
    const base: THREE.MeshStandardMaterialParameters = {
      color: color.hex,
      roughness: 0.92,
      transparent: translucent,
      opacity: translucent ? 0.92 : 1,
    };
    const f = new THREE.MeshStandardMaterial({ ...base, map: front });
    const s = new THREE.MeshStandardMaterial({ ...base, map: side });
    const cap = new THREE.MeshStandardMaterial(base);
    return {
      array: [s, s, cap, cap, f, f] as THREE.Material[],
      dispose() {
        f.dispose();
        s.dispose();
        cap.dispose();
      },
    };
  }, [color.hex, translucent]);
  const rail = useDisposable(() => new THREE.MeshStandardMaterial({ color: color.hex, roughness: 0.55 }), [color.hex]);

  const railY = bodyTop - bodyH - RAIL_H / 2;

  return (
    <group>
      <mesh geometry={headGeo} material={rail} position={[0, topY - HEADRAIL_H / 2, z0]} />
      <mesh geometry={bodyGeo} material={mats.array} position={[0, bodyTop - bodyH / 2, z0]} scale={[1, bodyH, 1]} castShadow receiveShadow />
      <mesh geometry={railGeo} material={rail} position={[0, railY, z0]} />
      {/* pull tab on the front of the bottom rail */}
      <mesh geometry={tabGeo} material={rail} position={[0, railY - RAIL_H / 2 - 0.004, z0 + RAIL_D / 2 - 0.01]} />
    </group>
  );
}
