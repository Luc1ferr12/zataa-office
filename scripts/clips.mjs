#!/usr/bin/env node
// Potong rekaman gameplay Owner (assets/clips/_mentah/<game>/, landscape, TIDAK di-push) → klip latar video Dimas
// (assets/clips/<game>/, 9:16 720×1280, tanpa suara, ±12 dtk). Momen dipilih dari lonjakan suara (tembakan).
// Jalan di laptop (file mentah cuma ada di sana), lalu commit + push → VPS git pull.
//   node scripts/clips.mjs cut <game> [jumlah=2] [detik=12]   potong klip baru dari file yang belum dipakai
//   node scripts/clips.mjs cut-at <game> "<file>" <detik> [len]  potong manual di detik tertentu (pilih dari cuplikan)
//   node scripts/clips.mjs list                              stok mentah & klip jadi per game
process.removeAllListeners('warning');
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'assets', 'clips', '_mentah');
const USED = join(RAW, 'terpakai.json'); // { "<game>/<file>": [[mulai, detik], ...] }
const isVideo = (f) => /\.(mp4|mov|mkv|webm)$/i.test(f);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const loadUsed = () => (existsSync(USED) ? JSON.parse(readFileSync(USED, 'utf8')) : {});

function run(args, onData) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, args, { windowsHide: true });
    let err = '';
    if (onData) p.stdout.on('data', onData);
    p.stderr.on('data', (b) => { err = (err + b).slice(-2000); });
    p.on('close', (code) => (code === 0 ? resolve(err) : reject(new Error(err.split('\n').slice(-3).join(' ')))));
  });
}

// energi suara per 50 ms (mono 8 kHz). Tembakan = lonjakan pendek & tajam, beda dengan musik fase beli yang keras terus.
const HOP = 0.05;
async function loudness(file) {
  const RATE = 8000, STEP = RATE * HOP;
  const out = [];
  let acc = 0, n = 0, carry = Buffer.alloc(0);
  await run(['-hide_banner', '-i', file, '-map', '0:a:0', '-vn', '-ac', '1', '-ar', String(RATE), '-f', 's16le', '-'], (b) => {
    const buf = carry.length ? Buffer.concat([carry, b]) : b;
    const even = buf.length - (buf.length % 2);
    for (let i = 0; i < even; i += 2) {
      const v = buf.readInt16LE(i) / 32768;
      acc += v * v; n++;
      if (n === STEP) { out.push(Math.sqrt(acc / n)); acc = 0; n = 0; }
    }
    carry = buf.subarray(even);
  });
  return out; // index i = detik i*HOP
}

// onset = energi melonjak ≥3× rata-rata 0,5 dtk sebelumnya dan di atas persentil 70 → hampir selalu tembakan/skill
function onsets(e) {
  const sorted = [...e].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.7)] || 0;
  const back = Math.round(0.5 / HOP);
  const on = new Float32Array(e.length);
  let last = -99;
  for (let i = back; i < e.length; i++) {
    let m = 0;
    for (let j = i - back; j < i; j++) m += e[j];
    m /= back;
    if (e[i] > floor && e[i] > 3 * m && i - last > 2) { on[i] = 1; last = i; } // jeda ≥100 ms antar tembakan
  }
  return on;
}

function bestWindows(energy, len, taken, want) {
  const w = Math.round(len / HOP), stride = Math.round(1 / HOP);
  if (energy.length < w) return [];
  const on = onsets(energy);
  const total = energy.length * HOP;
  const score = [];
  for (let s = 0; s + w <= energy.length; s += stride) {
    let n = 0;
    for (let i = s; i < s + w; i++) n += on[i];
    const start = s * HOP;
    // Instant Replay di-save setelah momen bagus → bagian akhir rekaman sedikit diutamakan
    score.push([start, n * (1 + 0.5 * (start + len) / total)]);
  }
  const clash = (a, b) => a < b[0] + b[1] && b[0] < a + len;
  const picked = [];
  for (const [start, sc] of score.sort((a, b) => b[1] - a[1])) {
    if (sc <= 0 || picked.length >= want) break;
    if ([...taken, ...picked.map((p) => [p, len])].some((t) => clash(start, t))) continue;
    picked.push(start);
  }
  return picked;
}

