#!/usr/bin/env node
// Render konten dari template → JPG (feed/carousel) atau MP4 (video). Pakai Chrome yang sudah terpasang + ffmpeg-static.
//   node scripts/render.mjs <content_id>                      baca template + data_json dari DB → docs/media/<tanggal>/, isi asset_path
//   node scripts/render.mjs try <template> <data.json> [dir]  coba tanpa DB (default: out/)
// Template feed: promo | news | versus | tips | quiz | carousel     Video: video (data.scenes, lihat templates/README.md)
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { readFileSync, existsSync, readdirSync, mkdtempSync, rmSync, statSync, createReadStream } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir, homedir } from 'node:os';
import { join, extname, normalize, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import ffmpegPath from 'ffmpeg-static';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FEED = ['promo', 'news', 'versus', 'tips', 'quiz', 'carousel'];
const FPS = 30;
const out = (o) => console.log(typeof o === 'string' ? o : JSON.stringify(o));

// ---------- server statis lokal (modul ES tidak bisa dibuka lewat file://)
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm' };
function serve() {
  return new Promise((resolve) => {
    const srv = createServer(async (req, res) => {
      const file = join(ROOT, normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)));
      if (!file.startsWith(ROOT)) return res.writeHead(403).end();
      // video latar butuh Range (seek)
      const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
      if (range && existsSync(file)) {
        const size = statSync(file).size, a = +range[1] || 0, z = range[2] ? +range[2] : size - 1;
        res.writeHead(206, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Content-Range': `bytes ${a}-${z}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': z - a + 1 });
        return createReadStream(file, { start: a, end: z }).pipe(res);
      }
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

// ---------- voice over (Microsoft Edge TTS "Gadis", gratis) — intonasi lewat mood per adegan
const VOICE = 'id-ID-GadisNeural';
const MOOD = {
  hype: { rate: '+12%', pitch: '+8Hz' },   // berita hype, hasil match, hook
  promo: { rate: '+8%', pitch: '+5Hz' },   // ajakan beli, harga
  tanya: { rate: '+0%', pitch: '+6Hz' },   // nanya ke penonton (akhiri teks dengan "?")
  info: { rate: '+5%', pitch: '+0Hz' },    // ngasih tau / jelasin
  santai: { rate: '-2%', pitch: '-2Hz' },  // ngobrol, tips
  haru: { rate: '-10%', pitch: '-6Hz' },   // pensiun, perpisahan, kalah
};
const moodOf = (s, style) => s.mood ?? (/\?\s*$/.test(s.vo) ? 'tanya' : style === 'tribute' ? 'haru' : s.t === 'cta' || s.t === 'price' ? 'promo' : s.t === 'hook' || ['glitch', 'flash'].includes(style) ? 'hype' : 'info');
function ttsCmd() {
  const venv = join(homedir(), '.venv-tts', 'bin', 'edge-tts');
  if (existsSync(venv)) return [venv, []];
  return [process.platform === 'win32' ? 'python' : 'python3', ['-m', 'edge_tts']];
}
const mediaDur = (file) => {
  const r = spawnSync(ffmpegPath, ['-i', file, '-f', 'null', '-'], { encoding: 'utf8' });
  const m = [...(r.stderr ?? '').matchAll(/time=(\d+):(\d+):([\d.]+)/g)].pop();
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
};
async function voiceOver(scenes, style, dir) {
  const [bin, pre] = ttsCmd();
  const res = [];
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    if (!s.vo) { res.push(null); continue; }
    const p = MOOD[moodOf(s, style)] ?? MOOD.info;
    const file = join(dir, `vo-${i}.mp3`);
    const text = s.vo.replace(/zataa\.my\.id/gi, 'Zataa');
    const r = spawnSync(bin, [...pre, '--voice', VOICE, `--rate=${p.rate}`, `--pitch=${p.pitch}`, '--text', text, '--write-media', file], { encoding: 'utf8' });
    if (r.status !== 0 || !existsSync(file)) throw new Error(`voice over gagal (adegan ${i + 1}): ${(r.stderr || r.error?.message || '').slice(-200)}`);
    res.push({ file, dur: mediaDur(file) });
  }
  return res;
}
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
// musik latar: data.music (nama file) | "none" | otomatis acak dari assets/audio/bg-*.mp3
function chooseMusic(data) {
  if (data.music === 'none') return null;
  const dir = join(ROOT, 'assets', 'audio');
  if (data.music) return existsSync(join(dir, data.music)) ? data.music : null;
  const all = existsSync(dir) ? readdirSync(dir).filter((f) => /^bg-.*\.mp3$/.test(f)) : [];
  // tribute (pensiun/perpisahan) jangan kebagian lagu hype
  const calm = all.filter((f) => /chill|retro/.test(f));
  return all.length ? pick(data.style === 'tribute' && calm.length ? calm : all) : null;
}
// klip gameplay latar: data.bg (path repo) | "none" | otomatis acak dari assets/clips/<game>/
function chooseClip(data) {
  if (data.bg === 'none') return null;
  if (data.bg) return existsSync(join(ROOT, data.bg)) ? data.bg.replaceAll('\\', '/') : null;
  // prioritas: gameplay asli di assets/clips/<game>/ → kalau kosong, klip suasana (HP untuk game mobile, PC untuk Valorant, + arena)
  const g = data.game ?? 'other';
  const files = (sub) => { const d = join(ROOT, 'assets', 'clips', sub); return existsSync(d) ? readdirSync(d).filter((f) => /\.(mp4|webm)$/i.test(f)).map((f) => `assets/clips/${sub}/${f}`) : []; };
  const own = files(g);
  if (own.length) return pick(own);
  const mood = { mlbb: ['mobile', 'arena'], freefire: ['mobile', 'arena'], valorant: ['pc', 'arena'] }[g] ?? ['mobile', 'pc', 'arena'];
  const all = mood.flatMap(files);
  return all.length ? pick(all) : null;
}

// ---------- video: seek per frame → JPG → ffmpeg (H.264 + voice over + musik latar)
async function renderVideo(ctx, data, dir, base) {
  const tmp = mkdtempSync(join(tmpdir(), 'zataa-vo-'));
  try {
    data = structuredClone(data);
    const scenes = [...(data.scenes ?? [])];
    const anyVo = scenes.some((s) => s.vo);
    if (!scenes.some((s) => s.t === 'cta')) scenes.push({ t: 'cta', ...(anyVo ? { vo: 'Top up sekarang, cuma di Zataa!' } : {}) });
    const vo = anyVo ? await voiceOver(scenes, data.style, tmp) : [];
    if (anyVo) { // adegan minimal sepanjang suaranya
      scenes.forEach((s, i) => { if (vo[i]) s.dur = Math.max(s.dur ?? 0, vo[i].dur + 0.55); });
      data.fixed = true;
    }
    data.scenes = scenes;
    const music = chooseMusic(data);
    const clip = chooseClip(data);
    if (clip) data.bg = `/${clip}`; else delete data.bg;

    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1080, height: 1920 });
    await page.goto(`${ctx.url}/templates/video/player.html`);
    await page.waitForFunction(() => typeof window.setup === 'function');
    const { total: dur, starts } = await page.evaluate((d) => window.setup(d), data);
    const frames = Math.round(dur * FPS);
    const mp4 = `${base}.mp4`, cover = `${base}-cover.jpg`;

    const args = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-'];
    const fx = [];
    let n = 1, musicIn = null;
    if (music) { args.push('-stream_loop', '-1', '-i', join(ROOT, 'assets', 'audio', music)); musicIn = n++; }
    const voIn = [];
    vo.forEach((v, i) => { if (v) { args.push('-i', v.file); voIn.push({ idx: n++, at: Math.round((starts[i] + 0.15) * 1000) }); } });
    const T = dur.toFixed(2);
    const fade = `afade=t=in:d=0.4,afade=t=out:st=${Math.max(0, dur - 1.2).toFixed(2)}:d=1.2`;
    if (voIn.length) {
      voIn.forEach((v, k) => fx.push(`[${v.idx}:a]adelay=${v.at}|${v.at},volume=1.9[v${k}]`));
      fx.push(`${voIn.map((_, k) => `[v${k}]`).join('')}amix=inputs=${voIn.length}:normalize=0,apad[vo]`);
      if (musicIn) {
        fx.push('[vo]asplit[vo1][vo2]');
        fx.push(`[${musicIn}:a]atrim=0:${T},volume=0.42,${fade}[m]`);
        fx.push('[m][vo1]sidechaincompress=threshold=0.02:ratio=9:attack=15:release=350[md]');
        fx.push(`[md][vo2]amix=inputs=2:normalize=0,atrim=0:${T},alimiter=limit=0.95[aout]`);
      } else fx.push(`[vo]atrim=0:${T},alimiter=limit=0.95[aout]`);
    } else if (musicIn) fx.push(`[${musicIn}:a]atrim=0:${T},volume=0.8,${fade}[aout]`);
    if (fx.length) args.push('-filter_complex', fx.join(';'), '-map', '0:v', '-map', '[aout]');
    else args.push('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-map', '0:v', '-map', `${n}:a`, '-shortest');
    args.push('-t', T, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-movflags', '+faststart', join(dir, mp4));
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
    return { video: mp4, cover, duration: +dur.toFixed(2), music: music ?? 'none', bg: clip ?? 'none', vo: voIn.length };
  } finally { rmSync(tmp, { recursive: true, force: true }); }
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
  const map = (fn) => Object.fromEntries(Object.entries(res).filter(([k]) => !['duration', 'music', 'bg', 'vo'].includes(k)).map(([k, v]) => [k, Array.isArray(v) ? v.map(fn) : fn(v)]));
  const paths = map((f) => `${rel.replaceAll('\\', '/')}/${f}`);
  const base = (env.PUBLIC_BASE_URL ?? process.env.PUBLIC_BASE_URL ?? '').replace(/\/$/, '');
  const urls = base ? map((f) => `${base}/media/${c.day}/${f}`) : null;
  db.prepare("UPDATE contents SET asset_path = ?, asset_url = COALESCE(?, asset_url), template = ?, updated_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify(paths), urls ? JSON.stringify(urls) : null, template, c.id);
  out({ ok: true, id: c.id, ...paths, ...(res.duration ? { duration: res.duration, music: res.music, bg: res.bg, vo: res.vo } : {}) });
}
