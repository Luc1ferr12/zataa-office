// Laptop → VPS: laporan render yang lagi jalan (tahap, persen, perkiraan selesai) buat tab 📶 Progress di web. 0 token.
// Dijalankan laptop-worker.mjs di samping render (proses terpisah, cuma BACA file proyek film; nggak nyentuh render-nya).
//   node scripts/render-progress.mjs [--parent=<pid>] [--once]     --parent: berhenti kalau proses itu mati
// Tahap dibaca dari file di films/<slug>/out; persen gambar dari logs/render-frames.log (diisi frame-log.mjs);
// perkiraan lama per gaya = median 6 render terakhir di logs/laptop-worker.log.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILMS = join(ROOT, 'films');
export const FRAME_LOG = join(ROOT, 'logs', 'render-frames.log');
const MIN = 60_000;
const ACTIVE = 10 * MIN;   // VoxCPM di CPU ±3 menit per baris → jeda antar file bisa panjang
const TAIL = 2 * MIN;      // campur audio + encode akhir + kirim ke VPS

const mtime = (p) => { try { return statSync(p).mtimeMs; } catch { return 0; } };
const list = (p) => { try { return readdirSync(p); } catch { return []; } };
const read = (p, d = null) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return d; } };
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 : null; };

// menit per film per gaya, dari riwayat worker ("render … #id" → "selesai #id")
export function estimates(logText) {
  let text = logText;
  if (text == null) { try { text = readFileSync(join(ROOT, 'logs', 'laptop-worker.log'), 'utf8').slice(-200_000); } catch { return {}; } }
  const start = new Map(), by = {}, all = [];
  for (const line of text.split('\n')) {
    let m = line.match(/^(\S+) render (?:shorts )?#(\d+)\s*$/);
    if (m) { start.set(m[2], Date.parse(m[1])); continue; }
    m = line.match(/^(\S+) selesai #(\d+): (.*)$/);
    if (!m || !start.has(m[2])) continue;
    const min = (Date.parse(m[1]) - start.get(m[2])) / MIN;
    start.delete(m[2]);
    const slug = m[3].match(/"film":"films\/([\w-]+)"/)?.[1];
    const style = (slug ? read(join(FILMS, slug, 'film.json'))?.style : null) ?? m[3].match(/"bg":"([a-z-]+)"/)?.[1];
    if (!(min > 0) || min > 180 || !style) continue;   // "bg" gaya lama berupa path klip → nggak kena regex
    (by[style] ??= []).push(min);
    all.push(min);
  }
  const out = Object.fromEntries(Object.entries(by).map(([k, v]) => [k, Math.max(1, Math.round(median(v.slice(-6))))]));
  if (all.length) out._ = Math.max(1, Math.round(median(all.slice(-8))));
  return out;
}

// proyek film yang paling baru disentuh = yang lagi dirender
function activeFilm(now) {
  let best = null;
  for (const slug of list(FILMS)) {
    const out = join(FILMS, slug, 'out');
    if (slug.startsWith('_') || !existsSync(out)) continue;
    const segs = list(out).filter((n) => n.startsWith('.video_segs-')).flatMap((n) => [join(out, n), ...list(join(out, n)).map((f) => join(out, n, f))]);
    const touched = Math.max(...[out, join(out, 'vo'), ...list(join(out, 'vo')).map((f) => join(out, 'vo', f)), ...list(out).map((f) => join(out, f)), ...segs].map(mtime));
    if (now - touched < ACTIVE && (!best || touched > best.touched)) best = { slug, touched, rendering: segs.length > 0 };
  }
  return best;
}

export function frameProgress(text) {
  const w = new Map();
  for (const m of text.matchAll(/^w(\d+) (\d+)\/(\d+)\s+(\d+)s/gm)) w.set(m[1], { done: +m[2], total: +m[3], sec: +m[4] });
  if (!w.size) return null;
  const v = [...w.values()];
  const done = v.reduce((a, x) => a + x.done, 0);
  const total = v.reduce((a, x) => a + x.total, 0);
  return { done, total, sec: Math.max(...v.map((x) => x.sec)) };
}

export function snapshot(now = Date.now(), est = estimates()) {
  const a = activeFilm(now);
  if (!a) return null;
  const D = join(FILMS, a.slug), out = join(D, 'out');
  const t0 = mtime(join(D, 'lines.json'));   // disalin dari VPS pas laptop mulai ambil antrean
  if (!t0) return null;
  const style = read(join(D, 'film.json'))?.style;
  const total = (est[style] ?? est._ ?? 12) * MIN;
  const after = (p, margin = 0) => mtime(p) > t0 + margin;
  let step = 'suara', stepPct = null, etaAt = t0 + total;
  if (after(join(out, 'final.mp4'))) { step = 'kirim'; etaAt = now + MIN / 2; }
  else if (after(join(out, 'muxed.mp4'))) { step = 'encode'; etaAt = now + MIN; }
  else if (after(join(out, 'video.mp4'))) { step = 'audio'; etaAt = now + TAIL; }
  else if (a.rendering) {
    step = 'gambar';
    const f = after(FRAME_LOG) ? frameProgress(readFileSync(FRAME_LOG, 'utf8')) : null;
    if (f?.done > 0) {
      stepPct = Math.min(99, Math.round((f.done / f.total) * 100));
      etaAt = mtime(FRAME_LOG) + ((f.sec * (f.total - f.done)) / f.done) * 1000 + TAIL;
    }
  } else if (after(join(out, 'vo', 'words.json'), 10_000)) step = 'persiapan';
  else {
    const n = read(join(D, 'lines.json'))?.items?.length ?? 0;
    const got = list(join(out, 'vo')).filter((f) => /^l\d+\.wav$/.test(f)).length;
    if (n && got) stepPct = Math.min(99, Math.round((got / n) * 100));
  }
  return { slug: a.slug, step, stepPct, startedAt: new Date(t0).toISOString(), etaAt: new Date(Math.max(etaAt, now)).toISOString() };
}

// kirim ke tmp/render-progress.json di VPS (tulis ke file sementara dulu biar nggak pernah setengah jadi)
const HOSTS = [...new Set([process.env.ZATAA_VPS || 'zataa-vps', 'zataa-vps-443'])];
let host = 0;
export function send(payload) {
  return new Promise((ok) => {
    if (process.env.TRD_SILENT === '1') return ok(false);   // tes lokal: jangan kirim ke VPS asli
    const p = spawn('ssh', ['-o', 'ConnectTimeout=10', '-o', 'BatchMode=yes', HOSTS[host % HOSTS.length],
      'cd ~/zataa-office && mkdir -p tmp && cat > tmp/render-progress.new && mv tmp/render-progress.new tmp/render-progress.json'],
    { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true, timeout: 25_000 });
    p.on('error', () => ok(false));
    p.on('close', (code) => { if (code !== 0) host++; ok(code === 0); });
    p.stdin.on('error', () => {});
    p.stdin.end(JSON.stringify(payload));
  });
}
export const report = () => {
  const est = estimates();
  return { at: new Date().toISOString(), renderFrom: process.env.RENDER_FROM || '09:45', est, current: snapshot(Date.now(), est) };
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const parent = +(process.argv.find((x) => x.startsWith('--parent='))?.slice(9) ?? 0);
  const once = process.argv.includes('--once');
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
  for (;;) {
    try {
      const r = report();
      const sent = await send(r);
      if (once) console.log(JSON.stringify({ sent, ...r }));
    } catch (e) { if (once) console.error(e.message); }   // file lagi ditulis/dihapus renderer → coba lagi putaran berikut
    if (once || (parent && !alive(parent))) break;
    await new Promise((ok) => setTimeout(ok, 20_000));
  }
}
