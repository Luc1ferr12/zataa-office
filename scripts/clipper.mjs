#!/usr/bin/env node
// Divisi Zaa Clips (16 Nov 2026, tim Hendra): campaign Clippo (app.clippo.id) → ✅ Owner → clip 9:16 di laptop → TikTok + IG (Zernio akun 4)
// → tunggu ≥ minSubmissionViews (1.000) & like rate ≥0,5% → ajukan ke Clippo. SOP: office/clipper.md. 0 token kecuali pilih momen (laptop, Claude CLI).
//   node scripts/clipper.mjs scout [--dry]        tarik campaign publik Clippo, saring & skor, simpan (tanpa login)
//   node scripts/clipper.mjs propose [n]          kirim n campaign terbaik (default 3) ke Owner di bot Zaa Clips (✅ Ambil / ❌ Lewati)
//   node scripts/clipper.mjs list | jobs          daftar campaign / job clip
//   node scripts/clipper.mjs approve|skip <id>    keputusan campaign manual (sama dengan tombol)
//   node scripts/clipper.mjs plan                 bikin job clip hari ini (CLIP_PER_DAY, default 3) dari campaign yang di-✅
//   node scripts/clipper.mjs post <job>           upload clip yang sudah dirender laptop ke TikTok + IG (dipanggil clipper-laptop.mjs)
//   node scripts/clipper.mjs track [--dry]        update views, ajukan ke Clippo yang lolos syarat
//   node scripts/clipper.mjs report [--dry]       laporan harian ke Owner
//   node scripts/clipper.mjs bot                  bot Telegram + jadwal (proses anak watcher)
//   node scripts/clipper.mjs ingest <file.json>   simpan data campaign hasil baca Chrome laptop (clipper-chrome.mjs scout)
//   node scripts/clipper.mjs submitq | submitted <job> <hasil>   antrean join/ajukan ke Clippo (dikerjain Chrome laptop) / tandai hasilnya
// Clippo nolak request dari server (403) → semua akses Clippo lewat Chrome laptop Owner yang sudah login (clipper-chrome.mjs, ekstensi Claude in Chrome).
// .env VPS: CLIPPER_BOT_TOKEN, CLIPPER_OWNER_ID (default SHORTS_OWNER_ID), ZERNIO_CLIP_API_KEY (+ ZERNIO_CLIP_TIKTOK_ACCOUNT / _INSTAGRAM_ACCOUNT), CLIP_PER_DAY.
process.removeAllListeners('warning');
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { openDb } from './db.mjs';
import { loadEnv } from './approval.mjs';
import { chat } from './chatter.mjs';
import { clipPost, postStatsMap } from './zernio.mjs';
import { digest } from './media.mjs';
import { haiku, replyOf, OFFICE, ANSWER_ANY, ESCALATE } from './haiku.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://app.clippo.id';
const env = () => ({ ...loadEnv(), ...process.env });
const wita = () => new Date(Date.now() + 8 * 3600_000);
const today = () => wita().toISOString().slice(0, 10);
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const rp = (n) => `Rp${Math.round(n ?? 0).toLocaleString('id-ID')}`;
const PLAT = { 0: 'TikTok', 1: 'Instagram', 2: 'YouTube', 3: 'Threads' };
const NAMA = { cdir: 'Hendra', cbrief: 'Maya', cedit: 'Rizky', ccopy: 'Wulan', cpublish: 'Tasya' };
const strip = (h) => String(h ?? '').replace(/<\/(p|li|div|h\d)>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();

const SQL = `CREATE TABLE IF NOT EXISTS clip_campaigns (id TEXT PRIMARY KEY, title TEXT, creator TEXT, rate INTEGER, platforms TEXT, budget REAL,
  min_views INTEGER, score REAL, brief TEXT, assets TEXT, raw TEXT, status TEXT DEFAULT 'new', proposed_at TEXT, decided_at TEXT, joined_at TEXT,
  note TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS clip_jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, campaign_id TEXT, day TEXT, status TEXT DEFAULT 'queued', source_url TEXT,
  start REAL, end REAL, hook TEXT, caption TEXT, file TEXT, tiktok_post TEXT, tiktok_url TEXT, ig_post TEXT, ig_url TEXT, views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0, submitted_at TEXT, clippo TEXT, err TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`;
export function cdb() { const d = openDb(); d.exec(SQL); return d; }
const setAgent = (d, id, status, task = null) => { try { d.prepare("UPDATE agents SET status = ?, current_task = ?, updated_at = datetime('now') WHERE id = ?").run(status, task, id); } catch { /* agents belum ada */ } };

// ---------- Telegram (bot Zaa Clips sendiri)
async function tg(method, params = {}) {
  const tok = env().CLIPPER_BOT_TOKEN;
  if (!tok) throw new Error('CLIPPER_BOT_TOKEN belum diisi');
  const r = await fetch(`https://api.telegram.org/bot${tok}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params) });
  const j = await r.json();
  if (!j.ok) throw new Error(`Telegram ${method}: ${j.description}`);
  return j.result;
}
const owner = () => env().CLIPPER_OWNER_ID || env().SHORTS_OWNER_ID;
export const sayAs = (agent, text, extra = {}) => tg('sendMessage', { chat_id: owner(), text: `<b>${NAMA[agent] ?? agent}</b>: ${text}`, parse_mode: 'HTML', disable_web_page_preview: true, ...extra });

// ---------- Clippo: data campaign publik (tanpa login)
async function clippo(path, { method = 'GET', body } = {}) { // cuma jalan dari browser; dari server biasanya 403
  const headers = { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 ZaaOfficeClipper' };
  if (body) headers['Content-Type'] = 'application/json';
  const r = await fetch(`${BASE}/api/proxy${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30_000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || (j.status && j.status >= 400)) throw new Error(`Clippo ${path} ${r.status}: ${j.message ?? r.statusText}`);
  return j.data ?? j;
}
async function allCampaigns() {
  const out = [];
  for (let page = 1; page <= 5; page++) {
    const d = await clippo(`/campaigns?page=${page}`);
    out.push(...(d.data ?? []));
    if (page >= (d.totalPage ?? 1)) break;
  }
  return out;
}
const rateOf = (c) => Math.max(0, ...(c.campaignRates ?? []).filter((r) => [0, 1].includes(r.platform)).map((r) => r.ratePerKView ?? 0));
const assetsOf = (c) => (c.assetVideoUrlsV2?.length ? c.assetVideoUrlsV2.map((a) => ({ url: a.url, required: !!a.isRequired, label: a.displayText ?? '' })) : (c.assetVideoUrls ?? []).map((url) => ({ url, required: false, label: '' })));
// kenapa campaign dilewati otomatis (null = layak diusulkan ke Owner)
function skipReason(c) {
  if (c.status !== 3) return 'tidak aktif';
  if (!(c.platformSupported ?? []).some((p) => p === 0 || p === 1)) return 'bukan TikTok/IG';
  if ((c.budgetPercentage ?? 0) < 15) return 'budget hampir habis';
  if (c.isYellowCart || /keranjang kuning|yellow ?cart/i.test(c.title)) return 'wajib keranjang kuning (TikTok Shop)';
  if (/\bUGC\b|template capcut|bentuk teks|threads/i.test(c.title)) return 'butuh rekaman/format sendiri';
  if (!assetsOf(c).length) return 'nggak ada footage buat diclip';
  if (c.isPrivate) return 'private';
  return null;
}
const scoreOf = (c) => Math.round(rateOf(c) * Math.min(1, (c.budgetPercentage ?? 0) / 50) * (c.category === 1 ? 0.8 : 1));

export async function scout({ dry = false, list = null } = {}) {
  list ??= await allCampaigns(); // dari VPS biasanya 403 → pakai ingest (Chrome laptop)
  const d = cdb();
  const up = d.prepare(`INSERT INTO clip_campaigns (id, title, creator, rate, platforms, budget, min_views, score, brief, assets, raw, status)
    VALUES (@id, @title, @creator, @rate, @platforms, @budget, @min_views, @score, @brief, @assets, @raw, @status)
    ON CONFLICT(id) DO UPDATE SET title = excluded.title, rate = excluded.rate, platforms = excluded.platforms, budget = excluded.budget,
      min_views = excluded.min_views, score = excluded.score, brief = excluded.brief, assets = excluded.assets, raw = excluded.raw,
      status = CASE WHEN clip_campaigns.status IN ('approved', 'joined') AND excluded.budget < 1 THEN 'ended'
                    WHEN clip_campaigns.status = 'new' THEN excluded.status ELSE clip_campaigns.status END,
      updated_at = datetime('now')`);
  const rows = list.map((c) => {
    const why = skipReason(c);
    return { id: c.id, title: c.title, creator: c.creator?.user?.name ?? c.creator?.user?.username ?? '', rate: rateOf(c),
      platforms: (c.platformSupported ?? []).map((p) => PLAT[p] ?? p).join('/'), budget: c.budgetPercentage ?? 0, min_views: c.minSubmissionViews ?? 1000,
      score: why ? 0 : scoreOf(c), brief: (briefText(c) || strip(c.requirementsV2 ?? c.requirements)).slice(0, 6000), assets: JSON.stringify(assetsOf(c)),
      raw: JSON.stringify({ guidelines: c.guidelines, hashtags: c.hashtags, maxRewardPerBatch: c.maxRewardPerBatch, category: c.category, endDate: c.endDate, skip: why }),
      status: why ? 'auto_skip' : 'new' };
  });
  if (!dry) { d.exec('BEGIN'); try { rows.forEach((r) => up.run(r)); d.exec('COMMIT'); } catch (e) { d.exec('ROLLBACK'); throw e; } }
  return { total: rows.length, layak: rows.filter((r) => r.status === 'new').length, top: rows.filter((r) => r.status === 'new').sort((a, b) => b.score - a.score).slice(0, 5).map((r) => `${r.title} · ${rp(r.rate)}/1rb · budget ${Math.round(r.budget)}%`) };
}

// brief lengkap (durasi, hashtag, tag, hook, do & don'ts) dari data detail campaign
const briefText = (c) => {
  if (!c) return '';
  // field detail Clippo: teks rich editor = { ops: [{ insert }] }, list = array string
  const txt = (v) => (v?.ops ? v.ops.map((o) => (typeof o.insert === 'string' ? o.insert : '')).join('') : Array.isArray(v) ? v.map((x) => `- ${x}`).join('\n') : String(v ?? '')).trim();
  const parts = [strip(c.requirementsV2 ?? c.requirements)];
  if (c.minDuration || c.maxDuration) parts.push(`Durasi: ${c.minDuration ?? '?'}–${c.maxDuration ?? '?'} detik`);
  if (c.hashtags?.length) parts.push(`Hashtag wajib: ${c.hashtags.join(' ')}`);
  const tags = (c.campaignTags ?? []).flatMap((t) => t.tags ?? []);
  if (tags.length) parts.push(`Tag wajib: ${[...new Set(tags)].join(' ')}`);
  for (const [k, label] of [['contentMainFocus', 'Angle/fokus wajib'], ['campaignHook', 'Hook/script'], ['contentPersona', 'Persona'], ['campaignPurpose', 'Tujuan'],
    ['ctaLabel', 'CTA'], ['campaignDos', 'Do'], ['campaignDonts', "Don't"], ['notes', 'Catatan']]) {
    const v = txt(c[k]); if (v && v !== '-') parts.push(`${label}:\n${v}`);
  }
  if (c.ndaRequired) parts.push('⚠️ Wajib tanda tangan NDA');
  return parts.filter(Boolean).join('\n').slice(0, 6000);
};

export async function propose(n = 3) {
  const d = cdb();
  const rows = d.prepare("SELECT * FROM clip_campaigns WHERE status = 'new' ORDER BY score DESC LIMIT ?").all(n);
  if (!rows.length) return { sent: 0 };
  await sayAs('cdir', `🎬 <b>${rows.length} campaign Clippo terbaik hari ini</b> (sudah aku saring: TikTok/IG, ada footage, budget masih banyak). Pilih yang mau kita kerjain, Bos:`);
  for (const r of rows) {
    const brief = r.brief.split('\n').filter(Boolean).slice(0, 8).join('\n').slice(0, 700);
    await sayAs('cdir', `<b>${esc(r.title)}</b>\n💰 ${rp(r.rate)} / 1rb views · ${esc(r.platforms)} · budget sisa ${Math.round(r.budget)}% · min ${r.min_views} views per clip\n\n${esc(brief)}\n\n${BASE}/campaigns/${r.id}`,
      { reply_markup: { inline_keyboard: [[{ text: '✅ Ambil', callback_data: `cc:ok:${r.id}` }, { text: '❌ Lewati', callback_data: `cc:no:${r.id}` }]] } });
    d.prepare("UPDATE clip_campaigns SET status = 'proposed', proposed_at = datetime('now') WHERE id = ?").run(r.id);
  }
  setAgent(d, 'cdir', 'waiting', 'Nunggu Bos pilih campaign Clippo');
  return { sent: rows.length };
}

// ---------- keputusan Owner → join di Clippo (kalau ada login) → masuk antrean produksi
export async function decide(id, ok) {
  const d = cdb();
  const c = d.prepare('SELECT * FROM clip_campaigns WHERE id = ?').get(id);
  if (!c) return 'campaign nggak ketemu';
  if (!['new', 'proposed'].includes(c.status)) return `campaign "${c.title}" sudah ${c.status}, nggak diproses lagi`; // tombol di pesan lama
  if (!ok) { d.prepare("UPDATE clip_campaigns SET status = 'skipped', decided_at = datetime('now') WHERE id = ?").run(id); return `❌ dilewati: ${c.title}`; }
  d.prepare("UPDATE clip_campaigns SET status = 'approved', decided_at = datetime('now') WHERE id = ?").run(id);
  chat(d, 'cdir', 'cbrief', `Maya, campaign "${c.title}" udah di-✅ Bos. Baca brief-nya teliti ya 📋`, 'oper');
  setAgent(d, 'cdir', 'working', `Join campaign ${c.title}`);
  // join di Clippo dikerjain Chrome laptop (antrean status 'join', clipper-chrome.mjs submit)
  if (!d.prepare("SELECT 1 FROM clip_jobs WHERE campaign_id = ? AND status = 'join'").get(id)) d.prepare("INSERT INTO clip_jobs (campaign_id, day, status) VALUES (?, ?, 'join')").run(id, today());
  const joined = ' Laptop bakal klik <b>Join Campaign</b> lewat Chrome kamu di putaran berikutnya (±10 menit, laptop harus nyala).';
  setAgent(d, 'cdir', 'done', `Campaign ${c.title} masuk produksi`);
  return `✅ ${c.title} masuk produksi (${env().CLIP_PER_DAY || 3} clip/hari dibagi rata).${joined}`;
}

// ---------- antrean clip harian (laptop yang ngerjain: clipper-laptop.mjs)
export function plan() {
  const d = cdb();
  const per = Math.max(1, +env().CLIP_PER_DAY || 3);
  const day = today();
  const have = d.prepare('SELECT COUNT(*) n FROM clip_jobs WHERE day = ?').get(day).n;
  const camps = d.prepare("SELECT * FROM clip_campaigns WHERE status IN ('approved', 'joined') AND budget >= 3 ORDER BY decided_at").all();
  if (have >= per || !camps.length) return { day, have, added: 0 };
  const ins = d.prepare("INSERT INTO clip_jobs (campaign_id, day, source_url) VALUES (?, ?, ?)");
  let added = 0;
  for (let i = have; i < per; i++) {
    const c = camps[i % camps.length];
    const assets = JSON.parse(c.assets || '[]');
    const used = d.prepare('SELECT source_url, COUNT(*) n FROM clip_jobs WHERE campaign_id = ? GROUP BY source_url').all(c.id);
    const cnt = (u) => used.find((x) => x.source_url === u)?.n ?? 0;
    const src = [...assets].sort((a, b) => (b.required - a.required) || cnt(a.url) - cnt(b.url))[0]?.url ?? null; // footage wajib dulu, lalu yang paling jarang dipakai
    ins.run(c.id, day, src); added++;
  }
  setAgent(d, 'cedit', 'working', `${added} clip baru di antrean laptop`);
  return { day, have, added };
}

// ---------- hasil render → Owner dulu (video + hook + caption), tayang HANYA setelah ✅
async function tgVideo(file, caption, extra = {}) {
  const fd = new FormData();
  fd.append('chat_id', String(owner()));
  fd.append('caption', caption.slice(0, 1000));
  fd.append('parse_mode', 'HTML');
  fd.append('supports_streaming', 'true');
  for (const [k, v] of Object.entries(extra)) fd.append(k, typeof v === 'string' ? v : JSON.stringify(v));
  fd.append('video', new Blob([readFileSync(file)], { type: 'video/mp4' }), 'clip.mp4');
  const r = await fetch(`https://api.telegram.org/bot${env().CLIPPER_BOT_TOKEN}/sendVideo`, { method: 'POST', body: fd });
  const j = await r.json();
  if (!j.ok) throw new Error(`Telegram sendVideo: ${j.description}`);
  return j.result;
}
export async function review(jobId) {
  const d = cdb();
  const j = d.prepare('SELECT j.*, c.title ctitle FROM clip_jobs j JOIN clip_campaigns c ON c.id = j.campaign_id WHERE j.id = ?').get(+jobId);
  if (!j?.file) throw new Error(`job ${jobId} belum ada file`);
  const file = join(ROOT, j.file);
  if (!existsSync(file)) throw new Error(`file ${j.file} nggak ada di VPS`);
  const cap = `🎬 <b>Clip #${j.id} — ${esc(j.ctitle)}</b>\nHook: <i>${esc(j.hook ?? '')}</i>\n\nCaption:\n${esc(j.caption ?? '')}\n\nTayang ke TikTok + IG setelah kamu ✅.`;
  await tgVideo(file, cap, { reply_markup: { inline_keyboard: [[{ text: '✅ Approve & tayang', callback_data: `cv:ok:${j.id}` }, { text: '❌ Tolak (bikin ulang)', callback_data: `cv:no:${j.id}` }]] } });
  setAgent(d, 'cedit', 'waiting', `Clip #${j.id} nunggu ✅ Bos`);
  return `clip #${j.id} dikirim ke Owner buat approval`;
}
export async function decideClip(jobId, ok) {
  const d = cdb();
  const j = d.prepare('SELECT * FROM clip_jobs WHERE id = ?').get(+jobId);
  if (!j) return 'job nggak ketemu';
  if (j.status !== 'review') return `clip #${j.id} sudah ${j.status}, nggak diproses lagi`;
  if (!ok) {
    d.prepare("UPDATE clip_jobs SET status = 'rejected', updated_at = datetime('now') WHERE id = ?").run(j.id);
    d.prepare('INSERT INTO clip_jobs (campaign_id, day, source_url) VALUES (?, ?, ?)').run(j.campaign_id, today(), j.source_url);
    return `❌ Clip #${j.id} ditolak, tim bikin versi baru (laptop ±10 menit).`;
  }
  d.prepare("UPDATE clip_jobs SET status = 'ready', updated_at = datetime('now') WHERE id = ?").run(j.id);
  await post(j.id);
  return `✅ Clip #${j.id} di-approve, lagi diupload.`;
}

// ---------- upload hasil render laptop → TikTok + IG
export async function post(jobId) {
  const d = cdb();
  const j = d.prepare('SELECT j.*, c.title ctitle, c.platforms FROM clip_jobs j JOIN clip_campaigns c ON c.id = j.campaign_id WHERE j.id = ?').get(+jobId);
  if (!j?.file) throw new Error(`job ${jobId} belum ada file`);
  const file = join(ROOT, j.file);
  if (!existsSync(file)) throw new Error(`file ${j.file} nggak ada di VPS`);
  setAgent(d, 'cpublish', 'working', `Upload clip #${j.id} ke TikTok & IG`);
  const res = {};
  for (const [pf, col] of [['tiktok', 'tiktok'], ['instagram', 'ig']]) {
    if (!new RegExp(pf === 'tiktok' ? 'TikTok' : 'Instagram').test(j.platforms) || j[`${col}_post`]) continue;
    try {
      const r = await clipPost(pf, file, j.caption ?? '', `clip-${pf}-${j.id}`);
      d.prepare(`UPDATE clip_jobs SET ${col}_post = ?, ${col}_url = ?, updated_at = datetime('now') WHERE id = ?`).run(r.zernio_post, r.url, j.id);
      res[pf] = r.url ?? r.status;
    } catch (e) { res[pf] = `gagal: ${e.message.slice(0, 120)}`; }
  }
  const okAny = Object.values(res).some((v) => !/^gagal/.test(v));
  d.prepare("UPDATE clip_jobs SET status = ?, err = ?, updated_at = datetime('now') WHERE id = ?").run(okAny ? 'posted' : 'failed', okAny ? null : JSON.stringify(res), j.id);
  setAgent(d, 'cpublish', 'done', `Clip #${j.id} tayang`);
  if (okAny) chat(d, 'cpublish', 'all', `Clip "${j.ctitle}" udah tayang di TikTok & IG. Tinggal nunggu 1rb views 💸`, 'oper');
  await sayAs('cpublish', `${okAny ? '📤' : '⚠️'} Clip #${j.id} (${esc(j.ctitle)})\n${Object.entries(res).map(([k, v]) => `• ${k}: ${esc(v)}`).join('\n')}${okAny ? '\nNanti tembus syarat views langsung aku ajuin ke Clippo.' : ''}`).catch(() => {});
  return res;
}

// ---------- pantau views → ajukan ke Clippo
export async function track({ dry = false } = {}) {
  const d = cdb();
  const jobs = d.prepare("SELECT j.*, c.title ctitle, c.min_views FROM clip_jobs j JOIN clip_campaigns c ON c.id = j.campaign_id WHERE j.status = 'posted'").all();
  if (!jobs.length) return { tracked: 0 };
  const maps = {};
  for (const pf of ['tiktok', 'instagram']) { try { maps[pf] = await postStatsMap(pf); } catch (e) { maps[pf] = {}; } }
  const out = [];
  for (const j of jobs) {
    const tt = maps.tiktok[j.tiktok_post] ?? {}, ig = maps.instagram[j.ig_post] ?? {};
    // node:sqlite nolak undefined → post yang belum ada di analytics Zernio bikin error tiap jam (sejak 18 Nov)
    const tiktok_url = j.tiktok_url ?? tt.url ?? null, ig_url = j.ig_url ?? ig.url ?? null;
    d.prepare("UPDATE clip_jobs SET views = ?, likes = ?, tiktok_url = ?, ig_url = ?, updated_at = datetime('now') WHERE id = ?")
      .run(Math.max(j.views ?? 0, (tt.views ?? 0) + (ig.views ?? 0)), Math.max(j.likes ?? 0, (tt.likes ?? 0) + (ig.likes ?? 0)), tiktok_url, ig_url, j.id);
    // syarat Clippo dicek per video (bukan total): ≥ min views & like rate ≥ 0,5%
    const ready = [['TikTok', tt, tiktok_url], ['Instagram', ig, ig_url]].filter(([, s, u]) => u && (s.views ?? 0) >= (j.min_views || 1000) && (s.likes ?? 0) / Math.max(1, s.views) >= 0.005);
    if (!ready.length) continue;
    out.push({ id: j.id, urls: ready.map((r) => r[2]) });
    if (dry) continue;
    await submit(d, j, ready.map((r) => r[2]));
  }
  return { tracked: jobs.length, ready: out };
}
// ajukan = antrean buat Chrome laptop (clipper-chrome.mjs submit); Owner dikabarin sekali
async function submit(d, j, urls) {
  if (String(j.clippo ?? '').startsWith('queue:')) return;
  d.prepare("UPDATE clip_jobs SET clippo = ?, updated_at = datetime('now') WHERE id = ?").run(`queue:${JSON.stringify(urls)}`, j.id);
  chat(d, 'cpublish', 'cdir', `Mas Hendra, clip "${j.ctitle}" udah lolos syarat, aku antre ajuin ke Clippo 💸`, 'oper');
  await sayAs('cpublish', `💸 Clip #${j.id} (${esc(j.ctitle)}) lolos syarat Clippo, lagi aku ajuin lewat Chrome laptop.\n${urls.map(esc).join('\n')}`).catch(() => {});
}
// antrean kerja Chrome laptop: join campaign yang baru di-✅ + ajukan clip yang lolos syarat
export const submitQueue = () => cdb().prepare("SELECT id, campaign_id, clippo, status FROM clip_jobs WHERE (status = 'posted' AND clippo LIKE 'queue:%') OR status = 'join'").all()
  .map((j) => (j.status === 'join' ? { job: j.id, campaignId: j.campaign_id, join: true } : { job: j.id, campaignId: j.campaign_id, urls: JSON.parse(j.clippo.slice(6)) }));
export async function submitted(jobId, result = 'ok') {
  const d = cdb();
  const j = d.prepare('SELECT j.*, c.title ctitle FROM clip_jobs j JOIN clip_campaigns c ON c.id = j.campaign_id WHERE j.id = ?').get(+jobId);
  if (!j) throw new Error(`job ${jobId} nggak ada`);
  const ok = !/^(gagal|error)/i.test(result);
  if (j.status === 'join') {
    if (ok) {
      d.prepare('DELETE FROM clip_jobs WHERE id = ?').run(j.id);
      d.prepare("UPDATE clip_campaigns SET status = 'joined', joined_at = datetime('now') WHERE id = ?").run(j.campaign_id);
    } else d.prepare('UPDATE clip_jobs SET err = ? WHERE id = ?').run(result.slice(0, 300), j.id);
    return sayAs('cdir', ok ? `🤝 Udah join campaign <b>${esc(j.ctitle)}</b> di Clippo.` : `⚠️ Join <b>${esc(j.ctitle)}</b> gagal: ${esc(result.slice(0, 200))}. Tolong klik Join Campaign manual: ${BASE}/campaigns/${j.campaign_id}`);
  }
  if (ok) d.prepare("UPDATE clip_jobs SET status = 'submitted', submitted_at = datetime('now'), clippo = ?, updated_at = datetime('now') WHERE id = ?").run(result.slice(0, 500), j.id);
  else d.prepare("UPDATE clip_jobs SET clippo = ?, updated_at = datetime('now') WHERE id = ?").run(`err:${result.slice(0, 200)}`, j.id);
  if (ok) chat(d, 'cpublish', 'cdir', `Mas Hendra, clip "${j.ctitle}" udah aku ajuin ke Clippo ✅`, 'oper');
  return sayAs('cpublish', ok ? `✅ Clip #${j.id} (${esc(j.ctitle)}) udah diajukan ke Clippo.` : `⚠️ Ajuin clip #${j.id} gagal: ${esc(result.slice(0, 200))}\nAjuin manual: ${BASE}/campaigns/${j.campaign_id}`);
}

export function report() {
  const d = cdb();
  const day = today();
  const jobs = d.prepare('SELECT j.*, c.title ctitle, c.rate FROM clip_jobs j JOIN clip_campaigns c ON c.id = j.campaign_id WHERE j.day >= date(?, \'-6 days\') ORDER BY j.id').all(day);
  const todayJobs = jobs.filter((j) => j.day === day);
  const est = jobs.reduce((s, j) => s + (j.views / 1000) * (j.rate ?? 0), 0);
  const camps = d.prepare("SELECT title, budget FROM clip_campaigns WHERE status IN ('approved', 'joined')").all();
  return [`<b>Tasya</b>: 📊 <b>Laporan Zaa Clips</b> · ${day}`, '',
    `<b>Campaign jalan</b> (${camps.length}): ${camps.map((c) => `${esc(c.title)} (budget ${Math.round(c.budget)}%)`).join('; ') || 'belum ada, tunggu usulan Hendra'}`,
    `<b>Clip hari ini</b>: ${todayJobs.length} (tayang ${todayJobs.filter((j) => ['posted', 'submitted'].includes(j.status)).length}, gagal ${todayJobs.filter((j) => j.status === 'failed').length})`,
    `<b>7 hari</b>: ${jobs.length} clip · 👀 ${jobs.reduce((s, j) => s + j.views, 0).toLocaleString('id-ID')} views · ✅ diajukan ${jobs.filter((j) => j.status === 'submitted').length}`,
    `💸 Estimasi (views × rate, belum dipotong syarat Clippo): ${rp(est)}`].join('\n');
}

// ---------- pesan bebas Owner (pertanyaan, perintah, referensi foto/video/link) → Haiku dulu, kerja beneran → model utama
const ROOM = `Kamar bot ini: divisi Zaa Clips (SOP office/clipper.md): ikut campaign Clippo (app.clippo.id), clip 9:16 TikTok + IG, 3 clip/hari, campaign wajib ✅ Owner.
Tim: Hendra (cdir, manajer), Maya (cbrief, brief & momen), Rizky (cedit, editor), Wulan (ccopy, hook & caption), Tasya (cpublish, upload & ajuin ke Clippo).
Data (baca-saja): node scripts/clipper.mjs list | jobs | job <id> | report --dry. Clippo nolak akses server (403): jangan coba buka API Clippo dari sini.`;
async function talk(msg, extra = '') {
  const q = await haiku(`${ROOM}
Owner (Bos Zamiir) chat di bot Zaa Clips: "${msg}"${extra}
${OFFICE}
${ANSWER_ANY}
Pertanyaan apa pun → jawab langsung. Perintah KERJA Zaa Clips (ambil/lewati campaign, bikin clip dari referensi, ubah kuota, cek kenapa gagal) → tulis persis ${ESCALATE} lalu berhenti.
Akhiri dengan baris "BALASAN:" lalu 1–3 baris, tiap baris diawali nama pegawai Zaa Clips: "Nama: pesan".`, { tools: ['Read', 'WebSearch', 'WebFetch', 'Bash(node scripts/clipper.mjs list)', 'Bash(node scripts/clipper.mjs jobs)', 'Bash(node scripts/clipper.mjs job:*)'] });
  let text = q.ok && !q.escalate ? q.text : null;
  if (!text) {
    const { claude } = await import('./ask.mjs');
    const big = await claude(`${ROOM}
Owner (Bos Zamiir) minta lewat bot Zaa Clips: "${msg}"${extra}
Kerjakan yang diminta selama masih urusan Zaa Clips, pakai CLI: node scripts/clipper.mjs approve|skip <campaign_id> (keputusan Owner = boleh), plan, track, list, jobs, job <id>, setjob <id> (stdin JSON). Referensi gaya clip dari Owner → simpan 1 kalimat pelajaran: node scripts/office.mjs memory cbrief "...".
JANGAN kirim Telegram sendiri, jangan ubah kode, jangan akses API Clippo dari server. Urusan divisi lain → bilang kirim ke bot divisinya.
Akhiri dengan baris "BALASAN:" lalu 1–4 baris, tiap baris "Nama: pesan" (pegawai Zaa Clips).`, 20, { tools: ['Bash(node scripts/clipper.mjs:*)', 'Bash(node scripts/office.mjs memory:*)', 'Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch'] });
    text = big.ok ? big.text : null;
  }
  if (!text) return sayAs('cdir', '⚠️ Maaf Bos, lagi error. Coba lagi bentar ya.');
  for (const line of replyOf(text).split(/\n/).map((l) => l.trim()).filter(Boolean).slice(0, 4)) {
    const m = line.match(/^\**([A-Za-z ]{3,12})\**:\s*(.+)$/);
    const id = m && Object.keys(NAMA).find((k) => NAMA[k].toLowerCase() === m[1].trim().toLowerCase());
    await sayAs(id ?? 'cdir', esc(id ? m[2] : line));
  }
}

// ---------- bot Telegram + jadwal harian (WITA)
// keputusan dari panel approval web (scripts/web-api.mjs): 1 file per keputusan di tmp/web-inbox/clips/, diambil tiap 5 dtk
// (bot ini proses anak watcher, beda proses dengan server web). kind: campaign (✅ Ambil / ❌ Lewati) | clip (✅ tayang / ❌ bikin ulang)
async function webInbox() {
  const dir = join(ROOT, 'tmp', 'web-inbox', 'clips');
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    let x;
    try { x = JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch { x = null; }
    try { unlinkSync(join(dir, f)); } catch { continue; } // sudah diambil
    if (!x?.id) continue;
    const ok = x.action === 'ok';
    console.log(`web: ${x.kind} ${x.id} ${x.action}`);
    try {
      const msg = x.kind === 'clip' ? await decideClip(x.id, ok) : await decide(String(x.id), ok);
      await sayAs(x.kind === 'clip' ? 'cpublish' : 'cdir', `🌐 Dari web: ${msg}`).catch(() => {});
      if (ok && x.kind !== 'clip') plan();
    } catch (e) { console.error(`[web] ${e.message}`); }
  }
}

async function runBot() {
  let offset = 0;
  const once = new Set();
  const at = (key, h, m, fn) => { const w = wita(); const k = `${key}:${today()}`; if (w.getUTCHours() * 60 + w.getUTCMinutes() >= h * 60 + m && !once.has(k)) { once.add(k); fn().catch((e) => console.error(`[${key}]`, e.message)); } };
  let lastTrack = 0;
  setInterval(() => {
    at('propose', 7, 45, async () => { const d = cdb(); // data campaign masuk dari Chrome laptop ±07:30 (clipper-chrome.mjs scout → ingest)
      const active = d.prepare("SELECT COUNT(*) n FROM clip_campaigns WHERE status IN ('approved', 'joined', 'proposed')").get().n;
      if (active < 3) console.log('propose', JSON.stringify(await propose(3))); });
    at('plan', 8, 0, async () => console.log('plan', JSON.stringify(plan())));
    at('report', 19, 0, async () => sayAs('cpublish', report().replace(/^<b>Tasya<\/b>: /, '')));
    if (Date.now() - lastTrack > 3600_000) { lastTrack = Date.now(); track().then((r) => r.tracked && console.log('track', JSON.stringify(r))).catch((e) => console.error('[track]', e.message)); }
  }, 60_000);
  setInterval(() => webInbox().catch((e) => console.error('[web]', e.message)), 5_000);
  console.log('bot clipper jalan');
  for (;;) {
    let ups = [];
    try { ups = await tg('getUpdates', { offset, timeout: 50, allowed_updates: ['message', 'callback_query'] }); } catch (e) { console.error(e.message); await new Promise((r) => setTimeout(r, 15_000)); continue; }
    for (const u of ups) {
      offset = u.update_id + 1;
      const from = String(u.callback_query?.from?.id ?? u.message?.from?.id ?? '');
      if (from !== String(owner())) continue;
      try {
        if (u.callback_query) {
          const [kind, act, id] = String(u.callback_query.data).split(':');
          const msg = kind === 'cv' ? await decideClip(id, act === 'ok') : await decide(id, act === 'ok');
          await tg('answerCallbackQuery', { callback_query_id: u.callback_query.id, text: kind === 'cv' ? (act === 'ok' ? 'Approve, diupload' : 'Ditolak, dibikin ulang') : (act === 'ok' ? 'Siap, masuk produksi' : 'Oke, dilewati') }).catch(() => {});
          await tg('editMessageReplyMarkup', { chat_id: owner(), message_id: u.callback_query.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {});
          await sayAs(kind === 'cv' ? 'cpublish' : 'cdir', msg);
          if (act === 'ok' && kind !== 'cv') plan();
        } else {
          const dg = await digest(u.message, env().CLIPPER_BOT_TOKEN, 'clips'); // foto/video/link referensi (scripts/media.mjs)
          const t = dg.text;
          if (/^\/(start|help)/.test(t)) await sayAs('cdir', 'Bot divisi Zaa Clips 🎬\n/campaign — cari & usulin campaign sekarang\n/status — laporan hari ini\n/jobs — antrean clip');
          else if (/^\/campaign/.test(t)) { const r = await propose(3); if (!r.sent) await sayAs('cdir', 'Belum ada campaign baru yang layak di data terakhir, Bos. Laptop baca ulang Clippo tiap pagi 07:30 (atau jalankan clipper-chrome.mjs scout di laptop).'); }
          else if (/^\/status/.test(t)) await sayAs('cpublish', report().replace(/^<b>Tasya<\/b>: /, ''));
          else if (/^\/jobs/.test(t)) {
            const rows = cdb().prepare('SELECT j.id, j.status, j.views, c.title FROM clip_jobs j JOIN clip_campaigns c ON c.id = j.campaign_id ORDER BY j.id DESC LIMIT 12').all();
            await sayAs('cedit', rows.map((r) => `#${r.id} ${r.status} · ${r.views} views · ${esc(r.title.slice(0, 40))}`).join('\n') || 'Antrean kosong.');
          } else if (t) { await tg('sendChatAction', { chat_id: owner(), action: 'typing' }).catch(() => {}); await talk(t, dg.note); }
        }
      } catch (e) { console.error(e.message); await sayAs('cdir', `⚠️ ${esc(e.message.slice(0, 200))}`).catch(() => {}); }
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [cmd, a] = process.argv.slice(2).filter((x) => !x.startsWith('--'));
  const dry = process.argv.includes('--dry');
  const show = (x) => console.log(typeof x === 'string' ? x : JSON.stringify(x, null, 2));
  try {
    if (cmd === 'scout') show(await scout({ dry }));
    else if (cmd === 'propose') show(await propose(+a || 3));
    else if (cmd === 'list') show(cdb().prepare("SELECT id, status, score, rate, budget, title FROM clip_campaigns WHERE status != 'auto_skip' ORDER BY status, score DESC").all());
    else if (cmd === 'jobs') show(cdb().prepare('SELECT id, campaign_id, day, status, views, likes, tiktok_url, ig_url, err FROM clip_jobs ORDER BY id DESC LIMIT 30').all());
    else if (cmd === 'approve' || cmd === 'skip') show(await decide(a, cmd === 'approve'));
    else if (cmd === 'plan') show(plan());
    else if (cmd === 'post') show(await post(a));
    else if (cmd === 'review') show(await review(a));
    else if (cmd === 'track') show(await track({ dry }));
    else if (cmd === 'report') { const r = report(); if (dry) show(r); else await sayAs('cpublish', r.replace(/^<b>Tasya<\/b>: /, '')); }
    else if (cmd === 'ingest') { const raw = JSON.parse(readFileSync(a, 'utf8')); show(await scout({ dry, list: Array.isArray(raw) ? raw : raw.data ?? [] })); }
    else if (cmd === 'submitq') show(submitQueue());
    else if (cmd === 'queue') show(cdb().prepare("SELECT id FROM clip_jobs WHERE status = 'queued' ORDER BY id").all().map((r) => r.id)); // dipakai laptop-worker
    else if (cmd === 'used') show(cdb().prepare("SELECT start, end FROM clip_jobs WHERE source_url = (SELECT source_url FROM clip_jobs WHERE id = ?) AND start IS NOT NULL AND id != ?").all(+a, +a));
    else if (cmd === 'setjob') { // laptop: setjob <id> '<json>' (status, start, end, hook, caption, file, err)
      const p = JSON.parse(readFileSync(0, 'utf8') || '{}');
      const cols = Object.keys(p).filter((k) => ['status', 'start', 'end', 'hook', 'caption', 'file', 'err', 'source_url'].includes(k));
      if (cols.length) cdb().prepare(`UPDATE clip_jobs SET ${cols.map((k) => `${k} = @${k}`).join(', ')}, updated_at = datetime('now') WHERE id = @id`).run({ ...Object.fromEntries(cols.map((k) => [k, p[k]])), id: +a });
      if (p.status === 'failed') await sayAs('cedit', `⚠️ Clip #${a} gagal diedit di laptop: ${esc(String(p.err ?? '').slice(0, 200))}`).catch(() => {});
      show({ ok: true });
    }
    else if (cmd === 'submitted') show(await submitted(a, process.argv.slice(2).filter((x) => !x.startsWith('--'))[2] ?? 'ok'));
    else if (cmd === 'job') show(cdb().prepare('SELECT j.*, c.title ctitle, c.brief, c.assets, c.min_views, c.platforms FROM clip_jobs j JOIN clip_campaigns c ON c.id = j.campaign_id WHERE j.id = ?').get(+a));
    else if (cmd === 'bot') await runBot();
    else console.log('pakai: clipper.mjs scout|propose|list|jobs|approve|skip|plan|post|track|report|bot (lihat header file)');
  } catch (e) { console.error(`Error: ${e.message}`); process.exit(1); }
}
