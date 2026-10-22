/**
 * Trees (instanced trunks / cones / canopies), street-side hedge, shrubs by the porch, a mailbox
 * by the driveway and a picket fence on the rear and side property lines.
 * Keep-out zones: house footprint X -1.1..13.1 / Z -0.1..10.2 (+4 m), driveway, walkway, street.
 */
import * as THREE from 'three';
import { useMemo } from 'react';
import { COLORS, GRADE_Y, RAMPS, STREET } from './data';
import { Instanced } from './Instanced';
import type { InstanceItem } from './Instanced';
import type { Vec3 } from './geom';
import { leafTexture, mulberry32 } from './textures';
import { useDispose } from './hooks';

export function Landscaping() {
  return (
    <group name="landscaping">
      <Trees />
      <Hedge />
      <Shrubs />
      <Mailbox />
      <Fence />
    </group>
  );
}

// ---------------------------------------------------------------------------------------------
// Trees
// ---------------------------------------------------------------------------------------------
interface TreeSpec {
  x: number;
  z: number;
  kind: 'conifer' | 'round';
  /** Overall height (m). */
  h: number;
}

const TREES: TreeSpec[] = [
  { x: -9, z: -3, kind: 'round', h: 6.5 },
  { x: -7.5, z: 14, kind: 'conifer', h: 7 },
  { x: 17.5, z: 2, kind: 'round', h: 7.5 },
  { x: 18, z: 13.5, kind: 'conifer', h: 8 },
  { x: 6, z: 15.8, kind: 'round', h: 6 },
  { x: 4, z: -5.8, kind: 'round', h: 5.5 },
  { x: -10, z: 16.5, kind: 'conifer', h: 6 },
  { x: 24, z: -3, kind: 'round', h: 8 },
  { x: 26, z: 9, kind: 'conifer', h: 9 },
  { x: 12, z: -6.5, kind: 'round', h: 6 },
];
const ROUND_COLORS = ['#4f8a3f', '#5b9646', '#467d38'];
const CONIFER_COLORS = ['#2f5d36', '#35683c', '#2a5230'];

function Trees() {
  const trunkGeom = useMemo(() => new THREE.CylinderGeometry(0.6, 1, 1, 7), []);
  const coneGeom = useMemo(() => new THREE.ConeGeometry(1, 1, 8), []);
  const ballGeom = useMemo(() => new THREE.IcosahedronGeometry(1, 1), []);
  const trunkMat = useMemo(() => new THREE.MeshStandardMaterial({ color: COLORS.trunk, roughness: 0.95 }), []);
  const leafMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true }), []);
  useDispose(trunkGeom, coneGeom, ballGeom, trunkMat, leafMat);

  const { trunks, cones, balls } = useMemo(() => {
    const rnd = mulberry32(7);
    const trunks: InstanceItem[] = [];
    const cones: InstanceItem[] = [];
    const balls: InstanceItem[] = [];
    const base = GRADE_Y - 0.05;
    TREES.forEach((t, i) => {
      const yaw = rnd() * Math.PI * 2;
      const tr = 0.06 + t.h * 0.022;
      if (t.kind === 'conifer') {
        const tv = t.h * 0.15;
        trunks.push({ position: [t.x, base + (tv + 0.3) / 2, t.z], scale: [tr, tv + 0.3, tr] });
        const color = CONIFER_COLORS[i % CONIFER_COLORS.length];
        const tiers: [number, number, number][] = [
          [tv, t.h * 0.42, t.h * 0.26],
          [tv + t.h * 0.22, t.h * 0.38, t.h * 0.2],
          [tv + t.h * 0.42, t.h * 0.43, t.h * 0.14],
        ];
        for (const [b, hh, r] of tiers) cones.push({ position: [t.x, base + b + hh / 2, t.z], scale: [r, hh, r], rotation: [0, yaw, 0], color });
      } else {
        const th = t.h * 0.38;
        trunks.push({ position: [t.x, base + th / 2 + 0.2, t.z], scale: [tr, th + 0.4, tr] });
        const R = t.h * 0.3;
        const color = ROUND_COLORS[i % ROUND_COLORS.length];
        const offsets: [number, number, number, number][] = [
          [0, R * 0.75, 0, 1],
          [R * 0.45, R * 0.95, -R * 0.35, 0.72],
          [-R * 0.5, R * 0.9, R * 0.3, 0.7],
          [R * 0.2, R * 1.2, R * 0.4, 0.62],
        ];
        for (const [ox, oy, oz, k] of offsets) {
          const rx = ox * Math.cos(yaw) - oz * Math.sin(yaw);
          const rz = ox * Math.sin(yaw) + oz * Math.cos(yaw);
          balls.push({ position: [t.x + rx, base + th + oy, t.z + rz], scale: [R * k, R * k * 0.9, R * k], rotation: [0, rnd() * Math.PI, 0], color });
        }
      }
    });
    return { trunks, cones, balls };
  }, []);

  return (
    <group name="trees">
      <Instanced geometry={trunkGeom} material={trunkMat} items={trunks} castShadow />
      <Instanced geometry={coneGeom} material={leafMat} items={cones} castShadow />
      <Instanced geometry={ballGeom} material={leafMat} items={balls} castShadow />
    </group>
  );
}

