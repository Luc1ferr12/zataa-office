// Gedung Zataa Office v3: kantor terasering 3 tingkat di lereng bukit (rombak 18 Okt 2026: mess & kamar mandi dihapus,
// pegawai beraktivitas 24 jam). Tiap tingkat = selasar 2 m di depan + deretan ruang sedalam 8 m; tingkat di atasnya
// mundur penuh 10 m, jadi dari kamera semua ruangan selalu kelihatan (tanpa tombol lantai). Koordinat sama dengan nav.js:
// x ke kanan, y ke atas, z ke arah kamera (depan). Satuan meter.
import { material, T, UP, K, PXH, hash2, hash3, vnoise } from './engine.js';
import { textBitmap } from './font.js';

// ---------------------------------------------------------------- tata letak (dipakai juga oleh nav.js & export Blender)
export const FRONT = [4, -6, -16];           // tepi depan tiap tingkat (lantai 1…3)
export const FLOORS = FRONT.length;
export const CORR = 2;                       // lebar selasar
export const DEPTH = 10;                     // selasar + ruang
export const LY = [0, UP, UP * 2];           // tinggi lantai
export const RF = (L) => FRONT[L - 1] - CORR; // muka ruang (garis kaca depan)
export const RZ = (L, lz) => RF(L) + lz;     // lz: 0 = muka ruang, −8 = dinding belakang
export const SPAN = [[-32, 32], [-32, 32], [-32, 32]];
export const CORR_SPAN = [[-32, 32], [-32, 32], [-32, 32]];
// ruang per tingkat: [id, x0, x1, nama]
// Lt.1 publik (indoor) · Lt.2 kerja (tangga ke Lt.3 di pojok kiri, 3 ruang manajer, 3 bilik divisi) · Lt.3 hiburan, meeting & Bos
export const ROOMDEF = {
  1: [['mushola', -32, -20, 'Mushola'], ['wudhu', -20, -17, 'Tempat Wudhu'], ['gudang', -17, -14, 'Gudang Mbak Sari'], ['tangga1', -14, -10, 'Tangga'],
    ['cafe', -10, 13, 'Cafe & Resto'], ['santai', 13, 32, 'Ruang Santai']],
  2: [['tangga2', -32, -28, 'Tangga'], ['ydirRoom', -28, -21.5, 'R. Manajer YouTube'], ['dirRoom', -21.5, -15, 'R. Marketing Director'], ['tdirRoom', -15, -8.5, 'R. Trading Director'],
    ['yt', -8.5, 3, 'Bilik YouTube'], ['mkt', 3, 17.5, 'Bilik Marketing'], ['trd', 17.5, 32, 'Bilik Trading']],
  3: [['meetM', -32, -24, 'Meeting Marketing'], ['meetT', -24, -18, 'Meeting Trading'], ['meetY', -18, -14, 'Meeting YouTube'],
    ['billiard', -14, 2, 'Billiard'], ['boss', 2, 16, 'Ruang Boss'], ['bioskop', 16, 32, 'Bioskop Mini']],
};
export const ROOM = {};
for (const [L, list] of Object.entries(ROOMDEF)) for (const [id, x0, x1, name] of list) ROOM[id] = { id, L: +L, x0, x1, name, door: x1 - 1.2 };
ROOM.cafe.door = 0.8;     // pintu cafe di ujung jalan utama dari gerbang
ROOM.santai.door = 23.8;
export const STAIR = { x0: -1.4, x1: 1.4, lz0: -1.6, lz1: -8, steps: 12 };
// x tengah tangga yang naik DARI lantai t (index t−1): 1→2 di sel tangga Lt.1, 2→3 di pojok kiri Lt.2
export const STAIR_X = [-12, -30];
export const stairAt = (t) => STAIR_X[t - 1] ?? 0;
export const POOL = { x0: 9, x1: 27, z0: 8, z1: 16, y: -0.1 };
export const GAZEBO = { x: -17, z: 13, s: 6 };
// geser isi ruangan lama ke posisi barunya (x)
const CAFE_DX = 22, SANTAI_DX = -2, GUDANG_DX = -8, CINE_DX = 15.5;

// ---------------------------------------------------------------- tekstur
const fr = (v) => v - Math.floor(v);
const planks = (w = 0.42, len = 2.4, vari = 0.04) => (u, v) => {
  const row = Math.floor(v / w), fv = fr(v / w);
  const uu = u + hash2(row, 7) * len, col = Math.floor(uu / len);
  let s = (hash2(row, col) - 0.5) * vari;
  if (fv < 0.12) s -= 0.13;
  if (fr(uu / len) < 0.02) s -= 0.13;
  return s;
};
const tiles = (size, g = 0.08, vari = 0.08) => (u, v) => (fr(u / size) < g || fr(v / size) < g ? -0.17 : (hash2(Math.floor(u / size), Math.floor(v / size) + 99) - 0.5) * vari);
const slats = (p = 0.2, g = 0.3) => (u) => (fr(u / p) < g ? -0.12 : 0);
const hslats = (p = 0.16, g = 0.3) => (u, v) => (fr(v / p) < g ? -0.12 : 0);
const noise = (sc, amp) => (u, v) => (vnoise(u * sc, v * sc) - 0.5) * amp;
const ledge = (u, v) => {
  const row = Math.floor(v / 0.16), L = 0.35 + hash2(row, 3) * 0.6;
  const uu = u + hash2(row, 9) * 4, col = Math.floor(uu / L);
  let s = (hash2(row, col) - 0.5) * 0.3;
  if (fr(v / 0.16) < 0.22 || fr(uu / L) < 0.04) s -= 0.2;
  return s;
};
const rubble = (u, v) => {   // dinding batu undakan bukit
  const row = Math.floor(v / 0.45), uu = u + hash2(row, 5) * 3, L = 0.6 + hash2(row, 11) * 0.5, col = Math.floor(uu / L);
  let s = (hash2(row, col) - 0.5) * 0.28;
  if (fr(v / 0.45) < 0.1 || fr(uu / L) < 0.06) s -= 0.22;
  return s;
};
const grass = (u, v, a, b, x, y, z, px, py) => (vnoise(u * 0.35, v * 0.35) - 0.5) * 0.3 + (vnoise(u * 2, v * 2) - 0.5) * 0.12 + (hash2(px, py) < 0.08 ? 0.14 : 0) + (hash2(px + 7, py) < 0.05 ? -0.14 : 0);
const paving = (u, v) => {
  const row = Math.floor(v / 0.5), uu = u + (row % 2) * 0.45, col = Math.floor(uu / 0.9);
  let s = (hash2(row, col) - 0.5) * 0.12;
  if (fr(v / 0.5) < 0.1 || fr(uu / 0.9) < 0.05) s -= 0.16;
  return s;
};
const leaves = (u, v, n0, n1, x, y, z) => {
  const big = vnoise(x * 1.3 + z * 0.7, y * 1.5) - 0.5;
  const small = hash3(Math.floor(x * 7), Math.floor(y * 7), Math.floor(z * 7)) - 0.5;
  return big * 0.35 + small * 0.25;
};

// ---------------------------------------------------------------- material (palet terkontrol)
const M = {};
const mk = (name, color, o = {}) => (M[name] = material({ name, color, ...o }));
mk('grass', '#4f8f3c', { tex: grass, base: 0.48, noEdge: true });
mk('grassDark', '#3b7a35', { tex: grass, base: 0.45 });
mk('concrete', '#4a4752', { tex: noise(1.2, 0.12), base: 0.45 });
mk('slab', '#3a3741', { base: 0.42 });
mk('walnut', '#7a4f33', { tex: planks(0.55, 2.0), base: 0.52 });
mk('oak', '#b98d5e', { tex: planks(0.55, 2.4), base: 0.5 });
mk('workwood', '#5e4a5c', { tex: tiles(1.0, 0.04, 0.06), base: 0.5 });
mk('ledge', '#8d8577', { tex: ledge, base: 0.5 });
mk('ledgeDark', '#5f5a55', { tex: ledge, base: 0.45 });
mk('rubble', '#8a8172', { tex: rubble, base: 0.48 });
mk('plaster', '#e6ddd0', { tex: noise(2, 0.05), base: 0.55 });
mk('plasterWarm', '#d9c3a5', { tex: noise(2, 0.05), base: 0.53 });
mk('slatdark', '#3e2a21', { tex: slats(0.3, 0.2), base: 0.5 });
mk('slatdarkH', '#3e2a21', { tex: hslats(0.16), base: 0.5 });
mk('slat', '#a87447', { tex: slats(0.16), base: 0.52 });
mk('glass', '#a9dcf5', { glass: 0.22, base: 0.6, tex: (u, v, a, b, x, y, z, px, py) => (fr((px + py * 0.5) / 23) < 0.12 ? 0.3 : 0) });
mk('glassRail', '#c6e8ff', { glass: 0.16, base: 0.65 });
mk('steel', '#8b909c', { base: 0.5 });
mk('dark', '#2a2833', { base: 0.45 });
mk('black', '#17151d', { base: 0.42 });
mk('marble', '#ebe6dc', { tex: noise(3, 0.12), base: 0.55 });
mk('chrome', '#c7ccd6', { base: 0.58 });
mk('purple', '#7c3aed', { base: 0.5 });
mk('violet', '#a78bfa', { base: 0.5 });
mk('furn', '#7a5233', { tex: hslats(0.5, 0.06), base: 0.5 });
mk('lightwood', '#c89e6e', { base: 0.52 });
mk('sofa', '#4c3f78', { tex: noise(6, 0.08), base: 0.5 });
mk('bossSofa', '#3a2a24', { base: 0.48 });
mk('beanbag', '#8b45f0', { base: 0.52 });
mk('beanbag2', '#e0a640', { base: 0.52 });
mk('beanbag3', '#0d9488', { base: 0.52 });
mk('tile', '#dfe7ee', { tex: (u, v) => ((Math.floor(u * 3) + Math.floor(v * 3)) % 2 ? 0.06 : 0), base: 0.6 });
mk('tileBlue', '#cfe6ef', { tex: tiles(0.4, 0.06, 0.05), base: 0.58 });
mk('blanket', '#5b6bb5', { base: 0.5 });
mk('blanket2', '#c0668a', { base: 0.5 });
mk('rug', '#2e2752', { tex: (u, v) => (fr(Math.hypot(u, v * 1.4) / 0.6) < 0.12 ? 0.14 : 0), base: 0.48 });
mk('rugBoss', '#5a2f2a', { tex: (u, v) => (fr(u / 0.5) < 0.1 || fr(v / 0.5) < 0.1 ? 0.12 : 0), base: 0.46 });
mk('tread', '#9a6b45', { tex: hslats(0.5, 0.1), base: 0.54 });
mk('leather', '#24212c', { base: 0.47 });
mk('musCarpet', '#2f7a57', { tex: (u, v) => (fr(v / 0.85) < 0.08 ? 0.16 : (vnoise(u * 3, v * 3) - 0.5) * 0.08), base: 0.47 });
mk('meetCarpet', '#3b3656', { tex: noise(5, 0.07), base: 0.47 });
mk('trdCarpet', '#26323d', { tex: tiles(0.6, 0.04, 0.05), base: 0.46 });
mk('ytCarpet', '#3a2a30', { tex: tiles(0.6, 0.04, 0.05), base: 0.46 });
mk('ytRed', '#b91c1c', { base: 0.5 });
mk('cineCarpet', '#2a1f3d', { tex: noise(6, 0.06), base: 0.44 });
mk('cineWall', '#231a30', { tex: slats(0.5, 0.08), base: 0.44 });
mk('seatRed', '#9b2335', { base: 0.5 });
mk('deck', '#a5714a', { tex: planks(0.4, 1.8, 0.04), base: 0.5 });
mk('stone', '#bdb6a8', { tex: paving, base: 0.52 });
mk('stoneDark', '#5a5660', { tex: paving, base: 0.47 });
mk('poolEdge', '#f1eee6', { base: 0.56 });
mk('mosaic', '#2bb4c9', { tex: tiles(0.18, 0.12, 0.1), base: 0.5 });
mk('white', '#f1efe9', { base: 0.56 });
mk('hedge', '#356f30', { tex: leaves, base: 0.48 });
mk('foliage', '#4a9a3a', { tex: leaves, base: 0.5 });
mk('foliageDark', '#2f6b31', { tex: leaves, base: 0.48 });
mk('foliageLight', '#6db24a', { tex: leaves, base: 0.52 });
mk('palm', '#5ea83f', { tex: leaves, base: 0.5 });
mk('trunk', '#5d4030', { base: 0.47 });
mk('palmTrunk', '#8a6a48', { tex: hslats(0.18, 0.3), base: 0.5 });
mk('pot', '#3a3540', { base: 0.47 });
mk('potLight', '#d8d2c6', { base: 0.52 });
mk('soil', '#3b2a20', { base: 0.45 });
mk('cushion', '#f3efe4', { base: 0.56 });
mk('umbrella', '#f4f0e6', { base: 0.56 });
mk('umbrella2', '#7c3aed', { base: 0.5 });
mk('fence', '#2c2724', { tex: (u) => (fr(u / 0.3) < 0.42 ? NaN : 0), base: 0.47 });
mk('fridge', '#d9dde3', { base: 0.54 });
mk('bottle1', '#7a2f2f'); mk('bottle2', '#2f6b4a'); mk('bottle3', '#c79a3a'); mk('bottle4', '#3a4a8a');
mk('book1', '#7c3aed'); mk('book2', '#c2410c'); mk('book3', '#0e7490'); mk('book4', '#e7e2d6');
mk('cake', '#e9b7c8');
mk('copper', '#b8733e', { base: 0.52 });
mk('brass', '#c9a24a', { base: 0.54 });
mk('green', '#1f6b45', { base: 0.48 });
mk('felt', '#2f7a4b', { base: 0.48 });
mk('whiteboard', '#f4f4f0', { base: 0.6 });
mk('art1', '#7c3aed'); mk('art2', '#f59e0b'); mk('art3', '#14b8a6');
mk('rack', '#1d1b24', { tex: hslats(0.22, 0.2), base: 0.46 });
mk('pink', '#f472b6', { base: 0.55 });
mk('flower', '#e27aa0', { base: 0.55 });
mk('flower2', '#f2c94c', { base: 0.55 });
mk('sajadah', '#9b2d3a', { tex: (u, v, a, b) => (a < 0.1 || a > 0.9 || b < 0.06 || b > 0.94 ? 0.18 : b > 0.7 && b < 0.8 && a > 0.3 && a < 0.7 ? 0.2 : 0), base: 0.47 });
mk('sajadah2', '#235a8a', { tex: (u, v, a, b) => (a < 0.1 || a > 0.9 || b < 0.06 || b > 0.94 ? 0.18 : b > 0.7 && b < 0.8 && a > 0.3 && a < 0.7 ? 0.2 : 0), base: 0.47 });
mk('mihrab', '#1f5f45', { base: 0.47 });
mk('tabir', '#e8dccb', { tex: slats(0.18, 0.25), base: 0.55 });
mk('navy', '#1f2a4a', { base: 0.47 });
mk('gold', '#d4a73a', { base: 0.56 });
// lampu & layar (menyala, tidak kena bayangan)
const em = (name, color, base = 0.62, dayDim = 0.85) => mk(name, color, { emissive: true, base, dayDim });
em('lampWarm', '#ffd38a', 0.7, 0.8);
em('lampPurple', '#b07bff', 0.62, 0.8);
em('lampCyan', '#5fe3ff', 0.62, 0.75);
em('bulb', '#fff1c4', 0.72, 0.85);
em('signWhite', '#fbf8ff', 0.6, 1);
em('signViolet', '#b28dff', 0.55, 1);
em('signPurple', '#5b21b6', 0.5, 1);
em('signGold', '#f5c451', 0.6, 1);
em('signRed', '#ff4040', 0.58, 1);
em('candle', '#ffb347', 0.7, 0.7);
const rgb = ['#7c3aed', '#0891b2', '#db2777', '#65a30d', '#d97706', '#2563eb', '#e11d48', '#0d9488', '#ea580c', '#9333ea'];
rgb.forEach((c, i) => { em(`rgb${i}`, c, 0.6, 0.9); mk(`acc${i}`, c, { base: 0.5 }); });

