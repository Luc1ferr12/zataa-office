// Kapal Hantu Ourang Medan — Shadow Puppetry film for Zaa Story (1080×1920, 24 fps)
// Dyed hide puppets multiplied onto a lit cloth; lamp count is the mood. Front layer: placard, frame, backstage.
import { makeGL } from './gl.js';
import { canvas, piece, drawPiece, DYE, fill, cut, cutLine, ink, poly, smooth, within, lattice, coin, waves, strata, scalesOpen, beadLine, cloud, flameTongue, cutTaper, rivet } from './carve.js';
import { silhouette, fistHand, pinchHand, lampBody, flame as lampFlame, smoke } from './backstage.js';
import { clamp, lerp, seg, ss, eio, eo, ei, vnoise, hash, mulberry } from '/core/lib.js';

const W = 1080, H = 1920, TAU = Math.PI * 2;
const [trc, tr] = canvas(W, H), [frc, fr] = canvas(W, H);
let GL;
const E = (t, a, b) => ss(seg(t, a, b));

// ------------------------------------------------------------------ timeline
export const K = {
  S1: 0, S2: 5.0, S3: 14.6, S4: 19.9, S5: 29.8, S7: 38.0, S7b: 42.8, S8: 49.4, END: 54.6,
  L1: .6, L2: 5.4, L3: 14.9, L4: 20.3, L5: 30.2, L6: 38.1, L7: 43.2, L8: 50.2,
  lift: 4.4, fire: 31.2, boom: 35.3, still0: 34.75, sink: 36.0, back: 42.8, snuff: 49.4,
};
export let DUR = 59.6;
const VO = [
  ['L1', 'Pesan terakhirnya cuma dua kata: "Saya… mati."', 'mitos'],
  ['L2', 'Konon, akhir 1940-an, kapal dagang Ourang Medan mengirim sinyal darurat di perairan Selat Malaka.', 'mitos'],
  ['L3', '"Semua perwira, termasuk kapten, tewas. Mungkin seluruh awak."', 'mitos'],
  ['L4', 'Kapal penolong datang. Di dek, para awak terbaring dengan mata terbuka, menatap matahari. Tanpa satu luka pun.', 'mitos'],
  ['L5', 'Lalu dari dalam palka, api menyala. Kapal itu meledak, dan tenggelam.', 'mitos'],
  ['L6', 'Ada yang menduga, kapal itu menyelundupkan muatan beracun.', 'teori'],
  ['L7', 'Tapi anehnya, nama Ourang Medan tidak pernah ditemukan di daftar kapal mana pun.', 'fakta'],
  ['L8', 'Jadi, siapa yang sebenarnya mengirim pesan itu?', 'misteri'],
];
export const SUBS = [];
export let EV = [];

// ------------------------------------------------------------------ helpers
const camM = ([cx, cy, z], mir = 1) => [z * mir, 0, 0, z, W / 2 - cx * z * mir, H / 2 - cy * z];
const setT = (g, C) => g.setTransform(C[0], C[1], C[2], C[3], C[4], C[5]);
function put(g, C, p, x, y, rot = 0, sx = 1, sy = sx) {   // draw piece p with its pivot at world (x,y)
  setT(g, C); g.translate(x, y); g.rotate(rot); g.scale(sx, sy); drawPiece(g, p);
}
const trem = (t, s, a = 1) => [(vnoise(t * 1.1 + s) - .5) * 5 * a, (vnoise(t * .9 + s + 7) - .5) * 4 * a, (vnoise(t * .8 + s + 13) - .5) * .03 * a];
const step12 = t => Math.floor(t * 12) / 12;

