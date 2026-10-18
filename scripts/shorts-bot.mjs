#!/usr/bin/env node
// Divisi YouTube Shorts: bot Telegram @zataashortbot + alur konten (DB contents, channel 'youtube', format/slot 'shorts').
// Bot jalan di dalam watcher (long polling, terpisah dari bot kantor), cuma nerima pesan & tombol dari SHORTS_OWNER_ID.
// Alur: new (sesi harian) → antre render laptop (_laptop 1, scripts/shorts-laptop.mjs, OmniVoice) → submit (Kirana kirim video + ✅/✏️/❌)
//       → ✅ → tunggu jam tayang (_jam) → upload YouTube Publik lewat Zernio (scripts/zernio.mjs) → 'posted'. Tanpa ZERNIO_API_KEY: scripts/youtube.mjs Private → 'uploaded' + pengingat → Owner tekan
//       "Sudah Publik" → 'posted'. Shorts belum dianggap tayang sebelum Owner konfirmasi.
//   node scripts/shorts-bot.mjs new <file.json>       {topic_id (bank topik, approved), title, caption, hashtags, sources?, day?, jam? (HH:MM WIB), test?, synthetic?, tags?, spec:{voice, mood, scenes[]}}
//   node scripts/shorts-bot.mjs get <id> | set <id> <json|file> (+ jam) | list [tgl_senin]
//   node scripts/shorts-bot.mjs queue <id>            antre render ulang di laptop
//   node scripts/shorts-bot.mjs submit <id>           kirim ke Owner (dipanggil laptop setelah render)
//   node scripts/shorts-bot.mjs upload <id>           upload manual sekarang (Owner sudah ✅; normalnya otomatis di jam tayang)
//   ❌ Tolak → Claude CLI bikin Shorts pengganti (topik lain, hari & jam sama)
//   node scripts/shorts-bot.mjs say <agent> "<teks>"  pesan dari pegawai YouTube
//   node scripts/shorts-bot.mjs report [--dry]        laporan harian sekarang (otomatis tiap 19:00 WITA; --dry = cetak saja, tidak dikirim)
//   node scripts/shorts-bot.mjs weekly [--dry]        laporan mingguan sekarang (otomatis Minggu 19:30 WITA)
//   .env: SHORTS_BOT_TOKEN, SHORTS_OWNER_ID (+ YT_* untuk upload)
process.removeAllListeners('warning');
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { loadEnv, NAMA } from './approval.mjs';
import { zernioOn, youtubeUpload } from './zernio.mjs';
import { tdb, getTopic, checkQuota, syncTopic, weekStats, WEEK_TOTAL, HH_MIN, PILLARS } from './shorts-topics.mjs';
import { claude, formatReply, ESCALATE, isStatusQuestion } from './ask.mjs';
import { wita } from '../docs/js/schedule.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATE = join(ROOT, 'tmp', 'shorts-bot.json');
const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const SLOT_WIB = '18:00'; // default; jam tayang per Shorts (hasil riset harian Kirana) di data_json._jam
const jamOf = (c) => { try { return JSON.parse(c.data_json ?? '{}')._jam ?? SLOT_WIB; } catch { return SLOT_WIB; } };
// visibilitas pilihan Owner (data_json._privacy). Sebelum project API lolos audit YouTube semua upload tetap terkunci Private;
// setelah lolos, set YT_AUDITED=1 di .env → default Publik.
const PRIV = { public: 'Publik', unlisted: 'Unlisted', private: 'Private' };
const privOf = (c) => { try { const p = JSON.parse(c.data_json ?? '{}')._privacy; if (PRIV[p]) return p; } catch { /* default */ } return loadEnv().YT_AUDITED === '1' ? 'public' : 'private'; };
const JAM = /^([01]\d|2[0-3]):[0-5]\d$/;
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const out = (o) => console.log(typeof o === 'string' ? o : JSON.stringify(o));
const state = () => { try { return JSON.parse(readFileSync(STATE, 'utf8')); } catch { return {}; } };
const saveState = (s) => { mkdirSync(dirname(STATE), { recursive: true }); writeFileSync(STATE, JSON.stringify(s)); };
const patchState = (fn) => { const s = state(); fn(s); saveState(s); };

export async function db() {
  const { DatabaseSync } = await import('node:sqlite');
  const d = new DatabaseSync(join(ROOT, 'db', 'office.db'));
  for (const col of ['channel TEXT', 'youtube_id TEXT', 'revisions INTEGER NOT NULL DEFAULT 0']) {
    try { d.exec(`ALTER TABLE contents ADD COLUMN ${col}`); } catch { /* sudah ada */ }
  }
  return d;
}
const act = (d, agent, msg) => { try { d.prepare('INSERT INTO activity (agent_id, message) VALUES (?, ?)').run(agent, msg); } catch { /* pegawai belum ada di DB lama */ } };
const getShort = (d, id) => d.prepare("SELECT * FROM contents WHERE id = ? AND channel = 'youtube'").get(id);
const dataOf = (c) => { try { return JSON.parse(c.data_json ?? '{}'); } catch { return {}; } };

// ---------- Telegram (bot @zataashortbot)
async function api(method, params = {}, files = {}) {
  const token = loadEnv().SHORTS_BOT_TOKEN;
  if (!token) throw new Error('SHORTS_BOT_TOKEN kosong di .env');
  let body, headers = {};
  if (Object.keys(files).length) {
    body = new FormData();
    for (const [k, v] of Object.entries(params)) body.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    for (const [k, p] of Object.entries(files)) body.append(k, new Blob([await readFile(p)]), basename(p));
  } else {
    body = JSON.stringify(params);
    headers = { 'Content-Type': 'application/json' };
  }
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', body, headers });
  const j = await r.json();
  if (!j.ok) throw new Error(`Telegram ${method}: ${j.description}`);
  return j.result;
}
const owner = () => loadEnv().SHORTS_OWNER_ID;
const send = (text, extra = {}) => api('sendMessage', { chat_id: owner(), text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra });
// nama pegawai YouTube selalu di depan: "<b>Kirana</b>: ..."
export const sayAs = (agent, text, extra) => send(`<b>${NAMA[agent] ?? agent}</b>: ${text}`, extra);

// ---------- konten Shorts
const head = (c) => {
  const hari = DAYS[new Date(`${c.day}T00:00:00Z`).getUTCDay()];
  return `🎬 <b>Shorts #${c.id}</b> · ${hari} ${c.day.slice(8)}/${c.day.slice(5, 7)} · ${jamOf(c)} WIB${c.revisions ? ` · revisi ke-${c.revisions}` : ''}`;
};
const description = (c) => [c.caption, c.hashtags].filter(Boolean).join('\n\n');

