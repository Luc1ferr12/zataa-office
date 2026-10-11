// Peta jalan kantor v2 (terasering 4 tingkat): titik-titik selasar, pintu, tangga (graph) + lokasi tiap aktivitas.
// Karakter selalu berjalan lewat graph ini — lewat selasar, naik tangga, masuk pintu, ke kolam — tidak pernah teleport.
import { ROOM, ROOMDEF, RF, RZ, LY, FRONT, CORR_SPAN, STAIR, GAZEBO, GAZEBO2, POOL, AISLE } from './px/scene.js';
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
const V = (x, y, z) => new V3(x, y, z);

// ---------------------------------------------------------------- graph
const N = {};
const EDGES = [];
const corrZ = (t) => FRONT[t - 1] - 1;   // garis tengah selasar
const yOf = (t) => LY[t - 1];
// titik di selasar tiap tingkat: ujung-ujung, tiap pintu, tangga, + simpul halaman/taman
const EXTRA_X = { 1: [0.8, 6.4, -2.2], 2: [], 3: [25.5], 4: [19] };
for (let t = 1; t <= 4; t++) {
  const [a, b] = CORR_SPAN[t - 1];
  const xs = new Set([a + 0.6, b - 0.6, 0, ...EXTRA_X[t]]);
  for (const [id] of ROOMDEF[t]) if (!id.startsWith('tangga')) xs.add(+ROOM[id].door.toFixed(2));
  const sorted = [...xs].sort((p, q) => p - q);
  sorted.forEach((x, i) => {
    N[`C${t}:${x}`] = [x, yOf(t), corrZ(t)];
    if (i) EDGES.push([`C${t}:${sorted[i - 1]}`, `C${t}:${x}`]);
  });
  // simpul dalam ruangan (tepat di balik pintu)
  for (const [id] of ROOMDEF[t]) {
    if (id.startsWith('tangga')) continue;
    const r = ROOM[id];
    N[`R:${id}`] = [r.door, yOf(t), RF(t) - (id === 'tamanAtas' ? 0.6 : 1.0)];
    EDGES.push([`C${t}:${+r.door.toFixed(2)}`, `R:${id}`]);
  }
}
// tangga: bawah (di sel tangga) → atas (tepi depan selasar tingkat berikutnya)
for (let t = 1; t <= 3; t++) {
  N[`ST${t}b`] = [0, yOf(t), RZ(t, STAIR.lz0 + 0.3)];
  N[`ST${t}t`] = [0, yOf(t + 1), FRONT[t] - 0.15];
  EDGES.push([t === 1 ? 'R:lobby' : `C${t}:0`, `ST${t}b`], [`ST${t}b`, `ST${t}t`], [`ST${t}t`, `C${t + 1}:0`]);
}
// halaman depan: jalan utama, taman + gazebo, dek kolam, gerbang
Object.assign(N, {
  Y1: [0.8, 0, 6.5], Y2: [0.8, 0, 13], Y3: [0.8, 0, 22], GATE: [0.8, 0, 30.2],
  GZ: [-13.6, 0, 13], GZIN: [-14.6, 0.3, 13],
  BENCH: [-1.0, 0, 12.5], FARBENCH: [-1.0, 0, 21.6],
  DECK1: [6.4, 0, 6.2], DECK2: [6.4, 0, 17.6], POOLIN: [8.4, 0, 12],
});
EDGES.push(['C1:0.8', 'Y1'], ['Y1', 'Y2'], ['Y2', 'Y3'], ['Y3', 'GATE'], ['Y2', 'GZ'], ['GZ', 'GZIN'], ['Y2', 'BENCH'], ['Y3', 'FARBENCH'],
  ['C1:6.4', 'DECK1'], ['DECK1', 'DECK2'], ['DECK1', 'POOLIN'], ['DECK2', 'POOLIN']);

const node = (k) => V(...N[k]);
const adj = {};
for (const [a, b] of EDGES) {
  if (!N[a] || !N[b]) throw new Error(`nav: simpul hilang ${a} / ${b}`);
  const d = node(a).distanceTo(node(b));
  (adj[a] ??= []).push([b, d]);
  (adj[b] ??= []).push([a, d]);
}
// Dijkstra kecil (±110 titik), hasil disimpan
const cache = new Map();
function shortest(from, to) {
  if (from === to) return [from];
  const key = `${from}>${to}`;
  if (cache.has(key)) return cache.get(key);
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
  while (path[0] !== from) { const p = prev[path[0]]; if (!p) { cache.set(key, [from, to]); return [from, to]; } path.unshift(p); }
  cache.set(key, path);
  return path;
}

