#!/usr/bin/env node
// Loop belajar Shorts: tarik views/likes/retensi tiap video dari Zernio → video_stats, evaluasi eksperimen mingguan, kirim laporan belajar. 0 token.
//   node scripts/learn.mjs collect [--brand=story]   tarik angka sekarang (semua brand kalau tanpa --brand)
//   node scripts/learn.mjs report  [--brand=story]   cetak laporan belajar (pola + eksperimen) tanpa kirim
//   node scripts/learn.mjs exp     [--brand=story]   eksperimen minggu ini + varian yang dibutuhkan video berikutnya
//   node scripts/learn.mjs decide <brand> <variabel> <varian|none>   putuskan manual pemenang eksperimen minggu ini
//   node scripts/learn.mjs weekly  [--brand=story]   kirim laporan belajar ke bot brand sekarang
// Watcher memanggil learnTick(): collect tiap ±6 jam, Minggu 19:45 WITA kirim laporan belajar + simpan 1 pelajaran ke memori manajer.
process.removeAllListeners('warning');
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openDb } from './db.mjs';
import { BRANDS } from './brand.mjs';
import { api } from './zernio.mjs';
import { wita } from '../docs/js/schedule.js';
import { ensure, todayWita, addDays, experimentFor, neededVariant, VARIABLES, settle, patternLines, weeklyText, lockedWinners } from './learn-core.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATE = join(ROOT, 'tmp', 'learn-state.json');
const rd = () => { try { return JSON.parse(readFileSync(STATE, 'utf8')); } catch { return {}; } };
const wr = (s) => { mkdirSync(dirname(STATE), { recursive: true }); writeFileSync(STATE, JSON.stringify(s)); };
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400_000);

async function pages(path, keyEnv) {
  const from = addDays(todayWita(), -120);
  const posts = [];
  let accounts = [];
  for (let page = 1; page <= 10; page++) {
    const j = await api(`${path}&fromDate=${from}&limit=100&page=${page}`, { keyEnv });
    if (!accounts.length) accounts = j.accounts ?? [];
    posts.push(...(j.posts ?? []));
    if (page >= (j.pagination?.pages ?? 1)) break;
  }
  return { posts, accounts };
}

// retensi per video (YouTube Analytics via Zernio, telat ±2 hari). Field dibaca longgar; kosong = tidak ada datanya.
async function retention(videoId, accountId, keyEnv) {
  const j = await api(`/analytics/youtube/daily-views?videoId=${videoId}&accountId=${accountId}`, { keyEnv });
  const rows = [j.dailyViews, j.data, j.days, j.rows, j.views].find(Array.isArray) ?? [];
  let apv = 0, avd = 0, subs = 0, w = 0;
  for (const r of rows) {
    const vv = +(r.views ?? 0); subs += +(r.subscribersGained ?? 0);
    if (r.averageViewPercentage != null) { apv += r.averageViewPercentage * (vv || 1); avd += +(r.averageViewDuration ?? 0) * (vv || 1); w += vv || 1; }
  }
  return rows.length ? { apv: w ? apv / w : null, avd: w ? avd / w : null, subs } : null;
}

export async function collect(brandKey) {
  const b = BRANDS[brandKey];
  const d = openDb(); ensure(d);
  const today = todayWita();
  const cs = d.prepare(`SELECT id, day, title, youtube_id, tiktok_id FROM contents WHERE channel = ? AND status = 'posted' AND youtube_id IS NOT NULL
    AND day >= ? AND COALESCE(json_extract(data_json, '$._test'), 0) = 0`).all(b.channel, addDays(today, -90));
  const res = { brand: brandKey, videos: cs.length, saved: 0, retention: 0, errors: [] };
  if (!cs.length) return res;
  const up = d.prepare(`INSERT INTO video_stats (content_id, brand, platform, day, age_days, views, likes, comments) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(content_id, platform, day) DO UPDATE SET views = excluded.views, likes = excluded.likes, comments = excluded.comments, age_days = excluded.age_days, captured_at = datetime('now')`);
  let yt;
  try { yt = await pages('/analytics?platform=youtube', b.zernioEnv); } catch (e) { res.errors.push(`youtube: ${e.message}`); return res; }
  const byId = new Map();
  for (const p of yt.posts) {
    if (p.status !== 'published') continue;
    const pl = p.platforms?.find((x) => x.platform === 'youtube') ?? {};
    const id = pl.platformPostId ?? (pl.platformPostUrl ?? '').split('v=')[1];
    if (id) byId.set(id, p.analytics ?? {});
  }
  for (const c of cs) {
    const a = byId.get(c.youtube_id);
    if (!a) continue;
    up.run(c.id, brandKey, 'youtube', today, daysBetween(c.day, today), a.views ?? 0, a.likes ?? 0, a.comments ?? 0);
    res.saved++;
  }
  // retensi: video umur 2–14 hari yang belum punya angka retensi (maks 5 per jalan, kuota YouTube Analytics di Zernio terbatas)
  const acc = yt.accounts.find((a) => a.platform === 'youtube')?._id;
  if (acc) {
    const need = cs.filter((c) => { const age = daysBetween(c.day, today); return age >= 2 && age <= 14 && !d.prepare("SELECT 1 FROM video_stats WHERE content_id = ? AND platform = 'youtube' AND apv IS NOT NULL").get(c.id); }).slice(0, 5);
    for (const c of need) {
      try {
        const r = await retention(c.youtube_id, acc, b.zernioEnv);
        if (r?.apv != null) { d.prepare("UPDATE video_stats SET apv = ?, avd = ?, subs = ? WHERE content_id = ? AND platform = 'youtube' AND day = ?").run(r.apv, r.avd, r.subs, c.id, today); res.retention++; }
      } catch (e) { if (/429|quota/i.test(e.message)) { res.errors.push('kuota retensi habis'); break; } }
    }
  }
  // TikTok brand (kalau ada): dicocokkan lewat baris pertama caption = judul
  if (b.tiktok && cs.some((c) => c.tiktok_id)) {
    try {
      const tt = await pages('/analytics?platform=tiktok', b.zernioEnv);
      const byTitle = new Map(tt.posts.filter((p) => p.status === 'published').map((p) => [String(p.content ?? '').split('\n')[0].trim(), p.analytics ?? {}]));
      for (const c of cs.filter((x) => x.tiktok_id)) {
        const a = byTitle.get(c.title.trim());
        if (a) up.run(c.id, brandKey, 'tiktok', today, daysBetween(c.day, today), a.views ?? 0, a.likes ?? 0, a.comments ?? 0);
      }
    } catch (e) { res.errors.push(`tiktok: ${e.message.slice(0, 80)}`); }
  }
  return res;
}

