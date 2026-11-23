// Vibranium — Marvel Talk (Pop Art, 1080×1920). Satu poster sablon per adegan, render(t) murni.
// Kontrak Zaa Office (office/film.md): timeline dari out/vo/dur.json, caption per kata dari out/vo/words.json.
// Tanpa karakter/kostum/logo Marvel: meteor, peta, menara, cakram logam = cetakan orisinal.
import { createPop, T, rectPts, ellipsePts } from './engine/pop.js';
import { clamp, lerp, seg, eio, eo, ei, back, hash } from '/core/lib.js';

const W = 1080, H = 1920;
const pop = createPop(document.getElementById('c'), { W, H });
await Promise.all(['40px Anton', '40px Archivo'].map((f) => document.fonts.load(f)));

// ---------------------------------------------------------------- timeline (ikut suara) ----
let VD = {}, WORDS = {};
try { VD = await (await fetch('out/vo/dur.json')).json(); } catch (e) { }
try { WORDS = await (await fetch('out/vo/words.json')).json(); } catch (e) { }
const IDS = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10'];
const GAP = { L2: .55, L3: .5, L4: .55, L5: .5, L6: .5, L7: .5, L8: .75, L9: .6, L10: .7 };
const K = {}, KE = {};
{ let t = .7; for (const id of IDS) { t += GAP[id] ?? 0; K[id] = t; t += VD[id] ?? 4; KE[id] = t; } window.DUR = t + 3.2; }
const DUR = window.DUR;
// waktu absolut sebuah kata (bagian awal kata) di baris id; fallback = tengah baris
const wordT = (id, w) => { const L = WORDS[id] || []; const x = L.find((q) => q[0].toLowerCase().replace(/[^a-z0-9/]/g, '').startsWith(w)); return K[id] + (x ? x[1] : (VD[id] ?? 4) * .5); };
const S = IDS.map((id, i) => (i ? K[id] - .25 : 0));   // awal tiap adegan
const shotOf = (t) => { let k = 0; for (let i = 0; i < S.length; i++) if (t >= S[i]) k = i; return k; };

// ---------------------------------------------------------------- events (suara) ----
const EV = [];
const ev = (t, type, o = {}) => EV.push({ t: +t.toFixed(3), type, ...o });
IDS.forEach((id) => ev(K[id], 'vo', { id }));
IDS.forEach((id, i) => i && ev(S[i], 'cut'));

// ---------------------------------------------------------------- tinta & bentuk ----
const VIB = { r: .5, b: .82 };          // vibranium = ungu (titik merah + biru)
const VIB_D = { r: .78, b: 1 };
const STEEL = { r: .16, b: .42 };
const GREY = { r: .26, b: .36 }, GREY_D = { r: .5, b: .62 };
const ground = (ink) => pop.fill(rectPts(-6000, -8000, 12000, 16000), ink);
const circle = (x, y, r, n = 64) => ellipsePts(x, y, r, r, n);
const star = (x, y, r0, r1, n, rot = 0) => { const o = []; for (let k = 0; k < n * 2; k++) { const a = rot + Math.PI * k / n, r = k % 2 ? r0 : r1; o.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); } o.push(o[0]); return o; };
const screen = (fn) => { pop.save(); [pop.P, pop.L, pop.S].forEach((c) => c.setTransform(1, 0, 0, 1, 0, 0)); fn(); pop.restore(); };
const present = (fx = {}) => pop.present({ cell: 6.2, ...fx });

