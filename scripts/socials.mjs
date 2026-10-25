#!/usr/bin/env node
// Analytics semua sosmed untuk dashboard (docs/data/socials.json): IG (Graph API), TikTok (Zernio), YouTube Shorts (youtube.mjs stats).
// Zataa Story punya akun sendiri: story_youtube (youtube.mjs stats --brand=story) & story_tiktok (Zernio akun 2, ZERNIO_STORY_API_KEY).
// Per platform: jumlah post (video/foto/carousel), views, likes, komentar, follower/subscriber, top konten. Tanpa AI → 0 token.
// Watcher panggil socialsTick() tiap menit, narik ulang kalau data sudah >1 jam.
//   node scripts/socials.mjs collect     tarik sekarang + tulis docs/data/socials.json
process.removeAllListeners('warning');
import { writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadEnv, db } from './approval.mjs';
import { api as zernio } from './zernio.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'data', 'socials.json');
const EVERY = 3600_000;
const env = () => ({ ...loadEnv(), ...process.env });
const sum = (list, k) => list.reduce((a, p) => a + (p[k] ?? 0), 0);
const short = (s, n = 70) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const top = (list, n = 3) => [...list].sort((a, b) => (b.views ?? -1) - (a.views ?? -1) || b.likes - a.likes).slice(0, n);
function summary(list, extra) {
  const count = { total: list.length, video: 0, foto: 0, carousel: 0 };
  for (const p of list) count[p.type] += 1;
  const hasViews = list.some((p) => p.views != null);
  return { ...extra, list, posts: count, views: hasViews ? sum(list, 'views') : null, likes: sum(list, 'likes'), comments: sum(list, 'comments'), top: top(list) };
}

// ---------- Instagram (Graph API, token & IG_USER_ID sama dengan publish.mjs)
async function graph(path, params = {}) {
  const e = env();
  const r = await fetch(`https://graph.facebook.com/${e.GRAPH_VERSION || 'v23.0'}/${path}?${new URLSearchParams({ ...params, access_token: e.IG_ACCESS_TOKEN ?? '' })}`);
  const j = await r.json();
  if (j.error) throw new Error(`IG: ${j.error.message}`.replace(/EAA[A-Za-z0-9]{10,}/g, 'EAA…'));
  return j;
}
async function instagram() {
  const id = env().IG_USER_ID;
  if (!env().IG_ACCESS_TOKEN || !id) throw new Error('IG_ACCESS_TOKEN / IG_USER_ID belum ada');
  const acc = await graph(id, { fields: 'username,followers_count,media_count' });
  const media = [];
  let next = `${id}/media`, params = { fields: 'id,caption,media_type,media_product_type,like_count,comments_count,permalink,timestamp,thumbnail_url,media_url', limit: 50 };
  while (next && media.length < 300) {
    const j = await graph(next, params);
    media.push(...(j.data ?? []));
    next = j.paging?.cursors?.after && j.paging?.next ? `${id}/media` : null;
    params = { ...params, after: j.paging?.cursors?.after };
  }
  // views per post (insights); gagal (izin/post lama) = null, tidak menggagalkan semuanya
  const views = new Map();
  for (let i = 0; i < media.length; i += 10) {
    await Promise.all(media.slice(i, i + 10).map(async (m) => {
      try { const j = await graph(`${m.id}/insights`, { metric: 'views' }); views.set(m.id, j.data?.[0]?.values?.[0]?.value ?? j.data?.[0]?.total_value?.value ?? null); } catch { /* lewati */ }
    }));
  }
  const list = media.map((m) => ({
    type: m.media_type === 'VIDEO' || m.media_product_type === 'REELS' ? 'video' : m.media_type === 'CAROUSEL_ALBUM' ? 'carousel' : 'foto',
    title: short(m.caption), url: m.permalink, thumb: m.thumbnail_url ?? m.media_url ?? null, at: m.timestamp,
    views: views.get(m.id) ?? null, likes: m.like_count ?? 0, comments: m.comments_count ?? 0,
  }));
  return summary(list, { handle: `@${acc.username}`, url: `https://instagram.com/${acc.username}`, followers: acc.followers_count ?? null });
}

// ---------- TikTok (Zernio analytics, termasuk post yang di-upload manual)
async function tiktok(keyEnv = 'ZERNIO_API_KEY', fallback = 'zataa.topup') {
  if (!env()[keyEnv]) throw new Error(`${keyEnv} belum ada`);
  const from = new Date(Date.now() - 365 * 86400_000).toISOString().slice(0, 10);
  const posts = [];
  let account = null;
  for (let page = 1; page <= 10; page++) {
    const j = await zernio(`/analytics?platform=tiktok&fromDate=${from}&limit=100&page=${page}`, { keyEnv });
    posts.push(...(j.posts ?? []));
    account ??= j.accounts?.find((a) => a.platform === 'tiktok');
    if (page >= (j.pagination?.pages ?? 1)) break;
  }
  const list = posts.filter((p) => p.status === 'published').map((p) => ({
    pid: p.platforms?.find((x) => x.platform === 'tiktok')?.platformPostId ?? null,
    type: p.mediaType === 'video' ? 'video' : (p.mediaItems?.length ?? 0) > 1 ? 'carousel' : 'foto',
    title: short(p.content), text: p.content ?? '', url: p.platformPostUrl?.split('?')[0] ?? null, thumb: p.thumbnailUrl ?? null, at: p.publishedAt,
    views: p.analytics?.views ?? null, likes: p.analytics?.likes ?? 0, comments: p.analytics?.comments ?? 0,
  }));
  const handle = account?.username ?? fallback;
  return summary(list, { handle: `@${handle}`, url: `https://www.tiktok.com/@${handle}`, followers: account?.followersCount ?? null });
}

