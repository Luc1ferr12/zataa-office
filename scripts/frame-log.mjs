// Preload (NODE_OPTIONS=--import) yang dipasang laptop-worker.mjs: baris progres frame dari renderer lemo-opuscar
// (core/render/video.mjs, "w0 60/494  12s") disalin ke file ZAA_FRAME_LOG biar bisa dibaca render-progress.mjs.
// Proses node lain nggak diapa-apain. Gagal nulis → diabaikan, render tetap jalan.
import { appendFileSync } from 'node:fs';

const file = process.env.ZAA_FRAME_LOG;
if (file && /core[\\/]render[\\/]video\.mjs$/.test(process.argv[1] ?? '')) {
  const log = console.log.bind(console);
  console.log = (...a) => {
    try { appendFileSync(file, `${a.join(' ')}\n`); } catch { /* progres cuma pelengkap */ }
    log(...a);
  };
}
