// Hitung data mesin pixel (kedalaman, layar, cahaya malam) di background thread supaya halaman tidak macet.
import { renderScene, ramp } from './engine.js';
import { buildScene, MAT } from './scene.js';
import { applyPixelTheme } from './themes.js';

self.onmessage = (e) => {
  const { logo, theme } = e.data;
  const { prims, lights } = buildScene(logo);
  applyPixelTheme(MAT, ramp, theme);   // mode Pixel Art HD: palet tema
  const R = renderScene(prims, lights);
  const dyn = {};
  for (const [k, d] of R.dyn) dyn[k] = { idx: Int32Array.from(d.idx), a: Float32Array.from(d.a), b: Float32Array.from(d.b), x: Int16Array.from(d.x), y: Int16Array.from(d.y) };
  const out = { day: R.day, night: R.night, depth: R.depth, lightQ: R.lightQ, dyn };
  const transfer = [R.day.buffer, R.night.buffer, R.depth.buffer, R.lightQ.buffer];
  for (const d of Object.values(dyn)) transfer.push(d.idx.buffer, d.a.buffer, d.b.buffer, d.x.buffer, d.y.buffer);
  self.postMessage(out, transfer);
};
