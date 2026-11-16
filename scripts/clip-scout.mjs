#!/usr/bin/env node
// Clip scout (Marvel Talk): cari klip di YouTube, unduh, dan pilih momen yang pas — SEMUA di laptop (yt-dlp di VPS diblok YouTube "bukan bot").
// Dipakai shorts-laptop.mjs sebelum render. Entri klip di spec boleh berbentuk:
//   { src, ss, x? }                          file lokal (sudah pasti)
//   { find: "kata cari", note: "yang harus kelihatan", n?: 1, yt?: "<id video>", x? }   → diubah jadi n entri { src, ss, x }
// Alur per `find`: ytsearch → unduh 720p ke cache → contact sheet berlabel detik → `claude -p` (baca gambar) memilih n momen.
// Hasil keputusan disimpan di cache (<cache>/picks.json) supaya render ulang/revisi memilih klip yang sama.
//   node scripts/clip-scout.mjs "<kata cari>" "<yang harus kelihatan>" [n]     uji coba
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ffmpegPath from 'ffmpeg-static';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CACHE = join(ROOT, 'tmp', 'clip-cache');
const FONT = process.env.CLIP_FONT ?? 'C:/Windows/Fonts/arialbd.ttf';
const COLS = 8, ROWS = 6;   // contact sheet 48 frame

const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts });
const picksFile = () => join(CACHE, 'picks.json');
const loadPicks = () => (existsSync(picksFile()) ? JSON.parse(readFileSync(picksFile(), 'utf8')) : {});
const savePick = (k, v) => writeFileSync(picksFile(), JSON.stringify({ ...loadPicks(), [k]: v }, null, 1));

function search(query) {
  const r = run('yt-dlp', ['--flat-playlist', '--print', '%(id)s|%(duration)s|%(title)s', `ytsearch8:${query}`]);
  if (r.status !== 0) throw new Error(`yt-dlp cari gagal: ${(r.stderr || '').trim().split('\n').pop()}`);
  const rows = r.stdout.trim().split('\n').map((l) => { const [id, d, ...t] = l.split('|'); return { id, dur: +d, title: t.join('|') }; }).filter((v) => v.id && v.dur >= 10 && v.dur <= 900);
  if (!rows.length) throw new Error(`tidak ada klip untuk "${query}"`);
  const score = (v) => (/clip|scene|official|trailer/i.test(v.title) ? 1 : 0) - (/reaction|review|explained|ranking|fan|edit|tiktok/i.test(v.title) ? 2 : 0);
  return rows.map((v, i) => ({ ...v, s: score(v) - i * 0.01 })).sort((a, b) => b.s - a.s).slice(0, 3);   // 3 kandidat terbaik, dicoba berurutan
}

function download(id) {
  const out = join(CACHE, `v_${id}.mp4`);
  if (existsSync(out)) return out;
  const r = run('yt-dlp', ['-q', '-f', 'bv*[height<=720][ext=mp4]/b[height<=720]/b', '--ffmpeg-location', ffmpegPath, '-o', out, `https://youtube.com/watch?v=${id}`]);
  if (r.status !== 0 || !existsSync(out)) throw new Error(`unduh ${id} gagal: ${(r.stderr || '').trim().split('\n').pop()}`);
  return out;
}

function duration(file) {
  const r = run(ffmpegPath, ['-i', file, '-f', 'null', '-']);
  const m = [...(r.stderr ?? '').matchAll(/time=(\d+):(\d+):([\d.]+)/g)].pop();
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
}