async function cut(game, count = 2, len = 12) {
  const src = join(RAW, game);
  if (!existsSync(src)) throw new Error(`folder mentah tidak ada: assets/clips/_mentah/${game}`);
  const dst = join(ROOT, 'assets', 'clips', game);
  mkdirSync(dst, { recursive: true });
  const used = loadUsed();
  // file yang paling sedikit dipakai dulu, biar variasi
  const files = readdirSync(src).filter(isVideo).sort((a, b) => (used[`${game}/${a}`]?.length ?? 0) - (used[`${game}/${b}`]?.length ?? 0) || a.localeCompare(b));
  const made = [];
  for (const f of files) {
    if (made.length >= count) break;
    const energy = await loudness(join(src, f)).catch(() => []);
    const [start] = bestWindows(energy, len, used[`${game}/${f}`] ?? [], 1);
    if (start === undefined) continue;
    made.push(await cutAt(game, f, start, len));
  }
  return made;
}

// potong manual: detik pilihan sendiri (setelah lihat cuplikan) — lebih akurat dari deteksi suara untuk Valorant
async function cutAt(game, f, start, len = 12) {
  const src = join(RAW, game);
  const dst = join(ROOT, 'assets', 'clips', game);
  mkdirSync(dst, { recursive: true });
  if (!existsSync(join(src, f))) throw new Error(`file mentah tidak ada: ${game}/${f}`);
  const used = loadUsed();
  const key = `${game}/${f}`;
  {
    const name = `${slug(game)}-${slug(basename(f).replace(/\.[^.]+$/, '')).slice(-24)}-${Math.round(start)}.mp4`;
    // crop tengah 9:16 (senjata & crosshair di tengah layar), 720×1280 30fps, tanpa audio, kecil buat git
    await run(['-hide_banner', '-y', '-ss', String(start), '-t', String(len), '-i', join(src, f),
      '-vf', 'crop=ih*9/16:ih,scale=720:1280:flags=lanczos,fps=30,format=yuv420p', '-an',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-movflags', '+faststart', join(dst, name)]);
    (used[key] ??= []).push([start, len]);
    writeFileSync(USED, JSON.stringify(used, null, 1));
    return { clip: `assets/clips/${game}/${name}`, from: f, start, kb: Math.round(statSync(join(dst, name)).size / 1024) };
  }
}

function list() {
  const games = existsSync(RAW) ? readdirSync(RAW).filter((d) => statSync(join(RAW, d)).isDirectory()) : [];
  const used = loadUsed();
  return games.map((g) => {
    const raw = readdirSync(join(RAW, g)).filter(isVideo);
    const done = existsSync(join(ROOT, 'assets', 'clips', g)) ? readdirSync(join(ROOT, 'assets', 'clips', g)).filter(isVideo).length : 0;
    return { game: g, mentah: raw.length, mentah_dipakai: raw.filter((f) => used[`${g}/${f}`]?.length).length, klip_jadi: done };
  });
}

const [cmd, game, n, len] = process.argv.slice(2);
try {
  if (cmd === 'cut' && game) console.log(JSON.stringify(await cut(game, +(n || 2), +(len || 12)), null, 1));
  else if (cmd === 'cut-at' && game) console.log(JSON.stringify(await cutAt(game, n, +len, +(process.argv[6] || 12)), null, 1));
  else if (cmd === 'list') console.log(JSON.stringify(list(), null, 1));
  else console.log('pakai: clips.mjs cut <game> [jumlah] [detik] | list');
} catch (e) { console.log(`gagal: ${e.message}`); process.exit(1); }