export async function newShort(p) {
  if (!p.title || !p.spec?.scenes?.length) throw new Error('butuh title + spec.scenes');
  if (p.jam && !JAM.test(p.jam)) throw new Error('jam harus HH:MM (WIB)');
  for (const s of p.spec.scenes) if (!s.img || !s.vo || !s.sub) throw new Error('tiap adegan butuh img, vo, sub');
  const missing = p.spec.scenes.map((s) => s.img).filter((f) => !existsSync(join(ROOT, f)));
  if (missing.length) throw new Error(`gambar tidak ada (path relatif dari root repo): ${missing.join(', ')}`);
  const d = await db();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar' }).format(new Date());
  const day = p.day ?? today;
  // tiap Shorts wajib dari bank topik (status approved) + lolos kuota mingguan (≥4 Hidden History dari 7)
  let topic = null;
  if (!p.test) {
    if (!p.topic_id) throw new Error('butuh topic_id dari bank topik (node scripts/shorts-topics.mjs next)');
    topic = getTopic(await tdb(), p.topic_id);
    if (!topic) throw new Error(`topik ${p.topic_id} tidak ada di bank`);
    if (topic.status !== 'approved') throw new Error(`topik ${p.topic_id} statusnya ${topic.status}, harus approved dulu`);
    checkQuota(d, day, topic.pillar);
  }
  const data = { ...p.spec, ...(p.tags ? { tags: p.tags } : {}), ...(p.synthetic ? { synthetic: true } : {}), ...(p.test ? { _test: 1 } : {}), ...(p.jam ? { _jam: p.jam } : {}), ...(topic ? { _topic: topic.topic_id } : {}), _laptop: 1 };
  const r = d.prepare("INSERT INTO contents (channel, day, slot, format, game, pillar, title, data_json, caption, hashtags, sources, template) VALUES ('youtube', ?, 'shorts', 'shorts', 'sejarah', ?, ?, ?, ?, ?, ?, 'shorts')")
    .run(day, topic?.pillar ?? 'misteri', String(p.title).slice(0, 100), JSON.stringify(data), p.caption ?? '', p.hashtags ?? '#Shorts #sejarah', p.sources ?? null);
  const id = Number(r.lastInsertRowid);
  if (topic) syncTopic(d, topic.topic_id, 'production', { contentId: id });
  act(d, 'yvideo', `Shorts #${id} "${p.title}" masuk antrean render laptop (OmniVoice)`);
  return { ok: true, id, topic_id: topic?.topic_id ?? null, queued: 'laptop' };
}

export async function queue(id) {
  const d = await db();
  const c = getShort(d, id);
  if (!c) throw new Error(`Shorts #${id} tidak ada`);
  d.prepare("UPDATE contents SET data_json = json_remove(json_set(data_json, '$._laptop', 1), '$._err'), asset_path = NULL, updated_at = datetime('now') WHERE id = ?").run(id);
  patchState((s) => { delete (s.notified ??= {})[`wait${id}`]; delete s.notified[`err${id}`]; });
  return { ok: true, id, queued: 'laptop' };
}

