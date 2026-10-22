/**
 * Front porch (slab, foundation, two columns, small flat roof), rear balcony (composite deck,
 * posts, railing with instanced balusters, covered roof) and the side-door landing.
 * Bounds / heights come from HOUSE.platforms and HOUSE.ramps so they match groundHeightAt().
 */
import * as THREE from 'three';
import { useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { COLORS, EXT_HALF_WALL, GRADE_Y, PLATFORMS, RAILING, SMALL_ROOF_THICKNESS, SMALL_ROOF_TOP, balconyStairRailX } from './data';
import { concreteTexture, plankTexture } from './textures';
import type { Vec3 } from './geom';
import { Instanced } from './Instanced';
import type { InstanceItem } from './Instanced';
import { useDispose } from './hooks';

const ROOF_BOTTOM = SMALL_ROOF_TOP - SMALL_ROOF_THICKNESS;
const FASCIA_T = 0.04;
const FASCIA_H = SMALL_ROOF_THICKNESS + 0.06;
const FASCIA_Y = (SMALL_ROOF_TOP + 0.02 + ROOF_BOTTOM - 0.04) / 2;

/** The small roofs sit at the upper-floor level: hide them in orbit mode unless that level is shown. */
function useSmallRoofVisible(): boolean {
  const mode = useStore((s) => s.mode);
  const orbitLevel = useStore((s) => s.orbitLevel);
  return mode !== 'orbit' || orbitLevel === 'upper';
}

function useRoofMaterials() {
  const membrane = useMemo(() => new THREE.MeshStandardMaterial({ color: COLORS.membrane, roughness: 0.95 }), []);
  const fascia = useMemo(() => new THREE.MeshStandardMaterial({ color: COLORS.fascia, roughness: 0.7 }), []);
  const soffit = useMemo(() => new THREE.MeshStandardMaterial({ color: COLORS.soffit, roughness: 0.9 }), []);
  useDispose(membrane, fascia, soffit);
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z
  const slab = useMemo(() => [soffit, soffit, membrane, soffit, soffit, soffit], [membrane, soffit]);
  return { slab, fascia };
}

type Edge = 'n' | 's' | 'e' | 'w';

interface FlatRoofProps {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  edges: Edge[];
}

/** Flat slab roof with a fascia band on the given edges (edges buried in a wall are omitted). */
function FlatRoof({ x1, z1, x2, z2, edges }: FlatRoofProps) {
  const { slab, fascia } = useRoofMaterials();
  const bands = useMemo(
    () =>
      edges.map((e): { position: Vec3; size: Vec3 } => {
        switch (e) {
          case 'n': return { position: [(x1 + x2) / 2, FASCIA_Y, z1 + FASCIA_T / 2], size: [x2 - x1, FASCIA_H, FASCIA_T] };
          case 's': return { position: [(x1 + x2) / 2, FASCIA_Y, z2 - FASCIA_T / 2], size: [x2 - x1, FASCIA_H, FASCIA_T] };
          case 'w': return { position: [x1 + FASCIA_T / 2, FASCIA_Y, (z1 + z2) / 2], size: [FASCIA_T, FASCIA_H, z2 - z1] };
          case 'e': return { position: [x2 - FASCIA_T / 2, FASCIA_Y, (z1 + z2) / 2], size: [FASCIA_T, FASCIA_H, z2 - z1] };
        }
      }),
    [edges, x1, x2, z1, z2],
  );
  return (
    <group>
      <mesh position={[(x1 + x2) / 2, (SMALL_ROOF_TOP + ROOF_BOTTOM) / 2, (z1 + z2) / 2]} material={slab} castShadow receiveShadow>
        <boxGeometry args={[x2 - x1, SMALL_ROOF_THICKNESS, z2 - z1]} />
      </mesh>
      {bands.map((b, i) => (
        <mesh key={i} position={b.position} material={fascia} castShadow>
          <boxGeometry args={b.size} />
        </mesh>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------------------------
// Front porch
// ---------------------------------------------------------------------------------------------
const SLAB_T = 0.2;
const COLUMN = 0.25;
const COLUMN_INSET = 0.17;

export function Porch() {
  const { bounds, y } = PLATFORMS.perron;
  const [x1, z1, x2, z2] = bounds;
  const slabMap = useMemo(() => concreteTexture([(x2 - x1) / 1.2, (z2 - z1) / 1.2]), [x1, x2, z1, z2]);
  const slab = useMemo(() => new THREE.MeshStandardMaterial({ map: slabMap, roughness: 0.9 }), [slabMap]);
  const foundation = useMemo(() => new THREE.MeshStandardMaterial({ color: COLORS.concreteDark, roughness: 0.9 }), []);
  const column = useMemo(() => new THREE.MeshStandardMaterial({ color: COLORS.fascia, roughness: 0.7 }), []);
  useDispose(slabMap, slab, foundation, column);
  const roofVisible = useSmallRoofVisible();
  const foundationTop = y - SLAB_T;
  const foundationBottom = GRADE_Y - 0.05;
  return (
    <group name="porch">
      <mesh position={[(x1 + x2) / 2, y - SLAB_T / 2, (z1 + z2) / 2]} material={slab} castShadow receiveShadow>
        <boxGeometry args={[x2 - x1, SLAB_T, z2 - z1]} />
      </mesh>
      <mesh position={[(x1 + 0.04 + x2) / 2, (foundationTop + foundationBottom) / 2, (z1 + z2) / 2]} material={foundation}>
        <boxGeometry args={[x2 - x1 - 0.04, foundationTop - foundationBottom, z2 - z1 - 0.08]} />
      </mesh>
      {[z1 + COLUMN_INSET, z2 - COLUMN_INSET].map((z) => (
        <mesh key={z} position={[x1 + COLUMN_INSET, (y + ROOF_BOTTOM) / 2, z]} material={column} castShadow>
          <boxGeometry args={[COLUMN, ROOF_BOTTOM - y, COLUMN]} />
        </mesh>
      ))}
      <group visible={roofVisible}>
        {/* east edge tucks into the upper-storey front wall (X = 0), so no fascia there */}
        <FlatRoof x1={x1 - 0.35} z1={z1 - 0.04} x2={-EXT_HALF_WALL + 0.05} z2={z2 + 0.35} edges={['n', 's', 'w']} />
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------------------------
// Rear balcony
// ---------------------------------------------------------------------------------------------
const DECK_T = 0.15;
const POST = 0.14;

interface RailSegment {
  axis: 'x' | 'z';
  at: number;
  from: number;
  to: number;
}

export function Balcony() {
  const { bounds, y } = PLATFORMS.balcon;
  const [x1, z1, x2, z2] = bounds;
  const wallN = z1 + EXT_HALF_WALL; // outer face of the dining-room wall
  const wallW = x1 + EXT_HALF_WALL; // outer face of the kitchen wall
  const rx = x2 - 0.08; // east railing line
  const rz = z2 - 0.08; // south railing line
  const [railXa, railXb] = balconyStairRailX();

  const deckMap = useMemo(() => plankTexture({ base: [138, 106, 75], variation: 0.1, planks: 8, gap: 2, seed: 17, repeat: [(x2 - x1) / 1.12, (z2 - z1) / 1.12] }), [x1, x2, z1, z2]);
  const deckTop = useMemo(() => new THREE.MeshStandardMaterial({ map: deckMap, roughness: 0.85 }), [deckMap]);
  const deckEdge = useMemo(() => new THREE.MeshStandardMaterial({ color: COLORS.deck, roughness: 0.85 }), []);
  const post = useMemo(() => new THREE.MeshStandardMaterial({ color: COLORS.post, roughness: 0.85 }), []);
  const rail = useMemo(() => new THREE.MeshStandardMaterial({ color: COLORS.rail, roughness: 0.8 }), []);
  const balusterGeom = useMemo(() => new THREE.BoxGeometry(RAILING.balusterSize, RAILING.height - 0.15, RAILING.balusterSize), []);
  useDispose(deckMap, deckTop, deckEdge, post, rail, balusterGeom);
  const deckMats = useMemo(() => [deckEdge, deckEdge, deckTop, deckEdge, deckEdge, deckEdge], [deckEdge, deckTop]);
  const roofVisible = useSmallRoofVisible();

  const roofPosts = useMemo<[number, number][]>(() => [[rx, wallN + 0.08], [rx, rz]], [rx, rz, wallN]);
  const railPosts = useMemo<[number, number][]>(() => [[wallW + 0.06, rz], [railXa, rz], [railXb, rz]], [wallW, rz, railXa, railXb]);
  const supportPosts = useMemo<[number, number][]>(
    () => [[x2 - 0.1, wallN + 0.1], [x2 - 0.1, z2 - 0.1], [x2 - 0.1, (wallN + z2) / 2], [wallW + 0.1, z2 - 0.1], [(wallW + x2) / 2, z2 - 0.1]],
    [x2, z2, wallN, wallW],
  );

  const segments = useMemo<RailSegment[]>(() => {
    const p = RAILING.postSize / 2;
    const segs: RailSegment[] = [
      { axis: 'z', at: rx, from: wallN + 0.08 + POST / 2, to: rz - POST / 2 },
      { axis: 'x', at: rz, from: wallW + 0.06 + p, to: railXa - p },
      { axis: 'x', at: rz, from: railXb + p, to: rx - POST / 2 },
    ];
    return segs.filter((s) => s.to - s.from > 0.08);
  }, [rx, rz, wallN, wallW, railXa, railXb]);

  const balusters = useMemo<InstanceItem[]>(() => {
    const items: InstanceItem[] = [];
    const cy = y + 0.1 + (RAILING.height - 0.15) / 2;
    for (const s of segments) {
      const len = s.to - s.from;
      const n = Math.max(1, Math.floor(len / RAILING.balusterSpacing));
      const step = len / (n + 1);
      for (let k = 1; k <= n; k++) {
        const t = s.from + step * k;
        items.push({ position: s.axis === 'x' ? [t, cy, s.at] : [s.at, cy, t] });
      }
    }
    return items;
  }, [segments, y]);

  const railTopY = y + RAILING.height - 0.025;
  const railBottomY = y + 0.08;
  const postTop = y + RAILING.height + 0.03;

  return (
    <group name="balcony">
      {/* deck */}
      <mesh position={[(x1 + x2) / 2, y - DECK_T / 2, (z1 + z2) / 2]} material={deckMats} castShadow receiveShadow>
        <boxGeometry args={[x2 - x1, DECK_T, z2 - z1]} />
      </mesh>
      {/* structural posts under the deck */}
      {supportPosts.map(([px, pz], i) => (
        <mesh key={`s${i}`} position={[px, (GRADE_Y - 0.05 + y - DECK_T) / 2, pz]} material={post} castShadow>
          <boxGeometry args={[POST, y - DECK_T - (GRADE_Y - 0.05), POST]} />
        </mesh>
      ))}
      {/* roof posts on the two outer (east) corners — they double as railing end posts */}
      {roofPosts.map(([px, pz], i) => (
        <mesh key={`r${i}`} position={[px, (y + ROOF_BOTTOM) / 2, pz]} material={post} castShadow>
          <boxGeometry args={[POST, ROOF_BOTTOM - y, POST]} />
        </mesh>
      ))}
      {/* railing posts (south edge, flanking the stair opening) */}
      {railPosts.map(([px, pz], i) => (
        <mesh key={`p${i}`} position={[px, (y + postTop) / 2, pz]} material={post} castShadow>
          <boxGeometry args={[RAILING.postSize, postTop - y, RAILING.postSize]} />
        </mesh>
      ))}
      {/* rails */}
      {segments.map((s, i) => {
        const len = s.to - s.from;
        const mid = (s.from + s.to) / 2;
        const top: Vec3 = s.axis === 'x' ? [len, 0.05, 0.09] : [0.09, 0.05, len];
        const bottom: Vec3 = s.axis === 'x' ? [len, 0.04, 0.05] : [0.05, 0.04, len];
        const at = (yy: number): Vec3 => (s.axis === 'x' ? [mid, yy, s.at] : [s.at, yy, mid]);
        return (
          <group key={i}>
            <mesh position={at(railTopY)} material={rail} castShadow>
              <boxGeometry args={top} />
            </mesh>
            <mesh position={at(railBottomY)} material={rail}>
              <boxGeometry args={bottom} />
            </mesh>
          </group>
        );
      })}
      <Instanced geometry={balusterGeom} material={rail} items={balusters} castShadow />
      {/* covered roof */}
      <group visible={roofVisible}>
        <FlatRoof x1={x1 - 0.06} z1={z1 - 0.06} x2={x2 + 0.3} z2={z2 + 0.3} edges={['n', 's', 'e', 'w']} />
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------------------------
// Side-door landing
// ---------------------------------------------------------------------------------------------
export function SideLanding() {
  const { bounds, y } = PLATFORMS.sideLanding;
  const [x1, z1, x2, z2] = bounds;
  const concrete = useMemo(() => new THREE.MeshStandardMaterial({ color: COLORS.concrete, roughness: 0.9 }), []);
  useDispose(concrete);
  const bottom = GRADE_Y - 0.05;
  return (
    <mesh name="side-landing" position={[(x1 + x2) / 2, (bottom + y) / 2, (z1 + z2) / 2]} material={concrete} castShadow receiveShadow>
      <boxGeometry args={[x2 - x1, y - bottom, z2 - z1]} />
    </mesh>
  );
}
