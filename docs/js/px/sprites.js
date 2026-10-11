// Sprite pixel pegawai, digambar prosedural (tanpa file gambar) lalu di-cache.
// Arah: S (menghadap kamera), N (membelakangi), E (kanan), W (cermin E).
import { hex, pack } from './engine.js';

const SW = 20, SH = 30, AX = 10, AY = 29; // kanvas sprite & titik kaki

// tampilan tiap pegawai (warna dari blender/characters.json)
const LOOK = {
  dir:        { g: 'f', skin: '#e6bd99', hair: '#7a4526', style: 'long', kerja: { top: '#f2efe9', bot: '#1c1f2b', skirt: 'short', shoe: '#3a2f2a', sleeve: 'short' } },
  researcher: { g: 'f', skin: '#e0b894', hair: '#3b2a22', style: 'bob',  kerja: { top: '#7a62c9', bot: '#3a3550', skirt: 'long', shoe: '#2a2630', sleeve: 'short' } },
  copywriter: { g: 'f', skin: '#dbad8a', hair: '#2b211c', style: 'long', kerja: { top: '#2f6b65', bot: '#d9d4c7', skirt: 'short', shoe: '#3a2f2a', sleeve: 'none', neck: true } },
  designer:   { g: 'f', skin: '#d9ad8a', hair: '#5a3d2e', style: 'pony', kerja: { top: '#e8b4c8', bot: '#40394f', skirt: 'long', shoe: '#2a2630', sleeve: 'short' } },
  video:      { g: 'm', skin: '#bd8f6b', hair: '#262222', style: 'short', kerja: { top: '#8a3b3b', bot: '#6b6450', shoe: '#2b2b2b', sleeve: 'short', collar: true } },
  publisher:  { g: 'm', skin: '#d1a380', hair: '#3d3430', style: 'short2', kerja: { top: '#5b6475', bot: '#2e3440', shoe: '#1d1d22', sleeve: 'long', inner: '#eeeae2' } },
  ads:        { g: 'f', skin: '#e3b593', hair: '#4a2c20', style: 'bob',  kerja: { top: '#0d9488', bot: '#f0ece2', skirt: 'short', shoe: '#3a2f2a', sleeve: 'long', collar: true } },
  owner:      { g: 'm', skin: '#cc9e7a', hair: '#1b1717', style: 'short', kerja: { top: '#17151d', bot: '#3b3f4a', shoe: '#e9e6df', sleeve: 'short', acc: '#d4a63a' } },
};
// Senin: jas (cowok), kemeja sekretaris + rok pensil (cewek)
const FORMAL_M = { top: '#1f2433', bot: '#1f2433', shoe: '#111014', sleeve: 'long', inner: '#f4f2ee', tie: '#7c3aed' };
const FORMAL_F = { top: '#f6f4ef', bot: '#1d1b26', skirt: 'short', shoe: '#111014', sleeve: 'long', collar: true, vest: '#2a2740' };

const SHADOW = hex('#24163f');
const tone = (h, k) => {
  const c = hex(h);
  const t = k < 0 ? SHADOW : [255, 248, 230];
  const a = Math.abs(k);
  return pack(c[0] + (t[0] - c[0]) * a, c[1] + (t[1] - c[1]) * a, c[2] + (t[2] - c[2]) * a);
};

function palette(id, outfit, praying) {
  const L = LOOK[id];
  const o = outfit === 'formal' ? (L.g === 'm' ? FORMAL_M : FORMAL_F) : L.kerja;
  const P = {
    g: L.g, style: L.style, skirt: L.g === 'f' ? o.skirt : null, sleeve: o.sleeve, collar: o.collar, neck: o.neck,
    skin: tone(L.skin, 0), skinD: tone(L.skin, -0.22), hair: tone(L.hair, 0), hairD: tone(L.hair, -0.3), hairL: tone(L.hair, 0.25),
    top: tone(o.top, 0), topD: tone(o.top, -0.25), topL: tone(o.top, 0.2), bot: tone(o.bot, 0), botD: tone(o.bot, -0.28),
    shoe: tone(o.shoe, 0), eye: pack(29, 20, 32), mouth: tone('#b8645a', 0), blush: tone(L.skin, -0.1),
    inner: o.inner ? tone(o.inner, 0) : null, tie: o.tie ? tone(o.tie, 0) : null, vest: o.vest ? tone(o.vest, 0) : null,
    acc: L.kerja.acc && outfit !== 'formal' ? tone(L.kerja.acc, 0) : null,
    white: pack(246, 244, 238), whiteD: tone('#d9d6e4', -0.05), black: pack(22, 20, 28), phone: pack(30, 28, 40), glow: pack(140, 200, 255),
    peci: false, mukena: false,
  };
  if (praying && L.g === 'f') {
    P.mukena = true;
    P.top = P.bot = P.white; P.topD = P.botD = P.whiteD; P.topL = P.white;
    P.skirt = 'long'; P.sleeve = 'long'; P.inner = P.tie = P.vest = P.acc = null; P.collar = false;
  }
  if (praying && L.g === 'm') P.peci = true;
  return P;
}

