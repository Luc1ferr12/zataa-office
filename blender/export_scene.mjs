// Ekspor geometri kantor pixel (docs/js/px/scene.js) + kamera web ke JSON, buat dirender ulang di Blender (gaya 3D mainan).
//   node blender/export_scene.mjs blender/out/scene.json [upper=1]
import { writeFileSync } from 'node:fs';
import { buildScene } from '../docs/js/px/scene.js';
import { W, H, OX, OY, K, RES, VW, PXH } from '../docs/js/px/engine.js';

const out = process.argv[2] || 'blender/out/scene.json';
const upper = process.argv[3] !== '0';
const { prims, lights } = buildScene(null, { upper });
const mats = {};
const r = (v) => Math.round(v * 1e4) / 1e4;
const P = prims.map((p) => {
  const m = p.mat; mats[m.name] ??= { color: m.color, emissive: m.emissive ?? null, glass: m.glass ?? null, leafy: !!m.leafy, dyn: m.dyn ?? null };
  return p.kind === 'poly' ? ['p', m.name, p.P.map((v) => v.map(r))] : ['e', m.name, p.c.map(r), (Array.isArray(p.r) ? p.r : [p.r, p.r, p.r]).map(r), p.leafy ? 1 : 0];
});
// kamera: sumbu layar kanan & bawah di koordinat dunia (x, y-atas, z), skala piksel/meter, titik tengah layar
const TAN_YAW = 0.25, SIN_EL = 0.75;
const cP = 1 / Math.hypot(1, TAN_YAW), sP = TAN_YAW * cP, cE = Math.sqrt(1 - SIN_EL * SIN_EL), S = K / cP;
const right = [cP, 0, sP], down = [-sP * SIN_EL, -cE, cP * SIN_EL];
const a = (W / 2 - OX) / S, b = (H / 2 - OY) / S;
const center = [right[0] * a + down[0] * b, right[1] * a + down[1] * b, right[2] * a + down[2] * b];
writeFileSync(out, JSON.stringify({ camera: { W, H, RES, S, right, down, view: VW, center, orthoW: W / S }, mats, lights, prims: P }));
console.log('ok', out, P.length, 'prims', Object.keys(mats).length, 'mats', lights.length, 'lights');