// ---------------------------------------------------------------------------------------------
// Hedge along the street (gaps at the walkway, the driveway and the mailbox)
// ---------------------------------------------------------------------------------------------
const HEDGE_X = STREET.x2 + 1.0;
const HEDGE_W = 0.8;
const HEDGE_H = 1.1;

function Hedge() {
  const [, pz1] = RAMPS.perron.bounds;
  const [, , , dz2] = RAMPS.driveway.bounds;
  const runs = useMemo<[number, number][]>(() => [[-8, pz1 - 0.3], [dz2 + 0.9, 18]], [pz1, dz2]);
  const map = useMemo(() => leafTexture([12, 1.4]), []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map, roughness: 1 }), [map]);
  useDispose(map, mat);
  return (
    <group name="hedge">
      {runs.map(([za, zb], i) => (
        <mesh key={i} position={[HEDGE_X, GRADE_Y - 0.02 + HEDGE_H / 2, (za + zb) / 2]} material={mat} castShadow receiveShadow>
          <boxGeometry args={[HEDGE_W, HEDGE_H, zb - za]} />
        </mesh>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------------------------
// Shrubs near the porch
// ---------------------------------------------------------------------------------------------
const SHRUBS: [number, number, number][] = [
  [0.4, 1.6, 0.5],
  [0.4, 2.7, 0.55],
  [-0.5, 3.15, 0.45],
  [-3.2, 3.55, 0.5],
  [-4.6, 3.45, 0.45],
  [-6.5, 3.6, 0.4],
  [-1.9, 6.5, 0.3],
];
const SHRUB_COLORS = ['#3d7a3c', '#4b8a45', '#356d35'];

function Shrubs() {
  const geom = useMemo(() => new THREE.IcosahedronGeometry(1, 1), []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, flatShading: true }), []);
  useDispose(geom, mat);
  const items = useMemo<InstanceItem[]>(
    () => SHRUBS.map(([x, z, r], i) => ({ position: [x, GRADE_Y + r * 0.75, z], scale: [r, r * 0.85, r], rotation: [0, i * 0.9, 0], color: SHRUB_COLORS[i % SHRUB_COLORS.length] })),
    [],
  );
  return <Instanced geometry={geom} material={mat} items={items} castShadow />;
}

// ---------------------------------------------------------------------------------------------
// Mailbox by the driveway
// ---------------------------------------------------------------------------------------------
function Mailbox() {
  const [, , , dz2] = RAMPS.driveway.bounds;
  const postMat = useMemo(() => new THREE.MeshStandardMaterial({ color: COLORS.post, roughness: 0.9 }), []);
  const boxMat = useMemo(() => new THREE.MeshStandardMaterial({ color: COLORS.mailbox, roughness: 0.5, metalness: 0.3 }), []);
  const flagMat = useMemo(() => new THREE.MeshStandardMaterial({ color: COLORS.flag, roughness: 0.6 }), []);
  useDispose(postMat, boxMat, flagMat);
  return (
    <group name="mailbox" position={[STREET.x2 + 0.55, GRADE_Y, dz2 + 0.4]}>
      <mesh position={[0, 0.5, 0]} material={postMat} castShadow>
        <boxGeometry args={[0.1, 1.1, 0.1]} />
      </mesh>
      <mesh position={[0, 1.17, 0]} material={boxMat} castShadow>
        <boxGeometry args={[0.5, 0.24, 0.22]} />
      </mesh>
      <mesh position={[0.1, 1.2, 0.125]} material={flagMat}>
        <boxGeometry args={[0.03, 0.16, 0.02]} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------------------------
// Fence (rear and side property lines, with gate gaps)
// ---------------------------------------------------------------------------------------------
interface FenceLine {
  /** Axis the line runs along. */
  axis: 'x' | 'z';
  /** Fixed coordinate. */
  at: number;
  from: number;
  to: number;
  /** Direction (along the fixed axis) toward the house; pickets go on the other side. */
  inward: 1 | -1;
}

const FENCE_LINES: FenceLine[] = [
  { axis: 'z', at: 20, from: -8, to: 4, inward: -1 },
  { axis: 'z', at: 20, from: 5.2, to: 18, inward: -1 },
  { axis: 'x', at: -8, from: -12, to: 0, inward: 1 },
  { axis: 'x', at: -8, from: 1.2, to: 20, inward: 1 },
  { axis: 'x', at: 18, from: -12, to: 0, inward: -1 },
  { axis: 'x', at: 18, from: 1.2, to: 20, inward: -1 },
];
const FENCE_H = 1.2;
const PICKET_W = 0.09;
const PICKET_T = 0.018;
const PICKET_H = 1.15;
const PICKET_PITCH = 0.135;
const POST_PITCH = 2.4;
const PICKET_COLORS = ['#b08d62', '#a8865c', '#b9956a'];

function Fence() {
  const postGeom = useMemo(() => new THREE.BoxGeometry(0.1, FENCE_H + 0.1, 0.1), []);
  const picketGeom = useMemo(() => new THREE.BoxGeometry(PICKET_W, PICKET_H, PICKET_T), []);
  const wood = useMemo(() => new THREE.MeshStandardMaterial({ color: COLORS.fence, roughness: 0.9 }), []);
  const picketMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }), []);
  useDispose(postGeom, picketGeom, wood, picketMat);

  const { posts, pickets, rails } = useMemo(() => {
    const posts: InstanceItem[] = [];
    const pickets: InstanceItem[] = [];
    const rails: { position: Vec3; size: Vec3 }[] = [];
    const postY = GRADE_Y - 0.05 + (FENCE_H + 0.1) / 2;
    const picketY = GRADE_Y + 0.05 + PICKET_H / 2;
    let count = 0;
    for (const line of FENCE_LINES) {
      const len = line.to - line.from;
      const place = (t: number, off: number, yy: number): Vec3 => (line.axis === 'x' ? [t, yy, line.at + off] : [line.at + off, yy, t]);
      const n = Math.max(1, Math.ceil(len / POST_PITCH));
      for (let k = 0; k <= n; k++) posts.push({ position: place(line.from + (len * k) / n, 0, postY) });
      const railOff = -line.inward * 0.07;
      for (const yy of [GRADE_Y + 0.35, GRADE_Y + 0.95]) {
        rails.push({ position: place(line.from + len / 2, railOff, yy), size: line.axis === 'x' ? [len, 0.08, 0.04] : [0.04, 0.08, len] });
      }
      const picketOff = -line.inward * (0.09 + PICKET_T / 2);
      const rot: Vec3 = line.axis === 'x' ? [0, 0, 0] : [0, Math.PI / 2, 0];
      for (let t = line.from + 0.07; t <= line.to - 0.07; t += PICKET_PITCH) {
        pickets.push({ position: place(t, picketOff, picketY), rotation: rot, color: PICKET_COLORS[count++ % PICKET_COLORS.length] });
      }
    }
    return { posts, pickets, rails };
  }, []);

  return (
    <group name="fence">
      <Instanced geometry={postGeom} material={wood} items={posts} castShadow />
      <Instanced geometry={picketGeom} material={picketMat} items={pickets} castShadow />
      {rails.map((r, i) => (
        <mesh key={i} position={r.position} material={wood}>
          <boxGeometry args={r.size} />
        </mesh>
      ))}
    </group>
  );
}
