// Kenapa Rel Kereta Pakai Kerikil — Brick Toy (1080×1920, 24 fps; bricks & people step at 12 fps, camera on ones)
// A brick railway on a real walnut desk, shot like macro toy photography. Units: 1 = one stud (8 mm).
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { makePost } from '/core/three/post.js';
import { clamp, seg, eio, eo, ei, ss, lerp, hash, mulberry } from '/core/lib.js';
import { COL, BRICK, PLATE, brick, plate, mesh, roundGeo, brickGeo, plastic } from './bricks.js';

const W = 1080, H = 1920, TAU = Math.PI * 2;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const q12 = t => Math.floor(t * 12) / 12;                       // stop-motion clock

// ------------------------------------------------------------------ narration timeline (same script as the pilot)
const LINES = [
  ['L1', 'Kenapa rel kereta selalu ditaruh di atas batu kerikil? Coba kita bikin sendiri.'],
  ['L2', 'Pertama, taruh aja relnya langsung di atas tanah. Beres!'],
  ['L3', 'Kereta lewat, beratnya ratusan ton… dan relnya amblas.'],
  ['L4', 'Oke, kasih bantalan kayu di bawahnya, biar bebannya nyebar.'],
  ['L5', 'Tapi pas hujan, airnya nggak ke mana-mana. Tanahnya jadi lumpur, bantalannya goyang, relnya miring!'],
  ['L6', 'Ya udah, cor beton aja! Kuat, rata, kece.'],
  ['L7', 'Kereta cepat memang pakai beton. Tapi kalau tanah di bawahnya turun, betonnya retak, dan benerinnya harus bongkar. Mahal!'],
  ['L8', 'Akhirnya, kita tabur batu kerikil yang tajam-tajam.'],
  ['L9', 'Air hujan langsung tembus. Batunya saling ngunci, bantalan nggak geser, getaran kereta juga diredam.'],
  ['L10', 'Relnya miring? Tinggal kerikilnya dipadatkan ulang. Murah, cepat.'],
  ['L11', 'Nah, kerikil ini namanya balas. Kelihatannya sepele, ternyata jenius!'],
];
const GAP = { L2: .7, L3: .65, L4: .7, L5: .65, L6: .7, L7: .7, L8: 1.1, L9: .65, L10: .65, L11: .7 };
export const K = {}; const DURS = {}; export let DUR = 50; export let EV = []; const SUBS = [];

// ------------------------------------------------------------------ renderer, post
let renderer, scene, camera, post;
const DIRT_TOP = BRICK;                 // the "ground" is a layer of brown bricks
const RAIL_X = 2;                       // rails at x = ±2 (gauge 4 studs), running along z
const Z0 = -54, Z1 = 22;                // track extent
const SEGL = 4;                         // rail segment length (1×4 plates)
const RAILS = [], SLEEPERS = [], SLAB = [], DIRT = [];
let GRAVEL = [], gravelMesh = [], RAIN, PUDDLE = [], TRAIN, PEOPLE = [], HELD;

function dirtColor(z, x) { return (Math.floor(z / 4) + Math.floor(x / 4)) % 3 === 0 ? '#7a4a28' : (Math.floor(z / 4) + Math.floor(x / 4)) % 3 === 1 ? '#6b3f22' : '#82532e'; }

async function buildSet() {
  const PH = '/core/assets/polyhaven/';
  const hdr = await new RGBELoader().loadAsync(PH + 'photo_studio_loft_hall_2k.hdr');
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = hdr; scene.background = hdr; scene.backgroundBlurriness = .5; scene.backgroundIntensity = .22; scene.environmentIntensity = .45;
  scene.environmentRotation.y = scene.backgroundRotation.y = 2.4;
  const tl = new THREE.TextureLoader(), tex = (f, srgb) => { const t = tl.load(PH + f); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3.5, 3.5); t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const desk = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshStandardMaterial({ map: tex('walnut_diff.jpg', true), normalMap: tex('walnut_nor.jpg'), roughnessMap: tex('walnut_rough.jpg'), roughness: 1 }));
  desk.rotation.x = -Math.PI / 2; desk.rotation.z = .4; desk.receiveShadow = true; scene.add(desk);
  const key = new THREE.DirectionalLight('#fff4e8', 3.0); key.position.set(60, 110, 40); key.target.position.set(0, 0, -10);
  key.castShadow = true; key.shadow.mapSize.set(4096, 4096); key.shadow.bias = -.0004; key.shadow.normalBias = .03; key.shadow.radius = 4;
  Object.assign(key.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 10, far: 400 }); scene.add(key, key.target);
  const fill = new THREE.DirectionalLight('#cfe0ff', .45); fill.position.set(-60, 40, -50); scene.add(fill);
  RectAreaLightUniformsLib.init();
  const box = (col, I, w, h, p, at) => { const l = new THREE.RectAreaLight(col, I, w, h); l.position.set(...p); l.lookAt(...at); scene.add(l); return l; };
  box('#fff6ee', 6, 70, 45, [50, 60, 55], [0, 4, -10]); box('#e4eeff', 9, 60, 30, [-45, 45, -80], [0, 6, -10]); box('#fff6ee', 4, 60, 40, [0, 75, -20], [0, 0, -20]);
  // real props far behind the track (blurred landscape): a teapot, a cup, a desk lamp
  const gl = new GLTFLoader(), M = 125, load = async n => (await gl.loadAsync(`${PH}${n}/${n}.gltf`)).scene;
  const tea = await load('tea_set_01');
  const keep = { tea_set_01_teapot_01: [-38, -105, .9], tea_set_01_teapot_01_lid: [-38, -105, .9], tea_set_01_cup_small_01: [34, -88, 2.0], tea_set_01_saucer_circular_04: [34, -88, 0] };
  const dead = []; tea.traverse(o => { if (!o.name.startsWith('tea_set_01_')) return; const k = keep[o.name]; if (!k) dead.push(o); else { o.position.set(k[0] / M, o.position.y + (o.name.includes('cup_small') ? .012 : 0), k[1] / M); o.rotation.y = k[2]; } });
  dead.forEach(o => o.parent.remove(o)); tea.scale.setScalar(M); scene.add(tea);
  const lamp = await load('desk_lamp_arm_01'); lamp.scale.setScalar(M); lamp.position.set(75, 0, -150); lamp.rotation.y = -.6; scene.add(lamp);
  for (const o of [tea, lamp]) o.traverse(m => { if (m.isMesh) m.castShadow = m.receiveShadow = true; });
}