// ------------------------------------------------------------------ pieces
const PC = {};
function build() {
  // dark cover over the whole cloth with one carved signal hole (opening & ending)
  PC.cover = piece([-600, -1000, 600, 1000], g => {
    fill(g, '#2b1a12', q => q.rect(-600, -1000, 1200, 2000));
    cut(g, q => { q.arc(0, -40, 26, 0, TAU); });
    for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; cutTaper(g, [[Math.cos(a) * 40, -40 + Math.sin(a) * 40], [Math.cos(a) * 70, -40 + Math.sin(a) * 70]], 7); }
    ink(g, 3, q => q.arc(0, -40, 30, 0, TAU));
  }, { seed: 1 });
  // title plaque "SAYA MATI": dark hide, letters cut through so they glow
  PC.title = piece([-400, -110, 400, 110], g => {
    fill(g, '#3a2116', q => smooth(g === q ? q : q, [[-380, -90], [380, -90], [395, 0], [380, 90], [-380, 90], [-395, 0]]));
    g.save(); g.globalCompositeOperation = 'destination-out'; g.font = '700 118px "Cormorant Garamond"'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.letterSpacing = '14px'; g.fillStyle = '#000'; g.fillText('SAYA MATI', 0, 6); g.restore();
    ink(g, 3, q => poly(q, [[-360, -74], [360, -74], [372, 0], [360, 74], [-360, 74], [-372, 0]]));
    beadLine(g, -330, -60, 330, -60, 3, 18); beadLine(g, -330, 62, 330, 62, 3, 18);
  }, { seed: 2 });
  // ---------------- the ship (profile, bow to the left), split in two halves for the explosion
  const shipDraw = (g) => {
    // masts & rigging (ink, dark so thin things read)
    ink(g, 9, q => { q.moveTo(-270, -60); q.lineTo(-262, -470); q.moveTo(250, -60); q.lineTo(242, -430); });
    ink(g, 2.4, q => { q.moveTo(-262, -470); q.lineTo(-395, -95); q.moveTo(-262, -470); q.lineTo(30, -320); q.lineTo(242, -430); q.lineTo(372, -85); q.moveTo(-262, -400); q.lineTo(-300, -400); q.moveTo(242, -370); q.lineTo(205, -370); });
    // funnel
    fill(g, DYE.crim, q => poly(q, [[10, -160], [14, -330], [80, -330], [84, -160]]));
    cutLine(g, 7, q => { q.moveTo(12, -290); q.lineTo(82, -290); }); cutLine(g, 4, q => { q.moveTo(13, -305); q.lineTo(81, -305); });
    ink(g, 2, q => poly(q, [[10, -160], [14, -330], [80, -330], [84, -160]]));
    // superstructure + bridge
    fill(g, DYE.hide2, q => poly(q, [[-170, -60], [-160, -165], [140, -165], [150, -60]]));
    fill(g, DYE.hide, q => poly(q, [[-130, -165], [-120, -235], [-10, -235], [0, -165]]));
    for (let x = -150; x < 130; x += 34) cut(g, q => q.rect(x, -140, 20, 26));
    for (let x = -112; x < -10; x += 26) cut(g, q => q.rect(x, -222, 16, 30));
    ink(g, 2, q => { poly(q, [[-170, -60], [-160, -165], [140, -165], [150, -60]]); poly(q, [[-130, -165], [-120, -235], [-10, -235], [0, -165]]); });
    // hull
    const hull = [[-398, -100], [-345, -60], [345, -60], [378, -90], [362, 0], [320, 70], [-305, 70], [-365, 10]];
    fill(g, '#5b3420', q => poly(q, hull));
    within(g, q => poly(q, hull), () => { strata(g, -400, 400, x => -60, 5, 22, 3); lattice(g, -340, -50, 340, -34, 12, 2.4); });
    for (let x = -300; x <= 300; x += 48) coin(g, x, -6, 11);
    ink(g, 2.4, q => poly(q, hull));
    // rails along the deck
    beadLine(g, -330, -70, 330, -70, 2.6, 14);
  };
  const half = (side) => piece([-420, -490, 420, 90], g => {
    g.save(); g.beginPath();
    const crack = [[20, -500], [-8, -320], [26, -200], [-14, -90], [18, 0], [-6, 95]];
    if (side < 0) { g.moveTo(-500, -500); for (const p of crack) g.lineTo(...p); g.lineTo(-500, 95); }
    else { g.moveTo(500, -500); for (const p of crack) g.lineTo(...p); g.lineTo(500, 95); }
    g.closePath(); g.clip(); shipDraw(g); g.restore();
  }, { seed: side < 0 ? 3 : 4 });
  PC.ship = piece([-420, -490, 420, 90], shipDraw, { seed: 5 });
  PC.bow = half(-1); PC.stern = half(1);
  // funnel smoke, three swapped states
  PC.smoke = [0, 1, 2].map(k => piece([-160, -260, 160, 20], g => {
    const r = mulberry(20 + k);
    for (let i = 0; i < 4; i++) { const x = -40 - i * 40 + r() * 20, y = -40 - i * 52, rr = 30 + i * 8 + r() * 8;
      fill(g, '#6b5040', q => { q.arc(x, y, rr, 0, TAU); });
      cloud(g, x, y, rr * .7, r() * 6, 2.2, k % 2 ? 1 : -1); }
  }, { seed: 30 + k }));
  // water strips
  const waterP = (col, seed, amp) => piece([-800, -40, 800, 520], g => {
    const top = []; for (let x = -800; x <= 800; x += 40) top.push([x, Math.sin(x * .012 + seed) * amp]);
    fill(g, col, q => { q.moveTo(-800, 520); for (const p of top) q.lineTo(...p); q.lineTo(800, 520); q.closePath(); });
    within(g, q => { q.moveTo(-800, 520); for (const p of top) q.lineTo(...p); q.lineTo(800, 520); q.closePath(); }, () => waves(g, -800, 30, 800, 520, 14, 2.4));
    ink(g, 2.4, q => { q.moveTo(...top[0]); for (const p of top) q.lineTo(...p); });
  }, { seed });
  PC.waterB = waterP(DYE.teal, 6, 10); PC.waterF = waterP(DYE.blue, 7, 14);
  PC.moon = piece([-90, -90, 90, 90], g => { fill(g, DYE.hide, q => { q.arc(0, 0, 80, 0, TAU); q.arc(26, -14, 70, 0, TAU); }); ink(g, 2, q => q.arc(0, 0, 80, 0, TAU)); for (let k = 0; k < 5; k++) beadLine(g, -60, -40 + k * 20, -36, -40 + k * 20, 2.5, 10); }, { seed: 8 });
  // ---------------- radio room
  PC.desk = piece([-420, -40, 420, 340], g => { fill(g, DYE.brown, q => poly(q, [[-420, -30], [420, -30], [420, 0], [360, 0], [350, 330], [310, 330], [300, 0], [-300, 0], [-310, 330], [-350, 330], [-360, 0], [-420, 0]])); strata(g, -420, 420, x => -30, 1, 14, 3); lattice(g, -280, 60, 280, 300, 18, 3); ink(g, 2, q => poly(q, [[-420, -30], [420, -30], [420, 0], [-420, 0]])); }, { seed: 9 });
  PC.radio = piece([-180, -260, 180, 0], g => { fill(g, DYE.ink, q => q.rect(-170, -250, 340, 250)); fill(g, DYE.hide2, q => q.rect(-150, -230, 300, 210));
    for (const [x, y, r] of [[-90, -170, 30], [0, -170, 30], [90, -170, 30], [-90, -80, 18], [90, -80, 18]]) { cut(g, q => q.arc(x, y, r, 0, TAU)); ink(g, 2.4, q => { q.moveTo(x, y); q.lineTo(x + r * .8, y - r * .5); }); }
    lattice(g, -60, -110, 60, -40, 10, 2); ink(g, 2.4, q => q.rect(-150, -230, 300, 210)); }, { seed: 10 });
  PC.key = piece([-70, -40, 70, 10], g => { fill(g, DYE.ink, q => q.rect(-70, -10, 140, 18)); fill(g, DYE.gold, q => poly(q, [[-50, -14], [40, -26], [44, -18], [-50, -6]])); cut(g, q => q.arc(40, -30, 9, 0, TAU)); }, { seed: 11 });
  PC.lampR = piece([-60, -140, 60, 10], g => { fill(g, DYE.ink, q => q.rect(-8, -100, 16, 100)); fill(g, DYE.yellow, q => poly(q, [[-55, -100], [55, -100], [30, -140], [-30, -140]])); lattice(g, -40, -132, 40, -104, 10, 2); fill(g, DYE.ink, q => q.rect(-40, -6, 80, 12)); }, { seed: 12 });
  // operator puppet (profile facing left): torso, head with open-cut face, headphones, upper arm, forearm+hand
  PC.opTorso = piece([-90, -20, 110, 300], g => { fill(g, DYE.jade, q => smooth(q, [[-60, 0], [70, -10], [100, 120], [80, 290], [-70, 290], [-80, 120]])); scalesOpen(g, -50, 30, 70, 250, 10); fill(g, DYE.white, q => poly(q, [[-40, 0], [20, -6], [-10, 60]])); ink(g, 2.4, q => smooth(q, [[-60, 0], [70, -10], [100, 120], [80, 290], [-70, 290], [-80, 120]])); }, { seed: 13 });
  PC.opHead = piece([-110, -230, 100, 20], g => {
    const head = [[-80, -40], [-96, -95], [-70, -160], [-10, -200], [60, -185], [85, -120], [70, -50], [30, 0], [-40, 6]];
    fill(g, DYE.skin, q => smooth(q, head));
    cut(g, q => smooth(q, [[-60, -60], [-74, -100], [-54, -146], [-10, -170], [30, -150], [36, -90], [10, -40], [-30, -30]]));     // open-cut face
    ink(g, 3.4, q => { q.moveTo(-74, -112); q.quadraticCurveTo(-58, -120, -40, -112); });                         // brow
    ink(g, 3, q => { q.moveTo(-70, -96); q.lineTo(-52, -96); });                                                     // eye
    ink(g, 3, q => { q.moveTo(-86, -90); q.lineTo(-96, -66); q.lineTo(-80, -62); });                                 // nose
    fill(g, DYE.ink, q => smooth(q, [[-60, -170], [-10, -205], [60, -190], [88, -130], [70, -100], [40, -150], [-20, -168]]));   // hair
    fill(g, DYE.ink, q => { q.ellipse(30, -100, 26, 34, 0, 0, TAU); });                                             // headphone cup
    ink(g, 9, q => { q.arc(10, -110, 80, -2.3, -.1); });                                                             // headband
    ink(g, 2.4, q => smooth(q, head));
  }, { seed: 14 });
  PC.opArm1 = piece([-24, -24, 24, 150], g => { fill(g, DYE.teal, q => smooth(q, [[-22, -10], [22, -14], [20, 140], [-18, 140]])); lattice(g, -16, 10, 16, 120, 10, 2); ink(g, 2, q => smooth(q, [[-22, -10], [22, -14], [20, 140], [-18, 140]])); }, { seed: 15 });
  PC.opArm2 = piece([-20, -20, 30, 170], g => { fill(g, DYE.teal, q => smooth(q, [[-18, -10], [18, -10], [16, 110], [-16, 110]])); fill(g, DYE.skin, q => smooth(q, [[-16, 108], [18, 106], [28, 150], [6, 166], [-14, 140]])); ink(g, 2, q => smooth(q, [[-18, -10], [18, -10], [16, 110], [-16, 110]])); }, { seed: 16 });
  // Morse paper tape (the message, carved dots & dashes)
  PC.tape = piece([-480, -26, 480, 26], g => { fill(g, DYE.hide2, q => q.rect(-480, -22, 960, 44));
    const code = '... .- -.-- .-   -- .- - ..'; let x = -440;
    for (const ch of code) { if (ch === '.') { cut(g, q => q.arc(x, 0, 7, 0, TAU)); x += 26; } else if (ch === '-') { cut(g, q => q.rect(x - 7, -6, 34, 12)); x += 48; } else x += 26; }
    ink(g, 2, q => q.rect(-480, -22, 960, 44)); }, { seed: 17 });
  // ---------------- the deck of the dead
  PC.deck = piece([-700, -30, 700, 260], g => { fill(g, DYE.brown, q => q.rect(-700, 0, 1400, 260)); strata(g, -700, 700, x => 0, 6, 34, 3.5); ink(g, 2.4, q => { q.moveTo(-700, 0); q.lineTo(700, 0); }); }, { seed: 18 });
  PC.rail = piece([-700, -140, 700, 10], g => { fill(g, '#4a2a18', q => { q.rect(-700, -130, 1400, 14); for (let x = -690; x < 700; x += 70) q.rect(x, -130, 10, 132); }); lattice(g, -690, -110, 690, -10, 22, 3); }, { seed: 19 });
  PC.sun = piece([-230, -230, 230, 230], g => {
    fill(g, DYE.yellow, q => q.arc(0, 0, 120, 0, TAU));
    for (let k = 0; k < 16; k++) { g.save(); g.rotate(k / 16 * TAU); fill(g, DYE.orange, q => { q.translate(0, -128); flameTongue(q, 92, 34, k % 2 ? 1 : -1); }); g.restore(); }
    for (let r = 30; r < 110; r += 22) cutLine(g, 4, q => q.arc(0, 0, r, 0, TAU));
    coin(g, 0, 0, 16); ink(g, 2.4, q => q.arc(0, 0, 120, 0, TAU));
  }, { seed: 20 });
  // lying sailor: profile on his back, face up (open-cut), arms stiff towards the sky
  PC.dead = piece([-270, -200, 270, 70], g => {
    // on his back, head to the left, face turned up to the sun (open-cut face), one stiff arm reaching up
    fill(g, '#2a3a5a', q => smooth(q, [[70, -24], [240, -18], [244, 14], [80, 22]]));                   // legs
    fill(g, DYE.ink, q => poly(q, [[226, -26], [252, -46], [260, 16], [232, 18]]));                     // boots
    fill(g, DYE.jade, q => smooth(q, [[-140, -26], [90, -30], [104, 20], [-140, 30]]));                 // torso
    scalesOpen(g, -120, -16, 70, 22, 9);
    fill(g, DYE.teal, q => poly(q, [[-70, -22], [-96, -130], [-72, -136], [-44, -24]]));              // arm reaching up
    fill(g, DYE.skin, q => smooth(q, [[-104, -128], [-96, -160], [-74, -164], [-66, -136]]));         // open hand
    cutLine(g, 2.5, q => { q.moveTo(-96, -150); q.lineTo(-100, -170); q.moveTo(-86, -156); q.lineTo(-88, -178); q.moveTo(-76, -156); q.lineTo(-74, -176); });
    fill(g, DYE.ink, q => smooth(q, [[-150, 10], [-196, 30], [-236, 14], [-232, -10], [-196, 4]]));     // hair, under the head
    const head = [[-150, -30], [-170, -62], [-212, -66], [-240, -40], [-236, 0], [-200, 14], [-160, 8]];
    fill(g, DYE.skin, q => smooth(q, head));
    cut(g, q => smooth(q, [[-162, -32], [-176, -54], [-210, -56], [-226, -36], [-216, -12], [-178, -10]]));   // open-cut face
    ink(g, 3.4, q => { q.moveTo(-212, -50); q.lineTo(-206, -70); });                                      // nose (pointing up)
    ink(g, 2.6, q => { q.moveTo(-188, -44); q.arc(-192, -44, 6, 0, TAU); });                             // eye, wide open
    ink(g, 3, q => { q.moveTo(-226, -26); q.lineTo(-232, -12); });                                       // mouth
    ink(g, 2.4, q => { smooth(q, [[-140, -26], [90, -30], [104, 20], [-140, 30]]); smooth(q, head); });
  }, { seed: 21 });
  PC.dog = piece([-130, -60, 130, 30], g => { fill(g, DYE.hide2, q => smooth(q, [[-120, 0], [-90, -40], [60, -36], [110, -46], [126, -20], [90, 0], [60, 20], [-100, 20]])); ink(g, 2, q => { q.moveTo(80, -30); q.arc(96, -30, 5, 0, TAU); }); cutLine(g, 3, q => { q.moveTo(-70, -10); q.lineTo(40, -14); }); ink(g, 2.4, q => smooth(q, [[-120, 0], [-90, -40], [60, -36], [110, -46], [126, -20], [90, 0], [60, 20], [-100, 20]])); }, { seed: 22 });
  // ---------------- fire: flame groups swapped at 12 fps
  PC.fire = [0, 1, 2].map(k => piece([-260, -420, 260, 20], g => {
    const r = mulberry(40 + k);
    for (let i = 0; i < 9; i++) { const x = -200 + i * 50 + (r() - .5) * 26, h = 170 + r() * 220, w = 60 + r() * 40;
      g.save(); g.translate(x, 0); fill(g, i % 3 ? DYE.orange : DYE.yellow, q => flameTongue(q, h, w, (i + k) % 2 ? 1 : -1)); g.restore();
      g.save(); g.translate(x, -10); cutLine(g, 4, q => { q.moveTo(0, -20); q.quadraticCurveTo(10 * ((i + k) % 2 ? 1 : -1), -h * .4, 0, -h * .65); }); g.restore(); }
  }, { seed: 50 + k }));
  PC.burst = piece([-420, -420, 420, 420], g => { for (let k = 0; k < 14; k++) { g.save(); g.rotate(k / 14 * TAU + .1); fill(g, k % 2 ? DYE.orange : DYE.yellow, q => { q.translate(0, -60); flameTongue(q, 300 + (k % 3) * 60, 110, k % 2 ? 1 : -1); }); g.restore(); } fill(g, DYE.yellow, q => q.arc(0, 0, 90, 0, TAU)); coin(g, 0, 0, 40); }, { seed: 60 });
  PC.smokeD = [0, 1, 2].map(k => piece([-200, -360, 200, 20], g => { const r = mulberry(70 + k); for (let i = 0; i < 5; i++) { const x = (r() - .5) * 160, y = -40 - i * 64, rr = 40 + i * 10; fill(g, '#3e2a20', q => q.arc(x, y, rr, 0, TAU)); cloud(g, x, y, rr * .6, r() * 6, 2.4, (i + k) % 2 ? 1 : -1); } }, { seed: 72 + k }));
  // ---------------- theory: the cargo hold (barrels + dark wisps)
  PC.barrel = piece([-80, -120, 80, 120], g => { fill(g, '#6a3c22', q => smooth(q, [[-62, -110], [62, -110], [76, 0], [62, 110], [-62, 110], [-76, 0]])); for (const y of [-70, 0, 70]) ink(g, 8, q => { q.moveTo(-74, y); q.lineTo(74, y); }); strata(g, -60, 60, x => -110, 1, 0, 0); for (let x = -40; x <= 40; x += 26) cutLine(g, 3, q => { q.moveTo(x, -96); q.lineTo(x, 96); }); ink(g, 2.4, q => smooth(q, [[-62, -110], [62, -110], [76, 0], [62, 110], [-62, 110], [-76, 0]])); }, { seed: 80 });
  PC.wisp = [0, 1, 2].map(k => piece([-120, -320, 120, 10], g => { const pts = []; for (let i = 0; i <= 12; i++) { const u = i / 12; pts.push([Math.sin(u * 6 + k * 2) * 40 * u, -u * 300]); } ink(g, 24 - k * 4, q => smooth(q, pts, false), '#2a2418'); for (let i = 1; i < 12; i += 2) cutLine(g, 3, q => q.arc(pts[i][0], pts[i][1], 6, 0, TAU)); }, { seed: 90 + k }));
  // ---------------- end card plaque
  PC.endPlaque = piece([-420, -120, 420, 120], g => {
    fill(g, '#3a2116', q => smooth(q, [[-400, -100], [400, -100], [416, 0], [400, 100], [-400, 100], [-416, 0]]));
    g.save(); g.globalCompositeOperation = 'destination-out'; g.font = '700 104px "Cormorant Garamond"'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.letterSpacing = '16px'; g.fillStyle = '#000'; g.fillText('ZAA STORY', 0, 4); g.restore();
    beadLine(g, -350, -74, 350, -74, 3, 18); beadLine(g, -350, 78, 350, 78, 3, 18);
  }, { seed: 99 });
}

