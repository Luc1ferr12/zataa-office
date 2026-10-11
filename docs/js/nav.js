// Peta jalan kantor: titik-titik lorong (graph) + lokasi duduk tiap pegawai.
// Karakter selalu berjalan lewat graph ini — naik tangga, lewat pintu, masuk kolam — tidak pernah teleport.
import { UP } from './px/engine.js';
import { AGENTS } from './schedule.js';

// vektor 3D kecil (pengganti THREE.Vector3)
export class V3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new V3(this.x, this.y, this.z); }
  distanceToSquared(v) { const dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z; return dx * dx + dy * dy + dz * dz; }
  distanceTo(v) { return Math.sqrt(this.distanceToSquared(v)); }
}

const N = {
  SPAWN: [-25, 0, 16], ENT: [-20, 0, 14], DRIVE: [-13, 0, 8],
  CAFE_OUT: [-12, 0, 3.3], CAFE_DOOR: [-12, 0, 2], CAFE_IN: [-11, 0, -1.6],
  TER: [-2, 0, 4.6], LOUNGE_DOOR: [-2.5, 0, 2], LOUNGE_IN: [-2, 0, 0.6],
  STAIR_BOT: [3, 0, 1.7], STAIR_TOP: [3, UP, -6.7], BAL_MID: [3, UP, -7.25],
  BAL_W: [-14, UP, -7.25], MUS_DOOR: [-14, UP, -8.5], MUS_IN: [-14, UP, -9.6],
  MEET_DOOR: [-1.5, UP, -8.5], MEET_IN: [-1.5, UP, -9.6],
  BAL_E: [13, UP, -7.25], BOSS_DOOR: [13, UP, -8.5], BOSS_IN: [13, UP, -9.6],
  WORK_IN: [5.95, 0, 1.0], W_AISLE: [5.95, 0, -2.2], WORK_DOOR: [9, 0, 2], WORK_OUT: [9, 0, 3.3],
  P1: [5.8, 0, 3.6], P_W: [5.8, 0, 8.5], P2: [5.8, 0, 13.0], P3: [12, 0, 13.0],
  // sayap barat
  BATH_DOOR: [-20.15, 0, -1.75], BATH_IN: [-22.6, 0, -1.75], MESS_DOOR: [-20.85, 0, -6], MESS_IN: [-20.85, 0, -9.0],
  MUS_W: [-19.3, UP, -9.35], WUDHU_DOOR: [-20.15, UP, -9.35], WUDHU_IN: [-22.6, UP, -9.35],
};
const EDGES = [
  ['SPAWN', 'ENT'], ['ENT', 'DRIVE'], ['DRIVE', 'CAFE_OUT'], ['CAFE_OUT', 'CAFE_DOOR'], ['CAFE_DOOR', 'CAFE_IN'],
  ['CAFE_OUT', 'TER'], ['TER', 'LOUNGE_DOOR'], ['LOUNGE_DOOR', 'LOUNGE_IN'], ['CAFE_IN', 'LOUNGE_IN'],
  ['LOUNGE_IN', 'STAIR_BOT'], ['STAIR_BOT', 'WORK_IN'], ['STAIR_BOT', 'STAIR_TOP'], ['STAIR_TOP', 'BAL_MID'],
  ['BAL_MID', 'BAL_W'], ['BAL_W', 'MUS_DOOR'], ['MUS_DOOR', 'MUS_IN'], ['BAL_MID', 'MEET_DOOR'], ['MEET_DOOR', 'MEET_IN'],
  ['BAL_MID', 'BAL_E'], ['BAL_E', 'BOSS_DOOR'], ['BOSS_DOOR', 'BOSS_IN'],
  ['WORK_IN', 'W_AISLE'], ['WORK_IN', 'WORK_DOOR'], ['WORK_DOOR', 'WORK_OUT'], ['WORK_OUT', 'P1'], ['TER', 'P1'],
  ['P1', 'P_W'], ['P_W', 'P2'], ['P2', 'P3'],
  ['CAFE_IN', 'BATH_DOOR'], ['BATH_DOOR', 'BATH_IN'], ['BATH_IN', 'MESS_DOOR'], ['MESS_DOOR', 'MESS_IN'],
  ['MUS_IN', 'MUS_W'], ['MUS_W', 'WUDHU_DOOR'], ['WUDHU_DOOR', 'WUDHU_IN'],
];
const V = (x, y, z) => new V3(x, y, z);
const node = (k) => V(...N[k]);

const adj = {};
for (const [a, b] of EDGES) {
  const d = node(a).distanceTo(node(b));
  (adj[a] ??= []).push([b, d]);
  (adj[b] ??= []).push([a, d]);
}
// Dijkstra kecil (graph cuma ~30 titik)
function shortest(from, to) {
  if (from === to) return [from];
  const dist = { [from]: 0 }, prev = {}, open = new Set(Object.keys(N));
  while (open.size) {
    let u = null;
    for (const k of open) if (dist[k] !== undefined && (u === null || dist[k] < dist[u])) u = k;
    if (u === null) break;
    open.delete(u);
    if (u === to) break;
    for (const [v, w] of adj[u] ?? []) {
      const nd = dist[u] + w;
      if (dist[v] === undefined || nd < dist[v]) { dist[v] = nd; prev[v] = u; }
    }
  }
  const path = [to];
  while (path[0] !== from) { const p = prev[path[0]]; if (!p) return [from, to]; path.unshift(p); }
  return path;
}

