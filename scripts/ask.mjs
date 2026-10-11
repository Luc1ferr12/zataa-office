#!/usr/bin/env node
// Owner ngobrol dengan kantor lewat Telegram (pesan bebas, bukan revisi).
//  - "lagi pada ngapain?" → dijawab tanpa AI dari jadwal + status DB (0 token)
//  - selain itu → Claude Code CLI mengerjakan sebagai tim (riset, bikin konten, posting kalau Owner bilang langsung)
//  - tugas pantau ("cek siapa yang menang") → Claude menjadwalkan followup, watcher membangunkannya lagi
//   node scripts/ask.mjs "<pesan>"     (tes manual)
//   node scripts/ask.mjs status        (cetak laporan status)
process.removeAllListeners('warning');
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, say, db, downloadPhotos, photoNote } from './approval.mjs';
import { chat } from './chatter.mjs';
import { AGENTS, wita, activityAt, describe } from '../docs/js/schedule.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const MAX_FOLLOWUPS_PER_DAY = 16; // pengaman token: tugas pantau maksimal segini kali bangun per hari

// ---------- status (0 token): sama persis dengan yang tampil di dashboard
export const isStatusQuestion = (t) => /\b(lagi\s+(pada\s+)?ngapain|pada\s+ngapain|status\s+(tim|kantor)|siapa\s+(aja\s+)?yang\s+(lagi\s+)?(kerja|santai))\b/i.test(t) || /^\/?status$/i.test(t.trim());

export async function statusReport() {
  const d = await db();
  const real = Object.fromEntries(d.prepare('SELECT id, status, current_task FROM agents').all().map((a) => [a.id, a]));
  const t = wita(new Date());
  const lines = AGENTS.filter((a) => !a.boss).map((a, idx) => {
    const info = describe(a, activityAt(idx, a, t, real[a.id]), real[a.id]);
    const mood = ['work', 'break'].includes(info.act) && info.mood?.label ? ` <i>(${esc(info.mood.label)})</i>` : '';
    return `${info.emoji} <b>${a.name}</b> · ${esc(info.label)}${mood}`;
  });
  return `🏢 <b>Kantor Zataa</b> · ${t.dayName} ${t.hh}:${t.mm} WITA\n\n${lines.join('\n')}`;
}

// ---------- Claude Code CLI
function claude(prompt, minutes = 20) {
  const bin = loadEnv().CLAUDE_BIN || 'claude';
  const tools = ['Bash(node:*)', 'Read', 'Edit', 'Write', 'Glob', 'Grep', 'WebSearch', 'WebFetch'];
  return new Promise((resolve) => {
    const p = spawn(bin, ['-p', '--permission-mode', 'acceptEdits', '--allowedTools', ...tools], { cwd: ROOT, shell: true, windowsHide: true });
    let o = '', e = '';
    const timer = setTimeout(() => { p.kill(); e += `\n(dihentikan: lewat ${minutes} menit)`; }, minutes * 60_000);
    p.stdout.on('data', (b) => { o += b; });
    p.stderr.on('data', (b) => { e += b; });
    p.on('error', (err) => { clearTimeout(timer); resolve({ ok: false, text: err.message }); });
    p.on('close', (code) => { clearTimeout(timer); resolve({ ok: code === 0, text: (code === 0 ? o : e || o).trim() }); });
    p.stdin.end(prompt);
  });
}

const RULES = `Aturan kerja:
1. Baca CLAUDE.md seperlunya, lalu HANYA playbook pegawai yang kepakai (office/roles/<id>.md). Skema template: templates/README.md. Hemat token.
2. Kerjakan berurutan sesuai alur: Clariana (researcher) riset → Ista (copywriter) teks → Maria (designer) / Dimas (video) render → Fikri (publisher) QA & kirim.
   Tiap pegawai: node scripts/office.mjs agent <id> working "<tugas singkat>" → selesai: node scripts/office.mjs agent <id> done "<tugas singkat>" (otomatis muncul obrolan oper kerjaan di web).
   Boleh tambah 1–2 obrolan santai/curhat singkat yang natural: node scripts/office.mjs chat <dari> <ke|all> santai "<pesan>".
3. Konten baru: node scripts/office.mjs content new '{"format":"feed","game":"mlbb","pillar":"promo","title":"..."}' → id. Isi lewat content set <id> <file.json> (data_json, caption, hashtags, sources, template), lalu node scripts/render.mjs <id> dan cek 1 gambar hasilnya.
4. Kalau Owner bilang langsung post / upload / tayang: itu sudah approval → node scripts/office.mjs content set <id> '{"status":"approved"}' lalu node scripts/publish.mjs now <id>.
   Kalau tidak bilang begitu: node scripts/approval.mjs submit <id> (Owner approve di Telegram).
5. Kalau informasinya belum ada (mis. pertandingan belum selesai): kerjakan yang bisa, lalu jadwalkan cek ulang: node scripts/office.mjs followup <menit> "<apa yang dicek + konteks lengkap>" (20–60 menit; sesuaikan jadwal match, mis. BO3 ±2–3 jam), lalu berhenti. Jangan nunggu/sleep.
   Tugas Owner dikerjakan sampai tuntas walau sudah lewat jam kantor (lembur) — status pegawai yang lembur tetap working sampai selesai.
6. Harga & nominal HANYA dari zataa.my.id hari ini (WebFetch). Berita wajib ≥2 sumber, rumor ditulis rumor. Tanpa logo tim/foto pemain kecuali Owner minta.
7. Pertanyaan biasa cukup dijawab, tidak perlu bikin konten.
8. Jangan ubah konten lain dan jangan kirim pesan Telegram sendiri (approval.mjs say) kecuali submit konten.
Akhiri jawaban dengan baris "BALASAN:" diikuti pesan untuk Owner (maks 3 kalimat, santai ala tim, sebut siapa yang ngerjain dan hasilnya).`;

