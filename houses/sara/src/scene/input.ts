/**
 * Shared, mutable input state written by keyboard / mouse handlers (Player.tsx) and by the
 * on-screen touch controls (ui/TouchControls.tsx), and consumed by the Player every frame.
 * Not reactive on purpose.
 */
export const input = {
  /** -1..1, +1 = forward */
  forward: 0,
  /** -1..1, +1 = strafe right */
  right: 0,
  /** accumulated look delta since last frame (pixels-ish); the Player resets these to 0 after use */
  lookDX: 0,
  lookDY: 0,
  sprint: false,
  /** set true by touch "select" button; the Player consumes it (selects the aimed window) and resets it */
  selectRequested: false,
};