const MALES = AGENTS.filter((a) => a.gender === 'm').map((a) => a.id);
const MEN_SHAF = AGENTS.filter((a) => a.gender === 'm' && !a.imam).map((a) => a.id);
const WOMEN = AGENTS.filter((a) => a.gender === 'f').map((a) => a.id);

// titik bersih-bersih OB per ruangan (posisi, arah, anchor graph, titik antara)
export const CLEAN = {
  cafe: { p: [-15.5, 0, -1.7], a: 'CAFE_IN', rot: Math.PI / 2 },
  lounge: { p: [-4.6, 0, -2.2], a: 'LOUNGE_IN', ap: [-2.1, 0, -2.4] },
  kerja: { p: [12.8, 0, -2.2], a: 'W_AISLE', rot: Math.PI / 2 },
  kerja2: { p: [12.8, 0, 1.0], a: 'WORK_IN', rot: -Math.PI / 2 },
  kamarmandi: { p: [-22.6, 0, -3.6], a: 'BATH_IN', rot: Math.PI },
  mess: { p: [-20.85, 0, -10.2], a: 'MESS_IN' },
  musholla: { p: [-16.5, UP, -9.3], a: 'MUS_IN', rot: Math.PI / 2 },
  wudhu: { p: [-22.6, UP, -11.4], a: 'WUDHU_IN' },
  meeting: { p: [-1.5, UP, -9.3], a: 'MEET_IN', rot: Math.PI / 2 },
  boss: { p: [11.5, UP, -10.6], a: 'BOSS_IN' },
  teras: { p: [-1.2, 0, 5.6], a: 'TER', rot: Math.PI / 2 },
  kolam: { p: [12, 0, 13.0], a: 'P3', rot: Math.PI / 2 },
};

