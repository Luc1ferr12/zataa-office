#!/usr/bin/env node
// Render konten dari template → JPG (feed/carousel) atau MP4 (video). Pakai Chrome yang sudah terpasang + ffmpeg-static.
//   node scripts/render.mjs <content_id>                      baca template + data_json dari DB → docs/media/<tanggal>/, isi asset_path
//   node scripts/render.mjs try <template> <data.json> [dir]  coba tanpa DB (default: out/)
// Template feed: promo | news | versus | tips | quiz | carousel     Video: video (data.scenes, lihat templates/README.md)
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, extname, normalize, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import ffmpegPath from 'ffmpeg-static';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FEED = ['promo', 'news', 'versus', 'tips', 'quiz', 'carousel'];
const FPS = 30;
const out = (o) => console.log(typeof o === 'string' ? o : JSON.stringify(o));

// ---------- server statis lokal (modul ES tidak bisa dibuka lewat file://)
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
function serve() {
  return new Promise((resolve) => {
    const srv = createServer(async (req, res) => {
      const file = join(ROOT, normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)));
      if (!file.startsWith(ROOT)) return res.writeHead(403).end();
      let body;
      try { body = await readFile(file); } catch { return res.writeHead(404).end(); }
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body);
    }).listen(0, '127.0.0.1', () => resolve(srv));
  });
}
async function browser() {
  for (const o of [{ channel: 'chrome' }, { channel: 'msedge' }, { executablePath: process.env.CHROME_PATH }]) {
    if (o.executablePath === undefined && !o.channel) continue;
    try { return await chromium.launch(o); } catch { /* coba berikutnya */ }
  }
  throw new Error('Chrome/Edge tidak ditemukan. Set CHROME_PATH di .env');
}

// ---------- gambar
async function renderFeed(ctx, template, data, dir, base) {
  const files = { feed: [], story: [] };
  const slides = template === 'carousel' ? data.slides?.length ?? 0 : 1;
  if (template === 'carousel' && !slides) throw new Error('carousel butuh data.slides');
  for (const size of ['feed', 'story']) {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1080, height: size === 'feed' ? 1080 : 1920 }); // IG feed 1:1, TikTok 9:16
    await page.goto(`${ctx.url}/templates/feed/${template}.html`);
    await page.waitForFunction(() => typeof window.render === 'function');
    for (let i = 0; i < slides; i++) {
      await page.evaluate(([d, s, o]) => window.render(d, s, o), [data, size, { slide: i }]);
      const name = `${base}${slides > 1 ? `-${i + 1}` : ''}${size === 'story' ? '-916' : ''}.jpg`;
      await page.screenshot({ path: join(dir, name), type: 'jpeg', quality: 90 });
      files[size].push(name);
    }
    await page.close();
  }
  return files;
}

// ---------- video: seek per frame → JPG → ffmpeg (H.264 + audio senyap / musik)
async function renderVideo(ctx, data, dir, base) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1080, height: 1920 });
  await page.goto(`${ctx.url}/templates/video/player.html`);
  await page.waitForFunction(() => typeof window.setup === 'function');
  const dur = await page.evaluate((d) => window.setup(d), data);
  const frames = Math.round(dur * FPS);
  const mp4 = `${base}.mp4`, cover = `${base}-cover.jpg`;
  const music = data.music ? join(ROOT, 'assets', 'audio', data.music) : null;
  const args = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-'];
  if (music && existsSync(music)) args.push('-i', music, '-map', '0:v', '-map', '1:a', '-af', `afade=t=in:d=0.5,afade=t=out:st=${Math.max(0, dur - 1.5)}:d=1.5`);
  else args.push('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-map', '0:v', '-map', '1:a');
  args.push('-shortest', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', join(dir, mp4));
  const ff = spawn(ffmpegPath, args, { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg keluar ${c}`)))));
  const cdp = await ctx.newCDPSession(page);
  for (let f = 0; f < frames; f++) {
    await page.evaluate((t) => window.seek(t), f / FPS);
    const { data: b64 } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 92, optimizeForSpeed: true });
    const buf = Buffer.from(b64, 'base64');
    if (f === Math.min(frames - 1, Math.round(FPS * 1.2))) await writeFile(join(dir, cover), buf);
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (f % 90 === 0) process.stderr.write(`\r  frame ${f}/${frames}`);
  }
  ff.stdin.end();
  await done;
  process.stderr.write(`\r  frame ${frames}/${frames}\n`);
  await page.close();
  return { video: mp4, cover, duration: +dur.toFixed(2) };
}

async function run(template, data, dir, base) {
  await mkdir(dir, { recursive: true });
  const srv = await serve();
  const b = await browser();
  const ctx = await b.newContext({ deviceScaleFactor: 1 });
  ctx.url = `http://127.0.0.1:${srv.address().port}`;
  try {
    if (template === 'video' || template?.startsWith('video')) return await renderVideo(ctx, data, dir, base);
    if (!FEED.includes(template)) throw new Error(`template tidak dikenal: ${template} (pilihan: ${FEED.join(', ')}, video)`);
    return await renderFeed(ctx, template, data, dir, base);
  } finally {
    await b.close();
    srv.close();
  }
}

// ---------- CLI
const [a1, a2, a3, a4] = process.argv.slice(2);
if (!a1) { out('pakai: render.mjs <content_id> | render.mjs try <template> <data.json> [dir]'); process.exit(0); }

if (a1 === 'try') {
  const data = JSON.parse(readFileSync(a3, 'utf8'));
  const dir = join(ROOT, a4 ?? 'out');
  const res = await run(a2, data, dir, a2);
  out({ ok: true, dir: relative(ROOT, dir), ...res });
} else {
  process.removeAllListeners('warning');
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(join(ROOT, 'db', 'office.db'));
  const c = db.prepare('SELECT * FROM contents WHERE id = ?').get(a1);
  if (!c) { out(`konten ${a1} tidak ada`); process.exit(1); }
  if (!c.data_json) { out(`konten ${a1} belum punya data_json (tugas Copywriter)`); process.exit(1); }
  const template = c.format === 'video' ? 'video' : c.template ?? (c.format === 'carousel' ? 'carousel' : null);
  if (!template) { out(`konten ${a1} belum punya template`); process.exit(1); }
  const slug = String(c.title).toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const rel = join('docs', 'media', c.day);
  const res = await run(template, JSON.parse(c.data_json), join(ROOT, rel), `${c.id}-${slug}`);
  // path relatif repo + URL publik (kalau PUBLIC_BASE_URL di .env, mis. https://user.github.io/repo)
  const env = existsSync(join(ROOT, '.env')) ? Object.fromEntries(readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])) : {};
  const map = (fn) => Object.fromEntries(Object.entries(res).filter(([k]) => k !== 'duration').map(([k, v]) => [k, Array.isArray(v) ? v.map(fn) : fn(v)]));
  const paths = map((f) => `${rel.replaceAll('\\', '/')}/${f}`);
  const base = (env.PUBLIC_BASE_URL ?? process.env.PUBLIC_BASE_URL ?? '').replace(/\/$/, '');
  const urls = base ? map((f) => `${base}/media/${c.day}/${f}`) : null;
  db.prepare("UPDATE contents SET asset_path = ?, asset_url = COALESCE(?, asset_url), template = ?, updated_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify(paths), urls ? JSON.stringify(urls) : null, template, c.id);
  out({ ok: true, id: c.id, ...paths, ...(res.duration ? { duration: res.duration } : {}) });
}