// ---------------------------------------------------------------- daftar shaf & kasur
const MEN_SHAF = AGENTS.filter((a) => a.gender === 'm' && !a.imam).map((a) => a.id);
const WOMEN = AGENTS.filter((a) => a.gender === 'f').map((a) => a.id);
const SWIMMERS = AGENTS.filter((a) => a.gender === 'm').map((a) => a.id);

// titik bersih-bersih Mbak Sari: tengah tiap ruangan (+ teras & pinggir kolam)
export const CLEAN = {};
for (const r of Object.values(ROOM)) {
  if (r.id.startsWith('tangga')) continue;
  CLEAN[r.id] = { p: [Math.max(r.x0 + 1, r.door - 1.6), yOf(r.L), RZ(r.L, -3.4)], a: `R:${r.id}`, rot: Math.PI / 2 };
}
CLEAN.teras = { p: [-10, 0, corrZ(1)], a: 'C1:-2.2', rot: -Math.PI / 2 };
CLEAN.kolam = { p: [7.2, 0, 15], a: 'DECK1', rot: Math.PI / 2 };
CLEAN.selasar2 = { p: [8, yOf(2), corrZ(2)], a: 'C2:0', rot: Math.PI / 2 };

// ---------------------------------------------------------------- lokasi tujuan → { pos, rot, pose, anchor, approach[] }
const inRoom = (id, lz) => { const r = ROOM[id]; return V(r.door, yOf(r.L), RZ(r.L, lz)); };
export function locationFor(spots, agent, idx, loc, info) {
  const key = String(loc).split('#')[0];
  const k = info?.slot ?? idx;
  const P = (s, y = s.y ?? 0) => V(s.x, y, s.z);
  switch (key.startsWith('visit') ? 'visit' : key.startsWith('clean:') ? 'clean' : key) {
    case 'desk': {
      const d = spots.desk[agent.desk ?? 0];
      const y = d.y;
      const approach = d.row === 'A'
        ? [V(d.side, y, RZ(2, -1.4)), V(d.side, y, d.aisle), V(d.x, y, d.aisle)]
        : [V(d.x, y, d.aisle)];
      return { pos: P(d), rot: d.rot, pose: 'type', anchor: `R:${d.room}`, approach };
    }
    case 'visit': {
      // berdiri di samping meja teman (oper kerjaan), menghadap mejanya
      const ta = AGENTS.find((a) => a.id === info?.target);
      if (ta?.desk == null) {   // nyamperin director/boss: berdiri di depan mejanya
        const s = ta?.boss ? spots.bossDesk : ta?.id === 'tdir' ? spots.tdirDesk : spots.dirDesk;
        const room = ta?.boss ? 'boss' : ta?.id === 'tdir' ? 'tdirRoom' : 'dirRoom';
        return { pos: V(s.x, s.y, s.z + 1.9), rot: Math.PI, pose: 'stand', anchor: `R:${room}`, approach: [] };
      }
      const d = spots.desk[ta.desk];
      const x = d.x + 0.95, y = d.y;
      const approach = d.row === 'A' ? [V(d.side, y, RZ(2, -1.4)), V(d.side, y, d.aisle), V(x, y, d.aisle)] : [V(x, y, d.aisle)];
      return { pos: V(x, y, d.z + 0.15), rot: d.rot, pose: 'stand', anchor: `R:${d.room}`, approach };
    }
    case 'dirDesk': case 'tdirDesk': case 'boss': {
      const room = key === 'dirDesk' ? 'dirRoom' : key === 'tdirDesk' ? 'tdirRoom' : 'boss';
      const s = key === 'boss' ? spots.bossDesk : spots[key];
      const r = ROOM[room], back = RZ(r.L, -7.35);
      const sideX = key === 'boss' ? 10.6 : key === 'dirDesk' ? -18.6 : 21.0;
      return { pos: P(s), rot: s.rot, pose: 'type', anchor: `R:${room}`, approach: [V(sideX, s.y, RZ(r.L, -2.4)), V(sideX, s.y, back), V(s.x, s.y, back)] };
    }
    case 'bossSofa': case 'dirSofa': case 'tdirSofa': {
      const list = spots[key];
      const s = list[(info?.slot ?? 0) % list.length];
      const room = key === 'bossSofa' ? 'boss' : key === 'dirSofa' ? 'dirRoom' : 'tdirRoom';
      const front = key === 'bossSofa' ? RZ(4, -4.6) : s.z - 1.1;
      return { pos: P(s), rot: s.rot, pose: info?.pose ?? 'phone', anchor: `R:${room}`, approach: [V(s.x, s.y, front)] };
    }
    case 'meeting': case 'meetingT': {
      const list = spots[key];
      const m = list[k % list.length];
      const room = key === 'meeting' ? 'meetM' : 'meetT';
      const cz = key === 'meeting' ? -4.0 : -4.2;
      const eastX = key === 'meeting' ? -24.3 : 28.7, y = m.y;
      let approach;
      if (Math.abs(m.rot) < 0.1) approach = [V(eastX, y, RZ(2, -6.1)), V(m.x, y, RZ(2, -6.1))];          // sisi belakang meja
      else if (Math.abs(m.rot - Math.PI) < 0.1) approach = [V(m.x, y, RZ(2, cz + 1.9))];                  // sisi depan
      else approach = [V(m.x, y, RZ(2, cz + 1.9))];                                                        // ujung meja
      return { pos: P(m), rot: m.rot, pose: 'talk', anchor: `R:${room}`, approach };
    }
    case 'mimbar': {
      const s = spots.mimbar, y = yOf(3);
      return { pos: P(s), rot: 0, pose: 'stand', anchor: 'R:mushola', approach: [V(-21.4, y, RZ(3, -4.4)), V(-22.5, y, RZ(3, -6.15)), V(s.x, y, RZ(3, -6.15)), V(s.x, y + 0.3, RZ(3, -6.6))] };
    }
    case 'musholla': {
      // kiblat = mihrab di dinding belakang → semua menghadap −z. Pria di depan tabir, wanita di belakang tabir
      const m = spots.musholla, y = yOf(3);
      const f = agent.gender === 'f';
      const s = agent.imam ? m.imam : f ? m.women[Math.max(0, WOMEN.indexOf(agent.id)) % m.women.length] : m.men[Math.max(0, MEN_SHAF.indexOf(agent.id)) % m.men.length];
      const approach = f ? [V(s.x, y, RZ(3, -1.4))]
        : agent.imam ? [V(-21.4, y, RZ(3, -4.4)), V(-22.5, y, RZ(3, -6.15)), V(s.x, y, RZ(3, -6.15))]
          : [V(-21.4, y, RZ(3, -4.4)), V(s.x, y, RZ(3, -4.4))];
      return { pos: V(s.x, y, s.z), rot: Math.PI, pose: 'pray', anchor: 'R:mushola', approach };
    }
    case 'wudhu': {
      const w = spots.wudhu[k % spots.wudhu.length];
      return { pos: P(w), rot: w.rot, pose: 'stand', anchor: 'R:wudhu', approach: [V(w.x, w.y, RZ(3, -5.4))] };
    }
    case 'mandi': {   // shower pagi di kamar mandi lantai 3 (pria / wanita)
      const list = agent.gender === 'f' ? spots.showerF : spots.showerM;
      const s = list[k % list.length];
      return { pos: P(s), rot: s.rot, pose: 'stand', anchor: `R:${s.room}`, approach: [V(s.x, s.y, RZ(3, -5.4))] };
    }
    case 'sink': {
      const list = agent.gender === 'f' ? spots.sinkF : spots.sinkM;
      const s = list[k % list.length];
      return { pos: P(s), rot: s.rot, pose: 'stand', anchor: `R:${s.room}`, approach: [V(s.x, s.y, RZ(3, -1.3))] };
    }
    case 'toilet': {   // toilet umum lantai 1 (siang hari)
      const s = spots.toilet[k % spots.toilet.length];
      return { pos: P(s), rot: s.rot, pose: 'stand', anchor: 'R:toilet', approach: [V(s.x, 0, RZ(1, -5.4))] };
    }
    case 'bed': {
      const s = spots.bed[k % spots.bed.length];
      const room = ROOM[s.room], y = yOf(room.L);
      const ax = s.room === 'king' ? s.x : s.x + 0.75;
      return { pos: P(s), rot: s.rot, pose: 'lie', anchor: `R:${s.room}`, approach: [V(ax, y, RZ(room.L, -4.5)), V(ax, y, RZ(room.L, -5.4))] };
    }
    case 'cafe': {
      const c = spots.cafe[k % spots.cafe.length];
      const approach = c.cafe
        ? [V(-23.8, 0, RZ(1, -0.6)), V(-23.8, 0, RZ(1, c.lane)), V(c.x, 0, RZ(1, c.lane))]
        : c.lane < -3 ? [V(-15.6, 0, RZ(1, -1.4)), V(-15.6, 0, RZ(1, c.lane)), V(c.x, 0, RZ(1, c.lane))] : [V(c.x, 0, RZ(1, c.lane))];
      return { pos: V(c.x, 0, c.z), rot: c.rot, pose: 'eat', anchor: 'R:cafe', approach };
    }
    case 'counter': {
      const c = spots.counter[k % spots.counter.length];
      return { pos: V(c.x, 0, c.z), rot: c.rot, pose: 'drink', anchor: 'R:cafe', approach: [V(-23.8, 0, RZ(1, -0.6)), V(-23.8, 0, RZ(1, -5.7)), V(c.x, 0, RZ(1, -5.7))] };
    }
    case 'kitchen': return { pos: P(spots.kitchen), rot: spots.kitchen.rot, pose: 'stand', anchor: 'R:dapur', approach: [V(-11.5, 0, RZ(1, -5.6))] };
    case 'gudang': return { pos: P(spots.gudang), rot: spots.gudang.rot, pose: 'stand', anchor: 'R:gudang', approach: [] };
    case 'lounge':
    case 'game': {
      const l = spots.lounge[k % spots.lounge.length];
      const pose = l.pose === 'beanbag' ? 'beanbag' : key === 'game' || info?.label?.includes('Mabar') ? 'game' : 'phone';
      const approach = l.z < RZ(1, -3) ? [V(24.0, 0, RZ(1, -2.0)), V(24.0, 0, RZ(1, -6.4)), V(l.x, 0, RZ(1, -6.4))] : [V(l.x, 0, RZ(1, -1.4))];
      return { pos: V(l.x, 0, l.z), rot: l.rot, pose, anchor: 'R:santai', approach };
    }
    case 'cinema': {
      const s = spots.cinema[k % spots.cinema.length];
      const front = s.z - 0.6;
      return { pos: P(s), rot: Math.PI, pose: 'talk', anchor: 'R:bioskop', approach: [V(12.0, 0, RZ(1, -1.0)), V(12.0, s.y - 0.05, front), V(s.x, s.y - 0.05, front)] };
    }
    case 'garden': {
      const g = spots.garden[k % spots.garden.length];
      if (g.gz) return { pos: P(g), rot: g.rot, pose: 'bench', anchor: 'GZIN', approach: [V(-14.6, 0.3, g.z), V(g.x, 0.3, g.z + (g.rot ? 0.4 : -0.4))] };
      const far = g.z > 20;
      return { pos: P(g), rot: g.rot, pose: 'bench', anchor: far ? 'FARBENCH' : 'BENCH', approach: [V(g.x, 0, g.z - 0.9)] };
    }
    case 'gardenTop': {
      const g = spots.gardenTop[k % spots.gardenTop.length], y = yOf(3);
      return { pos: P(g), rot: g.rot, pose: 'bench', anchor: 'R:tamanAtas', approach: [V(GAZEBO2.x + 1.4, y + 0.3, RZ(3, GAZEBO2.lz)), V(g.x, y + 0.3, g.z + (g.rot ? 0.35 : -0.35))] };
    }
    case 'lounger': {
      const l = spots.lounger[k % spots.lounger.length];
      return { pos: V(l.x, 0, l.z), rot: l.rot, pose: 'lie', anchor: 'DECK2', approach: [V(l.x, 0, 17.6)] };
    }
    case 'terasBoss': {
      const s = spots.terasBoss[k % spots.terasBoss.length];
      return { pos: P(s), rot: s.rot, pose: 'lie', anchor: 'R:terasBoss', approach: [V(s.x + 0.8, s.y, s.z + 1.2)] };
    }
    case 'clean': {
      const c = CLEAN[key.slice(6)] ?? CLEAN.cafe;
      return { pos: V(...c.p), rot: c.rot ?? 0, pose: 'sweep', anchor: c.a, approach: [] };
    }
    case 'pool': {
      const lane = spots.pool[Math.max(0, SWIMMERS.indexOf(agent.id)) % spots.pool.length];
      return {
        pos: V(lane.x - lane.half, lane.y, lane.z), rot: Math.PI / 2, pose: 'swim', anchor: 'POOLIN',
        approach: [V(POOL.x0 - 0.3, 0, lane.z), V(POOL.x0 + 0.6, lane.y, lane.z)], lane,
      };
    }
    default:
      return { pos: node('GATE'), rot: 0, pose: 'stand', anchor: 'GATE', approach: [], out: true };
  }
}

// Rute lengkap dari lokasi sekarang ke lokasi tujuan
export function route(from, to) {
  const pts = [...from.approach].reverse();
  for (const k of shortest(from.anchor, to.anchor)) pts.push(node(k));
  pts.push(...to.approach, to.pos);
  return pts.filter((p, i) => i === 0 || p.distanceToSquared(pts[i - 1]) > 1e-4).map((p) => p.clone());
}
export const NAV_NODES = N; // buat debug