export function report(brandKey) { const d = openDb(); ensure(d); return weeklyText(d, brandKey); }

const NAMA_PUB = (k) => BRANDS[k].team.publish;
function sendWeekly(brandKey, text) {
  execFileSync(process.execPath, [join(ROOT, 'scripts', 'shorts-bot.mjs'), 'say', NAMA_PUB(brandKey), text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]).slice(0, 3900), `--brand=${brandKey}`], { cwd: ROOT, encoding: 'utf8', windowsHide: true });
}
// 1 pelajaran/minggu ke memori manajer (muncul di `office.mjs brief`), diambil dari pola paling jelas
function remember(d, brandKey) {
  const { lines } = patternLines(d, brandKey);
  const i = lines.indexOf('POLA:');
  const first = i >= 0 ? lines[i + 1] : null;
  if (!first || /^belum ada selisih/.test(first)) return null;
  const note = `[data ${todayWita()}] ${first}`;
  const dir = BRANDS[brandKey].team.dir;
  if (d.prepare("SELECT 1 FROM memories WHERE agent_id = ? AND note = ?").get(dir, note)) return null;
  d.prepare("INSERT INTO memories (agent_id, kind, note) VALUES (?, 'lesson', ?)").run(dir, note);
  return note;
}

export async function learnTick(log = console.log) {
  const st = rd();
  const t = wita(new Date());
  const out = {};
  if (Date.now() - (st.collectAt ?? 0) >= 6 * 3600_000) {
    st.collectAt = Date.now(); wr(st);
    for (const k of Object.keys(BRANDS)) {
      try { out[k] = await collect(k); } catch (e) { out[k] = { error: e.message }; log(`learn collect ${k} gagal: ${e.message}`); }
      try { const s = settle(openDb(), k); if (s.length) log(`learn ${k} keputusan eksperimen: ${JSON.stringify(s)}`); } catch (e) { log(`learn settle ${k} gagal: ${e.message}`); }
    }
  }
  if (t.minutes >= 19 * 60 + 45 && new Date(`${t.date}T00:00:00Z`).getUTCDay() === 0 && rd().weeklyDate !== t.date) {
    const s2 = rd(); s2.weeklyDate = t.date; wr(s2);
    for (const k of Object.keys(BRANDS)) {
      try { const d = openDb(); ensure(d); remember(d, k); sendWeekly(k, weeklyText(d, k)); out[`weekly_${k}`] = 'terkirim'; } catch (e) { log(`learn weekly ${k} gagal: ${e.message}`); }
    }
  }
  return Object.keys(out).length ? out : null;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [cmd, a, b, c] = process.argv.slice(2).filter((x) => !x.startsWith('--brand='));
  const arg = process.argv.find((x) => x.startsWith('--brand='));
  const brands = arg ? [arg.slice(8)] : Object.keys(BRANDS);
  try {
    if (cmd === 'collect') for (const k of brands) console.log(JSON.stringify(await collect(k)));
    else if (cmd === 'report') for (const k of brands) console.log(report(k) + '\n');
    else if (cmd === 'exp') for (const k of brands) {
      const d = openDb(); ensure(d);
      const e = experimentFor(d, k);
      console.log(JSON.stringify({ brand: k, week: e.week, variabel: e.variable, label: VARIABLES[e.variable].label, varian: e.variants, dibutuhkan: neededVariant(d, k, e), pemenang_terkunci: lockedWinners(d, k) }));
    } else if (cmd === 'weekly') for (const k of brands) { const d = openDb(); ensure(d); remember(d, k); sendWeekly(k, weeklyText(d, k)); console.log(`${k} terkirim`); }
    else if (cmd === 'decide' && a && b && c) {
      const d = openDb(); ensure(d);
      const e = experimentFor(d, a);
      if (e.variable !== b) throw new Error(`variabel minggu ini ${e.variable}, bukan ${b}`);
      d.prepare('UPDATE experiments SET decision = ?, notes = ? WHERE id = ?').run(c === 'none' ? 'none' : `winner:${c}`, 'diputuskan manual', e.id);
      console.log('ok');
    } else console.log('pakai: collect | report | exp | weekly [--brand=history|story|marvel] · decide <brand> <variabel> <varian|none>');
  } catch (e) { console.error(e.message); process.exit(1); }
}