// ------------------------------------------------------------------ track pieces
function buildTrack() {
  // ground: a strip of brown bricks (the "soil")
  for (let z = Z0; z < Z1; z += 4) for (const x of [-6, -2, 2, 6]) { const b = mesh(brickGeo(4, 4, BRICK, { tile: true }), dirtColor(z, x)); b.position.set(x, 0, z + 2); scene.add(b); DIRT.push(b); }
  // rails: 1×4 dark-grey plates with a tile on top, every segment its own piece (they sink, tilt and snap)
  for (const x of [-RAIL_X, RAIL_X]) for (let z = Z0; z < Z1; z += SEGL) {
    const g = new THREE.Group(); const p = plate(1, SEGL, COL.dgray); const top = mesh(brickGeo(1, SEGL, PLATE, { tile: true }), '#4a4d4b'); top.position.y = PLATE; g.add(p, top);
    g.userData = { x, z: z + SEGL / 2 }; scene.add(g); RAILS.push(g);
  }
  // sleepers: 6×1 reddish-brown bricks every 3 studs
  for (let z = Z0 + 1.5, i = 0; z < Z1; z += 3, i++) { const s = brick(6, 1, '#582a12'); s.userData = { z, i }; scene.add(s); SLEEPERS.push(s); }
  // concrete slab: two long light-grey tiles (it will crack in the middle)
  for (const [z0, z1] of [[Z0, -12], [-12, Z1]]) { const s = mesh(brickGeo(8, z1 - z0, BRICK * .66, { tile: true }), '#c9cac6'); s.userData = { z0, z1 }; scene.add(s); SLAB.push(s); }
  // gravel (ballast): instanced 1×1 round plates and 1×1 plates in greys and tan
  const R = mulberry(17), cols = ['#a0a5a9', '#6c6e68', '#8a8d8c', '#bfb8a6'], geos = [roundGeo(.5, PLATE), brickGeo(1, 1, PLATE), roundGeo(.5, BRICK * .66)];
  const pts = [];
  for (let z = Z0; z < Z1; z += .82) for (let x = -5.6; x <= 5.6; x += .82) {
    const edge = Math.max(0, Math.abs(x) - 3.4) / 2.2, h = 1.25 * (1 - edge) + .15;
    for (let y = 0; y < h; y += .42) pts.push({ x: x + (R() - .5) * .35, z: z + (R() - .5) * .35, y: DIRT_TOP + y + R() * .08, ry: R() * TAU, rx: (R() - .5) * .5, rz: (R() - .5) * .5, g: R() * 3 | 0, c: R() * 4 | 0, d: R(), xs: (R() - .5) * 8, zs: (R() - .5) * 8 });
  }
  GRAVEL = pts;
  for (let gi = 0; gi < 3; gi++) for (let ci = 0; ci < 4; ci++) {
    const list = pts.filter(p => p.g === gi && p.c === ci); if (!list.length) continue;
    const im = new THREE.InstancedMesh(geos[gi], plastic(cols[ci]), list.length); im.castShadow = im.receiveShadow = true; im.userData.list = list; scene.add(im); gravelMesh.push(im);
  }
  // rain drops & puddles: translucent blue round plates
  const rg = roundGeo(.5, PLATE);
  RAIN = new THREE.InstancedMesh(rg, plastic('#5ab4e6', { trans: true }), 160); scene.add(RAIN);
  for (let k = 0; k < 9; k++) { const p = mesh(brickGeo(2, 3, .12, { tile: true }), '#4aa3d8', { trans: true }); p.userData = { x: (k % 3 - 1) * 3.4 + (k % 2) * .6, z: -6 + Math.floor(k / 3) * 7 - (k % 3) * 1.3 }; scene.add(p); PUDDLE.push(p); }
}

