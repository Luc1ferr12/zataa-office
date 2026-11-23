// Pengingat approval: konten yang masih pending_approval (Owner belum ✅/✏️/❌) dikirim ulang sebagai pesan ringkas + tombol
// ke bot divisinya, supaya nggak tenggelam di chat. Dipanggil watcher tiap menit (0 token); dibatasi jam & jeda.
//   Marketing (About Esports) → bot kantor (callback ok:/rev:/no:)
//   Zaa History / Zaa Story / Marvel Talk → bot brand masing-masing (callback yok:/yrev:/yno:)
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { openDb } from './db.mjs';
import { loadEnv } from './approval.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, 'tmp', 'approval-remind.json');
const MIN_WAIT = 90 * 60_000;      // baru diingatkan kalau sudah ≥ 1,5 jam nunggu
const EVERY = 3 * 60 * 60_000;     // jeda antar pengingat per bot
const MAX_AGE_DAYS = 3;            // konten lebih tua dari ini nggak diingatkan terus (basi)
const HOURS = [7, 21];             // jam WITA boleh ngingetin (07:00–20:59)

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const load = () => { try { return JSON.parse(readFileSync(FILE, 'utf8')); } catch { return {}; } };
const save = (s) => { mkdirSync(dirname(FILE), { recursive: true }); writeFileSync(FILE, JSON.stringify(s)); };

// bot → { token, chat, prefix callback, nama pengirim, filter channel }
const bots = (env) => [
  { key: 'mkt', token: env.TELEGRAM_BOT_TOKEN, chat: env.TELEGRAM_CHAT_ID, pre: '', who: 'Andre', label: 'About Esports', sql: "(channel IS NULL OR channel NOT IN ('youtube','story','marvel','cowo','clip'))" },
  { key: 'youtube', token: env.SHORTS_BOT_TOKEN, chat: env.SHORTS_OWNER_ID, pre: 'y', who: 'Bagas', label: 'Zaa History', sql: "channel = 'youtube'" },
  { key: 'story', token: env.STORY_BOT_TOKEN, chat: env.SHORTS_OWNER_ID, pre: 'y', who: 'Raditya', label: 'Zaa Story', sql: "channel = 'story'" },
  { key: 'marvel', token: env.MARVEL_BOT_TOKEN, chat: env.SHORTS_OWNER_ID, pre: 'y', who: 'Reza', label: 'Marvel Talk', sql: "channel = 'marvel'" },
  { key: 'cowo', token: env.COWO_BOT_TOKEN, chat: env.SHORTS_OWNER_ID, pre: 'y', who: 'Aurel', label: 'Cowo Bingung', sql: "channel = 'cowo'" },
];

async function tgSend(token, params) {
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params) });
  const j = await r.json();
  if (!j.ok) throw new Error(j.description);
  return j.result;
}

export async function remindTick(log = console.log, { force = false, now = Date.now() } = {}) {
  const wita = new Date(now + 8 * 3600_000);
  const hour = wita.getUTCHours();
  if (!force && (hour < HOURS[0] || hour >= HOURS[1])) return [];
  const today = wita.toISOString().slice(0, 10);
  const oldest = new Date(now + 8 * 3600_000 - MAX_AGE_DAYS * 86400_000).toISOString().slice(0, 10);
  const env = loadEnv();
  const d = openDb();
  const st = load();
  const sent = [];
  for (const b of bots(env)) {
    if (!b.token || !b.chat) continue;
    if (!force && now - (st[b.key] ?? 0) < EVERY) continue;
    const rows = d.prepare(`SELECT id, title, day, slot, updated_at FROM contents WHERE status = 'pending_approval' AND ${b.sql} AND day >= ? ORDER BY day, id`).all(oldest)
      .filter((c) => force || now - Date.parse(`${c.updated_at.replace(' ', 'T')}Z`) >= MIN_WAIT)
      .slice(0, 6);
    if (!rows.length) continue;
    const lines = rows.map((c) => `• <b>#${c.id}</b> ${esc(c.title)} <i>(${c.day === today ? 'hari ini' : c.day.slice(5)}${c.slot ? ` · ${c.slot}` : ''})</i>`);
    const text = `<b>${b.who}</b>: Bos, ${rows.length} konten ${b.label} masih nunggu keputusanmu ⏳\n\n${lines.join('\n')}\n\nTekan tombol di bawah, atau scroll ke atas buat lihat preview-nya.`;
    const kb = rows.map((c) => [
      { text: `✅ #${c.id}`, callback_data: `${b.pre}ok:${c.id}` },
      { text: '✏️ Revisi', callback_data: `${b.pre}rev:${c.id}` },
      { text: '❌ Tolak', callback_data: `${b.pre}no:${c.id}` },
    ]);
    try {
      await tgSend(b.token, { chat_id: b.chat, text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: { inline_keyboard: kb } });
      st[b.key] = now;
      sent.push({ bot: b.key, ids: rows.map((c) => c.id) });
      log(`pengingat approval ${b.label}: ${rows.map((c) => `#${c.id}`).join(', ')}`);
    } catch (e) { log(`pengingat approval ${b.label} gagal: ${e.message}`); }
  }
  if (sent.length) save(st);
  return sent;
}

if (process.argv[1] && process.argv[1].endsWith('approval-remind.mjs')) {
  // CLI: node scripts/approval-remind.mjs [--force]  (--force = kirim sekarang, abaikan jam & jeda)
  remindTick(console.log, { force: process.argv.includes('--force') }).then((r) => console.log(JSON.stringify(r)));
}
