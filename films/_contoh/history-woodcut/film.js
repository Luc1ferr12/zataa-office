// Mesin Antikythera — Woodcut Print film for Zaa History (1080×1920, 24 fps)
// One black block per shot, light only where the knife cut it away, one copper plate for the bronze.
import * as WC from './engine/index.js';
import { Sculpt } from './hands.js';
import { curl, peelState } from './trans.js';
import { clamp, lerp, seg, ss, eio, eo, ei, mulberry, hash } from '/core/lib.js';

const W = 1080, H = 1920, TAU = Math.PI * 2;
const IMG = { x: 44, y: 150, w: 992, h: 1210 };            // printed image area (the block)
const CAP_Y = IMG.y + IMG.h + 104;                          // caption margin centre (above the Shorts UI)
const PW = IMG.w, PH = IMG.h;
const COPPER = '#C2532B';
const [M, m] = WC.canvas(W, H), [C, c] = WC.canvas(W, H);
let P = null;

// ------------------------------------------------------------------ timeline (single source of truth)
export const K = {
  S1: 0, S2: 4.6, S3: 13.6, S4: 17.6, S5: 25.6, S6: 34.0, S7: 42.0, S7b: 45.0, S7c: 46.8, S8: 49.5, END: 55.0,
  L1: .4, L2: 5.45, L3: 14.0, L4: 18.6, L5: 26.0, L6: 33.4, L7: 43.4, L8: 50.0,
  scan0: 18.4, scan1: 23.0, pull0: 27.0, pull1: 31.6, align: 33.6, total: 38.0, corona: 38.6, peel1: 43.2,
};
export const DUR = 59.4;
const VO = [
  ['L1', 'Benda ini berumur 2.000 tahun. Dan di dalamnya, ada roda gigi.', 3.72],
  ['L2', 'Tahun 1901, penyelam spons mengangkatnya dari bangkai kapal kuno, dekat Pulau Antikythera, Yunani.', 7.87],
  ['L3', 'Kelihatannya, cuma bongkahan perunggu berkarat.', 2.58],
  ['L4', 'Tapi sinar-X memperlihatkan isinya: lebih dari 30 roda gigi.', 4.17],
  ['L5', 'Putar engkolnya, dan ia menghitung langit. Posisi matahari, fase bulan,', 4.70],
  ['L6', 'bahkan meramal gerhana, bertahun-tahun sebelumnya.', 3.22],
  ['L7', 'Mesin serumit ini baru muncul lagi lebih dari 1.000 tahun kemudian.', 4.15],
  ['L8', 'Siapa pembuatnya? Sampai hari ini, belum ada yang tahu pasti.', 3.87],
];
export const SUBS = [];
export let EV = [];

// ------------------------------------------------------------------ stage: camera, frame, captions
function camMatrix(cam) {
  const z = cam.z ?? 1, x = cam.x ?? PW / 2, y = cam.y ?? PH / 2;
  return [z, 0, 0, z, IMG.x + IMG.w / 2 - z * x, IMG.y + IMG.h / 2 - z * y];
}
function begin(cam = {}) {
  m.setTransform(1, 0, 0, 1, 0, 0); c.setTransform(1, 0, 0, 1, 0, 0);
  m.fillStyle = '#fff'; m.fillRect(0, 0, W, H); c.clearRect(0, 0, W, H);
  for (const q of [m, c]) { q.save(); q.beginPath(); q.rect(IMG.x, IMG.y, IMG.w, IMG.h); q.clip(); q.transform(...camMatrix(cam)); }
  m.fillStyle = '#000'; m.fillRect(-4000, -4000, 12000, 12000);
}
function end() { m.restore(); c.restore(); m.setTransform(1, 0, 0, 1, 0, 0); c.setTransform(1, 0, 0, 1, 0, 0); }
function wrap(q, text, maxW) {
  const words = text.split(' '), lines = []; let cur = '';
  for (const w of words) { const s = cur ? cur + ' ' + w : w; if (q.measureText(s).width > maxW && cur) { lines.push(cur); cur = w; } else cur = s; }
  if (cur) lines.push(cur); return lines;
}
const CAP_FONT = '400 50px "IM Fell English"', CAP_LH = 60;
function caption(text, a) {
  if (!text || a <= 0) return;
  m.font = CAP_FONT; m.textAlign = 'center'; m.textBaseline = 'middle'; m.fillStyle = `rgba(0,0,0,${a})`;
  const L = wrap(m, text, 930), y0 = CAP_Y - (L.length - 1) * CAP_LH / 2;
  L.forEach((s, i) => m.fillText(s, W / 2, y0 + i * CAP_LH));
}
function labels(t) {
  m.font = '400 30px "IM Fell English SC"'; m.textBaseline = 'middle'; m.fillStyle = '#000';
  m.textAlign = 'left'; m.fillText(t >= K.S8 ? 'misteri' : 'fakta', IMG.x + 4, 96);
  m.textAlign = 'right'; m.fillText('zaa history', IMG.x + IMG.w - 4, 96);
}
function endCard(t) {
  const a = seg(t, K.END, K.END + .1);
  if (a <= 0) return;
  m.textAlign = 'center'; m.textBaseline = 'middle'; m.fillStyle = `rgba(0,0,0,${a})`;
  m.font = '400 64px "IM Fell English SC"'; m.fillText('zaa history', W / 2, CAP_Y - 26);
  m.font = 'italic 400 38px "IM Fell English"'; m.fillText('Ikuti untuk misteri kuno berikutnya', W / 2, CAP_Y + 42);
}
function capAt(t) {
  for (const s of SUBS) if (t >= s.t0 && t < s.t1) return { s, a: Math.min(seg(t, s.t0, s.t0 + .1), 1 - seg(t, s.t1 - .15, s.t1)) };
  return null;
}
function carveText(text, x, y, size = 70, mirror = false) {
  m.save(); m.translate(x, y); if (mirror) m.scale(-1, 1);
  m.font = `400 ${size}px "IM Fell English SC"`; m.textAlign = 'center'; m.textBaseline = 'middle'; m.fillStyle = '#fff';
  m.fillText(text, 0, 0); m.restore();
}

