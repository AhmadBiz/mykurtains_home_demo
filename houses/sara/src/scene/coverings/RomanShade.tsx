/**
 * ROMAN SHADE (store romain): an inside-mounted fabric panel exactly the width of the opening,
 * hanging from a white headrail box. Lowered length = height · (1 − open). The fabric carries a
 * soft cosine fold pattern (≈ 22 cm folds, deepening toward the hem, with a weighted hem bar);
 * as the shade rises the gathered fabric stacks under the headrail as a bundle of horizontal
 * folds whose thickness = open · 0.12 m. The 'stripe' colour option (accent set) gets thin
 * vertical ticking stripes from a tiny CanvasTexture.
 *
 * Local frame (see ./types.ts): origin = centre of the opening on the interior wall face,
 * +X along the wall, +Y up, +Z into the room; the glass is at z = −reveal. Inside mount at
 * z = −reveal · 0.4. Pure & prop-driven: geometry rebuilt only when the quantised `open` changes.
 */
import * as THREE from 'three';
import type { CoveringProps } from './types';
import { clamp, clamp01, makeCanvasTexture, makeFabricMaterial, quantizeOpen, safeSize, smoothstep, useDisposable } from './fabric';

/** Fold pitch (m). */
const FOLD = 0.22;
/** Fold depth at the hem of a fully lowered shade (m). */
const FOLD_AMP = 0.02;
const HEADRAIL_H = 0.05;
const HEADRAIL_D = 0.07;
/** Thickness of the raised bundle at open = 1 (m). */
const STACK_MAX = 0.12;
/** Radius of one bundled fold (m). */
const BUNDLE_R = 0.032;
/** Horizontal repeat of the ticking-stripe texture (m). */
const STRIPE_PITCH = 0.06;

/**
 * The hanging fabric: a plane whose top edge is at y = 0 (under the headrail) and which hangs down
 * to y = −length, displaced in +Z by soft folds. The fold phase is anchored at the hem so the
 * bottom edge is always the crest of a fold; the first 8 cm lie flat against the headrail.
 */
function buildRomanPanel(w: number, length: number, fullHeight: number): THREE.BufferGeometry {
  const L = Math.max(0.01, length);
  const segY = clamp(Math.round(L / 0.02), 2, 120);
  const geo = new THREE.PlaneGeometry(w, L, 2, segY);
  geo.translate(0, -L / 2, 0);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const d = -pos.getY(i); // distance below the headrail
    const s = L - d; // distance above the hem
    const amp = FOLD_AMP * (0.3 + 0.7 * clamp01(d / fullHeight)); // folds deepen toward the bottom
    const attach = smoothstep(0, 0.08, d);
    const fold = 0.5 + 0.5 * Math.cos((s / FOLD) * Math.PI * 2);
    pos.setZ(i, amp * attach * fold);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

export function RomanShade(props: CoveringProps) {
  const { reveal, state, color } = props;
  const width = safeSize(props.width);
  const height = safeSize(props.height);
  const open = quantizeOpen(state.open, 40);

  // inside mount, a little in front of the glass
  const z0 = -Math.max(0, Number.isFinite(reveal) ? reveal : 0) * 0.4;
  const w = Math.max(0.04, width - 0.012); // clear the jambs
  const topY = height / 2;
  const fabricTop = topY - HEADRAIL_H;
  const maxDrop = Math.max(0.01, height - HEADRAIL_H);
  const L = clamp(height * (1 - open), 0, maxDrop); // visible lowered length
  const showFabric = L > 0.02;

  // ---- geometry ---------------------------------------------------------------------------------
  const panel = useDisposable(() => (showFabric ? buildRomanPanel(w, L, height) : null), [showFabric, w, L, height]);
  const headGeo = useDisposable(() => new THREE.BoxGeometry(w, HEADRAIL_H, HEADRAIL_D), [w]);
  const hemGeo = useDisposable(() => new THREE.BoxGeometry(w, 0.018, 0.012), [w]);
  const bundleGeo = useDisposable(() => {
    const g = new THREE.CylinderGeometry(BUNDLE_R, BUNDLE_R, Math.max(0.02, w - 0.004), 12, 1);
    g.rotateZ(Math.PI / 2); // along X
    return g;
  }, [w]);

  // ---- materials --------------------------------------------------------------------------------
  const accent = color.accent;
  const stripes = useDisposable(() => {
    if (!accent) return null;
    const tex = makeCanvasTexture(48, 4, (ctx, cw, ch) => {
      ctx.fillStyle = color.hex;
      ctx.fillRect(0, 0, cw, ch);
      ctx.fillStyle = accent;
      // a pair of thin ticking lines every STRIPE_PITCH
      ctx.fillRect(6, 0, 2, ch);
      ctx.fillRect(11, 0, 2, ch);
    });
    tex.repeat.set(w / STRIPE_PITCH, 1);
    return tex;
  }, [accent, color.hex, w]);
  const fabric = useDisposable(
    () => makeFabricMaterial({ hex: color.hex, roughness: color.roughness ?? 0.95, map: stripes }),
    [color.hex, color.roughness, stripes],
  );
  // the bundle's UVs wrap around the cylinder, so it gets the plain colour (stripes would turn into rings)
  const plain = useDisposable(
    () => makeFabricMaterial({ hex: color.hex, roughness: color.roughness ?? 0.95, side: THREE.FrontSide }),
    [color.hex, color.roughness],
  );
  const white = useDisposable(() => new THREE.MeshStandardMaterial({ color: '#f4f3ef', roughness: 0.55 }), []);

  // ---- raised bundle: a few overlapping horizontal folds under the headrail ---------------------
  const thickness = open * STACK_MAX;
  const layers = thickness < 0.015 ? 0 : clamp(Math.ceil(thickness / 0.03), 1, 5);
  const bundle: [number, number, number][] = [];
  for (let i = 0; i < layers; i++) {
    const t = layers > 1 ? i / (layers - 1) : 0;
    bundle.push([0, fabricTop - 0.07 - 0.02 * i, z0 + BUNDLE_R + Math.max(0, thickness - 2 * BUNDLE_R) * t]);
  }
  // the hem is the crest of a fold: put the weight bar on that crest
  const hemZ = z0 + FOLD_AMP * (0.3 + 0.7 * clamp01(L / height)) + 0.004;

  return (
    <group>
      <mesh geometry={headGeo} material={white} position={[0, topY - HEADRAIL_H / 2, z0]} />
      {panel && <mesh geometry={panel} material={fabric} position={[0, fabricTop, z0]} castShadow receiveShadow />}
      {panel && <mesh geometry={hemGeo} material={fabric} position={[0, fabricTop - L, hemZ]} />}
      {bundle.map((p, i) => (
        <mesh key={i} geometry={bundleGeo} material={plain} position={p} castShadow />
      ))}
    </group>
  );
}