// ------------------------------------------------------------------ lamps (world coords behind the cloth)
function flick(t, k) { return 1 + .07 * (vnoise(t * 7 + k * 13) - .5) * 2 + .03 * Math.sin(t * 23 + k); }
const MORSE = '... .- -.-- .-   -- .- - ..';
function morseOn(t, t0) {   // 1 while a dot/dash is "on"
  let x = t - t0; if (x < 0) return 0; const unit = .12;
  for (const ch of MORSE + '      ') { const d = ch === '.' ? 1 : ch === '-' ? 3 : 0; if (d) { if (x < d * unit) return 1; x -= d * unit; } x -= unit * (ch === ' ' ? 2 : 1); if (x < 0) return 0; }
  return 0;
}
const LAMPS = [[540, 860], [260, 520], [820, 520], [200, 1260], [880, 1260], [540, 300], [540, 1500]];
function lampsAt(t) {
  let n = 1, base = 1;
  if (t < K.S2) { base = .55 + .9 * morseOn(t, .2); n = 1; }
  else if (t < K.S3) n = 2;
  else if (t < K.S4) { n = 2; base = .8 + .35 * morseOn(t, K.S3 + .3); }
  else if (t < K.S5) n = 3;
  else if (t < K.still0) n = 3 + Math.floor(4 * E(t, K.fire, K.still0 - .2));
  else if (t < K.boom) n = 7;
  else if (t < K.S7) { n = Math.max(1, Math.round(lerp(7, 1, E(t, K.boom + .4, K.S7 - .3)))); base = t < K.boom + .3 ? 2.2 : 1; }
  else if (t < K.S8) n = 2;
  else { n = 1; base = t < K.snuff + .5 ? 1 - .7 * E(t, K.snuff, K.snuff + .5) + .15 * Math.sin(t * 60) * (1 - E(t, K.snuff, K.snuff + .5)) : .32 + .9 * morseOn(t, K.snuff + 1.2); }
  return LAMPS.slice(0, n).map(([x, y], k) => [x, y, base * flick(t, k), .95]);
}

