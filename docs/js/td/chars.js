// Sprite pegawai pixel art top-down (chibi 16×22 piksel), digambar prosedural lalu di-cache.
// Tampilan tiap orang (kulit, rambut, baju) diambil dari LOOK di px/sprites.js supaya sama dengan versi lama.
// Arah: S (menghadap kamera/bawah), N (membelakangi), E (kanan), W (cermin E).
import { LOOK } from '../px/sprites.js';

export const CW = 16, CH = 22, AX = 8, AY = 21;   // ukuran kanvas & titik kaki

const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const css = ([r, g, b]) => `rgb(${r | 0},${g | 0},${b | 0})`;
const mix = (h, k) => { const c = hex(h), t = k < 0 ? [36, 22, 63] : [255, 248, 230], a = Math.abs(k); return css(c.map((v, i) => v + (t[i] - v) * a)); };

const FORMAL_M = { top: '#1f2433', bot: '#1f2433', shoe: '#111014', sleeve: 'long', inner: '#f4f2ee', tie: '#7c3aed' };
const FORMAL_F = { top: '#f6f4ef', bot: '#1d1b26', skirt: 'short', shoe: '#111014', sleeve: 'long', collar: true, vest: '#2a2740' };
const FALLBACK = { g: 'm', skin: '#d1a380', hair: '#2a1d16', style: 'short', kerja: { top: '#6b4fd8', bot: '#2e3440', shoe: '#1d1d22', sleeve: 'short' } };

function palette(id, outfit, praying) {
  const L = LOOK[id] ?? FALLBACK;
  const o = outfit === 'formal' && !L.uniform ? (L.g === 'm' ? FORMAL_M : FORMAL_F) : L.kerja;
  const P = {
    g: L.g, style: L.style, skirt: L.g === 'f' ? o.skirt : null, sleeve: o.sleeve, collar: o.collar,
    skin: L.skin, skinD: mix(L.skin, -0.2), hair: L.hair, hairD: mix(L.hair, -0.35), hairL: mix(L.hair, 0.3),
    top: o.top, topD: mix(o.top, -0.28), topL: mix(o.top, 0.2), bot: o.bot, botD: mix(o.bot, -0.3), shoe: o.shoe,
    inner: o.inner ?? null, tie: o.tie ?? null, vest: o.vest ?? null, acc: L.kerja.acc && outfit !== 'formal' ? L.kerja.acc : null,
    eye: '#1d1420', pink: mix('#f08a8a', 0.25), mouth: '#b8645a', white: '#f6f4ee', whiteD: '#d9d6e4', black: '#1a1820',
    phone: '#22202c', glow: '#8cc8ff', broom: '#8b5e34', bristle: '#d6b260', cup: '#f3efe6', pad: '#3a3a46',
    peci: false, mukena: false,
  };
  if (praying && L.g === 'f') { P.mukena = true; P.top = P.bot = P.white; P.topD = P.botD = P.whiteD; P.skirt = 'long'; P.sleeve = 'long'; P.inner = P.tie = P.vest = P.acc = null; P.collar = false; }
  if (praying && L.g === 'm') P.peci = true;
  return P;
}

class G {
  constructor(w = CW, h = CH) { this.cv = document.createElement('canvas'); this.cv.width = w; this.cv.height = h; this.g = this.cv.getContext('2d'); }
  r(x, y, w, h, c) { if (!c) return; this.g.fillStyle = c; this.g.fillRect(x, y, w, h); }
  p(x, y, c) { this.r(x, y, 1, 1, c); }
}