class Grid {
  constructor() { this.d = new Uint32Array(SW * SH); }
  p(x, y, c) { if (c == null) return; x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < SW && y < SH) this.d[y * SW + x] = c; }
  r(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.p(x + i, y + j, c); }
  clear(x, y) { if (x >= 0 && y >= 0 && x < SW && y < SH) this.d[y * SW + x] = 0; }
}

// ---------------------------------------------------------------- kepala
function headS(g, P, y) {
  if (P.mukena) {
    g.r(6, y, 8, 9, P.white); g.r(5, y + 3, 10, 6, P.white);
    g.r(8, y + 3, 4, 4, P.skin); g.p(8, y + 4, P.eye); g.p(11, y + 4, P.eye); g.r(6, y + 8, 8, 1, P.whiteD);
    return;
  }
  if (P.style === 'long') g.r(6, y + 2, 8, 9, P.hairD);
  if (P.style === 'bob') g.r(6, y + 2, 8, 6, P.hairD);
  g.r(7, y + 2, 6, 5, P.skin);
  g.p(7, y + 6, P.skinD); g.p(12, y + 6, P.skinD);
  g.r(7, y, 6, 2, P.hair); g.r(6, y + 1, 8, 1, P.hair);
  g.r(7, y + 2, 6, 1, P.hair);
  if (P.g === 'f') {
    g.p(7, y + 3, P.hair); g.p(12, y + 3, P.hair);
    const len = P.style === 'long' ? 7 : P.style === 'bob' ? 5 : 3;
    g.r(6, y + 2, 1, len, P.hair); g.r(13, y + 2, 1, len, P.hair);
    if (P.style === 'pony') g.r(9, y - 1, 2, 1, P.hairD);
    g.p(7, y + 5, P.blush); g.p(12, y + 5, P.blush);
  } else {
    g.p(6, y + 2, P.hair); g.p(13, y + 2, P.hair);
    if (P.style === 'short2') g.p(10, y + 2, P.skin);
  }
  g.p(8, y, P.hairL); g.p(9, y, P.hairL);
  g.p(8, y + 4, P.eye); g.p(11, y + 4, P.eye);
  g.p(9, y + 6, P.mouth); g.p(10, y + 6, P.mouth);
  if (P.peci) { g.r(7, y - 1, 6, 2, P.black); g.r(7, y + 1, 6, 1, P.black); }
}
function headN(g, P, y) {
  if (P.mukena) { g.r(6, y, 8, 9, P.white); g.r(5, y + 3, 10, 7, P.white); g.r(6, y + 9, 8, 1, P.whiteD); return; }
  g.r(7, y, 6, 7, P.hair); g.r(6, y + 1, 8, 5, P.hair);
  if (P.g === 'm') { g.r(8, y + 6, 4, 1, P.skinD); g.r(7, y + 5, 6, 1, P.hairD); }
  if (P.style === 'bob') g.r(6, y + 5, 8, 2, P.hairD);
  if (P.style === 'pony') { g.r(9, y + 5, 2, 5, P.hairD); g.p(9, y + 4, P.acc ?? P.hairL); }
  g.p(8, y + 1, P.hairL); g.p(9, y + 1, P.hairL);
  if (P.peci) g.r(7, y - 1, 6, 3, P.black);
}
function longBack(g, P, y) { // rambut panjang jatuh di punggung (digambar setelah badan)
  if (P.mukena) return;
  if (P.style === 'long') { g.r(7, y + 6, 6, 6, P.hair); g.r(8, y + 12, 4, 1, P.hairD); }
}
function headE(g, P, y) {
  if (P.mukena) {
    g.r(6, y, 7, 9, P.white); g.r(5, y + 3, 3, 7, P.white);
    g.r(10, y + 3, 3, 4, P.skin); g.p(11, y + 4, P.eye); g.p(13, y + 4, P.skin); g.r(6, y + 8, 7, 1, P.whiteD);
    return;
  }
  if (P.style === 'long') g.r(6, y + 2, 3, 10, P.hairD);
  if (P.style === 'bob') g.r(6, y + 2, 3, 5, P.hairD);
  if (P.style === 'pony') { g.r(5, y + 2, 2, 5, P.hairD); g.p(6, y + 1, P.hairD); }
  g.r(8, y + 1, 5, 6, P.skin);
  g.p(13, y + 4, P.skin);
  g.p(11, y + 4, P.eye);
  g.p(12, y + 6, P.mouth);
  g.p(9, y + 6, P.skinD);
  g.r(7, y, 5, 2, P.hair); g.r(7, y + 1, 2, P.g === 'f' ? 6 : 4, P.hair); g.p(12, y + 1, P.hair);
  if (P.g === 'f') g.r(10, y + 2, 3, 1, P.hair);
  g.p(9, y + 3, P.hair);
  g.p(9, y, P.hairL); g.p(10, y, P.hairL);
  if (P.peci) g.r(7, y - 1, 6, 2, P.black);
}

