/**
 * ROMAN SHADE (store romain): a flat-fold roman, inside-mounted in the reveal. A white headrail
 * board hidden by a short valance of the same fabric; the lowered fabric hangs flat with soft
 * horizontal folds every 20 cm (cosine profile, 1.5 cm deep); as the shade rises, the fabric
 * folds up accordion-style into a stack of overlapping loops at the hem (one 8 cm deep loop per
 * 20 cm of raised fabric, stacking 3 cm per fold), which ends up just under the headrail when
 * fully raised. Fabric-wrapped weight bar at the hem, lift cords on the right-hand side.
 * Linen texture; the 'stripe' colour multiplies its ticking stripes with the linen normal.
 *
 * Local frame (see ./types.ts): origin = centre of the opening on the interior wall face,
 * +X along the wall, +Y up, +Z into the room; the glass is at z = −reveal. Everything hangs in
 * front of the window's mullions (see fabric.ts mullionFrontZ). Pure & prop-driven: no store
 * access; the panel geometry is rebuilt only when the quantised `open` changes.
 */
import * as THREE from 'three';
import { useLayoutEffect, useRef } from 'react';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { useIndoorEnvironment } from '../Lighting';
import type { CoveringProps } from './types';
import {
  clamp,
  clearOpening,
  fillInstances,
  makeCanvasTexture,
  makeDrapeMaterial,
  mergeParts,
  mullionFrontZ,
  quantizeOpen,
  smoothstep,
  useDisposable,
  useFabricMaps,
} from './fabric';

/** Fold pitch of the lowered fabric (m). */
const FOLD = 0.2;
/** Depth of the soft folds on the lowered fabric (m). */
const FOLD_AMP = 0.015;
/** Each raised fold adds this much to the stack (m). */
const STACK_PITCH = 0.03;
/** One stacked fold: a fabric loop 8 cm deep and 7 cm tall. */
const LOOP_DEPTH = 0.08;
const LOOP_HALF_H = 0.035;
const HEAD_H = 0.045;
const HEAD_D = 0.05;
const VALANCE_H = 0.14;
/** Weighted hem bar wrapped in the fabric. */
const BAR_H = 0.02;
const BAR_D = 0.012;
/** Horizontal repeat of the ticking stripes (m). */
const STRIPE_PITCH = 0.06;
const CORD_R = 0.0015;

/**
 * The lowered fabric: a plane whose top edge is at y = 0 (under the headrail) hanging down to
 * y = −length, displaced in +Z by soft cosine folds anchored at the hem (the bottom edge is the
 * crest of a fold, flowing into the stacked loops below); the first 8 cm lie flat against the
 * headrail. UVs in metres (u across from the left edge, v up from the hem).
 */
function buildRomanPanel(w: number, length: number): THREE.BufferGeometry {
  const L = Math.max(0.01, length);
  const segY = clamp(Math.round(L / 0.015), 2, 160);
  const geo = new THREE.PlaneGeometry(w, L, 4, segY);
  geo.translate(0, -L / 2, 0);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const d = -pos.getY(i); // distance below the headrail
    const s = L - d; // distance above the hem
    const attach = smoothstep(0, 0.08, d);
    const fold = 0.5 + 0.5 * Math.cos((s / FOLD) * Math.PI * 2);
    pos.setZ(i, FOLD_AMP * attach * fold);
    uv.setXY(i, pos.getX(i) + w / 2, s);
  }
  pos.needsUpdate = true;
  uv.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * One stacked fold: a fabric loop (half-tube, axis along X, bulging toward +Z) `w` long, with
 * UVs in metres (u along X, v around the loop) so the stripes run over the folds.
 */
function buildLoop(w: number): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(1, 1, w, 20, 1, true, -Math.PI / 2, Math.PI);
  geo.rotateZ(-Math.PI / 2); // axis → X, the open half faces −Z (the window)
  geo.scale(1, LOOP_HALF_H, LOOP_DEPTH);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const arc = (Math.PI * (LOOP_HALF_H + LOOP_DEPTH)) / 2; // ≈ half-ellipse length
  for (let i = 0; i < pos.count; i++) {
    const around = Math.atan2(pos.getZ(i) / LOOP_DEPTH, pos.getY(i) / LOOP_HALF_H) / Math.PI; // 0 top … 1 bottom
    uv.setXY(i, pos.getX(i) + w / 2, around * arc);
  }
  uv.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** Two lift cords hanging from the headrail with a small cord weight at the bottom. */
function buildCords(len: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const dz of [-0.004, 0.004]) parts.push(new THREE.CylinderGeometry(CORD_R, CORD_R, len, 6, 1).translate(0, -len / 2, dz));
  parts.push(new THREE.CylinderGeometry(0.004, 0.005, 0.035, 10, 1).translate(0, -len - 0.0175, 0));
  return mergeParts(parts);
}

