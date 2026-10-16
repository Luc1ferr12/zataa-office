#!/usr/bin/env node
// Approval konten lewat Telegram. Kirim langsung ke Bot API (file lokal), keputusan Owner ditampung n8n lalu ditarik ke sini.
//   node scripts/approval.mjs setup         cek bot + isi TELEGRAM_CHAT_ID otomatis (kirim /start ke bot dulu, sebelum workflow n8n aktif)
//   node scripts/approval.mjs submit <id>   kirim konten (media + caption + tombol) → status pending_approval
//   node scripts/approval.mjs poll          tarik keputusan dari n8n → approved / rejected / revision
//   node scripts/approval.mjs say "<teks>"  kirim pesan biasa ke Owner
process.removeAllListeners('warning');
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = join(ROOT, '.env');
const out = (o) => console.log(typeof o === 'string' ? o : JSON.stringify(o));

export function loadEnv() {
  if (!existsSync(ENV_PATH)) return {};
  return Object.fromEntries(readFileSync(ENV_PATH, 'utf8').split(/\r?\n/).filter((l) => /^\s*[A-Z0-9_]+\s*=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]));
}
function setEnv(key, value) {
  let s = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : '';
  const re = new RegExp(`^${key}=.*$`, 'm');
  s = re.test(s) ? s.replace(re, `${key}=${value}`) : `${s.replace(/\s*$/, '\n')}${key}=${value}\n`;
  writeFileSync(ENV_PATH, s);
}
const env = { ...loadEnv(), ...process.env };
export { setEnv };

export async function db() {
  const { DatabaseSync } = await import('node:sqlite');
  const d = new DatabaseSync(join(ROOT, 'db', 'office.db'));
  try { d.exec('ALTER TABLE contents ADD COLUMN revisions INTEGER NOT NULL DEFAULT 0'); } catch { /* sudah ada */ }
  d.exec(`CREATE TABLE IF NOT EXISTS boosts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, content_id INTEGER NOT NULL, month TEXT NOT NULL, amount INTEGER NOT NULL, days INTEGER NOT NULL,
    score REAL, status TEXT NOT NULL DEFAULT 'proposed', -- proposed | approved | skipped | active | failed
    campaign_id TEXT, adset_id TEXT, ad_id TEXT, error TEXT,
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`);
  return d;
}