// ---------------------------------------------------------------- badan
const sleeveCol = (P) => (P.sleeve === 'none' ? P.skin : P.top);
function armS(g, P, x, y, len) {
  if (P.sleeve === 'long') { g.r(x, y, 1, len - 1, P.top); }
  else { g.p(x, y, sleeveCol(P)); g.r(x, y + 1, 1, len - 2, P.skin); }
  g.p(x, y + len - 1, P.skin);
}
function torsoS(g, P, y, arms, back = false) {
  g.r(9, y - 1, 2, 1, P.skinD);
  g.r(7, y, 6, 6, P.top); g.r(6, y, 8, 1, P.top);
  g.r(12, y + 1, 1, 5, P.topD);
  if (!back) {
    if (P.inner) { g.r(9, y, 2, 5, P.inner); if (P.tie) g.r(9, y + 1, 2, 4, P.tie); }
    if (P.vest) { g.r(7, y + 2, 2, 4, P.vest); g.r(11, y + 2, 2, 4, P.vest); }
    if (P.collar) { g.p(8, y, P.topL); g.p(11, y, P.topL); }
    if (P.neck) g.r(8, y - 1, 4, 1, P.top);
    if (P.acc) g.p(9, y + 1, P.acc);
  }
  if (!P.skirt && !P.mukena) g.r(7, y + 5, 6, 1, P.botD);
  // lengan
  const l = { down: [5, 5], swing1: [6, 4], swing3: [4, 6] }[arms];
  if (l) { armS(g, P, 6, y + 1, l[0]); armS(g, P, 13, y + 1, l[1]); return; }
  if (arms === 'phone' || arms === 'pad' || arms === 'chest') {
    g.r(6, y + 1, 1, 3, sleeveCol(P)); g.r(13, y + 1, 1, 3, sleeveCol(P));
    g.r(7, y + 3, 2, 1, sleeveCol(P)); g.r(11, y + 3, 2, 1, sleeveCol(P));
    if (back) return;
    if (arms === 'phone') { g.r(9, y + 2, 2, 2, P.phone); g.p(9, y + 2, P.glow); g.p(8, y + 3, P.skin); g.p(11, y + 3, P.skin); }
    else if (arms === 'pad') { g.r(8, y + 3, 4, 1, P.black); g.p(8, y + 3, P.skin); g.p(11, y + 3, P.skin); g.p(9, y + 3, pack(124, 58, 237)); }
    else g.r(8, y + 3, 4, 1, P.skin);
    return;
  }
  if (arms === 'up') { g.r(6, y - 7, 1, 8, sleeveCol(P)); g.r(13, y - 7, 1, 8, sleeveCol(P)); g.p(6, y - 8, P.skin); g.p(13, y - 8, P.skin); return; }
  if (arms === 'face') { armS(g, P, 6, y + 1, 5); g.r(13, y - 2, 1, 4, sleeveCol(P)); g.r(11, y - 4, 2, 2, P.skin); return; }
  if (arms === 'cup') { armS(g, P, 6, y + 1, 5); g.r(13, y + 1, 1, 2, sleeveCol(P)); g.r(12, y - 1, 1, 2, P.skin); g.r(11, y - 2, 2, 2, P.white); return; }
  if (arms === 'type') { g.r(6, y + 1, 1, 3, sleeveCol(P)); g.r(13, y + 1, 1, 3, sleeveCol(P)); return; }
  if (arms === 'type2') { g.r(5, y + 2, 2, 2, sleeveCol(P)); g.r(13, y + 1, 1, 3, sleeveCol(P)); return; }
  if (arms === 'type3') { g.r(6, y + 1, 1, 3, sleeveCol(P)); g.r(13, y + 2, 2, 2, sleeveCol(P)); return; }
  if (arms === 'gesture') { armS(g, P, 6, y + 1, 5); g.r(13, y + 1, 1, 2, sleeveCol(P)); g.r(14, y, 1, 2, P.skin); return; }
  armS(g, P, 6, y + 1, 5); armS(g, P, 13, y + 1, 5);
}
function legsS(g, P, y, mode) {
  const liftL = mode === 'walk1' ? 1 : 0, liftR = mode === 'walk3' ? 1 : 0;
  if (mode === 'sit') {
    if (P.skirt === 'long') { g.r(6, y, 8, 5, P.bot); g.r(6, y + 4, 8, 1, P.botD); g.r(7, y + 5, 2, 1, P.shoe); g.r(11, y + 5, 2, 1, P.shoe); return; }
    g.r(7, y, 6, 2, P.bot);
    const leg = P.skirt ? P.skin : P.bot;
    g.r(7, y + 2, 2, 3, leg); g.r(11, y + 2, 2, 3, leg);
    g.r(7, y + 5, 2, 1, P.shoe); g.r(11, y + 5, 2, 1, P.shoe);
    return;
  }
  if (mode === 'sitBack') { g.r(7, y, 6, 2, P.bot); g.r(7, y + 1, 6, 1, P.botD); return; }
  if (P.skirt === 'long') {
    const sway = mode === 'walk1' ? -1 : mode === 'walk3' ? 1 : 0;
    g.r(7, y, 6, 4, P.bot); g.r(6 + sway, y + 3, 8, 3, P.bot); g.r(6 + sway, y + 5, 8, 1, P.botD);
    g.r(7, y + 6 - liftL, 1, 1, P.skin); g.r(12, y + 6 - liftR, 1, 1, P.skin);
    g.r(7, y + 7 - liftL, 2, 1, P.shoe); g.r(11, y + 7 - liftR, 2, 1, P.shoe);
    return;
  }
  if (P.skirt === 'short') {
    g.r(7, y, 6, 3, P.bot); g.r(7, y + 2, 6, 1, P.botD);
    g.r(8, y + 3, 1, 4 - liftL, P.skin); g.r(11, y + 3, 1, 4 - liftR, P.skin);
    g.r(7, y + 7 - liftL, 2, 1, P.shoe); g.r(11, y + 7 - liftR, 2, 1, P.shoe);
    return;
  }
  g.r(7, y, 6, 1, P.bot);
  g.r(7, y, 3, 7 - liftL, P.bot); g.r(10, y, 3, 7 - liftR, P.bot);
  g.r(10, y + 1, 1, 6 - liftR, P.botD);
  g.r(7, y + 7 - liftL, 3, 1, P.shoe); g.r(10, y + 7 - liftR, 3, 1, P.shoe);
}
function torsoE(g, P, y, arms) {
  g.r(9, y - 1, 2, 1, P.skinD);
  g.r(8, y, 4, 6, P.top);
  g.r(8, y, 1, 6, P.topD);
  if (P.inner && !P.mukena) g.p(11, y, P.inner);
  if (P.vest) g.r(9, y + 2, 2, 4, P.vest);
  if (!P.skirt && !P.mukena) g.r(8, y + 5, 4, 1, P.botD);
  const sc = sleeveCol(P);
  const arm = (pts, hand) => { pts.forEach(([x, yy]) => g.p(x, y + yy, sc)); if (P.sleeve === 'short') g.p(pts[pts.length - 1][0], y + pts[pts.length - 1][1], P.skin); g.p(hand[0], y + hand[1], P.skin); };
  switch (arms) {
    case 'swing1': arm([[10, 1], [10, 2], [11, 3]], [12, 4]); break;
    case 'swing3': arm([[9, 1], [9, 2], [8, 3]], [7, 4]); break;
    case 'type': case 'type2': case 'type3': arm([[10, 1], [10, 2], [11, 3], [12, 3]], [13, arms === 'type2' ? 2 : 3]); break;
    case 'cup': arm([[10, 1], [10, 2], [11, 2]], [12, 1]); g.r(12, y - 1, 2, 2, P.white); break;
    case 'phone': case 'pad': arm([[10, 1], [10, 2], [11, 3]], [12, 3]); g.r(12, y + 2, 2, 1, arms === 'pad' ? P.black : P.phone); break;
    case 'chest': arm([[10, 1], [10, 2]], [11, 2]); break;
    case 'gesture': arm([[10, 1], [11, 2], [12, 2]], [13, 1]); break;
    default: arm([[9, 1], [9, 2], [9, 3]], [9, 4]); g.p(10, y + 1, sc); g.p(10, y + 2, sc);
  }
}
function legsE(g, P, y, mode) {
  const stride = mode === 'walk1' || mode === 'walk3';
  const leg = P.skirt === 'short' ? P.skin : P.bot;
  if (mode === 'sit') {
    if (P.skirt === 'long') { g.r(8, y, 6, 2, P.bot); g.r(12, y + 2, 2, 4, P.bot); g.r(12, y + 6, 3, 1, P.shoe); return; }
    if (P.skirt === 'short') g.r(8, y, 5, 2, P.bot); else g.r(8, y, 6, 2, P.bot);
    g.r(13, y + (P.skirt ? 0 : 2), 1, P.skirt ? 2 : 0, P.skin);
    g.r(12, y + 2, 2, 4, leg); g.r(12, y + 6, 3, 1, P.shoe);
    return;
  }
  if (mode === 'lowsit') { g.r(8, y, 7, 2, P.bot); g.r(14, y + 1, 2, 1, leg); g.r(15, y + 2, 2, 1, P.shoe); return; }
  if (P.skirt === 'long') {
    if (stride) { g.r(7, y, 6, 6, P.bot); g.r(6, y + 4, 8, 2, P.bot); g.r(6, y + 6, 2, 1, P.shoe); g.r(12, y + 6, 2, 1, P.shoe); }
    else { g.r(7, y, 5, 6, P.bot); g.r(7, y + 5, 5, 1, P.botD); g.r(8, y + 6, 4, 1, P.shoe); }
    return;
  }
  if (P.skirt === 'short') g.r(8, y, 5, 3, P.bot);
  const top = P.skirt === 'short' ? 3 : 0;
  if (!stride) {
    g.r(9, y + top, 2, 7 - top, leg); g.r(8, y + 7, 4, 1, P.shoe);
    if (!P.skirt) g.r(8, y, 4, 2, P.bot);
    return;
  }
  const back = mode === 'walk1' ? P.botD : P.bot, front = mode === 'walk1' ? P.bot : P.botD;
  const bc = P.skirt ? P.skinD : back, fc = P.skirt ? P.skin : front;
  if (!P.skirt) g.r(8, y, 4, 2, P.bot);
  g.r(8, y + Math.max(2, top), 2, 3 - Math.min(1, top), bc); g.r(7, y + 4, 2, 3, bc); g.r(5, y + 7, 3, 1, P.shoe);
  g.r(10, y + Math.max(2, top), 2, 3 - Math.min(1, top), fc); g.r(11, y + 4, 2, 3, fc); g.r(12, y + 7, 3, 1, P.shoe);
}