// ------------------------------------------------------------------ the train (red & yellow brick locomotive + one wagon), length along z
function buildTrain() {
  const g = new THREE.Group();
  const add = (o, x, y, z) => { o.position.set(x, y, z); g.add(o); return o; };
  add(plate(5, 22, COL.black), 0, .9, 0);
  for (const z of [-8, -4, 4, 8]) for (const x of [-2.6, 2.6]) { const w = mesh(roundGeo(.9, .5), COL.black); w.rotation.z = Math.PI / 2; add(w, x + (x > 0 ? -.25 : .25), 1.0, z); }
  for (let i = 0; i < 3; i++) add(brick(5, 10, i === 1 ? COL.yellow : COL.red), 0, 1.3 + i * BRICK, -5);
  add(plate(5, 10, COL.white), 0, 1.3 + 3 * BRICK, -5);
  for (let i = 0; i < 2; i++) add(brick(5, 6, COL.red), 0, 1.3 + i * BRICK, 7);
  const cab = add(brick(5, 4, COL.red), 0, 1.3 + 2 * BRICK, 8); for (let i = 0; i < 1; i++) add(brick(5, 4, COL.red), 0, 1.3 + 3 * BRICK, 8);
  for (const x of [-2.45, 2.45]) { const w = mesh(brickGeo(.12, 2.4, 1.0, { tile: true }), '#9fd3f0', { trans: true }); add(w, x, 1.3 + 2.2 * BRICK, 8); }
  add(plate(5, 4, COL.black), 0, 1.3 + 4 * BRICK, 8);
  const lampL = add(mesh(roundGeo(.5, .3), '#fff6c8', { trans: true }), 0, 2.8, 10.9); lampL.rotation.x = Math.PI / 2;
  g.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  scene.add(g); TRAIN = g;
}

// ------------------------------------------------------------------ brick workers (built from bricks; hard hats)
function makeWorker(body, hat) {
  const root = new THREE.Group(), b = new THREE.Group(); root.add(b);
  const HIP = PLATE + 2 * BRICK, SH = HIP + PLATE + 2 * BRICK;
  const legs = [-.5, .5].map(x => { const g = new THREE.Group(); g.position.set(x, HIP, 0); b.add(g); for (let i = 0; i < 2; i++) { const k = brick(1, 1, '#1e3a6e'); k.position.y = -HIP + PLATE + i * BRICK; g.add(k); } const f = plate(1, 2, COL.black); f.position.set(0, -HIP, .3); g.add(f); return g; });
  const hp = plate(2, 2, COL.dgray); hp.position.y = HIP; b.add(hp);
  for (let i = 0; i < 2; i++) { const k = brick(2, 2, body); k.position.y = HIP + PLATE + i * BRICK; b.add(k); }
  const vest = mesh(brickGeo(2.06, .12, .5, { tile: true }), '#e8e8e0'); vest.position.set(0, HIP + PLATE + 1.2, 1.02); b.add(vest);   // reflective stripe
  const arms = [-1.5, 1.5].map(x => { const g = new THREE.Group(); g.position.set(x, SH - .1, 0); b.add(g); for (let i = 0; i < 3; i++) { const k = mesh(roundGeo(.5), body); k.position.y = -3 * BRICK + i * BRICK; g.add(k); } const hand = new THREE.Group(); hand.position.y = -3 * BRICK - .2; g.add(hand); return { g, hand }; });
  const col = plate(2, 2, COL.dgray); col.position.y = SH; b.add(col);
  const head = new THREE.Group(); head.position.set(0, SH + PLATE, 0); b.add(head);
  const h = mesh(roundGeo(1, BRICK * 1.6), COL.tan); head.add(h);
  const eye = new THREE.MeshStandardMaterial({ color: '#111', roughness: .3 });
  [-.38, .38].forEach(ex => { const e = new THREE.Mesh(new THREE.SphereGeometry(.15, 12, 10), eye); e.position.set(ex, BRICK * .95, .97); e.scale.z = .5; head.add(e); });
  const hatTop = mesh(roundGeo(1.05, BRICK * .7), hat); hatTop.position.y = BRICK * 1.45; hatTop.scale.set(1.12, 1, 1.12); head.add(hatTop);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.55, .18, 40), plastic(hat)); brim.position.y = BRICK * 1.5; head.add(brim);
  root.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  function pose(p) {
    root.position.set(p.x, DIRT_TOP + (p.y ?? 0), p.z); root.rotation.y = p.ry ?? 0;
    b.position.y = p.bob ?? 0; b.rotation.x = p.lean ?? 0; b.rotation.z = p.tiltB ?? 0;
    legs[0].rotation.x = p.legs?.[0] ?? 0; legs[1].rotation.x = p.legs?.[1] ?? 0;
    const aL = p.armL ?? [0, .06], aR = p.armR ?? [0, .06];
    arms[0].g.rotation.set(aL[0], 0, -aL[1]); arms[1].g.rotation.set(aR[0], 0, aR[1]);
    head.rotation.set(p.nod ?? 0, p.look ?? 0, p.tilt ?? 0);
  }
  scene.add(root); return { root, arms, pose, head };
}