// ---------------------------------------------------------------- meja kerja: 8 Marketing (0–7) + 6 Trading (8–13) + 6 YouTube (14–19)
// tiap meja: { x, z, rot, row, team, cell } — orang duduk menghadap monitor (−z)
// xs = tengah kolom bilik, w = lebar bilik, side = lorong samping (x) dekat pintu
export const TEAM_DESK = {
  mkt: { xs: [4.75, 8.0, 11.25, 14.5], w: 3.25, side: 16.8, panel: 'purple' },
  trd: { xs: [19.5, 23.2, 26.9], w: 3.7, side: 29.3, panel: 'navy' },
  yt: { xs: [-6.65, -3.35, -0.05], w: 3.3, side: 2.25, panel: 'ytRed' },
};
export const AISLE = { A: -4.8, B: -1.2 };   // lorong baris (lz)
const ROW_DESK = { A: -7.25, B: -3.6 };   // lz tengah meja
export const DESK_LIST = [];
for (const team of ['mkt', 'trd', 'yt']) for (const row of ['A', 'B']) for (const x of TEAM_DESK[team].xs) DESK_LIST.push({ x, lz: ROW_DESK[row], row, team, w: TEAM_DESK[team].w });
export const DESKS = DESK_LIST.length;
// kapasitas tiap tempat (dipakai schedule.js supaya nggak ada yang duduk numpuk)
export const CAP = { cafe: 28, counter: 8, lounge: 10, garden: 10, lounger: 6, meeting: 10, meetingT: 8, meetingY: 6, cinema: 28, billiard: 12, arcade: 5, waitBoss: 3 };
// permukaan dinamis (digambar ulang tiap frame oleh pixoffice.js)
const dynM = (name, color) => mk(name, color, { emissive: true, dyn: name });
dynM('water', '#2fb3d6');
for (let i = 0; i < DESKS; i++) dynM(`scr${i}`, '#0b0a14');
for (const n of ['tvLounge', 'tvMeet', 'tvMeetT', 'tvMeetY', 'tvBoss', 'racks', 'ticker', 'cinema', 'tvDir', 'tvTdir', 'tvYdir']) dynM(n, '#120a26');
export { M as MAT };

// ---------------------------------------------------------------- papan nama: teks 1:1 piksel di bidang yang menghadap kamera
function sign(w, h, text, on, scale = 1, off = null) {
  const bm = textBitmap(text, scale);
  const Wp = Math.round(w * K), Hp = Math.round(h * PXH);
  const ox = Math.floor((Wp - bm.w) / 2), oy = Math.floor((Hp - bm.h) / 2);
  return (u, v, a, b) => {
    const X = Math.floor(a * Wp) - ox, Y = Math.floor((1 - b) * Hp) - oy;
    if (bm.on(X, Y)) T.m = on.id;
    else if (off) T.m = off.id;
    return 0;
  };
}
// papan nama: tekstur piksel (mesin pixel) + huruf timbul 3D di depannya (supaya ikut kerender di Blender)
function label(B, w, h, x, y, z, bg, text, on, scale = 1, off = null) {
  B.vquad(w, h, x, y, z, bg, 0, { tex: sign(w, h, text, on, scale, off) });
  const cols = textBitmap(text).w;
  B.ptext(text, x, y, z + 0.005, Math.min(h * 0.62, ((w * 0.86) / cols) * 5), on);
}
// logo Zataa (dari assets/logo.png) diperkecil ke grid piksel lalu dipetakan ke 3 warna palet
function logoTex(logo, w, h) {
  const Wp = Math.round(w * K), Hp = Math.round(h * PXH);
  const s = Math.min(Wp, Hp);
  const ox = Math.floor((Wp - s) / 2), oy = Math.floor((Hp - s) / 2);
  return (u, v, a, b) => {
    const X = Math.floor(a * Wp) - ox, Y = Math.floor((1 - b) * Hp) - oy;
    if (!logo || X < 0 || Y < 0 || X >= s || Y >= s) return 0;
    const lx = Math.floor((X + 0.5) / s * logo.w), ly = Math.floor((Y + 0.5) / s * logo.h);
    const i = (ly * logo.w + lx) * 4, d = logo.data;
    if (d[i + 3] < 128) return 0;
    const lum = (d[i] + d[i + 1] + d[i + 2]) / 3;
    T.m = lum > 170 ? M.signWhite.id : d[i] > 90 && d[i + 2] > 180 ? M.signViolet.id : M.signPurple.id;
    return 0;
  };
}

// ---------------------------------------------------------------- builder
class Builder {
  constructor() { this.prims = []; }
  push(p) { this.prims.push(p); return p; }
  poly(P, mat, o = {}) { return this.push({ kind: 'poly', P, mat, ...o }); }
  // kotak w×h×d berpusat di (x,y,z); ry/rx seperti three.js. o.top = material permukaan atas
  box(w, h, d, x, y, z, mat, o = {}) {
    const ry = o.ry ?? 0, rx = o.rx ?? 0;
    const cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx);
    const V = [];
    for (let i = 0; i < 8; i++) {
      let px = (i & 1 ? 0.5 : -0.5) * w, py = (i & 2 ? 0.5 : -0.5) * h, pz = (i & 4 ? 0.5 : -0.5) * d;
      const py2 = py * cx - pz * sx, pz2 = py * sx + pz * cx;
      V.push([x + px * cy + pz2 * sy, y + py2, z - px * sy + pz2 * cy]);
    }
    const F = [[0, 2, 6, 4, 'x-'], [1, 5, 7, 3, 'x+'], [0, 4, 5, 1, 'y-'], [2, 3, 7, 6, 'y+'], [0, 1, 3, 2, 'z-'], [4, 6, 7, 5, 'z+']];
    for (const [a, b, c, e, k] of F) {
      if (k === 'y-' && !o.bottom) continue;
      const m = (k === 'y+' && o.top) || (k === 'z+' && o.front) || (k[0] === 'x' && o.side) || mat;
      let P = [V[a], V[b], V[c], V[e]];
      const e1 = P[1].map((q, j) => q - P[0][j]), e2 = P[2].map((q, j) => q - P[1][j]);
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const fc = [0, 1, 2].map((j) => (P[0][j] + P[2][j]) / 2 - [x, y, z][j]);
      if (n[0] * fc[0] + n[1] * fc[1] + n[2] * fc[2] < 0) P = P.reverse();
      this.poly(P, m, { cast: o.cast, face: k });
    }
  }
  // kotak dari batas (x0..x1, y0..y1, z0..z1)
  bx(x0, x1, y0, y1, z0, z1, mat, o) { this.box(x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, mat, o); }
  // bidang tegak menghadap +z (diputar ry). Titik 0 = kiri bawah → a ke kanan, b ke atas (dipakai tekstur papan nama)
  vquad(w, h, x, y, z, mat, ry = 0, o = {}) {
    const c = Math.cos(ry), s = Math.sin(ry);
    const pt = (lx, ly) => [x + lx * c, y + ly, z - lx * s];
    return this.poly([pt(-w / 2, -h / 2), pt(w / 2, -h / 2), pt(w / 2, h / 2), pt(-w / 2, h / 2)], mat, { two: true, cast: false, ...o });
  }
  floor(x1, x2, z1, z2, mat, y = 0, o = {}) {
    return this.poly([[x1, y, z2], [x2, y, z2], [x2, y, z1], [x1, y, z1]], mat, { two: true, cast: false, ...o });
  }
  disc(x, y, z, rx, rz, mat, seg = 20, o = {}) {
    const P = [];
    for (let i = 0; i < seg; i++) { const a = (i / seg) * Math.PI * 2; P.push([x + Math.cos(a) * rx, y, z - Math.sin(a) * rz]); }
    return this.poly(P, mat, { two: true, cast: false, ...o });
  }
  // silinder tegak (prisma), pusat di y
  cyl(r, h, x, y, z, mat, seg = 12, o = {}) {
    const y0 = y - h / 2, y1 = y + h / 2;
    const top = [];
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const p0 = [x + Math.cos(a0) * r, z + Math.sin(a0) * r], p1 = [x + Math.cos(a1) * r, z + Math.sin(a1) * r];
      this.poly([[p0[0], y0, p0[1]], [p1[0], y0, p1[1]], [p1[0], y1, p1[1]], [p0[0], y1, p0[1]]].reverse(), mat, { cast: o.cast });
      top.push([p0[0], y1, p0[1]]);
    }
    this.poly(top, o.top ?? mat, { two: true, cast: o.cast });
  }
  // tulisan font pixel 3×5 jadi balok kecil timbul (menghadap +z), tinggi huruf h, tengah di (cx, cy)
  ptext(text, cx, cy, z, h, mat, d = 0.04) {
    const bm = textBitmap(text), p = h / 5, x0 = cx - (bm.w * p) / 2;
    for (let Y = 0; Y < 5; Y++) for (let X = 0; X < bm.w; X++) {
      if (!bm.on(X, Y) || bm.on(X - 1, Y)) continue;
      let e = X;
      while (bm.on(e + 1, Y)) e++;
      this.bx(x0 + X * p, x0 + (e + 1) * p, cy + h / 2 - (Y + 1) * p, cy + h / 2 - Y * p, z, z + d, mat, { cast: false });
    }
  }
  ell(x, y, z, rx, ry, rz, mat, o = {}) { return this.push({ kind: 'ell', c: [x, y, z], r: [rx, ry, rz], mat, ...o }); }
  // kerucut (payung / atap)
  cone(x, y, z, r, h, mat, seg = 8, alt = M.umbrella2) {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      this.poly([[x, y + h, z], [x + Math.cos(a1) * r, y, z + Math.sin(a1) * r], [x + Math.cos(a0) * r, y, z + Math.sin(a0) * r]], i % 2 && alt ? alt : mat, { two: true });
    }
  }
}