// ------------------------------------------------------------------ subjects
const circle = (x, y, r, n = 72) => WC.ellipse(x, y, r, r, n);
function capsulePoly(a, b, ra, rb = ra, n = 10) {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), out = [];
  for (let i = 0; i <= n; i++) { const t = ang + Math.PI / 2 + Math.PI * i / n; out.push([a[0] + Math.cos(t) * ra, a[1] + Math.sin(t) * ra]); }
  for (let i = 0; i <= n; i++) { const t = ang - Math.PI / 2 + Math.PI * i / n; out.push([b[0] + Math.cos(t) * rb, b[1] + Math.sin(t) * rb]); }
  return out;
}

// the lump: a corroded bronze fragment, sculpted as a height field and filtered into form-following cuts
let LUMP;
function buildLump() {
  const r = mulberry(31), cp = [];
  for (let i = 0; i < 13; i++) { const a = i / 13 * TAU, k = .8 + r() * .26 - (Math.cos(a - .6) > .85 ? .14 : 0); cp.push([Math.cos(a) * 300 * k, Math.sin(a) * 285 * k]); }
  const poly = WC.spline(cp, 5, true);
  const S = new Sculpt(800, 800), Ps = poly.map(([x, y]) => [x + 400, y + 400]);
  S.plank(Ps, 70, 150, 0);
  const reg = new WC.Region([Ps], { res: 2 });
  for (let i = 0; i < 70; i++) { const x = 120 + r() * 560, y = 120 + r() * 560; if (!reg.inside(x, y) || reg.dist(x, y) < 25) continue; const rr = 10 + r() * 34; S.blob(x, y, rr, rr * (.6 + r() * .5), r() * 3, { zs: .3 + r() * .3, mat: 1, smooth: 10 }); }
  for (let y = 0; y < 800; y++) for (let x = 0; x < 800; x++) {
    const i = y * 800 + x; if (S.H[i] < 0) continue;
    const d = Math.hypot(x - 380, y - 420);
    S.H[i] -= 8 * Math.exp(-((d - 178) ** 2) / 60) + 5 * Math.exp(-((d - 128) ** 2) / 34) + 3 * Math.exp(-((d - 40) ** 2) / 30);
  }
  S.noise(1.6, 7);
  const img = S.shade(WC.light(-.55, -.62, .56), { mats: { 0: { alb: 1, spec: .16, shin: 12 }, 1: { alb: .92, spec: .06 } } });
  const region = new WC.Region([poly], { res: 2 });
  const F = WC.woodcutFilter(img, { rect: [-400, -400, 800, 800], region, sp: 5.2, black: .06, white: .8, gamma: 1.1, res: 2, seed: 4, reveal: { t0: 0, t1: 1.6, mode: 'light', speed: 1500 } });
  const halo = WC.cutAlong(WC.offsetPoly(poly, 6), { closed: true, w: 7, kind: 'v', seg: [60, 200], gap: [0, 2], seed: 5, reveal: { t0: 0, t1: .7, speed: 1600 } });
  const crackPts = WC.spline([[-215, -150], [-140, -90], [-90, -98], [-20, -10], [60, 40], [130, 52], [232, 118]], 3);
  const crack = WC.cutAlong(crackPts, { w: u => 2.5 + 8 * Math.sin(Math.PI * u), kind: 'v', seg: [40, 90], gap: [0, 1], seed: 9, reveal: { t0: 0, t1: .45, speed: 700 } });
  const glints = WC.rays(60, 40, { n: 18, r0: 16, r1: [40, 96], w: 5, seed: 12, reveal: { t0: 0, t1: .5, jit: .3 } });
  LUMP = { poly, inset: poly.map(([x, y]) => [x * .86, y * .86]), F, halo, crack, crackPts, glints };
}
// tc: carve clock of the body; kc: crack clock; gc: glint clock; glow: copper plate width along the crack
function drawLump(x, y, s, rot, { tc = 1e9, kc = 1e9, gc = -1, glow = 0, dot = 0, inner = null } = {}) {
  for (const q of [m, c]) { q.save(); q.translate(x, y); q.rotate(rot); q.scale(s, s); }
  WC.fillPoly(m, [LUMP.poly], '#000');
  WC.drawStrokes(m, LUMP.halo, { t: tc });
  WC.drawStrokes(m, LUMP.F.strokes, { t: tc });
  if (inner) inner();
  WC.drawStrokes(m, LUMP.crack, { t: kc });
  if (gc >= 0) WC.drawStrokes(m, LUMP.glints, { t: gc });
  if (glow > 0) {
    c.strokeStyle = 'rgba(0,0,0,.95)'; c.lineWidth = glow; c.lineCap = 'round'; c.beginPath();
    LUMP.crackPts.forEach(([px, py], i) => i ? c.lineTo(px, py) : c.moveTo(px, py)); c.stroke();
    WC.plate(c, [circle(60, 40, 26 * Math.min(1, glow / 14))], .9);
  }
  if (dot > 0) WC.plate(c, [circle(60, 40, dot)], 1);
  for (const q of [m, c]) q.restore();
}

