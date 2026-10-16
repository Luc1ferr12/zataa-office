#!/usr/bin/env node
// Render YouTube Shorts sejarah misteri: narasi OmniVoice per adegan + musik ambient (shorts-music.mjs) + template templates/shorts/player.html.
//   node scripts/shorts.mjs <spec.json> [out.mp4] [--test]   (durasi wajib 40–59 dtk; --test = lewati batas, buat uji coba)
// spec = { voice: "misteri-cewe", speed?: 0.9, tag?: "MISTERI KUNO", mood?: misteri|gurun|epik|tragis|alam, seed?: angka (kosong = acak),
//          scenes: [{ img: "path/foto.jpg", vo: "teks narasi", sub: "teks layar (*kata* = emas)", place?, credit?, move? }] }
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, extname, normalize, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import ffmpegPath from 'ffmpeg-static';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FPS = 30, LEAD = 0.7, GAP = 1.3, TAIL = 1.2;   // jeda sebelum narasi pertama, antar adegan, setelah narasi terakhir
const args = process.argv.slice(2).filter((a) => a !== '--test');
const TEST = process.argv.includes('--test');   // uji coba: lewati batas durasi
const MIN_DUR = 40, MAX_DUR = 59;               // aturan Owner: minimal 40 dtk, target 45–55, maksimal 59
const specPath = resolve(args[0] ?? '');
const outPath = resolve(args[1] ?? join(ROOT, 'out', 'shorts.mp4'));
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.woff2': 'font/woff2', '.webp': 'image/webp' };