// ---------------------------------------------------------------- kepala
function headS(g, P, hy, o) {
  if (P.mukena) {
    g.r(3, hy, 10, 12, P.white); g.r(2, hy + 3, 12, 8, P.white); g.r(4, hy + 11, 8, 2, P.whiteD);
    g.r(5, hy + 3, 6, 6, P.skin);
  } else {
    g.r(4, hy, 8, 1, P.hair); g.r(3, hy + 1, 10, 3, P.hair);
    g.r(4, hy + 3, 8, 6, P.skin); g.r(5, hy + 9, 6, 1, P.skin); g.r(5, hy + 9, 6, 1, P.skinD);
    g.r(4, hy + 3, 8, 1, P.hair); g.p(4, hy + 4, P.hair); g.p(11, hy + 4, P.hair); g.p(7, hy + 4, P.hair);
    g.p(5, hy + 1, P.hairL); g.p(6, hy + 1, P.hairL);
    const side = { long: 9, bob: 6, pony: 4, short: 3, short2: 3 }[P.style] ?? 3;
    g.r(3, hy + 3, 1, side, P.hair); g.r(12, hy + 3, 1, side, P.hair);
    if (P.style === 'bob') { g.r(2, hy + 2, 1, 6, P.hairD); g.r(13, hy + 2, 1, 6, P.hairD); }
    if (P.style === 'long') { g.r(2, hy + 4, 1, 8, P.hairD); g.r(13, hy + 4, 1, 8, P.hairD); }
    if (P.style === 'short2') { g.p(5, hy - 1, P.hair); g.p(8, hy - 1, P.hair); g.p(10, hy - 1, P.hair); }
    if (P.style === 'pony') { g.r(12, hy + 1, 2, 2, P.hairD); }
    if (P.peci) { g.r(4, hy - 1, 8, 3, P.black); g.r(4, hy + 1, 8, 1, '#3a3640'); }
  }
  // mata, pipi, mulut
  if (o.eyes === 'closed') { g.r(5, hy + 6, 2, 1, P.eye); g.r(9, hy + 6, 2, 1, P.eye); }
  else { g.r(6, hy + 5, 1, 2, P.eye); g.r(9, hy + 5, 1, 2, P.eye); g.p(6, hy + 5, '#fff'); g.p(9, hy + 5, '#fff'); g.r(6, hy + 6, 1, 1, P.eye); g.r(9, hy + 6, 1, 1, P.eye); }
  g.p(5, hy + 7, P.pink); g.p(10, hy + 7, P.pink);
  g.r(7, hy + 8, 2, 1, P.mouth);
}
function headN(g, P, hy) {
  if (P.mukena) { g.r(3, hy, 10, 12, P.white); g.r(2, hy + 3, 12, 8, P.white); g.r(3, hy + 9, 10, 4, P.whiteD); return; }
  g.r(4, hy, 8, 1, P.hair); g.r(3, hy + 1, 10, 8, P.hair); g.r(4, hy + 9, 8, 1, P.hairD);
  g.p(5, hy + 1, P.hairL); g.p(6, hy + 2, P.hairL);
  g.r(3, hy + 7, 10, 2, P.hairD);
  if (P.style === 'long') { g.r(3, hy + 9, 10, 4, P.hair); g.r(3, hy + 12, 10, 1, P.hairD); }
  if (P.style === 'bob') { g.r(2, hy + 2, 12, 6, P.hair); g.r(2, hy + 8, 12, 1, P.hairD); }
  if (P.style === 'pony') { g.r(7, hy + 8, 2, 5, P.hair); g.p(7, hy + 12, P.hairD); g.r(6, hy + 6, 4, 1, P.hairD); }
  if (P.style === 'short2') { g.p(5, hy - 1, P.hair); g.p(8, hy - 1, P.hair); g.p(10, hy - 1, P.hair); }
  if (P.peci) { g.r(4, hy - 1, 8, 3, P.black); }
  if (!P.mukena) g.r(6, hy + 9, 4, 1, P.skinD);
}
function headE(g, P, hy, o) {
  if (P.mukena) { g.r(4, hy, 9, 12, P.white); g.r(3, hy + 3, 10, 8, P.white); g.r(8, hy + 3, 4, 6, P.skin); g.r(10, hy + 5, 1, 2, P.eye); return; }
  g.r(5, hy, 7, 1, P.hair); g.r(4, hy + 1, 9, 3, P.hair);
  g.r(7, hy + 3, 5, 6, P.skin); g.r(8, hy + 9, 3, 1, P.skinD); g.p(12, hy + 6, P.skin);
  g.r(7, hy + 3, 5, 1, P.hair); g.p(11, hy + 4, P.hair);
  const back = { long: 10, bob: 6, pony: 5, short: 4, short2: 4 }[P.style] ?? 4;
  g.r(4, hy + 3, 3, back, P.hair); g.r(4, hy + 3 + back - 1, 3, 1, P.hairD);
  g.p(7, hy + 6, P.skinD);   // telinga
  if (P.style === 'pony') { g.r(2, hy + 3, 2, 6, P.hair); g.p(2, hy + 8, P.hairD); }
  if (P.style === 'short2') { g.p(6, hy - 1, P.hair); g.p(9, hy - 1, P.hair); }
  if (P.peci) g.r(5, hy - 1, 7, 3, P.black);
  if (o.eyes === 'closed') g.r(10, hy + 6, 2, 1, P.eye);
  else { g.r(10, hy + 5, 1, 2, P.eye); g.p(10, hy + 5, '#fff'); g.p(10, hy + 6, P.eye); }
  g.p(10, hy + 7, P.pink); g.p(11, hy + 8, P.mouth);
}