// ------------------------------------------------------------------ state of the track over time
function phase(t) { return t < K.L4 ? 'dirt' : t < K.L6 ? 'sleep' : t < K.L8 + .2 ? 'slab' : 'gravel'; }
function trainZ(t) {
  if (t >= K.L3 - .2 && t < K.L4) return lerp(-95, 70, seg(t, K.L3, K.L3 + 5.0));
  if (t >= K.vib - .2 && t < K.vib + 4) return lerp(-95, 70, seg(t, K.vib, K.vib + 3.6));
  return 999;
}
function railBase(z, t) {          // y of the rail bottom at z
  const ph = phase(t), tz = trainZ(t);
  if (ph === 'dirt') { let y = DIRT_TOP; if (t > K.sink) { y -= .9 * Math.exp(-(((z - tz) / 9) ** 2)) * (tz < 60 ? 1 : 0) + .75 * ss(seg(t, K.sink, K.sink + 1.6)) * Math.exp(-(((z + 4) / 16) ** 2)); } return y; }
  if (ph === 'sleep') { const tl = ss(seg(t, K.tilt, K.tilt + 1.2)); return DIRT_TOP + BRICK - tl * .9 * clamp((z + 10) / 30, 0, 1); }
  if (ph === 'slab') { const cr = ss(seg(t, K.crack, K.crack + .6)); return DIRT_TOP + BRICK * .66 - cr * (z > -12 ? .7 + (z + 12) * .03 : 0); }
  let y = DIRT_TOP + 1.25 + BRICK;   // on sleepers on gravel
  if (t > K.tamp - 1.4 && t < K.tamp + 2.2) y -= ss(seg(t, K.tamp - 1.4, K.tamp - .6)) * (1 - ss(seg(t, K.tamp + .4, K.tamp + 1.8))) * .8 * clamp((z + 10) / 30, 0, 1);
  return y;
}
function railTilt(z, t) { return Math.atan2(railBase(z + 2, t) - railBase(z - 2, t), 4); }

function updateTrack(t) {
  const ph = phase(t), ts = q12(t);
  // rails: appear in L2 by snapping in from above, segment by segment
  RAILS.forEach((g, i) => {
    const k = Math.floor(i / 2) % 19 + (i % 2), tin = K.L2 + .2 + (Math.floor((g.userData.z - Z0) / SEGL)) * .07;
    const drop = ts < tin ? 1 : Math.max(0, 1 - (ts - tin) / .25);
    const z = g.userData.z, y = railBase(z, ts);
    g.visible = ts > tin - .4;
    g.position.set(g.userData.x, y + drop * 8 + (drop > 0 && drop < .15 ? -.1 : 0), z - SEGL / 2 + SEGL / 2); g.rotation.x = -railTilt(z, ts);
    g.children.forEach(c => c.position.z = 0);
  });
  // sleepers
  SLEEPERS.forEach((s, i) => {
    const z = s.userData.z; let vis = false, y = DIRT_TOP, rot = 0, drop = 0;
    if (ph === 'sleep') { const tin = K.L4 + .25 + i * .06; vis = ts > tin - .3; drop = ts < tin ? 1 : Math.max(0, 1 - (ts - tin) / .2);
      const tl = ss(seg(ts, K.tilt, K.tilt + 1.2)); y = DIRT_TOP - tl * .9 * clamp((z + 10) / 30, 0, 1); rot = .08 * Math.sin(i * 2.1 + ts * 9) * ss(seg(ts, K.rain + 1.2, K.tilt)) * (1 - ss(seg(ts, K.L6 - .6, K.L6))); }
    if (ph === 'gravel') { vis = true; y = railBase(z, ts) - BRICK; }
    s.visible = vis; s.position.set(0, y + drop * 10, z); s.rotation.set(-railTilt(z, ts), 0, rot);
  });
  // concrete slab
  SLAB.forEach((s, i) => { const { z0, z1 } = s.userData, vis = ph === 'slab'; s.visible = vis; if (!vis) return;
    const pop = ss(seg(ts, K.L6 + .15, K.L6 + .5)), cr = ss(seg(ts, K.crack, K.crack + .6));
    s.position.set(i ? cr * .25 : 0, DIRT_TOP + (1 - pop) * 12 - (i ? cr * .7 : 0), (z0 + z1) / 2 + (i ? cr * 1.1 : 0)); s.rotation.set(i ? -cr * .035 : 0, 0, i ? cr * .03 : 0); });
  // gravel: pours in during L8 (each stone falls from above at its own time, then rests)
  const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), e = new THREE.Euler(), sc = V(1, 1, 1), pos = V(0, 0, 0);
  for (const im of gravelMesh) { const list = im.userData.list; im.visible = ph === 'gravel'; if (!im.visible) continue;
    list.forEach((p, k) => { const t0 = K.gravel + p.d * 1.3 + (p.z - Z0) / (Z1 - Z0) * .5, u = clamp((ts - t0) / .35); const fall = 1 - u * u;
      const bounce = u >= 1 ? Math.max(0, .25 * Math.sin((ts - t0 - .35) * 18) * Math.exp(-(ts - t0 - .35) * 9)) : 0;
      const jig = ts > K.tamp && ts < K.tamp + 1.8 ? .08 * Math.sin(ts * 60 + k) : 0;
      pos.set(p.x + p.xs * fall * .3, p.y + fall * 26 + bounce + jig, p.z + p.zs * fall * .3); e.set(p.rx + fall * 3, p.ry, p.rz + fall * 2); qq.setFromEuler(e); sc.setScalar(ts < t0 ? 0 : 1);
      m4.compose(pos, qq, sc); im.setMatrixAt(k, m4); });
    im.instanceMatrix.needsUpdate = true; }
  // ground shows wet patches during the rain; puddles grow
  PUDDLE.forEach((p, k) => { const a = ss(seg(ts, K.rain + .8 + k * .12, K.rain + 2 + k * .12)) * (ph === 'sleep' ? 1 : 0); p.visible = a > .02; p.position.set(p.userData.x, DIRT_TOP + .01, p.userData.z); p.scale.set(.4 + .8 * a, 1, .4 + .8 * a); });
  // rain (L5) and drain-through (L9)
  const m = new THREE.Matrix4(); let n = 0;
  const rainOn = (ts > K.rain && ts < K.L6) ? 'rain' : (ts > K.L9 && ts < K.L9 + 2.6) ? 'drain' : null;
  for (let k = 0; k < 160; k++) {
    if (!rainOn) { m.makeScale(0, 0, 0); RAIN.setMatrixAt(k, m); continue; }
    const x = (hash(k) - .5) * 14, z = Z0 + 14 + hash(k + 50) * 60, sp = 30 + hash(k + 9) * 10, ph0 = hash(k + 3) * 3;
    let y = 30 - ((ts * sp + ph0 * sp) % 32);
    const floor = rainOn === 'rain' ? DIRT_TOP : -1;
    if (y < floor) { m.makeScale(0, 0, 0); RAIN.setMatrixAt(k, m); continue; }
    m.makeTranslation(x, y, z); RAIN.setMatrixAt(k, m); n++;
  }
  RAIN.instanceMatrix.needsUpdate = true; RAIN.visible = !!rainOn;
  // train
  const tz = trainZ(t);
  TRAIN.visible = tz < 200;
  if (TRAIN.visible) { const y = railBase(tz, ts) + 2 * PLATE - .4; TRAIN.position.set(0, y, tz); TRAIN.rotation.x = -railTilt(tz, ts); }
}