// ---------- YouTube Shorts (youtube.mjs stats, token pemilik channel)
const ytStats = (brand = 'history') => new Promise((ok, no) => execFile(process.execPath, [join(ROOT, 'scripts', 'youtube.mjs'), 'stats', `--brand=${brand}`], { cwd: ROOT, timeout: 120_000, maxBuffer: 1 << 23 },
  (e, so, se) => { if (e) return no(new Error(String(se || e.message).trim().split('\n').pop())); try { ok(JSON.parse(String(so).trim().split('\n').pop())); } catch (x) { no(x); } }));
async function youtube(brand = 'history') {
  const s = await ytStats(brand);
  const list = (s.list ?? []).filter((v) => v.privacy === 'public').map((v) => ({
    pid: v.id, type: 'video', title: short(v.title), url: `https://youtube.com/shorts/${v.id}`, thumb: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`, at: v.published,
    views: v.views, likes: v.likes, comments: v.comments,
  }));
  const handle = s.handle ?? (brand === 'story' ? '' : '@zataastory');
  return { ...summary(list, { name: s.title ?? null, handle, url: handle ? `https://youtube.com/${handle}` : null, subscribers: s.subscribers }), views: Math.max(s.views ?? 0, sum(list, 'views')) }; // statistik channel YouTube sering telat, jumlah per video lebih segar
}

// snapshot views/likes/komentar per konten kantor ke tabel metrics (IG sudah dicatat Raka di analyst.mjs)
async function record(platform, col, list) {
  const d = await db();
  const find = d.prepare(`SELECT id FROM contents WHERE ${col} = ?`);
  const ins = d.prepare('INSERT INTO metrics (content_id, platform, views, likes, comments) VALUES (?, ?, ?, ?, ?)');
  for (const p of list) {
    const c = (p.pid && find.get(String(p.pid))) || (platform === 'tiktok' && linkTiktok(d, p));
    if (c) ins.run(c.id, platform, p.views ?? 0, p.likes ?? 0, p.comments ?? 0);
  }
}
// tiktok_id dari publish (Zernio/TikTok "v_pub_…") atau 'manual' ≠ id video di analytics → cocokkan sekali lewat jam tayang (±20 mnt)
// atau awal caption, lalu simpan id video asli + jam tayang TikTok (tiktok_at, buat analisa jam terbaik per platform)
function linkTiktok(d, p) {
  if (!p.pid || !p.at) return null;
  const at = new Date(p.at).toISOString().slice(0, 19).replace('T', ' ');
  const head = String(p.text ?? '').replace(/s+/g, ' ').trim().slice(0, 40);
  const c = d.prepare(`SELECT id FROM contents WHERE tiktok_id IS NOT NULL AND tiktok_id NOT GLOB '[0-9]*'
      AND (ABS(strftime('%s', posted_at) - strftime('%s', ?)) <= 1200 OR (? != '' AND substr(replace(replace(caption, char(10), ' '), '  ', ' '), 1, 40) = ?))
    ORDER BY ABS(strftime('%s', posted_at) - strftime('%s', ?)) LIMIT 1`).get(at, head, head, at);
  if (c) d.prepare('UPDATE contents SET tiktok_id = ?, tiktok_at = ? WHERE id = ?').run(String(p.pid), at, c.id);
  return c;
}

export async function collect() {
  const out = { generated_at: new Date().toISOString() };
  const all = {};
  const KEYS = [['instagram', instagram], ['tiktok', () => tiktok()], ['youtube', () => youtube()], ['story_youtube', () => youtube('story')], ['story_tiktok', () => tiktok('ZERNIO_STORY_API_KEY', 'zataa.story')]];
  for (const [k, fn] of KEYS) {
    try { out[k] = await fn(); all[k] = out[k].list; delete out[k].list; } catch (e) { out[k] = { error: e.message.slice(0, 160) }; }
  }
  await record('tiktok', 'tiktok_id', all.tiktok ?? []).catch(() => {});
  await record('youtube', 'youtube_id', all.youtube ?? []).catch(() => {});
  await record('youtube', 'youtube_id', all.story_youtube ?? []).catch(() => {});
  await record('tiktok', 'tiktok_id', all.story_tiktok ?? []).catch(() => {});
  for (const k of Object.keys(all)) for (const p of out[k].top ?? []) { delete p.pid; delete p.text; }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
  return Object.fromEntries(KEYS.map(([k]) => k).map((k) => [k, out[k].error ? `gagal: ${out[k].error}` : `${out[k].posts.total} post`]));
}

// dipanggil watcher tiap menit: tarik ulang kalau file belum ada / sudah >1 jam
let busy = false;
export async function socialsTick() {
  if (busy || (existsSync(OUT) && Date.now() - statSync(OUT).mtimeMs < EVERY)) return null;
  busy = true;
  try { return await collect(); } finally { busy = false; }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (process.argv[2] === 'collect') console.log(JSON.stringify(await collect()));
  else { console.log('pakai: node scripts/socials.mjs collect'); process.exit(1); }
}
