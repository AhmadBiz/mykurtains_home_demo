/**
 * Everything outside the walls: lawn + street + driveway + walkway, exterior steps, porch,
 * balcony, side landing, hip roofs and landscaping. Sub-components live in ./exterior.
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
