/**
 * Deterministic 3D value noise (hashed lattice, smooth interpolation) and a small fractal sum,
 * used to deform foliage, rocks and the far lawn coherently in WORLD space: two overlapping
 * canopy blobs sample the same field, so their lumps agree where they meet.
 */

function hash3(x: number, y: number, z: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 1013904223) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Value noise in [-1, 1] at unit lattice spacing. */
export function noise3(x: number, y: number, z: number, seed = 0): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const tx = smooth(x - x0);
  const ty = smooth(y - y0);
  const tz = smooth(z - z0);
  let acc = 0;
  for (let dz = 0; dz <= 1; dz++) {
    const wz = dz ? tz : 1 - tz;
    for (let dy = 0; dy <= 1; dy++) {
      const wy = dy ? ty : 1 - ty;
      for (let dx = 0; dx <= 1; dx++) {
        const wx = dx ? tx : 1 - tx;
        acc += wx * wy * wz * hash3(x0 + dx, y0 + dy, z0 + dz, seed);
      }
    }
  }
  return acc * 2 - 1;
}

export interface Octave {
  /** Wavelength in the units of the sampled position. */
  wavelength: number;
  amplitude: number;
}

/** Sum of value-noise octaves (each with its own wavelength and amplitude) at a world position. */
export function fbm3(x: number, y: number, z: number, octaves: Octave[], seed = 0): number {
  let v = 0;
  for (let k = 0; k < octaves.length; k++) {
    const o = octaves[k];
    const f = 1 / o.wavelength;
    v += noise3(x * f + k * 17.3, y * f + k * 5.1, z * f + k * 11.7, seed + k) * o.amplitude;
  }
  return v;
}

/** Tree-canopy relief (finding 4): relative amplitudes 0.10 / 0.05 / 0.025 of R at 1.5R / 0.4R / 0.1R. */
export function canopyOctaves(R: number): Octave[] {
  return [
    { wavelength: 1.5 * R, amplitude: 0.1 * R },
    { wavelength: 0.4 * R, amplitude: 0.05 * R },
    { wavelength: 0.1 * R, amplitude: 0.025 * R },
  ];
}