// ------------------------------------------------------------------ shots (draw on tr in world coords through C)
function waterAt(g, C, t, y, front = true) {
  const b = Math.sin(t * .9) * 8;
  put(g, C, PC.waterB, 540 + Math.sin(t * .5) * 30, y - 30 + b);
  if (front) put(g, C, PC.waterF, 540 - Math.sin(t * .6) * 40, y + 10 - b);
}
function shipAt(g, C, t, x, y, rot = 0) {
  const [dx, dy, dr] = trem(t, 1);
  const bob = Math.sin(t * 1.1) * 6, roll = Math.sin(t * .8) * .025;
  put(g, C, PC.ship, x + dx, y + dy + bob, rot + roll + dr);
  const sk = Math.floor(t * 12) % 3;
  put(g, C, PC.smoke[sk], x + dx + 40, y + dy + bob - 330, roll);
}
const SHOTS = [
  { id: 'signal', t0: K.S1, t1: K.S2, cam: t => [540, 960 - 30 * E(t, 0, 5), 1 + .08 * E(t, 0, 5)], draw(g, C, t) {
      const a = E(t, 1.4, 2.0) * (1 - E(t, 3.9, 4.4));
      g.save(); if (a > 0) { setT(g, C); g.beginPath(); g.rect(-500, -500, 2080, 2920); g.rect(150, 1080, 780, 200); g.clip('evenodd'); }
      put(g, C, PC.cover, 540, 960 - 2000 * ei(seg(t, K.lift, K.S2))); g.restore();
      if (a > 0) { const s = lerp(1.6, 1, eo(seg(t, 1.4, 1.9))), [dx, dy, dr] = trem(t, 2, 1.4); g.globalAlpha = a; put(g, C, PC.title, 540 + dx, 1180 + dy, dr, s); g.globalAlpha = 1; }
    } },
  { id: 'sea', t0: K.S2, t1: K.S3, cam: t => [lerp(470, 610, E(t, K.S2, K.S3)), 1000, 1.0], draw(g, C, t) {
      put(g, C, PC.moon, 830, 420);
      const x = lerp(900, 380, E(t, K.S2 - .5, K.S3 + 2));
      waterAt(g, C, t, 1290, false);
      shipAt(g, C, t, x, 1250);
      put(g, C, PC.waterF, 540 - Math.sin(t * .6) * 40, 1300 - Math.sin(t * .9) * 8);
    } },
  { id: 'radio', t0: K.S3, t1: K.S4, cam: t => [560, 1000, lerp(1.0, 1.1, E(t, K.S3, K.S4))], draw(g, C, t) {
      put(g, C, PC.lampR, 840, 900);
      put(g, C, PC.radio, 760, 1000);
      put(g, C, PC.desk, 540, 1030);
      const tap = morseOn(t, K.S3 + .3);
      const [dx, dy, dr] = trem(t, 3);
      const sx = 420 + dx, sy = 760 + dy;
      put(g, C, PC.opTorso, sx, sy, dr);
      put(g, C, PC.opArm1, sx - 30, sy + 30, .95 + dr);
      const ex = sx - 30 - Math.sin(.95) * 120, ey = sy + 30 + Math.cos(.95) * 120;
      put(g, C, PC.opArm2, ex, ey, -1.25 + tap * .12);
      put(g, C, PC.opHead, sx + 4, sy + 6, -.12 + dr * 1.5 + tap * .02);
      put(g, C, PC.key, 300, 1022, 0, 1, 1);
      setT(g, C); rivet(g, sx - 30, sy + 30, 4); rivet(g, ex, ey, 4); rivet(g, sx + 4, sy + 6, 4);
      // the message comes out on a paper tape, letter by letter
      const u = E(t, K.S3 + .3, K.S4 - .4);
      g.save(); setT(g, C); g.beginPath(); g.rect(40, 1180, 1000 * u, 120); g.clip(); put(g, C, PC.tape, 540, 1240, 0, 1.05, 1.6); g.restore();
    } },
  { id: 'dead', t0: K.S4, t1: K.S5, cam: t => { const zz = t > K.S4 + 4.2 ? lerp(1.0, 1.45, eo(seg(t, K.S4 + 4.2, K.S4 + 4.42))) : 1; return [zz > 1 ? 380 : 540, zz > 1 ? 1080 : 1050, zz]; }, draw(g, C, t) {
      const press = eo(seg(t, K.S4, K.S4 + .6)), s = lerp(1.5, 1, press);
      g.globalAlpha = press; put(g, C, PC.sun, 540, 470, step12(t) * .05, s); g.globalAlpha = 1;
      put(g, C, PC.rail, 540, 1100);
      put(g, C, PC.deck, 540, 1330);
      [[580, 1110, 0], [560, 1225, 1], [520, 1335, 2]].forEach(([x, y, k], i) => {
        const a = E(t, K.S4 + .5 + i * .5, K.S4 + 1.0 + i * .5); if (a <= 0) return;
        const [dx, dy, dr] = trem(t, 10 + k, .5); g.globalAlpha = a; put(g, C, PC.dead, x + dx, y + dy, dr, (k === 1 ? -1 : 1) * lerp(1.9, 1.45, a), lerp(1.9, 1.45, a)); g.globalAlpha = 1;
      });
      const da = E(t, K.S4 + 6, K.S4 + 6.5); if (da > 0) { g.globalAlpha = da; put(g, C, PC.dog, 860, 1350); g.globalAlpha = 1; }
    } },
  { id: 'fire', t0: K.S5, t1: K.S7, cam: t => { const [sx, sy] = shake(t, K.boom, 14, .5); return [540 + sx, 1080 + sy - 140 * E(t, K.sink, K.S7), 1]; }, draw(g, C, t) {
      const x = 540, y = 1250, sk = Math.floor(t * 12) % 3;
      waterAt(g, C, t, 1290, false);
      if (t < K.boom) {
        shipAt(g, C, t, x, y);
        const f = E(t, K.fire, K.still0); if (f > 0) { put(g, C, PC.smokeD[sk], 520, y - 170 - 120 * f, 0, .6 + .5 * f); put(g, C, PC.fire[sk], 520, y - 70, 0, .4 + .7 * f, .3 + .8 * f); }
      } else {
        const u = seg(t, K.boom, K.boom + 1.0), sinkU = ei(seg(t, K.sink, K.S7 - .2)), dy = sinkU * 520;
        put(g, C, PC.bow, x - 60 * eo(u), y + dy + 30 * u, -.32 * eo(u) - .2 * sinkU);
        put(g, C, PC.stern, x + 70 * eo(u), y + dy + 40 * u, .38 * eo(u) + .25 * sinkU);
        if (t < K.boom + 1.4) { const b = seg(t, K.boom, K.boom + 1.4); g.globalAlpha = 1 - b; put(g, C, PC.burst, x, y - 160, step12(t), lerp(.5, 1.6, eo(b))); g.globalAlpha = 1; }
        put(g, C, PC.fire[sk], x, y - 40 + dy, 0, .9 * (1 - sinkU), .9 * (1 - sinkU));
        put(g, C, PC.smokeD[sk], x - 40, y - 260 - 140 * u, 0, 1.2);
      }
      put(g, C, PC.waterF, 540 - Math.sin(t * .6) * 40, 1300 - Math.sin(t * .9) * 8);
    } },
  { id: 'theory', t0: K.S7, t1: K.S7b, cam: t => [540, 1080, lerp(1.08, 1.0, E(t, K.S7, K.S7b))], draw(g, C, t) {
      const sk = Math.floor(t * 12) % 3;
      for (let i = 0; i < 4; i++) { const a = E(t, K.S7 + .2 + i * .25, K.S7 + .6 + i * .25); g.globalAlpha = a; put(g, C, PC.barrel, 250 + i * 190, 1320 - (i % 2) * 20, (i % 2 ? .05 : -.04), lerp(1.3, 1, a)); g.globalAlpha = 1; }
      const w = E(t, K.L6 + 1.2, K.L6 + 2.2);
      if (w > 0) for (let i = 0; i < 4; i++) { g.globalAlpha = w; put(g, C, PC.wisp[(sk + i) % 3], 250 + i * 190, 1210, 0, 1, .6 + .6 * w); g.globalAlpha = 1; }
      put(g, C, PC.deck, 540, 1440);
    } },
  { id: 'back', t0: K.S7b, t1: K.S8, back: true, cam: t => [540, 1060, .82], draw(g, C, t) {
      shipAt(g, C, t, 540, 1180, 0);
      put(g, C, PC.waterF, 540, 1260);
    } },
  { id: 'end', t0: K.S8, t1: 1e9, cam: t => [540, 960, lerp(1.0, .78, eio(seg(t, K.S8, K.END)))], draw(g, C, t) {
      const a = E(t, K.END, K.END + .6);
      g.save(); if (a > 0) { setT(g, C); g.beginPath(); g.rect(-500, -500, 2080, 2920); g.rect(110, 1110, 860, 260); g.clip('evenodd'); }
      put(g, C, PC.cover, 540, 960); g.restore(); if (a > 0) { const [dx, dy, dr] = trem(t, 5); g.globalAlpha = a; put(g, C, PC.endPlaque, 540 + dx, 1240 + dy, dr, lerp(1.5, 1, eo(seg(t, K.END, K.END + .5)))); g.globalAlpha = 1; }
    } },
];
function shake(t, t0, amp, d) { const u = seg(t, t0, t0 + d); if (u <= 0 || u >= 1) return [0, 0]; const k = Math.floor(t * 24); return [(hash(k) - .5) * 2 * amp * (1 - u), (hash(k + 9) - .5) * 2 * amp * (1 - u)]; }

