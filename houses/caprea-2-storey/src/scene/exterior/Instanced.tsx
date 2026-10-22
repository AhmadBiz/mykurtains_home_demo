import * as THREE from 'three';
import { useLayoutEffect, useRef } from 'react';
import type { Vec3 } from './geom';

export interface InstanceItem {
  position: Vec3;
  /** Uniform or per-axis scale (default 1). */
  scale?: Vec3 | number;
  /** Euler rotation [x, y, z] (default none). */
  rotation?: Vec3;
  /** Per-instance tint (multiplies the material colour; use a white material for exact colours). */
  color?: string;
}

interface Props {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  items: InstanceItem[];
  castShadow?: boolean;
  receiveShadow?: boolean;
}

/** One draw call for many copies of the same geometry (balusters, pickets, trees, stones…). */
export function Instanced({ geometry, material, items, castShadow = false, receiveShadow = false }: Props) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const e = new THREE.Euler();
    const c = new THREE.Color();
    items.forEach((it, i) => {
      p.set(it.position[0], it.position[1], it.position[2]);
      const rot = it.rotation ?? [0, 0, 0];
      e.set(rot[0], rot[1], rot[2]);
      q.setFromEuler(e);
      const sc = it.scale ?? 1;
      if (typeof sc === 'number') s.set(sc, sc, sc);
      else s.set(sc[0], sc[1], sc[2]);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
      c.set(it.color ?? '#ffffff');
      mesh.setColorAt(i, c);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items]);
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} castShadow={castShadow} receiveShadow={receiveShadow} />;
}
