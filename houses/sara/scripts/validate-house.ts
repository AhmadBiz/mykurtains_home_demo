/**
 * Sanity checks for src/data/house.ts — run with `npx tsx scripts/validate-house.ts`.
 *  1. every opening fits inside its wall
 *  2. window inward normals point into the house
 *  3. rooms sit inside their level outline
 *  4. every room centre and every window viewpoint is reachable on foot from the start position
 */
import { HOUSE, PLAYER_EYE_HEIGHT, PLAYER_RADIUS, START_POSITION } from '../src/data/house';
import {
  COLLISION_SEGMENTS, LEVEL_BY_ID, WALL_GEOMS, WINDOWS, groundHeightAt, pointInLevelOutline, resolvePlayerCollisions, roomCenter, viewpointForWindow,
} from '../src/data/geometry';

let errors = 0;
const err = (m: string) => { errors++; console.log('ERROR ' + m); };

// 1. openings fit
for (const o of HOUSE.openings) {
  const g = WALL_GEOMS.get(o.wall);
  if (!g) { err(`${o.id}: unknown wall ${o.wall}`); continue; }
  if (o.at - o.width / 2 < -1e-6 || o.at + o.width / 2 > g.length + 1e-6) err(`${o.id}: does not fit along ${o.wall} (len ${g.length.toFixed(2)}, span ${(o.at - o.width/2).toFixed(2)}..${(o.at + o.width/2).toFixed(2)})`);
  if (o.sill + o.height > g.wall.height + 1e-6) err(`${o.id}: taller than wall ${o.wall}`);
}
// overlapping openings on the same wall
for (const w of HOUSE.walls) {
  const os = HOUSE.openings.filter((o) => o.wall === w.id).sort((a, b) => a.at - b.at);
  for (let i = 1; i < os.length; i++) {
    if (os[i].at - os[i].width / 2 < os[i - 1].at + os[i - 1].width / 2) err(`${os[i - 1].id} and ${os[i].id} overlap on ${w.id}`);
  }
}
// 2. inward normals
for (const w of WINDOWS) {
  const lvl = LEVEL_BY_ID[w.level];
  const inside = pointInLevelOutline(lvl, w.center.x + w.inward[0] * 0.6, w.center.z + w.inward[1] * 0.6);
  const outside = pointInLevelOutline(lvl, w.center.x - w.inward[0] * 0.6, w.center.z - w.inward[1] * 0.6);
  if (!inside || outside) err(`${w.id}: inward normal wrong (inside=${inside}, outside=${outside})`);
}
// 3. rooms inside outline
for (const r of HOUSE.rooms) {
  const lvl = LEVEL_BY_ID[r.level];
  const [x1, z1, x2, z2] = r.bounds;
  const pts: [number, number][] = [[x1 + 0.1, z1 + 0.1], [x2 - 0.1, z1 + 0.1], [x1 + 0.1, z2 - 0.1], [x2 - 0.1, z2 - 0.1]];
  for (const [x, z] of pts) if (!pointInLevelOutline(lvl, x, z)) err(`${r.id}: corner (${x.toFixed(2)}, ${z.toFixed(2)}) outside ${r.level} outline`);
}

// 4. reachability on a grid
const CELL = 0.12;
const minX = -9, maxX = 16, minZ = -2, maxZ = 13;
const nx = Math.ceil((maxX - minX) / CELL), nz = Math.ceil((maxZ - minZ) / CELL);
type Node = { ix: number; iz: number; y: number };
const key = (ix: number, iz: number, y: number) => `${ix},${iz},${Math.round(y / 0.5)}`;
function free(x: number, z: number, y: number): boolean {
  const [cx, cz] = resolvePlayerCollisions(x, z, y, PLAYER_RADIUS * 0.8);
  return Math.hypot(cx - x, cz - z) < 1e-6;
}
const startY = groundHeightAt(START_POSITION[0], START_POSITION[2], START_POSITION[1]);
const start: Node = { ix: Math.round((START_POSITION[0] - minX) / CELL), iz: Math.round((START_POSITION[2] - minZ) / CELL), y: startY };
const seen = new Map<string, Node>();
const queue: Node[] = [start];
seen.set(key(start.ix, start.iz, start.y), start);
const reachable: Node[] = [];
while (queue.length) {
  const n = queue.shift()!;
  reachable.push(n);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const ix = n.ix + dx, iz = n.iz + dz;
    if (ix < 0 || iz < 0 || ix >= nx || iz >= nz) continue;
    const x = minX + ix * CELL, z = minZ + iz * CELL;
    const y = groundHeightAt(x, z, n.y);
    if (Math.abs(y - n.y) > 0.3) continue;
    if (!free(x, z, y)) continue;
    const k = key(ix, iz, y);
    if (seen.has(k)) continue;
    const m = { ix, iz, y };
    seen.set(k, m);
    queue.push(m);
  }
}
function isReachable(x: number, z: number, y: number): boolean {
  const ix = Math.round((x - minX) / CELL), iz = Math.round((z - minZ) / CELL);
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
    for (const n of reachable) if (n.ix === ix + dx && n.iz === iz + dz && Math.abs(n.y - y) < 0.6) return true;
  }
  return false;
}
const index = new Map<string, Node[]>();
for (const n of reachable) { const k = `${n.ix},${n.iz}`; (index.get(k) ?? index.set(k, []).get(k)!).push(n); }
function isReachableFast(x: number, z: number, y: number): boolean {
  const ix = Math.round((x - minX) / CELL), iz = Math.round((z - minZ) / CELL);
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
    for (const n of index.get(`${ix + dx},${iz + dz}`) ?? []) if (Math.abs(n.y - y) < 0.6) return true;
  }
  return false;
}
void isReachable;
for (const r of HOUSE.rooms) {
  if (r.noFloor) continue;
  const [x, y, z] = roomCenter(r);
  if (!isReachableFast(x, z, y)) err(`room ${r.id} (${r.nameFr}) centre not reachable`);
}
for (const w of WINDOWS) {
  const vp = viewpointForWindow(w, PLAYER_EYE_HEIGHT);
  const y = vp.position[1] - PLAYER_EYE_HEIGHT;
  if (!isReachableFast(vp.position[0], vp.position[2], y)) err(`window ${w.id} viewpoint not reachable`);
}
console.log(`walls ${HOUSE.walls.length}, collision segments ${COLLISION_SEGMENTS.length}, openings ${HOUSE.openings.length}, windows ${WINDOWS.length}, rooms ${HOUSE.rooms.length}, reachable cells ${reachable.length}`);
console.log(errors ? `${errors} error(s)` : 'ALL CHECKS PASSED');
process.exit(errors ? 1 : 0);