const BUTTONS = (id) => ({ inline_keyboard: [[{ text: '✅ Approve', callback_data: `yok:${id}` }, { text: '✏️ Revisi', callback_data: `yrev:${id}` }, { text: '❌ Tolak', callback_data: `yno:${id}` }]] });
export async function submit(id, { note = '' } = {}) {
  const d = await db();
  const c = getShort(d, id);
  if (!c) throw new Error(`Shorts #${id} tidak ada`);
  if (!c.asset_path) throw new Error(`Shorts #${id} belum dirender (antre laptop)`);
  const A = JSON.parse(c.asset_path);
  const data = dataOf(c);
  await api('sendVideo', { chat_id: owner(), caption: head(c), parse_mode: 'HTML', supports_streaming: true, width: 1080, height: 1920, ...(data.duration ? { duration: Math.round(data.duration) } : {}) },
    { video: join(ROOT, A.video), ...(A.cover && existsSync(join(ROOT, A.cover)) ? { thumbnail: join(ROOT, A.cover) } : {}) });
  let text = [
    `<b>${NAMA.ypublish}</b>: Bos, Shorts ini siap upload ke <b>Zataa Story</b> 👇`, '', head(c),
    data.duration ? `⏱️ ${Math.round(data.duration)} dtk · mood ${esc(data.mood ?? 'misteri')}${data._test ? ' · <i>uji coba</i>' : ''}` : '',
    note ? `🔁 <i>${esc(note)}</i>` : '', '',
    `👁️ Visibilitas: <b>${PRIV[privOf(c)]}</b> (ganti: ketik "publik #${c.id}" / "unlisted #${c.id}" / "private #${c.id}")`,
    `<b>Judul:</b> ${esc(c.title)}`, '', `<b>Deskripsi:</b>\n${esc(description(c) || '-')}`,
    c.sources ? `\n<b>Sumber:</b> ${esc(c.sources)}` : '', '',
    `✅ = di-upload otomatis pas jam tayang (${jamOf(c)} WIB, masuk <b>Private</b> dulu, nanti aku ingetin ubah ke Publik). ✏️ Revisi lalu ketik catatannya (boleh reply pesan ini). ❌ = tim bikin konten pengganti.`,
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
  if (text.length > 4000) text = `${text.slice(0, 3990)}…`;
  const m = await send(text, { reply_markup: BUTTONS(c.id) });
  patchState((s) => { (s.msgs ??= {})[m.message_id] = c.id; s.msgs = Object.fromEntries(Object.entries(s.msgs).slice(-40)); });
  d.prepare("UPDATE contents SET status = 'pending_approval', updated_at = datetime('now') WHERE id = ?").run(c.id);
  act(d, 'ypublish', `Kirim Shorts #${c.id} ke Owner buat approval`);
  return { ok: true, id: c.id, status: 'pending_approval' };
}

const remindText = (c) => `🔒 Shorts <b>#${c.id}</b> "${esc(c.title)}" masih <b>Private</b> di Zataa Story.
🔗 https://youtube.com/shorts/${c.youtube_id}
Bos, tolong ubah jadi <b>Publik</b> sendiri ya (jadwal tayang ${jamOf(c)} WIB): YouTube Studio → Konten → video ini → Visibilitas → Publik.
✏️ Studio: https://studio.youtube.com/video/${c.youtube_id}/edit
Kalau udah publik, tekan tombol di bawah biar tim catat udah tayang.`;
const PUB_BTN = (id) => ({ inline_keyboard: [[{ text: '✅ Sudah Publik', callback_data: `ypub:${id}` }]] });

const run = (args, minutes = 20) => new Promise((ok) => execFile(process.execPath, args, { cwd: ROOT, timeout: minutes * 60_000, maxBuffer: 1 << 22 }, (e, so, se) => ok({ ok: !e, out: String(so).trim(), err: String(se || e?.message || '').trim() })));

// upload YouTube (SELALU Private, aturan Owner) → simpan id → ingatkan Owner ubah ke Publik
export async function upload(id) {
  const d = await db();
  const c = getShort(d, id);
  if (!c) throw new Error(`Shorts #${id} tidak ada`);
  if (c.youtube_id) return { ok: true, id, youtube_id: c.youtube_id, already: true };
  if (!c.asset_path) throw new Error(`Shorts #${id} belum dirender`);
  const data = dataOf(c);
  const meta = { title: c.title, description: description(c), tags: data.tags ?? (c.hashtags ?? '').split(/\s+/).filter((t) => t.startsWith('#')).map((t) => t.slice(1)), synthetic: !!data.synthetic, privacy: privOf(c) };
  const metaPath = join(ROOT, 'tmp', `shorts-meta-${id}.json`);
  mkdirSync(dirname(metaPath), { recursive: true });
  writeFileSync(metaPath, JSON.stringify(meta));
  d.prepare("UPDATE contents SET status = 'uploading', updated_at = datetime('now') WHERE id = ?").run(id);
  const video = join(ROOT, JSON.parse(c.asset_path).video);
  let r, res = null;
  if (zernioOn()) { // lewat Zernio: app sudah diaudit → langsung Publik (keputusan Owner 18 Okt)
    try { res = await youtubeUpload(video, meta, `yt-${id}`); r = { ok: true }; } catch (e) { r = { ok: false, out: '', err: e.message }; }
  } else {
    r = await run(['scripts/youtube.mjs', 'upload', video, metaPath]);
    try { res = JSON.parse(r.out.split('\n').pop()); } catch { /* bukan JSON */ }
  }
  try { unlinkSync(metaPath); } catch { /* abaikan */ }
  if (!r.ok || !res?.id) {
    d.prepare("UPDATE contents SET status = 'upload_failed', updated_at = datetime('now') WHERE id = ?").run(id);
    act(d, 'ypublish', `Upload Shorts #${id} gagal`);
    throw new Error((r.err || r.out).split('\n').pop().slice(0, 300));
  }
  d.prepare("UPDATE contents SET status = 'uploaded', youtube_id = ?, asset_url = ?, updated_at = datetime('now') WHERE id = ?").run(res.id, res.url, id);
  act(d, 'ypublish', res.privacy === 'public' ? `Upload Shorts #${id} ke Zataa Story (Publik via Zernio)` : `Upload Shorts #${id} ke Zataa Story (Private), nunggu Owner ubah ke Publik`);
  return { ok: true, id, youtube_id: res.id, url: res.url, privacy: res.privacy };
}

// jam tayang (WIB) Shorts dalam ms; upload otomatis begitu lewat jam ini
const slotAt = (c) => new Date(`${c.day}T${jamOf(c)}:00+07:00`).getTime();

// ✅ Owner → status 'approved', upload otomatis di jam tayang (runJobs). Sudah lewat jam / "langsung upload" → upload sekarang.
async function approve(id, log, { now = false } = {}) {
  const d = await db();
  const c = getShort(d, id);
  if (!c) return sayAs('ypublish', `Shorts #${id} nggak ketemu, Bos 🤔`);
  if (c.youtube_id) return sayAs('ypublish', `Shorts #${id} udah ke-upload kok: https://youtube.com/shorts/${c.youtube_id}`, { reply_markup: PUB_BTN(id) });
  if (!['pending_approval', 'upload_failed', 'approved'].includes(c.status)) return sayAs('ypublish', `Shorts #${id} statusnya "${esc(c.status)}", belum bisa di-approve.`);
  d.prepare("UPDATE contents SET status = 'approved', updated_at = datetime('now') WHERE id = ?").run(id);
  act(d, 'owner', `Approve Shorts #${id} ✅`);
  if (now || c.status === 'upload_failed' || Date.now() >= slotAt(c)) return doUpload(id, log);
  const hari = DAYS[new Date(`${c.day}T00:00:00Z`).getUTCDay()];
  return sayAs('ypublish', `Siap Bos! ✅ Shorts #${id} dijadwalkan upload <b>${hari} ${c.day.slice(8)}/${c.day.slice(5, 7)} jam ${jamOf(c)} WIB</b>. Begitu ke-upload aku kabarin + ingetin ubah ke Publik.`);
}

const uploading = new Set();
async function doUpload(id, log) {
  if (uploading.has(id)) return;
  uploading.add(id);
  const d = await db();
  await sayAs('ypublish', `⏫ Shorts #${id} lagi aku upload ke Zataa Story…`).catch(() => {});
  try {
    const r = await upload(id);
    log(`shorts #${id} ke-upload: ${r.url}`);
    if (r.privacy === 'public') { // lolos audit: langsung tayang, nggak perlu diingetin
      d.prepare("UPDATE contents SET status = 'posted', posted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(id);
      syncTopic(d, dataOf(getShort(d, id))._topic, 'published', { url: r.url });
      await sayAs('ypublish', `🎉 Shorts #${id} udah tayang Publik di Zataa Story!\n🔗 ${r.url}`);
    } else if (r.privacy === 'unlisted' || (r.privacy === 'private' && privOf(getShort(d, id)) === 'private' && loadEnv().YT_AUDITED === '1')) {
      await sayAs('ypublish', `✅ Shorts #${id} ke-upload sebagai <b>${PRIV[r.privacy]}</b> sesuai pilihan Bos.\n🔗 ${r.url}`);
    } else {
      await sayAs('ypublish', `✅ Udah ke-upload!\n${remindText(getShort(d, id))}`, { reply_markup: PUB_BTN(id) });
      patchState((s) => { (s.remind ??= {})[id] = { n: 0, at: Date.now() }; });
    }
  } catch (e) {
    log(`shorts #${id} upload gagal: ${e.message}`);
    await sayAs('ypublish', `⚠️ Upload Shorts #${id} gagal: ${esc(e.message)}`, { reply_markup: { inline_keyboard: [[{ text: '🔁 Coba upload lagi', callback_data: `yok:${id}` }]] } });
  } finally { uploading.delete(id); }
}

async function markPublic(id) {
  const d = await db();
  const c = getShort(d, id);
  if (!c?.youtube_id) return sayAs('ypublish', `Shorts #${id} belum di-upload, Bos.`);
  if (c.status !== 'posted') {
    d.prepare("UPDATE contents SET status = 'posted', posted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(id);
    syncTopic(d, dataOf(c)._topic, 'published', { url: `https://youtube.com/shorts/${c.youtube_id}` });
    act(d, 'ypublish', `Shorts #${id} udah Publik di Zataa Story 🎉`);
  }
  patchState((s) => { delete (s.remind ??= {})[id]; });
  return sayAs('ypublish', `Mantap Bos, Shorts #${id} dicatat udah tayang 🎉 Nanti aku pantau views-nya.\n🔗 https://youtube.com/shorts/${c.youtube_id}`);
}

// revisi: Claude CLI (tim YouTube) ubah naskah/visual/judul → render ulang di laptop (atau langsung kirim kalau cuma judul/deskripsi)
const NO_RENDER = '[[TANPA_RENDER]]';
async function revise(id, note, log) {
  const d = await db();
  const c = getShort(d, id);
  if (!c) return;
  d.prepare("UPDATE contents SET status = 'revision', owner_note = ?, revisions = revisions + 1, updated_at = datetime('now') WHERE id = ?").run(note, id);
  act(d, 'owner', `Minta revisi Shorts #${id}: ${note}`);
  await sayAs('yscript', `🛠️ Siap Bos, revisi Shorts #${id} lagi dikerjain…`).catch(() => {});
  const r = await claude(`Kamu tim YouTube Shorts Zataa Story (sejarah kuno, pilar di office/youtube.md) di folder ini. Owner minta REVISI Shorts #${id}:
"${note}"

Langkah:
1. Baca office/youtube.md, lalu playbook yang kepakai: office/roles/yscript.md (naskah), yvisual.md (gambar), ypublish.md (judul/deskripsi).
2. node scripts/shorts-bot.mjs get ${id}
3. Ubah seperlunya (tulis JSON ke file sementara di tmp/ lalu: node scripts/shorts-bot.mjs set ${id} <file.json>; kunci: title, caption, hashtags, sources, data_json = spec render lengkap { voice, speed, tag, mood, scenes[{img, vo, sub, place?, credit?, move?}] }).
   Path img relatif dari root repo (mis. assets/shorts/<topik>/s1.jpg). Durasi 40–59 dtk (6–7 adegan, 75–95 kata narasi). Aturan fakta/teori/mitos & kredit visual tetap berlaku.
4. JANGAN render (render OmniVoice jalan otomatis di laptop), jangan kirim Telegram, jangan ubah konten lain.
Kalau yang diubah cuma judul/deskripsi/hashtag (naskah & gambar tetap), tulis persis ${NO_RENDER} di baris terakhir sebelum ringkasan.
Akhiri dengan SATU kalimat ringkas (santai) tentang apa yang diubah.`, 20);
  if (!r.ok) {
    log(`revisi shorts #${id} gagal: ${r.text.slice(0, 200)}`);
    return sayAs('yscript', `⚠️ Revisi Shorts #${id} belum bisa dikerjain otomatis (${esc(r.text.slice(0, 150))}). Dilanjut di sesi harian.`).catch(() => {});
  }
  const summary = r.text.split('\n').filter((l) => l.trim() && !l.includes(NO_RENDER)).pop() ?? '';
  act(d, 'yscript', `Revisi Shorts #${id} kelar: ${summary.slice(0, 120)}`);
  if (r.text.includes(NO_RENDER) && getShort(d, id).asset_path) {
    await submit(id, { note: `Hasil revisi: ${summary}` }).catch((e) => sayAs('ypublish', `⚠️ Gagal kirim ulang #${id}: ${esc(e.message)}`));
  } else {
    await queue(id);
    await sayAs('yvideo', `🎙️ Revisi #${id} kelar (${esc(summary.slice(0, 200))}). Videonya dirender ulang di laptop (suara OmniVoice), nanti Kirana kirim lagi ke sini.`).catch(() => {});
  }
  log(`revisi shorts #${id} beres`);
}

// ❌ Owner → tolak + tim bikin Shorts pengganti (topik lain) untuk hari & jam tayang yang sama
async function reject(id, log) {
  const d = await db();
  const c = getShort(d, id);
  if (!c) return;
  d.prepare("UPDATE contents SET status = 'rejected', updated_at = datetime('now') WHERE id = ? AND channel = 'youtube'").run(id);
  syncTopic(d, dataOf(c)._topic, 'backlog', { note: `[ditolak Owner di Shorts #${id}]` });
  act(d, 'owner', `Tolak Shorts #${id}`);
  await sayAs('ydir', `Oke Bos, Shorts #${id} "${esc(c.title)}" nggak dipakai. Tim langsung bikin konten pengganti dengan topik lain 🔄`).catch(() => {});
  later(() => replace(c, log), log);
}

async function replace(old, log) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar' }).format(new Date());
  const day = old.day > today ? old.day : today;
  const r = await claude(`Kamu tim YouTube Shorts Zataa Story (sejarah kuno, pilar di office/youtube.md) di folder ini. Owner MENOLAK Shorts #${old.id} "${old.title}". Bikin Shorts PENGGANTI dengan topik lain.

Langkah:
1. Baca office/youtube.md lalu playbook office/roles/ydir.md, yresearch.md, yscript.md, yvisual.md, ypublish.md.
2. node scripts/shorts-bot.mjs list lalu node scripts/shorts-topics.mjs next ${day} → pilih topik approved dari bank (patuhi pilar wajib yang dicetak), JANGAN sama/mirip "${old.title}" atau Shorts 14 hari terakhir. Bank kosong untuk pilar itu → tambah topik lengkap (shorts-topics.mjs add) lalu set status approved.
3. Riset (≤5 pencarian web), naskah 6–7 adegan 75–95 kata narasi (label fakta/teori/mitos, ≥2 sumber), gambar berlisensi bebas (Wikimedia Commons dll.).
   Unduh gambar pakai node (fetch dengan header User-Agent) ke assets/shorts/<topik>/s1.jpg dst + credits.txt. Cek tiap gambar sesuai isinya.
4. Tulis JSON ke tmp/ lalu: node scripts/shorts-bot.mjs new <file.json> dengan "topic_id", "day": "${day}" dan "jam": "${jamOf(old)}".
5. JANGAN render (otomatis di laptop), jangan kirim Telegram, jangan ubah konten lain.
Akhiri dengan SATU kalimat ringkas (santai): topik penggantinya apa.`, 30);
  if (!r.ok) {
    log(`pengganti shorts #${old.id} gagal: ${r.text.slice(0, 200)}`);
    return sayAs('ydir', `⚠️ Konten pengganti #${old.id} belum bisa dibikin otomatis (${esc(r.text.slice(0, 150))}). Dilanjut di sesi harian.`).catch(() => {});
  }
  const summary = r.text.split('\n').filter((l) => l.trim()).pop() ?? '';
  act(await db(), 'ydir', `Pengganti Shorts #${old.id}: ${summary.slice(0, 120)}`);
  await sayAs('ydir', `🎬 Pengganti #${old.id} siap: ${esc(summary.slice(0, 200))}\nLagi dirender di laptop, nanti Kirana kirim ke sini buat di-✅.`).catch(() => {});
  log(`pengganti shorts #${old.id} beres`);
}

async function statusText() {
  const d = await db();
  const rows = d.prepare("SELECT id, day, title, status, youtube_id, json_extract(data_json, '$._laptop') lap FROM contents WHERE channel = 'youtube' AND day >= date('now', '-7 days') ORDER BY day, id").all();
  const ST = { draft: 'draft', revision: 'revisi', pending_approval: 'nunggu ✅ Bos', approved: '✅, nunggu jam tayang', uploading: 'lagi upload', uploaded: 'Private, nunggu Bos ubah Publik', upload_failed: 'upload gagal', posted: 'tayang', rejected: 'ditolak' };
  const lap = { 1: '⏳ antre render laptop', 2: '🎙️ lagi dirender di laptop', 3: '⚠️ render gagal' };
  if (!rows.length) return `<b>${NAMA.ydir}</b>: Belum ada Shorts minggu ini, Bos. Produksi tiap hari, 1 Shorts per hari (jam tayang dicek tiap hari).`;
  return `<b>${NAMA.ydir}</b>: Rekap Shorts 7 hari terakhir:\n${rows.map((r) => `• #${r.id} ${r.day.slice(8)}/${r.day.slice(5, 7)} ${esc(r.title)} — ${lap[r.lap] ?? ST[r.status] ?? r.status}`).join('\n')}`;
}

// ---------- laporan Kirana di bot ini (0 token): harian 19:00 WITA, mingguan Minggu 19:30 WITA
const REPORT_MIN = 19 * 60, WEEKLY_MIN = 19 * 60 + 30;
const LONGFORM_SUBS = 500; // target Owner: mulai video panjang 5–10 menit (office/youtube.md)
const num = (n) => (n == null ? '?' : Number(n).toLocaleString('id-ID'));
const plus = (n) => (n == null ? '' : ` (${n >= 0 ? '+' : ''}${num(n)})`);
const dm = (date) => `${date.slice(8)}/${date.slice(5, 7)}`;
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const PROD = { draft: '📝 naskah/visual', revision: '✏️ revisi', pending_approval: '⏳ nunggu ✅ Bos', approved: '✅ nunggu jam tayang', uploading: '⏫ lagi upload', uploaded: '🔒 Private, nunggu Publik', upload_failed: '⚠️ upload gagal', posted: '📢 tayang' };
const LAP = { 1: '⏳ antre render laptop', 2: '🎙️ dirender di laptop', 3: '⚠️ render gagal' };
const prodLine = (c) => `#${c.id} ${esc(c.title.slice(0, 45))} — ${LAP[c.lap] ?? PROD[c.status] ?? esc(c.status)}`;
async function ytStats() {
  const r = await run(['scripts/youtube.mjs', 'stats'], 3);
  if (!r.ok) throw new Error((r.err || r.out).split('\n').pop().slice(0, 200));
  const st = JSON.parse(r.out.split('\n').pop());
  return { st, views: st.list.reduce((a, v) => a + v.views, 0) }; // total channel dari API telat update → jumlahkan per video
}

export async function dailyReport({ dry = false } = {}) {
  const { st, views } = await ytStats();
  const d = await db();
  const prev = state().snap;
  const t = wita(new Date());
  const hari = DAYS[new Date(`${t.date}T00:00:00Z`).getUTCDay()];
  const vPrev = prev?.videos ?? {};
  const rows = st.list.filter((v) => v.privacy !== 'private' || v.views > 0)
    .map((v) => ({ ...v, dv: vPrev[v.id] ? v.views - vPrev[v.id].v : null }))
    .sort((a, b) => (b.dv ?? b.views) - (a.dv ?? a.views));
  const prodOf = (day) => d.prepare(`SELECT id, title, status, json_extract(data_json, '$._laptop') lap FROM contents
    WHERE channel = 'youtube' AND day = ? AND status != 'rejected' AND COALESCE(json_extract(data_json, '$._test'), 0) = 0 ORDER BY id`).all(day);
  const today = prodOf(t.date), tomorrow = prodOf(addDays(t.date, 1));
  const wk = weekStats(d, t.date);
  const ready = d.prepare("SELECT COUNT(*) n FROM shorts_topics WHERE status = 'approved'").get().n;
  const lines = [
    `📊 <b>Laporan harian YouTube Shorts</b> · ${hari} ${dm(t.date)}`, '',
    '<b>Channel Zataa Story</b>',
    `👥 Subscriber: <b>${num(st.subscribers)}</b>${prev ? plus(st.subscribers - prev.subs) : ''}`,
    `👁️ Views: <b>${num(views)}</b>${prev ? plus(views - prev.views) : ''}`,
    `👍 Likes: <b>${num(st.likes)}</b>${prev ? plus(st.likes - prev.likes) : ''}`,
    `🎬 Video tayang: ${st.list.filter((v) => v.privacy === 'public').length}`,
    ...rows.slice(0, 5).map((v, i) => `${i + 1}. ${esc(v.title.slice(0, 45))} · 👁️ ${num(v.views)}${plus(v.dv)} · 👍 ${num(v.likes)}${v.privacy !== 'public' ? ` · <i>${v.privacy}</i>` : ''}`), '',
    '<b>Produksi</b>',
    `Hari ini: ${today.length ? today.map(prodLine).join('; ') : '⚠️ belum ada Shorts'}`,
    `Besok: ${tomorrow.length ? tomorrow.map(prodLine).join('; ') : 'belum disiapkan (dikerjain sesi pagi)'}`,
    `Kuota minggu ini: ${wk.rows.length}/${WEEK_TOTAL} Shorts · Hidden History ${wk.hh}/${HH_MIN} · bank topik siap: ${ready}`,
    ...(st.subscribers >= LONGFORM_SUBS && !state().longform ? [`\n🎉 <b>Tembus ${num(LONGFORM_SUBS)} subscriber!</b> Sesuai rencana Bos, waktunya nambah video panjang 5–10 menit (Shorts tetap jalan seperti biasa). Bagas siapin rencananya ya.`] : []),
    prev ? `\n<i>(angka dalam kurung = kenaikan sejak laporan ${dm(prev.date)})</i>` : '\n<i>Laporan pertama, kenaikan harian mulai muncul besok.</i>',
  ];
  if (dry) return lines.join('\n');
  await sayAs('ypublish', lines.join('\n'));
  patchState((s) => { s.snap = { date: t.date, subs: st.subscribers, views, likes: st.likes, videos: Object.fromEntries(st.list.map((v) => [v.id, { v: v.views, l: v.likes }])) }; s.reportDate = t.date; if (st.subscribers >= LONGFORM_SUBS) s.longform = s.longform ?? t.date; });
  return { ok: true, subscribers: st.subscribers, views, likes: st.likes };
}

// rekap mingguan (Senin–Minggu): target 7 Shorts & ≥4 Hidden History, top video, pilar paling ditonton → bahan evaluasi Bagas
export async function weeklyReport({ dry = false } = {}) {
  const { st, views } = await ytStats();
  const d = await db();
  const t = wita(new Date());
  const wk = weekStats(d, t.date);
  const prev = state().weekSnap;
  const byId = Object.fromEntries(st.list.map((v) => [v.id, v]));
  const ids = wk.rows.map((r) => r.id);
  const info = ids.length ? Object.fromEntries(d.prepare(`SELECT id, status, youtube_id, revisions FROM contents WHERE id IN (${ids.join(',')})`).all().map((c) => [c.id, c])) : {};
  const rows = wk.rows.map((r) => ({ ...r, ...info[r.id], v: byId[info[r.id]?.youtube_id] }));
  const live = rows.filter((r) => r.v);
  const rejected = d.prepare("SELECT COUNT(*) n FROM contents WHERE channel = 'youtube' AND status = 'rejected' AND day BETWEEN ? AND ?").get(wk.mon, wk.sun).n;
  const pil = {};
  for (const r of live) (pil[r.pillar ?? 'lain'] ??= []).push(r.v.views);
  const avg = Object.entries(pil).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length]).sort((a, b) => b[1] - a[1]);
  const label = (k) => PILLARS[k]?.label ?? k;
  const ready = d.prepare("SELECT COUNT(*) n FROM shorts_topics WHERE status = 'approved'").get().n;
  const lines = [
    `🗓️ <b>Laporan mingguan YouTube Shorts</b> · ${dm(wk.mon)}–${dm(wk.sun)}`, '',
    '<b>Channel Zataa Story</b>',
    `👥 Subscriber: <b>${num(st.subscribers)}</b>${prev ? plus(st.subscribers - prev.subs) : ''} · target video panjang ${num(LONGFORM_SUBS)}`,
    `👁️ Views: <b>${num(views)}</b>${prev ? plus(views - prev.views) : ''}`, '',
    '<b>Produksi</b>',
    `🎬 ${rows.length}/${WEEK_TOTAL} Shorts · 📢 tayang ${live.length} · Hidden History ${wk.hh}/${HH_MIN}${wk.hh >= HH_MIN ? ' ✅' : ' ⚠️'} · ❌ ditolak ${rejected} · ✏️ revisi ${rows.reduce((a, r) => a + (r.revisions ?? 0), 0)}×`,
    ...(live.length ? ['', '<b>Top video minggu ini</b>', ...[...live].sort((a, b) => b.v.views - a.v.views).slice(0, 3).map((r, i) => `${i + 1}. #${r.id} ${esc(r.title.slice(0, 45))} · 👁️ ${num(r.v.views)} · 👍 ${num(r.v.likes)}`)] : []),
    ...(avg.length ? ['', '<b>Pilar paling ditonton</b>', ...avg.map(([k, v]) => `• ${esc(label(k))}: rata-rata ${num(Math.round(v))} views`)] : []), '',
    `📚 Bank topik siap produksi: ${ready}${ready < WEEK_TOTAL ? ' (kurang buat seminggu, Nadhira tambah riset)' : ''}`,
    avg.length ? `Saran: perbanyak <b>${esc(label(avg[0][0]))}</b> di slot bebas minggu depan. Bagas pakai ini buat antrean topik.` : '',
    prev ? `<i>(angka dalam kurung = kenaikan sejak laporan ${dm(prev.date)})</i>` : '',
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '');
  if (dry) return lines.join('\n').trim();
  await sayAs('ypublish', lines.join('\n').trim());
  patchState((s) => { s.weekSnap = { date: t.date, subs: st.subscribers, views }; s.weeklyDate = t.date; });
  return { ok: true, shorts: rows.length, hh: wk.hh };
}

