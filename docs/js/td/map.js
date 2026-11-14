// Peta kantor Zaa versi pixel art top-down (2D, ringan, tanpa file gambar). Semua posisi diambil dari px/scene.js
// (koordinat dunia yang sama dengan nav.js), jadi jalur jalan & jadwal pegawai tetap sama persis.
// Dilihat dari atas, 3 lantai terasering nyambung: Lt.3 di atas, Lt.2 di tengah, Lt.1 + halaman di bawah.
// Hasil: 1 kanvas latar (lantai, dinding, perabot rendah) + daftar "prop" (perabot tinggi, diurut kedalaman bareng pegawai)
// + daftar layar/lampu yang dianimasikan tiap frame oleh topdown.js.
import { makeSpots, ROOM, ROOMDEF, RF, FRONT, FLOORS, STAIR, stairAt, POOL, GAZEBO, DESK_LIST, TEAM_DESK, MEET, BILLIARD, SEC_DESK, MGR_ROOM, mgrX, LAYOUT } from '../px/scene.js';
import { textBitmap } from '../px/font.js';
import { hash2 } from '../px/engine.js';

export const S = 16;                       // piksel per meter
export const X0 = -35, X1 = 35, Z0 = -38, Z1 = 32;   // Z0 −38: Lt.4 (16 Nov 2026)
export const MW = (X1 - X0) * S, MH = (Z1 - Z0) * S;
export const VY = 0.6;                     // tinggi benda → geser ke atas (tampilan 3/4)
export const X = (x) => Math.round((x - X0) * S);
export const Y = (z) => Math.round((z - Z0) * S);
const H = (h) => Math.round(h * S * VY);
const RZL = (L, lz) => RF(L) + lz;

// ---------------------------------------------------------------- warna
const hx = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const shade = (h, k) => { const c = hx(h), t = k < 0 ? [20, 14, 30] : [255, 252, 240], a = Math.abs(k); return `rgb(${c.map((v, i) => Math.round(v + (t[i] - v) * a)).join(',')})`; };

const BASE = {
  grass: '#7cc35a', grassD: '#6ab24b', grassL: '#93d36b', tree: ['#2f7d48', '#3f9656', '#5bb064', '#24633a'], trunk: '#7a5236', flower: ['#f7d14a', '#f28cb1', '#fff6e8', '#b99cf5'],
  path: '#e4d5b1', pathD: '#cdbb93', deck: '#c99b6b', deckD: '#b3875a', water: '#4fb6e0', waterL: '#86d4f0', waterD: '#3a9ccc', poolEdge: '#f1ebdf',
  wallTop: '#3d3644', wallFace: '#f3eadb', wallFaceD: '#ddcfb8', base: '#a07b58', glass: '#bfe2ee', glassD: '#8fbfd1', rail: '#cfe9f1',
  corr: '#e9dcc4', corrD: '#dccdb2', wood: '#cf9764', woodD: '#b98053', woodL: '#dca773', tile: '#eee6d8', tileD: '#ddd2bf',
  carpet: '#d8d2c8', carpetD: '#c9c1b4', check: ['#3f4a63', '#e8e4dc'], meet: '#56637a', meetD: '#4a566b', dark: '#2a2433', darkD: '#211c29',
  desk: '#f4f1ea', deskF: '#d2cabd', mon: '#2b2d3a', scr: '#20253a', chair: '#eef0f4', chairD: '#c5c9d3', sofa: '#7aa36a', sofaD: '#5f8653',
  furn: '#9a6a44', furnD: '#7c5334', furnL: '#b98457', felt: '#2f8a57', feltD: '#246c44', red: '#c0444f', redD: '#963440',
  pot: '#e2d9cb', potD: '#bfb3a0', leaf: '#4f9a4a', leafL: '#6cbf5a', leafD: '#3a7a3a', book: ['#c0444f', '#4a7fc0', '#e0b04a', '#5aa36a', '#8a5ac0'],
  mush: '#5f8f5c', mushD: '#527e50', sajadah: ['#a83a3a', '#2f6f8a'], wudhu: '#cfe6ee', wudhuD: '#b5d4e0', gudang: '#c4bcaf', gudangD: '#b2a999',
  stair: '#c8b597', stairD: '#a8957a', sky: '#7cc35a', night: '#121a2e', team: { yt: '#c0444f', st: '#7c4fd0', mkt: '#8b6fe0', trd: '#2f4f8f', clip: '#1f9e8f', mv: '#d23b3b' },
};
export const TD_THEMES = {
  hangat: { label: 'Hangat (kayu)', pal: {} },
  modern: { label: 'Modern', pal: { wood: '#bfc4cc', woodD: '#a9afb9', woodL: '#cfd3da', corr: '#e4e6ea', corrD: '#d3d6dc', wallFace: '#eef0f3', wallFaceD: '#d5d9df', carpet: '#cfd4dc', carpetD: '#bfc5cf', furn: '#5a5f6b', furnD: '#454953', furnL: '#737986', sofa: '#4f7fb8', sofaD: '#3d6699', deck: '#a7aab0', deckD: '#8f9399' } },
  pastel: { label: 'Pastel', pal: { grass: '#9fd98a', grassD: '#8ccc78', grassL: '#b5e6a0', wood: '#f0c9a8', woodD: '#e2b590', woodL: '#f6d8bd', corr: '#fbe9ef', corrD: '#f2dbe3', wallFace: '#fff4f7', wallFaceD: '#f1dde4', carpet: '#e9e0f5', carpetD: '#dcd0ee', sofa: '#b49be8', sofaD: '#9a80d6', meet: '#8f86b8', meetD: '#7e75a6', check: ['#9a86d6', '#f6f0ff'], felt: '#5aa88a', feltD: '#4a9078' } },
};
export const TD_THEME_LIST = Object.entries(TD_THEMES).map(([id, t]) => ({ id, label: t.label }));

// ---------------------------------------------------------------- alat gambar
class Pen {
  constructor(g, C) { this.g = g; this.C = C; }
  r(x, y, w, h, c) { if (w <= 0 || h <= 0) return; this.g.fillStyle = c; this.g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  p(x, y, c) { this.r(x, y, 1, 1, c); }
  // persegi dunia (x0..x1, z0..z1) di lantai
  w(x0, x1, z0, z1, c) { this.r(X(x0), Y(z0), X(x1) - X(x0), Y(z1) - Y(z0), c); }
  ell(cx, cy, rx, ry, c) {
    this.g.fillStyle = c;
    for (let y = -ry; y <= ry; y++) { const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y / (ry + 0.5)) ** 2))); this.g.fillRect(Math.round(cx - half), Math.round(cy + y), half * 2, 1); }
  }
  text(str, cx, cy, c, scale = 1) {
    const bm = textBitmap(str, scale), x0 = Math.round(cx - bm.w / 2), y0 = Math.round(cy - bm.h / 2);
    this.g.fillStyle = c;
    for (let y = 0; y < bm.h; y++) for (let x = 0; x < bm.w; x++) if (bm.on(x, y)) this.g.fillRect(x0 + x, y0 + y, 1, 1);
    return bm.w;
  }
  // kotak 3/4: atas (geser h ke atas) + muka depan
  box(x0, x1, z0, z1, h, top, front, edge = null) {
    const a = X(x0), b = X(x1), t = Y(z0) - H(h), f = Y(z1) - H(h), bot = Y(z1);
    this.r(a, t, b - a, f - t, top);
    this.r(a, f, b - a, bot - f, front);
    if (edge) { this.r(a, t, b - a, 1, edge); this.r(a, bot - 1, b - a, 1, shade(front, -0.25)); }
  }
  // pola lantai
  planks(x0, x1, z0, z1, c, cD, cL, seed = 1) {
    const a = X(x0), b = X(x1), t = Y(z0), bt = Y(z1);
    this.r(a, t, b - a, bt - t, c);
    for (let y = t, row = 0; y < bt; y += 5, row++) {
      this.r(a, y + 4, b - a, 1, cD);
      let x = a - Math.floor(hash2(row, seed) * 40);
      while (x < b) { x += 28 + Math.floor(hash2(row, x) * 24); if (x > a && x < b) this.r(x, y, 1, 4, cD); }
      if (row % 3 === 1) this.r(a + Math.floor(hash2(seed, row) * (b - a)), y + 1, 6, 1, cL);
    }
  }
  tiles(x0, x1, z0, z1, c, cD, size = 16) {
    const a = X(x0), b = X(x1), t = Y(z0), bt = Y(z1);
    this.r(a, t, b - a, bt - t, c);
    for (let y = t + size - 1; y < bt; y += size) this.r(a, y, b - a, 1, cD);
    for (let x = a + size - 1; x < b; x += size) this.r(x, t, 1, bt - t, cD);
  }
  checker(x0, x1, z0, z1, c1, c2, size = 8) {
    const a = X(x0), b = X(x1), t = Y(z0), bt = Y(z1);
    for (let y = t; y < bt; y += size) for (let x = a; x < b; x += size) this.r(x, y, Math.min(size, b - x), Math.min(size, bt - y), ((x - a) / size + (y - t) / size) % 2 ? c2 : c1);
  }
  grass(x0, x1, z0, z1) {
    const { grass, grassD, grassL } = this.C, a = X(x0), b = X(x1), t = Y(z0), bt = Y(z1);
    this.r(a, t, b - a, bt - t, grass);
    for (let y = t; y < bt; y += 3) for (let x = a; x < b; x += 3) {
      const h = hash2(x, y);
      if (h < 0.12) this.p(x + (h * 30 | 0) % 3, y, grassD);
      else if (h > 0.93) { this.p(x, y, grassL); this.p(x + 1, y - 1, grassL); }
    }
  }
}

