#!/usr/bin/env node
// Intip pesaing (0 token): Shorts mana yang meledak dibanding median channelnya sendiri. Dipakai manajer Shorts (office/daily.md §3U).
// Daftar channel per brand: office/youtube/rivals-<brand>.txt (1 URL/@handle per baris, # = komentar), diisi manajer.
//   node scripts/rival.mjs --brand=cowo                 cek semua channel di daftar
//   node scripts/rival.mjs --brand=cowo @satu @dua      cek channel tertentu (tanpa mengubah daftar)
// Butuh yt-dlp (halaman publik, tanpa login). Tanggal upload nggak tersedia → yang dilihat 40 Shorts terbaru tiap channel.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_CHANNELS = 10, LATEST = 40, MIN_VIDEOS = 5;

export function channelUrl(x) {
  const s = String(x).trim().replace(/\/(shorts|videos|featured)?\/?$/, '');
  if (s.startsWith('@')) return `https://www.youtube.com/${s}/shorts`;
  return /^https:\/\/(www\.)?youtube\.com\/(@[^/?#]+|channel\/[\w-]+|c\/[^/?#]+)$/.test(s) ? `${s}/shorts` : null;
}
export function outliers(channel, entries, min = 2) {
  const v = entries.filter((e) => Number.isFinite(e.view_count));
  if (v.length < MIN_VIDEOS) return [];
  const s = v.map((e) => e.view_count).sort((a, b) => a - b);
  const median = (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2;
  if (!median) return [];
  return v.filter((e) => e.view_count >= median * min).map((e) => ({ x: Math.round((e.view_count / median) * 10) / 10, views: e.view_count, channel, judul: String(e.title ?? '').slice(0, 90), url: e.url }));
}

function fetchChannel(url) {
  const r = spawnSync('yt-dlp', ['--flat-playlist', '--playlist-end', String(LATEST), '--no-warnings', '-J', url], { encoding: 'utf8', timeout: 90_000, maxBuffer: 1 << 26 });
  if (r.error?.code === 'ENOENT') throw new Error('yt-dlp tidak terpasang');
  if (r.status !== 0) throw new Error((r.stderr || r.error?.message || 'yt-dlp gagal').trim().split('\n').pop().slice(0, 160));
  return JSON.parse(r.stdout);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const brand = process.argv.find((a) => a.startsWith('--brand='))?.slice(8);
  let list = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (!list.length) {
    if (!/^(history|story|marvel|cowo)$/.test(brand ?? '')) { console.log('pakai: rival.mjs --brand=history|story|marvel|cowo [@channel …]'); process.exit(1); }
    try { list = readFileSync(join(ROOT, 'office', 'youtube', `rivals-${brand}.txt`), 'utf8').split(/\r?\n/).map((l) => l.replace(/(^|\s)#.*/, '').trim()).filter(Boolean); } catch { list = []; }
  }
  if (!list.length) { console.log(JSON.stringify({ ok: false, error: `daftar kosong: isi office/youtube/rivals-${brand}.txt dengan 3–8 channel sejenis` })); process.exit(1); }
  const found = [], gagal = [];
  let dicek = 0;
  for (const x of list.slice(0, MAX_CHANNELS)) {
    const url = channelUrl(x);
    if (!url) { gagal.push(`${x}: bukan URL channel YouTube`); continue; }
    try { const j = fetchChannel(url); found.push(...outliers(j.channel ?? x, j.entries ?? [])); dicek++; } catch (e) { gagal.push(`${x}: ${e.message}`); }
  }
  console.log(JSON.stringify({ ok: dicek > 0, dicek, ...(gagal.length ? { gagal } : {}), meledak: found.sort((a, b) => b.x - a.x).slice(0, 12) }, null, 1));
  if (!dicek) process.exit(1);
}