// ---------- Telegram Bot API
export async function tg(method, params = {}, files = {}) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN belum diisi di .env');
  let body, headers = {};
  if (Object.keys(files).length) {
    body = new FormData();
    for (const [k, v] of Object.entries(params)) body.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    for (const [k, p] of Object.entries(files)) body.append(k, new Blob([await readFile(p)]), basename(p));
  } else {
    body = JSON.stringify(params);
    headers = { 'Content-Type': 'application/json' };
  }
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: 'POST', body, headers });
  const j = await r.json();
  if (!j.ok) throw new Error(`Telegram ${method}: ${j.description}`);
  return j.result;
}
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
// foto dari Owner (contoh desain) → simpan lokal di tmp/telegram/ supaya bisa dibaca Claude (Read bisa buka gambar)
export async function downloadPhotos(ids = []) {
  const { mkdir, writeFile } = await import('node:fs/promises');
  const dir = join(ROOT, 'tmp', 'telegram');
  await mkdir(dir, { recursive: true });
  const paths = [];
  for (const id of ids.slice(0, 4)) {
    try {
      const f = await tg('getFile', { file_id: id });
      const r = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${f.file_path}`);
      if (!r.ok) continue;
      const name = `${Date.now()}-${basename(f.file_path)}`;
      await writeFile(join(dir, name), Buffer.from(await r.arrayBuffer()));
      paths.push(`tmp/telegram/${name}`);
    } catch { /* foto kedaluwarsa / gagal unduh → lewati */ }
  }
  return paths;
}
// teks tambahan untuk prompt Claude kalau Owner kirim gambar
export const photoNote = (paths) => (paths.length
  ? `
Owner juga kirim ${paths.length} gambar contoh/referensi: ${paths.join(', ')}. WAJIB buka tiap gambar dengan Read dan ikuti gaya/isi yang dimaksud Owner (warna, layout, tipografi, elemen), tetap pakai template & aturan konten.`
  : '');

export const say = (text) => tg('sendMessage', { chat_id: env.TELEGRAM_CHAT_ID, text, parse_mode: 'HTML', disable_web_page_preview: true });
// nama pegawai yang ngomong selalu di depan pesan, biar Owner tahu siapa yang bales: "<b>Maria</b>: ..."
export const NAMA = { dir: 'Andre', sec: 'Aprista', researcher: 'Clariana', copywriter: 'Ista', designer: 'Maria', video: 'Dimas', publisher: 'Fikri', ads: 'Fahriah', analyst: 'Raka', price: 'Budi', ob: 'Mbak Sari',
  tdir: 'Mahendra', tresearch: 'Davina', ttech: 'Keira', trisk: 'Aryaputra', texec: 'Wiratama', teval: 'Jihan', treport: 'Selena',
  ydir: 'Bagas', yresearch: 'Nadhira', yscript: 'Laras', yvisual: 'Galih', yvideo: 'Yoga', ypublish: 'Kirana' };
export const sayAs = (agent, text) => say(`<b>${NAMA[agent] ?? agent}</b>: ${text}`);

export const SLOT = { pagi: '10:00', siang: '12:00', sore: '16:00', malam: '19:00', kilat: 'langsung' }; // WIB; pagi & sore = konten tambahan dari briefing
const slotLabel = (c) => (c.slot === 'kilat' ? 'langsung tayang' : `${SLOT[c.slot] ?? '?'} WIB`);
// tujuan posting per format: video → IG Reels (+ TikTok private kalau sudah login), feed/carousel → IG Feed
const tiktokOn = () => !!loadEnv().TIKTOK_REFRESH_TOKEN;
// TikTok default lewat Zataa Studio (Owner pilih privasi per post, aturan Direct Post); TIKTOK_MODE=auto = ikut auto-post private
const tiktokAuto = () => tiktokOn() && loadEnv().TIKTOK_MODE === 'auto';
export const targets = (c) => (c.format === 'video' && tiktokAuto() ? ['ig', 'tiktok'] : ['ig']);
export const targetLabel = (c) => (c.format === 'video' ? (tiktokAuto() ? 'IG Reels + TikTok (private)' : tiktokOn() ? 'IG Reels (+ TikTok lewat Studio)' : 'IG Reels') : c.format === 'carousel' ? 'IG Feed (carousel)' : 'IG Feed');
const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export async function submit(id, { note = '' } = {}) {
  const d = await db();
  const c = d.prepare('SELECT * FROM contents WHERE id = ?').get(id);
  if (!c) throw new Error(`konten ${id} tidak ada`);
  if (!c.asset_path) throw new Error(`konten ${id} belum dirender (node scripts/render.mjs ${id})`);
  const A = JSON.parse(c.asset_path);
  const abs = (p) => join(ROOT, p);
  const rev = c.revisions ? ` · revisi ke-${c.revisions}` : '';
  const hari = DAYS[new Date(`${c.day}T00:00:00Z`).getUTCDay()];
  const head = `<b>#${c.id}</b> · ${hari} ${c.day.slice(8)}/${c.day.slice(5, 7)} · ${c.slot} (${slotLabel(c)}) · ${c.format}${rev}`;
  const chat = env.TELEGRAM_CHAT_ID;
  if (!chat) throw new Error('TELEGRAM_CHAT_ID belum diisi (jalankan: node scripts/approval.mjs setup)');

  // 1) media: versi IG (4:5) atau video
  if (A.video) {
    await tg('sendVideo', { chat_id: chat, caption: head, parse_mode: 'HTML', supports_streaming: true, width: 1080, height: 1920 }, { video: abs(A.video), ...(A.cover ? { thumbnail: abs(A.cover) } : {}) });
  } else if ((A.feed ?? []).length > 1) {
    const files = Object.fromEntries(A.feed.slice(0, 10).map((p, i) => [`f${i}`, abs(p)]));
    const media = A.feed.slice(0, 10).map((_, i) => ({ type: 'photo', media: `attach://f${i}`, ...(i === 0 ? { caption: head, parse_mode: 'HTML' } : {}) }));
    await tg('sendMediaGroup', { chat_id: chat, media }, files);
  } else {
    await tg('sendPhoto', { chat_id: chat, caption: head, parse_mode: 'HTML' }, { photo: abs(A.feed[0]) });
  }
  // 2) detail + tombol
  const lines = [
    head, `<b>${esc(c.title)}</b>`, `📍 Tayang di: ${targetLabel(c)} · ${slotLabel(c)} (otomatis setelah Approve)`, '',
    note ? `🔁 <i>${esc(note)}</i>\n` : '',
    `<b>Caption:</b>\n${esc(c.caption ?? '-')}`,
    c.hashtags ? `\n${esc(c.hashtags)}` : '',
    c.sources ? `\n<b>Sumber:</b> ${esc(c.sources)}` : '',
    '', 'Balas pesan ini atau tekan ✏️ Revisi lalu ketik catatannya.',
  ].filter((l) => l !== '');
  let text = lines.join('\n');
  if (text.length > 4000) text = `${text.slice(0, 3990)}…`;
  await tg('sendMessage', {
    chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [[{ text: '✅ Approve', callback_data: `ok:${c.id}` }, { text: '✏️ Revisi', callback_data: `rev:${c.id}` }, { text: '❌ Tolak', callback_data: `no:${c.id}` }]] },
  });
  d.prepare("UPDATE contents SET status = 'pending_approval', updated_at = datetime('now') WHERE id = ?").run(c.id);
  d.prepare('INSERT INTO activity (agent_id, message) VALUES (?, ?)').run('publisher', `Kirim #${c.id} ke Owner buat approval${rev}`);
  return { ok: true, id: c.id, status: 'pending_approval' };
}

// ---------- plan mingguan (Senin) → ✅ / ✏️ Owner
const DAY_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
export async function submitPlan() {
  const d = await db();
  const c = d.prepare('SELECT * FROM campaigns ORDER BY week_start DESC LIMIT 1').get();
  if (!c) throw new Error('belum ada campaign minggu ini');
  const rows = d.prepare("SELECT day, slot, format, game, pillar, title FROM contents WHERE campaign_id = ? ORDER BY day, CASE slot WHEN 'pagi' THEN 0 WHEN 'siang' THEN 1 WHEN 'sore' THEN 2 ELSE 3 END").all(c.id);
  const byDay = {};
  for (const r of rows) (byDay[r.day] ??= []).push(r);
  const lines = Object.entries(byDay).map(([day, items]) => `<b>${DAY_SHORT[new Date(`${day}T00:00:00Z`).getUTCDay()]} ${day.slice(8)}/${day.slice(5, 7)}</b>\n${items
    .map((r) => `• ${r.slot} · ${r.format === 'video' ? '🎬' : '🖼️'} ${esc(r.game ?? '')} ${esc(r.pillar ?? '')}: ${esc(r.title)}`).join('\n')}`);
  let text = [`🗓️ <b>PLAN MINGGU ${c.week_start}</b> (Plan C${c.id}) dari Andre`, `Tema: <b>${esc(c.theme)}</b>`, c.goals ? `Target: ${esc(c.goals)}` : '', '', ...lines, '',
    'Tekan ✅ buat mulai produksi, atau ✏️ Revisi lalu ketik catatannya (boleh reply pesan ini).'].filter((l) => l !== '').join('\n');
  if (text.length > 4000) text = `${text.slice(0, 3990)}…`;
  await tg('sendMessage', {
    chat_id: env.TELEGRAM_CHAT_ID, text, parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[{ text: '✅ Approve plan', callback_data: `plan:${c.id}` }, { text: '✏️ Revisi plan', callback_data: `planrev:${c.id}` }]] },
  });
  d.prepare("UPDATE campaigns SET status = 'pending' WHERE id = ?").run(c.id);
  d.prepare('INSERT INTO activity (agent_id, message) VALUES (?, ?)').run('dir', `Kirim plan minggu ${c.week_start} ke Owner (${rows.length} konten)`);
  return { ok: true, campaign: c.id, contents: rows.length };
}

