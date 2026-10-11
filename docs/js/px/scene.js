// Gedung Zataa Office versi pixel art. Tata letak = porting langsung dari blender/make_office.py
// (koordinat sama dengan nav.js), dengan potongan "dollhouse": dinding depan rendah supaya interior terlihat.
import { material, T, UP, K, PXH, hash2, hash3, vnoise } from './engine.js';
import { textBitmap } from './font.js';

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
mk('blanket', '#5b6bb5', { base: 0.5 });
mk('blanket2', '#c0668a', { base: 0.5 });
mk('rug', '#2e2752', { tex: (u, v) => (fr(Math.hypot(u + 4.6, (v + 2.6) * 1.4) / 0.6) < 0.12 ? 0.14 : 0), base: 0.48 });
mk('rugBoss', '#5a2f2a', { tex: (u, v) => (fr(u / 0.5) < 0.1 || fr(v / 0.5) < 0.1 ? 0.12 : 0), base: 0.46 });
mk('tread', '#9a6b45', { tex: hslats(0.5, 0.1), base: 0.54 });
mk('leather', '#24212c', { base: 0.47 });
mk('musCarpet', '#2f7a57', { tex: (u, v) => (fr(v / 0.85) < 0.08 ? 0.16 : (vnoise(u * 3, v * 3) - 0.5) * 0.08), base: 0.47 });
mk('meetCarpet', '#3b3656', { tex: noise(5, 0.07), base: 0.47 });
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
mk('umbrella', '#f4f0e6', { tex: (u, v, a, b, x, y, z) => (fr(Math.atan2(z - 15.6, x - (x > 12.6 ? 15 : 10.2)) / 0.785) < 0.5 ? 0 : NaN), base: 0.56 });
mk('umbrella2', '#7c3aed', { base: 0.5 });
mk('fence', '#2c2724', { tex: (u) => (fr(u / 0.3) < 0.42 ? NaN : 0), base: 0.47 });
mk('carPaint', '#1d1d26', { base: 0.47 });
mk('carGlass', '#384a66', { base: 0.5 });
mk('fridge', '#d9dde3', { base: 0.54 });
mk('bottle1', '#7a2f2f'); mk('bottle2', '#2f6b4a'); mk('bottle3', '#c79a3a'); mk('bottle4', '#3a4a8a');
mk('book1', '#7c3aed'); mk('book2', '#c2410c'); mk('book3', '#0e7490'); mk('book4', '#e7e2d6');
mk('cake', '#e9b7c8');
mk('copper', '#b8733e', { base: 0.52 });
mk('brass', '#c9a24a', { base: 0.54 });
mk('green', '#1f6b45', { base: 0.48 });
mk('whiteboard', '#f4f4f0', { base: 0.6 });
mk('art1', '#7c3aed'); mk('art2', '#f59e0b'); mk('art3', '#14b8a6');
mk('rack', '#1d1b24', { tex: hslats(0.22, 0.2), base: 0.46 });
mk('pink', '#f472b6', { base: 0.55 });
mk('sajadah', '#9b2d3a', { tex: (u, v, a, b) => (a < 0.1 || a > 0.9 || b < 0.06 || b > 0.94 ? 0.18 : b > 0.7 && b < 0.8 && a > 0.3 && a < 0.7 ? 0.2 : 0), base: 0.47 });
mk('sajadah2', '#235a8a', { tex: (u, v, a, b) => (a < 0.1 || a > 0.9 || b < 0.06 || b > 0.94 ? 0.18 : b > 0.7 && b < 0.8 && a > 0.3 && a < 0.7 ? 0.2 : 0), base: 0.47 });
mk('mihrab', '#1f5f45', { base: 0.47 });
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
em('candle', '#ffb347', 0.7, 0.7);
mk('cityView', '#8fb6e0', { flat: true, base: 0.55 });
mk('cityDark', '#262a40', { flat: true, base: 0.5 });
em('cityWin', '#ffd38a', 0.6, 0.6);
const rgb = ['#7c3aed', '#0891b2', '#db2777', '#65a30d', '#d97706', '#2563eb', '#e11d48', '#0d9488', '#ea580c', '#9333ea'];
rgb.forEach((c, i) => { em(`rgb${i}`, c, 0.6, 0.9); mk(`acc${i}`, c, { base: 0.5 }); });
// ruang kerja 2 baris × 5 meja; bangku taman 4
export const DESK_X = [7.4, 10.1, 12.8, 15.5, 18.2];
export const DESKS = DESK_X.length * 2;
const BENCH_X = [-6.5, -3.2, 0, 3.2];
const CAFE_TABLES = [[-17.5, -3.5], [-13.5, -3.5], [-17.5, 0], [-13.5, 0], [-10.3, -3.5], [-10.3, 0]];
const MEET_X = [-4.05, -2.55, -1.05, 0.45];
// mess dibagi 3 kamar (dari utara): cowok (2 kasur tingkat), cewek (3 kasur tingkat), kamar Zamiir & Aprista (kasur double).
// Koridor di sisi timur (x -21.4 … -20.3), pintu tiap kamar ke koridor.
export const MESS = {
  corridorX: -20.85, wallX: -21.4,
  cowok: { z0: -14, z1: -11.2, door: -11.55, bunkX: [-25.1, -24.1], bunkZ: -12.95 },
  cewek: { z0: -11.2, z1: -8.6, door: -8.85, bunkX: [-25.1, -24.1, -23.1], bunkZ: -10.1 },
  pasangan: { z0: -8.6, z1: -6.0, door: -7.0, bed: [-24.55, -7.35] },
};
const WUDHU_Z = [-13.3, -12.5, -11.7, -10.9, -10.1];
// kapasitas tiap tempat (dipakai schedule.js supaya nggak ada yang duduk numpuk)
export const CAP = { cafe: CAFE_TABLES.length * 2, counter: 8, lounge: 9, garden: 8, lounger: 7, meeting: MEET_X.length * 2 + 2, bed: 12 };
// permukaan dinamis (digambar ulang tiap frame oleh pixoffice.js)
const dynM = (name, color) => mk(name, color, { emissive: true, dyn: name });
dynM('water', '#2fb3d6');
for (let i = 0; i < DESKS; i++) dynM(`scr${i}`, '#0b0a14');
dynM('tvLounge', '#120a26');
dynM('tvMeet', '#120a26');
dynM('tvBoss', '#120a26');
dynM('racks', '#0b0a14');
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
  constructor() { this.prims = []; this.layer = 'G'; }
  push(p) { p.layer = this.layer; this.prims.push(p); return p; }
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
      // pastikan normal menghadap keluar
      const e1 = P[1].map((q, j) => q - P[0][j]), e2 = P[2].map((q, j) => q - P[1][j]);
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const fc = [0, 1, 2].map((j) => (P[0][j] + P[2][j]) / 2 - [x, y, z][j]);
      if (n[0] * fc[0] + n[1] * fc[1] + n[2] * fc[2] < 0) P = P.reverse();
      this.poly(P, m, { cast: o.cast, face: k });
    }
  }
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
  ell(x, y, z, rx, ry, rz, mat, o = {}) { return this.push({ kind: 'ell', c: [x, y, z], r: [rx, ry, rz], mat, ...o }); }
  // kerucut terbalik (payung)
  cone(x, y, z, r, h, mat, seg = 8) {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      this.poly([[x, y + h, z], [x + Math.cos(a1) * r, y, z + Math.sin(a1) * r], [x + Math.cos(a0) * r, y, z + Math.sin(a0) * r]], i % 2 ? M.umbrella2 : mat, { two: true });
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
  for (let i = 0; i < Math.max(2, Math.round(w * 2)); i++) {
    const px = x - w / 2 + 0.3 + (i * (w - 0.6)) / Math.max(1, Math.round(w * 2) - 1);
    B.ell(px, y + 0.72, z, 0.3, 0.28, 0.26, i % 2 ? M.foliage : M.foliageLight, { leafy: true });
  }
}
function tree(B, x, z, h, dark = false) {
  B.box(0.3, h * 0.55, 0.3, x, h * 0.27, z, M.trunk);
  const f = dark ? M.foliageDark : M.foliage;
  B.ell(x, h * 0.66, z, h * 0.3, h * 0.26, h * 0.3, f, { leafy: true });
  B.ell(x - h * 0.12, h * 0.8, z + h * 0.06, h * 0.2, h * 0.18, h * 0.2, dark ? M.foliage : M.foliageLight, { leafy: true });
}
function palm(B, x, z, h) {
  for (let k = 0; k < 5; k++) B.box(0.22, h / 5 + 0.02, 0.22, x + k * 0.06, (k + 0.5) * (h / 5), z, M.palmTrunk);
  const tx = x + 0.3, ty = h + 0.1;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    B.ell(tx + Math.cos(a) * 0.9, ty - 0.2, z + Math.sin(a) * 0.9, 0.95, 0.16, 0.95, i % 2 ? M.palm : M.foliageLight, { leafy: true, r2: true });
  }
  B.ell(tx, ty, z, 0.45, 0.3, 0.45, M.palm, { leafy: true });
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
function gamingChair(B, x, z, ry, i) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const loc = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  let [px, pz] = loc(0, 0.02);
  B.box(0.56, 0.12, 0.52, px, 0.47, pz, M.leather, { ry });
  [px, pz] = loc(0, -0.26);
  B.box(0.54, 0.84, 0.1, px, 0.96, pz, M.leather, { ry, rx: 0.12 });
  [px, pz] = loc(0, -0.27);
  B.box(0.18, 0.62, 0.11, px, 0.98, pz, M[`acc${i}`], { ry, rx: 0.12 });
  B.box(0.08, 0.38, 0.08, x, 0.25, z, M.chrome);
  B.box(0.6, 0.05, 0.6, x, 0.05, z, M.steel, { ry: 0.4 });
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