// ---------------------------------------------------------------- badan
function bodyFront(g, P, by, o, back) {
  g.r(4, by, 8, 6, P.top); g.r(11, by, 1, 6, P.topD); g.r(4, by + 5, 8, 1, P.topD);
  if (!back) {
    if (P.inner) g.r(7, by, 2, 3, P.inner);
    if (P.tie) g.r(7, by + 1, 1, 4, P.tie);
    if (P.collar) { g.p(6, by, P.white); g.p(9, by, P.white); }
    if (P.vest) { g.r(4, by, 2, 5, P.vest); g.r(10, by, 2, 5, P.vest); }
    if (P.acc) g.p(5, by + 2, P.acc);
  } else if (P.vest) g.r(4, by, 8, 5, P.vest);
  // lengan
  const arm = (x, dy) => {
    if (P.sleeve === 'long') g.r(x, by + dy, 1, 5, P.topD);
    else if (P.sleeve === 'short') { g.r(x, by + dy, 1, 2, P.topD); g.r(x, by + dy + 2, 1, 3, P.skin); }
    else g.r(x, by + dy, 1, 5, P.skin);
    g.p(x, by + dy + 5, P.skin);
  };
  if (o.arms === 'type' || o.arms === 'phone' || o.arms === 'game') {
    if (P.sleeve === 'long') { g.r(3, by, 1, 3, P.topD); g.r(12, by, 1, 3, P.topD); } else { g.r(3, by, 1, 3, P.skin); g.r(12, by, 1, 3, P.skin); }
    if (!back) {
      const k = o.f % 2;
      if (o.arms === 'phone') { g.r(6, by + 3, 4, 2, P.skin); g.r(7, by + 2, 2, 2, P.phone); g.p(7, by + 2, P.glow); }
      else if (o.arms === 'game') { g.r(5, by + 3, 6, 2, P.pad); g.p(5, by + 3, P.skin); g.p(10, by + 3, P.skin); }
      else { g.p(4, by + 3 + k, P.skin); g.p(11, by + 4 - k, P.skin); }
    }
  } else {
    const sw = o.swing ?? 0;
    arm(3, sw > 0 ? 1 : 0); arm(12, sw < 0 ? 1 : 0);
    if (o.arms === 'cup') g.r(12, by + 4, 2, 2, P.cup);
    if (o.arms === 'eat') g.r(9, by - 1, 2, 1, P.skin);
  }
}
function bodySide(g, P, by, o) {
  g.r(5, by, 6, 6, P.top); g.r(5, by, 1, 6, P.topD); g.r(5, by + 5, 6, 1, P.topD);
  if (P.vest) g.r(9, by, 2, 5, P.vest);
  if (P.tie) g.r(10, by + 1, 1, 3, P.tie);
  const sw = o.swing ?? 0;
  const ax = 7 + sw, sl = P.sleeve === 'long' ? P.topD : P.sleeve === 'short' ? null : P.skin;
  if (o.arms === 'type' || o.arms === 'phone' || o.arms === 'game') {
    g.r(8, by + 1, 3, 2, sl ?? P.topD); g.r(11, by + 2, 1, 1, P.skin);
    if (o.arms === 'phone') { g.r(11, by + 1, 1, 2, P.phone); g.p(11, by + 1, P.glow); }
    if (o.arms === 'game') g.r(11, by + 2, 2, 1, P.pad);
  } else {
    if (sl) g.r(ax, by + 1, 2, 4, sl); else { g.r(ax, by + 1, 2, 2, P.topD); g.r(ax, by + 3, 2, 2, P.skin); }
    g.r(ax, by + 5, 2, 1, P.skin);
    if (o.arms === 'cup') g.r(ax + 1, by + 4, 2, 2, P.cup);
  }
}
function legsFront(g, P, ly, o) {
  if (o.seat) {
    g.r(4, ly, 8, 1, P.botD); g.r(4, ly + 1, 8, 1, P.bot);
    if (P.skirt === 'short') { g.r(5, ly + 2, 2, 1, P.skin); g.r(9, ly + 2, 2, 1, P.skin); }
    g.r(5, ly + 2 + (P.skirt === 'short' ? 1 : 0), 2, 1, P.shoe); g.r(9, ly + 2 + (P.skirt === 'short' ? 1 : 0), 2, 1, P.shoe);
    return;
  }
  const f = o.f ?? 0, up = (side) => (f === 1 && side === 0) || (f === 3 && side === 1) ? 1 : 0;
  if (P.skirt === 'long') {
    g.r(4, ly, 8, 3, P.bot); g.r(4, ly + 2, 8, 1, P.botD);
    g.r(5, ly + 3 - up(0), 2, 1, P.shoe); g.r(9, ly + 3 - up(1), 2, 1, P.shoe);
    return;
  }
  if (P.skirt === 'short') { g.r(4, ly, 8, 2, P.bot); g.r(4, ly + 1, 8, 1, P.botD); }
  else { g.r(5, ly, 6, 1, P.bot); }
  for (const [s, x] of [[0, 5], [1, 9]]) {
    const u = up(s);
    const leg = P.skirt === 'short' ? P.skin : s ? P.botD : P.bot;
    if (P.skirt !== 'short') g.r(x, ly + 1 - u, 2, 2, leg);
    else g.r(x, ly + 2 - u, 2, 1, leg);
    g.r(x, ly + 3 - u, 2, 1, P.shoe);
  }
}
function legsSide(g, P, ly, o) {
  if (o.seat) {
    g.r(6, ly, 6, 2, P.bot); g.r(6, ly + 1, 6, 1, P.botD);
    g.r(10, ly + 2, 2, 1, P.skirt === 'short' ? P.skin : P.bot); g.r(10, ly + 3, 3, 1, P.shoe);
    return;
  }
  const f = o.f ?? 0;
  if (P.skirt === 'long') { g.r(5, ly, 6, 3, P.bot); g.r(5, ly + 2, 6, 1, P.botD); g.r(f % 2 ? 9 : 7, ly + 3, 3, 1, P.shoe); if (f % 2) g.r(4, ly + 3, 2, 1, P.shoe); return; }
  const legC = P.skirt === 'short' ? P.skin : P.bot;
  if (P.skirt === 'short') { g.r(5, ly, 6, 2, P.bot); }
  else g.r(6, ly, 4, 1, P.bot);
  const y0 = P.skirt === 'short' ? ly + 2 : ly + 1, h = P.skirt === 'short' ? 1 : 2;
  if (f === 1 || f === 3) {
    const a = f === 1 ? P.botD : legC, b = f === 1 ? legC : P.botD;
    g.r(4, y0, 2, h, P.skirt === 'short' ? P.skin : a); g.r(3, ly + 3, 3, 1, P.shoe);
    g.r(9, y0, 2, h, P.skirt === 'short' ? P.skin : b); g.r(10, ly + 3, 3, 1, P.shoe);
  } else {
    g.r(6, y0, 4, h, legC); g.r(6, ly + 3, 5, 1, P.shoe);
  }
}