// Lokasi tujuan untuk pegawai `idx` → { pos, rot, pose, anchor, approach[] }
export function locationFor(spots, agent, idx, loc, info) {
  const key = String(loc).split('#')[0];
  const k = info?.slot ?? idx; // kursi tertentu (mis. Zamiir & Aprista duduk sebelahan), default urutan pegawai
  switch (key.startsWith('visit') ? 'visit' : key.startsWith('clean:') ? 'clean' : key) {
    case 'desk': {
      const d = spots.desk[idx];
      return d.row === 'A'
        ? { pos: V(d.x, 0, d.z), rot: d.rot, pose: 'type', anchor: 'W_AISLE', approach: [V(d.x, 0, -2.2)] }
        : { pos: V(d.x, 0, d.z), rot: d.rot, pose: 'type', anchor: 'WORK_IN', approach: [V(d.x, 0, 1.0)] };
    }
    case 'visit': {
      // berdiri di samping meja teman (oper kerjaan), menghadap mejanya
      const ti = AGENTS.findIndex((a) => a.id === info?.target);
      const d = spots.desk[ti] ?? spots.desk[idx];
      const x = d.x + 0.95;
      return d.row === 'A'
        ? { pos: V(x, 0, d.z + 0.15), rot: d.rot, pose: 'stand', anchor: 'W_AISLE', approach: [V(x, 0, -2.2)] }
        : { pos: V(x, 0, d.z + 0.15), rot: d.rot, pose: 'stand', anchor: 'WORK_IN', approach: [V(x, 0, 1.0)] };
    }
    case 'meeting': {
      const m = spots.meeting[k % spots.meeting.length];
      const approach = m.side === 'N'
        ? [V(-5.6, UP, -9.9), V(-5.6, UP, -13.5), V(m.x, UP, -13.5)]
        : m.side === 'E' ? [V(2.6, UP, -9.8), V(2.6, UP, -11.6)]
          : m.side === 'W' ? [V(-5.6, UP, -9.9), V(-5.6, UP, -11.6)] : [V(m.x, UP, -9.7)];
      return { pos: V(m.x, UP, m.z), rot: m.rot, pose: 'talk', anchor: 'MEET_IN', approach };
    }
    case 'mimbar':
      // khotib berdiri di depan, menghadap jamaah
      return { pos: V(-12.2, UP + 0.9, -13.45), rot: 0, pose: 'stand', anchor: 'MUS_IN', approach: [V(-12.2, UP, -11.9), V(-12.2, UP + 0.3, -12.6)] };
    case 'toilet': {
      const t = spots.toilet[(info?.slot ?? idx) % spots.toilet.length];
      return { pos: V(t.x, 0, t.z), rot: t.rot, pose: 'stand', anchor: 'BATH_IN', approach: [V(-22.6, 0, t.z)] };
    }
    case 'sink': {
      const t = spots.sink[(info?.slot ?? idx) % spots.sink.length];
      return { pos: V(t.x, 0, t.z), rot: t.rot, pose: 'stand', anchor: 'BATH_IN', approach: [V(-22.0, 0, t.z)] };
    }
    case 'bed': {
      const b = spots.bed[(info?.slot ?? idx) % spots.bed.length];
      // lewat koridor timur → pintu kamar → lorong dalam kamar → kasur
      return { pos: V(b.x, b.y, b.z), rot: b.rot, pose: 'lie', anchor: 'MESS_IN', approach: [V(-20.85, 0, b.door), V(-22.0, 0, b.door), V(b.aisle[0], 0, b.aisle[1])] };
    }
    case 'wudhu': {
      const w = spots.wudhu[(info?.slot ?? idx) % spots.wudhu.length];
      return { pos: V(w.x, UP, w.z), rot: w.rot, pose: 'stand', anchor: 'WUDHU_IN', approach: [V(-23.6, UP, -9.35), V(-23.6, UP, w.z)] };
    }
    case 'musholla': {
      // kiblat = mihrab di dinding belakang → semua menghadap -z
      const m = spots.musholla;
      const rot = Math.PI;
      const s = agent.imam ? m.imam : agent.gender === 'f' ? m.women[WOMEN.indexOf(agent.id)] : m.men[MEN_SHAF.indexOf(agent.id)];
      return { pos: V(s.x, UP, s.z), rot, pose: 'pray', anchor: 'MUS_IN', approach: [V(s.x, UP, -9.6)] };
    }
    case 'boss':
      return { pos: V(14, UP, -12.45), rot: 0, pose: 'type', anchor: 'BOSS_IN', approach: [V(11.8, UP, -9.8), V(11.8, UP, -13.2), V(14, UP, -13.2)] };
    case 'bossSofa':
      // slot 0/1 = duduk berdua (Zamiir & Aprista), tanpa slot = di tengah
      return { pos: V(info?.slot == null ? 8.6 : info.slot ? 9.2 : 8.0, UP, -12.85), rot: 0, pose: info?.pose ?? 'phone', anchor: 'BOSS_IN', approach: [V(7.2, UP, -10.2), V(7.2, UP, -12.2)] };
    case 'cafe': {
      const c = spots.cafe[k % spots.cafe.length];
      return { pos: V(c.x, 0, c.z), rot: c.rot, pose: 'eat', anchor: 'CAFE_IN', approach: [V(-11, 0, c.lane), V(c.x, 0, c.lane)] };
    }
    case 'counter': {
      const c = spots.counter[k % spots.counter.length];
      return { pos: V(c.x, 0, c.z), rot: c.rot, pose: 'drink', anchor: 'CAFE_IN', approach: [V(-11, 0, -5.3), V(c.x, 0, -5.3)] };
    }
    case 'lounge':
    case 'game': {
      const l = spots.lounge[k % spots.lounge.length];
      const pose = l.pose === 'beanbag' ? 'beanbag' : loc === 'game' || info?.label?.includes('Mabar') ? 'game' : 'phone';
      const approach = [V(-2.1, 0, -2.4)];
      if (l.pose !== 'beanbag' || l.x < -5) approach.push(V(l.pose === 'beanbag' ? -7.3 : l.x, 0, -2.4));
      return { pos: V(l.x, 0, l.z), rot: l.rot, pose, anchor: 'LOUNGE_IN', approach };
    }
    case 'garden': {
      const g = spots.garden[k % spots.garden.length];
      return { pos: V(g.x, 0, g.z), rot: g.rot, pose: 'bench', anchor: 'TER', approach: [V(g.x, 0, 6.6)] };
    }
    case 'lounger': {
      const l = spots.lounger[k % spots.lounger.length];
      return { pos: V(l.x, 0, l.z), rot: l.rot, pose: 'lie', anchor: 'P3', approach: [V(l.x, 0, 13.0)] };
    }
    case 'clean': {
      // Mbak Sari bersih-bersih: titik per ruangan
      const c = CLEAN[key.slice(6)] ?? CLEAN.cafe;
      return { pos: V(...c.p), rot: c.rot ?? 0, pose: 'sweep', anchor: c.a, approach: c.ap ? [V(...c.ap)] : [] };
    }
    case 'pool': {
      const lane = spots.pool[Math.max(0, MALES.indexOf(agent.id))];
      return {
        pos: V(lane.x - lane.half, lane.y, lane.z), rot: Math.PI / 2, pose: 'swim', anchor: 'P_W',
        approach: [V(6.6, 0, 8.5), V(7.6, lane.y, 8.5)], lane,
      };
    }
    default:
      return { pos: node('SPAWN'), rot: 0, pose: 'stand', anchor: 'SPAWN', approach: [], out: true };
  }
}

// Rute lengkap dari lokasi sekarang ke lokasi tujuan
export function route(from, to) {
  const pts = [...from.approach].reverse();
  for (const k of shortest(from.anchor, to.anchor)) pts.push(node(k));
  pts.push(...to.approach, to.pos);
  // buang titik yang berurutan sama
  return pts.filter((p, i) => i === 0 || p.distanceToSquared(pts[i - 1]) > 1e-4).map((p) => p.clone());
}