// ------------------------------------------------------------------ acting (12 fps poses)
const SPOT = { tukang: V(-6.8, 0, 9), mandor: V(-6.6, 0, -5) };
function people(t) {
  const ts = q12(t), [A, B] = PEOPLE;
  const base = (who, p) => Object.assign({ x: SPOT[who].x, z: SPOT[who].z, y: 0, ry: who === 'tukang' ? .7 : .9 }, p);
  let a = {}, b = {};
  const alarm = { armL: [-2.9, .5], armR: [-2.9, .5], nod: -.25 };
  const V_ = { armL: [-2.6, .55], armR: [-2.6, .55], nod: -.2 };
  const hop = (t0) => Math.max(0, Math.sin(Math.PI * clamp((ts - t0) / .35))) * .9;
  if (ts > K.L2 + 1.6 && ts < K.L3) a = { ...V_, y: hop(K.L2 + 1.6) };
  if (ts > K.sink && ts < K.L4) { a = { ...alarm, y: hop(K.sink) }; b = { ...alarm, lean: -.15 }; }
  if (ts > K.L4 + .1 && ts < K.L5) a = { lean: .45, armL: [-1.2, .1], armR: [-1.2, .1], nod: .4 };
  if (ts > K.tilt && ts < K.L6) { b = { armR: [-2.5, -.2], armL: [0, .1], nod: .35, look: -.3 }; a = { armL: [-.4, .9], armR: [-.4, .9], tilt: .25 }; }
  // concrete: both walk to the slab and high-five
  if (ts > K.L6 && ts < K.crack + .3) { const w = eio(seg(ts, K.L6, K.L6 + .8)); const pa = SPOT.tukang.clone().lerp(V(-6.6, 0, 3.6), w), pb = SPOT.mandor.clone().lerp(V(-6.6, 0, .9), w);
    const st = Math.sin(ts * 14) * .5 * (w > 0 && w < 1 ? 1 : 0); const five = ts > K.L6 + .9 ? 1 : 0;
    a = { x: pa.x, z: pa.z, ry: Math.PI - .6, legs: [st, -st], armL: five ? [-2.9, -.25] : [0, .06] }; b = { x: pb.x, z: pb.z, ry: .6, legs: [-st, st], armR: five ? [-2.9, -.25] : [0, .06] }; }
  if (ts >= K.crack + .3 && ts < K.L8) { const w = eio(seg(ts, K.crack + .3, K.crack + 1.3)); const pa = V(-6.6, 0, 3.6).lerp(SPOT.tukang, w), pb = V(-6.6, 0, .9).lerp(SPOT.mandor, w);
    a = { x: pa.x, z: pa.z, ry: .5, armL: [-2.7, -.5], armR: [-2.7, -.5], nod: .3 }; b = { x: pb.x, z: pb.z, ry: -.6, armL: [-2.7, -.5], armR: [-2.7, -.5], nod: .3 }; }
  if (ts > K.gravel + .3 && ts < K.gravel + 1.8) { a = { ...V_, y: hop(K.gravel + .3) }; b = { ...V_, y: hop(K.gravel + .45) }; }
  if (ts > K.tamp && ts < K.tamp + 2) a = { y: .6 * Math.abs(Math.sin((ts - K.tamp) * 7)), armL: [-.7, .3], armR: [-.7, .3], nod: .3 };
  if (ts > K.lift) { const u = eo(seg(ts, K.lift, K.lift + .5)); a = { armL: [lerp(0, -3.0, u), .1], armR: [lerp(0, -3.0, u), .1], nod: -.3, y: hop(K.lift + .4) * .5 }; b = { armL: [-2.6, .55], armR: [-2.6, .55], nod: -.2, y: hop(K.lift + .6) * .5 }; }
  const blink = (Math.floor(t * 12) % 41) === 0;
  A.pose(base('tukang', a)); B.pose(base('mandor', b));
  // the stone Tukang lifts up at the end
  HELD.visible = ts > K.lift - .1;
}

