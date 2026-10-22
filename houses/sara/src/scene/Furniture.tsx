import { useEffect, useMemo } from 'react';
import { LEVEL_ORDER } from '../data/geometry';
import { useStore } from '../store/useStore';
import { buildFurniture } from './furniture/layout';
import { castsShadow, furnitureMaterial, isTransparent } from './furniture/materials';

/**
 * Low-poly props so every room reads as what it is: seating, beds, kitchen, bathrooms, the car
 * in the garage, shelves, lamps, plants, rugs… Everything is procedural (boxes, cylinders,
 * spheres, lathes) and positioned from `HOUSE.rooms` bounds (see furniture/layout.ts).
 *
 * All primitives of a storey sharing a material are merged into one mesh, so the whole house
 * of furniture is ≈ 30 draw calls per storey. Built once; in orbit mode the storeys above
 * `orbitLevel` are hidden, like the structure.
 */
export function Furniture() {
  const levels = useMemo(() => buildFurniture(), []);
  const mode = useStore((s) => s.mode);
  const orbitLevel = useStore((s) => s.orbitLevel);
  const orbitIdx = LEVEL_ORDER.indexOf(orbitLevel);

  useEffect(
    () => () => {
      for (const id of LEVEL_ORDER) for (const p of levels[id]) p.geometry.dispose();
    },
    [levels],
  );

  return (
    <group name="furniture">
      {LEVEL_ORDER.map((id, i) => (
        <group key={id} visible={mode !== 'orbit' || i <= orbitIdx}>
          {levels[id].map((p) => (
            <mesh
              key={p.key}
              geometry={p.geometry}
              material={furnitureMaterial(p.key)}
              castShadow={castsShadow(p.key)}
              receiveShadow
              renderOrder={isTransparent(p.key) ? 10 : 0}
            />
          ))}
        </group>
      ))}
    </group>
  );
}