function meteor(x, y, r, rot = 0, tail = 1) {
  if (tail > 0) {   // ekor api: pita kuning, inti merah
    const pts = []; for (let k = 0; k <= 12; k++) { const u = k / 12; pts.push([x + Math.cos(rot - .85) * r * (.5 + u * 3.6 * tail), y + Math.sin(rot - .85) * r * (.5 + u * 3.6 * tail) + Math.sin(u * 6) * r * .08]); }
    pop.fill(pop.ribbon(pts.slice().reverse(), r * 1.5, { taper: .9, tmin: .02 }), T.yellow);
    pop.over(pop.ribbon(pts.slice(0, 9).reverse(), r * .7, { taper: .9, tmin: .02 }), { r: .7 });
    pop.line(pop.ribbon(pts.slice().reverse(), r * 1.5, { taper: .9, tmin: .02 }), 5, { closed: true, taper: 0 });
  }
  const P = []; for (let k = 0; k < 15; k++) { const a = rot + k / 15 * Math.PI * 2, rr = r * (.82 + hash(k * 3.1) * .3); P.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); } P.push(P[0]);
  pop.fill(P, GREY);
  pop.over(ellipsePts(x + r * .25, y + r * .28, r * .62, r * .5, 40), { r: .38, b: .5 });
  for (const [cx, cy, cr] of [[-.3, -.25, .2], [.32, .1, .15], [-.05, .38, .12], [.1, -.45, .1]]) {
    const q = circle(x + cx * r, y + cy * r, cr * r, 28); pop.fill(q, GREY_D); pop.outline(q, 4);
  }
  pop.over(ellipsePts(x - r * .05, y - r * .05, r * .35, r * .25, 30), VIB);   // urat ungu vibranium
  pop.outline(P, 9);
}
const AF = [[-.32, -.46], [-.22, -.55], [-.02, -.56], [.1, -.52], [.26, -.5], [.33, -.4], [.4, -.25], [.52, -.12], [.6, -.1], [.5, .05], [.4, .15], [.36, .3], [.3, .42], [.2, .52], [.1, .56], [.03, .5], [-.02, .35], [-.06, .18], [-.1, .05], [-.14, -.05], [-.3, -.08], [-.42, -.15], [-.46, -.28], [-.4, -.4], [-.32, -.46]];
function africa(x, y, s, ink = T.yellow) {
  const P = AF.map(([a, b]) => [x + a * s, y + b * s]);
  pop.fill(P, ink); pop.outline(P, 8);
  const m = ellipsePts(x + .47 * s, y + .32 * s, .035 * s, .09 * s, 20); pop.fill(m, ink); pop.outline(m, 5);
}
function tower(x, y, w, h, ink = T.blue) {
  const body = rectPts(x - w / 2, y - h, w, h);
  pop.fill(body, ink);
  for (let r = 0; r < Math.floor(h / 70) - 1; r++) for (let c = 0; c < 2; c++) pop.fill(rectPts(x - w / 2 + w * (.18 + c * .42), y - h + 40 + r * 70, w * .22, 34), T.white);
  const sp = [[x - w * .3, y - h], [x, y - h - w * .9], [x + w * .3, y - h], [x - w * .3, y - h]];
  pop.fill(sp, ink); pop.outline(sp, 5); pop.outline(body, 6);
}
function disc(x, y, R, ink = VIB, o = {}) {
  const c = circle(x, y, R, 72);
  pop.fill(c, ink);
  for (const k of [.78, .56]) pop.line(circle(x, y, R * k, 60), Math.max(3, R * .018), { closed: true, taper: 0 });
  if (o.core !== false) { const cc = circle(x, y, R * .3, 40); pop.fill(cc, o.coreInk ?? VIB_D); pop.outline(cc, Math.max(3, R * .02)); }
  pop.over(ellipsePts(x - R * .35, y - R * .4, R * .28, R * .14, 24), { r: 0, y: 0, b: 0 });
  pop.outline(c, Math.max(4, R * .03));
}