// ------------------------------------------------------------------ cameras (on ones)
function camAt(t) {
  const sh = (t0, a = .35, d = .4) => { const u = seg(t, t0, t0 + d); if (u <= 0 || u >= 1) return V(0, 0, 0); const k = Math.floor(t * 24); return V((hash(k) - .5) * a * (1 - u), (hash(k + 5) - .5) * a * (1 - u), 0); };
  let pos, at, aper = .9;
  const near = V(9, 12, 40), wide = V(11, 26, 52);
  if (t < K.L2) {                                               // hook: macro on one stone, then rack to the workers
    const u = eio(seg(t, K.L1 + 1.6, K.L2 - .1));
    pos = V(lerp(2.2, 9, u), lerp(DIRT_TOP + 1.3, 12, u), lerp(19.2, 40, u)); at = V(lerp(4.6, -2, u), lerp(DIRT_TOP + .3, 4, u), lerp(15, -2, u)); aper = lerp(2.6, 1.0, u);
  } else if (t < K.L4) {                                        // coba 1: 3/4 low over the track, follow the train
    const tz = trainZ(t), f = t > K.L3 ? clamp((tz + 60) / 120) : 0;
    pos = V(10, 10 - 2 * f, 38); at = V(-1, 2.5, lerp(-8, -2, f)); pos.add(sh(K.sink, .7));
  } else if (t < K.L6) { pos = V(12 + 3 * seg(t, K.L4, K.L6), 15 + 5 * seg(t, K.L5, K.L6), 36); at = V(-1, 2, -6); }
  else if (t < K.L8) { const p = ss(seg(t, K.crack - .3, K.crack + 1.2)); pos = V(lerp(11, 6, p), lerp(13, 9, p), lerp(36, 22, p)); at = V(lerp(-1, 0, p), 2, lerp(-6, -10, p)); pos.add(sh(K.crack, .5)); aper = lerp(.9, 1.4, p); }
  else if (t < K.L9) { const u = ss(seg(t, K.L8 - .8, K.L9)); pos = V(lerp(8, 12, u), lerp(16, 22, u), lerp(30, 46, u)); at = V(0, 2, -10); aper = .7; }
  else if (t < K.L10) {                                         // payoff: low along the track, train passes smoothly
    const tz = trainZ(t), f = clamp((tz + 60) / 120);
    pos = V(17, 10, 30); at = V(0, 3, lerp(-16, -2, f)); aper = .9;
    if (t < K.L9 + 2.6) { pos = V(7, 7, 22); at = V(0, 2, 4); aper = 1.6; }
  } else if (t < K.L11) { pos = V(2, 13, 42); at = V(-3, 4, 2); aper = 1.0; }
  else {                                                        // ending: orbit, then the scale reveal (it is a toy on a desk)
    const u = eio(seg(t, K.L11 + 1.2, DUR - .3)), a0 = .2 + .5 * seg(t, K.L11, DUR);
    const r = lerp(30, 120, u), hgt = lerp(10, 95, u);
    pos = V(Math.sin(a0) * r - 6, hgt, Math.cos(a0) * r + 8); at = V(lerp(-6, 0, u), lerp(5, 0, u), lerp(8, -15, u)); aper = lerp(1.4, .35, u);
  }
  return { pos, at, aper };
}

