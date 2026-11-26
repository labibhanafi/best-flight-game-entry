// Coral Courier — seeded random numbers.
// One clear job: deterministic randomness for the world (tree placement, cloud drift,
// town layout) so the same seed always builds the same archipelago.

/** Mulberry32: a small, fast seeded PRNG. */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic 2D value noise in [-1, 1], used to roughen island slopes. */
export function hashNoise(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

export function smoothNoise(x, z) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hashNoise(xi, zi);
  const b = hashNoise(xi + 1, zi);
  const c = hashNoise(xi, zi + 1);
  const d = hashNoise(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