// ---------------------------------------------------------------- furnitur
function pottedPlant(B, x, z, h = 1.3, y = 0, light = false) {
  B.cyl(0.26, 0.5, x, y + 0.25, z, light ? M.potLight : M.pot, 8);
  B.ell(x, y + 0.5 + h * 0.38, z, 0.36 + h * 0.08, h * 0.42, 0.36 + h * 0.08, M.foliage, { leafy: true });
  B.ell(x + 0.1, y + 0.5 + h * 0.62, z + 0.05, 0.24, h * 0.25, 0.24, M.foliageLight, { leafy: true });
}
function planter(B, x, z, y = 0, w = 1.4) {
  B.box(w, 0.5, 0.6, x, y + 0.25, z, M.pot);
  const n = Math.max(2, Math.round(w * 2));
  for (let i = 0; i < n; i++) {
    const px = x - w / 2 + 0.3 + (i * (w - 0.6)) / Math.max(1, n - 1);
    B.ell(px, y + 0.72, z, 0.3, 0.28, 0.26, i % 2 ? M.foliage : M.foliageLight, { leafy: true });
  }
}
function tree(B, x, z, h, dark = false, y = 0) {
  B.box(0.3, h * 0.55, 0.3, x, y + h * 0.27, z, M.trunk);
  const f = dark ? M.foliageDark : M.foliage;
  B.ell(x, y + h * 0.66, z, h * 0.3, h * 0.26, h * 0.3, f, { leafy: true });
  B.ell(x - h * 0.12, y + h * 0.8, z + h * 0.06, h * 0.2, h * 0.18, h * 0.2, dark ? M.foliage : M.foliageLight, { leafy: true });
}
function palm(B, x, z, h, y = 0) {
  for (let k = 0; k < 5; k++) B.box(0.22, h / 5 + 0.02, 0.22, x + k * 0.06, y + (k + 0.5) * (h / 5), z, M.palmTrunk);
  const tx = x + 0.3, ty = y + h + 0.1;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    B.ell(tx + Math.cos(a) * 0.9, ty - 0.2, z + Math.sin(a) * 0.9, 0.95, 0.16, 0.95, i % 2 ? M.palm : M.foliageLight, { leafy: true });
  }
  B.ell(tx, ty, z, 0.45, 0.3, 0.45, M.palm, { leafy: true });
}
function bush(B, x, z, r = 0.7, y = 0) {
  B.ell(x, y + r * 0.6, z, r, r * 0.75, r, hash2(x * 3, z * 3) < 0.5 ? M.hedge : M.foliage, { leafy: true });
}
function sofa(B, x, z, w, mat, seats, y = 0, faceUp = false) {
  const bz = faceUp ? z - 0.36 : z + 0.36;
  B.box(w, 0.42, 0.95, x, y + 0.21, z, mat);
  B.box(w, 0.5, 0.25, x, y + 0.62, bz, mat);
  for (const sx of [-1, 1]) B.box(0.24, 0.3, 0.95, x + sx * (w / 2 - 0.12), y + 0.55, z, mat);
  for (let i = 0; i < seats; i++) {
    const off = -w / 2 + 0.3 + ((w - 0.6) * (i + 0.5)) / seats;
    B.box((w - 0.6) / seats - 0.06, 0.12, 0.74, x + off, y + 0.48, z + (faceUp ? 0.08 : -0.08), mat);
  }
}
function officeChair(B, x, y, z, ry, fab, scale = 1) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const loc = (lx, lz) => [x + (lx * c + lz * s) * scale, z + (-lx * s + lz * c) * scale];
  let [px, pz] = loc(0, 0);
  B.box(0.5 * scale, 0.09 * scale, 0.48 * scale, px, y + 0.46 * scale, pz, fab, { ry });
  [px, pz] = loc(0, -0.24);
  B.box(0.48 * scale, 0.52 * scale, 0.08 * scale, px, y + 0.8 * scale, pz, fab, { ry, rx: 0.08 });
  B.box(0.08, 0.38 * scale, 0.08, x, y + 0.24 * scale, z, M.chrome);
  B.box(0.5 * scale, 0.05, 0.5 * scale, x, y + 0.04, z, M.steel, { ry: 0.6 });
}
function gamingChair(B, x, y, z, ry, i) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const loc = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  let [px, pz] = loc(0, 0.02);
  B.box(0.56, 0.12, 0.52, px, y + 0.47, pz, M.leather, { ry });
  [px, pz] = loc(0, -0.26);
  B.box(0.54, 0.84, 0.1, px, y + 0.96, pz, M.leather, { ry, rx: 0.12 });
  [px, pz] = loc(0, -0.27);
  B.box(0.18, 0.62, 0.11, px, y + 0.98, pz, M[`acc${i % 10}`], { ry, rx: 0.12 });
  B.box(0.08, 0.38, 0.08, x, y + 0.25, z, M.chrome);
  B.box(0.6, 0.05, 0.6, x, y + 0.05, z, M.steel, { ry: 0.4 });
}
function stool(B, x, y, z, mat = M.copper) {
  B.cyl(0.22, 0.08, x, y + 0.46, z, mat, 10);
  B.box(0.06, 0.42, 0.06, x, y + 0.21, z, M.steel);
}
function frame(B, x, y, z, w, h, palette, ry = 0) {
  B.vquad(w + 0.1, h + 0.1, x, y, z, M.black, ry);
  const c = Math.cos(ry), s = Math.sin(ry), o = 0.02;
  B.vquad(w, h, x + s * o, y, z + c * o, M.white, ry);
  [[-0.22, 0.12, 0.45, 0.5], [0.18, -0.05, 0.4, 0.75], [-0.05, -0.28, 0.75, 0.22]].forEach(([u, v, uw, vh], k) => {
    const oo = o * (k + 2);
    B.vquad(uw * w, vh * h, x + c * u * w + s * oo, y + v * h, z - s * u * w + c * oo, M[palette[k]], ry);
  });
}
function bookshelf(B, x0, x1, y, z, h = 2.2) {   // rak menempel dinding belakang (menghadap +z)
  const w = x1 - x0, cx = (x0 + x1) / 2;
  B.box(w, h, 0.4, cx, y + h / 2, z + 0.2, M.furn);
  const rows = Math.floor(h / 0.48), n = Math.floor(w / 0.24);
  for (let k = 0; k < rows; k++) for (let b = 0; b < n; b++) {
    if (hash2(b * 3 + k, Math.round(x0 * 10)) < 0.18) continue;
    B.box(0.18, 0.26 + (b % 3) * 0.03, 0.1, x0 + 0.15 + b * 0.24, y + 0.36 + k * 0.48, z + 0.42, M[`book${(k + b) % 4 + 1}`]);
  }
}
function bunk(B, x, y, z, blanket) {   // kasur tingkat, kepala di belakang (−z)
  for (const dx of [-0.42, 0.42]) for (const dz of [-0.95, 0.95]) B.box(0.07, 1.95, 0.07, x + dx, y + 0.97, z + dz, M.steel);
  for (const [yy, mat] of [[0.3, blanket], [1.27, blanket === M.blanket ? M.blanket2 : M.blanket]]) {
    B.box(0.9, 0.12, 2.0, x, y + yy, z, M.lightwood);
    B.box(0.82, 0.12, 1.9, x, y + yy + 0.12, z, M.white);
    B.box(0.84, 0.05, 1.1, x, y + yy + 0.19, z + 0.3, mat);
    B.box(0.6, 0.1, 0.35, x, y + yy + 0.22, z - 0.75, M.white);
  }
  B.box(0.06, 1.0, 0.06, x + 0.45, y + 1.0, z + 0.95, M.steel);
}

