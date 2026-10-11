// Render gedung di background thread supaya halaman tidak macet (±1 detik sekali saat buka).
import { renderScene } from './engine.js';
import { buildScene } from './scene.js';

self.onmessage = (e) => {
  const { upper, logo } = e.data;
  const { prims, lights } = buildScene(logo, { upper });
  const R = renderScene(prims, lights);
  const dyn = {};
  for (const [k, d] of R.dyn) dyn[k] = { idx: Int32Array.from(d.idx), a: Float32Array.from(d.a), b: Float32Array.from(d.b), x: Int16Array.from(d.x), y: Int16Array.from(d.y) };
  const out = { upper, day: R.day, night: R.night, depth: R.depth, glassD: R.glassD, glassDay: R.glassDay, glassNight: R.glassNight, lightQ: R.lightQ, dyn };
  const transfer = [R.day.buffer, R.night.buffer, R.depth.buffer, R.glassD.buffer, R.glassDay.buffer, R.glassNight.buffer, R.lightQ.buffer];
  for (const d of Object.values(dyn)) transfer.push(d.idx.buffer, d.a.buffer, d.b.buffer, d.x.buffer, d.y.buffer);
  self.postMessage(out, transfer);
};