// ---------------------------------------------------------------- satu pose
function drawPose(P, pose, dir, f, v) {
  const g = new G();
  const seat = ['type', 'talk', 'phone', 'game', 'bench', 'eat', 'beanbag'].includes(pose) || (pose === 'pray' && v === 'duduk');
  const walk = pose === 'walk';
  const bob = walk && (f === 1 || f === 3) ? -1 : 0;
  const hy = 1 + bob + (seat ? 2 : 0);
  const by = hy + 10, ly = by + 6;
  const o = {
    f, seat, eyes: v === 'sleepy' ? 'closed' : 'open',
    swing: walk ? (f === 1 ? 1 : f === 3 ? -1 : 0) : 0,
    arms: pose === 'type' ? 'type' : pose === 'phone' ? 'phone' : pose === 'game' ? 'game' : pose === 'drink' ? 'cup' : pose === 'eat' && f >= 2 ? 'eat' : 'down',
  };
  if (pose === 'pray') {
    if (v === 'sujud') {   // sujud: badan membungkuk, dari belakang kelihatan punggung + telapak kaki
      g.r(3, 13, 10, 6, P.top); g.r(4, 12, 8, 1, P.top); g.r(3, 18, 10, 1, P.topD);
      g.r(4, 19, 3, 2, P.bot); g.r(9, 19, 3, 2, P.bot); g.r(5, 20, 2, 1, P.skinD); g.r(9, 20, 2, 1, P.skinD);
      if (P.peci) g.r(6, 10, 4, 2, P.black);
      return g.cv;
    }
    if (v === 'ruku') {   // ruku: kepala turun sejajar punggung
      bodyFront(g, P, 12, o, true); legsFront(g, P, 18, { f: 0 });
      headN(g, P, 7);
      return g.cv;
    }
    dir = 'N';
  }
  if (dir === 'S') { headS(g, P, hy, o); bodyFront(g, P, by, o, false); legsFront(g, P, ly, o); }
  else if (dir === 'N') { bodyFront(g, P, by, o, true); legsFront(g, P, ly, o); headN(g, P, hy); }
  else { legsSide(g, P, ly, o); bodySide(g, P, by, o); headE(g, P, hy, o); }
  if (pose === 'sweep') {   // sapu
    g.r(13, 8, 1, 11, P.broom); g.r(12, 18, 4, 3, P.bristle); g.r(12, 20, 4, 1, mix('#d6b260', -0.3));
  }
  return g.cv;
}