const replyOf = (text) => {
  const i = text.lastIndexOf('BALASAN:');
  return (i >= 0 ? text.slice(i + 8) : text.split('\n').filter(Boolean).pop() ?? '').trim().slice(0, 1500);
};

export async function handleOwnerMessage(msg, log = console.log, photos = []) {
  if (!photos.length && isStatusQuestion(msg)) {
    await say(await statusReport());
    return { kind: 'status' };
  }
  const d = await db();
  chat(d, 'owner', null, msg || '📷 (kirim gambar contoh)', 'bos');
  d.prepare("UPDATE agents SET status = 'working', current_task = ?, updated_at = datetime('now') WHERE id = 'dir'").run(`Bagi tugas: ${msg.slice(0, 60)}`);
  chat(d, 'dir', null, 'Oke tim, ada titah dari Bos. Aku bagi tugasnya ya 👇', 'oper');
  await say('👌 Siap bos! Aprista lagi bagi tugas ke tim, nanti aku kabarin hasilnya di sini.').catch(() => {});
  const refs = await downloadPhotos(photos);
  const r = await claude(`Kamu tim kantor marketing Zataa (zataa.my.id) di folder ini. Owner (Bos Zamiir) kirim pesan lewat Telegram:\n"${msg || '(cuma kirim gambar)'}"${photoNote(refs)}\n\n${RULES}`);
  d.prepare("UPDATE agents SET status = 'done', updated_at = datetime('now') WHERE id = 'dir'").run();
  await syncMonitor();
  if (!r.ok) {
    log(`tugas owner gagal: ${r.text.slice(0, 300)}`);
    await say(`⚠️ Tim belum bisa ngerjain itu otomatis (${esc(r.text.slice(0, 150))}).`).catch(() => {});
    return { kind: 'task', ok: false };
  }
  await say(`💬 ${esc(replyOf(r.text))}`).catch(() => {});
  return { kind: 'task', ok: true };
}

// selama masih ada tugas pantau, Clariana tetap di laptop (lewat jam kantor = lembur); beres → santai lagi
const FOLLOWUP_SQL = `CREATE TABLE IF NOT EXISTS followups (id INTEGER PRIMARY KEY AUTOINCREMENT, note TEXT NOT NULL, due_at TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))`;
export async function syncMonitor() {
  const d = await db();
  d.exec(FOLLOWUP_SQL);
  const open = d.prepare('SELECT note, due_at FROM followups WHERE done = 0 ORDER BY due_at LIMIT 1').get();
  const cur = d.prepare("SELECT status, current_task FROM agents WHERE id = 'researcher'").get();
  if (open) {
    const next = new Date(`${open.due_at.replace(' ', 'T')}Z`).toLocaleTimeString('id-ID', { timeZone: 'Asia/Makassar', hour: '2-digit', minute: '2-digit' });
    const task = `Mantau: ${open.note.split(/[.\n]/)[0].slice(0, 50)} (cek lagi ${next})`;
    if (cur?.current_task !== task) d.prepare("UPDATE agents SET status = 'working', current_task = ?, updated_at = datetime('now') WHERE id = 'researcher'").run(task);
  } else if (cur?.status === 'working' && cur.current_task?.startsWith('Mantau')) {
    d.prepare("UPDATE agents SET status = 'done', current_task = 'Pantauan beres', updated_at = datetime('now') WHERE id = 'researcher'").run();
    chat(d, 'researcher', null, 'Pantauan kelar! Akhirnya bisa istirahat 😮‍💨', 'santai');
  }
}

// ---------- tugas pantau yang dijadwalkan Claude (office.mjs followup)
export async function runFollowups(log = console.log) {
  const d = await db();
  d.exec(FOLLOWUP_SQL);
  const due = d.prepare("SELECT * FROM followups WHERE done = 0 AND due_at <= datetime('now') ORDER BY id LIMIT 1").get();
  if (!due) return null;
  d.prepare('UPDATE followups SET done = 1 WHERE id = ?').run(due.id);
  const used = d.prepare("SELECT COUNT(*) n FROM followups WHERE done = 1 AND date(due_at, '+8 hours') = date('now', '+8 hours')").get().n;
  if (used > MAX_FOLLOWUPS_PER_DAY) {
    await say(`⏸️ Pantauan dihentikan dulu (batas ${MAX_FOLLOWUPS_PER_DAY}×/hari biar hemat). Catatan terakhir: ${esc(due.note.slice(0, 200))}`).catch(() => {});
    return { id: due.id, skipped: true };
  }
  log(`followup #${due.id}: ${due.note.slice(0, 80)}`);
  const r = await claude(`Kamu tim kantor marketing Zataa (zataa.my.id) di folder ini. Ini LANJUTAN tugas pantau dari Owner yang kamu jadwalkan sendiri:\n"${due.note}"\nCek lagi sekarang. Kalau sudah ada hasil: kerjakan sesuai permintaan awal. Kalau belum: jadwalkan followup lagi (maks sampai acaranya selesai). Kalau tidak ada yang baru, jangan kirim apa-apa dan tulis "BALASAN: -".\n\n${RULES}`);
  await syncMonitor();
  const reply = r.ok ? replyOf(r.text) : '';
  if (reply && reply !== '-') await say(`💬 ${esc(reply)}`).catch(() => {});
  return { id: due.id, ok: r.ok };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const msg = process.argv.slice(2).join(' ');
  if (msg === 'status') console.log((await statusReport()).replace(/<[^>]+>/g, ''));
  else if (msg) console.log(await handleOwnerMessage(msg));
  else console.log('pakai: ask.mjs "<pesan>" | status');
}