// gears: carved bronze wheels, built once at the origin and drawn through the canvas transform
let GEARS;
function gearPolys(r, n, th) {
  const out = [], p = TAU / n, rr = r - th;
  for (let i = 0; i < n; i++) { const a = i * p; for (const [rad, da] of [[rr, -.36], [r, -.2], [r, .2], [rr, .36]]) out.push([Math.cos(a + da * p) * rad, Math.sin(a + da * p) * rad]); }
  const polys = [out, circle(0, 0, Math.max(6, r * .09), 24)];
  if (r > 90) {
    const ri = r * .22, ro = r * .74;
    for (let k = 0; k < 4; k++) {
      const sw = 22 / ri, sw2 = 22 / ro, a0 = k * Math.PI / 2, a1 = a0 + Math.PI / 2, win = [];
      for (let j = 0; j <= 10; j++) { const a = lerp(a0 + sw, a1 - sw, j / 10); win.push([Math.cos(a) * ri, Math.sin(a) * ri]); }
      for (let j = 10; j >= 0; j--) { const a = lerp(a0 + sw2, a1 - sw2, j / 10); win.push([Math.cos(a) * ro, Math.sin(a) * ro]); }
      polys.push(win);
    }
  } else polys.push(circle(0, 0, r * .55, 40), circle(0, 0, r * .42, 40));
  return polys;
}
function gear(r, n, seed) {
  const polys = gearPolys(r, n, Math.max(8, r * .075));
  const S = WC.shape(polys, { light: WC.light(-.5, -.62, .5), dir: WC.dirRing(0, 0), sp: 6, R: 20, halo: 4, lo: .22, hi: .95, seed, res: 2, seg: [30, 110],
    reveal: { t0: 0, t1: .85, key: (x, y) => clamp(Math.hypot(x, y) / r), speed: 1300 } });
  return { r, n, polys, S };
}
function buildGears() {
  const g0 = gear(185, 48, 1), g1 = gear(72, 19, 2), g2 = gear(52, 14, 3), g3 = gear(95, 24, 4), g4 = gear(34, 10, 5);
  const pol = (a, d) => [Math.cos(a) * d, Math.sin(a) * d];
  const p1 = pol(-.75, 247), p2 = [p1[0] + Math.cos(.5) * 115, p1[1] + Math.sin(.5) * 115], p3 = pol(2.3, 270);
  const w0 = .55;
  GEARS = [
    { g: g0, p: [0, 0], w: w0, ph: 0 }, { g: g1, p: p1, w: -w0 * 185 / 72, ph: .1 }, { g: g2, p: p2, w: w0 * 185 / 52, ph: .3 },
    { g: g3, p: p3, w: -w0 * 185 / 95, ph: .05 }, { g: g4, p: p3, w: -w0 * 185 / 95, ph: .4 },
  ];
  const crank = WC.shape([capsulePoly([0, 0], [150, 0], 13, 10)], { light: WC.light(-.4, -.7, .4), sp: 6, R: 10, halo: 4, seed: 9 });
  const knob = WC.shape([circle(150, 0, 22, 30)], { light: WC.light(-.4, -.7, .4), dir: WC.dirRing(150, 0), sp: 5, R: 14, halo: 4, seed: 10 });
  GEARS.crank = { crank, knob };
}
// draw the gear train with its main wheel at (x,y), scale s. spin(i) → angle; carve(i) → carve clock; plateA copper density
function drawGears(x, y, s, { spin = () => 0, carve = () => 1e9, plateA = .9, crank = false } = {}) {
  GEARS.forEach((G, i) => {
    const ct = carve(i); if (ct <= 0) return;
    const a = spin(i) * G.w + G.ph;
    for (const q of [m, c]) { q.save(); q.translate(x, y); q.scale(s, s); q.translate(...G.p); q.rotate(a); }
    G.g.S.draw(m, ct);
    WC.plate(c, G.g.polys, plateA * clamp(ct / .85));
    for (const q of [m, c]) q.restore();
  });
  if (crank) {
    const a = spin(0) * GEARS[0].w;
    m.save(); m.translate(x, y); m.scale(s, s); m.rotate(a); GEARS.crank.crank.draw(m); GEARS.crank.knob.draw(m); m.restore();
  }
}

