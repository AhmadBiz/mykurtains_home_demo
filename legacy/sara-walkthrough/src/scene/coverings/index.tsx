import type { CoveringProps } from './types';
import { Curtains } from './Curtains';
import { Sheers } from './Sheers';
import { RollerBlind } from './RollerBlind';
import { RomanShade } from './RomanShade';
import { CellularShade } from './CellularShade';
import { VenetianBlind } from './VenetianBlind';
import { VerticalBlind } from './VerticalBlind';
import { Shutters } from './Shutters';

/** Dispatches to the right covering component for the window's current state. */
export function Covering(props: CoveringProps) {
  switch (props.state.type) {
    case 'curtains':
      return <Curtains {...props} />;
    case 'sheers':
      return <Sheers {...props} />;
    case 'roller':
      return <RollerBlind {...props} />;
    case 'roman':
      return <RomanShade {...props} />;
    case 'cellular':
      return <CellularShade {...props} />;
    case 'venetian':
      return <VenetianBlind {...props} />;
    case 'vertical':
      return <VerticalBlind {...props} />;
    case 'shutters':
      return <Shutters {...props} />;
    default:
      return null;
  }
}
