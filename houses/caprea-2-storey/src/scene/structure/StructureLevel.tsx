import type { LevelStructure } from './build';
import { K } from './keys';
import { materialFor, renderFlags } from './materials';

interface Props {
  data: LevelStructure;
  visible: boolean;
  ceilingVisible: boolean;
}

/** Renders one storey: merged parts (one mesh per material), the slab and the ceiling. */
export function StructureLevel({ data, visible, ceilingVisible }: Props) {
  return (
    <group visible={visible}>
      {data.parts.map((p) => {
        const f = renderFlags(p.key);
        return (
          <mesh
            key={p.key}
            geometry={p.geometry}
            material={materialFor(p.key)}
            castShadow={f.castShadow}
            receiveShadow={f.receiveShadow}
            renderOrder={f.transparent ? 10 : 0}
          />
        );
      })}
      <mesh geometry={data.slab} material={materialFor(K.slab)} castShadow receiveShadow />
      <mesh geometry={data.ceiling} material={materialFor(K.ceiling)} visible={ceilingVisible} receiveShadow />
    </group>
  );
}