// pesan bebas Owner → Claude CLI sebagai tim YouTube
async function talk(msg, log) {
  const r = await claude(`Kamu tim YouTube Shorts "Zataa Story" (sejarah misteri kuno + mitologi Yunani) di folder ini, ngobrol dengan Owner (Bos Zamiir) lewat bot Telegram @zataashortbot.
Pesan Owner: "${msg}"
Tim: Bagas (ydir, Manajer YouTube), Nadhira (yresearch, riset), Laras (yscript, naskah + cek fakta), Galih (yvisual, visual berlisensi), Yoga (yvideo, render + VO), Kirana (ypublish, upload & SEO).
SOP & cara kerja: office/youtube.md (baca kalau perlu). Data Shorts: node scripts/shorts-bot.mjs list. Jangan ngarang angka views.
Tugas (mis. bikin Shorts baru / ganti topik): kerjakan sesuai office/youtube.md (new → render otomatis di laptop → Kirana kirim ke sini). Jangan kirim Telegram sendiri.
Urusan marketing top up / IG / trading / keuangan → tulis persis ${ESCALATE} lalu berhenti.
Akhiri dengan baris "BALASAN:" lalu 1–3 baris, TIAP baris diawali nama pegawai: "Nama: pesan". Santai, sopan.`, 25);
  if (r.ok && r.text.includes(ESCALATE)) return sayAs('ydir', 'Itu urusan kantor marketing/trading, Bos 🙏 Marketing/IG ke bot Zataa Office Marketing, trading ke bot Zataa Office Trading, keuangan ke @zataaaccountingbot ya. Di sini khusus YouTube Shorts.');
  if (!r.ok) { log(`bot shorts: claude gagal ${r.text.slice(0, 200)}`); return sayAs('ydir', '⚠️ Maaf Bos, lagi error. Coba lagi bentar ya.'); }
  return send(formatReply(r.text, 'ydir'));
}