// the sea of 1901: crane from the surface to the wreck
let SEA;
function buildSea() {
  const S = {};
  S.sky = WC.hatch(new WC.Region([WC.rect(-200, -400, PW + 400, 650)], { res: 4 }), { dir: () => .02, tone: (x, y) => clamp(.25 + .55 * (y + 400) / 650), sp: 11, lo: .2, hi: .95, seed: 2, seg: [80, 300], gap: [4, 30], kind: 'v' });
  const surf = []; for (let x = -200; x <= PW + 200; x += 12) surf.push([x, 262 + 7 * Math.sin(x * .03) + 4 * Math.sin(x * .071)]);
  S.surf = WC.cutAlong(surf, { w: 9, kind: 'u', seg: [70, 200], gap: [2, 10], seed: 3 });
  S.water = WC.hatch(new WC.Region([WC.rect(-200, 280, PW + 400, 2050)], { res: 5 }), { dir: (x, y) => .03 * Math.sin(x * .004 + y * .002), tone: (x, y) => clamp(.12 + .55 * Math.exp(-(y - 280) / 700)), sp: 14, lo: .14, hi: .95, seed: 4, seg: [160, 460], gap: [10, 60], kind: 'v', jit: .03 });
  S.shafts = WC.rays(720, -700, { n: 26, a0: 1.74, a1: 2.36, r0: 980, r1: [2000, 2900], w: 30, seed: 6, kind: 'u', jit: .9 });
  const bed = [[-200, 2700]]; for (let x = -200; x <= PW + 200; x += 30) bed.push([x, 2275 + 22 * Math.sin(x * .008) + 10 * Math.sin(x * .03)]); bed.push([PW + 200, 2700]);
  S.bed = WC.shape([bed], { tone: () => (x, y) => clamp(.75 - (y - 2270) / 380 + .12 * Math.sin(x * .02 + y * .05)), dir: (x, y) => .06 * Math.sin(x * .01), sp: 9, lo: .2, hi: .95, halo: 0, seed: 7, res: 3, seg: [24, 90], gap: [4, 20] });
  S.ribs = [];
  for (let k = 0; k < 6; k++) {
    const x0 = 130 + k * 120, h = 260 - Math.abs(k - 2.5) * 40 - (k === 4 ? 90 : 0), lean = -50 + k * 8;
    const sp = WC.spline([[x0, 2300], [x0 + lean * .3, 2300 - h * .55], [x0 + lean, 2300 - h]], 6);
    const L = sp.map((p, i) => { const u = i / (sp.length - 1), w = 15 * (1 - .6 * u); return [p[0] - w, p[1]]; }), R = sp.map((p, i) => { const u = i / (sp.length - 1), w = 15 * (1 - .6 * u); return [p[0] + w, p[1]]; }).reverse();
    S.ribs.push(WC.shape([[...L, ...R]], { light: WC.light(-.2, -1, .25), dir: Math.PI / 2, sp: 6, R: 10, halo: 5, seed: 20 + k, lo: .3 }));
  }
  const amph = []; for (const [x, y] of [[0, -95], [9, -80], [11, -64], [34, -48], [46, -12], [42, 30], [26, 68], [7, 96]]) amph.push([x, y]);
  const amPoly = [...amph, ...amph.slice().reverse().map(([x, y]) => [-x, y])];
  S.amph = WC.shape([amPoly], { light: WC.light(-.5, -.7, .4), sp: 6, R: 24, halo: 4, seed: 30 });
  // the diver (standard dress of 1901: copper helmet, weighted boots, air hose to the boat)
  const L = WC.light(.45, -1, .3), part = (polys, seed) => WC.shape(polys, { light: L, sp: 6, R: 16, halo: 4, lo: .25, seed, res: 2 });
  S.diver = {
    legL: part([capsulePoly([-18, 0], [-26, 132], 17, 14)], 41), legR: part([capsulePoly([18, 0], [30, 128], 17, 14)], 42),
    bootL: part([WC.rect(-48, 124, 44, 26)], 43), bootR: part([WC.rect(10, 120, 46, 26)], 44),
    torso: part([capsulePoly([0, -96], [0, 6], 42, 36)], 45),
    armL: part([capsulePoly([0, 0], [-6, 104], 14, 12)], 46), armR: part([capsulePoly([0, 0], [8, 104], 14, 12)], 47),
    helm: WC.shape([circle(0, -150, 50, 48)], { light: L, dir: WC.dirRing(0, -150), sp: 6, R: 30, halo: 5, lo: .2, seed: 48 }),
    port: circle(16, -146, 15, 24),
  };
  SEA = S;
}
function diverAt(t) { const u = seg(t, K.S2, K.S3); return [380 + 40 * Math.sin(u * 3), lerp(820, 2010, eio(u * .98))]; }
function drawDiver(t) {
  const D = SEA.diver, [x, y] = diverAt(t), tt = Math.floor(t * 12) / 12, sw = Math.sin(tt * 2.4);
  // air hose to the surface: a white rope cut, a little slack
  const hose = []; for (let k = 0; k <= 30; k++) { const u = k / 30; hose.push([lerp(x + 40, 610, u) + 40 * Math.sin(u * Math.PI) , lerp(y - 330, 262, u)]); }
  WC.drawStrokes(m, WC.cutAlong(hose, { w: 4, kind: 'k', seg: [50, 140], gap: [3, 9], seed: 50 }), { t: 1e9 });
  m.save(); m.translate(x, y); m.scale(1.7, 1.7); m.rotate(.08 * sw);
  const drawPart = (S, tx = 0, ty = 0, rot = 0) => { m.save(); m.translate(tx, ty); m.rotate(rot); S.draw(m); m.restore(); };
  drawPart(D.armL, -40, -88, .35 + .25 * sw); drawPart(D.legL, 0, 0, .1 * sw); drawPart(D.bootL, 0, 0, .1 * sw);
  drawPart(D.legR, 0, 0, -.1 * sw); drawPart(D.bootR, 0, 0, -.1 * sw); drawPart(D.torso); drawPart(D.helm);
  WC.fillPoly(m, [D.port], '#fff'); WC.fillPoly(m, [circle(16, -146, 7, 16)], '#000');
  drawPart(D.armR, 40, -88, -.4 - .2 * sw);
  m.restore();
  // bubbles from the helmet: stab cuts rising, wobbling
  const pts = [];
  for (let k = 0; k < 40; k++) { const born = K.S2 + .1 + k * .22, age = t - born; if (age < 0 || age > 3.2) continue; const [bx, by] = diverAt(born); pts.push([bx + 40 + 12 * Math.sin(age * 5 + k), by - 300 - age * 170, 3 + 3 * hash(k)]); }
  WC.drawStrokes(m, WC.flecks(pts, { seed: 51, angle: 1.4 }), { t: 1e9 });
}

// the night sky dial around the gears (shot 5) and the great eclipse (shot 6)
let SKY;
function buildSky() {
  const cx = 496, cy = 600, r = mulberry(61), S = {};
  S.ring = [430, 452].flatMap((R, i) => WC.cutAlong(circle(cx, cy, R, 180), { closed: true, w: 4, kind: 'v', seg: [80, 220], gap: [1, 4], seed: 62 + i, reveal: { t0: 0, t1: 1.6, speed: 1200 } }));
  S.ticks = [];
  for (let k = 0; k < 60; k++) { const a = k / 60 * TAU - Math.PI / 2, big = k % 5 === 0, r0 = 430, r1 = big ? 452 : 440;
    const s = WC.mkStroke([[cx + Math.cos(a) * r0, cy + Math.sin(a) * r0], [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1]], big ? 3.5 : 1.8, { kind: 'k', seed: k }); s.t0 = .2 + 1.3 * k / 60; s.dur = .06; S.ticks.push(s); }
  const st = []; for (let i = 0; i < 260; i++) { const x = r() * PW, y = r() * PH, d = Math.hypot(x - cx, y - cy); if (d < 372 || (d > 425 && d < 470)) continue; st.push([x, y, 1.6 + r() * 3.2]); }
  S.stars = WC.flecks(st, { seed: 63 }); S.stars.forEach((s, i) => { s.t0 = Math.hypot(s.x - cx, s.y - cy) / 900 * 1.6 + hash(i) * .3; s.dur = .05; });
  S.sunMark = WC.shape([circle(0, 0, 30, 40)], { white: true, dir: WC.dirRing(0, 0), sp: 6, R: 14, lo: .3, seed: 64 });
  S.sunRays = WC.rays(0, 0, { n: 16, r0: 38, r1: [56, 74], w: 5, seed: 65 });
  // eclipse plate
  const ex = 496, ey = 560;
  S.sun = WC.shape([circle(ex, ey, 150, 120)], { white: true, dir: WC.dirRing(ex, ey), sp: 9, R: 40, tone: () => (x, y) => clamp(.25 + .65 * Math.hypot(x - ex, y - ey) / 150), lo: .1, hi: .9, seed: 66 });
  S.rays = WC.rays(ex, ey, { n: 64, r0: 172, r1: [250, 430], w: 12, seed: 67, jit: .8 });
  S.corona = WC.rays(ex, ey, { n: 120, r0: 158, r1: [290, 780], w: 15, seed: 68, jit: .9, bend: .25, reveal: { t0: 0, t1: .5, jit: .4 } });
  S.rim = WC.cutAlong(circle(ex, ey, 153, 120), { closed: true, w: 3.5, kind: 'k', seg: [40, 120], gap: [0, 2], seed: 69 });
  S.estars = WC.flecks(st.filter(([x, y]) => Math.hypot(x - ex, y - ey) > 470), { seed: 70 });
  SKY = S;
}
function drawMoonMarker(x, y, R, phase) {
  // phase 1 = half lit (right), 0 = new moon (dark with a rim)
  WC.drawStrokes(m, WC.cutAlong(circle(x, y, R + 4, 40), { closed: true, w: 3, kind: 'k', seg: [30, 80], seed: 71 }), { t: 1e9 });
  if (phase <= .02) return;
  m.save(); m.beginPath(); m.arc(x, y, R, -Math.PI / 2, Math.PI / 2); m.ellipse(x, y, R * (1 - phase), R, 0, Math.PI / 2, -Math.PI / 2, true); m.fillStyle = '#fff'; m.fill(); m.restore();
}