export function RomanShade(props: CoveringProps) {
  const { reveal, state, color } = props;
  const { innerW, innerTop, innerBottom } = clearOpening(props.width, props.height);
  const open = quantizeOpen(state.open, 40);

  // ---- layout (inside mount, in front of the mullions) -----------------------------------------
  const w = Math.max(0.04, innerW - 0.006);
  const backZ = mullionFrontZ(reveal) + 0.003;
  const headTop = innerTop - 0.003;
  const panelZ = backZ + HEAD_D + 0.002; // fabric hangs in front of the headrail board
  const fabricTop = headTop - 0.01;
  const usable = Math.max(0.05, fabricTop - (innerBottom + 0.012)); // fully lowered drop
  const maxFolds = Math.max(1, Math.round(usable / FOLD));
  const drop = usable * (1 - open);
  const folds = clamp(Math.round((open * usable) / FOLD), 0, maxFolds);
  const stackH = folds * STACK_PITCH;
  const flat = Math.max(0, drop - stackH); // flat fabric above the stack
  const showFlat = flat > 0.02;
  const stackTop = fabricTop - flat;
  const hemY = stackTop - stackH - BAR_H / 2;
  const cordLen = clamp(usable * 0.45, 0.15, 0.9);

  // ---- geometry ---------------------------------------------------------------------------------
  const panel = useDisposable(() => (showFlat ? buildRomanPanel(w, flat) : null), [showFlat, w, flat]);
  const headGeo = useDisposable(() => new RoundedBoxGeometry(w, HEAD_H, HEAD_D, 1, 0.003), [w]);
  const valanceGeo = useDisposable(() => {
    const g = new THREE.PlaneGeometry(w, VALANCE_H, 1, 1);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) + w / 2, pos.getY(i) + VALANCE_H / 2 + 2); // offset so the stripes continue
    uv.needsUpdate = true;
    return g;
  }, [w]);
  const barGeo = useDisposable(() => new RoundedBoxGeometry(w + 0.004, BAR_H, BAR_D, 1, 0.003), [w]);
  const loopGeo = useDisposable(() => buildLoop(w), [w]);
  const cordGeo = useDisposable(() => buildCords(cordLen), [cordLen]);

  // ---- materials --------------------------------------------------------------------------------
  const maps = useFabricMaps('linen');
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
    tex.repeat.set(1 / STRIPE_PITCH, 1);
    return tex;
  }, [accent, color.hex]);
  const env = useIndoorEnvironment();
  const fabric = useDisposable(() => makeDrapeMaterial({ hex: color.hex, kind: 'linen', maps, map: stripes, envMap: env }), [color.hex, maps, stripes, env]);
  const white = useDisposable(() => new THREE.MeshStandardMaterial({ color: '#f4f3ef', roughness: 0.55, metalness: 0.05 }), []);
  const cord = useDisposable(() => new THREE.MeshStandardMaterial({ color: '#e6e1d6', roughness: 0.85 }), []);

  // ---- stacked folds: overlapping loops from the bottom of the flat fabric down to the hem ------
  const loops = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const im = loops.current;
    if (!im) return;
    const positions: [number, number, number][] = [];
    for (let i = 0; i < folds; i++) positions.push([0, stackTop - STACK_PITCH * i - LOOP_HALF_H + 0.004, panelZ]);
    fillInstances(im, positions);
    // (loopGeo / fabric are in the deps because a change of either makes R3F rebuild the mesh)
  }, [folds, stackTop, panelZ, loopGeo, fabric]);

  const hemZ = panelZ + (folds > 0 ? 0.012 : FOLD_AMP + 0.004);

  return (
    <group name="roman-shade">
      <mesh geometry={headGeo} material={white} position={[0, headTop - HEAD_H / 2, backZ + HEAD_D / 2]} />
      {panel && <mesh geometry={panel} material={fabric} position={[0, fabricTop, panelZ]} castShadow receiveShadow />}
      <instancedMesh key={maxFolds} ref={loops} args={[loopGeo, fabric, maxFolds]} castShadow receiveShadow />
      <mesh geometry={barGeo} material={fabric} position={[0, hemY, hemZ]} castShadow />
      <mesh geometry={valanceGeo} material={fabric} position={[0, headTop - VALANCE_H / 2, panelZ + 0.014]} castShadow />
      <mesh geometry={cordGeo} material={cord} position={[w / 2 - 0.03, headTop - HEAD_H, panelZ + 0.02]} />
    </group>
  );
}