// ---------------------------------------------------------------- huruf ----
function printType(str, x, y, o, p) {
  if (p <= 0) return;
  const e = eo(seg(p, 0, .7)), dx = (o.fromX ?? 90) * (1 - e), dy = (o.fromY ?? -40) * (1 - e);
  const base = { size: o.size, font: o.font || 'Anton', align: o.align || 'center', letter: o.letter, rot: o.rot || 0 };
  if (o.drop) pop.text(str, x + o.drop[0] - dx * .6, y + o.drop[1] - dy * .6, { ...base, fill: o.dropInk || T.red });
  pop.text(str, x + dx, y + dy, { ...base, fill: o.ink || T.yellow });
  if (p > .45 && o.outline !== 0) pop.text(str, x, y, { ...base, outline: o.outline ?? Math.max(4, o.size * .045), spot: 'rgba(0,0,0,0)', read: 'type:' + str });
}
// label kertas (pojok kiri atas, layar): baris [{s, size, font, ink}]
function label(lines, p, o = {}) {
  if (p <= 0) return;
  const x = o.x ?? 56, y = o.y ?? 210, padX = 30, padY = 20, gap = 8;
  const ws = lines.map((l) => pop.measure(l.s, { size: l.size, font: l.font || 'Anton' }));
  const w = Math.max(...ws) + padX * 2, h = lines.reduce((a, l) => a + l.size * 1.12, 0) + gap * (lines.length - 1) + padY * 2;
  const e = eo(seg(p, 0, .55)), k = seg(p, .35, 1), out = o.out ?? 0;
  const ox = -ei(out) * 1300;
  pop.save(); pop.translate(ox, 0); pop.translate(x + w / 2, y + h / 2); pop.rotate(o.rot ?? -.025); pop.translate(-(x + w / 2), -(y + h / 2));
  pop.fill(rectPts(x + 12 - (1 - e) * 70, y + 12 + (1 - e) * 30, w, h), o.shadowInk || T.red);
  pop.fill(rectPts(x + (1 - e) * 50, y - (1 - e) * 26, w, h), T.white);
  if (p > .3) pop.outline(rectPts(x, y, w, h), 5);
  let yy = y + padY;
  lines.forEach((l, n) => {
    const lh = l.size * 1.12;
    if (k > 0) { const ke = eo(seg(k, n * .12, n * .12 + .5)); pop.text(l.s, x + padX + (1 - ke) * 26, yy + lh / 2 + 1, { size: l.size, font: l.font || 'Anton', align: 'left', read: 'label:' + l.s, ...(l.ink ? { fill: l.ink } : {}) }); }
    yy += lh + gap;
  });
  pop.restore();
}
const labP = (t, a, b) => (t < a || t > b + .4 ? 0 : seg(t, a, a + .5));
const labOut = (t, b) => seg(t, b, b + .35);

// ---------------------------------------------------------------- caption per kata ----
const CH = [];
for (const id of IDS) {
  const ws = (WORDS[id] || []).map(([w, a, b]) => ({ w: w.toUpperCase(), t0: K[id] + a, t1: K[id] + b }));
  let cur = [];
  const wid = (arr) => arr.reduce((a, q) => a + pop.measure(q.w, { size: 86, font: 'Anton' }), 0) + 22 * (arr.length - 1);
  ws.forEach((x, i) => {
    if (cur.length && wid([...cur, x]) > 880) { CH.push({ ws: cur, t0: cur[0].t0 - .05, t1: cur[cur.length - 1].t1 + .12 }); cur = []; }
    cur.push(x);
    if (cur.length >= 3 || /[.,!?…:]$/.test(x.w) || i === ws.length - 1) { CH.push({ ws: cur, t0: cur[0].t0 - .05, t1: cur[cur.length - 1].t1 + .12 }); cur = []; }
  });
}
for (let i = 0; i + 1 < CH.length; i++) if (CH[i + 1].t0 - CH[i].t1 < .45) CH[i].t1 = CH[i + 1].t0;
function caption(t) {
  const c = CH.find((q) => t >= q.t0 && t < q.t1); if (!c) return;
  const sz = 86, y = 1440, sp = 22;
  const ws = c.ws.map((q) => pop.measure(q.w, { size: sz, font: 'Anton' }));
  const tw = ws.reduce((a, b) => a + b, 0) + sp * (ws.length - 1), w = tw + 64, h = sz * 1.3;
  const pin = eo(seg(t, c.t0, c.t0 + .1)), x = W / 2 - w / 2, yy = y - h / 2 + (1 - pin) * 14;
  pop.fill(rectPts(x + 10, yy + 10, w, h), T.blue);
  pop.fill(rectPts(x, yy, w, h), T.white);
  pop.outline(rectPts(x, yy, w, h), 5);
  let cx = W / 2 - tw / 2;
  c.ws.forEach((q, i) => {
    const on = t >= q.t0 - .03 && t < q.t1 + .25;
    pop.text(q.w, cx, yy + h / 2 + 3, { size: sz, font: 'Anton', align: 'left', ...(on ? { fill: T.red, inline: 3 } : {}) });
    cx += ws[i] + sp;
  });
}

