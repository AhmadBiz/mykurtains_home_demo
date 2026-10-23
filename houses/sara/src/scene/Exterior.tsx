/**
 * Everything outside the walls: lawn + street + driveway + walkway + planting beds, exterior
 * steps, porch, balcony, side landing, the hip roof (one exact surface over the union of the roof
 * rectangles) and landscaping. Sub-components live in ./exterior; every textured surface uses the
 * shared texture pack at real-world scale (UVs in metres, see exterior/geom.ts and
 * exterior/materials.ts) and repeated parts are merged into single geometries.
 */
import { Ground } from './exterior/Ground';
import { ExteriorSteps } from './exterior/Steps';
import { Balcony, Porch, SideLanding } from './exterior/Platforms';
import { HipRoofs } from './exterior/Roof';
import { Landscaping } from './exterior/Landscaping';

export function Exterior() {
  return (
    <group name="exterior">
      <Ground />
      <ExteriorSteps />
      <Porch />
      <Balcony />
      <SideLanding />
      <HipRoofs />
      <Landscaping />
    </group>
  );
}
