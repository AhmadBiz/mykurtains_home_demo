import * as THREE from 'three';
import { useMemo } from 'react';
import type { Vec3 } from './geom';

interface Props {
  from: Vec3;
  to: Vec3;
  /** Size across (local X, kept horizontal). */
  width: number;
  /** Size perpendicular to the run (local Y). */
  height: number;
  material: THREE.Material;
  castShadow?: boolean;
}

/** A box whose length axis runs from `from` to `to` (stringers, sloped handrails). */
export function SlopedBox({ from, to, width, height, material, castShadow = true }: Props) {
  const { position, quaternion, length } = useMemo(() => {
    const a = new THREE.Vector3(from[0], from[1], from[2]);
    const b = new THREE.Vector3(to[0], to[1], to[2]);
    const dir = b.clone().sub(a);
    const length = dir.length();
    dir.normalize();
    // local Z = run direction, local X horizontal, local Y = the remaining perpendicular
    const x = new THREE.Vector3(0, 1, 0).cross(dir);
    if (x.lengthSq() < 1e-8) x.set(1, 0, 0);
    x.normalize();
    const y = dir.clone().cross(x).normalize();
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, dir));
    return { position: a.add(b).multiplyScalar(0.5), quaternion: q, length };
  }, [from, to]);
  return (
    <mesh position={position} quaternion={quaternion} material={material} castShadow={castShadow}>
      <boxGeometry args={[width, height, length]} />
    </mesh>
  );
}
