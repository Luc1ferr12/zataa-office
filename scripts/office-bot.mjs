// Bot kantor (About Esports, TELEGRAM_BOT_TOKEN) langsung dari watcher — pengganti workflow n8n (16 Nov 2026, Owner berhenti langganan n8n).
// Logika sama persis dengan node "Proses" n8n/zataa-approval.json: tombol ✅/✏️/❌ konten, plan mingguan, ide briefing, boost, promo harga,
// reply ke pesan konten = revisi, foto/video/dokumen ditahan 15 menit buat ikut revisi/pesan berikutnya (maks 4), chat bebas → tim (ask.mjs).
// Keputusan masuk antrean lokal tmp/office-bot.json → approval.mjs poll() (format sama dengan antrean n8n, jadi watcher nggak berubah).
// Aktif kalau .env OFFICE_BOT_DIRECT=1 (atau N8N_DECISIONS_URL kosong). Webhook Telegram (n8n) otomatis dilepas, cek ulang tiap 10 menit.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './approval.mjs';
import { mediaIds } from './media.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, 'tmp', 'office-bot.json');
const env = () => ({ ...loadEnv(), ...process.env });
export const directOn = () => env().OFFICE_BOT_DIRECT === '1' || !env().N8N_DECISIONS_URL;

let S = null, DRY = false;
const state = () => {
  if (!S) { try { S = JSON.parse(readFileSync(FILE, 'utf8')); } catch { S = {}; } }
  S.queue ??= []; S.seq ??= 0; S.photos ??= []; S.ack ??= 0; S.offset ??= 0;
  return S;
};
const save = () => { if (DRY) return; mkdirSync(dirname(FILE), { recursive: true }); state().queue = S.queue.filter((d) => d.seq > S.ack).slice(-300); writeFileSync(FILE, JSON.stringify(S)); };

// dipakai approval.mjs poll(): keputusan yang belum diproses + tandai sudah diproses
export const pending = () => state().queue.filter((d) => d.seq > S.ack);
export const ackTo = (seq) => { state().ack = Math.max(S.ack, seq); save(); };

async function api(method, params = {}, timeoutMs = 20_000) {
  const r = await fetch(`https://api.telegram.org/bot${env().TELEGRAM_BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params), signal: AbortSignal.timeout(timeoutMs) });
  const j = await r.json();
  if (!j.ok) { const e = new Error(`Telegram ${method}: ${j.description}`); e.code = j.error_code; throw e; }
  return j.result;
}

const HELP = 'Halo bos 👋\n• Konten siap dikirim ke sini: ✅ Approve, ✏️ Revisi, ❌ Tolak (atau reply pesannya buat revisi).\n• Boleh kirim foto/video/link contoh + catatannya.\n• Chat bebas buat kasih tugas, misal: "jadwal MPL minggu ini, bikinin desain, langsung upload".\n• Tanya "lagi pada ngapain" buat lihat kegiatan tim.';

// 1 update Telegram → { reply?, queryId? } (sama dengan n8n)
export function handleUpdate(u, owner = String(env().TELEGRAM_CHAT_ID)) {
  const s = state();
  const out = { chatId: null, text: null, queryId: null };
  const push = (id, action, note = '', photos = []) => { s.seq += 1; s.queue.push({ seq: s.seq, id: Number(id), action, note, photos, ts: new Date().toISOString() }); };
  const now = Date.now();
  s.photos = s.photos.filter((p) => now - p.ts < 15 * 60 * 1000);
  const takePhotos = () => { const ids = s.photos.map((p) => p.id).slice(-4); s.photos = []; return ids; };

  if (u.callback_query) {
    const q = u.callback_query;
    out.queryId = q.id;
    out.chatId = String(q.message.chat.id);
    if (String(q.from.id) !== owner) out.text = 'Bot ini khusus owner Zaa Office.';
    else {
      const [act, id] = String(q.data || '').split(':');
      if (act === 'ok') { push(id, 'approve'); s.waiting = null; out.text = `✅ #${id} di-approve. Masuk antrian tayang.`; }
      else if (act === 'no') { push(id, 'reject'); s.waiting = null; out.text = `❌ #${id} ditolak.`; }
      else if (act === 'rev') { s.waiting = id; out.text = `✏️ Ketik catatan revisi buat #${id} (boleh kirim foto/video contoh juga):`; }
      else if (act === 'boost') { push(id, 'boost'); out.text = `🚀 Boost B${id} disetujui. Fahriah lagi pasang iklannya.`; }
      else if (act === 'skip') { push(id, 'boost_skip'); out.text = `👌 Boost B${id} dilewati.`; }
      else if (act === 'plan') { push(id, 'plan_approve'); s.waiting = null; out.text = '✅ Plan minggu ini di-approve. Tim mulai produksi!'; }
      else if (act === 'planrev') { s.waiting = `plan:${id}`; out.text = '✏️ Ketik catatan revisi plan (boleh kirim foto contoh juga):'; }
      else if (act === 'idea') { push(id, 'idea_approve', String(id)); out.text = '💡 Ide di-approve, tim langsung produksi!'; }
      else if (act === 'ideas') { const ids = String(id).split('-'); push(ids[0], 'idea_approve', ids.join(',')); out.text = `💡 ${ids.length} ide di-approve, gas!`; }
      else if (act === 'ideaskip') { push(id, 'idea_skip'); out.text = '🔄 Semua ide ditolak. Tim cari ide baru, nanti Andre kirim lagi.'; }
      else if (act === 'pricepromo') { push(id, 'price_promo'); out.text = '🎨 Siap! Tim bikin konten promo harga.'; }
    }
  } else if (u.message) {
    const m = u.message;
    out.chatId = String(m.chat.id);
    const txt = String(m.text || m.caption || '').trim();
    const media = mediaIds(m).map((x) => x.id);   // foto, video, video note, GIF, dokumen → dibaca scripts/media.mjs
    if (String(m.from?.id) !== owner) out.text = `Chat ID kamu: ${m.chat.id}\nMasukkan angka ini ke .env (TELEGRAM_CHAT_ID).`;
    else {
      for (const id of media) s.photos.push({ id, ts: now });
      // balas langsung ke pesan konten (#id) = revisi (kecuali pesan usulan boost / ide / harga)
      const rtext = String(m.reply_to_message?.text || m.reply_to_message?.caption || '');
      const planReply = rtext.match(/Plan C(\d+)/);
      const replied = rtext.includes('Usulan boost') || rtext.includes('Ide konten tambahan') || /harga di web berubah/i.test(rtext) ? null : rtext.match(/#(\d+)/);
      const id = planReply ? `plan:${planReply[1]}` : replied ? replied[1] : s.waiting;
      const isPlan = String(id || '').startsWith('plan:');
      if (media.length && !txt) {
        out.text = m.media_group_id && s.photos.length > 1 ? `📷 Lampiran ke-${s.photos.length} diterima.` : `📎 Lampiran diterima${id ? ` buat #${id}` : ''}. Sekarang ketik catatannya ya bos.`;
      } else if (txt && !txt.startsWith('/') && isPlan) {
        const photos = takePhotos();
        push(String(id).slice(5), 'plan_revision', txt, photos);
        s.waiting = null;
        out.text = `📝 Revisi plan dicatat${photos.length ? ` (+${photos.length} lampiran)` : ''}. Andre lagi benerin, nanti dikirim ulang.`;
      } else if (txt && !txt.startsWith('/') && id) {
        const photos = takePhotos();
        push(id, 'revision', txt, photos);
        s.waiting = null;
        out.text = `📝 Revisi #${id} dicatat${photos.length ? ` (+${photos.length} lampiran)` : ''}:\n«${txt}»\nTim lagi ngerjain, nanti dikirim ulang ke sini.`;
      } else if (txt && !txt.startsWith('/')) {
        push(0, 'chat', txt, takePhotos());   // pesan bebas → tim (tanpa "diterima": Owner langsung nunggu jawaban pegawainya)
      } else out.text = HELP;
    }
  }
  save();
  return out;
}