// ---------------------------------------------------------------- adegan ----
// S1 · dot pull: dari titik sebesar koin mundur ke poster meteor di langit
ev(.25, 'pull', { d: 3.2 }); ev(wordT('L1', 'datang'), 'stampbig');
function s1(t) {
  const u = eio(seg(t, .2, 3.6)), zoom = Math.exp(lerp(Math.log(16), Math.log(.95), u));
  pop.begin({ x: lerp(-40, 0, u), y: lerp(-50, 40, u), zoom });
  ground({ b: .55 });
  for (let k = 0; k < 40; k++) { const sx = (hash(k * 7.7) - .5) * 1100, sy = (hash(k * 3.3) - .5) * 2000; if (Math.hypot(sx, sy + 60) > 420) pop.fill(circle(sx, sy, 4 + hash(k) * 9, 10), T.white); }
  const drift = (t - S[0]) * 6;
  meteor(30, -60 + drift, 310, .15 + t * .02, 1);
  present();
}
// S2 · meteor jatuh ke peta Afrika
const I2 = () => [.3 * 980, -.02 * 980 + 120];
function s2(t) {
  const a = S[1], hit = a + 2.1;
  const z = lerp(.78, 1.0, eio(seg(t, a, a + 5)));
  const [ix, iy] = I2();
  pop.begin({ x: lerp(0, ix * .55, eio(seg(t, hit, hit + 2))), y: lerp(120, iy, eio(seg(t, hit, hit + 2))), zoom: z });
  ground(T.sky);
  africa(0, 120, 980);
  if (t < hit) {
    const u = ei(seg(t, a + .2, hit));
    meteor(lerp(ix + 520, ix, u), lerp(iy - 980, iy, u), lerp(150, 70, u), 2.4, 1.2);
  } else {
    const k = t - hit, s = back(seg(k, 0, .25)) * (1 + .1 * Math.exp(-k * 6));
    const sr = star(ix, iy, 70 * s, 170 * s, 12, .2);
    pop.fill(sr, T.red); pop.outline(sr, 6);
    const c = circle(ix, iy, 46, 30); pop.fill(c, VIB); pop.outline(c, 5);
  }
  present();
}
ev(S[1] + .2, 'whoosh', { d: 1.9 }); ev(S[1] + 2.1, 'slam');
// S3 · dinding menara dicap makin cepat → Wakanda
const TOW = []; for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) TOW.push([i, j]);
TOW.sort((p, q) => Math.hypot(p[0], p[1] * 1.3) - Math.hypot(q[0], q[1] * 1.3));
const towT = (n) => S[2] + .25 + 2.6 * Math.pow(n / TOW.length, .6);
TOW.forEach((p, n) => { if (n < 14 || n % 3 === 0) ev(towT(n), 'stamp', { pan: clamp(p[0] / 3) * .6, v: n < 6 ? 1 : .6 }); });
function s3(t) {
  const z = Math.exp(lerp(Math.log(1.25), Math.log(.62), eio(seg(t, S[2], S[2] + 3.6))));
  pop.begin({ x: 0, y: -120, zoom: z });
  ground(T.red);
  TOW.forEach(([i, j], n) => {
    const ta = towT(n); if (t < ta) return;
    const s = 1 + .12 * (1 - eo(seg(t, ta, ta + .18)));
    pop.save(); pop.translate(i * 300, j * 520 + 200); pop.scale(s);
    tower(0, 0, 150, 300 + hash(n * 9.1) * 160, n === 0 ? VIB : T.blue);
    pop.restore();
  });
  present({ off: [[0, 0], [1.6, -1], [-1.2, 1.4]] });
}
// S4 · tanda tanya raksasa dicetak plat demi plat
function s4(t) {
  const a = S[3];
  pop.begin({ x: 0, y: -60, zoom: 1 });
  ground(T.yellow);
  printType('?', 0, -80, { size: 1250, ink: T.red, drop: [40, 40], dropInk: T.blue, outline: 30 }, seg(t, a + .05, a + .9));
  const m = [1, seg(t, a, a + .12) > 0 ? 1 : 0, t > a + .22 ? 1 : 0, t > a + .4 ? 1 : 0];
  present({ mask: [m[2], m[0], m[1], m[3]] });
}
ev(S[3] + .05, 'plate', { k: 0 }); ev(S[3] + .22, 'plate', { k: 1 }); ev(S[3] + .4, 'plate', { k: 2 });
// S5 · gelombang getaran ditelan cakram, energinya jadi titik di dalam
const WAVES = Array.from({ length: 6 }, (_, k) => S[4] + .4 + k * .7);
function s5(t) {
  pop.begin({ x: 0, y: -80, zoom: 1 });
  ground(T.pale);
  const R = 300; let n = 0;
  for (const tk of WAVES) {
    if (t < tk) continue;
    const x = -1000 + (t - tk) * 1000;
    if (x >= -R * .9) { n++; continue; }
    const pts = []; for (let k = 0; k <= 16; k++) { const ang = -.55 + 1.1 * k / 16; pts.push([x - 700 + Math.cos(ang) * 700, -80 + Math.sin(ang) * 700]); }
    const rb = pop.ribbon(pts, 46, { taper: .4, tmin: .2 }); pop.fill(rb, T.red); pop.line(rb, 4, { closed: true, taper: 0 });
  }
  disc(0, -80, R, VIB);
  const g = n / WAVES.length;   // energi tersimpan: kisi molekul makin terang
  for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) {
    const x = i * 70, y = -80 + j * 70; if (Math.hypot(x, y + 80) > R * .78) continue;
    if (hash(i * 13 + j * 7) < g) { const c = circle(x, y, 14 + 10 * g, 16); pop.fill(c, T.yellow); pop.outline(c, 3); }
  }
  present();
}
WAVES.forEach((tk) => ev(tk + .65, 'thud'));
// S6 · timbangan: baja vs vibranium, 1/3
function s6(t) {
  const a = S[5], tilt = -.22 * eo(seg(t, a + .5, a + 2));
  pop.begin({ x: 0, y: 60, zoom: 1 });
  ground(T.blue);
  const st = [[-120, 520], [0, 220], [120, 520], [-120, 520]]; pop.fill(st, T.yellow); pop.outline(st, 7);
  pop.save(); pop.translate(0, 220); pop.rotate(tilt);
  const beam = rectPts(-360, -18, 720, 36); pop.fill(beam, T.white); pop.outline(beam, 6);
  pop.save(); pop.translate(-300, 0); pop.rotate(-tilt);
  const blk = rectPts(-130, -250, 260, 230); pop.fill(blk, STEEL); pop.over(rectPts(-130, -250, 260, 56), { b: .2 }); pop.outline(blk, 7);
  pop.text('BAJA', 0, -135, { size: 70, font: 'Anton', fill: T.white, inline: 3, read: 'type:BAJA' });
  pop.restore();
  pop.save(); pop.translate(300, 0); pop.rotate(-tilt);
  disc(0, -110, 92, VIB);
  pop.restore();
  pop.restore();
  printType('1/3', 0, -420, { size: 380, ink: T.yellow, drop: [22, 22], dropInk: T.red }, seg(t, wordT('L6', 'sepertiga') - .3, wordT('L6', 'sepertiga') + .5));
  present();
}
ev(S[5] + .5, 'creak', { d: 1.4 }); ev(wordT('L6', 'sepertiga') - .3, 'stampbig');
// S7 · push ke cakram perisai (polos, tanpa bintang/logo)
function s7(t) {
  const a = S[6], z = Math.exp(lerp(Math.log(.6), Math.log(1.05), eio(seg(t, a, KE.L7 + .4))));
  pop.begin({ x: 0, y: -60, zoom: z, rot: lerp(-.08, 0, eio(seg(t, a, a + 2))) });
  ground(T.red);
  for (const [r, ink] of [[440, VIB], [350, GREY], [260, VIB], [170, GREY], [90, VIB_D]]) { const c = circle(0, -60, r, 90); pop.fill(c, ink); pop.outline(c, 7); }
  for (let k = 0; k < 16; k++) { const ang = k / 16 * Math.PI * 2, c = circle(Math.cos(ang) * 395, -60 + Math.sin(ang) * 395, 11, 12); pop.fill(c, T.white); pop.outline(c, 3); }
  pop.over(ellipsePts(-170, -260, 130, 60, 30), { r: 0, y: 0, b: 0 });
  present();
}
ev(S[6], 'pull', { d: 2 });
// S8 · titik merah-biru tumbuh memenuhi cakram → meledak
function s8(t) {
  const a = S[7], tb = wordT('L8', 'meledak');
  const f = clamp(seg(t, a + .3, tb)), shake = t < tb ? f * f * 14 : Math.max(0, 22 * Math.exp(-(t - tb) * 4));
  pop.begin({ x: Math.sin(t * 61) * shake, y: -60 + Math.cos(t * 47) * shake, zoom: 1 });
  ground(T.yellow);
  if (t < tb) {
    const c = circle(0, -60, 360, 90); pop.fill(c, VIB);
    for (const k of [.78, .56]) pop.line(circle(0, -60, 360 * k, 60), 6, { closed: true, taper: 0 });
    pop.over(circle(0, -60, 360 * (.35 + .65 * f), 80), { r: f, b: f });   // energi menumpuk: titik makin besar
    pop.outline(c, 10);
  } else {
    const k = t - tb, s = back(seg(k, 0, .3));
    const s1 = star(0, -60, 260 * s, 620 * s, 14, .1), s2s = star(0, -60, 160 * s, 380 * s, 14, .35);
    pop.fill(s1, T.red); pop.outline(s1, 9); pop.fill(s2s, T.white); pop.outline(s2s, 7);
    for (let n = 0; n < 14; n++) {
      const ang = n / 14 * Math.PI * 2 + .2, d = 300 + k * 900 * (.7 + hash(n) * .6);
      const x = Math.cos(ang) * d, y = -60 + Math.sin(ang) * d, sh = [[x, y - 40], [x + 46, y + 30], [x - 40, y + 26], [x, y - 40]];
      pop.fill(sh, VIB); pop.outline(sh, 4);
    }
  }
  present();
}
ev(S[7] + .3, 'rot', { d: +(wordT('L8', 'meledak') - S[7] - .3).toFixed(2) }); ev(wordT('L8', 'meledak'), 'boom');
// S9 · dinding salinan cakram yang gagal, satu yang asli beda warna
const WALL = []; for (let j = -4; j <= 4; j++) for (let i = -2; i <= 2; i++) WALL.push([i, j]);
WALL.sort((p, q) => Math.hypot(p[0], p[1]) - Math.hypot(q[0], q[1]));
const wallT = (n) => S[8] + .3 + 3.4 * Math.pow(n / WALL.length, .7);
WALL.forEach((p, n) => { if (n && (n < 12 || n % 2 === 0)) ev(wallT(n), 'stamp', { pan: p[0] * .3, v: .7 }); });
function s9(t) {
  const z = Math.exp(lerp(Math.log(1.3), Math.log(.62), eio(seg(t, S[8], S[8] + 4))));
  pop.begin({ x: 0, y: -40, zoom: z });
  ground(T.blue);
  const grey = seg(t, wordT('L9', 'nggak') , wordT('L9', 'nggak') + 1.2);
  WALL.forEach(([i, j], n) => {
    const ta = n ? wallT(n) : S[8]; if (t < ta) return;
    const x = i * 230, y = j * 230, s = 1 + .14 * (1 - eo(seg(t, ta, ta + .16)));
    pop.save(); pop.translate(x, y); pop.scale(s);
    pop.fill(rectPts(-110, -110, 220, 220), n ? T.white : T.yellow); pop.outline(rectPts(-110, -110, 220, 220), 5);
    if (n === 0) disc(0, 0, 85, VIB);
    else {
      disc(0, 0, 85, grey > 0 ? { r: lerp(.5, .2, grey), b: lerp(.82, .34, grey) } : VIB, { coreInk: GREY_D });
      const zz = []; for (let k = 0; k <= 6; k++) zz.push([-70 + k * 23, (k % 2 ? -1 : 1) * (12 + hash(n * 5 + k) * 22)]);   // retak: salinan gagal
      pop.save(); pop.rotate(hash(n) * 3); pop.line(zz, 6, { taper: .1 }); pop.restore();
    }
    pop.restore();
  });
  present({ off: [[0, 0], [2.2, -1.4], [-1.8, 2]] });
}
// S10 · VIBRANIUM vs ADAMANTIUM
function s10(t) {
  const a = S[9];
  pop.begin({ x: 0, y: 0, zoom: lerp(1.08, 1, eio(seg(t, a, a + 3))) });
  ground(T.red);
  pop.fill(rectPts(-3000, 0, 6000, 4000), T.blue);
  pop.outline([[-3000, 0], [3000, 0]], 10);
  printType('VIBRANIUM', 0, -330, { size: 210, ink: T.yellow, drop: [14, 14], dropInk: T.blue }, seg(t, a + .05, a + .7));
  printType('ADAMANTIUM', 0, 290, { size: 200, ink: T.white, drop: [14, 14], dropInk: T.red, fromX: -90 }, seg(t, a + .5, a + 1.2));
  const vs = wordT('L10', 'lawan'), s = back(seg(t, vs, vs + .3));
  if (t > vs) { const c = circle(0, 0, 190 * s, 60); pop.fill(c, T.yellow); pop.outline(c, 9); pop.text('VS', 0, 8, { size: 210 * s, font: 'Anton', fill: T.red, inline: 6, read: 'type:VS' }); }
  present();
}
ev(S[9] + .05, 'print'); ev(S[9] + .5, 'print'); ev(wordT('L10', 'lawan'), 'stampbig'); ev(DUR - 2.6, 'end');