// ---------------------------------------------------------------- pose khusus
function drawLie(g, P) {
  const leg = P.skirt === 'short' ? P.skin : P.bot;
  g.r(7, 7, 2, 2, P.shoe); g.r(11, 7, 2, 2, P.shoe);
  g.r(7, 9, 2, 7, leg); g.r(11, 9, 2, 7, leg);
  if (P.skirt) g.r(7, 14, 6, 4, P.bot); else g.r(7, 13, 6, 5, P.bot);
  g.r(7, 18, 6, 6, P.top); g.r(6, 18, 1, 5, sleeveCol(P)); g.r(13, 18, 1, 5, sleeveCol(P)); g.p(6, 23, P.skin); g.p(13, 23, P.skin);
  g.r(7, 24, 6, 5, P.skin); g.r(6, 28, 8, 1, P.hair); g.r(6, 25, 1, 4, P.hair); g.r(13, 25, 1, 4, P.hair);
  if (P.style === 'long') g.r(5, 26, 10, 3, P.hairD);
  g.r(8, 25, 4, 1, P.black); g.p(9, 27, P.mouth);
}
function drawSwim(g, P, f) {
  // kepala & bahu di atas air, tangan mengayuh
  const y = 18;
  g.r(8, y + 7, 4, 3, P.skin); g.r(7, y + 8, 6, 2, P.skin);
  headE(g, { ...P, mukena: false, peci: false }, y);
  const strokes = [[[12, y + 6], [13, y + 5], [14, y + 4]], [[12, y + 7], [13, y + 7], [14, y + 7]], [[11, y + 8], [12, y + 9]], [[7, y + 6], [6, y + 5], [5, y + 4]]];
  strokes[f % 4].forEach(([x, yy]) => g.p(x, yy, P.skin));
  const foam = pack(230, 250, 255), foam2 = pack(150, 225, 245);
  for (let x = 4; x < 17; x++) g.p(x, y + 10, (x + f) % 3 ? foam2 : foam);
  g.p(3 + (f % 2), y + 9, foam); g.p(16 - (f % 2), y + 9, foam);
}
// sholat dilihat dari belakang (kiblat = dinding belakang)
function drawPray(g, P, phase) {
  const base = SH - 1;
  if (phase === 'qiyam' || phase === 'itidal') {
    const y = base - 21;
    headN(g, P, y); torsoS(g, P, y + 8, phase === 'qiyam' ? 'chest' : 'down', true); longBack(g, P, y);
    if (P.mukena) { g.r(5, y + 9, 10, 12, P.white); g.r(5, y + 20, 10, 1, P.whiteD); g.r(7, base, 2, 1, P.skinD); g.r(11, base, 2, 1, P.skinD); }
    else legsS(g, P, y + 14, 'stand');
    return;
  }
  if (phase === 'ruku') {
    const y = base - 21;
    if (P.mukena) { g.r(5, y + 12, 10, 9, P.white); g.r(5, y + 20, 10, 1, P.whiteD); g.r(6, y + 7, 8, 6, P.white); g.r(7, y + 5, 6, 3, P.whiteD); }
    else {
      legsS(g, P, y + 14, 'stand');
      g.r(7, y + 9, 6, 5, P.top); g.r(6, y + 10, 8, 3, P.top); g.r(7, y + 13, 6, 1, P.topD);
      g.r(8, y + 6, 4, 3, P.peci ? P.black : P.hair);
    }
    return;
  }
  if (phase === 'sujud') {
    const y = base - 9;
    if (P.mukena) { g.r(5, y + 2, 10, 8, P.white); g.r(6, y, 8, 3, P.whiteD); g.r(5, y + 9, 10, 1, P.whiteD); return; }
    g.r(7, base, 2, 1, P.shoe); g.r(11, base, 2, 1, P.shoe);
    g.r(7, y + 5, 6, 4, P.bot);
    g.r(7, y + 1, 6, 4, P.top); g.r(6, y + 2, 8, 2, P.top);
    g.r(8, y - 1, 4, 2, P.peci ? P.black : P.hair);
    return;
  }
  // duduk di antara dua sujud
  const y = base - 16;
  headN(g, P, y); torsoS(g, P, y + 8, 'down', true); longBack(g, P, y);
  if (P.mukena) { g.r(5, y + 10, 10, 7, P.white); g.r(5, base, 10, 1, P.whiteD); }
  else { g.r(6, y + 14, 8, 3, P.bot); g.r(6, base, 8, 1, P.botD); }
}