// ---------------------------------------------------------------- bangun peta
export function buildMap(themeId = 'hangat') {
  const C = { ...BASE, ...(TD_THEMES[themeId]?.pal ?? {}) };
  const cv = document.createElement('canvas'); cv.width = MW; cv.height = MH;
  const g = cv.getContext('2d');
  const P = new Pen(g, C);
  const props = [], screens = [], lights = [], waters = [];
  // perabot tinggi → kanvas kecil sendiri, diurut kedalaman (z kaki) bareng pegawai
  // layar yang didaftarkan saat menggambar prop ikut prop itu (digambar tepat setelahnya, jadi nggak ketutup mejanya sendiri)
  let cur = null;
  screens.push = (sc) => (cur ? (cur.scr ??= []).push(sc) : Array.prototype.push.call(screens, sc));
  const prop = (sortZ, x0, x1, z0, z1, h, fn) => {
    const bx = X(x0) - 2, by = Y(z0) - H(h) - 2, bw = X(x1) - X(x0) + 4, bh = Y(z1) - Y(z0) + H(h) + 4;
    const c = document.createElement('canvas'); c.width = Math.max(1, bw); c.height = Math.max(1, bh);
    const pg = c.getContext('2d'); pg.translate(-bx, -by);
    cur = { cv: c, x: bx, y: by, z: sortZ };
    fn(new Pen(pg, C));
    props.push(cur);
    cur = null;
  };
  const lamp = (x, z, r = 70, c = 'rgba(255,214,150,0.55)') => lights.push({ x: X(x), y: Y(z), r, c });

  // ---------- halaman, bukit & langit
  P.grass(X0, X1, Z0, Z1);
  yard(P, C, prop, lamp, waters);

  // ---------- tiap lantai
  for (let L = 1; L <= FLOORS; L++) floor(P, C, L, prop, screens, lamp);

  // pohon di bukit kiri/kanan & belakang
  const tree = (x, z, s = 1) => {
    const r = Math.round(14 * s);
    prop(z, x - 1.2 * s, x + 1.2 * s, z - 2.2 * s, z + 0.3, 0, (p) => {
      const cx = X(x), cy = Y(z);
      p.ell(cx, cy, 9 * s, 3, 'rgba(20,40,20,0.25)');
      p.r(cx - 2, cy - 10 * s, 4, 10 * s, C.trunk);
      p.ell(cx, cy - 16 * s, r, r * 0.85, C.tree[3]);
      p.ell(cx - 2, cy - 18 * s, r - 2, r * 0.8 - 2, C.tree[0]);
      p.ell(cx - 4, cy - 21 * s, r * 0.6, r * 0.5, C.tree[1]);
      p.ell(cx - 6, cy - 24 * s, r * 0.3, r * 0.25, C.tree[2]);
    });
  };
  for (let z = Z0 + 3; z < 4; z += 3.2) { tree(-33.6, z + hash2(z, 1) * 1.2, 0.8); tree(33.6, z + 1.4 + hash2(z, 2) * 1.2, 0.8); }
  for (let x = X0 + 2; x < X1; x += 3.4) tree(x + hash2(x, 5), Z0 + 1.6 + hash2(x, 6) * 0.4, 0.75);
  for (const [x, z, s] of [[-31, 7, 1], [-27, 10.5, 0.9], [-30.5, 17, 1.1], [-28, 27, 1], [-22.5, 28.8, 0.9], [-11, 27.5, 1], [-12.8, 19.5, 0.9],
    [-8.5, 9.5, 0.8], [30.5, 6.8, 1], [31, 13, 0.9], [30.2, 22, 1.1], [24, 27.6, 1], [16, 28.8, 0.9], [8.5, 27.8, 1], [-33.6, 22, 0.9], [33.6, 28, 0.9]]) tree(x, z, s);
  return { cv, props, screens, lights, waters, C };
}