// ------------------------------------------------------------------ overlay (titles on brick tiles, subtitles on a dark pill)
let ov, g2;
function tile(text, x, y, { size = 54, bg = '#f2cd37', fg = '#1b2a34', a = 1, studs = true } = {}) {
  if (a <= 0) return; g2.save(); g2.globalAlpha = a; g2.font = `700 ${size}px Fredoka`;
  const tw = g2.measureText(text).width, w = tw + size * 1.1, h = size * 1.55;
  g2.shadowColor = 'rgba(0,0,0,.35)'; g2.shadowBlur = 14; g2.shadowOffsetY = 6; g2.fillStyle = bg; g2.beginPath(); g2.roundRect(x, y, w, h, 12); g2.fill(); g2.shadowColor = 'transparent';
  if (studs) { const n = Math.max(2, Math.round(w / 56)); for (let i = 0; i < n; i++) { const sx = x + (i + .5) * w / n; g2.fillStyle = 'rgba(255,255,255,.18)'; g2.beginPath(); g2.ellipse(sx, y - 6, 16, 7, 0, 0, TAU); g2.fill(); g2.fillStyle = bg; g2.fillRect(sx - 16, y - 6, 32, 7); g2.beginPath(); g2.ellipse(sx, y - 12, 16, 7, 0, 0, TAU); g2.fill(); } }
  g2.fillStyle = fg; g2.textBaseline = 'middle'; g2.fillText(text, x + size * .55, y + h / 2 + 2); g2.restore();
  return w;
}
const popA = (t, t0) => (t < t0 ? 0 : 1);                          // titles pop in on 12 fps steps
function overlay(t) {
  g2.clearRect(0, 0, W, H);
  const ts = q12(t);
  if (ts > .3 && ts < K.L2 - .1) { tile('Kenapa rel kereta', 70, 230, { size: 64, bg: '#f4f4f1', a: popA(ts, .3) }); tile('pakai kerikil?', 70, 340, { size: 64, bg: '#f2cd37', a: popA(ts, .5) }); }
  const steps = [[K.L2, K.L4, 'COBA 1', 'Langsung di tanah', K.sink + .3, '✕ amblas'], [K.L4, K.L6, 'COBA 2', 'Bantalan kayu', K.tilt + .5, '✕ miring'], [K.L6, K.L8, 'COBA 3', 'Cor beton', K.crack + .3, '✕ retak & mahal'], [K.L8, K.L11, 'COBA 4', 'Batu kerikil', 1e9, '']];
  for (const [a, b, lab, ttl, tf, fail] of steps) { if (ts < a + .1 || ts > b - .3) continue;
    tile(lab, 70, 200, { size: 34, bg: '#1b2a34', fg: '#f2cd37', a: popA(ts, a + .1), studs: false });
    tile(ttl, 70, 280, { size: 60, bg: lab === 'COBA 4' ? '#237841' : '#f4f4f1', fg: lab === 'COBA 4' ? '#fff' : '#1b2a34', a: popA(ts, a + .25) });
    if (ts > tf) tile(fail, 70, 400, { size: 46, bg: '#c91a09', fg: '#fff', a: 1 }); }
  const fx = [[K.L9 + .1, '✓ air tembus'], [K.L9 + 2.0, '✓ saling ngunci'], [K.vib, '✓ getaran diredam'], [K.tamp, '✓ gampang dirawat']];
  if (ts < K.L11 - .3) fx.forEach(([ti, s], i) => { if (ts > ti) tile(s, 70, 400 + i * 88, { size: 40, bg: '#237841', fg: '#fff', studs: false }); });
  if (ts > K.L11 + .3) { tile('namanya', 70, 220, { size: 36, bg: '#1b2a34', fg: '#f2cd37', studs: false }); tile('BALAS', 70, 300, { size: 130, bg: '#f2cd37', a: popA(ts, K.L11 + .45) }); }
  karaoke(t);
}