// ---------- ide briefing pagi (Selasa–Minggu): 2 ide terbaik pilihan Andre → Owner pilih
export async function submitIdeas() {
  const d = await db();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar' }).format(new Date());
  const ideas = d.prepare('SELECT * FROM ideas WHERE day = ? AND chosen = 1 ORDER BY id LIMIT 2').all(today);
  if (!ideas.length) throw new Error('belum ada ide yang dipilih hari ini (office.mjs idea pick)');
  const slotOf = (i) => (i === 0 ? 'pagi 10:00' : 'sore 16:00');
  const text = ['💡 <b>Ide konten tambahan hari ini</b> (hasil briefing, dipilih Andre)', '',
    ...ideas.map((x, i) => `<b>Ide ${i + 1}</b> · dari ${NAMA[x.agent_id] ?? x.agent_id} · tayang ${slotOf(i)} WIB\n<b>${esc(x.title)}</b>\n${esc(x.concept ?? '')}`), '',
    'Desain feed aja (bukan video). Pilih yang mau dibikin:'].join('\n');
  const row = ideas.map((x, i) => ({ text: `✅ Ide ${i + 1}`, callback_data: `idea:${x.id}` }));
  const both = ideas.length === 2 ? [[{ text: '✅ Dua-duanya', callback_data: `ideas:${ideas[0].id}-${ideas[1].id}` }, { text: '❌ Skip', callback_data: `ideaskip:${ideas[0].id}` }]]
    : [[{ text: '❌ Skip', callback_data: `ideaskip:${ideas[0].id}` }]];
  await tg('sendMessage', { chat_id: env.TELEGRAM_CHAT_ID, text, parse_mode: 'HTML', reply_markup: { inline_keyboard: [row, ...both] } });
  for (const x of ideas) d.prepare("UPDATE ideas SET status = 'proposed' WHERE id = ?").run(x.id);
  d.prepare('INSERT INTO activity (agent_id, message) VALUES (?, ?)').run('dir', `Kirim ${ideas.length} ide briefing ke Owner`);
  return { ok: true, ideas: ideas.map((x) => x.id) };
}