// ------------------------------------------------------------------ front layer: placard, stage frame, backstage
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
const SUB_FONT = '600 50px "Cormorant Garamond"', SUB_LH = 58;
function wrap(g, text, maxW) { const out = []; let cur = ''; for (const w of text.split(' ')) { const s = cur ? cur + ' ' + w : w; if (g.measureText(s).width > maxW && cur) { out.push(cur); cur = w; } else cur = s; } if (cur) out.push(cur); return out; }
const SUB_Y = 1410;
function placard(g, text, label, a, slide) {
  if (!text || a <= 0) return;
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = a;
  g.font = SUB_FONT; const L = wrap(g, text, 820);
  const h = 56 + L.length * SUB_LH, w = 1000, x = 40, y = SUB_Y + slide * 18;
  g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 18; g.shadowOffsetY = 4;
  const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, 'rgba(46,22,14,.93)'); gr.addColorStop(1, 'rgba(22,10,7,.93)');
  g.fillStyle = gr; rr(g, x, y, w, h, 8); g.fill(); g.shadowColor = 'transparent';
  g.strokeStyle = 'rgba(168,129,63,.8)'; g.lineWidth = 1.6; rr(g, x + 7, y + 7, w - 14, h - 14, 4); g.stroke();
  // carved seal with the label (MITOS / TEORI / FAKTA / MISTERI)
  const sw = 150, sh = 40, sx = x + w - sw - 22, sy = y - sh / 2;
  g.fillStyle = label === 'fakta' ? '#2f6a3a' : label === 'teori' ? '#8a5a14' : '#9c2418'; rr(g, sx, sy, sw, sh, 4); g.fill();
  g.strokeStyle = 'rgba(255,220,190,.6)'; g.lineWidth = 1.2; rr(g, sx + 3, sy + 3, sw - 6, sh - 6, 2); g.stroke();
  g.font = '700 25px "Cormorant Garamond"'; g.letterSpacing = '4px'; g.fillStyle = '#f6dcc0'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label.toUpperCase(), sx + sw / 2 + 2, sy + sh / 2 + 1);
  g.letterSpacing = '0px'; g.font = SUB_FONT; g.fillStyle = '#f3e2bf';
  L.forEach((s, i) => g.fillText(s, W / 2, y + 30 + SUB_LH / 2 + i * SUB_LH));
  g.restore();
}
function brand(g, t) {
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.font = '600 30px "Cormorant Garamond"'; g.letterSpacing = '6px'; g.textAlign = 'center'; g.fillStyle = 'rgba(233,207,156,.75)'; g.fillText('ZAA STORY', W / 2, 108); g.restore();
}
function stageFrame(g, C, spill) {    // lacquered frame around the cloth, seen when the camera pulls back
  g.save(); setT(g, C);
  g.fillStyle = '#1a0806'; g.beginPath(); g.rect(-2000, -2000, 5080, 5920); g.rect(0, 0, W, H); g.fill('evenodd');
  g.strokeStyle = '#46140c'; g.lineWidth = 46; g.strokeRect(-23, -23, W + 46, H + 46);
  g.strokeStyle = '#8a6430'; g.lineWidth = 3; g.strokeRect(-40, -40, W + 80, H + 80);
  g.globalCompositeOperation = 'lighter'; const gr = g.createLinearGradient(0, H, 0, H + 160); gr.addColorStop(0, `rgba(255,170,90,${.3 * spill})`); gr.addColorStop(1, 'rgba(255,150,70,0)'); g.fillStyle = gr; g.fillRect(-40, H, W + 80, 160);
  g.restore();
}
function backstage(t, C) {
  // seen from behind: dark room around the cloth, the lamp, the puppeteer's hands holding the ship's rods
  const sr = [C[4] + C[0] * W, C[5], C[4], C[5] + C[3] * H];
  fr.save(); fr.setTransform(1, 0, 0, 1, 0, 0); fr.fillStyle = '#0d0705'; fr.beginPath(); fr.rect(0, 0, W, H); fr.rect(sr[0], sr[1], sr[2] - sr[0], sr[3] - sr[1]); fr.fill('evenodd');
  fr.strokeStyle = '#2a120a'; fr.lineWidth = 24; fr.strokeRect(sr[0], sr[1], sr[2] - sr[0], sr[3] - sr[1]); fr.restore();
  const lx = 540, ly = 470;
  silhouette(fr, g => lampBody(g, lx, ly, 1.1), { dir: [0, -1], k: 3, rimA: .55, rim: '#ffb766' });
  lampFlame(fr, lx, ly, 1.1, t, 1);
  // rods from the ship (viewport) to the hands
  const ship = [C[0] * 540 + C[4], C[3] * 1180 + C[5]];
  const sway = Math.sin(t * 1.3) * 10;
  const hA = [ship[0] - 250 + sway, 1330], hB = [ship[0] + 280 - sway, 1360];
  silhouette(fr, g => {
    const a = fistHand(g, [1.15, 0, 0, 1.15, hA[0], hA[1]]);
    const b = pinchHand(g, [1.1 * Math.cos(-.25), 1.1 * Math.sin(-.25), -1.1 * Math.sin(-.25), 1.1 * Math.cos(-.25), hB[0], hB[1]], .2);
    g.lineWidth = 6; g.beginPath(); g.moveTo(a.grip[0], a.grip[1]); g.lineTo(ship[0] - 120, ship[1] - 60); g.stroke();
    g.lineWidth = 4; g.beginPath(); g.moveTo(b.gripA[0], b.gripA[1]); g.lineTo(ship[0] + 140, ship[1] - 80); g.stroke();
  }, { dir: [0, 1], k: 5, rimA: .85 });
}