// ---------------------------------------------------------------- halaman depan
function yard(P, C, prop, lamp, waters) {
  // teras depan Lt.1 sudah bagian lantai; jalan setapak dari pintu cafe ke gerbang
  P.w(-0.3, 1.9, 4, 31, C.path);
  for (let z = 4.5; z < 31; z += 1.1) P.w(-0.3, 1.9, z, z + 0.06, C.pathD);
  P.w(-13.6, -0.3, 12.2, 13.8, C.path);   // ke gazebo
  P.w(1.9, 6, 5.4, 7, C.path);            // ke dek kolam
  // dek kolam + kolam
  P.planks(5.6, 28.6, 5.6, 20.4, C.deck, C.deckD, shade(C.deck, 0.15), 7);
  P.w(POOL.x0 - 0.4, POOL.x1 + 0.4, POOL.z0 - 0.4, POOL.z1 + 0.4, C.poolEdge);
  P.w(POOL.x0, POOL.x1, POOL.z0, POOL.z1, C.water);
  P.w(POOL.x0, POOL.x1, POOL.z0, POOL.z0 + 0.25, C.waterD);
  for (let z = POOL.z0 + 1; z < POOL.z1; z += 1.4) P.w(POOL.x0 + 0.2, POOL.x1 - 0.2, z, z + 0.06, shade(C.water, 0.12));
  waters.push({ x: X(POOL.x0), y: Y(POOL.z0), w: X(POOL.x1) - X(POOL.x0), h: Y(POOL.z1) - Y(POOL.z0) });
  // tangga kolam
  for (let k = 0; k < 3; k++) P.r(X(POOL.x0) + 4, Y(POOL.z0) + 4 + k * 4, 10, 1, '#e8f6fb');
  // kursi berjemur + payung
  for (const x of LAYOUT.LOUNGER_X) {
    P.w(x - 0.4, x + 0.4, 18.2, 20.0, '#f6f2ea'); P.w(x - 0.4, x + 0.4, 18.2, 18.7, '#ffffff');
    for (let z = 18.8; z < 20; z += 0.3) P.w(x - 0.35, x + 0.35, z, z + 0.06, '#9ed6e8');
  }
  for (const x of [10.9, 14.5, 18.1]) prop(19.9, x - 1.1, x + 1.1, 17.6, 18.8, 2.2, (p) => {
    const cx = X(x), cy = Y(18.6) - H(2.2);
    p.r(cx, cy, 1, H(2.2), '#8a8a8a');
    p.ell(cx, cy, 18, 9, '#f06a5a'); p.ell(cx, cy, 18, 9, '#f06a5a');
    for (let k = -2; k <= 2; k += 2) p.r(cx + k * 4 - 2, cy - 8, 4, 16, '#fff3e0');
    p.ell(cx, cy, 3, 2, '#c94a3c');
  });
  // gazebo: lantai kayu + tiang + atap tipis transparan (pegawai di dalam tetap kelihatan)
  const gx0 = GAZEBO.x - GAZEBO.s / 2, gx1 = GAZEBO.x + GAZEBO.s / 2, gz0 = GAZEBO.z - GAZEBO.s / 2, gz1 = GAZEBO.z + GAZEBO.s / 2;
  P.w(gx0 - 0.2, gx1 + 0.2, gz0 - 0.2, gz1 + 0.2, C.deckD);
  P.planks(gx0, gx1, gz0, gz1, C.deck, C.deckD, shade(C.deck, 0.15), 3);
  P.w(GAZEBO.x - 1.6, GAZEBO.x + 1.6, GAZEBO.z - 0.5, GAZEBO.z + 0.5, C.furn);   // meja
  for (const dz of [-1.25, 1.25]) P.w(GAZEBO.x - 1.5, GAZEBO.x + 1.5, GAZEBO.z + dz - 0.25, GAZEBO.z + dz + 0.25, C.furnL);
  for (const [px, pz] of [[gx0, gz0], [gx1, gz0], [gx0, gz1], [gx1, gz1]]) prop(pz, px - 0.15, px + 0.15, pz - 0.15, pz + 0.15, 2.4, (p) => p.box(px - 0.15, px + 0.15, pz - 0.15, pz + 0.15, 2.4, C.furnL, C.furn));
  lamp(GAZEBO.x, GAZEBO.z, 60);
  // bangku taman (sandaran di belakang = +z)
  for (const [bx, bz] of LAYOUT.BENCHES) {
    P.w(bx - 1.0, bx + 1.0, bz - 0.25, bz + 0.25, C.furnL);
    prop(bz + 0.5, bx - 1.0, bx + 1.0, bz + 0.3, bz + 0.45, 0.9, (p) => p.box(bx - 1.0, bx + 1.0, bz + 0.3, bz + 0.45, 0.9, C.furnL, C.furn, shade(C.furnL, 0.2)));
  }
  // taman bunga
  const bed = (x0, x1, z0, z1, k) => {
    P.w(x0, x1, z0, z1, '#8a6a48');
    for (let x = x0 + 0.3; x < x1; x += 0.5) for (let z = z0 + 0.3; z < z1; z += 0.5) {
      P.ell(X(x), Y(z), 4, 3, C.leafD); P.r(X(x) - 1, Y(z) - 2, 2, 2, C.flower[(Math.floor(x * 2) + Math.floor(z * 2) + k) % 4]);
    }
  };
  bed(-6.5, -2.6, 5.2, 6.6, 0); bed(2.6, 4.6, 8.5, 12, 1); bed(-6.5, -2.6, 18.5, 20, 2); bed(2.6, 4.6, 22, 26, 3); bed(-24, -19, 5.4, 6.8, 1);
  // pagar & gerbang
  for (let x = X0 + 1; x < X1 - 1; x += 0.5) {
    if (x > -0.6 && x < 2.2) continue;
    P.w(x, x + 0.12, 30.6, 31.2, '#f3eadb');
  }
  P.w(X0 + 1, -0.6, 30.75, 30.9, '#d9ccb4'); P.w(2.2, X1 - 1, 30.75, 30.9, '#d9ccb4');
  for (const x of [-0.8, 2.1]) prop(31.2, x - 0.25, x + 0.25, 30.5, 31.1, 1.6, (p) => p.box(x - 0.25, x + 0.25, 30.5, 31.1, 1.6, '#e9e0cf', '#c9bba3', '#fff'));
  // papan nama ZAA OFFICE
  prop(28.4, 3, 10, 27.8, 28.2, 1.6, (p) => {
    p.box(3, 10, 27.8, 28.2, 1.6, '#3a2a5a', '#2a1d44', '#5a3d8a');
    p.text('ZAA OFFICE', (X(3) + X(10)) / 2, Y(28.2) - H(1.6) / 2 - 3, '#f5e9ff', 2);
    p.r(X(3.4), Y(28.2), 2, 3, '#555'); p.r(X(9.6) - 2, Y(28.2), 2, 3, '#555');
  });
  // lampu taman
  for (const [x, z] of [[-1.2, 9], [3, 16], [-1.2, 23], [3, 29], [-9, 13.8], [6, 8], [28, 8], [6, 19.5], [28, 19.5]]) {
    prop(z, x - 0.2, x + 0.2, z - 0.2, z + 0.1, 2.0, (p) => { p.r(X(x) - 1, Y(z) - H(2), 2, H(2), '#3a3a44'); p.r(X(x) - 3, Y(z) - H(2) - 4, 6, 4, '#fff1c4'); });
    lamp(x, z - 1.2, 54, 'rgba(255,224,160,0.6)');
  }
}

// ---------------------------------------------------------------- satu lantai
function floor(P, C, L, prop, screens, lamp) {
  const front = FRONT[L - 1], face = RF(L), back = front - 10;
  const z = (lz) => RZL(L, lz);
  // selasar
  P.tiles(-32, 32, face, front, C.corr, C.corrD, 16);
  if (L === 1) { P.w(-32, 32, front - 0.12, front, shade(C.corr, -0.2)); }
  // ruang-ruang
  for (const [id, x0, x1] of ROOMDEF[L]) room(P, C, L, ROOM[id], prop, screens, lamp);
  // dinding samping antar ruang + tepi luar
  const xs = new Set([-32, 32]);
  for (const [, x0, x1] of ROOMDEF[L]) { xs.add(x0); xs.add(x1); }
  for (const x of xs) {
    P.r(X(x) - 1, Y(back), 3, Y(face) - Y(back), C.wallTop);
  }
  // dinding kaca depan + pintu
  for (const [id, x0, x1] of ROOMDEF[L]) {
    const r = ROOM[id];
    if (id.startsWith('tangga')) continue;
    const d0 = r.door - 0.75, d1 = r.door + 0.75;
    for (const [a, b] of [[x0, d0], [d1, x1]]) {
      if (b <= a) continue;
      P.r(X(a), Y(face) - 3, X(b) - X(a), 3, C.glass);
      P.r(X(a), Y(face) - 3, X(b) - X(a), 1, '#ffffff');
      P.r(X(a), Y(face), X(b) - X(a), 1, C.glassD);
      for (let x = a; x < b; x += 2) P.r(X(x), Y(face) - 3, 1, 4, C.glassD);
    }
    P.w(d0, d1, face - 0.1, face + 0.35, shade(C.corr, -0.12));   // keset
  }
  // tepi lantai: Lt.2–3 pagar kaca ke lantai bawah (celah di tangga naik)
  if (L > 1) {
    const sx = stairAt(L - 1), g0 = sx - STAIR.x1, g1 = sx + STAIR.x1;
    for (const [a, b] of [[-32, g0], [g1, 32]]) {
      P.r(X(a), Y(front) - 4, X(b) - X(a), 2, C.rail);
      P.r(X(a), Y(front) - 4, X(b) - X(a), 1, '#ffffff');
      for (let x = a; x <= b; x += 1) P.r(X(x), Y(front) - 5, 1, 4, C.glassD);
    }
  }
  // tanaman & lampu di selasar
  for (let x = -30; x <= 30; x += 6.4) {
    const bad = ROOMDEF[L].some(([id]) => Math.abs(ROOM[id].door - x) < 1.5) || Math.abs(stairAt(L) - x) < 2 || (L > 1 && Math.abs(stairAt(L - 1) - x) < 2);
    if (bad) continue;
    plant(prop, C, x, face + 0.45, 0.8);
  }
  for (let x = -28; x <= 28; x += 8) lamp(x, front - 1, 46, 'rgba(255,220,170,0.4)');
  // tangga naik dari lantai ini
  if (L < FLOORS) {
    const sx = stairAt(L), a = sx + STAIR.x0, b = sx + STAIR.x1, z0 = z(STAIR.lz1), z1 = z(STAIR.lz0);
    P.w(a - 0.15, b + 0.15, z0, z1, C.stairD);
    const n = STAIR.steps;
    for (let k = 0; k < n; k++) {
      const t0 = z0 + ((z1 - z0) * k) / n, t1 = z0 + ((z1 - z0) * (k + 1)) / n;
      P.w(a, b, t0, t1, shade(C.stair, -0.25 * (1 - k / n)));
      P.w(a, b, t1 - 0.06, t1, C.stairD);
    }
    P.w(a - 0.15, a, z0, z1, C.wallTop); P.w(b, b + 0.15, z0, z1, C.wallTop);
    P.text('NAIK', X(sx), Y(z1) + 6, shade(C.stairD, -0.4));
  }
}