// ---------------------------------------------------------------- label per adegan ----
const LABELS = [
  [K.L1 + 2.6, KE.L1 + .2, [{ s: 'LOGAM ANTARIKSA', size: 76 }, { s: 'tahan pukulan apa pun', size: 34, font: 'Archivo' }]],
  [wordT('L2', 'vibranium') + .1, KE.L2 + .2, [{ s: 'VIBRANIUM', size: 82, ink: T.red }, { s: 'meteor di Afrika', size: 34, font: 'Archivo' }]],
  [K.L3 + .4, KE.L3 + .2, [{ s: 'WAKANDA', size: 82 }, { s: 'paling maju, diam-diam', size: 34, font: 'Archivo' }]],
  [K.L5 + .3, KE.L5 + .2, [{ s: 'NYERAP GETARAN', size: 76 }, { s: 'energi disimpan di molekul', size: 34, font: 'Archivo' }]],
  [K.L6 + .3, KE.L6 + .2, [{ s: 'LEBIH KUAT DARI BAJA', size: 70 }, { s: 'beratnya cuma sepertiga', size: 34, font: 'Archivo' }]],
  [K.L7 + .3, KE.L7 + .3, [{ s: 'PERISAI', size: 82 }, { s: 'versi film: vibranium', size: 34, font: 'Archivo' }]],
  [K.L8 + .3, KE.L8 + .2, [{ s: 'ADA BATASNYA', size: 76, ink: T.red }, { s: 'kepenuhan = meledak (komik)', size: 34, font: 'Archivo' }]],
  [K.L9 + .5, KE.L9 + .2, [{ s: 'NGGAK BISA DIBIKIN ULANG', size: 62 }, { s: 'versi komik', size: 34, font: 'Archivo' }]],
  [KE.L10 - .6, DUR, [{ s: 'TULIS DI KOMEN!', size: 80, ink: T.red }, { s: 'Marvel Talk', size: 34, font: 'Archivo' }]],
];
LABELS.forEach(([a]) => ev(a, 'label'));

// ---------------------------------------------------------------- render ----
const SHOTS = [s1, s2, s3, s4, s5, s6, s7, s8, s9, s10];
const _present = pop.present;
pop.present = (fx) => {
  const t = window.__t ?? 0;
  screen(() => {
    for (const [a, b, lines] of LABELS) { const p = labP(t, a, b); if (p > 0) label(lines, p, { out: labOut(t, b) }); }
    caption(t);
  });
  _present(fx);
};
window.EV = EV.filter((e) => typeof e === 'object').sort((p, q) => p.t - q.t);
window.render = (t) => { window.__t = t; SHOTS[shotOf(t)](t); };
window.TEXTS = () => pop.reads.slice();
window.READY = true;