// ---------------------------------------------------------------- tempat duduk/berdiri (dipakai nav.js)
export function makeSpots() {
  const S = {};
  S.cafe = [];
  CAFE_TABLES.forEach(([x, z]) => [-1, 1].forEach((side) => {
    S.cafe.push({ x: x + side * 0.8, z, rot: side < 0 ? Math.PI / 2 : -Math.PI / 2, lane: z + 0.95 });
  }));
  S.counter = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => ({ x: -18.6 + k * 0.78, z: -6.5, rot: Math.PI }));
  S.lounge = [
    { x: -6.1, z: -1.4, rot: Math.PI, pose: 'phone' }, { x: -5.1, z: -1.4, rot: Math.PI, pose: 'phone' },
    { x: -4.1, z: -1.4, rot: Math.PI, pose: 'phone' }, { x: -3.1, z: -1.4, rot: Math.PI, pose: 'phone' },
    { x: -1.75, z: -3.55, rot: -Math.PI / 2, pose: 'beanbag' }, { x: -7.75, z: -3.55, rot: Math.PI / 2, pose: 'beanbag' },
    { x: -1.6, z: -2.1, rot: -Math.PI / 2, pose: 'beanbag' },
    { x: 0.1, z: -3.5, rot: -Math.PI / 2, pose: 'beanbag' }, { x: 0.35, z: -1.75, rot: -Math.PI / 2, pose: 'beanbag' },
  ];
  S.desk = [];
  [[-4.2, 'A'], [-0.8, 'B']].forEach(([z, row]) => DESK_X.forEach((x) => S.desk.push({ x, z: z + 0.7, rot: Math.PI, row })));
  // musholla: kiblat ke dinding belakang (mihrab), imam di depan, shaf laki-laki lalu perempuan
  S.musholla = {
    imam: { x: -14.5, z: -12.7 },
    men: [-15.1, -13.9, -16.3, -12.7].map((x) => ({ x, z: -11.6 })),
    women: [-16.3, -15.1, -13.9, -12.7, -11.5, -17.5, -10.3].map((x) => ({ x, z: -10.4 })),
  };
  S.meeting = [];
  MEET_X.forEach((x) => S.meeting.push({ x, z: -12.8, rot: 0, side: 'N' }, { x, z: -10.4, rot: Math.PI, side: 'S' }));
  S.meeting.push({ x: 1.9, z: -11.6, rot: -Math.PI / 2, side: 'E' }, { x: -5.2, z: -11.6, rot: Math.PI / 2, side: 'W' });
  S.garden = [];
  BENCH_X.forEach((x) => S.garden.push({ x: x - 0.45, z: 7.7, rot: Math.PI }, { x: x + 0.45, z: 7.7, rot: Math.PI }));
  S.pool = [5.9, 7.1, 8.3, 9.6, 10.9].map((z) => ({ x: 13, z, half: 4.6, y: -0.15 }));
  S.lounger = [9, 11.4, 13.8, 16.2, 18.4, 6.6, 20.6].map((x) => ({ x, z: 14.45, rot: Math.PI }));
  // sayap barat: kamar mandi (bawah), mess (bawah), tempat wudhu (atas)
  S.toilet = [-5.1, -3.6, -2.1].map((z) => ({ x: -24.5, z, rot: -Math.PI / 2 }));
  S.sink = [-5.0, -3.8].map((z) => ({ x: -21.1, z, rot: Math.PI / 2 }));
  S.bed = [];
  // y = permukaan kasur dikurangi tinggi bantalan sprite tiduran (sama seperti kursi berjemur)
  // room: pintu kamar di dinding koridor (z) + titik lorong dalam kamar
  for (const k of ['cowok', 'cewek']) {
    const R = MESS[k];
    R.bunkX.forEach((x) => [0.08, 1.05].forEach((y) => S.bed.push({ x, y, z: R.bunkZ, rot: 0, room: k, door: R.door, aisle: [x, R.door] })));
  }
  while (S.bed.length < 10) S.bed.push({ ...S.bed[S.bed.length - 1] });  // cadangan
  const [bx, bz] = MESS.pasangan.bed;
  for (const dz of [-0.4, 0.4]) S.bed.push({ x: bx, y: 0.13, z: bz + dz, rot: -Math.PI / 2, room: 'pasangan', door: MESS.pasangan.door, aisle: [-22.9, MESS.pasangan.door] });
  S.wudhu = WUDHU_Z.map((z) => ({ x: -24.7, z, rot: -Math.PI / 2 }));
  return S;
}

// label ruangan (posisi dunia) — ditampilkan sebagai HTML di atas canvas
export const ROOMS = [
  { name: 'Tempat Ibadah', icon: '🕌', p: [-14.5, 8.3, -14.2] },
  { name: 'Tempat Wudhu', icon: '💧', p: [-23, 8.3, -14.2] },
  { name: 'Kamar Mandi', icon: '🚿', p: [-23, 1.3, 2.3] },
  { name: 'Mess', icon: '🛏️', p: [-23, 2.9, -5.9] },
  { name: 'Ruang Meeting', icon: '🗣️', p: [-1.8, 8.3, -14.2] },
  { name: 'Ruang Boss', icon: '👔', p: [18.9, 7.9, -14.2] },
  { name: 'Cafe', icon: '☕', p: [-15.5, 1.3, 2.3] },
  { name: 'Ruang Santai', icon: '🛋️', p: [-6.2, 1.3, 2.3] },
  { name: 'Ruang Kerja', icon: '💻', p: [14.5, 1.3, 2.3] },
  { name: 'Kolam Renang', icon: '🏊', p: [16.5, 0.6, 12.6] },
  { name: 'Teras & Taman', icon: '🌿', p: [-5, 0.9, 9.6] },
]