// tiduran (kursi berjemur): sprite S diputar 90°
function lying(P) {
  const src = drawPose(P, 'stand', 'S', 0, 'sleepy');
  const c = document.createElement('canvas'); c.width = CH; c.height = CW;
  const g = c.getContext('2d');
  g.translate(0, CW); g.rotate(-Math.PI / 2); g.drawImage(src, 0, 0);
  return c;
}
// berenang: kepala + bahu saja, riak air di sekeliling
function swimming(P, f) {
  const src = drawPose(P, 'stand', f % 2 ? 'E' : 'S', 0, '');
  const g = new G(CW, 16);
  g.g.drawImage(src, 0, 0, CW, 13, 0, 2, CW, 13);
  g.r(0, 13, 16, 3, 'rgba(0,0,0,0)');
  g.g.clearRect(0, 13, 16, 3);
  g.r(1 + (f % 2), 13, 14, 1, 'rgba(255,255,255,0.85)'); g.r(3, 14, 10, 1, 'rgba(190,240,255,0.7)');
  return g.cv;
}

const cache = new Map();
// → { cv, w, h, ax, ay } ; pose & varian sama dengan versi lama (pixoffice.js)
export function tdSprite(id, outfit, pose, dir, f = 0, v = '') {
  const praying = pose === 'pray';
  const key = `${id}|${outfit}|${pose}|${dir}|${f}|${v}`;
  let s = cache.get(key);
  if (s) return s;
  const P = palette(id, outfit, praying);
  let cv, ax = AX, ay = AY;
  if (pose === 'lie') { cv = lying(P); ax = CH / 2; ay = CW - 2; }
  else if (pose === 'swim') { cv = swimming(P, f); ay = 14; }
  else {
    const d = dir === 'W' ? 'E' : dir;
    cv = drawPose(P, pose, d, f, v);
    if (dir === 'W') {
      const m = document.createElement('canvas'); m.width = CW; m.height = CH;
      const g = m.getContext('2d'); g.translate(CW, 0); g.scale(-1, 1); g.drawImage(cv, 0, 0);
      cv = m;
    }
  }
  s = { cv, w: cv.width, h: cv.height, ax, ay };
  cache.set(key, s);
  return s;
}