// ------------------------------------------------------------------ assembly
export async function init(glCanvas) {
  GL = makeGL(glCanvas);
  build();
  let DURS = {}; try { DURS = await (await fetch('out/vo/dur.json')).json(); } catch (e) { }
  for (let i = 0; i < VO.length; i++) {
    const [id, text, label] = VO[i], t0 = K[id], d = DURS[id] || 3, nxt = VO[i + 1];
    let t1 = t0 + Math.max(1.8, d + .6, text.length / 15 + 1.62);
    if (nxt) t1 = Math.min(t1, K[nxt[0]] - .1); else t1 = Math.min(t1, K.END - .1);
    SUBS.push({ id, t0, t1, text, label });
  }
  EV = [];
  for (const [id] of VO) EV.push({ t: K[id], type: 'vo', id });
  for (const s of SHOTS) if (s.t0 > 0) EV.push({ t: s.t0, type: 'cut', id: s.id });
  EV.push({ t: .2, type: 'morse', dur: K.lift - .2 }, { t: 1.4, type: 'press' }, { t: K.lift, type: 'lift' }, { t: K.S3 + .3, type: 'morse', dur: K.S4 - K.S3 - .5 });
  EV.push({ t: K.S4 + .1, type: 'press' }, { t: K.S4 + 4.2, type: 'crash' });
  for (let i = 0; i < 3; i++) EV.push({ t: K.S4 + .5 + i * .5, type: 'tap' });
  EV.push({ t: K.fire, type: 'fire', dur: K.boom - K.fire }, { t: K.still0, type: 'silence', dur: K.boom - K.still0 }, { t: K.boom, type: 'boom' }, { t: K.sink, type: 'sink', dur: K.S7 - K.sink });
  for (let i = 0; i < 4; i++) EV.push({ t: K.S7 + .2 + i * .25, type: 'tap' });
  EV.push({ t: K.back, type: 'back' }, { t: K.snuff, type: 'snuff' }, { t: K.snuff + 1.2, type: 'morse', dur: 3.2 }, { t: K.END, type: 'press' });
  EV.sort((a, b) => a.t - b.t);
}
function subAt(t) { for (const s of SUBS) if (t >= s.t0 && t < s.t1) return { s, a: Math.min(E(t, s.t0, s.t0 + .2), 1 - E(t, s.t1 - .25, s.t1)) }; return null; }
export function render(t) {
  const s = SHOTS.find(s => t >= s.t0 && t < s.t1) || SHOTS[SHOTS.length - 1];
  const cam = s.cam(t), mir = s.back ? -1 : 1;
  if (cam[2] >= 1) { cam[0] = clamp(cam[0], W / 2 / cam[2], W - W / 2 / cam[2]); cam[1] = clamp(cam[1], H / 2 / cam[2], H - H / 2 / cam[2]); }
  const C = camM(cam, mir);
  tr.setTransform(1, 0, 0, 1, 0, 0); tr.globalCompositeOperation = 'source-over'; tr.globalAlpha = 1; tr.fillStyle = '#fff'; tr.fillRect(0, 0, W, H);
  tr.globalCompositeOperation = 'multiply';
  s.draw(tr, C, t);
  tr.setTransform(1, 0, 0, 1, 0, 0); tr.globalCompositeOperation = 'source-over';
  fr.setTransform(1, 0, 0, 1, 0, 0); fr.clearRect(0, 0, W, H);
  if (s.back) backstage(t, C);
  else if (cam[2] < 1) stageFrame(fr, C, 1);
  if (!s.back) brand(fr, t);
  const sb = subAt(t); if (sb) placard(fr, sb.s.text, sb.s.label, sb.a, 1 - eo(seg(t, sb.s.t0, sb.s.t0 + .22)));
  if (t >= K.END) { fr.save(); fr.font = 'italic 600 40px "Cormorant Garamond"'; fr.textAlign = 'center'; fr.fillStyle = `rgba(243,226,191,${E(t, K.END + .4, K.END + .9)})`; fr.fillText('Ikuti untuk kisah misteri Nusantara berikutnya', W / 2, 1500); fr.restore(); }
  const L = lampsAt(t), nEff = L.reduce((a, l) => a + l[2], 0);
  const silent = t >= K.still0 && t < K.boom;
  const o = { cam: [cam[0], cam[1], cam[2]], mir, rect: [0, 0, W, H], lamps: L, sigB: 760, sigC: 130, amb: .3, time: t,
    expo: (s.back ? .85 : 1.15) / Math.sqrt(Math.max(1, nEff)) * (silent ? .55 : 1), haze: s.id === 'fire' && t > K.fire ? 3 * E(t, K.fire, K.still0) : 0,
    vign: .5, sat: 1.1, contrast: .15, bloom: .28 + .22 * clamp((nEff - 1) / 6, 0, 1), lcol: [1, .74, .42] };
  GL.render(trc, frc, o);
}
export function TEXTS(t) {
  const out = [], sb = subAt(t);
  if (sb) { fr.font = SUB_FONT; const L = wrap(fr, sb.s.text, 820); out.push({ id: sb.s.id, text: sb.s.text, x0: 40, y0: SUB_Y, x1: 1040, y1: SUB_Y + 56 + L.length * SUB_LH }); }
  if (t >= K.END) out.push({ id: 'end', text: 'ZAA STORY Ikuti untuk kisah misteri Nusantara berikutnya', x0: 60, y0: 1100, x1: 1020, y1: 1520 });
  if (t >= 1.4 && t < 4.4) out.push({ id: 'title', text: 'SAYA MATI', x0: 140, y0: 1070, x1: 940, y1: 1290 });
  return out;
}