// three prints for the thousand-year jump
let PR;
function buildPrints() {
  const R = {};
  // A · the ship (2nd century BC)
  R.aSky = WC.rays(720, 360, { n: 54, r0: 70, r1: [260, 900], w: 11, seed: 80, jit: .7 });
  R.aSun = WC.shape([circle(720, 360, 58, 60)], { white: true, dir: WC.dirRing(720, 360), sp: 7, R: 20, lo: .25, seed: 81 });
  R.aSea = WC.hatch(new WC.Region([WC.rect(-50, 770, PW + 100, 500)], { res: 4 }), { dir: (x, y) => .05 * Math.sin(x * .02 + y * .03), tone: (x, y) => clamp(.75 * Math.exp(-(y - 770) / 260) + .5 * Math.exp(-((x - 720) ** 2) / 5000) * clamp(1 - (y - 770) / 420)), sp: 10, lo: .15, hi: .95, seed: 82, seg: [30, 120], gap: [6, 40] });
  R.aHaze = WC.hatch(new WC.Region([WC.rect(-50, 540, PW + 100, 230)], { res: 4 }), { dir: () => 0, tone: (x, y) => clamp(.1 + .85 * ((y - 540) / 230) ** 1.6), sp: 9, lo: .12, hi: .98, seed: 86, seg: [200, 520], gap: [6, 30] });
  R.aHull = WC.shape([[[200, 690], [250, 728], [620, 728], [700, 668], [690, 712], [620, 790], [300, 795], [235, 760]].map(([x, y]) => [x - 110, y])], { light: WC.light(-.3, -1, .3), dir: 0, sp: 7, R: 20, halo: 5, seed: 83 });
  R.aMast = WC.shape([WC.rect(306, 380, 12, 350)], { sp: 5, halo: 4, seed: 84 });
  R.aSail = WC.shape([[[190, 420], [440, 410], [450, 650], [185, 660]]], { white: true, dir: Math.PI / 2, sp: 9, tone: () => (x, y) => clamp(.25 + .5 * Math.sin((x - 190) / 250 * Math.PI)), seed: 85, halo: 0 });
  // B · ruins under the stars (the long gap)
  const rb = mulberry(90), st = []; for (let i = 0; i < 160; i++) { const x = rb() * PW, y = rb() * 780; st.push([x, y, 1.8 + rb() * 3]); }
  R.bStars = WC.flecks(st, { seed: 91 });
  R.bGround = WC.hatch(new WC.Region([WC.rect(-50, 880, PW + 100, 400)], { res: 4 }), { dir: () => .03, tone: (x, y) => clamp(.6 - (y - 880) / 500), sp: 10, lo: .15, seed: 92, seg: [30, 140], gap: [6, 40] });
  R.bCols = [[200, 470], [430, 310], [690, 400]].map(([x, h], i) => { const top = 880 - h, poly = [[x, 880], [x, top + 20], [x + 30, top + (i % 2 ? 8 : 30)], [x + 55, top], [x + 96, top + 26], [x + 96, 880]];
    return WC.shape([poly], { light: WC.light(-.7, -.3, .35), dir: Math.PI / 2, sp: 8, R: 30, halo: 5, seed: 93 + i, lo: .25 }); });
  R.bDrum = WC.shape([WC.ellipse(600, 940, 90, 46, 50)], { light: WC.light(-.7, -.4, .35), dir: WC.dirRing(600, 940, .5), sp: 7, R: 30, halo: 5, seed: 96 });
  // C · the clock tower (14th century AD)
  R.cRays = WC.rays(496, 560, { n: 48, r0: 160, r1: [300, 820], w: 10, seed: 100, jit: .7 });
  const tower = [[330, 1210], [330, 420], [350, 420], [350, 380], [390, 380], [390, 420], [430, 420], [430, 380], [470, 380], [470, 420], [520, 420], [520, 380], [560, 380], [560, 420], [600, 420], [600, 380], [640, 380], [640, 420], [660, 420], [660, 1210]];
  R.cTower = WC.shape([tower, circle(495, 560, 142, 80)], { light: WC.light(-.6, -.4, .3), dir: Math.PI / 2, sp: 9, R: 40, halo: 5, seed: 101, lo: .2 });
  R.cDial = WC.shape([circle(495, 560, 132, 80)], { white: true, dir: WC.dirRing(495, 560), sp: 8, R: 30, lo: .3, seed: 102 });
  R.cTicks = []; for (let k = 0; k < 24; k++) { const a = k / 24 * TAU, r0 = k % 6 ? 104 : 88; R.cTicks.push(WC.mkStroke([[495 + Math.cos(a) * r0, 560 + Math.sin(a) * r0], [495 + Math.cos(a) * 126, 560 + Math.sin(a) * 126]], k % 6 ? 4 : 7, { kind: 'v', seed: k })); }
  R.cWins = [[400, 800], [540, 800], [470, 980]].map(([x, y], i) => WC.shape([[[x, y + 90], [x, y + 20], [x + 25, y], [x + 50, y + 20], [x + 50, y + 90]]], { white: true, sp: 6, dir: 0, tone: () => () => .4, seed: 103 + i }));
  TITLE_RULE.push(...WC.cutAlong([[60, 214], [PW - 60, 214]], { w: 3, kind: 'k', seg: [80, 240], gap: [2, 8], seed: 120 }));
  PR = R;
}