function pick(id, file, note, n) {
  const dur = duration(file), step = Math.max(1, Math.ceil(dur / (COLS * ROWS)));
  if (existsSync(FONT)) copyFileSync(FONT, join(CACHE, 'font.ttf'));
  const sheet = `v_${id}-sheet.jpg`;
  const r = run(ffmpegPath, ['-y', '-loglevel', 'error', '-i', file, '-vf', `fps=1/${step},scale=240:-1,drawtext=fontfile=font.ttf:text=%{pts\\:flt}:x=4:y=4:fontsize=22:fontcolor=yellow:box=1:boxcolor=black@0.7,tile=${COLS}x${ROWS}:padding=2`, '-frames:v', '1', sheet], { cwd: CACHE });
  if (r.status !== 0) throw new Error(`contact sheet gagal: ${(r.stderr || '').slice(-200)}`);
  const prompt = `Baca gambar ${sheet} (contact sheet klip film: ${COLS} kolom, tiap kotak = 1 frame, angka kuning di pojok = detik frame itu, jarak ${step} dtk antar kotak, total ${dur.toFixed(0)} dtk). Cari ${n} momen BERBEDA (selisih ≥4 detik) yang paling jelas menunjukkan: "${note}". Pilih HANYA momen yang gambarnya jelas nyambung langsung dengan itu (terang, subjek kelihatan; bukan logo studio/intro/credit/layar gelap). Kalau tidak ada frame yang benar-benar cocok, balas {"starts":[]}. Balas HANYA JSON satu baris: {"starts":[detik_mulai, ...]} (detik mulai = angka kuning kotak yang dipilih, pas sebelum momen mulai).`;
  const bin = process.env.CLAUDE_BIN || 'claude';
  // jalankan dari folder netral di luar repo: kalau di dalam repo, Claude ikut membaca CLAUDE.md kantor dan malah ngobrol soal handbook
  const work = join(tmpdir(), 'clip-scout');
  mkdirSync(work, { recursive: true });
  copyFileSync(join(CACHE, sheet), join(work, sheet));
  const c = run(bin, ['-p', '--allowedTools', 'Read', '--model', process.env.SCOUT_MODEL ?? 'sonnet'], { cwd: work, timeout: 240000, input: prompt, shell: process.platform === 'win32' });   // claude = .cmd di Windows → shell + prompt lewat stdin
  const m = (c.stdout ?? '').match(/\{[^{}]*"starts"[^{}]*\}/);
  if (!m) throw new Error(`Claude tidak memilih momen: ${(c.stdout || c.stderr || c.error?.message || '').trim().slice(-200)}`);
  const starts = JSON.parse(m[0]).starts.map(Number).filter((x) => x >= 0 && x < dur - 1);
  return { starts, dur };   // kosong = video ini tidak cocok
}

export function scoutClip(e) {
  mkdirSync(CACHE, { recursive: true });
  const n = e.n ?? 1, key = createHash('sha1').update(`${e.yt ?? e.find}|${e.note ?? ''}|${n}`).digest('hex').slice(0, 12);
  let p = loadPicks()[key];
  if (!p || !existsSync(p.src)) {
    const ids = e.yt ? [e.yt] : search(e.find).map((v) => v.id);
    for (const id of ids) {
      try {
        const file = download(id), { starts } = pick(id, file, e.note ?? e.find, n);
        if (starts.length) { p = { src: file, starts }; break; }
      } catch (err) { process.stderr.write(`  lewati ${id}: ${err.message.slice(0, 120)}
`); }   // unduh 403 / sheet gagal → kandidat berikutnya
    }
    if (!p) throw new Error(`tidak ada momen yang cocok untuk "${e.note ?? e.find}" di ${ids.length} video teratas — ganti kata cari (find)`);
    savePick(key, p);
  }
  return p.starts.slice(0, n).map((ss) => ({ src: p.src, ss, ...(e.x != null ? { x: e.x } : {}) }));
}

// spec.scenes[].clips → semua entri `find`/`yt` diganti jadi { src, ss, x? } (path absolut)
export function resolveClips(spec, log = () => {}) {
  for (const s of spec.scenes) {
    if (!Array.isArray(s.clips)) continue;
    s.clips = s.clips.flatMap((e) => {
      if (e.src) return [e];
      if (!e.find && !e.yt) throw new Error('klip butuh src+ss, atau find (kata cari) / yt (id video)');
      log(`cari klip: ${e.find ?? e.yt}`);
      return scoutClip(e);
    });
  }
  return spec;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [find, note, n] = process.argv.slice(2);
  if (!find) { console.log('pakai: clip-scout.mjs "<kata cari>" "<yang harus kelihatan>" [n]'); process.exit(0); }
  console.log(JSON.stringify(scoutClip({ find, note, n: +(n ?? 1) }), null, 1));
}