// webhook n8n masih nempel → getUpdates ditolak (409). Lepas webhook-nya (update yang numpuk tetap diambil).
async function dropWebhook(log) {
  const w = await api('getWebhookInfo');
  if (w.url) { await api('deleteWebhook', { drop_pending_updates: false }); log(`bot kantor: webhook lama dilepas (${w.url.replace(/^https?:\/\/([^/]+).*/, '$1')}) — nonaktifkan workflow n8n biar nggak nyambung lagi`); }
}

export async function startOfficeBot(log = console.log) {
  if (!directOn()) return log('bot kantor: masih lewat n8n (OFFICE_BOT_DIRECT belum 1)');
  if (!env().TELEGRAM_BOT_TOKEN || !env().TELEGRAM_CHAT_ID) return log('bot kantor: TELEGRAM_BOT_TOKEN/CHAT_ID kosong');
  await dropWebhook(log).catch((e) => log(`bot kantor: cek webhook gagal: ${e.message}`));
  setInterval(() => dropWebhook(log).catch(() => {}), 600_000);
  log('bot kantor (About Esports) jalan langsung tanpa n8n');
  let fails = 0;
  for (;;) {
    let ups = [];
    try { ups = await api('getUpdates', { offset: state().offset, timeout: 50, allowed_updates: ['message', 'callback_query'] }, 65_000); fails = 0; } catch (e) {
      if (e.code === 409) await dropWebhook(log).catch(() => {});
      if (++fails >= 3) log(`bot kantor: ${e.message} ×${fails}`);
      await new Promise((r) => setTimeout(r, fails < 3 ? 2_000 : 15_000));
      continue;
    }
    for (const u of ups) {
      state().offset = u.update_id + 1;
      try {
        const out = handleUpdate(u);
        if (out.queryId) await api('answerCallbackQuery', { callback_query_id: out.queryId }).catch(() => {});
        if (out.text && out.chatId) await api('sendMessage', { chat_id: out.chatId, text: out.text }).catch((e) => log(`bot kantor balas: ${e.message}`));
      } catch (e) { log(`bot kantor gagal: ${e.message}`); }
    }
    if (ups.length) save();
  }
}

// tes lokal tanpa Telegram: node scripts/office-bot.mjs test
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1] && process.argv[2] === 'test') {
  S = { queue: [], seq: 0, photos: [], ack: 0, offset: 0 }; DRY = true; // state bersih, nggak nyentuh file asli
  const O = '1', msg = (text, extra = {}) => ({ message: { chat: { id: 1 }, from: { id: 1 }, text, ...extra } });
  const cb = (data) => ({ callback_query: { id: 'q', from: { id: 1 }, message: { chat: { id: 1 } }, data } });
  const steps = [cb('ok:12'), cb('rev:13'), msg(undefined, { photo: [{ file_id: 'P1' }] }), msg('warnanya lebih gelap'), msg('bikinin jadwal MPL'),
    msg('judulnya ganti', { reply_to_message: { text: 'Konten #14 siap' } }), cb('planrev:3'), msg('tambah 1 video'), cb('ideas:5-6'), cb('boost:2')];
  for (const u of steps) console.log(handleUpdate(u, O).text ?? '(tanpa balasan)');
  console.log(JSON.stringify(pending().map(({ seq, id, action, note, photos }) => ({ seq, id, action, note, photos }))));
}