const dur = (file) => {
  const r = spawnSync(ffmpegPath, ['-i', file, '-f', 'null', '-'], { encoding: 'utf8' });
  const m = [...(r.stderr ?? '').matchAll(/time=(\d+):(\d+):([\d.]+)/g)].pop();
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
};
const tmp = mkdtempSync(join(tmpdir(), 'zataa-shorts-'));
try {
  // 1. narasi per adegan (OmniVoice, laptop)
  const py = [process.env.OMNIVOICE_PY, 'D:/.venv-omnivoice/Scripts/python.exe'].find((p) => p && existsSync(p));
  if (!py) throw new Error('OmniVoice belum terinstal (set OMNIVOICE_PY)');
  const items = spec.scenes.map((s, i) => ({ text: s.vo, speed: s.speed ?? spec.speed ?? 0.9, out: join(tmp, `vo-${i}.wav`) }));
  writeFileSync(join(tmp, 'job.json'), JSON.stringify({ voice: spec.voice ?? 'misteri-cewe', items }));
  process.stderr.write('narasi…\n');
  const r = spawnSync(py, [join(ROOT, 'scripts', 'voice.py'), 'say', join(tmp, 'job.json')], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8', HF_HOME: process.env.HF_HOME ?? 'D:/.hf-cache' } });
  if (r.status !== 0) throw new Error(`narasi gagal: ${(r.stderr ?? '').slice(-300)}`);

  // 2. durasi adegan = narasi + jeda; narasi mulai sedikit setelah adegan muncul
  const scenes = spec.scenes.map((s, i) => {
    const vd = dur(items[i].out), lead = i === 0 ? LEAD : 0.35;
    const tail = i === spec.scenes.length - 1 ? TAIL : GAP - 0.35;
    return { ...s, img: '/' + relative(ROOT, resolve(dirname(specPath), s.img)).replaceAll('\\', '/'), voStart: 0, voDur: vd, lead, dur: lead + vd + tail };
  });
  let t = 0;
  for (const s of scenes) { s.at = t; s.voStart = t + s.lead; t += s.dur; }
  const total = t;
  if (!TEST && (total < MIN_DUR || total > MAX_DUR)) throw new Error(`durasi ${total.toFixed(1)} dtk di luar ${MIN_DUR}–${MAX_DUR} dtk: ${total < MIN_DUR ? 'tambah adegan/narasi' : 'ringkas narasi'} (target 45–55 dtk), atau pakai --test untuk uji coba`);

  // 3. musik sesuai mood video, variasi dari seed; dentuman halus di tiap pergantian adegan
  const music = join(tmp, 'music.wav');
  const seed = spec.seed ?? Math.floor(Math.random() * 1e6);
  spawnSync(process.execPath, [join(ROOT, 'scripts', 'shorts-music.mjs'), music, (total + 0.5).toFixed(2), scenes.slice(1).map((s) => s.at.toFixed(2)).join(','), `--mood=${spec.mood ?? 'misteri'}`, `--seed=${seed}`], { stdio: 'inherit' });

  // 4. frame dari template → ffmpeg
  const srv = await new Promise((ok) => {
    const s = createServer(async (req, res) => {
      const file = join(ROOT, normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)));
      if (!file.startsWith(ROOT)) return res.writeHead(403).end();
      let body;
      try { body = await readFile(file); } catch { return res.writeHead(404).end(); }
      res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream' }).end(body);
    }).listen(0, '127.0.0.1', () => ok(s));
  });
  const b = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch({ channel: 'msedge' }));
  const page = await (await b.newContext({ deviceScaleFactor: 1 })).newPage();
  await page.setViewportSize({ width: 1080, height: 1920 });
  await page.goto(`http://127.0.0.1:${srv.address().port}/templates/shorts/player.html`);
  await page.evaluate((d) => window.setup(d), { tag: spec.tag, scenes: scenes.map(({ img, sub, place, credit, move, dur: d, voStart, voDur }) => ({ img, sub, place, credit, move, dur: d, voStart, voDur })) });

  mkdirSync(dirname(outPath), { recursive: true });
  const T = total.toFixed(2);
  const args = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-i', music];
  const fx = [];
  scenes.forEach((s, i) => { args.push('-i', items[i].out); const ms = Math.round(s.voStart * 1000); fx.push(`[${i + 2}:a]aresample=44100,aformat=channel_layouts=stereo,adelay=${ms}|${ms}[v${i}]`); });
  fx.push(`${scenes.map((_, i) => `[v${i}]`).join('')}amix=inputs=${scenes.length}:normalize=0,aecho=0.8:0.5:70:0.12,volume=1.6,apad[vo]`);
  fx.push('[vo]asplit[v1][v2]', `[1:a]volume=0.42,afade=t=out:st=${(total - 1).toFixed(2)}:d=1[m]`);
  fx.push('[m][v1]sidechaincompress=threshold=0.02:ratio=9:attack=15:release=450[md]');
  fx.push(`[md][v2]amix=inputs=2:normalize=0,atrim=0:${T},loudnorm=I=-14:TP=-1.5:LRA=11[aout]`);
  args.push('-filter_complex', fx.join(';'), '-map', '0:v', '-map', '[aout]', '-t', T, '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-movflags', '+faststart', outPath);
  const ff = spawn(ffmpegPath, args, { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((ok, no) => ff.on('close', (c) => (c === 0 ? ok() : no(new Error(`ffmpeg keluar ${c}`)))));
  const cdp = await page.context().newCDPSession(page);
  const frames = Math.round(total * FPS);
  for (let f = 0; f < frames; f++) {
    await page.evaluate((x) => window.seek(x), f / FPS);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 92, optimizeForSpeed: true });
    const buf = Buffer.from(data, 'base64');
    if (f === Math.round(FPS * 1.5)) await writeFile(outPath.replace(/\.mp4$/, '-cover.jpg'), buf);
    if (!ff.stdin.write(buf)) await new Promise((ok) => ff.stdin.once('drain', ok));
    if (f % 90 === 0) process.stderr.write(`\r  frame ${f}/${frames}`);
  }
  ff.stdin.end();
  await done;
  await b.close(); srv.close();
  process.stderr.write(`\r  frame ${frames}/${frames}\n`);
  console.log(JSON.stringify({ ok: true, out: outPath, mood: spec.mood ?? 'misteri', seed, duration: +total.toFixed(2), scenes: scenes.map((s) => +s.at.toFixed(2)) }));
} finally { rmSync(tmp, { recursive: true, force: true }); }