// ---------------------------------------------------------------- rakitan
function outline(g) {
  const o = pack(27, 18, 38);
  const src = g.d.slice();
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    if (src[y * SW + x]) continue;
    if ((x > 0 && src[y * SW + x - 1]) || (x < SW - 1 && src[y * SW + x + 1]) || (y > 0 && src[(y - 1) * SW + x]) || (y < SH - 1 && src[(y + 1) * SW + x])) g.d[y * SW + x] = o;
  }
}
function mirror(g) {
  const d = new Uint32Array(SW * SH);
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) d[y * SW + (SW - 1 - x)] = g.d[y * SW + x];
  // geser 1 px supaya titik kaki tetap di tengah
  g.d = new Uint32Array(SW * SH);
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW - 1; x++) g.d[y * SW + x] = d[y * SW + x + 1];
}

const SEATED = new Set(['type', 'talk', 'eat', 'phone', 'game', 'bench', 'beanbag']);
const ARMS = { type: 'type', talk: 'down', eat: 'cup', phone: 'phone', game: 'pad', bench: 'down', beanbag: 'phone', drink: 'cup', stand: 'down' };

const cache = new Map();
// f: frame animasi 0..3 ; v: varian (mood/fase sholat)
export function sprite(id, outfit, pose, dir, f = 0, v = '') {
  const key = `${id}|${outfit}|${pose}|${dir}|${f}|${v}`;
  let s = cache.get(key);
  if (s) return s;
  const praying = pose === 'pray';
  const P = palette(id, outfit, praying);
  const g = new Grid();
  let flat = false, lift = 0;
  const view = dir === 'W' ? 'E' : dir;
  if (pose === 'lie') { drawLie(g, P); flat = true; lift = 5; }
  else if (pose === 'swim') { drawSwim(g, P, f); if (dir === 'W') mirror(g); }
  else if (praying) drawPray(g, P, v || 'qiyam');
  else if (SEATED.has(pose)) {
    let arms = ARMS[pose];
    if (pose === 'type') arms = v === 'up' ? 'up' : v === 'face' ? 'face' : ['type', 'type2', 'type', 'type3'][f];
    if (pose === 'talk' && f === 2) arms = 'gesture';
    if (pose === 'eat' && f >= 2) arms = 'down';
    const low = pose === 'beanbag' ? 3 : 0;
    const y = SH - 1 - 19 + low + (v === 'sleepy' && f % 2 ? 1 : 0);
    if (view === 'S') { headS(g, P, y + (v === 'sleepy' ? 1 : 0)); torsoS(g, P, y + 8, arms); legsS(g, P, y + 14, 'sit'); }
    else if (view === 'N') { headN(g, P, y); torsoS(g, P, y + 8, arms, true); longBack(g, P, y); legsS(g, P, y + 14, 'sitBack'); }
    else { torsoE(g, P, y + 8, arms); headE(g, P, y); legsE(g, P, y + 14, low ? 'lowsit' : 'sit'); }
    if (view === 'E' && dir === 'W') mirror(g);
  } else {
    const walk = pose === 'walk';
    const legs = walk ? ['walk0', 'walk1', 'walk2', 'walk3'][f] : 'stand';
    const bob = walk && (f === 1 || f === 3) ? 1 : 0;
    const y = SH - 1 - 21 + bob;
    let arms = ARMS[pose] ?? 'down';
    if (walk) arms = f === 1 ? 'swing1' : f === 3 ? 'swing3' : 'down';
    if (view === 'S') { headS(g, P, y); torsoS(g, P, y + 8, arms); legsS(g, P, y + 14, legs); }
    else if (view === 'N') { headN(g, P, y); torsoS(g, P, y + 8, arms, true); longBack(g, P, y); legsS(g, P, y + 14, legs); }
    else { legsE(g, P, y + 14, legs); torsoE(g, P, y + 8, arms); headE(g, P, y); }
    if (view === 'E' && dir === 'W') mirror(g);
  }
  outline(g);
  s = { w: SW, h: SH, ax: AX, ay: AY, d: g.d, flat, lift };
  cache.set(key, s);
  return s;
}

// pelampung flamingo di kolam
let flamingo = null;
export function flamingoSprite() {
  if (flamingo) return flamingo;
  const g = new Grid();
  const pk = pack(244, 114, 182), pkD = pack(214, 74, 150), pkL = pack(251, 182, 214), bk = pack(30, 20, 30), yl = pack(250, 204, 21);
  g.r(4, 24, 12, 4, pk); g.r(3, 25, 14, 2, pk); g.r(6, 25, 8, 2, pack(70, 190, 220)); g.r(4, 27, 12, 1, pkD); g.r(5, 24, 10, 1, pkL);
  g.r(13, 17, 2, 8, pk); g.r(12, 15, 3, 3, pk); g.p(11, 16, yl); g.p(10, 16, bk); g.p(13, 16, bk);
  outline(g);
  flamingo = { w: SW, h: SH, ax: AX, ay: 27, d: g.d, flat: false, lift: 0 };
  return flamingo;
}
