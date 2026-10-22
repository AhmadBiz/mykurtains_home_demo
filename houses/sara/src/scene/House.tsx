import { useMemo } from 'react';
import { LEVEL_ORDER } from '../data/geometry';
import { useStore } from '../store/useStore';
import { getStructure } from './structure/build';
import { StructureLevel } from './structure/StructureLevel';

/**
 * The built structure of the house: walls (openings cut out, brick / siding / concrete facade,
 * room paint inside), floor slabs + per-room finishes, ceilings, stairs + landings + railings,
 * door casings and open door leaves, front / side / garage doors.
 *
 * Geometry is merged by material (a few dozen draw calls for the whole house) and built once.
 * Honours `showCeilings`; in orbit mode hides every storey above `orbitLevel` and that storey's
 * ceiling so the dollhouse view looks into it.
 */
export function House() {
  const structure = useMemo(() => getStructure(), []);
  const mode = useStore((s) => s.mode);
  const orbitLevel = useStore((s) => s.orbitLevel);
  const showCeilings = useStore((s) => s.showCeilings);
  const orbitIdx = LEVEL_ORDER.indexOf(orbitLevel);

  return (
    <group name="house">
      {LEVEL_ORDER.map((id, i) => {
        const visible = mode !== 'orbit' || i <= orbitIdx;
        const ceilingVisible = showCeilings && (mode !== 'orbit' || i < orbitIdx);
        return <StructureLevel key={id} data={structure[id]} visible={visible} ceilingVisible={ceilingVisible} />;
      })}
    </group>
  );
}