// ---------------------------------------------------------------- tempat duduk/berdiri (dipakai nav.js) — semua koordinat dunia
export function makeSpots() {
  const S = {};
  const y = (L) => LY[L - 1];
  // meja kerja
  S.desk = DESK_LIST.map((d) => ({ x: d.x, y: y(2), z: RZ(2, d.lz + 1.05), rot: Math.PI, row: d.row, team: d.team, room: d.team, aisle: RZ(2, AISLE[d.row]), side: TEAM_DESK[d.team].side }));
  // ruang manajer & boss: duduk di belakang meja menghadap kamera
  for (const id of Object.keys(MGR_ROOM)) {
    const r = ROOM[MGR_ROOM[id]];
    S[`${id}Desk`] = { x: mgrX(id), y: y(2), z: RZ(2, -6.95), rot: 0 };
    S[`${id}Sofa`] = [r.x0 + 1.4, r.x0 + 2.2].map((x) => ({ x, y: y(2), z: RZ(2, -1.3), rot: Math.PI }));
  }
  S.bossDesk = { x: 8.6, y: y(3), z: RZ(3, -6.6), rot: 0 };
  S.bossSofa = [12.6, 13.4, 14.2].map((x) => ({ x, y: y(3), z: RZ(3, -6.95), rot: 0 }));
  // kursi tunggu di selasar depan ruang Bos (manajer nunggu approval Owner)
  S.waitBoss = WAIT_X.map((x) => ({ x, y: y(3) + 0.02, z: RZ(3, 0.4), rot: 0 }));
  // cafe: 4 meja × 4 kursi + meja makan panjang 12 kursi
  S.cafe = [];
  // lane = lorong (lz) untuk mendekati kursi: antar baris meja −6.0 / −3.15 / −0.4
  for (const [tx, tz] of CAFE_TABLES) {
    const row1 = tz < -3, side = row1 ? -3.15 : -0.4;
    S.cafe.push({ x: tx - 0.85, z: RZ(1, tz), rot: Math.PI / 2, lane: side, cafe: true }, { x: tx + 0.85, z: RZ(1, tz), rot: -Math.PI / 2, lane: side, cafe: true });
    S.cafe.push({ x: tx, z: RZ(1, tz - 0.85), rot: 0, lane: row1 ? -6.0 : -3.15, cafe: true }, { x: tx, z: RZ(1, tz + 0.85), rot: Math.PI, lane: row1 ? -3.15 : -0.4, cafe: true });
  }
  for (let i = 0; i < 6; i++) {
    const x = RESTO.x0 + 0.5 + i * 1.05;
    S.cafe.push({ x, z: RZ(1, RESTO.lz - 1.0), rot: 0, lane: -5.0 }, { x, z: RZ(1, RESTO.lz + 1.0), rot: Math.PI, lane: -1.2 });
  }
  S.counter = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => ({ x: -8.6 + k * 0.9, z: RZ(1, -6.3), rot: Math.PI }));
  S.kitchen = { x: -11.5 + CAFE_DX, z: RZ(1, -6.4), rot: Math.PI };
  S.gudang = { x: -7.5 + GUDANG_DX, z: RZ(1, -5.0), rot: -Math.PI / 2 };
  // ruang santai: sofa menghadap TV (belakang), beanbag
  const sx = (x) => x + SANTAI_DX;
  S.lounge = [
    ...[19.6, 20.5, 21.4, 22.3].map((x) => ({ x: sx(x), z: RZ(1, -4.1), rot: Math.PI, pose: 'phone' })),
    { x: sx(16.9), z: RZ(1, -5.45), rot: Math.PI, pose: 'phone' }, { x: sx(17.9), z: RZ(1, -5.45), rot: Math.PI, pose: 'phone' },
    { x: sx(24.4), z: RZ(1, -5.2), rot: Math.PI, pose: 'beanbag' }, { x: sx(24.6), z: RZ(1, -3.4), rot: Math.PI, pose: 'beanbag' },
    { x: sx(18.2), z: RZ(1, -2.6), rot: Math.PI, pose: 'beanbag' }, { x: sx(23.0), z: RZ(1, -2.4), rot: Math.PI, pose: 'beanbag' },
  ];
  // pojok arcade + pingpong (ujung kanan ruang santai): main sambil berdiri
  S.arcade = [
    ...ARCADE_X.map((x) => ({ x, z: RZ(1, -6.55), rot: Math.PI })),
    { x: PINGPONG.x - 1.85, z: RZ(1, PINGPONG.lz), rot: Math.PI / 2 }, { x: PINGPONG.x + 1.85, z: RZ(1, PINGPONG.lz), rot: -Math.PI / 2 },
  ];
  // bioskop (Lt.3): 4 baris × 7 kursi menghadap layar di dinding belakang; baris belakang kursi 23–24 = love seat Zamiir & Aprista
  S.cinema = [];
  CINE_ROWS.forEach((r) => CINE_X.forEach((x) => S.cinema.push({ x, y: y(3) + r.h + 0.05, z: RZ(3, r.lz + 0.05), rot: Math.PI, row: r.lz })));
  // billiard (Lt.3): 4 meja, tiap meja 3 pemain (ujung kiri, ujung kanan, sisi depan)
  S.billiard = BILLIARD.flatMap(([tx, tz]) => [
    { x: tx - 1.75, y: y(3), z: RZ(3, tz), rot: Math.PI / 2, tx, tz },
    { x: tx + 1.75, y: y(3), z: RZ(3, tz), rot: -Math.PI / 2, tx, tz },
    { x: tx, y: y(3), z: RZ(3, tz + 1.25), rot: Math.PI, tx, tz },
  ]);
  // ruang meeting (Lt.3): kursi tiap sisi meja + 2 ujung
  for (const [key, m] of Object.entries(MEET)) S[key] = meetSeats(m).map((c) => ({ x: c.x, y: y(3), z: RZ(3, c.lz), rot: c.rot }));
  // musholla (Lt.1): kiblat = mihrab di dinding belakang. Imam, 1 shaf pria (12), tabir, 1 shaf wanita (13)
  S.musholla = makeSpotsMushola();
  S.mimbar = { x: MIMBAR_X, y: y(1) + 0.9, z: RZ(1, -7.15), rot: 0 };
  S.wudhu = WUDHU_X.map((x) => ({ x, y: y(1), z: RZ(1, -6.9), rot: Math.PI }));
  // halaman: gazebo + bangku taman, kursi berjemur, kolam
  S.garden = [];
  for (const dx of [-0.9, 0, 0.9]) S.garden.push({ x: GAZEBO.x + dx, y: 0.3, z: GAZEBO.z - 1.25, rot: 0, gz: true }, { x: GAZEBO.x + dx, y: 0.3, z: GAZEBO.z + 1.25, rot: Math.PI, gz: true });
  for (const [bx, bz] of BENCHES) S.garden.push({ x: bx - 0.45, z: bz, rot: Math.PI }, { x: bx + 0.45, z: bz, rot: Math.PI });
  S.lounger = LOUNGER_X.map((x) => ({ x, z: 19.0, rot: Math.PI }));
  S.pool = [9.2, 10.6, 12.0, 13.4, 14.8].map((z) => ({ x: (POOL.x0 + POOL.x1) / 2, z, half: 7.6, y: -0.15 }));
  return S;
}

// angka tata letak per ruangan (dipakai builder & makeSpots)
const CAFE_TABLES = [[-29.6, -4.6], [-25.9, -4.6], [-29.6, -1.7], [-25.9, -1.7]].map(([x, z]) => [x + CAFE_DX, z]);
const RESTO = { x0: -22.6 + CAFE_DX, x1: -16.2 + CAFE_DX, lz: -3.2 };
const CINE_X = [5.2, 6.3, 7.4, 8.5, 9.6, 10.7, 11.8].map((x) => x + CINE_DX);
const CINE_ROWS = [{ lz: -5.0, h: 0 }, { lz: -3.65, h: 0.25 }, { lz: -2.3, h: 0.5 }, { lz: -0.95, h: 0.75 }];
export const CINE_AISLE = 28.4;   // lorong kanan bioskop (x), di atas undakan kursi
// meja billiard (x tengah, lz tengah): 2 baris × 2
export const BILLIARD = [[-9.8, -6.0], [-3.6, -6.0], [-9.8, -2.8], [-3.6, -2.8]];
const ARCADE_X = [25.8, 26.7, 27.6];
const PINGPONG = { x: 29.8, lz: -3.5 };
const WAIT_X = [12.6, 11.8, 11.0];
// ruang manajer Lt.2 (id pegawai → ruang); meja di tengah ruang
export const MGR_ROOM = { ydir: 'ydirRoom', dir: 'dirRoom', tdir: 'tdirRoom' };
export const mgrX = (id) => (ROOM[MGR_ROOM[id]].x0 + ROOM[MGR_ROOM[id]].x1) / 2;
// ruang meeting Lt.3: kursi sisi (xs), kursi ujung, lz tengah meja, lorong belakang (east)
export const MEET = {
  meeting: { room: 'meetM', xs: [-30.4, -29.0, -27.6, -26.2], ends: [-31.55, -24.6], lz: -4.0, east: -24.3 },
  meetingT: { room: 'meetT', xs: [-22.1, -21.0, -19.9], ends: [-23.35, -18.65], lz: -4.2, east: -18.35 },
  meetingY: { room: 'meetY', xs: [-16.6, -15.4], ends: [-17.55, -14.45], lz: -4.2, east: -14.3 },
};
// kursi meeting: urutan slot = sisi belakang/depan per kolom, lalu 2 ujung
const meetSeats = (m) => [
  ...m.xs.flatMap((x) => [{ x, lz: m.lz - 0.95, rot: 0 }, { x, lz: m.lz + 0.95, rot: Math.PI }]),
  { x: m.ends[0], lz: m.lz, rot: Math.PI / 2 }, { x: m.ends[1], lz: m.lz, rot: -Math.PI / 2 },
];
const MIHRAB_X = -26, MIMBAR_X = -23.6;
const WUDHU_X = [-19.55, -18.85, -18.15, -17.45];
const BENCHES = [[-4.6, 9.5], [-4.6, 15.5], [-24.5, 22.5]];
const LOUNGER_X = [10, 11.8, 13.6, 15.4, 17.2, 19.0];

// label ruangan (posisi dunia) — ditampilkan sebagai HTML di atas canvas
const ICON = {
  mushola: '🕌', wudhu: '💧', gudang: '🧹', cafe: '☕', santai: '🛋️',
  ydirRoom: '💼', dirRoom: '💼', tdirRoom: '💼', yt: '🎬', mkt: '💻', trd: '📈',
  meetM: '🗣️', meetT: '🗣️', meetY: '🗣️', billiard: '🎱', boss: '👔', bioskop: '🍿',
};
export const ROOMS = [
  ...Object.values(ROOM).filter((r) => !r.id.startsWith('tangga')).map((r) => ({ name: r.name, icon: ICON[r.id] ?? '', p: [(r.x0 + r.x1) / 2, LY[r.L - 1] + 3.0, RZ(r.L, -7.6)] })),
  { name: 'Taman & Gazebo', icon: '🌿', p: [GAZEBO.x, 3.9, GAZEBO.z] },
  { name: 'Kolam Renang', icon: '🏊', p: [(POOL.x0 + POOL.x1) / 2, 0.6, POOL.z1 + 0.5] },
];