// karaoke captions: chunks of ≤3 words, bold caps, white with a black outline, the word being spoken lights up cyan
const CAP_Y = 1260, CAP_SIZE = 84, CAP_LH = 92;
function chunkAt(t) {
  for (const c of CHUNKS) if (t >= c.t0 && t < c.t1) return c;
  return null;
}
function karaoke(t) {
  const c = chunkAt(t); if (!c) return;
  g2.save(); g2.font = `400 ${CAP_SIZE}px "Lilita One"`; g2.textBaseline = 'middle'; g2.lineJoin = 'round';
  const sp = g2.measureText(' ').width;
  // lay out on up to two lines, centred
  const ws = c.words.map(w => ({ ...w, s: w.w.toUpperCase(), wd: g2.measureText(w.w.toUpperCase()).width }));
  const lines = [[]]; let lw = 0;
  for (const w of ws) { if (lw + w.wd > 900 && lines[lines.length - 1].length) { lines.push([]); lw = 0; } lines[lines.length - 1].push(w); lw += w.wd + sp; }
  const pop = Math.min(1, (t - c.t0) / .08), sc = .9 + .1 * pop;
  g2.translate(W / 2, CAP_Y); g2.scale(sc, sc);
  lines.forEach((ln, li) => {
    const tw = ln.reduce((a, w) => a + w.wd, 0) + sp * (ln.length - 1); let x = -tw / 2; const y = (li - (lines.length - 1) / 2) * CAP_LH;
    for (const w of ln) {
      const on = t >= w.t0 - .03;
      g2.lineWidth = 16; g2.strokeStyle = '#0b0d12'; g2.strokeText(w.s, x, y);
      g2.fillStyle = on && t < w.t1 + .25 ? '#3ee6ff' : '#ffffff'; g2.fillText(w.s, x, y);
      x += w.wd + sp;
    }
  });
  g2.restore();
}
const CHUNKS = [];
function buildChunks(WORDS) {
  for (const [id] of LINES) {
    const ws = (WORDS[id] || []).map(([w, a, b]) => ({ w: w.replace(/[“”"]/g, ''), t0: K[id] + a, t1: K[id] + b }));
    let cur = [];
    const flush = () => { if (cur.length) CHUNKS.push({ words: cur, t0: cur[0].t0 - .05, t1: cur[cur.length - 1].t1 + .12 }); cur = []; };
    ws.forEach((w, i) => { cur.push(w); if (cur.length >= 3 || /[.,!?…:]$/.test(w.w) || i === ws.length - 1) flush(); });
  }
  // each chunk stays until the next one starts (no flicker between words of one sentence)
  for (let i = 0; i < CHUNKS.length - 1; i++) { const gap = CHUNKS[i + 1].t0 - CHUNKS[i].t1; if (gap < .45) CHUNKS[i].t1 = CHUNKS[i + 1].t0; }
}

// ------------------------------------------------------------------ assembly
export async function init() {
  Object.assign(DURS, await (await fetch('out/vo/dur.json')).json());
  let t = .5; for (const [id] of LINES) { t += GAP[id] ?? 0; K[id] = t; t += DURS[id]; }
  DUR = Math.round((t + 3.4) * 10) / 10;
  try { buildChunks(await (await fetch('out/vo/words.json')).json()); } catch (e) { }
  K.sink = K.L3 + 1.9; K.rain = K.L5 - .1; K.tilt = K.L5 + 2.6; K.crack = K.L7 + 2.6; K.gravel = K.L8 + .4; K.vib = K.L9 + 3.6; K.tamp = K.L10 + 1.2; K.lift = K.L11 + 1.4;
  LINES.forEach(([id, text], i) => { const t0 = K[id], d = DURS[id], nx = LINES[i + 1]; let t1 = t0 + Math.max(1.8, d + .6, text.length / 15 + 1.62); t1 = Math.min(t1, nx ? K[nx[0]] - .05 : DUR - .1); SUBS.push({ id, t0, t1, text }); });
  renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(W, H);
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('stage').appendChild(renderer.domElement);
  scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(38, W / H, .5, 3000);
  post = makePost(renderer, scene, camera, W, H, { ssaa: 2, ao: true, aoRadius: 3.5, aoThickness: 3, aoAmt: .9 });
  post.bloom.strength = .14; post.bloom.threshold = 1.3;
  post.vig.uniforms.amt.value = .34; post.vig.uniforms.warm.value = -.35; post.vig.uniforms.contrast.value = .26; post.vig.uniforms.sat.value = 1.1;
  await buildSet(); buildTrack(); buildTrain();
  PEOPLE = [makeWorker(COL.orange, COL.yellow), makeWorker(COL.blue, COL.white)];
  HELD = mesh(roundGeo(.5, PLATE), '#8a8d8c'); HELD.scale.setScalar(2.0); HELD.rotation.x = Math.PI; HELD.position.set(0, -.5, 0); PEOPLE[0].arms[1].hand.add(HELD);
  // the hero stone in the opening macro
  const hero = mesh(roundGeo(.5, PLATE), '#8a8d8c'); hero.position.set(4.6, DIRT_TOP, 15); hero.rotation.y = .4; hero.userData.hero = true; scene.add(hero); HOOK = hero;
  ov = document.getElementById('ov'); g2 = ov.getContext('2d');
  // events for the mix
  EV = [];
  for (const [id] of LINES) EV.push({ t: K[id], type: 'vo', id });
  for (let k = 0; k < 19; k++) EV.push({ t: K.L2 + .2 + k * .07 + .25, type: 'click', n: k });
  EV.push({ t: K.L2 + 1.6, type: 'cheer' }, { t: K.L3, type: 'train', dur: 5.0 }, { t: K.sink, type: 'fail' });
  SLEEPERS.forEach((s, i) => EV.push({ t: K.L4 + .25 + i * .06 + .2, type: 'click', n: i }));
  EV.push({ t: K.rain, type: 'rain', dur: K.L6 - K.rain }, { t: K.tilt + .5, type: 'fail' });
  EV.push({ t: K.L6 + .5, type: 'slab' }, { t: K.L6 + .9, type: 'five' }, { t: K.crack, type: 'crack' }, { t: K.crack + .3, type: 'fail' });
  EV.push({ t: K.L8 - 1.0, type: 'silence', dur: .9 }, { t: K.gravel, type: 'pour', dur: 1.9 });
  EV.push({ t: K.L9 + .1, type: 'drain', dur: 2.5 }, { t: K.vib, type: 'train', dur: 3.6 }, { t: K.tamp, type: 'tamp', dur: 1.8 });
  [K.L9 + .1, K.L9 + 2.0, K.vib, K.tamp].forEach((tt, i) => EV.push({ t: tt, type: 'tick', n: i }));
  EV.push({ t: K.L11 + .45, type: 'title' }, { t: K.lift, type: 'ding' });
  EV.sort((a, b) => a.t - b.t);
}
let HOOK;
export function render(t) {
  HOOK.visible = t < K.L4;
  updateTrack(t); people(t);
  const c = camAt(t); camera.position.copy(c.pos); camera.lookAt(c.at);
  post.dof.focus = camera.position.distanceTo(c.at); post.dof.aper = c.aper; post.dof.maxCoc = 16;
  post.composer.render();
  overlay(t);
}
export function TEXTS(t) {
  const s = SUBS.find(s => t >= s.t0 && t < s.t1); return s ? [{ id: s.id, text: s.text, x0: 40, y0: 1300, x1: 1040, y1: 1500 }] : [];
}