// tarik keputusan dari n8n (antrian dengan nomor urut; ack = nomor terakhir yang sudah diproses)
export async function poll() {
  if (!env.N8N_DECISIONS_URL) throw new Error('N8N_DECISIONS_URL belum diisi di .env');
  const ack = +(loadEnv().N8N_ACK ?? 0);
  const r = await fetch(`${env.N8N_DECISIONS_URL}?ack=${ack}`, { headers: { 'x-zataa-key': env.N8N_KEY ?? '' } });
  if (!r.ok) throw new Error(`n8n ${r.status} ${await r.text()}`);
  const { decisions = [] } = await r.json();
  const fresh = decisions.filter((x) => x.seq > ack);
  if (!fresh.length) return [];
  const d = await db();
  const log = (m) => d.prepare('INSERT INTO activity (agent_id, message) VALUES (?, ?)').run('owner', m);
  for (const x of fresh) {
    // tombol usulan boost dari Fahriah (id = nomor boost, bukan konten) → dieksekusi scripts/boost.mjs
    if (x.action === 'chat') { log(`Chat: ${x.note}`); continue; } // dikerjakan watcher (scripts/ask.mjs)
    if (x.action === 'plan_approve') { d.prepare("UPDATE campaigns SET status = 'approved' WHERE id = ?").run(x.id); log(`Approve plan mingguan ✅`); continue; }
    if (x.action === 'plan_revision') { d.prepare("UPDATE campaigns SET status = 'revision' WHERE id = ?").run(x.id); log(`Minta revisi plan: ${x.note}`); continue; }
    if (x.action === 'idea_approve') {
      const ids = String(x.note || x.id).split(',').map(Number).filter(Boolean);
      for (const id of ids) d.prepare("UPDATE ideas SET status = 'approved' WHERE id = ?").run(id);
      d.prepare(`UPDATE ideas SET status = 'skipped' WHERE status = 'proposed' AND day = (SELECT day FROM ideas WHERE id = ?)`).run(ids[0] ?? 0);
      log(`Approve ${ids.length} ide konten tambahan 💡`); continue;
    }
    if (x.action === 'idea_skip') { d.prepare("UPDATE ideas SET status = 'skipped' WHERE status = 'proposed' AND day = (SELECT day FROM ideas WHERE id = ?)").run(x.id); log('Skip ide tambahan hari ini'); continue; }
    if (x.action === 'price_promo') { log('Minta konten promo dari perubahan harga 💰'); continue; }
    if (x.action === 'boost' || x.action === 'boost_skip') {
      const st = x.action === 'boost' ? 'approved' : 'skipped';
      d.prepare("UPDATE boosts SET status = ?, updated_at = datetime('now') WHERE id = ? AND status = 'proposed'").run(st, x.id);
      log(x.action === 'boost' ? `Setujui boost B${x.id} 💸` : `Lewati boost B${x.id}`);
      continue;
    }
    if (x.action === 'approve') { d.prepare("UPDATE contents SET status = 'approved', updated_at = datetime('now') WHERE id = ?").run(x.id); log(`Approve konten #${x.id} ✅`); }
    else if (x.action === 'reject') { d.prepare("UPDATE contents SET status = 'rejected', updated_at = datetime('now') WHERE id = ?").run(x.id); log(`Tolak konten #${x.id}`); }
    else if (x.action === 'revision') {
      d.prepare("UPDATE contents SET status = 'revision', owner_note = ?, revisions = revisions + 1, updated_at = datetime('now') WHERE id = ?").run(x.note, x.id);
      log(`Minta revisi #${x.id}: ${x.note}`);
    }
  }
  setEnv('N8N_ACK', Math.max(...fresh.map((x) => x.seq)));
  return fresh;
}