function titlePanel(text) { WC.fillPoly(m, [WC.rect(-50, 70, PW + 100, 150)], '#000'); WC.drawStrokes(m, TITLE_RULE); carveText(text, 496, 145, 72); }
const TITLE_RULE = [];
// ------------------------------------------------------------------ shots
function shake(t, t0, amp = 9, d = .35) { const u = seg(t, t0, t0 + d); if (u <= 0 || u >= 1) return [0, 0]; const k = Math.floor(t * 24); return [(hash(k) - .5) * 2 * amp * (1 - u), (hash(k + 9) - .5) * 2 * amp * (1 - u)]; }

const SHOTS = [
  { id: 'hook', t0: K.S1, t1: K.S2, draw(t, l) {
      const z = l < 2.4 ? 1 : lerp(1, 1.22, eo(seg(l, 2.4, 2.62)));
      begin({ x: 496 + (z - 1) * 120, y: 600 + (z - 1) * 60, z });
      drawLump(496, 600, 1.2, -.12, { tc: l - .1, kc: l - 1.85, gc: l - 2.2, glow: 16 * ss(seg(l, 2.2, 2.6)) });
      end();
    } },
  { id: 'sea', t0: K.S2, t1: K.S3, draw(t, l) {
      const u = seg(t, K.S2, K.S3), cy = lerp(600, 2080, eio(seg(u, .04, .97)));
      begin({ x: 496, y: cy, z: 1 });
      const S = SEA;
      WC.drawStrokes(m, S.sky); WC.drawStrokes(m, S.water); WC.drawStrokes(m, S.shafts); WC.drawStrokes(m, S.surf);
      S.bed.draw(m);
      for (const [x, y, a] of [[700, 2296, 1.9], [810, 2306, 1.35], [235, 2290, -1.4]]) { m.save(); m.translate(x, y); m.rotate(a); m.scale(.62, .62); S.amph.draw(m); m.restore(); }
      for (const r of S.ribs) r.draw(m);
      drawLump(560, 2300, .16, .4, { glow: 14 });
      drawDiver(t);
      end();
    } },
  { id: 'museum', t0: K.S3, t1: K.S4, draw(t, l) {
      begin({ x: 496, y: 600, z: 1 });
      WC.drawStrokes(m, MUS.cone); WC.drawStrokes(m, MUS.floor);
      MUS.ped.draw(m); MUS.slab.draw(m);
      drawLump(496, 662, .42, -.12, { glow: 6 });
      WC.drawStrokes(m, MUS.glass);
      end();
    } },
  { id: 'xray', t0: K.S4, t1: K.S5, draw(t, l) {
      const z = lerp(1, 1.12, ss(seg(t, K.S4, K.S5)));
      begin({ x: 496, y: 600, z });
      const sc = 1.45, sy = lerp(-330, 330, ss(seg(t, K.scan0, K.scan1)));          // scan line in lump space
      const scanning = t >= K.scan0;
      drawLump(496, 600, sc, -.12, { glow: scanning ? 0 : 10, inner: !scanning ? null : () => {
        m.save(); c.save();
        for (const q of [m, c]) { q.beginPath(); WC.pathOf(q, LUMP.inset); q.clip(); q.beginPath(); q.rect(-500, -500, 1000, sy + 500); q.clip(); }
        m.fillStyle = '#000'; m.fillRect(-500, -500, 1000, 1000);
        drawGears(-30, 30, .82, { carve: i => { const G = GEARS[i], cyG = (30 + G.p[1] * .82); return t - lerp(K.scan0, K.scan1, (cyG + 330) / 660) - .05; }, plateA: .9 });
        m.restore(); c.restore();
        // the X-ray band: wide carved light across the lump where the scan is
        if (t < K.scan1 + .2) {
          m.save(); m.beginPath(); WC.pathOf(m, LUMP.poly); m.clip();
          const band = []; for (let k = -3; k <= 3; k++) band.push(WC.mkStroke([[-420, sy + k * 9], [420, sy + k * 9 + 3]], 9 - Math.abs(k) * 2.4, { kind: 'u', seed: 300 + k }));
          WC.drawStrokes(m, band); m.restore();
        }
      } });
      if (scanning && t < K.scan1 + .2) { const yy = 600 + sy * sc; WC.drawStrokes(m, WC.cutAlong([[-50, yy], [PW + 50, yy]], { w: 2.2, kind: 'k', seg: [40, 140], gap: [6, 20], seed: 77 }), { t: 1e9 }); }
      end();
    } },
  { id: 'cosmos', t0: K.S5, t1: K.S6, draw(t, l) {
      const u = eio(seg(t, K.pull0, K.pull1)), cx = 496, cy = 600;
      const z = lerp(2.5, .98, u), fx = lerp(cx + 92, cx, u), fy = lerp(cy - 84, cy, u);
      begin({ x: fx, y: fy, z });
      const sl = t - (K.S5 + 1.9);                                                   // sky carve clock
      WC.drawStrokes(m, SKY.stars, { t: sl }); WC.drawStrokes(m, SKY.ring, { t: sl }); WC.drawStrokes(m, SKY.ticks, { t: sl });
      const step = Math.floor((t - K.S5) * 12) / 12;                                 // gears on twos
      drawGears(cx, cy, 1, { spin: () => step, crank: true, plateA: .85 });
      // pointers: sun slow, moon fast; they meet at the alignment (a new moon = a solar eclipse)
      const thS = -2.25 + .05 * step, thM = thS - 1.7 * (1 - ss(seg(t, K.L5 + 3.6, K.align)));
      const sunA = ss(seg(t, K.L5 + 2.4, K.L5 + 3.0)), moonA = ss(seg(t, K.L5 + 3.6, K.L5 + 4.2));
      const RR = 398;
      if (sunA > 0) {
        const sx = cx + Math.cos(thS) * RR, sy2 = cy + Math.sin(thS) * RR;
        WC.drawStrokes(m, WC.cutAlong([[cx + Math.cos(thS) * 30, cy + Math.sin(thS) * 30], [cx + Math.cos(thS) * (RR - 36) * sunA, cy + Math.sin(thS) * (RR - 36) * sunA]], { w: 3.4, kind: 'k', seg: [60, 160], gap: [0, 2], seed: 78 }), { t: 1e9 });
        if (sunA > .9) { m.save(); m.translate(sx, sy2); SKY.sunMark.draw(m); WC.drawStrokes(m, SKY.sunRays); m.restore(); WC.plate(c, [circle(sx, sy2, 80)], .9); }
      }
      if (moonA > 0) {
        const mx = cx + Math.cos(thM) * RR, my = cy + Math.sin(thM) * RR;
        WC.drawStrokes(m, WC.cutAlong([[cx + Math.cos(thM) * 30, cy + Math.sin(thM) * 30], [cx + Math.cos(thM) * (RR - 36) * moonA, cy + Math.sin(thM) * (RR - 36) * moonA]], { w: 3.4, kind: 'k', seg: [60, 160], gap: [0, 2], seed: 79 }), { t: 1e9 });
        if (moonA > .9) drawMoonMarker(mx, my, 28, 1 - ss(seg(t, K.L5 + 3.6, K.align)));
      }
      end();
    } },
  { id: 'eclipse', t0: K.S6, t1: K.S7, draw(t, l) {
      const [dx, dy] = shake(t, K.corona, 10, .4);
      begin({ x: 496 + dx, y: 600 + dy, z: 1 });
      const S = SKY, ex = 496, ey = 560;
      WC.drawStrokes(m, S.estars);
      const mx = lerp(-260, ex, ss(seg(t, K.S6, K.total))), my = lerp(640, ey, ss(seg(t, K.S6, K.total)));
      const cov = clamp(1 - Math.hypot(mx - ex, my - ey) / 300);
      if (t < K.total) {
        WC.drawStrokes(m, S.rays.filter((_, i) => hash(i * 7.31 + 1) > cov * 1.05));
        S.sun.draw(m);
        WC.plate(c, [circle(ex, ey, 440)], .9 * (1 - cov * .6));
        WC.fillPoly(m, [circle(mx, my, 155, 100)], '#000');
        WC.drawStrokes(m, WC.cutAlong(circle(mx, my, 158, 100), { closed: true, w: 3.5, kind: 'k', seg: [40, 120], gap: [0, 2], seed: 72 }), { t: 1e9 });
      } else if (t >= K.corona) {
        const lc = t - K.corona;
        WC.drawStrokes(m, S.corona, { t: lc });
        WC.fillPoly(m, [circle(ex, ey, 155, 100)], '#000');
        WC.drawStrokes(m, S.rim, { t: 1e9 });
        WC.plate(c, [circle(ex, ey, lerp(160, 820, eo(seg(lc, 0, .9))))], .95);
      }
      // (K.total → K.corona: nothing is cut. Black wood, silence.)
      end();
    } },
  { id: 'prints', t0: K.S7, t1: K.S8, draw(t, l) {
      begin({ x: 496, y: 600, z: 1 });
      const R = PR;
      if (t < K.S7b) {
        WC.drawStrokes(m, R.aSky); WC.drawStrokes(m, R.aHaze); R.aSun.draw(m); WC.drawStrokes(m, R.aSea); R.aMast.draw(m); R.aSail.draw(m); R.aHull.draw(m);
        WC.plate(c, [circle(720, 360, 150)], .9); WC.plate(c, [WC.rect(560, 772, 320, 300)], .55);
        titlePanel('abad ke-2 SM');
      } else if (t < K.S7c) {
        WC.drawStrokes(m, R.bStars); WC.drawStrokes(m, R.bGround); R.bCols.forEach(s => s.draw(m)); R.bDrum.draw(m);
        titlePanel('1.000 tahun lebih');
      } else {
        WC.drawStrokes(m, R.cRays); R.cTower.draw(m); R.cDial.draw(m); WC.drawStrokes(m, R.cTicks, { color: '#000' }); R.cWins.forEach(s => s.draw(m));
        m.save(); m.translate(495, 560); m.rotate(-1.1); WC.fillPoly(m, [[[-6, 10], [-3, -100], [3, -100], [6, 10]]], '#000'); m.restore();
        WC.plate(c, [circle(495, 560, 135)], .9);
        titlePanel('abad ke-14 M');
      }
      end();
    } },
  { id: 'end', t0: K.S8, t1: DUR + 1, draw(t, l) {
      const z = lerp(1, 1.1, ss(seg(t, K.S8, DUR)));
      begin({ x: 560 + (z - 1) * 120, y: 560 + (z - 1) * 60, z });
      const sh = seg(t, K.S8 + 2.0, K.S8 + 4.0);
      drawLump(580, 540, 1.3, .15, { glow: 16 * (1 - ss(sh)), dot: sh > .6 ? lerp(0, 9, seg(sh, .6, 1)) : 0, gc: sh < .5 ? 1e9 : -1 });
      end();
    } },
];
let MUS;
function buildMuseum() {
  const S = {};
  S.cone = WC.rays(496, -260, { n: 30, a0: Math.PI / 2 - .25, a1: Math.PI / 2 + .25, r0: 300, r1: [1250, 1400], w: 11, seed: 110, jit: .5, kind: 'u' });
  S.floor = WC.hatch(new WC.Region([WC.rect(-50, 1040, PW + 100, 300)], { res: 4 }), { dir: () => .0, tone: (x, y) => clamp(.15 + .5 * Math.exp(-((x - 496) ** 2) / 60000) * (1 - (y - 1040) / 300)), sp: 9, lo: .12, seed: 111, seg: [30, 140], gap: [6, 30] });
  S.ped = WC.shape([WC.rect(346, 812, 300, 240)], { light: WC.light(0, -1, .3), dir: Math.PI / 2, sp: 7, R: 30, halo: 5, seed: 112, lo: .2 });
  S.slab = WC.shape([WC.rect(326, 790, 340, 30)], { light: WC.light(0, -1, .35), dir: 0, sp: 6, R: 12, halo: 5, seed: 113 });
  const gl = [[336, 788], [336, 470], [656, 470], [656, 788]];
  S.glass = WC.cutAlong(gl, { w: 2.4, kind: 'k', seg: [60, 200], gap: [4, 14], seed: 114 });
  MUS = S;
}