// ---------------------------------------------------------------- dinding belakang (muka dinding kelihatan dari atas)
const FACE = 11;
function backWall(P, C, x0, x1, back, L) {
  P.r(X(x0), Y(back), X(x1) - X(x0), 3, C.wallTop);
  P.r(X(x0), Y(back) + 3, X(x1) - X(x0), FACE, C.wallFace);
  P.r(X(x0), Y(back) + 3 + FACE - 2, X(x1) - X(x0), 2, C.base);
  P.r(X(x0), Y(back) + 3, X(x1) - X(x0), 1, C.wallFaceD);
  // celah tangga dari lantai ini ke atas
  if (L < FLOORS) {
    const sx = stairAt(L);
    if (sx > x0 && sx < x1) P.w(sx + STAIR.x0, sx + STAIR.x1, back, back + 0.9, C.stairD);
  }
}
const wy = (back) => Y(back) + 3;   // atas muka dinding
// benda di dinding: (x tengah, lebar m, tinggi px, warna)
function onWall(P, back, x, w, h, c, top = 1) { P.r(X(x - w / 2), wy(back) + top, X(x + w / 2) - X(x - w / 2), h, c); }
function frameArt(P, C, back, x, k = 0) {
  onWall(P, back, x, 0.9, 7, '#3a3036');
  const cols = [['#f2c14e', '#e86a5a', '#4a90c0'], ['#7ac08a', '#f2e6c9', '#c0444f'], ['#a78bfa', '#5eead4', '#fde68a']][k % 3];
  P.r(X(x) - 6, wy(back) + 2, 12, 5, cols[0]); P.r(X(x) - 6, wy(back) + 5, 7, 2, cols[1]); P.r(X(x) + 1, wy(back) + 3, 4, 3, cols[2]);
}
function windowArt(P, back, x, w) {
  onWall(P, back, x, w, 8, '#6a8aa8');
  P.r(X(x - w / 2) + 1, wy(back) + 2, X(x + w / 2) - X(x - w / 2) - 2, 6, '#bfe6f6');
  P.r(X(x) , wy(back) + 2, 1, 6, '#6a8aa8');
  P.r(X(x - w / 2) + 2, wy(back) + 3, 3, 1, '#ffffff');
}
function shelf(prop, C, x0, x1, back, h = 1.8) {
  const z0 = back + 0.15, z1 = back + 0.55;
  prop(z1, x0, x1, z0, z1, h, (p) => {
    p.box(x0, x1, z0, z1, h, C.furnL, C.furn);
    const top = Y(z1) - H(h), bot = Y(z1);
    for (let y = top + 3; y < bot - 3; y += 6) {
      p.r(X(x0) + 1, y + 5, X(x1) - X(x0) - 2, 1, C.furnD);
      for (let x = X(x0) + 2; x < X(x1) - 3; x += 3) if (hash2(x, y) > 0.2) p.r(x, y + 1 + (hash2(y, x) * 2 | 0), 2, 4 - (hash2(y, x) * 2 | 0), C.book[(x + y) % 5]);
    }
  });
}
function plant(prop, C, x, z, s = 1) {
  prop(z + 0.25, x - 0.6 * s, x + 0.6 * s, z - 1.2 * s, z + 0.25, 0, (p) => {
    const cx = X(x), cy = Y(z);
    p.ell(cx, cy + 2, 6 * s, 2, 'rgba(0,0,0,0.18)');
    p.r(cx - 4 * s, cy - 6 * s, 8 * s, 7 * s, C.pot); p.r(cx - 4 * s, cy - 6 * s, 8 * s, 2, C.potD);
    p.ell(cx, cy - 11 * s, 7 * s, 6 * s, C.leafD);
    p.ell(cx - 1, cy - 13 * s, 5 * s, 5 * s, C.leaf);
    p.ell(cx - 2, cy - 16 * s, 3 * s, 3 * s, C.leafL);
    p.p(cx + 3, cy - 18 * s, C.leafL);
  });
}
function chair(P, C, x, z, rot, col = C.chair, colD = C.chairD) {   // kursi kantor (di lantai, digambar sebelum pegawai)
  const fx = Math.sin(rot), fz = Math.cos(rot);   // arah hadap
  P.ell(X(x), Y(z) + 1, 6, 4, 'rgba(0,0,0,0.15)');
  P.r(X(x) - 5, Y(z) - 5, 10, 8, col); P.r(X(x) - 5, Y(z) + 2, 10, 1, colD);
  // sandaran di sisi belakang
  if (Math.abs(fz) > 0.5) P.r(X(x) - 5, fz > 0 ? Y(z) - 8 : Y(z) + 3, 10, 3, colD);
  else P.r(fx > 0 ? X(x) - 7 : X(x) + 5, Y(z) - 6, 2, 9, colD);
}
// meja kerja bilik/manajer: prop dengan monitor; facing = arah orang duduk (-1: membelakangi kamera, +1: menghadap kamera)
function desk(prop, C, screens, x0, x1, z0, z1, facing, scrKey, opt = {}) {
  const h = 0.75, top = opt.top ?? C.desk, frontC = opt.front ?? C.deskF;
  prop(z1, x0, x1, z0, z1, h + 0.6, (p) => {
    p.box(x0, x1, z0, z1, h, top, frontC, shade(top, 0.3));
    const cx = (X(x0) + X(x1)) / 2, ty = Y(z0) - H(h);
    if (facing < 0) {   // monitor di sisi belakang meja, layar menghadap kamera
      const mw = Math.min(18, X(x1) - X(x0) - 8);
      p.r(cx - mw / 2 - 1, ty - 9, mw + 2, 12, C.mon);
      p.r(cx - mw / 2, ty - 8, mw, 9, C.scr);
      p.r(cx - 2, ty + 3, 4, 2, C.mon);
      if (scrKey != null) screens.push({ kind: 'desk', key: scrKey, x: cx - mw / 2, y: ty - 8, w: mw, h: 9 });
      p.r(cx - 6, Y(z1) - H(h) - 6, 12, 3, '#d9dbe2'); p.r(cx - 6, Y(z1) - H(h) - 4, 12, 1, '#b9bcc6');   // keyboard
      p.r(X(x1) - 7, ty + 3, 3, 3, opt.mug ?? '#e86a5a');
    } else {            // dilihat dari depan: punggung monitor + kertas
      p.r(cx - 9, ty + 1, 18, 4, C.mon); p.r(cx - 2, ty + 5, 4, 2, C.mon);
      p.r(X(x0) + 4, ty + 6, 6, 5, '#ffffff'); p.r(X(x0) + 5, ty + 7, 4, 1, '#c9c9d4');
      p.r(X(x1) - 9, ty + 6, 4, 4, C.leaf);
    }
  });
}
function sofaBack(prop, C, x0, x1, zBack, dir, col = C.sofa, colD = C.sofaD) {
  // dir +1: sandaran di sisi +z (orang menghadap −z) → prop; −1: sandaran di −z (nempel dinding) → lantai
  const z0 = dir > 0 ? zBack - 0.25 : zBack, z1 = dir > 0 ? zBack : zBack + 0.25;
  if (dir > 0) prop(z1 + 0.05, x0, x1, z0, z1, 0.95, (p) => p.box(x0, x1, z0, z1, 0.95, shade(col, 0.15), colD, shade(col, 0.3)));
  return [z0, z1];
}
function sofa(P, prop, C, x0, x1, zSeat, dir, col = C.sofa, colD = C.sofaD) {
  // dudukan (lantai) dari zSeat−0.45..zSeat+0.35 + sandaran + lengan
  P.w(x0, x1, zSeat - 0.45, zSeat + 0.4, col);
  P.w(x0, x1, zSeat + 0.33, zSeat + 0.4, colD);
  for (let x = x0 + 0.9; x < x1 - 0.1; x += 0.9) P.w(x - 0.03, x + 0.03, zSeat - 0.4, zSeat + 0.33, colD);
  P.w(x0 - 0.2, x0, zSeat - 0.5, zSeat + 0.45, colD); P.w(x1, x1 + 0.2, zSeat - 0.5, zSeat + 0.45, colD);
  if (dir > 0) sofaBack(prop, C, x0 - 0.2, x1 + 0.2, zSeat + 0.7, 1, col, colD);
  else P.w(x0 - 0.2, x1 + 0.2, zSeat - 0.75, zSeat - 0.45, colD);
}
function rug(P, x0, x1, z0, z1, c, b) { P.w(x0, x1, z0, z1, b); P.w(x0 + 0.15, x1 - 0.15, z0 + 0.15, z1 - 0.15, c); }
function tv(P, screens, back, x, w, key) {
  onWall(P, back, x, w, 9, '#1b1b22');
  screens.push({ kind: 'tv', key, x: X(x - w / 2) + 1, y: wy(back) + 2, w: X(x + w / 2) - X(x - w / 2) - 2, h: 7 });
}
function sign(P, C, back, x, name) {
  const bm = textBitmap(name);
  const w = bm.w + 6;
  P.r(X(x) - w / 2, Y(back) - 3, w, 8, '#2b2440');
  P.r(X(x) - w / 2, Y(back) - 3, w, 1, '#4a3d70');
  P.text(name, X(x), Y(back) + 1, '#f3ecff');
}