// ---------------------------------------------------------------- bangun seluruh kompleks
export function buildScene(logo, { upper = true } = {}) {
  const B = new Builder();
  const lights = [];
  const L = (x, y, z, color, r, i = 1, layer = 'G') => lights.push({ p: [x, y, z], color, r, i, layer });
  const WARM = [1.0, 0.72, 0.42], COOL = [0.8, 0.85, 1.0], PURP = [0.7, 0.45, 1.0], CYAN = [0.3, 0.85, 1.0];

  // ---------- tanah, hutan sekitar
  const hole = [7, 19, 5, 12];
  const G0 = [-60, 60, -60, 45];
  B.floor(G0[0], G0[1], G0[2], hole[2], M.grass, -0.03);
  B.floor(G0[0], G0[1], hole[3], G0[3], M.grass, -0.03);
  B.floor(G0[0], hole[0], hole[2], hole[3], M.grass, -0.03);
  B.floor(hole[1], G0[1], hole[2], hole[3], M.grass, -0.03);
  const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  for (let i = 0; i < 260; i++) {
    const x = -46 + rnd() * 92, z = -40 + rnd() * 66;
    if (x > -28.5 && x < 23.5 && z > -18.5 && z < 20.5) continue;
    const h = 4 + rnd() * 4.5;
    tree(B, x, z, h, rnd() < 0.55);
  }

  // ---------- lantai & dinding luar
  B.floor(-20, -9, -14, 2, M.walnut, 0.004);
  B.floor(-9, 5, -14, 2, M.oak, 0.004);
  B.floor(5, 20, -14, 2, M.workwood, 0.004);
  B.box(40.3, 0.3, 16.3, 0, -0.17, -6, M.slab);
  B.box(40.6, 7.8, 0.3, 0, 3.9, -14.15, M.ledge, { top: M.dark });
  B.box(40, 3.3, 0.05, 0, 1.65, -13.98, M.slatdark);
  // lantai bawah sisi barat = sekat kaca rendah (biar mess & kamar mandi di sayap barat kelihatan dari kamera)
  for (const [z0, z1] of [[-14.3, -2.3], [-1.2, 2.0]]) {
    const d = z1 - z0, zc = (z0 + z1) / 2;
    B.box(0.3, 0.8, d, -20.15, 0.4, zc, M.ledge, { top: M.dark });
    B.box(0.03, 1.5, d, -20.15, 1.55, zc, M.glass);
    B.box(0.08, 0.07, d, -20.15, 2.32, zc, M.steel);
  }
  if (upper) {
    B.box(0.3, 7.8 - UP, 4.4, -20.15, UP + (7.8 - UP) / 2, -12.1, M.ledge, { top: M.dark }); // atas, sebelah utara pintu wudhu
    B.box(0.3, 7.8 - UP, 2.8, -20.15, UP + (7.8 - UP) / 2, -7.4, M.ledge, { top: M.dark });
    B.box(0.3, 7.8 - UP - 2.3, 1.1, -20.15, UP + 2.3 + (7.8 - UP - 2.3) / 2, -9.35, M.ledge); // ambang pintu wudhu
  }

  B.box(0.3, 4.2, 16.6, 20.15, 2.1, -6, M.ledgeDark, { top: M.dark });
  // atap: balok kayu di atas dinding (seperti referensi)
  B.box(40.9, 0.28, 0.7, 0, 7.94, -14.1, M.slatdark);
  B.box(0.7, 0.28, 8.6, -20.1, 7.94, -10.1, M.slatdark);
  B.box(0.7, 0.24, 8.3, -20.1, UP + 0.42, -1.85, M.slatdark);
  B.box(0.7, 0.28, 16.9, 20.1, 4.34, -6, M.slatdark);
  for (let gx = -19.5; gx < 20; gx += 1.5) B.box(0.14, 0.18, 0.9, gx, 7.86, -13.5, M.slatdark);
  // papan nama ZATAA di atas atap
  B.box(8.6, 1.9, 0.25, 12.6, 9.05, -14.2, M.black);
  for (const px of [9.6, 15.6]) B.box(0.14, 1.0, 0.14, px, 8.1, -14.2, M.steel);
  B.vquad(6.4, 1.7, 13.6, 9.05, -14.06, M.black, 0, { tex: sign(6.4, 1.7, 'ZATAA', M.signWhite, 3) });
  B.vquad(1.7, 1.7, 9.4, 9.05, -14.06, M.black, 0, { tex: logoTex(logo, 1.7, 1.7) });
  B.box(8.6, 0.08, 0.06, 12.6, 8.12, -14.06, M.lampPurple, { cast: false });

  // fasad depan dipotong rendah (kaca + rangka) dengan bukaan pintu
  for (const [a, b] of [[-20, -13], [-11, -4], [-1, 8], [10, 20]]) {
    const w = b - a, cx = (a + b) / 2;
    B.box(w, 0.9, 0.05, cx, 0.45, 2, M.glass);
    B.box(w, 0.07, 0.12, cx, 0.92, 2, M.steel);
    B.box(w, 0.08, 0.14, cx, 0.04, 2, M.steel);
    for (let k = 0; k <= Math.max(1, Math.round(w / 2)); k++) B.box(0.09, 0.9, 0.1, a + (w * k) / Math.max(1, Math.round(w / 2)), 0.45, 2, M.steel);
  }
  // keset di pintu
  for (const cx of [-12, -2.5, 9]) B.floor(cx - 0.7, cx + 0.7, 2.15, 2.75, M.rug, 0.012);

  // =========================================================== SAYAP BARAT (kamar mandi + mess, atasnya tempat wudhu)
  {
    const X0 = -25.75, X1 = -20.3, XC = (X0 + X1) / 2, W = X1 - X0;
    B.box(W + 0.3, 0.3, 16.3, XC, -0.17, -6, M.slab);
    B.floor(X0, X1, -6, 1.85, M.tile, 0.004); // kamar mandi
    B.floor(X0, X1, -14, -6, M.oak, 0.004); // mess
    B.box(0.3, 7.8, 8.3, X0, 3.9, -10.15, M.ledge, { top: M.dark });
    B.box(0.3, UP + 0.3, 8.0, X0, (UP + 0.3) / 2, -2.0, M.ledge, { top: M.dark });
    B.box(W + 0.3, 7.8, 0.3, XC, 3.9, -14.15, M.ledge, { top: M.dark });
    B.box(0.7, 0.28, 8.6, X0, 7.94, -10.1, M.slatdark);
    B.box(W, 0.28, 0.7, XC, 7.94, -14.1, M.slatdark);
    // fasad depan rendah (kaca) seperti gedung utama
    B.box(W, 0.9, 0.05, XC, 0.45, 2, M.glass);
    B.box(W, 0.07, 0.12, XC, 0.92, 2, M.steel);
    // sekat mess | kamar mandi (rendah + kaca, ada pintu)
    for (const [a, b] of [[X0, -21.4]]) {
      const w = b - a, cx = (a + b) / 2;
      B.box(w, 0.8, 0.12, cx, 0.4, -6, M.slat);
      B.box(w, 1.4, 0.03, cx, 1.5, -6, M.glass);
      B.box(w, 0.07, 0.08, cx, 2.22, -6, M.steel);
    }
    // --- kamar mandi: 3 bilik di barat, wastafel + cermin di timur
    for (const z of [-5.85, -4.35, -2.85, -1.35]) B.box(1.7, 1.4, 0.08, -24.75, 0.7, z, M.white);
    for (const z of [-5.1, -3.6, -2.1]) {
      B.box(0.45, 0.42, 0.55, -25.3, 0.21, z, M.white); // kloset
      B.box(0.2, 0.5, 0.5, -25.55, 0.55, z, M.whiteD ?? M.white);
      B.box(0.06, 1.3, 0.05, -23.9, 0.65, z - 0.65, M.chrome);
    }
    B.box(0.55, 0.85, 2.4, -20.65, 0.42, -4.4, M.marble);
    for (const z of [-5.0, -3.8]) { B.box(0.38, 0.06, 0.42, -20.7, 0.87, z, M.white); B.box(0.06, 0.2, 0.06, -20.5, 1.0, z, M.chrome); }
    B.vquad(2.2, 1.0, -20.5, 1.75, -4.4, M.glass, Math.PI / 2);
    B.box(0.5, 0.05, 1.6, -21.3, 0.01, -0.4, M.rug); // keset
    pottedPlant(B, -21.0, 1.2, 1.1);
    L(-23, 2.6, -3.5, COOL, 4.0, 0.9);
    // --- mess: 3 kamar (cowok | cewek | Zamiir & Aprista) + koridor timur
    const sekat = (x0, x1, z0, z1, gaps = []) => {   // sekat rendah + kaca, dengan bukaan pintu
      const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
      const a0 = alongX ? x0 : z0, a1 = alongX ? x1 : z1;
      const segs = []; let cur = a0;
      for (const [g0, g1] of gaps) { segs.push([cur, g0]); cur = g1; }
      segs.push([cur, a1]);
      for (const [u0, u1] of segs) {
        const len = u1 - u0, c = (u0 + u1) / 2;
        if (len < 0.05) continue;
        const [w, d, cx, cz] = alongX ? [len, 0.12, c, z0] : [0.12, len, x0, c];
        B.box(w, 0.8, d, cx, 0.4, cz, M.slat);
        B.box(alongX ? w : 0.03, 1.4, alongX ? 0.03 : d, cx, 1.5, cz, M.glass);
        B.box(alongX ? w : 0.08, 0.07, alongX ? 0.08 : d, cx, 2.22, cz, M.steel);
      }
    };
    // dinding koridor (x -21.4) dengan pintu ke tiap kamar
    sekat(MESS.wallX, MESS.wallX, -14, -6, [[MESS.cowok.door - 0.5, MESS.cowok.door + 0.5], [MESS.cewek.door - 0.5, MESS.cewek.door + 0.5], [MESS.pasangan.door - 0.5, MESS.pasangan.door + 0.5]]);
    sekat(X0, MESS.wallX, -11.2, -11.2);
    sekat(X0, MESS.wallX, -8.6, -8.6);
    const bunk = (x, z) => {
      for (const dx of [-0.42, 0.42]) for (const dz of [-0.95, 0.95]) B.box(0.07, 1.95, 0.07, x + dx, 0.97, z + dz, M.steel);
      for (const [y, mat] of [[0.3, M.blanket], [1.27, M.blanket2]]) {
        B.box(0.9, 0.12, 2.0, x, y, z, M.lightwood);
        B.box(0.82, 0.12, 1.9, x, y + 0.12, z, M.white);
        B.box(0.84, 0.05, 1.1, x, y + 0.19, z + 0.3, mat);
        B.box(0.6, 0.1, 0.35, x, y + 0.22, z - 0.75, M.white);
      }
      B.box(0.06, 1.0, 0.06, x + 0.45, 1.0, z + 0.95, M.steel); // tangga
    };
    for (const k of ['cowok', 'cewek']) for (const x of MESS[k].bunkX) bunk(x, MESS[k].bunkZ);
    // loker di tiap kamar
    for (let k = 0; k < 2; k++) B.box(0.8, 1.8, 0.45, -22.8 + k * 0.85, 0.9, -13.65, M[`acc${k + 3}`]);
    for (let k = 0; k < 2; k++) B.box(0.45, 1.8, 0.8, -21.75, 0.9, -10.6 + k * 0.85, M[`acc${k}`]);
    B.disc(-23.6, 0.012, -9.2, 1.3, 0.45, M.rug, 20);
    // kamar Zamiir & Aprista: kasur double (kepala di dinding barat), meja samping, lampu tidur
    const [bx, bz] = MESS.pasangan.bed;
    B.box(2.1, 0.3, 1.75, bx, 0.15, bz, M.walnut);
    B.box(2.0, 0.16, 1.65, bx, 0.38, bz, M.white);
    B.box(1.25, 0.06, 1.69, bx + 0.32, 0.48, bz, M.blanket2);
    for (const dz of [-0.4, 0.4]) B.box(0.38, 0.12, 0.6, bx - 0.78, 0.52, bz + dz, M.white);
    B.box(0.12, 0.95, 1.8, X0 + 0.18, 0.47, bz, M.walnut);   // sandaran kepala
    for (const dz of [-1.15, 1.15]) {
      B.box(0.45, 0.5, 0.42, bx - 0.8, 0.25, bz + dz, M.lightwood);
      B.box(0.14, 0.22, 0.14, bx - 0.8, 0.61, bz + dz, M.lampWarm, { cast: false });
    }
    B.disc(-23.2, 0.012, bz, 0.9, 1.1, M.rug, 20);
    B.box(0.5, 1.9, 1.2, -21.85, 0.95, -6.75, M.walnut);   // lemari
    L(-23, 2.4, -12.8, WARM, 3.2, 0.7);
    L(-23, 2.4, -10.1, WARM, 3.2, 0.7);
    L(-24.6, 1.1, -7.3, [1.0, 0.6, 0.5], 2.6, 0.8);
  }

  // ---------- pelat lantai atas, fasia, kolom
  if (upper) {
    B.box(40.3, 0.3, 8, 0, UP - 0.17, -10, M.slab, { top: M.slab });
    B.box(40.3, 0.5, 0.26, 0, UP - 0.2, -6.0, M.slatdarkH);
    B.box(40.3, 0.09, 0.06, 0, UP - 0.47, -5.86, M.lampWarm, { cast: false });
  }
  for (const x of [-9, 5.5, 13]) B.box(0.26, UP - 0.3, 0.26, x, (UP - 0.3) / 2, -6.2, M.steel);
  for (let x = -18; x <= 18; x += 3) for (const z of [-12, -8]) L(x, UP - 0.4, z, WARM, 4.2, 0.9);

  // ---------- CAFE
  B.box(6.6, 1.05, 0.9, -15.6, 0.52, -7.45, M.slatdark, { top: M.marble });
  B.box(6.8, 0.07, 1.05, -15.6, 1.08, -7.45, M.marble);
  B.box(0.6, 0.5, 0.5, -17.8, 1.36, -7.6, M.chrome);
  B.box(0.55, 0.42, 0.45, -16.9, 1.32, -7.6, M.purple);
  B.box(1.3, 0.1, 0.12, -15.0, 1.16, -7.35, M.white);
  B.box(0.5, 0.3, 0.4, -13.6, 1.26, -7.5, M.glass);
  B.box(0.46, 0.08, 0.36, -13.6, 1.15, -7.5, M.cake);
  B.box(7, 2.6, 0.5, -15.6, 1.3, -9.4, M.furn);
  for (let k = 0; k < 3; k++) {
    B.box(6.8, 0.06, 0.45, -15.6, 1.2 + k * 0.55, -9.1, M.furn);
    B.box(6.8, 0.06, 0.04, -15.6, 1.17 + k * 0.55, -8.87, M.lampWarm, { cast: false });
    for (let b = 0; b < 16; b++) B.box(0.13, 0.26 + (b % 3) * 0.03, 0.13, -18.8 + b * 0.42, 1.36 + k * 0.55, -9.1, M[`bottle${(b + k) % 4 + 1}`]);
  }
  for (let i = 0; i < 4; i++) {
    const px = -18.2 + i * 1.75;
    if (upper) B.box(0.06, 1.2, 0.06, px, UP - 0.9, -7.3, M.black);
    B.ell(px, UP - 1.55, -7.3, 0.18, 0.15, 0.18, M.bulb, { cast: false });
    L(px, UP - 1.7, -7.0, WARM, 3.2, 1.1);
  }
  for (const [tx, tz] of CAFE_TABLES) {
    B.cyl(0.6, 0.06, tx, 0.75, tz, M.marble, 14);
    B.box(0.1, 0.7, 0.1, tx, 0.37, tz, M.steel);
    for (const side of [-1, 1]) {
      B.cyl(0.22, 0.08, tx + side * 0.85, 0.46, tz, M.copper, 10);
      B.box(0.06, 0.42, 0.06, tx + side * 0.85, 0.21, tz, M.steel);
    }
    B.box(0.1, 0.1, 0.1, tx + 0.15, 0.82, tz - 0.1, M.white);
    B.box(0.08, 0.09, 0.08, tx - 0.2, 0.83, tz + 0.15, M.candle, { cast: false });
    L(tx, 1.6, tz, WARM, 3.0, 0.7);
  }
  B.box(0.8, 1.9, 0.75, -19.2, 0.95, -5.4, M.fridge);
  B.box(0.6, 1.4, 0.05, -19.1, 1.0, -5.0, M.lampCyan, { cast: false });
  B.box(1.2, 0.9, 0.5, -19.35, 0.45, -3.2, M.furn);
  B.box(1.0, 0.25, 0.35, -19.4, 1.05, -3.2, M.cake);
  if (upper) {
    B.box(2.6, 1.0, 0.06, -15.5, UP - 0.75, -5.83, M.black);
    B.vquad(2.5, 0.9, -15.5, UP - 0.75, -5.79, M.black, 0, { tex: sign(2.5, 0.9, 'CAFE', M.signGold, 2) });
  }
  pottedPlant(B, -19.3, 1.3, 1.5);
  pottedPlant(B, -8.6, 1.3, 1.3, 0, true);

  // ---------- RUANG SANTAI
  B.box(5.4, 2.8, 0.3, -4.6, 1.4, -5.45, M.slatdark);
  B.box(3.3, 1.9, 0.07, -4.6, 1.55, -5.27, M.black);
  B.vquad(3.1, 1.72, -4.6, 1.55, -5.23, M.tvLounge);
  B.box(5.4, 0.06, 0.06, -4.6, 0.05, -5.27, M.lampPurple, { cast: false });
  B.box(2.6, 0.4, 0.45, -4.6, 0.2, -5.0, M.furn);
  B.box(0.35, 0.08, 0.25, -4.0, 0.44, -5.0, M.white);
  B.box(0.4, 0.09, 0.2, -5.2, 0.44, -5.0, M.black);
  B.disc(-4.6, 0.014, -2.6, 2.9, 2.0, M.rug, 24);
  sofa(B, -4.65, -1.2, 4.2, M.sofa, 4);
  B.cyl(0.5, 0.06, -4.6, 0.42, -3.1, M.furn, 14);
  B.cyl(0.32, 0.38, -4.6, 0.19, -3.1, M.furn, 10);
  B.ell(-1.75, 0.3, -3.7, 0.55, 0.32, 0.55, M.beanbag);
  B.ell(-7.75, 0.3, -3.7, 0.55, 0.32, 0.55, M.beanbag2);
  B.ell(-1.45, 0.3, -2.1, 0.55, 0.32, 0.55, M.beanbag3);
  B.ell(0.4, 0.3, -3.5, 0.55, 0.32, 0.55, M.beanbag2);
  B.ell(0.65, 0.3, -1.75, 0.55, 0.32, 0.55, M.beanbag);
  pottedPlant(B, 0.9, -4.8, 1.5);
  pottedPlant(B, -8.3, -4.8, 1.2);
  B.box(1.2, 1.8, 0.4, -8.1, 0.9, -2.0, M.furn, { ry: Math.PI / 2 });
  for (let k = 0; k < 3; k++) for (let b = 0; b < 4; b++) B.box(0.22, 0.28, 0.12, -8.1, 0.4 + k * 0.5, -2.45 + b * 0.28, M[`book${(k + b) % 4 + 1}`]);
  L(-4.6, 2.6, -2.6, WARM, 4.5, 0.9);
  L(-4.6, 1.6, -4.4, PURP, 3.2, 0.8);

  // ---------- TANGGA (16 anak tangga ke lantai atas)
  const steps = 16, run = 7.4, rise = UP / steps;
  for (let i = 0; i < steps; i++) {
    const sz = 1.2 - (i + 0.5) * (run / steps), sy = (i + 1) * rise;
    B.box(3, 0.13, run / steps + 0.04, 3, sy - 0.065, sz, M.tread, { front: M.dark });
    B.box(2.9, 0.035, 0.04, 3, sy - 0.13, sz + run / steps / 2 - 0.02, M.lampWarm, { cast: false });
  }
  for (const sx of [1.45, 4.55]) {
    const P = [[sx, 0, 1.2], [sx, UP, -6.2], [sx, UP - 0.5, -6.2], [sx, 0, 0.2]];
    B.poly(P, M.dark, { two: true });
    B.poly([[sx, 0.12, 1.2], [sx, UP + 0.12, -6.2], [sx, UP + 1.12, -6.2], [sx, 1.12, 1.2]], M.glassRail, { two: true });
    B.poly([[sx - 0.05, 1.14, 1.2], [sx + 0.05, 1.14, 1.2], [sx + 0.05, UP + 1.14, -6.2], [sx - 0.05, UP + 1.14, -6.2]], M.steel, { two: true });
  }
  L(3, 2.2, -2.5, WARM, 3.5, 0.6);

  // ---------- RUANG KERJA
  B.box(0.12, 3.2, 7.5, 19.9, 1.8, -2.5, M.slatdark);
  B.box(0.06, 0.05, 7.5, 19.8, 0.25, -2.5, M.lampPurple, { cast: false });
  // dinding fitur ZATAA di belakang ruang kerja (di bawah ruang boss)
  B.box(14.3, UP - 0.3, 0.2, 12.75, (UP - 0.3) / 2, -6.45, M.slatdark);
  B.vquad(6.4, 1.1, 12.2, 1.75, -6.33, M.slatdark, 0, { tex: sign(6.4, 1.1, 'ZATAA', M.signViolet, 2) });
  B.vquad(1.3, 1.3, 7.6, 1.75, -6.33, M.slatdark, 0, { tex: logoTex(logo, 1.3, 1.3) });
  B.box(13.5, 0.05, 0.05, 12.75, 1.05, -6.32, M.lampPurple, { cast: false });
  for (const rx of [17.6, 18.8]) {
    B.box(1.0, 2.2, 0.7, rx, 1.1, -5.95, M.rack);
    B.vquad(0.8, 1.9, rx, 1.12, -5.59, M.racks);
  }
  let di = 0;
  for (const z of [-4.2, -0.8]) {
    for (const x of DESK_X) {
      B.box(1.9, 0.06, 0.85, x, 0.75, z, M.black);
      for (const sx of [-0.88, 0.88]) B.box(0.07, 0.72, 0.7, x + sx, 0.37, z, M.steel);
      B.box(1.9, 0.04, 0.04, x, 0.72, z + 0.43, M[`rgb${di}`], { cast: false });
      for (const [k, dx] of [[0, -0.43], [1, 0.43]]) {
        const ry = -dx * 0.25;
        B.box(0.86, 0.52, 0.05, x + dx, 1.2, z - 0.25, M.black, { ry });
        B.vquad(0.78, 0.44, x + dx - Math.sin(ry) * 0.0, 1.2, z - 0.22, M[`scr${di}`], ry);
      }
      B.box(0.08, 0.32, 0.08, x, 0.93, z - 0.3, M.steel);
      B.box(0.48, 0.03, 0.16, x, 0.79, z + 0.12, M.dark);
      B.box(0.1, 0.1, 0.1, x - 0.65, 0.82, z + 0.05, M[`acc${di}`]);
      B.box(0.25, 0.5, 0.5, x + 1.25, 0.25, z - 0.1, M.black);
      B.box(0.03, 0.42, 0.03, x + 1.11, 0.27, z + 0.16, M[`rgb${di}`], { cast: false });
      gamingChair(B, x, z + 0.75, Math.PI, di);
      L(x, 2.4, z + 0.3, COOL, 3.6, 0.9);
      di++;
    }
  }
  pottedPlant(B, 5.25, 1.6, 1.2);
  pottedPlant(B, 19.2, 1.2, 1.4);
  pottedPlant(B, 5.6, -5.4, 1.3);

  // =========================================================== LANTAI ATAS
  if (upper) {
    B.layer = 'U';
    B.floor(-20, 20, -8.5, -6, M.oak, UP + 0.01);
    B.floor(-20, -9, -14, -8.5, M.musCarpet, UP + 0.01);
    B.floor(-9, 5.5, -14, -8.5, M.meetCarpet, UP + 0.01);
    B.floor(5.5, 20, -14, -8.5, M.walnut, UP + 0.01);
    // pagar kaca depan (celah di atas tangga)
    for (const [x1, x2] of [[-20, 1.5], [4.5, 20]]) {
      B.box(x2 - x1, 1.0, 0.04, (x1 + x2) / 2, UP + 0.5, -6.05, M.glassRail);
      B.box(x2 - x1, 0.07, 0.1, (x1 + x2) / 2, UP + 1.03, -6.05, M.steel);
      for (let px = x1; px <= x2 + 0.01; px += 2) B.box(0.07, 1.0, 0.07, px, UP + 0.5, -6.05, M.steel);
    }
    // sekat ruangan: panel kayu rendah + kaca + rangka
    const partition = (x1, z1, x2, z2, gaps = []) => {
      const horiz = z1 === z2;
      const len = horiz ? x2 - x1 : z2 - z1;
      let segs = [[0, len]];
      for (const [a, b] of gaps) segs = segs.flatMap(([s0, s1]) => (b <= s0 || a >= s1 ? [[s0, s1]] : [[s0, a], [b, s1]].filter((p) => p[1] - p[0] > 0.01)));
      for (const [a, b] of segs) {
        const l = b - a, mid = a + l / 2;
        const [px, pz] = horiz ? [x1 + mid, z1] : [x1, z1 + mid];
        const [w, d] = horiz ? [l, 0.12] : [0.12, l];
        B.box(w, 0.7, d, px, UP + 0.35, pz, M.slat);
        B.box(horiz ? w : 0.03, 1.9, horiz ? 0.03 : d, px, UP + 1.65, pz, M.glass);
        B.box(horiz ? w : 0.08, 0.07, horiz ? 0.08 : d, px, UP + 2.62, pz, M.steel);
        const n = Math.max(1, Math.round(l / 1.5));
        for (let k = 0; k <= n; k++) {
          const q = a + (l * k) / n;
          B.box(0.07, 1.9, 0.07, horiz ? x1 + q : x1, UP + 1.65, horiz ? z1 : z1 + q, M.steel);
        }
      }
    };
    partition(-20, -8.5, -9, -8.5, [[5.4, 6.6]]);
    partition(-9, -8.5, 5.5, -8.5, [[6.9, 8.1]]);
    partition(5.5, -8.5, 20, -8.5, [[6.9, 8.1]]);
    partition(-9, -14, -9, -8.5);
    partition(5.5, -14, 5.5, -8.5);


    // ---------- TEMPAT WUDHU (sayap barat, lewat pintu di dinding barat musholla)
    B.box(5.75, 0.3, 5.9, -23.0, UP - 0.17, -11.2, M.slab, { top: M.slab });
    B.floor(-25.6, -20.3, -14, -8.5, M.tile, UP + 0.01);
    partition(-25.6, -8.5, -20.3, -8.5);
    B.box(0.5, 0.8, 4.4, -25.35, UP + 0.4, -11.7, M.marble); // bak/pancuran
    B.box(0.06, 0.06, 4.4, -25.1, UP + 0.82, -11.7, M.lampCyan, { cast: false });
    for (const z of WUDHU_Z) { B.box(0.08, 0.35, 0.08, -25.45, UP + 1.15, z, M.chrome); B.box(0.25, 0.05, 0.05, -25.32, UP + 1.3, z, M.chrome); }
    for (const z of WUDHU_Z) B.box(0.35, 0.3, 0.35, -24.5, UP + 0.15, z, M.lightwood); // dingklik
    B.box(0.06, 0.8, 2.4, -25.55, UP + 2.2, -11.7, M.black);
    B.vquad(2.3, 0.7, -25.5, UP + 2.2, -11.7, M.black, Math.PI / 2, { tex: sign(2.3, 0.7, 'WUDHU', M.signGold, 2) });
    pottedPlant(B, -20.9, -13.4, 1.1, UP, true);
    L(-23, UP + 2.4, -11.3, COOL, 4.0, 0.9, 'U');

    // ---------- TEMPAT IBADAH (mihrab di dinding belakang, menghadap kamera seperti referensi)
    B.box(11, 3.4, 0.05, -14.5, UP + 1.7, -13.97, M.slat);
    B.box(2.6, 3.0, 0.08, -14.5, UP + 1.5, -13.9, M.mihrab);
    B.ell(-14.5, UP + 3.0, -13.88, 1.3, 0.75, 0.04, M.mihrab, { cast: false });
    B.box(0.12, 3.0, 0.12, -15.85, UP + 1.5, -13.86, M.brass);
    B.box(0.12, 3.0, 0.12, -13.15, UP + 1.5, -13.86, M.brass);
    B.ell(-14.5, UP + 2.2, -13.84, 0.55, 0.55, 0.02, M.signGold, { cast: false });
    B.ell(-14.5, UP + 2.2, -13.82, 0.42, 0.42, 0.02, M.mihrab, { cast: false });
    B.box(0.06, 2.6, 0.05, -15.7, UP + 1.3, -13.82, M.lampWarm, { cast: false });
    B.box(0.06, 2.6, 0.05, -13.3, UP + 1.3, -13.82, M.lampWarm, { cast: false });
    const saj = (x, z, mat) => B.poly([[x - 0.36, UP + 0.012, z + 0.6], [x + 0.36, UP + 0.012, z + 0.6], [x + 0.36, UP + 0.012, z - 0.6], [x - 0.36, UP + 0.012, z - 0.6]], mat, { two: true, cast: false });
    saj(-14.5, -12.6, M.sajadah);
    for (const x of [-16.3, -15.1, -13.9, -12.7]) saj(x, -11.5, M.sajadah);
    for (const x of [-17.5, -16.3, -15.1, -13.9, -12.7, -11.5, -10.3]) saj(x, -10.3, M.sajadah2);
    // mimbar (kanan mihrab) — Zamiir khotbah Jumat dari sini
    B.box(1.1, 0.3, 1.3, -12.2, UP + 0.15, -13.15, M.lightwood);
    B.box(1.1, 0.3, 0.9, -12.2, UP + 0.45, -13.35, M.lightwood);
    B.box(1.1, 0.3, 0.6, -12.2, UP + 0.75, -13.5, M.lightwood);
    for (const sx of [-0.55, 0.55]) B.box(0.08, 1.0, 1.3, -12.2 + sx, UP + 0.95, -13.15, M.brass);
    B.box(1.1, 0.06, 0.06, -12.2, UP + 1.45, -12.55, M.brass);
    B.box(1.6, 1.0, 0.4, -10.4, UP + 0.5, -13.6, M.furn);
    for (let k = 0; k < 6; k++) B.box(0.18, 0.28, 0.22, -11.0 + k * 0.24, UP + 1.14, -13.6, k % 2 ? M.green : M.brass);
    B.box(1.4, 0.45, 0.35, -18.6, UP + 0.23, -9.0, M.lightwood);
    frame(B, -18.6, UP + 1.9, -13.9, 1.2, 0.9, ['art3', 'art1', 'art2']);
    pottedPlant(B, -19.4, -8.9, 1.2, UP, true);
    pottedPlant(B, -9.6, -8.9, 1.2, UP, true);
    L(-14.5, UP + 2.4, -11.5, WARM, 5.2, 1.0, 'U');
    L(-14.5, UP + 1.6, -13.4, [1, 0.85, 0.5], 2.5, 0.9, 'U');

    // ---------- RUANG MEETING
    B.box(6.2, 0.08, 1.7, -1.8, UP + 0.76, -11.6, M.furn);
    for (const lx of [-3.8, 0.2]) B.box(0.24, 0.72, 0.24, lx, UP + 0.36, -11.6, M.steel);
    for (const x of MEET_X) { officeChair(B, x, UP, -12.85, 0, M.leather); officeChair(B, x, UP, -10.35, Math.PI, M.leather); }
    officeChair(B, 1.95, UP, -11.6, -Math.PI / 2, M.leather);
    officeChair(B, -5.25, UP, -11.6, Math.PI / 2, M.leather);
    B.box(4.1, 2.25, 0.1, -1.8, UP + 1.75, -13.92, M.black);
    B.vquad(3.9, 2.05, -1.8, UP + 1.75, -13.86, M.tvMeet);
    B.box(0.4, 2.6, 2.6, -8.7, UP + 1.3, -11.3, M.slatdark);
    // papan strategi di dinding timur ruang meeting
    B.vquad(2.4, 1.3, 5.4, UP + 1.6, -11.4, M.whiteboard, -Math.PI / 2, {
      tex: (u, v, a, b) => {
        if (a > 0.08 && a < 0.92 && b > 0.12 && b < 0.88) {
          const cx = Math.floor(a * 6), cy = Math.floor(b * 3);
          if (fr(a * 6) > 0.2 && fr(a * 6) < 0.8 && fr(b * 3) > 0.25 && fr(b * 3) < 0.75 && hash2(cx, cy) < 0.7) T.m = M[`acc${(cx + cy) % 6}`].id;
        }
        return 0;
      },
    });
    pottedPlant(B, 4.9, -13.4, 1.4, UP);
    for (const px of [-3.8, -1.8, 0.2]) {
      B.ell(px, UP + 2.25, -11.6, 0.15, 0.12, 0.15, M.bulb, { cast: false });
      L(px, UP + 2.1, -11.6, WARM, 3.5, 0.9, 'U');
    }

    // ---------- RUANG BOSS
    B.box(14.5, 3.6, 0.06, 12.75, UP + 1.9, -13.95, M.ledgeDark);
    B.vquad(9.4, 3.0, 15.15, UP + 1.75, -13.88, M.cityView, 0, { tex: cityTex(9.4, 3.0) });
    for (let x = 10.45; x <= 19.9; x += 2.35) B.box(0.09, 3.2, 0.1, x, UP + 1.75, -13.86, M.steel);
    B.box(9.5, 0.1, 0.12, 15.15, UP + 3.3, -13.86, M.steel);
    B.box(0.06, 3.6, 5.5, 20.0, UP + 1.9, -11.25, M.glass);
    B.vquad(1.8, 1.0, 8.6, UP + 2.15, -13.88, M.tvBoss);
    B.box(1.95, 1.12, 0.06, 8.6, UP + 2.15, -13.92, M.black);
    B.vquad(1.0, 1.0, 6.4, UP + 2.2, -13.88, M.ledgeDark, 0, { tex: logoTex(logo, 1.0, 1.0) });
    B.box(2.4, 0.08, 1.0, 14, UP + 0.77, -11.6, M.furn);
    B.box(2.3, 0.72, 0.06, 14, UP + 0.38, -11.12, M.furn);
    for (const sx of [-1.12, 1.12]) B.box(0.08, 0.72, 0.9, 14 + sx, UP + 0.38, -11.6, M.furn);
    for (const dx of [-0.5, 0.5]) {
      B.box(0.9, 0.52, 0.05, 14 + dx, UP + 1.15, -11.9, M.black, { ry: dx * 0.4 });
      B.box(0.08, 0.3, 0.08, 14 + dx, UP + 0.95, -11.95, M.steel);
    }
    B.box(0.18, 0.08, 0.12, 13.2, UP + 0.86, -11.4, M.brass);
    officeChair(B, 14, UP, -12.5, 0, M.leather, 1.2);
    B.box(0.45, 2.6, 3, 19.6, UP + 1.3, -9.9, M.furn);
    for (let k = 0; k < 5; k++) for (let b = 0; b < 9; b++) B.box(0.25, 0.3, 0.14, 19.4, UP + 0.38 + k * 0.48, -11.2 + b * 0.3, M[`book${(k + b) % 4 + 1}`]);
    B.disc(8.6, UP + 0.012, -11.9, 1.6, 1.0, M.rugBoss, 4);
    sofa(B, 8.6, -12.9, 2.4, M.bossSofa, 2, UP, true);
    B.cyl(0.5, 0.06, 8.6, UP + 0.4, -11.6, M.marble, 14);
    B.box(0.1, 0.38, 0.1, 8.6, UP + 0.19, -11.6, M.brass);
    pottedPlant(B, 6.2, -13.3, 1.5, UP);
    pottedPlant(B, 19.3, -13.3, 1.6, UP, true);
    L(14, UP + 2.4, -11.2, WARM, 5, 1.0, 'U');
    L(8.6, UP + 2.2, -12, WARM, 4, 0.8, 'U');
    // koridor: planter + meja kecil
    for (const px of [-11.5, -5, 8, 17]) planter(B, px, -6.55, UP);
    B.box(1.8, 0.75, 0.45, 3.9, UP + 0.37, -9.0, M.furn);
    pottedPlant(B, 4.6, -9.0, 0.8, UP + 0.75);
    for (const x of [-16, -6, 9, 17]) L(x, UP + 2.2, -7.2, WARM, 4, 0.7, 'U');
    B.layer = 'G';
  }

  // =========================================================== LUAR
  B.floor(-9, 5, 2, 9.5, M.deck, 0.01);
  B.floor(5, 21.5, 2, 5, M.stone, 0.008);
  B.floor(5, 21.5, 12, 18.5, M.stone, 0.008);
  B.floor(5, 7, 5, 12, M.stone, 0.008);
  B.floor(19, 21.5, 5, 12, M.stone, 0.008);
  B.floor(-26.5, -20, -14.5, 2, M.concrete, 0.006);
  B.floor(20, 21.5, -14.5, 2, M.stone, 0.006);
  B.floor(-26.5, 21.5, -16, -14, M.concrete, 0.004);
  B.floor(-26.5, -9, 2, 18.5, M.stoneDark, 0.006);
  B.floor(-2.6, -1.4, 9.5, 18.5, M.stone, 0.012);
  B.floor(5.4, 21.2, 13.0, 17.2, M.deck, 0.014);
  // bangku taman
  for (const bx of BENCH_X) {
    B.box(1.9, 0.08, 0.5, bx, 0.45, 7.75, M.deck);
    B.box(1.9, 0.45, 0.07, bx, 0.75, 8.05, M.deck, { rx: -0.08 });
    for (const dx of [-0.8, 0.8]) B.box(0.08, 0.45, 0.45, bx + dx, 0.22, 7.8, M.steel);
  }
  for (const [px, pz] of [[-8.3, 8.8], [4.3, 8.8], [-8.3, 2.7], [-5, 2.7]]) planter(B, px, pz);
  // kolam
  B.box(12, 0.1, 7, 13, -1.45, 8.5, M.mosaic);
  B.box(12, 1.45, 0.1, 13, -0.72, 5.0, M.mosaic);
  B.box(0.1, 1.45, 7, 19.0, -0.72, 8.5, M.mosaic);
  B.poly([[7, -0.1, 12], [19, -0.1, 12], [19, -0.1, 5], [7, -0.1, 5]], M.water, { two: true, cast: false });
  B.box(12.5, 0.08, 0.34, 13, 0.04, 4.85, M.poolEdge);
  B.box(12.5, 0.08, 0.34, 13, 0.04, 12.15, M.poolEdge);
  B.box(0.34, 0.08, 7.6, 6.85, 0.04, 8.5, M.poolEdge);
  B.box(0.34, 0.08, 7.6, 19.15, 0.04, 8.5, M.poolEdge);
  for (const pz of [8.1, 8.9]) B.box(0.07, 1.0, 0.07, 7.15, 0.35, pz, M.chrome);
  for (const sz of [5.6, 6.8, 8.0, 9.2, 10.4, 11.6]) L(18.6, -0.3, sz, CYAN, 3.2, 0.8);
  L(13, 0.5, 8.5, CYAN, 8.5, 1.1);
  // kursi berjemur + payung
  for (const lx of [6.6, 9, 11.4, 13.8, 16.2, 18.4, 20.6]) {
    B.box(0.74, 0.08, 2.0, lx, 0.33, 14.4, M.lightwood);
    B.box(0.66, 0.09, 1.15, lx, 0.42, 14.0, M.cushion);
    B.box(0.66, 0.09, 0.78, lx, 0.64, 15.25, M.cushion, { rx: 0.75 });
    for (const dz of [13.6, 15.2]) B.box(0.7, 0.3, 0.05, lx, 0.15, dz, M.steel);
  }
  for (const [ux, uz] of [[10.2, 15.6], [15, 15.6]]) {
    B.box(0.07, 2.5, 0.07, ux, 1.25, uz, M.steel);
    B.cone(ux, 2.2, uz, 1.5, 0.5, M.umbrella);
  }
  B.box(16.5, 1.0, 0.04, 13.2, 0.5, 18.4, M.glassRail);
  B.box(0.04, 1.0, 16.5, 21.5, 0.5, 10.2, M.glassRail);
  for (let px = 5; px <= 21.5; px += 2.75) B.box(0.07, 1.0, 0.07, px, 0.5, 18.4, M.steel);
  // lampu taman (bollard)
  for (const [bx, bz] of [[6, 4], [6, 13], [20.5, 4], [20.5, 13], [-9.4, 4], [-9.4, 17], [5.4, 17], [-26, 4], [-26, 17], [-1.4, 10], [-2.6, 14], [-1.4, 17]]) {
    B.box(0.16, 0.7, 0.16, bx, 0.35, bz, M.dark);
    B.box(0.15, 0.1, 0.15, bx, 0.74, bz, M.lampWarm, { cast: false });
    L(bx, 0.9, bz, WARM, 3.2, 0.9);
  }
  // pagar kayu-besi
  B.box(0.1, 1.6, 33.1, -26.6, 0.8, 1.95, M.fence, { top: M.dark });
  B.box(48.1, 1.6, 0.1, -2.5, 0.8, 18.6, M.fence, { top: M.dark });
  // gerbang + papan nama
  B.box(3.4, 2.6, 0.7, -10.2, 1.3, 15.4, M.dark);
  B.vquad(2.8, 1.0, -10.2, 1.65, 15.76, M.dark, 0, { tex: sign(2.8, 1.0, 'ZATAA', M.signViolet, 2) });
  B.box(0.07, 2.3, 0.05, -11.75, 1.3, 15.78, M.lampPurple, { cast: false });
  B.vquad(3.0, 0.5, -10.2, 0.75, 15.76, M.dark, 0, { tex: sign(3.0, 0.5, 'TOP UP GAME', M.signWhite, 1) });
  L(-10.2, 1.4, 16.4, PURP, 3.5, 1.0);
  // carport pergola
  for (const [px, pz] of [[-14.5, 15.5], [-14.5, 12], [-20.5, 15.5], [-20.5, 12]]) B.box(0.16, 2.8, 0.16, px, 1.4, pz, M.dark);
  for (let px = -20.5; px <= -14.39; px += 0.4) B.box(0.08, 0.12, 3.8, px, 2.86, 13.75, M.slatdark);
  L(-17.5, 2.4, 13.75, WARM, 4, 0.8);
  // mobil
  car(B, -17.5, 6.8, 0.25);
  // tanaman pagar
  const hedge = (x1, z1, x2, z2, h = 0.9) => {
    const len = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.round(len / 0.7));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      B.ell(x1 + (x2 - x1) * t, h * 0.5, z1 + (z2 - z1) * t, 0.48, h * 0.55, 0.48, k % 2 ? M.hedge : M.foliage, { leafy: true });
    }
  };
  hedge(-8.6, 18.0, -3.0, 18.0);
  hedge(0.0, 18.0, 4.6, 18.0);
  hedge(-26.0, -13.5, -26.0, 1.5, 1.1);
  hedge(21.0, -13.5, 21.0, 1.0, 1.1);
  hedge(-8.8, 10.0, -8.8, 17.6, 0.7);
  hedge(4.8, 10.0, 4.8, 17.6, 0.7);
  for (const [tx, tz] of [[-24, 12], [-24, 6], [-6, 17.5], [3, 16.5], [21, 1], [21, 17.5], [-22, -16.5], [-10, -16.5], [4, -16.8], [16, -16.5], [23.5, -10], [-28, -6], [24, -2]]) tree(B, tx, tz, 4.2 + hash2(tx * 10, tz * 10) * 1.8);
  for (const [tx, tz] of [[6.2, 3.2], [20.3, 3], [-8.6, 9.2], [4.5, 9.3], [-0.5, 2.6]]) palm(B, tx, tz, 3.4 + hash2(tx * 7, tz * 3));

  return { prims: B.prims, lights };
}