// ------------------------------------------------------------------ assembly
export async function init() {
  P = WC.makePrinter(W, H);
  buildLump(); buildGears(); buildSea(); buildMuseum(); buildSky(); buildPrints();
  for (const [id, text, d] of VO) {
    const t0 = K[id], next = VO[VO.indexOf(VO.find(v => v[0] === id)) + 1];
    let t1 = t0 + Math.max(1.8, d + .6, text.length / 15 + 1.62);
    if (next) t1 = Math.min(t1, K[next[0]] - .05);
    if (id === 'L6') t1 = Math.min(t1, K.total);
    if (id === 'L8') t1 = Math.min(t1, K.END - .05);
    SUBS.push({ id, t0: t0 - .05, t1, text });
  }
  EV = [];
  for (const [id] of VO) EV.push({ t: K[id], type: 'vo', id });
  for (const s of SHOTS) if (s.t0 > 0) EV.push({ t: s.t0, type: 'cut', id: s.id });
  EV.push({ t: .1, type: 'carve', dur: 1.7 }, { t: 1.85, type: 'crack' }, { t: 2.4, type: 'snap' }, { t: 2.2, type: 'glint' });
  EV.push({ t: K.scan0, type: 'scan', dur: K.scan1 - K.scan0 });
  GEARS.forEach((G, i) => { const cyG = 30 + G.p[1] * .82; EV.push({ t: lerp(K.scan0, K.scan1, (cyG + 330) / 660) - .05 + .85, type: 'gear', i, r: G.g.r }); });
  EV.push({ t: K.S5, type: 'crank' }, { t: K.S5 + 1.9, type: 'skycarve', dur: 1.6 }, { t: K.L5 + 3.0, type: 'sun' }, { t: K.L5 + 4.2, type: 'moon' }, { t: K.align, type: 'align' });
  EV.push({ t: K.total, type: 'total' }, { t: K.corona, type: 'corona' }, { t: K.S7, type: 'peel', dur: K.peel1 - K.S7 }, { t: K.S7b, type: 'print' }, { t: K.S7c, type: 'print' });
  EV.push({ t: K.S8, type: 'print' }, { t: K.S8 + 4.0, type: 'lastglint' }, { t: K.END, type: 'endcard' });
  EV.sort((a, b) => a.t - b.t);
}

