#!/usr/bin/env node
// Watcher approval (tanpa AI, 0 token saat diam): tiap 60 dtk tarik keputusan Owner dari n8n.
// Revisi → jalankan Claude Code CLI untuk memperbaiki + render ulang → kirim lagi ke Telegram.
// Approved → auto-post ke IG/TikTok saat jam slot (scripts/publish.mjs).
//   node scripts/watch.mjs          (biarkan jalan; dipasang otomatis saat Windows login lewat scripts/start-watcher.cmd)
//   node scripts/watch.mjs --once   (sekali cek, untuk tes)
process.removeAllListeners('warning');
import { spawn, execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { poll, submit, say, loadEnv } from './approval.mjs';
import { publishDue } from './publish.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EVERY = 60_000;
const stamp = () => new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Makassar' });
const log = (m) => console.log(`[${stamp()}] ${m}`);
const busy = new Set();

const office = (...a) => { try { return execFileSync(process.execPath, ['scripts/office.mjs', ...a], { cwd: ROOT, encoding: 'utf8' }); } catch { return ''; } };
const exportState = () => office('export');
// status pegawai di dashboard: yang ngerjain revisi balik ke meja (status 'working'), kelar → 'done'
const crew = (id) => {
  let c = {};
  try { c = JSON.parse(office('content', 'get', String(id))) ?? {}; } catch { /* abaikan */ }
  return { maker: c.format === 'video' ? 'video' : 'designer', title: c.title ?? `konten #${id}` };
};
const setAgent = (agent, status, task) => office('agent', agent, status, task);
const note = (agent, msg) => office('log', agent, msg);

function claude(prompt) {
  const bin = loadEnv().CLAUDE_BIN || 'claude';
  return new Promise((resolve) => {
    const args = ['-p', '--permission-mode', 'acceptEdits', '--allowedTools', 'Bash(node:*)', 'Read', 'Edit', 'Write', 'Glob', 'Grep'];
    const p = spawn(bin, args, { cwd: ROOT, shell: true, windowsHide: true });
    let outText = '', errText = '';
    p.stdout.on('data', (b) => { outText += b; });
    p.stderr.on('data', (b) => { errText += b; });
    p.on('error', (e) => resolve({ ok: false, text: e.message }));
    p.on('close', (code) => resolve({ ok: code === 0, text: (code === 0 ? outText : errText || outText).trim() }));
    p.stdin.end(prompt);
  });
}

async function revise(x) {
  busy.add(x.id);
  log(`revisi #${x.id}: ${x.note}`);
  const { maker, title } = crew(x.id);
  const task = `Revisi #${x.id}: ${title}`;
  setAgent('copywriter', 'working', task);
  setAgent(maker, 'working', task);
  note(maker, `Balik ke komputer, ngerjain revisi #${x.id}`);
  exportState();
  await say(`🛠️ Revisi #${x.id} lagi dikerjain…`).catch(() => {});
  const prompt = `Kamu tim kantor marketing Zataa (zataa.my.id) di folder ini. Owner minta REVISI konten #${x.id}:
"${x.note}"

Langkah:
1. Baca CLAUDE.md seperlunya, lalu office/roles/copywriter.md dan office/roles/designer.md (atau office/roles/video.md kalau formatnya video). Skema template: templates/README.md.
2. node scripts/office.mjs content get ${x.id}
3. Ubah data_json / caption / hashtags / template sesuai catatan Owner (tulis JSON ke file sementara lalu: node scripts/office.mjs content set ${x.id} <file.json>). Patuhi aturan konten di CLAUDE.md (harga hanya dari zataa.my.id).
4. node scripts/render.mjs ${x.id}, lalu buka 1 gambar hasil (video: file cover) dan pastikan rapi.
5. JANGAN kirim ke Telegram dan jangan ubah konten lain.
Akhiri jawaban dengan SATU kalimat ringkas (bahasa santai) tentang apa yang diubah.`;
  const r = await claude(prompt);
  setAgent('copywriter', 'done', task);
  if (!r.ok) {
    log(`claude gagal: ${r.text.slice(0, 300)}`);
    setAgent(maker, 'done', task);
    note(maker, `Revisi #${x.id} ketunda, lanjut di sesi harian`);
    await say(`⚠️ Revisi #${x.id} belum bisa dikerjain otomatis (Claude Code CLI: ${r.text.slice(0, 150)}). Dikerjain di sesi harian berikutnya.`).catch(() => {});
  } else {
    const summary = r.text.split('\n').filter(Boolean).pop() ?? '';
    setAgent(maker, 'done', task);
    note(maker, `Revisi #${x.id} kelar: ${summary.slice(0, 120)}`);
    setAgent('publisher', 'working', `QA & kirim ulang #${x.id}`);
    exportState();
    try { await submit(x.id, { note: `Hasil revisi: ${summary}` }); log(`#${x.id} dikirim ulang`); setAgent('publisher', 'waiting', `#${x.id} ${title}`); }
    catch (e) { log(`submit gagal: ${e.message}`); setAgent('publisher', 'done'); await say(`⚠️ Revisi #${x.id} selesai tapi gagal dikirim: ${e.message}`).catch(() => {}); }
  }
  exportState();
  busy.delete(x.id);
}

// auto-post konten approved begitu jam slot (WIB) lewat; aktif kalau IG + GitHub Pages sudah lengkap di .env
let posting = false;
async function autopost() {
  const e = loadEnv();
  if (posting || !e.IG_ACCESS_TOKEN || !e.IG_USER_ID || !e.PUBLIC_BASE_URL || e.AUTOPOST === 'off') return;
  posting = true;
  try {
    for (const r of await publishDue()) log(r.ok ? `#${r.id} tayang: ${r.posted.join(' + ')}` : `#${r.id} gagal posting: ${r.errors.join(' | ')}`);
  } catch (e) { log(`auto-post gagal: ${e.message}`); }
  posting = false;
  exportState();
}

async function tick() {
  autopost();
  try {
    const got = await poll();
    if (!got.length) return;
    log(`${got.length} keputusan baru`);
    // Owner udah mutusin → Fikri nggak nunggu approval lagi
    if (got.some((g) => g.action !== 'revision')) setAgent('publisher', 'done');
    exportState();
    // revisi terakhir per konten saja (kalau Owner kirim beberapa catatan, gabungkan)
    const notes = new Map();
    for (const x of got.filter((g) => g.action === 'revision')) notes.set(x.id, notes.has(x.id) ? `${notes.get(x.id)}; ${x.note}` : x.note);
    for (const [id, note] of notes) if (!busy.has(id)) await revise({ id, note });
  } catch (e) { log(`cek gagal: ${e.message}`); }
}

log('watcher approval jalan (cek tiap 60 dtk)');
await tick();
if (!process.argv.includes('--once')) setInterval(tick, EVERY);
