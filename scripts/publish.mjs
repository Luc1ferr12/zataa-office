#!/usr/bin/env node
// Auto-post konten yang sudah di-Approve Owner: IG (Graph API) + TikTok (Content Posting API, private/SELF_ONLY).
// Dipanggil watcher tiap menit (publishDue). Tanpa AI → 0 token.
//   node scripts/publish.mjs due              posting semua konten approved yang jam slot-nya (WIB) sudah lewat
//   node scripts/publish.mjs now <id>         posting 1 konten sekarang juga (abaikan jam slot)
//   node scripts/publish.mjs ig-check         cek token & akun IG
//   node scripts/publish.mjs ig-id            cari IG_USER_ID dari token, simpan ke .env
//   node scripts/publish.mjs ig-page-token    ganti User token (sudah di-extend) → Page token permanen
//   node scripts/publish.mjs tiktok-login     cetak link login TikTok (sekali saja)
//   node scripts/publish.mjs tiktok-code <url-atau-code>   tukar code hasil login → token disimpan ke .env
process.removeAllListeners('warning');
import { existsSync, statSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { loadEnv, setEnv, sayAs, SLOT, targets } from './approval.mjs';
import { chat } from './chatter.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// jangan pernah bocorkan token ke log/Telegram (pesan error Meta kadang memuatnya)
const hide = (m) => String(m).replace(/EAA[A-Za-z0-9]{10,}/g, 'EAA…');
const out = (o) => console.log(typeof o === 'string' ? o : JSON.stringify(o));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = () => ({ ...loadEnv(), ...process.env }); // baca ulang tiap kali: watcher jalan lama, .env bisa berubah

async function db() {
  const { DatabaseSync } = await import('node:sqlite');
  return new DatabaseSync(join(ROOT, 'db', 'office.db'));
}
const activity = (d, agent, msg) => d.prepare('INSERT INTO activity (agent_id, message) VALUES (?, ?)').run(agent, msg);
const setAgent = (d, status, task = null) => d.prepare("UPDATE agents SET status = ?, current_task = ?, updated_at = datetime('now') WHERE id = 'publisher'").run(status, task);

// ---------- URL publik (GitHub Pages): IG menarik file dari URL, jadi docs/media harus sudah ter-push
function publicUrl(rel) {
  const base = (env().PUBLIC_BASE_URL ?? '').replace(/\/$/, '');
  if (!base) throw new Error('PUBLIC_BASE_URL belum diisi di .env (URL GitHub Pages)');
  return `${base}/${rel.replace(/^docs\//, '')}`;
}
function pushMedia() {
  if (!existsSync(join(ROOT, '.git'))) throw new Error('folder ini belum repo git (GitHub Pages belum di-setup)');
  const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', windowsHide: true });
  git('add', 'docs');
  if (git('status', '--porcelain', 'docs').trim()) git('commit', '-m', 'media: aset konten siap posting');
  git('push');
}
async function waitOnline(urls) {
  for (let i = 0; i < 30; i++) { // GitHub Pages butuh ±1–2 menit setelah push
    const ok = await Promise.all(urls.map((u) => fetch(u, { method: 'HEAD' }).then((r) => r.ok).catch(() => false)));
    if (ok.every(Boolean)) return;
    await sleep(10_000);
  }
  throw new Error(`file belum bisa diakses publik: ${urls[0]}`);
}

// ---------- Instagram Graph API
async function graph(path, params = {}, method = 'POST') {
  const e = env();
  if (!e.IG_ACCESS_TOKEN || !e.IG_USER_ID) throw new Error('IG_ACCESS_TOKEN / IG_USER_ID belum diisi di .env');
  const url = new URL(`https://graph.facebook.com/${e.GRAPH_VERSION || 'v23.0'}/${path}`);
  const body = new URLSearchParams({ ...params, access_token: e.IG_ACCESS_TOKEN });
  const r = method === 'GET' ? await fetch(`${url}?${body}`) : await fetch(url, { method, body });
  const j = await r.json();
  if (j.error) throw new Error(`IG: ${hide(j.error.error_user_msg || j.error.message)}`);
  return j;
}
async function igReady(id) {
  for (let i = 0; i < 60; i++) { // video bisa diproses beberapa menit
    const { status_code: s } = await graph(id, { fields: 'status_code' }, 'GET');
    if (s === 'FINISHED') return;
    if (s === 'ERROR' || s === 'EXPIRED') throw new Error(`IG memproses media gagal (${s})`);
    await sleep(10_000);
  }
  throw new Error('IG kelamaan memproses media');
}
async function postIG(c, A, caption) {
  const ig = env().IG_USER_ID;
  let creation;
  if (A.video) {
    const p = { media_type: 'REELS', video_url: publicUrl(A.video), caption, share_to_feed: 'true' };
    if (A.cover) p.cover_url = publicUrl(A.cover);
    creation = (await graph(`${ig}/media`, p)).id;
  } else if ((A.feed ?? []).length > 1) {
    const kids = [];
    for (const f of A.feed.slice(0, 10)) kids.push((await graph(`${ig}/media`, { image_url: publicUrl(f), is_carousel_item: 'true' })).id);
    for (const k of kids) await igReady(k);
    creation = (await graph(`${ig}/media`, { media_type: 'CAROUSEL', children: kids.join(','), caption })).id;
  } else {
    creation = (await graph(`${ig}/media`, { image_url: publicUrl(A.feed[0]), caption })).id;
  }
  await igReady(creation);
  return (await graph(`${ig}/media_publish`, { creation_id: creation })).id;
}

// ---------- TikTok Content Posting API (Direct Post, private)
async function tiktokToken() {
  const e = env();
  if (!e.TIKTOK_REFRESH_TOKEN) throw new Error('TikTok belum login (node scripts/publish.mjs tiktok-login)');
  if (e.TIKTOK_ACCESS_TOKEN && +e.TIKTOK_EXPIRES_AT > Date.now() + 5 * 60_000) return e.TIKTOK_ACCESS_TOKEN;
  return (await tiktokOAuth({ grant_type: 'refresh_token', refresh_token: e.TIKTOK_REFRESH_TOKEN })).access_token;
}
async function tiktokOAuth(params) {
  const e = env();
  if (!e.TIKTOK_CLIENT_KEY || !e.TIKTOK_CLIENT_SECRET) throw new Error('TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET belum diisi di .env');
  const r = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_key: e.TIKTOK_CLIENT_KEY, client_secret: e.TIKTOK_CLIENT_SECRET, ...params }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`TikTok login: ${j.error_description || j.error || JSON.stringify(j)}`);
  setEnv('TIKTOK_ACCESS_TOKEN', j.access_token);
  setEnv('TIKTOK_REFRESH_TOKEN', j.refresh_token);
  setEnv('TIKTOK_EXPIRES_AT', Date.now() + j.expires_in * 1000);
  return j;
}
async function tt(path, body) {
  const r = await fetch(`https://open.tiktokapis.com/v2/${path}`, {
    method: 'POST', headers: { Authorization: `Bearer ${await tiktokToken()}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(body ?? {}),
  });
  const j = await r.json();
  if (j.error?.code === 'unaudited_client_can_only_post_to_private_accounts') throw new Error('TikTok: app belum diaudit, akun TikTok harus di-set Private dulu (Pengaturan → Privasi → Akun privat)');
  if (j.error?.code && j.error.code !== 'ok') throw new Error(`TikTok ${j.error.code}${j.error.message ? `: ${j.error.message}` : ''}`);
  return j.data;
}
async function postTikTok(c, A, caption) {
  if (!A.video) throw new Error('TikTok cuma untuk video');
  const file = join(ROOT, A.video);
  const size = statSync(file).size;
  const MB = 1024 * 1024;
  // aturan chunk TikTok: ≤64MB boleh 1 chunk; selebihnya potong 10MB, sisa digabung ke chunk terakhir
  const chunk = size <= 64 * MB ? size : 10 * MB;
  const count = size <= 64 * MB ? 1 : Math.floor(size / chunk);
  const info = await tt('post/publish/creator_info/query/');
  const privacy = info.privacy_level_options?.includes('SELF_ONLY') ? 'SELF_ONLY' : info.privacy_level_options?.[0];
  const { publish_id, upload_url } = await tt('post/publish/video/init/', {
    post_info: { title: caption.slice(0, 2200), privacy_level: privacy, disable_comment: false, disable_duet: false, disable_stitch: false },
    source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: chunk, total_chunk_count: count },
  });
  const fh = await open(file, 'r');
  try {
    for (let i = 0; i < count; i++) {
      const start = i * chunk;
      const end = i === count - 1 ? size - 1 : start + chunk - 1;
      const buf = Buffer.alloc(end - start + 1);
      await fh.read(buf, 0, buf.length, start);
      const r = await fetch(upload_url, { method: 'PUT', body: buf, headers: { 'Content-Type': 'video/mp4', 'Content-Range': `bytes ${start}-${end}/${size}` } });
      if (!r.ok && r.status !== 206) throw new Error(`TikTok upload chunk ${i + 1}/${count}: HTTP ${r.status}`);
    }
  } finally { await fh.close(); }
  for (let i = 0; i < 60; i++) {
    const s = await tt('post/publish/status/fetch/', { publish_id });
    if (s.status === 'PUBLISH_COMPLETE') return s.publicaly_available_post_id?.[0] ?? publish_id;
    if (s.status === 'FAILED') throw new Error(`TikTok gagal: ${s.fail_reason}`);
    await sleep(10_000);
  }
  return publish_id; // masih diproses TikTok, biasanya tetap muncul di profil
}

// ---------- jadwal: slot WIB (UTC+7)
const dueAt = (c) => (c.slot === 'kilat' ? 0 : new Date(`${c.day}T${SLOT[c.slot] ?? '12:00'}:00+07:00`).getTime());
const failures = new Map(); // id → jumlah gagal (di memori watcher)

export async function publishOne(id) {
  const d = await db();
  const c = d.prepare('SELECT * FROM contents WHERE id = ?').get(id);
  if (!c) throw new Error(`konten ${id} tidak ada`);
  if (!c.asset_path) throw new Error(`konten ${id} belum dirender`);
  const A = JSON.parse(c.asset_path);
  const caption = [c.caption, c.hashtags].filter(Boolean).join('\n\n');
  const want = targets(c).filter((t) => (t === 'ig' ? !c.ig_media_id : !c.tiktok_id)); // yang sudah berhasil tidak diulang
  const done = [], errs = [];
  setAgent(d, 'working', `Upload #${c.id} ke ${want.join(' + ').toUpperCase()}`);
  if (want.includes('ig')) {
    try {
      const files = A.video ? [A.video, ...(A.cover ? [A.cover] : [])] : A.feed;
      pushMedia();
      await waitOnline(files.map(publicUrl));
      const igId = await postIG(c, A, caption);
      d.prepare('UPDATE contents SET ig_media_id = ? WHERE id = ?').run(igId, c.id);
      done.push('IG');
    } catch (e) { errs.push(e.message); }
  }
  if (want.includes('tiktok')) {
    try {
      const ttId = await postTikTok(c, A, caption);
      d.prepare('UPDATE contents SET tiktok_id = ? WHERE id = ?').run(String(ttId), c.id);
      done.push('TikTok (private)');
    } catch (e) { errs.push(e.message); }
  }
  setAgent(d, 'done');
  if (done.length) { activity(d, 'publisher', `Posting #${c.id} ke ${done.join(' + ')} ✅`); chat(d, 'publisher', null, `"${c.title.slice(0, 50)}" udah tayang di ${done.join(' + ')} 🚀 Makasih semua!`, 'oper'); }
  if (!errs.length) {
    d.prepare("UPDATE contents SET status = 'posted', posted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(c.id);
    failures.delete(c.id);
    await sayAs('publisher', `🚀 #${c.id} udah tayang di ${done.join(' + ') || 'semua platform'}.${done.some((p) => p.startsWith('TikTok')) ? '\nTikTok masih private, ubah privacy di app kalau mau publik.' : ''}`).catch(() => {});
    return { ok: true, id: c.id, posted: done };
  }
  const n = (failures.get(c.id) ?? 0) + 1;
  failures.set(c.id, n);
  activity(d, 'publisher', `Gagal posting #${c.id}: ${errs[0].slice(0, 120)}`);
  if (n >= 3) {
    d.prepare("UPDATE contents SET status = 'publish_failed', updated_at = datetime('now') WHERE id = ?").run(c.id);
    await sayAs('publisher', `⚠️ #${c.id} gagal diposting 3× (${errs.join(' | ').slice(0, 300)}). Cek .env lalu jalankan: node scripts/publish.mjs now ${c.id}`).catch(() => {});
  }
  return { ok: false, id: c.id, posted: done, errors: errs };
}

export async function publishDue() {
  const d = await db();
  const rows = d.prepare("SELECT id, day, slot FROM contents WHERE status = 'approved' ORDER BY day, id").all();
  const res = [];
  for (const c of rows) if (Date.now() >= dueAt(c)) res.push(await publishOne(c.id));
  return res;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const [cmd, a] = process.argv.slice(2);
  try {
    if (cmd === 'due') out(await publishDue());
    else if (cmd === 'now') out(await publishOne(+a));
    else if (cmd === 'ig-check') out(await graph(env().IG_USER_ID, { fields: 'username,name,followers_count' }, 'GET'));
    else if (cmd === 'ig-token-info') {
      // jenis token, kedaluwarsa, dan permission (tanpa menampilkan token)
      const e = env();
      const t = e.IG_ACCESS_TOKEN ?? '';
      const r = await (await fetch(`https://graph.facebook.com/${e.GRAPH_VERSION || 'v23.0'}/debug_token?${new URLSearchParams({ input_token: t, access_token: t })}`)).json();
      if (r.error) throw new Error(`IG: ${r.error.message}`);
      const x = r.data;
      const when = (s) => (s ? new Date(s * 1000).toLocaleString('id-ID', { timeZone: 'Asia/Makassar' }) : 'tidak pernah');
      const need = ['instagram_basic', 'instagram_content_publish', 'pages_show_list', 'pages_read_engagement', 'business_management'];
      out({ jenis: x.type, valid: x.is_valid, kedaluwarsa: when(x.expires_at), akses_data_habis: when(x.data_access_expires_at), kurang_permission: need.filter((p) => !x.scopes?.includes(p)) });
    }
    else if (cmd === 'ig-page-token') {
      // tukar User token (long-lived) di .env → Page token (tidak kedaluwarsa) milik Page yang terhubung ke IG
      const e = env();
      const r = await (await fetch(`https://graph.facebook.com/${e.GRAPH_VERSION || 'v23.0'}/me/accounts?${new URLSearchParams({ fields: 'name,access_token,instagram_business_account', access_token: e.IG_ACCESS_TOKEN ?? '' })}`)).json();
      if (r.error) throw new Error(`IG: ${r.error.message}`);
      const page = r.data?.find((p) => p.instagram_business_account);
      if (!page) throw new Error('token ini bukan User token, atau tidak ada Page yang terhubung ke IG');
      setEnv('IG_ACCESS_TOKEN', page.access_token);
      out(`ok: IG_ACCESS_TOKEN diganti ke Page token "${page.name}"`);
    }
    else if (cmd === 'ig-id') {
      // cari akun IG Business dari token Page (atau User) lalu simpan ke .env
      const e = env();
      const q = async (p, f) => (await fetch(`https://graph.facebook.com/${e.GRAPH_VERSION || 'v23.0'}/${p}?${new URLSearchParams({ fields: f, access_token: e.IG_ACCESS_TOKEN ?? '' })}`)).json();
      let acc = (await q('me', 'instagram_business_account{id,username}')).instagram_business_account; // token Page
      let kind = 'Page';
      if (!acc) { // token User → cari lewat Page yang dikelola
        const pages = await q('me/accounts', 'name,instagram_business_account{id,username}');
        if (pages.error) throw new Error(`IG: ${pages.error.message}`);
        acc = pages.data?.find((p) => p.instagram_business_account)?.instagram_business_account;
        kind = 'User';
      }
      if (!acc) throw new Error('tidak ada Page dengan akun IG Business di token ini (cek permission pages_show_list & instagram_basic)');
      setEnv('IG_USER_ID', acc.id);
      out(`ok: IG_USER_ID = ${acc.id} (@${acc.username}) disimpan ke .env · token yang diisi: ${kind} token`);
    }
    else if (cmd === 'tiktok-setup') { // Owner ngisi sendiri Client Key & Secret (rahasia) dari TikTok for Developers
      const { createInterface } = await import('node:readline/promises');
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const key = (await rl.question('Client key: ')).trim();
      const secret = (await rl.question('Client secret: ')).trim();
      rl.close();
      if (!key || !secret) throw new Error('client key / secret kosong, ulangi');
      setEnv('TIKTOK_CLIENT_KEY', key);
      setEnv('TIKTOK_CLIENT_SECRET', secret);
      out('ok: tersimpan di .env. Kabarin Claude, lanjut login TikTok.');
    }
    else if (cmd === 'tiktok-login') {
      const e = env();
      if (!e.TIKTOK_CLIENT_KEY || !e.TIKTOK_REDIRECT_URI) throw new Error('isi TIKTOK_CLIENT_KEY & TIKTOK_REDIRECT_URI di .env dulu');
      const u = new URL('https://www.tiktok.com/v2/auth/authorize/');
      u.search = new URLSearchParams({ client_key: e.TIKTOK_CLIENT_KEY, scope: 'user.info.basic,video.publish,video.upload,video.list', response_type: 'code', redirect_uri: e.TIKTOK_REDIRECT_URI, state: 'zataa' });
      out(`Buka link ini, login & izinkan, lalu salin URL halaman tujuan (yang ada ?code=...):\n${u}\n\nLanjut: node scripts/publish.mjs tiktok-code "<URL itu>"`);
    } else if (cmd === 'tiktok-code') {
      const code = a?.includes('code=') ? new URL(a).searchParams.get('code') : a;
      await tiktokOAuth({ grant_type: 'authorization_code', code, redirect_uri: env().TIKTOK_REDIRECT_URI });
      out('ok: token TikTok disimpan ke .env (auto-refresh, berlaku ±1 tahun)');
    } else out('pakai: publish.mjs due | now <id> | ig-check | tiktok-setup | tiktok-login | tiktok-code <url>');
  } catch (e) { out(`gagal: ${e.message}`); process.exit(1); }
}