const bufs = {};
function buf(k) { return bufs[k] || (bufs[k] = WC.canvas(W, H)); }
function shotAt(t) { return SHOTS.find(s => t >= s.t0 && t < s.t1) || SHOTS[SHOTS.length - 1]; }
function impressionReg(t, s) { const l = t - s.t0; if (s.t0 <= 0) return [3, 2]; if (l < 1 / 24) return [8, -2]; if (l < 2 / 24) return [1, 4]; return [3, 2]; }
function frameTo(g, t, { noCaption = false } = {}) {
  const s = shotAt(t), sub = t >= K.S7b && t < K.S7c ? 1 : t >= K.S7c && t < K.S8 ? 2 : 0;
  s.draw(t, t - s.t0);
  labels(t);
  if (!noCaption) { const cp = capAt(t); if (cp) caption(cp.s.text, cp.a); endCard(t); }
  const reg = s.id === 'prints' && sub ? impressionReg(t, { t0: sub === 1 ? K.S7b : K.S7c }) : impressionReg(t, s);
  const out = P.render(M, C, { seed: 7, inkSeed: SHOTS.indexOf(s) * 3 + sub + 1, plate: COPPER, reg });
  g.drawImage(out, 0, 0);
}
export function render(g, t) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (t >= K.S7 && t < K.peel1) {
    // the eclipse sheet peels off; the ship print is already lying underneath
    const [A, a] = buf('A'), [B, b] = buf('B'), [Bk, bk] = buf('Bk');
    frameTo(a, t);
    if (!bufs.done) {
      frameTo(b, K.S7 - .001, { noCaption: true });
      bk.fillStyle = '#EFE8D8'; bk.fillRect(0, 0, W, H); bk.save(); bk.globalAlpha = .16; bk.translate(W, 0); bk.scale(-1, 1); bk.drawImage(B, 0, 0); bk.restore();
      bufs.done = true;
    }
    g.drawImage(A, 0, 0);
    const { xf, r } = peelState(seg(t, K.S7, K.peel1), 170);
    curl(g, B, Bk, xf, r);
    return;
  }
  frameTo(g, t);
}
export function TEXTS(t) {
  const out = [], cp = capAt(t);
  if (cp) { m.font = CAP_FONT; const L = wrap(m, cp.s.text, 930); out.push({ id: cp.s.id, text: cp.s.text, x0: 60, y0: CAP_Y - L.length * CAP_LH / 2, x1: W - 60, y1: CAP_Y + L.length * CAP_LH / 2 }); }
  if (t >= K.END) out.push({ id: 'end', text: 'zaa history · Ikuti untuk misteri kuno berikutnya', x0: 60, y0: CAP_Y - 70, x1: W - 60, y1: CAP_Y + 70 });
  out.push({ id: 'label', text: 'fakta', x0: 44, y0: 80, x1: 300, y1: 112, pass: true });
  return out;
}