// ---------- jadwal (0 token, tiap menit): pengingat Publik + jaga antrean laptop
async function runJobs(log) {
  const d = await db();
  const s = state();
  const notified = (s.notified ??= {});
  const remind = (s.remind ??= {});
  const t = wita(new Date());
  // klaim laptop macet >60 mnt (laptop mati di tengah render) → antre lagi
  d.prepare("UPDATE contents SET data_json = json_set(data_json, '$._laptop', 1) WHERE channel = 'youtube' AND json_extract(data_json, '$._laptop') = 2 AND updated_at < datetime('now', '-60 minutes')").run();
  for (const c of d.prepare("SELECT id, title, updated_at, json_extract(data_json, '$._laptop') lap, json_extract(data_json, '$._err') err FROM contents WHERE channel = 'youtube' AND status IN ('draft', 'revision') AND json_extract(data_json, '$._laptop') IN (1, 3)").all()) {
    if (c.lap === 3 && !notified[`err${c.id}`]) {
      notified[`err${c.id}`] = 1;
      await sayAs('yvideo', `⚠️ Render Shorts #${c.id} "${esc(c.title)}" di laptop gagal: ${esc(String(c.err ?? '').slice(0, 300))}\nNanti dibenerin tim di sesi berikutnya, atau balas di sini kalau mau ubah sesuatu.`).catch(() => {});
      log(`shorts #${c.id}: render laptop gagal, Owner dikabari`);
    }
    if (c.lap === 1 && !notified[`wait${c.id}`] && new Date(`${c.updated_at.replace(' ', 'T')}Z`) < Date.now() - 3 * 3600e3) {
      notified[`wait${c.id}`] = 1;
      await sayAs('yvideo', `💻 Shorts #${c.id} "${esc(c.title)}" udah 3 jam nunggu laptop nyala buat render suara OmniVoice, Bos. Begitu laptop on, otomatis aku render & kirim ke sini.`).catch(() => {});
    }
  }
  // sudah di-✅ Owner → upload begitu masuk jam tayang
  for (const c of d.prepare("SELECT * FROM contents WHERE channel = 'youtube' AND status = 'approved' AND youtube_id IS NULL").all()) {
    if (Date.now() >= slotAt(c) && !uploading.has(c.id)) { uploading.add(c.id); later(() => { uploading.delete(c.id); return doUpload(c.id, log); }, log); }
  }
  // Private → Publik: ingatkan lagi di jam tayang (_jam, default 18:00 WIB) lalu tiap pagi 09:00 WITA, maks 3×
  for (const c of d.prepare("SELECT * FROM contents WHERE channel = 'youtube' AND status = 'uploaded' AND youtube_id IS NOT NULL").all()) {
    const r = (remind[c.id] ??= { n: 0 });
    const slotDue = r.n === 0 && Date.now() >= Math.max(new Date(`${c.day}T${jamOf(c)}:00+07:00`).getTime(), (r.at ?? 0) + 2 * 3600e3);
    const morningDue = r.n > 0 && r.n < 3 && r.last !== t.date && t.minutes >= 9 * 60 && t.minutes < 12 * 60;
    if (!slotDue && !morningDue) continue;
    r.n += 1; r.last = t.date;
    await sayAs('ypublish', `⏰ Pengingat ${r.n}/3\n${remindText(c)}`, { reply_markup: PUB_BTN(c.id) }).catch(() => {});
    log(`shorts #${c.id}: pengingat Publik ${r.n}/3`);
  }
  saveState({ ...state(), notified, remind });
  // laporan harian 19:00 & mingguan Minggu 19:30 WITA (sekali per hari; jalan di antrean biar nggak dobel)
  if (t.minutes >= REPORT_MIN && state().reportDate !== t.date && !reporting) {
    reporting = true;
    later(() => dailyReport().then(() => log('shorts: laporan harian terkirim')).catch((e) => { log(`shorts: laporan harian gagal ${e.message}`); patchState((s) => { s.reportDate = t.date; }); }).finally(() => { reporting = false; }), log);
  } else if (t.minutes >= WEEKLY_MIN && new Date(`${t.date}T00:00:00Z`).getUTCDay() === 0 && state().reportDate === t.date && state().weeklyDate !== t.date && !reporting) {
    reporting = true;
    later(() => weeklyReport().then(() => log('shorts: laporan mingguan terkirim')).catch((e) => { log(`shorts: laporan mingguan gagal ${e.message}`); patchState((s) => { s.weeklyDate = t.date; }); }).finally(() => { reporting = false; }), log);
  }
}
let reporting = false;