function car(B, cx, cz, ry) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const at = (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c];
  let [x, z] = at(0, 0);
  B.box(1.9, 0.62, 4.6, x, 0.55, z, M.carPaint, { ry });
  [x, z] = at(0, -0.3);
  B.box(1.66, 0.5, 2.3, x, 1.1, z, M.carGlass, { ry, top: M.carPaint });
  for (const [wx, wz] of [[-0.9, 1.45], [0.9, 1.45], [-0.9, -1.45], [0.9, -1.45]]) {
    [x, z] = at(wx, wz);
    B.box(0.28, 0.66, 0.66, x, 0.33, z, M.black, { ry });
  }
  for (const lx of [-0.6, 0.6]) { [x, z] = at(lx, 2.31); B.box(0.42, 0.1, 0.04, x, 0.72, z, M.bulb, { ry, cast: false }); }
  [x, z] = at(0, -2.31);
  B.box(1.5, 0.08, 0.04, x, 0.78, z, M.rgb2, { ry, cast: false });
}

// pemandangan kota di jendela ruang boss
function cityTex(w, h) {
  const Wp = Math.round(w * K), Hp = Math.round(h * PXH);
  return (u, v, a, b) => {
    const X = Math.floor(a * Wp), Y = Math.floor((1 - b) * Hp);
    const bx = Math.floor(X / 5);
    const top = Hp * (0.25 + hash2(bx, 3) * 0.55);
    if (Y < top) { T.m = M.cityView.id; return (Y / Hp) * 0.3 - 0.15; }
    T.m = X % 5 > 0 && X % 5 < 4 && Y % 3 === 1 && hash2(X, Y) < 0.35 ? M.cityWin.id : M.cityDark.id;
    return 0;
  };
}
