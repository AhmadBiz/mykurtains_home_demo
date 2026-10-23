import type { LevelStructure } from './build';
import { K } from './keys';
import { renderFlags } from './materials';
import type { StructureMaterials } from './materials';

interface Props {
  data: LevelStructure;
  materials: StructureMaterials;
  visible: boolean;
  ceilingVisible: boolean;
}

/** Renders one storey: merged parts (one mesh per material), the slab and the ceiling. */
export function StructureLevel({ data, materials, visible, ceilingVisible }: Props) {
  return (
    <group visible={visible}>
      {data.parts.map((p) => {
        const f = renderFlags(p.key);
        return (
          <mesh
            key={p.key}
            geometry={p.geometry}
            material={materials.get(p.key)}
            castShadow={f.castShadow}
            receiveShadow={f.receiveShadow}
            renderOrder={f.transparent ? 10 : 0}
          />
        );
      })}
      <mesh geometry={data.slab} material={materials.get(K.slab)} castShadow receiveShadow />
      <mesh geometry={data.ceiling} material={materials.get(K.ceiling)} visible={ceilingVisible} receiveShadow />
    </group>
  );
}