// antrean kerja panjang (upload/revisi/obrolan Claude) satu per satu, polling tetap jalan
let chain = Promise.resolve();
const later = (fn, log) => { chain = chain.then(fn).catch((e) => log(`bot shorts: ${e.message}`)); };

export async function startShortsBot(log = console.log) {
  const env = loadEnv();
  if (!env.SHORTS_BOT_TOKEN || !env.SHORTS_OWNER_ID) return log('bot shorts: SHORTS_BOT_TOKEN/SHORTS_OWNER_ID kosong, dilewati');
  await db(); // pastikan kolom channel/youtube_id ada
  let offset = 0, fails = 0;
  log('bot YouTube Shorts (@zataashortbot) jalan');
  setInterval(() => runJobs(log).catch((e) => log(`bot shorts jobs: ${e.message}`)), 60_000);
  for (;;) {
    let ups = [];
    try { ups = await api('getUpdates', { offset, timeout: 50, allowed_updates: ['message', 'callback_query'] }); fails = 0; } catch (e) {
      if (++fails >= 3) log(`bot shorts: ${e.message}${e.cause ? ` (${e.cause.code ?? e.cause.message})` : ''} ×${fails}`);
      await new Promise((r) => setTimeout(r, fails < 3 ? 2_000 : 15_000));
      continue;
    }
    for (const u of ups) {
      offset = u.update_id + 1;
      try { await handle(u, log); } catch (e) { log(`bot shorts gagal: ${e.message}`); }
    }
  }
}

