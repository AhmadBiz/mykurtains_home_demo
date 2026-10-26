import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { LEVEL_ORDER } from '../data/geometry';
import { useStore } from '../store/useStore';
import { buildFurniture } from './furniture/layout';
import type { InstanceGroup } from './furniture/builder';
import { instanceParts } from './furniture/instances';
import type { InstancePart } from './furniture/instances';
import { castsShadow, isTransparent, useFurnitureMaterials } from './furniture/materials';
import type { FurnitureMaterials } from './furniture/materials';

/**
 * Furniture and fixtures so every room reads as what it is: beds with bedding, sofas with
 * cushions, the dining set, a kitchen with a range on the island, bathrooms with tubs / showers /
 * vanities, the laundry, the mechanical room, the car in the garage, the games room…
 *
 * Everything is procedural (rounded boxes, lathes, tapered cylinders, bent leaves) textured from
 * the shared PBR pack at real-world scale and positioned from `HOUSE.rooms` bounds
 * (furniture/layout.ts). Per storey, all primitives sharing a material are merged into one mesh
 * and repeated items (chairs, stools, hangers, pulls, books, jars, fruit, leaves) are
 * InstancedMeshes: ≈ 45–55 draw calls per storey. Built once; in orbit mode the storeys above
 * `orbitLevel` are hidden, like the structure.
 */
export function Furniture() {
  const materials = useFurnitureMaterials();
  const levels = useMemo(() => buildFurniture(), []);
  const mode = useStore((s) => s.mode);
  const orbitLevel = useStore((s) => s.orbitLevel);
  const orbitIdx = LEVEL_ORDER.indexOf(orbitLevel);

  useEffect(
    () => () => {
      for (const id of LEVEL_ORDER) for (const p of levels[id].parts) p.geometry.dispose();
    },
    [levels],
  );

  return (
    <group name="furniture">
      {LEVEL_ORDER.map((id, i) => (
        <group key={id} visible={mode !== 'orbit' || i <= orbitIdx}>
          {levels[id].parts.map((p) => (
            <mesh
              key={p.key}
              geometry={p.geometry}
              material={materials.get(p.key)}
              castShadow={castsShadow(p.key)}
              receiveShadow
              renderOrder={isTransparent(p.key) ? 10 : 0}
            />
          ))}
          {levels[id].instances.map((g) =>
            instanceParts(g.kind).map((part, j) => <InstancedPart key={`${g.kind}:${j}`} group={g} part={part} materials={materials} />),
          )}
        </group>
      ))}
    </group>
  );
}

interface InstancedProps {
  group: InstanceGroup;
  part: InstancePart;
  materials: FurnitureMaterials;
}

/** One draw call for every copy of a part (chair frames, chair seats, books…). */
function InstancedPart({ group, part, materials }: InstancedProps) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    group.matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    if (part.colored) {
      group.colors.forEach((c, i) => mesh.setColorAt(i, c));
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    mesh.computeBoundingSphere();
  }, [group, part]);
  return (
    <instancedMesh
      ref={ref}
      args={[part.geometry, materials.get(part.key), group.matrices.length]}
      castShadow={part.castShadow}
      receiveShadow
      renderOrder={isTransparent(part.key) ? 10 : 0}
    />
  );
}