// ---------------------------------------------------------------- isi tiap ruangan
function room(P, C, L, r, prop, screens, lamp) {
  const { id, x0, x1 } = r, back = FRONT[L - 1] - 10, face = RF(L);
  const z = (lz) => RZL(L, lz), cx = (x0 + x1) / 2;
  const fl = (style) => {
    if (style === 'wood') P.planks(x0, x1, back, face, C.wood, C.woodD, C.woodL, x0 * 7 | 0);
    else if (style === 'carpet') P.tiles(x0, x1, back, face, C.carpet, C.carpetD, 32);
    else if (style === 'tile') P.tiles(x0, x1, back, face, C.tile, C.tileD, 16);
    else P.w(x0, x1, back, face, style);
  };
  const lamps = (n = 2) => { for (let k = 0; k < n; k++) lamp(x0 + ((x1 - x0) * (k + 0.5)) / n, z(-4), 80); };

  if (id.startsWith('tangga')) { P.tiles(x0, x1, back, face, C.corr, C.corrD, 16); backWall(P, C, x0, x1, back, L); return; }

  switch (id) {
    case 'mushola': {
      fl(C.mush);
      for (let lz = -7.4; lz < 0; lz += 1.1) P.w(x0, x1, z(lz), z(lz) + 0.08, C.mushD);
      backWall(P, C, x0, x1, back, L);
      // mihrab
      const mx = LAYOUT.MIHRAB_X;
      P.r(X(mx) - 12, wy(back), 24, FACE, '#2f6f5a'); P.r(X(mx) - 9, wy(back) + 2, 18, FACE - 2, '#3f8a6e');
      P.r(X(mx) - 2, wy(back) + 3, 4, 3, '#e8c45a');
      // sajadah di tiap tempat sholat (posisi dari makeSpots)
      const SP = makeSpots().musholla;
      const saj = (sp, c) => { P.w(sp.x - 0.33, sp.x + 0.33, sp.z - 1.0, sp.z + 0.15, c); P.w(sp.x - 0.33, sp.x + 0.33, sp.z - 1.0, sp.z - 0.85, '#e8c45a'); };
      saj(SP.imam, C.sajadah[0]);
      for (const sp of SP.men) saj(sp, C.sajadah[0]);
      for (const sp of SP.women) saj(sp, C.sajadah[1]);
      // tabir pria–wanita
      prop(z(-3.8), -31.6, -21.2, z(-3.9), z(-3.8), 1.3, (p) => { p.box(-31.6, -21.2, z(-3.9), z(-3.8), 1.3, '#e9dcc0', '#cbb894'); for (const x of [-31.6, -26.4, -21.2]) p.r(X(x) - 1, Y(z(-3.8)) - H(1.4), 2, H(1.4), '#c9a24a'); });
      // mimbar
      const bx = LAYOUT.MIMBAR_X;
      prop(z(-6.5), bx - 0.55, bx + 0.55, z(-7.8), z(-6.5), 1.0, (p) => { p.box(bx - 0.55, bx + 0.55, z(-7.8), z(-6.5), 1.0, C.furnL, C.furn, '#e8c45a'); for (let k = 0; k < 3; k++) p.r(X(bx) - 7, Y(z(-6.5)) - H(1) + 4 + k * 4, 14, 1, C.furnD); });
      shelf(prop, C, -31.4, -29.8, back, 1.4);
      windowArt(P, back, -29, 1.4); windowArt(P, back, -22, 1.4);
      sign(P, C, back, cx + 3.5, 'MUSHOLA');
      lamps(2);
      break;
    }
    case 'wudhu': {
      fl('tile'); P.tiles(x0, x1, back, face, C.wudhu, C.wudhuD, 12);
      backWall(P, C, x0, x1, back, L);
      P.w(x0 + 0.2, x1 - 0.2, z(-7.9), z(-7.35), '#9fb7c2');
      for (const x of LAYOUT.WUDHU_X) { P.r(X(x) - 1, wy(back) + 2, 3, 4, '#c9ccd4'); P.r(X(x) - 3, Y(z(-7.6)), 6, 3, '#e8f4f8'); }
      P.w(cx - 0.3, cx + 0.3, z(-4), z(-3.7), '#8aa0aa');
      sign(P, C, back, cx, 'WUDHU');
      lamps(1);
      break;
    }
    case 'gudang': {
      fl(C.gudang);
      for (let k = 0; k < 5; k++) P.w(x0, x1, z(-7 + k * 1.5), z(-7 + k * 1.5) + 0.05, C.gudangD);
      backWall(P, C, x0, x1, back, L);
      prop(back + 0.6, x0 + 0.2, x1 - 0.2, back + 0.15, back + 0.6, 1.8, (p) => {
        p.box(x0 + 0.2, x1 - 0.2, back + 0.15, back + 0.6, 1.8, '#9a9ca6', '#7d7f8a');
        for (let y = Y(back + 0.6) - H(1.8) + 4; y < Y(back + 0.6) - 2; y += 6) { p.r(X(x0 + 0.3), y + 4, X(x1 - 0.3) - X(x0 + 0.3), 1, '#5d5f6a'); for (let x = X(x0 + 0.4); x < X(x1 - 0.6); x += 7) p.r(x, y, 5, 4, ['#d9b26a', '#c98f5a', '#e8e0d0'][(x + y) % 3]); }
      });
      for (const [bx, bz] of [[x0 + 0.6, -2.0], [x0 + 1.3, -1.6], [x1 - 0.7, -4.5]]) prop(z(bz) + 0.3, bx - 0.35, bx + 0.35, z(bz) - 0.3, z(bz) + 0.3, 0.6, (p) => { p.box(bx - 0.35, bx + 0.35, z(bz) - 0.3, z(bz) + 0.3, 0.6, '#d9b26a', '#b98f4a'); p.r(X(bx) - 1, Y(z(bz) - 0.3) - H(0.6), 2, Y(z(bz) + 0.3) - Y(z(bz) - 0.3), '#c9a05a'); });
      P.ell(X(x1 - 0.8), Y(z(-2.2)), 5, 4, '#4a7fc0'); P.r(X(x1 - 0.8), Y(z(-2.2)) - 12, 1, 12, '#8b5e34');
      sign(P, C, back, cx, 'GUDANG');
      lamps(1);
      break;
    }
    case 'cafe': {
      fl('wood');
      backWall(P, C, x0, x1, back, L);
      // dapur & counter kopi
      P.tiles(6.8, x1, back, z(-5.2), '#f0ece4', '#dcd6ca', 10);
      for (let x = -8; x < 6; x += 3.5) windowArt(P, back, x, 1.6);
      prop(z(-6.8), -9.3, -1.7, z(-7.6), z(-6.8), 1.0, (p) => {
        p.box(-9.3, -1.7, z(-7.6), z(-6.8), 1.0, '#efe7da', C.furn, '#fff');
        const ty = Y(z(-7.6)) - H(1);
        p.r(X(-8.6), ty - 8, 9, 10, '#3a3a44'); p.r(X(-8.6) + 2, ty - 6, 5, 3, '#c0444f');   // mesin kopi
        p.r(X(-6.6), ty - 6, 7, 8, '#cfd2d8');
        for (let x = -5; x < -2; x += 0.6) p.r(X(x), ty + 3, 4, 4, '#ffffff');
        p.r(X(-3), ty - 3, 10, 6, '#e0c79a'); p.r(X(-3) + 1, ty - 2, 3, 2, '#b8864a'); p.r(X(-3) + 5, ty - 2, 3, 2, '#f2d38a');   // roti
      });
      prop(z(-6.9), 7.2, 12.8, z(-7.6), z(-6.9), 1.0, (p) => {
        p.box(7.2, 12.8, z(-7.6), z(-6.9), 1.0, '#e9e4dc', '#b8b2a8', '#fff');
        const ty = Y(z(-7.6)) - H(1);
        p.r(X(8), ty + 1, 16, 9, '#3a3a44'); for (const k of [0, 1, 2, 3]) p.ell(X(8) + 4 + (k % 2) * 8, ty + 3 + (k >> 1) * 5, 2, 2, '#6a6a76');   // kompor
        p.r(X(10.5), ty + 2, 12, 7, '#c5d4dc'); p.r(X(10.5) + 2, ty + 3, 8, 5, '#9fb6c2');   // wastafel
      });
      prop(z(-7.2), x1 - 1.2, x1 - 0.2, z(-7.9), z(-7.2), 1.9, (p) => { p.box(x1 - 1.2, x1 - 0.2, z(-7.9), z(-7.2), 1.9, '#f2f2f2', '#d9dbe0', '#fff'); p.r(X(x1 - 0.4) - 2, Y(z(-7.2)) - H(1.9) + 8, 1, 10, '#9a9ca6'); });
      // meja-meja cafe (4 kursi) + meja panjang resto + meja bar
      for (const [tx, tz] of LAYOUT.CAFE_TABLES) {
        for (const [dx, dz, rot] of [[-0.85, 0, Math.PI / 2], [0.85, 0, -Math.PI / 2], [0, -0.85, 0], [0, 0.85, Math.PI]]) chair(P, C, tx + dx, z(tz + dz), rot, C.furnL, C.furn);
        prop(z(tz + 0.45), tx - 0.5, tx + 0.5, z(tz - 0.45), z(tz + 0.45), 0.75, (p) => { p.box(tx - 0.5, tx + 0.5, z(tz - 0.45), z(tz + 0.45), 0.75, '#f6efe2', C.furn, '#fff'); p.r(X(tx) - 2, Y(z(tz)) - H(0.75) - 2, 4, 3, '#e86a5a'); p.p(X(tx) - 1, Y(z(tz)) - H(0.75) - 4, C.leafL); });
      }
      const R = LAYOUT.RESTO;
      for (let i = 0; i < R.n; i++) { const x = R.x0 + 0.5 + i * 1.05; chair(P, C, x, z(R.lz - 1.0), 0, C.furnL, C.furn); chair(P, C, x, z(R.lz + 1.0), Math.PI, C.furnL, C.furn); }
      prop(z(R.lz + 0.5), R.x0, R.x1, z(R.lz - 0.5), z(R.lz + 0.5), 0.75, (p) => {
        p.box(R.x0, R.x1, z(R.lz - 0.5), z(R.lz + 0.5), 0.75, '#f6efe2', C.furn, '#fff');
        for (let i = 0; i < R.n; i++) { const x = X(R.x0 + 0.5 + i * 1.05); p.r(x - 3, Y(z(R.lz - 0.3)) - H(0.75), 6, 3, '#ffffff'); p.r(x - 3, Y(z(R.lz + 0.1)) - H(0.75), 6, 3, '#ffffff'); }
      });
      const B = LAYOUT.BAR;
      for (const x of B.front) chair(P, C, x, z(B.lz + 0.75), 0, '#c0444f', '#963440');
      for (const x of B.back) chair(P, C, x, z(B.lz - 0.75), Math.PI, '#c0444f', '#963440');
      prop(z(B.lz + 0.35), B.x0, B.x1, z(B.lz - 0.35), z(B.lz + 0.35), 1.0, (p) => p.box(B.x0, B.x1, z(B.lz - 0.35), z(B.lz + 0.35), 1.0, '#3a2a22', '#5a3d2e', '#6a4a3a'));
      plant(prop, C, x0 + 0.6, z(-7.0), 1); plant(prop, C, 6.2, z(-7.0), 1);
      sign(P, C, back, 3, 'CAFE & RESTO');
      lamps(4);
      break;
    }
    case 'santai': {
      fl('wood');
      backWall(P, C, x0, x1, back, L);
      rug(P, 14.2, 21.6, z(-6.2), z(-1.6), '#e8b04a', '#c98f2a');
      P.checker(14.6, 21.2, z(-5.8), z(-2.0), shade('#e8b04a', 0.08), shade('#e8b04a', -0.05), 8);
      tv(P, screens, back, 18.6, 3.2, 'tvLounge');
      prop(back + 0.5, 16.8, 20.4, back + 0.15, back + 0.5, 0.5, (p) => p.box(16.8, 20.4, back + 0.15, back + 0.5, 0.5, C.furnL, C.furn));
      sofa(P, prop, C, 17.2, 20.7, z(-4.1), 1);
      sofa(P, prop, C, 14.5, 16.3, z(-5.45), 1);
      P.w(17.6, 20.2, z(-5.6), z(-5.0), C.furnL);   // meja kopi
      for (const [bx, bz, c] of [[22.4, -5.2, '#e86a5a'], [22.6, -3.4, '#4a90c0'], [16.2, -2.6, '#7ac08a'], [21.0, -2.4, '#f2c14e']]) { P.ell(X(bx), Y(z(bz)) - 2, 9, 7, shade(c, -0.2)); P.ell(X(bx), Y(z(bz)) - 3, 8, 6, c); P.ell(X(bx) - 2, Y(z(bz)) - 5, 3, 2, shade(c, 0.3)); }
      // arcade + pingpong
      for (const ax of LAYOUT.ARCADE_X) prop(z(-7.0), ax - 0.4, ax + 0.4, z(-7.7), z(-7.0), 1.7, (p) => {
        p.box(ax - 0.4, ax + 0.4, z(-7.7), z(-7.0), 1.7, '#3a2a6a', '#2a1d4a', '#6a4ac0');
        p.r(X(ax) - 5, Y(z(-7.0)) - H(1.7) + 2, 10, 8, '#141030'); screens.push({ kind: 'arcade', key: ax, x: X(ax) - 4, y: Y(z(-7.0)) - H(1.7) + 3, w: 8, h: 6 });
        p.r(X(ax) - 4, Y(z(-7.0)) - 8, 8, 2, '#c0444f'); p.p(X(ax) - 3, Y(z(-7.0)) - 10, '#f2c14e');
      });
      const PP = LAYOUT.PINGPONG;
      prop(z(PP.lz + 0.75), PP.x - 1.35, PP.x + 1.35, z(PP.lz - 0.75), z(PP.lz + 0.75), 0.76, (p) => {
        p.box(PP.x - 1.35, PP.x + 1.35, z(PP.lz - 0.75), z(PP.lz + 0.75), 0.76, '#2f6fb0', '#24548a', '#fff');
        p.r(X(PP.x), Y(z(PP.lz - 0.75)) - H(0.76) - 2, 1, Y(z(PP.lz + 0.75)) - Y(z(PP.lz - 0.75)) + 2, '#f2f2f2');
        p.r(X(PP.x - 1.35), Y(z(PP.lz)) - H(0.76), X(PP.x + 1.35) - X(PP.x - 1.35), 1, '#ffffff');
      });
      shelf(prop, C, 13.4, 15.4, back, 1.8);
      plant(prop, C, x1 - 0.6, z(-0.8), 1.1); plant(prop, C, 13.6, z(-0.8), 1);
      frameArt(P, C, back, 22.5, 1);
      sign(P, C, back, 26.6, 'RUANG SANTAI');
      lamps(3);
      break;
    }
    case 'ydirRoom': case 'sdirRoom': case 'dirRoom': case 'tdirRoom': case 'cdirRoom': case 'vdirRoom': {
      fl('wood');
      backWall(P, C, x0, x1, back, L);
      const mgr = Object.keys(MGR_ROOM).find((k) => MGR_ROOM[k] === id);
      const mx = mgrX(mgr), accent = { ydir: '#c0444f', sdir: '#7c4fd0', dir: '#8b6fe0', tdir: '#2f4f8f', cdir: '#1f9e8f', vdir: '#d23b3b' }[mgr];
      rug(P, x0 + 0.6, x1 - 0.6, z(-7.3), z(-4.6), shade(accent, 0.35), accent);
      chair(P, C, mx, z(-6.95), 0, '#3a3a44', '#26262e');
      desk(prop, C, screens, mx - 1.0, mx + 1.0, z(-6.55), z(-5.85), 1, null, { top: C.furnL, front: C.furn });
      tv(P, screens, back, mx, 1.6, `tv${mgr[0].toUpperCase()}${mgr.slice(1)}`);
      shelf(prop, C, x0 + 0.2, x0 + 1.2, back, 1.8);
      sofa(P, prop, C, x0 + 1.0, x0 + 2.6, z(-1.3), 1, '#5a6a8a', '#46536e');
      plant(prop, C, x1 - 0.5, z(-0.7), 1);
      sign(P, C, back, mx, { ydir: 'MGR YOUTUBE', sdir: 'MGR STORY', dir: 'ESPORTS DIR', tdir: 'TRADING DIR', cdir: 'MGR CLIPPER', vdir: 'MGR MARVEL' }[mgr]);
      lamps(1);
      break;
    }
    case 'yt': case 'st': case 'mkt': case 'trd': case 'clip': case 'mv': {
      fl('carpet');
      backWall(P, C, x0, x1, back, L);
      const T = TEAM_DESK[id], accent = C.team[id];
      // karpet kotak-kotak di bawah tiap baris meja
      for (const lz of [-7.25, -3.6]) P.checker(T.xs[0] - T.w / 2 + 0.1, T.xs[T.xs.length - 1] + T.w / 2 - 0.1, z(lz - 0.6), z(lz + 1.6), C.check[0], C.check[1], 8);
      DESK_LIST.forEach((d, i) => {
        if (d.team !== id) return;
        const dz = z(d.lz), half = d.w / 2 - 0.25;
        chair(P, C, d.x, dz + 1.05, Math.PI, '#ffffff', '#c5c9d3');
        desk(prop, C, screens, d.x - half, d.x + half, dz - 0.45, dz + 0.45, -1, i, { mug: accent });
        // sekat bilik warna tim
        for (const sx of [d.x - d.w / 2, d.x + d.w / 2]) prop(dz + 0.5, sx - 0.05, sx + 0.05, dz - 0.6, dz + 0.5, 1.1, (p) => p.box(sx - 0.05, sx + 0.05, dz - 0.6, dz + 0.5, 1.1, shade(accent, 0.3), accent));
      });
      for (let x = x0 + 1.4; x < x1 - 1; x += 3.2) windowArt(P, back, x, 1.2);
      plant(prop, C, T.side + 0.1, z(-7.4), 0.9);
      if (id === 'trd') prop(back + 0.7, x1 - 1.4, x1 - 0.3, back + 0.2, back + 0.7, 2.0, (p) => {   // rak server
        p.box(x1 - 1.4, x1 - 0.3, back + 0.2, back + 0.7, 2.0, '#2a2d3a', '#1d1f2a', '#44485a');
        for (let y = Y(back + 0.7) - H(2) + 3; y < Y(back + 0.7) - 3; y += 3) { p.r(X(x1 - 1.3), y, X(x1 - 0.4) - X(x1 - 1.3), 2, '#363a4a'); screens.push({ kind: 'led', key: y, x: X(x1 - 1.3) + 2, y, w: 2, h: 1 }); }
      });
      if (id === 'trd') tv(P, screens, back, (x0 + x1) / 2 - 1, 3, 'ticker');
      sign(P, C, back, (x0 + x1) / 2 + (id === 'trd' ? 2.8 : 0), { yt: 'BILIK YOUTUBE', st: 'BILIK ZAA STORY', mkt: 'BILIK ABOUT ESPORTS', trd: 'BILIK TRADING', clip: 'BILIK CLIPPER', mv: 'BILIK MARVEL TALK' }[id]);
      lamps(3);
      break;
    }
    case 'meetM': case 'meetT': case 'meetY': case 'meetK': {
      fl(C.meet);
      P.tiles(x0, x1, back, face, C.meet, C.meetD, 24);
      backWall(P, C, x0, x1, back, L);
      const key = { meetM: 'meeting', meetT: 'meetingT', meetY: 'meetingY', meetK: 'meetingK' }[id], m = MEET[key];
      const tx0 = Math.min(...m.xs) - 0.55, tx1 = Math.max(...m.xs) + 0.55;
      for (const x of m.xs) { chair(P, C, x, z(m.lz - 0.95), 0, '#6ab07a', '#4f8a5c'); chair(P, C, x, z(m.lz + 0.95), Math.PI, '#6ab07a', '#4f8a5c'); }
      chair(P, C, m.ends[0], z(m.lz), Math.PI / 2, '#6ab07a', '#4f8a5c'); chair(P, C, m.ends[1], z(m.lz), -Math.PI / 2, '#6ab07a', '#4f8a5c');
      prop(z(m.lz + 0.5), tx0, tx1, z(m.lz - 0.5), z(m.lz + 0.5), 0.75, (p) => {
        p.box(tx0, tx1, z(m.lz - 0.5), z(m.lz + 0.5), 0.75, '#f7f5f0', '#cfc9bd', '#fff');
        for (const x of m.xs) { p.r(X(x) - 3, Y(z(m.lz - 0.35)) - H(0.75), 6, 3, '#ffffff'); p.r(X(x) - 2, Y(z(m.lz - 0.35)) - H(0.75) + 1, 4, 1, '#c9c9d4'); }
        p.r(X((tx0 + tx1) / 2) - 1, Y(z(m.lz)) - H(0.75) - 3, 2, 4, '#9fd4e8');
      });
      const mid = (x0 + x1) / 2;
      tv(P, screens, back, mid + (x1 - x0) * 0.18, Math.min(2.4, (x1 - x0) * 0.35), { meetM: 'tvMeet', meetT: 'tvMeetT', meetY: 'tvMeetY', meetK: 'tvMeetK' }[id]);
      onWall(P, back, mid - (x1 - x0) * 0.22, Math.min(2.2, (x1 - x0) * 0.3), 8, '#f8f8fa');
      P.r(X(mid - (x1 - x0) * 0.22) - 8, wy(back) + 3, 10, 1, '#4a90c0'); P.r(X(mid - (x1 - x0) * 0.22) - 8, wy(back) + 5, 6, 1, '#e86a5a');
      plant(prop, C, x0 + 0.5, z(-0.7), 0.9);
      sign(P, C, back, mid, { meetM: 'MEETING MKT', meetT: 'MEETING TRD', meetY: 'MEETING YT', meetK: 'MEETING KREATOR' }[id]);
      lamps(1);
      break;
    }
    case 'billiard': {
      fl('wood');
      P.w(x0 + 0.3, x1 - 0.3, z(-7.6), z(-0.6), '#3a5a4a');
      P.tiles(x0 + 0.3, x1 - 0.3, z(-7.6), z(-0.6), '#3a5a4a', '#334f41', 32);
      backWall(P, C, x0, x1, back, L);
      for (const [tx, tz] of BILLIARD) prop(z(tz + 0.75), tx - 1.35, tx + 1.35, z(tz - 0.75), z(tz + 0.75), 0.8, (p) => {
        p.box(tx - 1.35, tx + 1.35, z(tz - 0.75), z(tz + 0.75), 0.8, C.furn, C.furnD);
        const a = X(tx - 1.2), b = X(tx + 1.2), t = Y(z(tz - 0.6)) - H(0.8), bt = Y(z(tz + 0.6)) - H(0.8);
        p.r(a, t, b - a, bt - t, C.felt); p.r(a, t, b - a, 1, C.feltD);
        for (const [px, py] of [[a, t], [b - 2, t], [a, bt - 2], [b - 2, bt - 2], [(a + b) / 2 - 1, t], [(a + b) / 2 - 1, bt - 2]]) p.r(px, py, 2, 2, '#111');
        p.r(a + 8, t + 6, 2, 2, '#ffffff'); p.r(b - 14, t + 5, 2, 2, '#e8c45a'); p.r(b - 12, t + 8, 2, 2, '#c0444f'); p.r(b - 16, t + 9, 2, 2, '#4a7fc0');
      });
      for (let x = x0 + 1; x < x1 - 1; x += 4) { onWall(P, back, x, 1.4, 8, C.furnD); for (let k = 0; k < 4; k++) P.r(X(x) - 8 + k * 5, wy(back) + 1, 1, 9, '#d9b26a'); }
      sign(P, C, back, (x0 + x1) / 2, 'BILLIARD');
      lamps(2);
      for (const [tx, tz] of BILLIARD) lamp(tx, z(tz), 40, 'rgba(255,230,170,0.5)');
      break;
    }
    case 'boss': {
      fl('wood');
      backWall(P, C, x0, x1, back, L);
      rug(P, 6.2, 11.2, z(-7.4), z(-3.4), '#7a2a3a', '#5a1d2a');
      chair(P, C, 8.6, z(-6.6), 0, '#2a2433', '#1a1622');
      desk(prop, C, screens, 7.2, 10.0, z(-6.2), z(-5.3), 1, null, { top: '#5a3a2a', front: '#3f2a1e' });
      chair(P, C, SEC_DESK.x, z(SEC_DESK.lz - 0.85), 0, '#f2f2f6', '#c5c9d3');
      desk(prop, C, screens, SEC_DESK.x - 0.8, SEC_DESK.x + 0.8, z(SEC_DESK.lz - 0.45), z(SEC_DESK.lz + 0.3), 1, null, { top: C.desk, front: C.deskF });
      sofa(P, prop, C, 12.2, 14.6, z(-6.95), -1, '#3a3a52', '#2a2a3e');
      prop(z(-5.4), 12.6, 14.2, z(-5.9), z(-5.4), 0.45, (p) => { p.box(12.6, 14.2, z(-5.9), z(-5.4), 0.45, '#efe7da', C.furn, '#fff'); p.r(X(13.4) - 2, Y(z(-5.65)) - H(0.45) - 3, 4, 3, C.leafL); });
      tv(P, screens, back, 8.6, 2.4, 'tvBoss');
      shelf(prop, C, x0 + 0.3, x0 + 2.0, back, 2.0);
      frameArt(P, C, back, 13.4, 0);
      plant(prop, C, x1 - 0.5, z(-7.2), 1.1); plant(prop, C, x0 + 0.5, z(-0.7), 1);
      sign(P, C, back, 11.2, 'RUANG BOS');
      lamps(2);
      break;
    }
    case 'bioskop': {
      fl(C.dark);
      backWall(P, C, x0, x1, back, L);
      P.r(X(x0), wy(back), X(x1) - X(x0), FACE, '#1a1622');
      screens.push({ kind: 'cinema', key: 'cinema', x: X(x0 + 1.5), y: wy(back) + 1, w: X(x1 - 1.5) - X(x0 + 1.5), h: FACE - 2 });
      for (const r of LAYOUT.CINE_ROWS) {
        const rz = z(r.lz);
        P.w(x0 + 0.3, LAYOUT.CINE_X[LAYOUT.CINE_X.length - 1] + 0.7, rz - 0.55, rz + 0.65, shade(C.dark, 0.08 + r.h * 0.1));
        for (const x of LAYOUT.CINE_X) {
          P.w(x - 0.4, x + 0.4, rz - 0.35, rz + 0.25, C.red);
          prop(rz + 0.45, x - 0.42, x + 0.42, rz + 0.25, rz + 0.45, 0.9, (p) => p.box(x - 0.42, x + 0.42, rz + 0.25, rz + 0.45, 0.9, shade(C.red, 0.15), C.redD));
        }
      }
      for (let x = x0 + 0.6; x < x1; x += 1.6) P.r(X(x), Y(face) - 6, 2, 2, '#f2c14e');   // lampu lantai
      sign(P, C, back, 29.6, 'BIOSKOP');
      lamp((x0 + x1) / 2, z(-6.5), 120, 'rgba(160,190,255,0.35)');
      break;
    }
    case 'studio': {   // Lt.4: studio rekam podcast/VO buat Clipper & Marvel Talk
      fl('carpet');
      backWall(P, C, x0, x1, back, L);
      for (let x = x0 + 0.6; x < x1 - 0.6; x += 1.1) onWall(P, back, x, 0.9, 10, x % 2.2 < 1.1 ? '#3a3448' : '#4a425a');   // panel peredam
      rug(P, x0 + 2.5, x0 + 8.5, z(-6.6), z(-3.0), '#2f2a3a', '#d23b3b');
      prop(z(-4.3), x0 + 4.2, x0 + 6.8, z(-5.2), z(-4.3), 0.75, (p) => {   // meja podcast + 2 mic
        p.box(x0 + 4.2, x0 + 6.8, z(-5.2), z(-4.3), 0.75, '#2b2d3a', '#1d1f2a', '#44485a');
        for (const mx of [x0 + 4.8, x0 + 6.2]) { p.r(X(mx) - 1, Y(z(-4.9)) - H(1.15), 2, H(0.4), '#9aa0ad'); p.r(X(mx) - 2, Y(z(-4.9)) - H(1.25), 4, 3, '#2a2a2a'); }
      });
      chair(P, C, x0 + 4.8, z(-3.8), Math.PI, '#d23b3b', '#a82e2e'); chair(P, C, x0 + 6.2, z(-3.8), Math.PI, '#1f9e8f', '#17796d');
      sofa(P, prop, C, x1 - 4.6, x1 - 1.6, z(-6.9), 0, '#3a3448', '#2a2533');
      tv(P, screens, back, x1 - 3.1, 2.4, 'tvVdir');
      plant(prop, C, x1 - 0.6, z(-0.8), 1); plant(prop, C, x0 + 0.6, z(-0.8), 0.9);
      sign(P, C, back, x0 + 5.5, 'STUDIO PODCAST');
      lamps(2);
      break;
    }
    default: fl('wood'); backWall(P, C, x0, x1, back, L);
  }
}