async function handle(u, log) {
  const me = String(owner());
  if (u.callback_query) {
    const q = u.callback_query;
    if (String(q.from.id) !== me) return;
    const [kind, sid] = String(q.data).split(':');
    const id = +sid;
    await api('answerCallbackQuery', { callback_query_id: q.id }).catch(() => {});
    const clear = () => api('editMessageReplyMarkup', { chat_id: q.message.chat.id, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {});
    if (kind === 'yok') { await clear(); later(() => approve(id, log), log); }
    else if (kind === 'yno') { await clear(); await reject(id, log); }
    else if (kind === 'ypub') { await clear(); await markPublic(id); }
    else if (kind === 'yrev') {
      patchState((s) => { s.awaitRev = id; });
      await sayAs('yscript', `✏️ Ketik catatan revisi buat Shorts #${id} ya, Bos (naskah, gambar, judul, apa aja).`, { reply_markup: { force_reply: true } });
    }
    return;
  }
  const m = u.message;
  if (!m || String(m.chat.id) !== me) return; // selain Owner: abaikan
  const text = (m.text ?? m.caption ?? '').trim();
  if (!text) return;
  const s = state();
  const replyId = s.msgs?.[m.reply_to_message?.message_id];
  if (/^\/start\b/.test(text)) return sayAs('ydir', `Halo Bos 👋 Ini bot tim YouTube Shorts <b>Zataa Story</b>. Tiap hari Kirana kirim 1 Shorts ke sini buat di-✅. Tombolnya ✅ Approve / ✏️ Revisi / ❌ Tolak. Setelah ✅, video di-upload otomatis pas jam tayang, langsung Publik. ❌ = tim bikin konten pengganti. Ketik "status" buat rekap.`);
  if (s.awaitRev || replyId) {
    const id = s.awaitRev ?? replyId;
    patchState((x) => { delete x.awaitRev; });
    return later(() => revise(id, text, log), log);
  }
  if (isStatusQuestion(text) || /^\/?(status|rekap)$/i.test(text)) return send(await statusText());
  const d = await db();
  if (/\blangsung\s+(post|posting|upload|tayang)/i.test(text)) { // "langsung post" = approval
    const p = d.prepare("SELECT id FROM contents WHERE channel = 'youtube' AND status IN ('pending_approval', 'upload_failed') ORDER BY id DESC").all();
    const pick = (text.match(/#?(\d+)/)?.[1] && p.find((r) => r.id === +text.match(/#?(\d+)/)[1])) || (p.length === 1 ? p[0] : null);
    if (pick) return later(() => approve(pick.id, log, { now: true }), log);
  }
  const vis = text.match(/^(publik|public|unlisted|private|privat)\s*#?(\d+)?$/i);
  if (vis) { // pilih visibilitas Shorts (default: yang lagi nunggu ✅ / jam tayang)
    const p = { publik: 'public', public: 'public', unlisted: 'unlisted', private: 'private', privat: 'private' }[vis[1].toLowerCase()];
    const c = vis[2] ? getShort(d, +vis[2]) : d.prepare("SELECT * FROM contents WHERE channel = 'youtube' AND status IN ('pending_approval', 'approved') ORDER BY day, id LIMIT 1").get();
    if (!c || c.youtube_id) return sayAs('ypublish', c ? `Shorts #${c.id} udah ke-upload, ubah visibilitasnya di YouTube Studio ya Bos.` : 'Nggak ada Shorts yang nunggu upload, Bos.');
    d.prepare("UPDATE contents SET data_json = json_set(data_json, '$._privacy', ?), updated_at = datetime('now') WHERE id = ?").run(p, c.id);
    return sayAs('ypublish', `Siap, Shorts #${c.id} nanti di-upload sebagai <b>${PRIV[p]}</b>.${loadEnv().YT_AUDITED === '1' ? '' : ' (Selama project API belum lolos audit YouTube, hasil upload tetap terkunci Private.)'}`);
  }
  if (/\b(udah|sudah|dah)\b.*\bpubli[ck]/i.test(text)) {
    const p = d.prepare("SELECT id FROM contents WHERE channel = 'youtube' AND status = 'uploaded' ORDER BY id").all();
    const pick = (text.match(/#(\d+)/)?.[1] && p.find((r) => r.id === +text.match(/#(\d+)/)[1])) || (p.length === 1 ? p[0] : null);
    if (pick) return markPublic(pick.id);
  }
  await api('sendChatAction', { chat_id: me, action: 'typing' }).catch(() => {});
  later(() => talk(text, log), log);
}

// ---------- CLI
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const [cmd, a, b] = process.argv.slice(2);
  const json = (x) => JSON.parse(existsSync(x) ? readFileSync(x, 'utf8') : x);
  try {
    if (cmd === 'new') out(await newShort(json(a)));
    else if (cmd === 'get') out((await db()).prepare("SELECT * FROM contents WHERE id = ? AND channel = 'youtube'").get(+a) ?? null);
    else if (cmd === 'set') {
      const d = await db();
      if (!getShort(d, +a)) throw new Error(`Shorts #${a} tidak ada`);
      // data_json baru = spec render; tanda internal (_test, _laptop, durasi) dibawa dari yang lama
      const keep = Object.fromEntries(Object.entries(dataOf(getShort(d, +a))).filter(([k]) => k.startsWith('_') || k === 'duration'));
      for (const [k, v] of Object.entries(json(b))) {
        if (k === 'jam') {
          if (!JAM.test(v)) throw new Error('jam harus HH:MM (WIB)');
          d.prepare("UPDATE contents SET data_json = json_set(data_json, '$._jam', ?), updated_at = datetime('now') WHERE id = ?").run(v, +a);
          continue;
        }
        if (!['title', 'caption', 'hashtags', 'sources', 'data_json', 'day', 'status'].includes(k)) continue;
        const val = k === 'data_json' ? JSON.stringify({ ...(typeof v === 'string' ? JSON.parse(v) : v), ...keep }) : v;
        d.prepare(`UPDATE contents SET ${k} = ?, updated_at = datetime('now') WHERE id = ?`).run(val, +a);
      }
      out('ok');
    } else if (cmd === 'list') {
      out((await db()).prepare("SELECT id, day, title, status, youtube_id, json_extract(data_json, '$._laptop') laptop, json_extract(data_json, '$._jam') jam FROM contents WHERE channel = 'youtube' AND day >= ? ORDER BY day, id").all(a ?? new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10)));
    } else if (cmd === 'queue') out(await queue(+a));
    else if (cmd === 'submit') out(await submit(+a));
    else if (cmd === 'upload') {
      const r = await upload(+a);
      const c = getShort(await db(), +a);
      if (!r.already) { await sayAs('ypublish', `✅ Udah ke-upload!\n${remindText(c)}`, { reply_markup: PUB_BTN(+a) }); patchState((s) => { (s.remind ??= {})[+a] = { n: 0, at: Date.now() }; }); }
      out(r);
    } else if (cmd === 'say') { await sayAs(a, esc(b)); out('ok'); }
    else if (cmd === 'report') out(await dailyReport({ dry: a === '--dry' }));
    else if (cmd === 'weekly') out(await weeklyReport({ dry: a === '--dry' }));
    else out('pakai: shorts-bot.mjs new <file.json> | get <id> | set <id> <json|file> | list [dari] | queue <id> | submit <id> | upload <id> | say <agent> "<teks>"');
  } catch (e) { out(`gagal: ${e.message}`); process.exit(1); }
}