// cek token, ambil chat id dari pesan /start terakhir
async function setup() {
  const me = await tg('getMe');
  out(`bot: @${me.username}`);
  if (!env.N8N_KEY) { setEnv('N8N_KEY', [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('')); out('N8N_KEY dibuat di .env'); }
  try {
    const ups = await tg('getUpdates', { timeout: 0 });
    const m = [...ups].reverse().find((u) => u.message?.chat?.type === 'private')?.message;
    if (m) { setEnv('TELEGRAM_CHAT_ID', m.chat.id); out(`chat id ${m.chat.id} (${m.chat.first_name ?? ''}) disimpan ke .env`); env.TELEGRAM_CHAT_ID = String(m.chat.id); await say('🟣 Bot Zataa Office tersambung. Konten yang siap bakal dikirim ke sini buat di-approve.'); }
    else out(`belum ada pesan. Buka t.me/${me.username}, kirim /start, lalu jalankan setup lagi.`);
  } catch (e) { out(`getUpdates gagal (${e.message}). Kalau workflow n8n sudah aktif, kirim pesan apa saja ke bot: bot membalas dengan chat id kamu.`); }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const [cmd, a] = process.argv.slice(2);
  try {
    if (cmd === 'setup') await setup();
    else if (cmd === 'submit') out(await submit(+a));
    else if (cmd === 'plan') out(await submitPlan());
    else if (cmd === 'ideas') out(await submitIdeas());
    else if (cmd === 'poll') out({ decisions: await poll() });
    else if (cmd === 'say') { await say(esc(a)); out('ok'); }
    else out('pakai: approval.mjs setup | submit <id> | plan | ideas | poll | say "<teks>"');
  } catch (e) { out(`gagal: ${e.message}`); process.exit(1); }
}
