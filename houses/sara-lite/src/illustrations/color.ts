/** Tiny colour helpers shared by the drawings and the pane previews (hex in, hex / rgba out). */

export type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [200, 200, 200];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');

/** Linear mix of two hex colours (t = 0 → a, 1 → b). */
export function mix(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return `#${toHex(ca[0] + (cb[0] - ca[0]) * t)}${toHex(ca[1] + (cb[1] - ca[1]) * t)}${toHex(ca[2] + (cb[2] - ca[2]) * t)}`;
}

/** t > 0 lightens toward white, t < 0 darkens toward a warm black. */
export function shade(hex: string, t: number): string {
  return t >= 0 ? mix(hex, '#ffffff', t) : mix(hex, '#0b0a09', -t);
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${Math.round(Math.min(1, Math.max(0, a)) * 1000) / 1000})`;
}

/** Perceived lightness 0..1 (Rec. 709 weights on gamma values — good enough for picking contrasts). */
export function lightness(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * Highlight / shadow pair for a material colour. Dark colours need a stronger lift to show any modelling,
 * light colours a stronger shadow.
 */
export function tones(hex: string, strength = 1): { hi: string; lo: string; deep: string } {
  const l = lightness(hex);
  const lift = (0.1 + (1 - l) * 0.16) * strength;
  const drop = (0.16 + l * 0.14) * strength;
  return { hi: shade(hex, lift), lo: shade(hex, -drop), deep: shade(hex, -Math.min(0.7, drop * 1.9)) };
}

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