// ---------------------------------------------------------------- bangun seluruh kompleks
export function buildScene(logo) {
  const B = new Builder();
  const lights = [];
  const L = (x, y, z, color, r, i = 1) => lights.push({ p: [x, y, z], color, r, i });
  const WARM = [1.0, 0.72, 0.42], COOL = [0.8, 0.85, 1.0], PURP = [0.7, 0.45, 1.0], CYAN = [0.3, 0.85, 1.0], GREEN = [0.4, 1.0, 0.6];
  const HX0 = -72, HX1 = 72;   // lebar bukit

  // ================================================================ BUKIT TERASERING
  // halaman depan + lantai 1 (bolong di kolam supaya air tembus pandang ke dasar kolam)
  const ph = [POOL.x0 - 0.35, POOL.x1 + 0.35, POOL.z0 - 0.35, POOL.z1 + 0.35];
  for (const [x0, x1, z0, z1] of [[HX0, HX1, FRONT[0] - DEPTH, ph[2]], [HX0, HX1, ph[3], 70], [HX0, ph[0], ph[2], ph[3]], [ph[1], HX1, ph[2], ph[3]]]) B.floor(x0, x1, z0, z1, M.grass, -0.03);
  for (let L4 = 2; L4 <= FLOORS; L4++) B.floor(HX0, HX1, FRONT[L4 - 1] - DEPTH, FRONT[L4 - 1], M.grass, LY[L4 - 1] - 0.02);
  B.floor(HX0, HX1, -90, FRONT[FLOORS - 1] - DEPTH, M.grassDark, LY[FLOORS - 1] - 0.02);   // puncak bukit di belakang
  // dinding batu undakan (belakang tiap tingkat = dinding belakang ruangan)
  for (let t = 1; t < FLOORS; t++) {
    const z = FRONT[t - 1] - DEPTH, y0 = LY[t - 1];
    B.box(HX1 - HX0, UP, 0.8, 0, y0 + UP / 2, z - 0.4, M.rubble, { top: M.grass });
  }
  // pohon & semak di undakan kiri-kanan gedung + puncak bukit
  const rnd = (() => { let s = 11; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  for (let t = 1; t <= FLOORS; t++) {
    const [a, b] = CORR_SPAN[t - 1], y0 = LY[t - 1];
    const z0 = FRONT[t - 1] - DEPTH + 1.2, z1 = FRONT[t - 1] - (t === 1 ? 4 : 0.8);
    for (let x = -50; x < 50; x += 2.6 + rnd() * 1.2) {
      if (x > a - 1.2 && x < b + 1.2) continue;
      const z = z0 + rnd() * (z1 - z0);
      if (rnd() < 0.55) tree(B, x, z, 3.4 + rnd() * 2.2, rnd() < 0.5, y0); else bush(B, x, z, 0.6 + rnd() * 0.4, y0);
    }
  }
  for (let x = -54; x < 54; x += 2.4 + rnd() * 1.4) tree(B, x, FRONT[FLOORS - 1] - DEPTH - 2 - rnd() * 7, 4 + rnd() * 2.5, rnd() < 0.6, LY[FLOORS - 1]);

  // ================================================================ GEDUNG: per tingkat
  const sekat = (y, x0, x1, z0, z1, gaps = [], h = 0.8) => {   // sekat rendah + kaca, dengan bukaan pintu
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const a0 = alongX ? x0 : z0, a1 = alongX ? x1 : z1;
    const segs = []; let cur = a0;
    for (const [g0, g1] of gaps.sort((p, q) => p[0] - q[0])) { segs.push([cur, g0]); cur = g1; }
    segs.push([cur, a1]);
    for (const [u0, u1] of segs) {
      const len = u1 - u0, c = (u0 + u1) / 2;
      if (len < 0.05) continue;
      const [w, d, cx, cz] = alongX ? [len, 0.12, c, z0] : [0.12, len, x0, c];
      B.box(w, h, d, cx, y + h / 2, cz, M.slat);
      B.box(alongX ? w : 0.03, 1.4, alongX ? 0.03 : d, cx, y + h + 0.7, cz, M.glass);
      B.box(alongX ? w : 0.08, 0.07, alongX ? 0.08 : d, cx, y + h + 1.42, cz, M.steel);
    }
  };
  for (let t = 1; t <= FLOORS; t++) {
    const y = LY[t - 1], rf = RF(t), zb = rf - 8;
    const [a, b] = SPAN[t - 1], [ca, cb] = CORR_SPAN[t - 1];
    // selasar (teras depan untuk lantai 1)
    B.floor(ca, cb, rf, FRONT[t - 1], t === 1 ? M.deck : M.stone, y + 0.006);
    if (t > 1) {   // pagar kaca di tepi selasar, celah di atas tangga dari lantai bawah
      const sx = stairAt(t - 1);
      for (const [x0, x1] of [[ca, sx + STAIR.x0 - 0.2], [sx + STAIR.x1 + 0.2, cb]]) {
        if (x1 - x0 < 0.05) continue;
        B.box(x1 - x0, 1.0, 0.04, (x0 + x1) / 2, y + 0.5, FRONT[t - 1] - 0.05, M.glassRail);
        B.box(x1 - x0, 0.07, 0.1, (x0 + x1) / 2, y + 1.03, FRONT[t - 1] - 0.05, M.steel);
      }
      B.box(cb - ca, 0.3, 0.3, (ca + cb) / 2, y - 0.15, FRONT[t - 1] - 0.15, M.slab);   // tepi pelat
    }
    for (let x = ca + 3; x < cb; x += 6) L(x, y + 2.6, FRONT[t - 1] - 1, WARM, 3.2, 0.7);
    // dinding belakang ruangan (plester) di depan dinding batu, dinding timur penuh, barat rendah + kaca
    for (const [id, x0, x1] of ROOMDEF[t]) if (id !== 'boss') B.box(x1 - x0, 3.3, 0.04, (x0 + x1) / 2, y + 1.65, zb + 0.02, M.plaster);
    B.box(0.3, 3.3, 8, b + 0.15, y + 1.65, zb + 4, M.ledgeDark, { top: M.dark });
    B.box(0.3, 0.8, 8, a - 0.15, y + 0.4, zb + 4, M.ledge, { top: M.dark });
    B.box(0.03, 1.4, 8, a - 0.15, y + 1.5, zb + 4, M.glass);
    // muka ruang: kaca rendah dengan pintu, sekat antar ruang
    for (const [id, x0, x1] of ROOMDEF[t]) {
      const r = ROOM[id];
      const gaps = id.startsWith('tangga') ? [[stairAt(t) + STAIR.x0 - 0.2, stairAt(t) + STAIR.x1 + 0.2]] : [[r.door - 0.6, r.door + 0.6]];
      sekat(y, x0, x1, rf, rf, gaps, 0.5);
      if (x0 > a) sekat(y, x0, x0, zb, rf);
    }
  }

  // ---------------------------------------------------------------- tangga (lantai 1→2 sel tangga Lt.1, 2→3 pojok kiri Lt.2)
  for (let t = 1; t < FLOORS; t++) {
    const y = LY[t - 1], run = STAIR.lz0 - STAIR.lz1, n = STAIR.steps, rise = UP / n, cx = stairAt(t);
    for (let i = 0; i < n; i++) {
      const lz = STAIR.lz0 - (i + 0.5) * (run / n);
      B.box(STAIR.x1 - STAIR.x0, 0.13, run / n + 0.04, cx, y + (i + 1) * rise - 0.065, RZ(t, lz), M.tread, { front: M.dark });
      B.box(STAIR.x1 - STAIR.x0 - 0.1, 0.035, 0.04, cx, y + (i + 1) * rise - 0.13, RZ(t, lz) + run / n / 2 - 0.02, M.lampWarm, { cast: false });
    }
    for (const sx of [cx + STAIR.x0 - 0.05, cx + STAIR.x1 + 0.05]) {
      const z0 = RZ(t, STAIR.lz0), z1 = RZ(t, STAIR.lz1);
      B.poly([[sx, y, z0], [sx, y + UP, z1], [sx, y + UP - 0.5, z1], [sx, y, z0 - 1]], M.dark, { two: true });
      B.poly([[sx, y + 0.12, z0], [sx, y + UP + 0.12, z1], [sx, y + UP + 1.0, z1], [sx, y + 1.0, z0]], M.glassRail, { two: true });
    }
    L(cx, y + 2.4, RZ(t, -4), WARM, 3.5, 0.6);
  }

  // ================================================================ LANTAI 1 · PUBLIK (indoor)
  // kiri → kanan: Mushola · Tempat Wudhu · Gudang Mbak Sari · Tangga ke Lt.2 · Cafe & Resto (+ dapur) · Ruang Santai
  {
    const y = 0, z = (lz) => RZ(1, lz);
    for (const [id, mat] of [['mushola', M.musCarpet], ['wudhu', M.tileBlue], ['gudang', M.tile], ['tangga1', M.oak], ['cafe', M.oak], ['santai', M.walnut]]) {
      B.floor(ROOM[id].x0, ROOM[id].x1, z(-8), z(0), mat, y + 0.004);
    }
    B.floor(-14 + CAFE_DX, 13, z(-8), z(-2.6), M.tile, y + 0.006);   // lantai dapur
    // ---- MUSHOLA: mihrab di dinding belakang, imam, shaf pria, tabir, shaf wanita
    B.box(12, 3.3, 0.05, -26, y + 1.65, z(-7.92), M.slat);
    B.box(2.6, 3.0, 0.08, MIHRAB_X, y + 1.5, z(-7.86), M.mihrab);
    B.ell(MIHRAB_X, y + 3.0, z(-7.84), 1.3, 0.75, 0.04, M.mihrab, { cast: false });
    for (const sx of [-1.35, 1.35]) B.box(0.12, 3.0, 0.12, MIHRAB_X + sx, y + 1.5, z(-7.82), M.brass);
    B.ell(MIHRAB_X, y + 2.2, z(-7.8), 0.55, 0.55, 0.02, M.signGold, { cast: false });
    B.ell(MIHRAB_X, y + 2.2, z(-7.78), 0.42, 0.42, 0.02, M.mihrab, { cast: false });
    for (const sx of [-1.2, 1.2]) B.box(0.06, 2.6, 0.05, MIHRAB_X + sx, y + 1.3, z(-7.78), M.lampWarm, { cast: false });
    const saj = (x, zz, mat) => B.poly([[x - 0.34, y + 0.012, zz + 0.58], [x + 0.34, y + 0.012, zz + 0.58], [x + 0.34, y + 0.012, zz - 0.58], [x - 0.34, y + 0.012, zz - 0.58]], mat, { two: true, cast: false });
    const SP = makeSpotsMushola();
    saj(SP.imam.x, SP.imam.z, M.sajadah);
    for (const s of SP.men) saj(s.x, s.z, M.sajadah);
    for (const s of SP.women) saj(s.x, s.z, M.sajadah2);
    // tabir (pembatas pria–wanita), celah di sisi timur untuk lewat
    B.box(10.4, 1.3, 0.08, -26.4, y + 0.65, z(-3.85), M.tabir);
    for (const x of [-31.6, -26.4, -21.2]) B.box(0.08, 1.4, 0.08, x, y + 0.7, z(-3.85), M.brass);
    // mimbar (kanan mihrab) — Zamiir khotbah Jumat dari sini
    B.box(1.1, 0.3, 1.3, MIMBAR_X, y + 0.15, z(-7.15), M.lightwood);
    B.box(1.1, 0.3, 0.9, MIMBAR_X, y + 0.45, z(-7.35), M.lightwood);
    B.box(1.1, 0.3, 0.6, MIMBAR_X, y + 0.75, z(-7.5), M.lightwood);
    for (const sx of [-0.55, 0.55]) B.box(0.08, 1.0, 1.3, MIMBAR_X + sx, y + 0.95, z(-7.15), M.brass);
    B.box(1.6, 1.0, 0.4, -30.6, y + 0.5, z(-7.6), M.furn);   // rak Quran
    for (let k = 0; k < 6; k++) B.box(0.18, 0.28, 0.22, -31.2 + k * 0.24, y + 1.14, z(-7.6), k % 2 ? M.green : M.brass);
    B.box(0.5, 1.5, 2.6, -31.6, y + 0.75, z(-1.6), M.lightwood);   // rak sajadah & mukena
    for (let k = 0; k < 3; k++) B.box(0.4, 0.15, 2.4, -31.6, y + 0.4 + k * 0.45, z(-1.6), k % 2 ? M.white : M.sajadah2);
    frame(B, -29.4, y + 1.9, z(-7.88), 1.2, 0.9, ['art3', 'art1', 'art2']);
    L(-26, y + 2.4, z(-4), WARM, 5.5, 1.0); L(MIHRAB_X, y + 1.6, z(-7.3), [1, 0.85, 0.5], 2.5, 0.9);
    // ---- TEMPAT WUDHU (4 keran wudhu duduk)
    B.box(2.9, 0.8, 0.5, -18.5, y + 0.4, z(-7.7), M.marble);
    B.box(2.9, 0.06, 0.06, -18.5, y + 0.82, z(-7.45), M.lampCyan, { cast: false });
    for (const x of WUDHU_X) { B.box(0.08, 0.35, 0.08, x, y + 1.15, z(-7.85), M.chrome); B.box(0.05, 0.05, 0.25, x, y + 1.3, z(-7.72), M.chrome); B.box(0.35, 0.3, 0.35, x, y + 0.15, z(-6.6), M.lightwood); }
    B.box(0.06, 0.8, 2.4, -17.1, y + 2.2, z(-6.5), M.black);
    B.box(2.4, 0.5, 0.35, -18.5, y + 0.25, z(-0.6), M.furn);   // rak sandal
    label(B, 2.3, 0.6, -18.5, y + 2.4, z(-7.88), M.black, 'WUDHU', M.signGold, 2);
    L(-18.5, y + 2.4, z(-4.5), COOL, 4.0, 0.9);
    // ---- GUDANG MBAK SARI (kecil): 2 rak, ember & pel
    for (const sx of [-8.6, -6.45].map((x) => x + GUDANG_DX)) {
      B.box(0.6, 2.1, 5.2, sx, 1.05, z(-4.9), M.lightwood);
      for (let k = 0; k < 4; k++) for (let b = 0; b < 6; b++) B.box(0.3, 0.25, 0.4, sx, 0.4 + k * 0.5, z(-7.0) + b * 0.82, M[hash2(k, b) < 0.5 ? 'acc' + ((k + b) % 10) : 'white']);
    }
    B.cyl(0.18, 0.35, -16.0, 0.17, z(-0.7), M.acc5, 10);
    B.box(0.05, 1.3, 0.05, -14.45, 0.65, z(-0.8), M.lightwood);
    L(-15.5, 2.5, z(-4), WARM, 2.6, 0.6);
    // ---- SEL TANGGA (naik ke Lt.2)
    pottedPlant(B, -13.4, z(-0.7), 1.2, 0, true);
    // ---- CAFE & RESTO (+ dapur di ujung kanan)
    const cx = (x) => x + CAFE_DX;
    B.box(7.4, 1.05, 0.9, cx(-27.3), 0.52, z(-6.95), M.slatdark, { top: M.marble });
    B.box(7.6, 0.07, 1.05, cx(-27.3), 1.08, z(-6.95), M.marble);
    B.box(0.6, 0.5, 0.5, cx(-30.2), 1.36, z(-7.1), M.chrome);
    B.box(0.55, 0.42, 0.45, cx(-29.3), 1.32, z(-7.1), M.purple);
    B.box(0.5, 0.3, 0.4, cx(-25.0), 1.26, z(-7.0), M.glass);
    B.box(0.46, 0.08, 0.36, cx(-25.0), 1.15, z(-7.0), M.cake);
    for (let k = 0; k < 3; k++) {   // rak botol di dinding belakang
      B.box(7.2, 0.06, 0.35, cx(-27.3), 1.5 + k * 0.5, z(-7.78), M.furn);
      for (let b = 0; b < 17; b++) B.box(0.13, 0.26 + (b % 3) * 0.03, 0.13, cx(-30.7) + b * 0.42, 1.66 + k * 0.5, z(-7.75), M[`bottle${(b + k) % 4 + 1}`]);
    }
    B.box(2.6, 1.0, 0.06, cx(-27.3), 3.0, z(-7.85), M.black);
    label(B, 2.5, 0.9, cx(-27.3), 3.0, z(-7.8), M.black, 'CAFE', M.signGold, 2);
    for (const [tx, tz] of CAFE_TABLES) {
      B.cyl(0.55, 0.06, tx, 0.75, z(tz), M.marble, 14);
      B.box(0.1, 0.7, 0.1, tx, 0.37, z(tz), M.steel);
      for (const [dx, dz] of [[-0.85, 0], [0.85, 0], [0, -0.85], [0, 0.85]]) stool(B, tx + dx, 0, z(tz + dz));
      B.box(0.08, 0.09, 0.08, tx - 0.2, 0.83, z(tz) + 0.15, M.candle, { cast: false });
      L(tx, 1.6, z(tz), WARM, 3.0, 0.7);
    }
    // meja makan panjang resto
    B.box(RESTO.x1 - RESTO.x0, 0.07, 1.2, (RESTO.x0 + RESTO.x1) / 2, 0.76, z(RESTO.lz), M.walnut);
    for (const lx of [RESTO.x0 + 0.3, RESTO.x1 - 0.3]) B.box(0.1, 0.72, 1.0, lx, 0.37, z(RESTO.lz), M.dark);
    for (let i = 0; i < 6; i++) {
      const x = RESTO.x0 + 0.5 + i * 1.05;
      for (const [dz, ry] of [[-1.0, 0], [1.0, Math.PI]]) officeChair(B, x, 0, z(RESTO.lz + dz), ry, M.sofa, 0.9);
      B.box(0.3, 0.02, 0.25, x, 0.8, z(RESTO.lz - 0.3), M.white);
    }
    for (let i = 0; i < 3; i++) { B.ell(RESTO.x0 + 1.2 + i * 2.1, 2.7, z(RESTO.lz), 0.2, 0.15, 0.2, M.bulb, { cast: false }); L(RESTO.x0 + 1.2 + i * 2.1, 2.5, z(RESTO.lz), WARM, 3.2, 1.0); }
    pottedPlant(B, cx(-31.4), z(-0.6), 1.5);
    pottedPlant(B, 12.4, z(-0.7), 1.3, 0, true);
    frame(B, cx(-19.4), 2.0, z(-7.88), 1.6, 1.0, ['art2', 'art1', 'art3']);
    // dapur: kompor & kabinet di dinding belakang, kulkas, meja saji
    B.box(4.6, 0.95, 0.7, cx(-11.5), 0.47, z(-7.55), M.steel, { top: M.marble });
    B.box(1.0, 0.1, 0.6, cx(-10.6), 0.98, z(-7.55), M.black);
    B.box(1.2, 0.7, 0.5, cx(-10.6), 2.3, z(-7.6), M.steel);
    B.box(0.85, 1.95, 0.7, cx(-9.55), 0.97, z(-4.5), M.fridge);
    B.box(2.4, 0.95, 1.0, cx(-11.5), 0.47, z(-3.6), M.steel, { top: M.marble });
    for (let k = 0; k < 4; k++) B.box(0.3, 0.2, 0.3, cx(-12.4) + k * 0.6, 1.05, z(-3.6), M[`bottle${k + 1}`]);
    L(cx(-11.5), 2.6, z(-5), COOL, 3.5, 0.8);
    // ---- RUANG SANTAI (TV di dinding belakang, sofa menghadap TV) + pojok arcade & pingpong
    const sx = (x) => x + SANTAI_DX;
    B.box(6.0, 2.8, 0.3, sx(21), 1.4, z(-7.7), M.slatdark);
    B.box(3.6, 2.0, 0.07, sx(21), 1.6, z(-7.52), M.black);
    B.vquad(3.4, 1.85, sx(21), 1.6, z(-7.48), M.tvLounge);
    B.box(6.0, 0.06, 0.06, sx(21), 0.05, z(-7.52), M.lampPurple, { cast: false });
    B.box(2.6, 0.4, 0.45, sx(21), 0.2, z(-7.2), M.furn);
    B.disc(sx(21), 0.014, z(-4.6), 3.2, 2.0, M.rug, 24);
    sofa(B, sx(21), z(-3.75), 4.0, M.sofa, 4);
    sofa(B, sx(17.4), z(-5.15), 2.2, M.sofa, 2, 0, false);
    B.cyl(0.5, 0.06, sx(21), 0.42, z(-5.4), M.furn, 14);
    B.ell(sx(24.4), 0.3, z(-5.2), 0.55, 0.32, 0.55, M.beanbag);
    B.ell(sx(24.6), 0.3, z(-3.4), 0.55, 0.32, 0.55, M.beanbag2);
    B.ell(sx(18.2), 0.3, z(-2.4), 0.55, 0.32, 0.55, M.beanbag3);
    B.ell(sx(23.0), 0.3, z(-2.2), 0.55, 0.32, 0.55, M.beanbag);
    bookshelf(B, sx(15.3), sx(17.0), 0, z(-8) + 0.1, 2.0);
    ARCADE_X.forEach((ax, k) => {
      B.box(0.8, 1.8, 0.7, ax, 0.9, z(-7.35), M.black);
      B.box(0.6, 0.5, 0.05, ax, 1.45, z(-6.98), M[`rgb${[5, 2, 7][k]}`], { cast: false });
      B.box(0.7, 0.08, 0.3, ax, 1.0, z(-6.9), M[`acc${[5, 2, 7][k]}`]);
    });
    // meja pingpong
    B.box(2.74, 0.06, 1.52, PINGPONG.x, 0.76, z(PINGPONG.lz), M.navy);
    B.box(0.04, 0.16, 1.6, PINGPONG.x, 0.86, z(PINGPONG.lz), M.white);
    B.box(2.74, 0.01, 0.03, PINGPONG.x, 0.795, z(PINGPONG.lz), M.white);
    for (const [dx, dz] of [[-1.2, -0.6], [1.2, -0.6], [-1.2, 0.6], [1.2, 0.6]]) B.box(0.08, 0.72, 0.08, PINGPONG.x + dx, 0.36, z(PINGPONG.lz + dz), M.steel);
    pottedPlant(B, 31.4, z(-7.3), 1.4, 0, true);
    L(sx(21), 2.6, z(-4.4), WARM, 4.5, 0.9); L(sx(21), 1.6, z(-6.6), PURP, 3.2, 0.8); L(28.4, 2.4, z(-5), PURP, 4, 0.8);
  }

  // ================================================================ LANTAI 2 · KERJA
  // kiri → kanan: tangga ke Lt.3 · R. Manajer YouTube · R. Marketing Director · R. Trading Director · bilik YouTube · bilik Marketing · bilik Trading
  {
    const y = LY[1], z = (lz) => RZ(2, lz);
    for (const [id, mat] of [['tangga2', M.oak], ['ydirRoom', M.walnut], ['dirRoom', M.walnut], ['tdirRoom', M.walnut], ['yt', M.ytCarpet], ['mkt', M.workwood], ['trd', M.trdCarpet]]) {
      B.floor(ROOM[id].x0, ROOM[id].x1, z(-8), z(0), mat, y + 0.004);
    }
    // ---- RUANG MANAJER (Bagas · Andre · Mahendra): meja tengah, kursi menghadap kamera, sofa tamu depan kiri
    const mgrRoom = (id, chair, chairScale, sofaMat) => {
      const r = ROOM[MGR_ROOM[id]], cx = mgrX(id);
      B.box(2.4, 0.08, 1.0, cx, y + 0.77, z(-6.0), M.walnut);
      B.box(2.3, 0.72, 0.06, cx, y + 0.38, z(-5.52), M.walnut);
      for (const sx of [-1.12, 1.12]) B.box(0.08, 0.72, 0.9, cx + sx, y + 0.38, z(-6.0), M.walnut);
      officeChair(B, cx, y, z(-6.95), 0, chair, chairScale);
      sofa(B, r.x0 + 1.8, z(-1.3), 2.2, sofaMat, 2, y, false);
      B.cyl(0.4, 0.05, r.x0 + 1.8, y + 0.4, z(-2.6), M.marble, 12);
      pottedPlant(B, r.x1 - 0.55, z(-7.2), 1.4, y, true);
      L(cx, y + 2.6, z(-4), WARM, 4, 0.9);
      return { r, cx };
    };
    {   // Manajer YouTube (Bagas): rak buku sejarah, papan SHORTS merah
      const { r, cx } = mgrRoom('ydir', M.ytRed, 1.1, M.sofa);
      B.box(0.9, 0.52, 0.05, cx, y + 1.15, z(-6.25), M.black);
      B.vquad(0.82, 0.44, cx, y + 1.15, z(-6.22), M.tvYdir, Math.PI);
      bookshelf(B, r.x0 + 0.2, r.x0 + 2.2, y, z(-8) + 0.1);
      B.box(2.2, 0.75, 0.08, cx + 1.4, y + 2.35, z(-7.9), M.black);
      label(B, 2.1, 0.65, cx + 1.4, y + 2.35, z(-7.85), M.black, 'SHORTS', M.signRed, 1);
    }
    {   // Marketing Director (Andre)
      const { r, cx } = mgrRoom('dir', M.pink, 1.1, M.blanket2);
      B.box(0.9, 0.52, 0.05, cx, y + 1.15, z(-6.25), M.black);
      B.vquad(0.82, 0.44, cx, y + 1.15, z(-6.22), M.tvDir, Math.PI);
      bookshelf(B, r.x0 + 0.2, r.x0 + 2.2, y, z(-8) + 0.1);
      frame(B, cx + 1.5, y + 1.9, z(-7.88), 1.3, 0.9, ['art1', 'art3', 'art2']);
    }
    {   // Trading Director (Mahendra): 2 monitor, papan XAUUSD, brankas
      const { r, cx } = mgrRoom('tdir', M.leather, 1.15, M.bossSofa);
      for (const [dx, ry] of [[-0.7, 0.3], [0.7, -0.3]]) { B.box(0.9, 0.52, 0.05, cx + dx, y + 1.15, z(-6.25), M.black, { ry }); B.vquad(0.82, 0.44, cx + dx, y + 1.15, z(-6.22), M.tvTdir, Math.PI + ry); }
      B.box(4.4, 1.2, 0.08, cx, y + 2.3, z(-7.9), M.black);
      label(B, 4.2, 1.05, cx, y + 2.3, z(-7.85), M.plaster, 'XAUUSD', M.signGold, 2, M.black);
      B.box(0.6, 1.0, 0.6, r.x0 + 3.6, y + 0.5, z(-1.0), M.dark);   // brankas
      B.box(0.2, 0.2, 0.05, r.x0 + 3.6, y + 0.7, z(-0.68), M.brass);
    }
    // ---- BILIK YOUTUBE (6 meja) · MARKETING (8 meja) · TRADING (6 meja)
    DESK_LIST.forEach((d, i) => {
      const dz = z(d.lz), trd = d.team === 'trd';
      const w = trd ? 2.6 : 1.9;
      B.box(w, 0.06, 0.85, d.x, y + 0.75, dz, M.black);
      for (const sx of [-w / 2 + 0.05, w / 2 - 0.05]) B.box(0.07, 0.72, 0.7, d.x + sx, y + 0.37, dz, M.steel);
      B.box(w, 0.04, 0.04, d.x, y + 0.72, dz + 0.43, M[`rgb${i % 10}`], { cast: false });
      const mons = trd ? [[-0.86, 0.35], [0, 0], [0.86, -0.35]] : [[-0.43, 0.12], [0.43, -0.12]];
      for (const [dx, ry] of mons) {
        B.box(0.82, 0.5, 0.05, d.x + dx, y + 1.2, dz - 0.25, M.black, { ry });
        B.vquad(0.74, 0.42, d.x + dx, y + 1.2, dz - 0.22, M[`scr${i}`], ry);
      }
      B.box(0.08, 0.32, 0.08, d.x, y + 0.93, dz - 0.3, M.steel);
      B.box(0.48, 0.03, 0.16, d.x, y + 0.79, dz + 0.12, M.dark);
      B.box(0.1, 0.1, 0.1, d.x - w / 2 + 0.25, y + 0.82, dz + 0.05, M[`acc${i % 10}`]);
      gamingChair(B, d.x, y, dz + 1.05, Math.PI, i);
      // panel bilik (kiri-kanan + belakang baris B)
      for (const sx of [-d.w / 2, d.w / 2]) B.box(0.06, 1.25, 2.3, d.x + sx, y + 0.62, dz + 0.65, M[TEAM_DESK[d.team].panel]);
      L(d.x, y + 2.5, dz + 0.5, COOL, 3.4, 0.8);
    });
    for (const T of Object.values(TEAM_DESK)) for (const x of T.xs) B.box(T.w, 1.25, 0.06, x, y + 0.62, z(ROW_DESK.B - 0.48), M[T.panel]);
    // dinding fitur: YOUTUBE (merah), MARKETING (ungu), video wall harga emas (trading)
    const mid = (id) => (ROOM[id].x0 + ROOM[id].x1) / 2;
    B.box(10.6, 0.05, 0.05, mid('yt'), y + 2.9, z(-7.94), M.signRed, { cast: false });
    label(B, 5.2, 0.9, mid('yt'), y + 2.85, z(-7.92), M.plaster, 'YOUTUBE', M.signRed, 2);
    B.box(13.6, 0.05, 0.05, mid('mkt'), y + 2.9, z(-7.94), M.lampPurple, { cast: false });
    label(B, 5.2, 0.9, mid('mkt'), y + 2.85, z(-7.92), M.plaster, 'MARKETING', M.signPurple, 2);
    const tx = (ROOM.trd.x0 + TEAM_DESK.trd.xs.at(-1) + TEAM_DESK.trd.w / 2) / 2;
    B.box(10.4, 1.6, 0.1, tx, y + 2.45, z(-7.9), M.black);
    B.vquad(10.2, 1.45, tx, y + 2.45, z(-7.84), M.ticker);
    // ---- RAK SERVER BOT TRADING (pojok kanan bilik trading)
    for (const rz of [-7.3, -5.9]) {
      B.box(1.4, 2.2, 1.0, 31.0, y + 1.1, z(rz), M.rack);
      B.vquad(1.25, 1.9, 31.0, y + 1.12, z(rz) + 0.51, M.racks);
    }
    L(31.0, y + 2.4, z(-6), GREEN, 3.0, 0.7);
  }

  // ================================================================ LANTAI 3 · PUNCAK (meeting, billiard, ruang Bos, bioskop)
  {
    const y = LY[2], z = (lz) => RZ(3, lz);
    for (const [id, mat] of [['meetM', M.meetCarpet], ['meetT', M.meetCarpet], ['meetY', M.meetCarpet], ['billiard', M.walnut], ['boss', M.walnut], ['bioskop', M.cineCarpet]]) {
      B.floor(ROOM[id].x0, ROOM[id].x1, z(-8), z(0), mat, y + 0.004);
    }
    // ---- RUANG MEETING: Marketing 10 kursi, Trading 8 kursi (oval), YouTube 6 kursi
    {
      const m = MEET.meeting, cx = (m.ends[0] + m.ends[1]) / 2;
      B.box(6.0, 0.08, 1.5, cx, y + 0.76, z(m.lz), M.furn);
      for (const lx of [cx - 2.5, cx + 2.5]) B.box(0.24, 0.72, 0.24, lx, y + 0.36, z(m.lz), M.steel);
      for (const s of meetSeats(m)) officeChair(B, s.x, y, z(s.lz), s.rot, M.leather);
      B.box(4.1, 2.25, 0.1, cx, y + 1.75, z(-7.9), M.black);
      B.vquad(3.9, 2.05, cx, y + 1.75, z(-7.84), M.tvMeet);
      pottedPlant(B, -24.7, z(-7.2), 1.3, y);
      for (const px of [cx - 1.7, cx, cx + 1.7]) { B.ell(px, y + 2.6, z(m.lz), 0.15, 0.12, 0.15, M.bulb, { cast: false }); L(px, y + 2.4, z(m.lz), WARM, 3.5, 0.9); }
    }
    for (const [key, mat, tv, w] of [['meetingT', M.navy, M.tvMeetT, 3.6], ['meetingY', M.ytRed, M.tvMeetY, 2.6]]) {
      const m = MEET[key], cx = (m.ends[0] + m.ends[1]) / 2, rx = (m.ends[1] - m.ends[0]) / 2 - 0.85;
      B.disc(cx, y + 0.78, z(m.lz), rx, 0.8, M.walnut, 22, { cast: true });
      B.cyl(0.25, 0.75, cx, y + 0.38, z(m.lz), M.steel, 10);
      for (const s of meetSeats(m)) officeChair(B, s.x, y, z(s.lz), s.rot, mat);
      B.box(w + 0.2, 2.0, 0.1, cx, y + 1.75, z(-7.9), M.black);
      B.vquad(w, 1.8, cx, y + 1.75, z(-7.84), tv);
      L(cx, y + 2.5, z(m.lz), WARM, 3.8, 0.9);
    }
    // ---- BILLIARD: 4 meja (2 × 2), rak stik, papan skor, bangku tunggu di dinding barat
    for (const [tx, tz] of BILLIARD) {
      B.box(2.6, 0.12, 1.4, tx, y + 0.82, z(tz), M.felt, { top: M.felt });
      B.box(2.8, 0.18, 1.6, tx, y + 0.74, z(tz), M.walnut);
      for (const [dx, dz] of [[-1.2, -0.6], [1.2, -0.6], [-1.2, 0.6], [1.2, 0.6]]) B.box(0.14, 0.7, 0.14, tx + dx, y + 0.35, z(tz + dz), M.walnut);
      for (const [bx, bz, c] of [[-0.6, 0.2, 'acc4'], [-0.4, -0.15, 'acc0'], [0.3, 0.1, 'white'], [0.7, -0.3, 'acc6']]) B.ell(tx + bx, y + 0.92, z(tz + bz), 0.06, 0.06, 0.06, M[c], { cast: false });
      B.box(1.8, 0.08, 0.3, tx, y + 2.35, z(tz), M.dark);   // lampu gantung meja
      B.box(1.6, 0.03, 0.22, tx, y + 2.3, z(tz), M.lampWarm, { cast: false });
      L(tx, y + 2.1, z(tz), WARM, 3.2, 1.0);
    }
    for (const rx of [-12.6, -0.8]) {   // rak stik
      B.box(1.2, 1.6, 0.12, rx, y + 1.1, z(-7.85), M.walnut);
      for (let k = 0; k < 6; k++) B.box(0.04, 1.4, 0.04, rx - 0.45 + k * 0.18, y + 1.0, z(-7.75), M.lightwood);
    }
    B.box(3.2, 0.9, 0.08, -6.7, y + 2.3, z(-7.9), M.black);
    label(B, 3.0, 0.75, -6.7, y + 2.3, z(-7.84), M.black, 'BILLIARD', M.signGold, 2);
    B.box(0.5, 0.45, 3.2, -13.6, y + 0.22, z(-4.4), M.leather);
    B.box(0.15, 0.5, 3.2, -13.85, y + 0.65, z(-4.4), M.leather);
    pottedPlant(B, -13.4, z(-0.7), 1.2, y, true);
    // ---- RUANG BOSS (Zamiir): jendela besar ke puncak bukit, meja besar, layar approval, sofa set
    B.box(14, 3.3, 0.1, 9, y + 1.65, z(-8.0), M.ledgeDark);
    for (let x = 3; x <= 15.01; x += 2.4) B.box(0.09, 3.0, 0.1, x, y + 1.7, z(-7.92), M.steel);
    B.vquad(12, 2.6, 9, y + 1.7, z(-7.94), M.glass);
    B.box(2.6, 0.08, 1.1, 8.6, y + 0.77, z(-5.7), M.walnut);
    B.box(2.5, 0.72, 0.06, 8.6, y + 0.38, z(-5.18), M.walnut);
    for (const sx of [-1.22, 1.22]) B.box(0.08, 0.72, 1.0, 8.6 + sx, y + 0.38, z(-5.7), M.walnut);
    for (const dx of [-0.5, 0.5]) { B.box(0.9, 0.52, 0.05, 8.6 + dx, y + 1.15, z(-5.95), M.black, { ry: dx * 0.4 }); B.box(0.08, 0.3, 0.08, 8.6 + dx, y + 0.95, z(-6.0), M.steel); }
    officeChair(B, 8.6, y, z(-6.6), 0, M.leather, 1.2);
    B.box(1.95, 1.12, 0.06, 4.6, y + 2.1, z(-7.75), M.black);
    B.vquad(1.8, 1.0, 4.6, y + 2.1, z(-7.7), M.tvBoss);
    B.vquad(1.0, 1.0, 3.0, y + 2.1, z(-7.7), M.ledgeDark, 0, { tex: logoTex(logo, 1.0, 1.0) });
    B.disc(13.4, y + 0.012, z(-5.6), 1.8, 1.1, M.rugBoss, 4);
    sofa(B, 13.4, z(-6.95), 2.8, M.bossSofa, 3, y, true);
    B.cyl(0.55, 0.06, 13.4, y + 0.4, z(-5.4), M.marble, 14);
    B.box(0.5, 2.0, 2.6, 15.6, y + 1.0, z(-3.6), M.furn);   // lemari piala
    for (let k = 0; k < 3; k++) for (let b = 0; b < 4; b++) B.box(0.2, 0.3, 0.2, 15.5, y + 0.5 + k * 0.6, z(-4.6 + b * 0.65), b % 2 ? M.gold : M.brass);
    pottedPlant(B, 2.6, z(-0.8), 1.5, y);
    L(8.6, y + 2.6, z(-4.6), WARM, 5, 1.0); L(13.4, y + 2.2, z(-5.8), WARM, 4, 0.8);
    // kursi tunggu di selasar depan pintu Bos: manajer divisi nunggu approval Owner di sini
    const wx = (WAIT_X[0] + WAIT_X.at(-1)) / 2, ww = WAIT_X[0] - WAIT_X.at(-1) + 0.9;
    B.box(ww, 0.08, 0.48, wx, y + 0.45, z(0.4), M.walnut);
    B.box(ww, 0.45, 0.07, wx, y + 0.75, z(0.12), M.walnut, { rx: 0.08 });
    for (const dx of [-ww / 2 + 0.1, ww / 2 - 0.1]) B.box(0.07, 0.45, 0.42, wx + dx, y + 0.22, z(0.4), M.steel);
    pottedPlant(B, WAIT_X.at(-1) - 0.9, z(0.45), 0.9, y, true);
    label(B, 1.6, 0.36, wx, y + 2.05, z(0.02), M.black, 'BOSS', M.signGold, 1);
    // ---- BIOSKOP MINI
    const bx = (x) => x + CINE_DX, r = ROOM.bioskop, rw = r.x1 - r.x0, rc = (r.x0 + r.x1) / 2;
    B.box(rw, 3.3, 0.1, rc, y + 1.65, z(-7.9), M.cineWall);
    for (const sx of [r.x0 + 0.12, r.x1 - 0.12]) B.box(0.12, 2.6, 8, sx, y + 1.3, z(-4), M.cineWall);
    B.box(7.6, 2.6, 0.1, bx(8.5), y + 1.95, z(-7.82), M.black);
    B.vquad(7.4, 2.4, bx(8.5), y + 1.95, z(-7.76), M.cinema);
    for (const sx of [bx(4.4), bx(12.6)]) B.box(0.6, 3.0, 0.3, sx, y + 1.5, z(-7.7), M.dark);
    for (const sx of [bx(4.4), bx(12.6)]) B.box(0.4, 0.4, 0.2, sx, y + 2.8, z(-7.5), M.lampPurple, { cast: false });
    CINE_ROWS.forEach((row, ri) => {
      if (row.h) B.box(8.6, row.h, 1.3, bx(8.9), y + row.h / 2, z(row.lz + 0.15), M.cineCarpet);
      CINE_X.forEach((x, k) => {
        const love = ri === 3 && (k === 2 || k === 3);
        const mat = love ? M.purple : M.seatRed;
        B.box(0.82, 0.42, 0.72, x, y + row.h + 0.21, z(row.lz + 0.05), mat);
        B.box(0.82, 0.6, 0.16, x, y + row.h + 0.62, z(row.lz + 0.42), mat);
        B.box(0.1, 0.62, 0.72, x + 0.43, y + row.h + 0.31, z(row.lz + 0.05), M.black);
      });
      B.box(8.0, 0.03, 0.05, bx(8.9), y + row.h + 0.02, z(row.lz + 0.62), M.lampWarm, { cast: false });
    });
    B.box(0.5, 0.35, 0.6, bx(8.5), y + 2.8, z(-0.3), M.dark);
    B.box(0.12, 2.6, 0.12, bx(8.5), y + 1.3, z(-0.3), M.steel);
    B.box(1.4, 1.0, 0.6, bx(3.2), y + 0.5, z(-1.0), M.slatdark, { top: M.marble });   // popcorn
    B.box(0.5, 0.6, 0.5, bx(3.0), y + 1.3, z(-1.0), M.glass);
    B.box(0.4, 0.3, 0.4, bx(3.0), y + 1.15, z(-1.0), M.flower2);
    L(bx(8.5), y + 2.5, z(-4), PURP, 5, 0.6);
    // papan nama ZATAA di atap ruang boss (tanda gedung dari jauh)
    B.box(8.6, 1.9, 0.25, 9, y + 4.6, z(-8.1), M.black);
    for (const px of [6, 12]) B.box(0.14, 1.4, 0.14, px, y + 3.6, z(-8.1), M.steel);
    label(B, 6.4, 1.7, 10.0, y + 4.6, z(-7.96), M.black, 'ZATAA', M.signWhite, 3);
    B.vquad(1.7, 1.7, 5.8, y + 4.6, z(-7.96), M.black, 0, { tex: logoTex(logo, 1.7, 1.7) });
    B.box(8.6, 0.08, 0.06, 9, y + 3.67, z(-7.96), M.lampPurple, { cast: false });
    L(9, y + 4.6, z(-7), PURP, 4, 0.9);
  }

  // ================================================================ HALAMAN DEPAN: taman + gazebo, kolam
  {
    const zf = FRONT[0];
    // jalan utama dari gerbang ke cafe
    B.floor(-0.4, 2.0, zf, 31, M.stone, 0.012);
    B.floor(-32, -0.4, zf, zf + 1.4, M.stone, 0.01);
    // taman kiri: gazebo besar, bangku, pohon, bedeng bunga
    B.floor(-21, -13, GAZEBO.z - 4, GAZEBO.z + 4, M.stone, 0.01);
    B.floor(-13, -0.4, GAZEBO.z - 0.7, GAZEBO.z + 0.7, M.stone, 0.011);
    gazebo(B, GAZEBO.x, 0, GAZEBO.z, GAZEBO.s, true);
    for (const [bx, bz] of BENCHES) {
      B.box(1.9, 0.08, 0.5, bx, 0.45, bz, M.deck);
      B.box(1.9, 0.45, 0.07, bx, 0.75, bz + 0.3, M.deck, { rx: -0.08 });
      for (const dx of [-0.8, 0.8]) B.box(0.08, 0.45, 0.45, bx + dx, 0.22, bz + 0.05, M.steel);
    }
    for (const [tx, tz] of [[-30, 7], [-29, 17], [-24, 27], [-7, 26.5], [-30.5, 12], [-8.5, 7.5], [-23.5, 6.2], [-11, 19]]) tree(B, tx, tz, 4.0 + hash2(tx * 10, tz * 10) * 1.8, hash2(tx, tz) < 0.4);
    for (const [px, pz] of [[-27, 5.6], [-6, 5.6], [-27, 21], [-6, 21]]) {
      B.box(3.4, 0.3, 1.1, px, 0.15, pz, M.soil);
      for (let k = 0; k < 5; k++) B.ell(px - 1.3 + k * 0.65, 0.42, pz, 0.32, 0.25, 0.4, k % 2 ? M.flower : M.flower2, { leafy: true });
    }
    for (const tx of [-2.2, 4.0]) for (const tz of [8, 14, 20, 26]) palm(B, tx, tz, 3.2 + hash2(tx * 7, tz * 3) * 0.8);
    // kolam kanan: dek kayu, kolam, kursi berjemur, payung
    for (const [x0, x1, z0, z1] of [[4.2, 32, zf, POOL.z0 - 0.3], [4.2, 32, POOL.z1 + 0.3, 24], [4.2, POOL.x0 - 0.3, POOL.z0 - 0.3, POOL.z1 + 0.3], [POOL.x1 + 0.3, 32, POOL.z0 - 0.3, POOL.z1 + 0.3]]) B.floor(x0, x1, z0, z1, M.deck, 0.014);
    B.box(POOL.x1 - POOL.x0, 0.1, POOL.z1 - POOL.z0, (POOL.x0 + POOL.x1) / 2, -1.45, (POOL.z0 + POOL.z1) / 2, M.mosaic);
    B.box(POOL.x1 - POOL.x0, 1.45, 0.1, (POOL.x0 + POOL.x1) / 2, -0.72, POOL.z0, M.mosaic);
    B.box(0.1, 1.45, POOL.z1 - POOL.z0, POOL.x1, -0.72, (POOL.z0 + POOL.z1) / 2, M.mosaic);
    B.poly([[POOL.x0, POOL.y, POOL.z1], [POOL.x1, POOL.y, POOL.z1], [POOL.x1, POOL.y, POOL.z0], [POOL.x0, POOL.y, POOL.z0]], M.water, { two: true, cast: false });
    B.box(POOL.x1 - POOL.x0 + 0.5, 0.08, 0.34, (POOL.x0 + POOL.x1) / 2, 0.04, POOL.z0 - 0.15, M.poolEdge);
    B.box(POOL.x1 - POOL.x0 + 0.5, 0.08, 0.34, (POOL.x0 + POOL.x1) / 2, 0.04, POOL.z1 + 0.15, M.poolEdge);
    B.box(0.34, 0.08, POOL.z1 - POOL.z0 + 0.6, POOL.x0 - 0.15, 0.04, (POOL.z0 + POOL.z1) / 2, M.poolEdge);
    B.box(0.34, 0.08, POOL.z1 - POOL.z0 + 0.6, POOL.x1 + 0.15, 0.04, (POOL.z0 + POOL.z1) / 2, M.poolEdge);
    for (const pz of [11.6, 12.4]) B.box(0.07, 1.0, 0.07, POOL.x0 + 0.15, 0.35, pz, M.chrome);
    for (let sz = POOL.z0 + 0.8; sz < POOL.z1; sz += 1.6) L(POOL.x1 - 0.4, -0.3, sz, CYAN, 3.2, 0.8);
    L((POOL.x0 + POOL.x1) / 2, 0.5, (POOL.z0 + POOL.z1) / 2, CYAN, 9, 1.1);
    for (const lx of LOUNGER_X) {
      B.box(0.74, 0.08, 2.0, lx, 0.33, 19.0, M.lightwood);
      B.box(0.66, 0.09, 1.15, lx, 0.42, 18.6, M.cushion);
      B.box(0.66, 0.09, 0.78, lx, 0.64, 19.85, M.cushion, { rx: 0.75 });
      for (const dz of [18.2, 19.8]) B.box(0.7, 0.3, 0.05, lx, 0.15, dz, M.steel);
    }
    for (const [ux, uz] of [[12.7, 20.6], [18.1, 20.6], [24.5, 19.4]]) { B.box(0.07, 2.5, 0.07, ux, 1.25, uz, M.steel); B.cone(ux, 2.2, uz, 1.5, 0.5, M.umbrella); }
    B.box(2.4, 0.9, 1.2, 28.6, 0.45, 19.5, M.slatdark, { top: M.marble });   // bar kolam
    for (const x of [27.8, 28.6, 29.4]) stool(B, x, 0, 20.5);
    B.box(28, 1.0, 0.04, 18.1, 0.5, 24.0, M.glassRail);
    B.box(0.04, 1.0, 20, 32.0, 0.5, 14.0, M.glassRail);
    for (let px = 4.2; px <= 32; px += 2.8) B.box(0.07, 1.0, 0.07, px, 0.5, 24.0, M.steel);
    // lampu taman (bollard)
    for (const [bx, bz] of [[-1, 8], [-1, 14], [-1, 20], [-1, 26], [2.6, 8], [2.6, 14], [2.6, 20], [2.6, 26], [-13, 12], [-21, 17], [5, 6], [31, 6], [31, 22], [5, 22]]) {
      B.box(0.16, 0.7, 0.16, bx, 0.35, bz, M.dark);
      B.box(0.15, 0.1, 0.15, bx, 0.74, bz, M.lampWarm, { cast: false });
      L(bx, 0.9, bz, WARM, 3.2, 0.9);
    }
    // gerbang + papan nama di ujung jalan
    for (const gx of [-1.6, 3.2]) B.box(0.7, 2.6, 0.7, gx, 1.3, 30.5, M.dark);
    B.box(5.5, 0.6, 0.6, 0.8, 2.9, 30.5, M.dark);
    label(B, 4.6, 0.5, 0.8, 2.9, 30.82, M.dark, 'ZATAA OFFICE', M.signViolet, 1);
    L(0.8, 2.4, 31.2, PURP, 3.5, 1.0);
    // sign besar ZATAA OFFICE di taman depan (huruf menyala + logo di atas alas batu)
    {
      const sx0 = -15.5, sz = 27.2;
      B.box(10.4, 0.6, 1.4, sx0, 0.3, sz, M.ledge, { top: M.stone });
      B.box(9.8, 1.9, 0.35, sx0, 1.55, sz, M.black);
      label(B, 7.6, 1.5, sx0 + 1.0, 1.55, sz + 0.19, M.black, 'ZATAA OFFICE', M.signWhite, 2);
      B.vquad(1.5, 1.5, sx0 - 3.9, 1.55, sz + 0.19, M.black, 0, { tex: logoTex(logo, 1.5, 1.5) });
      B.box(9.8, 0.06, 0.06, sx0, 0.62, sz + 0.2, M.lampPurple, { cast: false });
      for (let k = 0; k < 6; k++) B.ell(sx0 - 4.6 + k * 1.84, 0.75, sz + 0.95, 0.38, 0.3, 0.32, k % 2 ? M.flower : M.flower2, { leafy: true });
      L(sx0, 1.6, sz + 1.6, PURP, 4.5, 1.0);
    }
    // pagar & tanaman pagar depan
    const hedge = (x1, z1, x2, z2, h = 0.9) => {
      const len = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.round(len / 0.7));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        B.ell(x1 + (x2 - x1) * t, h * 0.5, z1 + (z2 - z1) * t, 0.48, h * 0.55, 0.48, k % 2 ? M.hedge : M.foliage, { leafy: true });
      }
    };
    hedge(-32, 30.6, -2.6, 30.6); hedge(4.2, 30.6, 32, 30.6);
    hedge(-32.6, 5, -32.6, 30); hedge(33, 5, 33, 30);
  }

  return { prims: B.prims, lights };

  // gazebo: lantai kayu, 4 tiang, atap 3 susun; besar = meja + 2 bangku
  function gazebo(B, cx, y, cz, s, big = false) {
    const h = s / 2;
    B.box(s + 0.6, 0.3, s + 0.6, cx, y + 0.15, cz, M.deck);
    for (const [dx, dz] of [[-h, -h], [h, -h], [-h, h], [h, h]]) B.box(0.22, 2.6, 0.22, cx + dx, y + 1.6, cz + dz, M.walnut);
    B.box(s + 1.6, 0.25, s + 1.6, cx, y + 3.0, cz, M.slatdark);
    B.box(s + 0.6, 0.35, s + 0.6, cx, y + 3.3, cz, M.slatdark);
    B.cone(cx, y + 3.45, cz, (s + 1.4) * 0.62, 1.2, M.slatdark, 4, null);
    B.box(0.35, 0.35, 0.35, cx, y + 4.6, cz, M.brass);
    if (big) {
      B.box(2.0, 0.07, 1.2, cx, y + 1.05, cz, M.walnut);
      B.box(0.15, 0.72, 0.15, cx, y + 0.66, cz, M.dark);
      for (const dz of [-1.25, 1.25]) { B.box(2.6, 0.08, 0.45, cx, y + 0.75, cz + dz, M.walnut); for (const dx of [-1.1, 1.1]) B.box(0.08, 0.45, 0.4, cx + dx, y + 0.52, cz + dz, M.dark); }
      for (const [dx, dz] of [[-h, -h], [h, -h], [-h, h], [h, h]]) { B.ell(cx + dx, y + 2.8, cz + dz, 0.12, 0.12, 0.12, M.bulb, { cast: false }); }
      L(cx, y + 2.6, cz, WARM, 4.5, 1.0);
    } else {
      B.box(1.2, 0.07, 0.8, cx, y + 1.05, cz, M.walnut);
      B.box(0.12, 0.72, 0.12, cx, y + 0.66, cz, M.dark);
      for (const dz of [-0.7, 0.7]) B.box(1.6, 0.08, 0.4, cx, y + 0.75, cz + dz, M.walnut);
    }
  }
}

// posisi shaf (dipakai builder untuk sajadah)
function makeSpotsMushola() {
  return {
    imam: { x: MIHRAB_X, z: RZ(1, -6.3) },
    men: [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5, -6].map((k) => ({ x: MIHRAB_X + k * 0.8, z: RZ(1, -5.0) })),
    women: [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5, -6, 6].map((k) => ({ x: MIHRAB_X + k * 0.8, z: RZ(1, -2.5) })),
  };
}
