#!/usr/bin/env node
// Watcher approval (tanpa AI, 0 token saat diam): tiap 60 dtk tarik keputusan Owner dari n8n.
// Revisi → jalankan Claude Code CLI untuk memperbaiki + render ulang → kirim lagi ke Telegram.
// Approved → auto-post ke IG/TikTok saat jam slot (scripts/publish.mjs). Pesan bebas Owner → scripts/ask.mjs.
// Bot terpisah: Aprista keuangan (finance-bot.mjs) & YouTube Shorts @zataashortbot (shorts-bot.mjs).
//   node scripts/watch.mjs          (biarkan jalan; di VPS = service systemd scripts/vps/zataa-watcher.service)
//   node scripts/watch.mjs --once   (sekali cek, untuk tes)
process.removeAllListeners('warning');
import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { poll, submit, sayAs, loadEnv, downloadPhotos, photoNote } from './approval.mjs';
import { publishDue, tiktokExport, isTiktokCommand, tiktokCommand } from './publish.mjs';
import { revisionText } from './chatter.mjs';
import { adsReady, propose, runApproved } from './boost.mjs';
import { handleOwnerMessage, handleDecision, runFollowups, syncMonitor } from './ask.mjs';
import { startFinanceBot } from './finance-bot.mjs';
import { startShortsBot } from './shorts-bot.mjs';

// Zataa Story pakai kode shorts-bot.mjs yang sama tapi --brand=story (state & bot sendiri) → jalan sebagai proses anak
function startStoryBot() {
  const p = spawn(process.execPath, [join(ROOT, 'scripts', 'shorts-bot.mjs'), 'bot', '--brand=story'], { cwd: ROOT, windowsHide: true });
  const pipe = (b) => String(b).split('\n').filter((l) => l.trim()).forEach((l) => log(`[story] ${l}`));
  p.stdout.on('data', pipe); p.stderr.on('data', pipe);
  p.on('exit', (code) => { log(`[story] bot berhenti (kode ${code}), nyala lagi 30 dtk`); setTimeout(startStoryBot, 30_000); });
}
import { analystTick } from './analyst.mjs';
import { socialsTick } from './socials.mjs';
import { priceTick } from './price.mjs';
import { limitsTick } from './limits.mjs';
import { laptopFallback } from './laptop-fallback.mjs';
import { beat } from './health.mjs';
import { markCode } from './reload.mjs';

markCode(); // versi kode proses ini, buat auto-reload (reload.mjs)

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EVERY = 60_000;
// tanggal + jam WITA: watcher.log nyambung berhari-hari, tanpa tanggal error lama kebaca seperti baru
const stamp = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Makassar' }).slice(5, 16);
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
    const p = spawn(bin, args, { cwd: ROOT, shell: process.platform === 'win32', windowsHide: true });
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
  office('chat', maker, 'all', 'curhat', revisionText());
  exportState();
  await sayAs('copywriter', `🛠️ Revisi #${x.id} lagi dikerjain…${x.photos?.length ? ` (📷 ${x.photos.length} contoh desain ikut dibaca)` : ''}`).catch(() => {});
  const refs = await downloadPhotos(x.photos ?? []);
  const prompt = `Kamu tim kantor marketing Zataa (zataa.my.id) di folder ini. Owner minta REVISI konten #${x.id}:
"${x.note || '(tanpa teks — ikuti gambar contoh)'}"${photoNote(refs)}

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
    await sayAs('copywriter', `⚠️ Revisi #${x.id} belum bisa dikerjain otomatis (Claude Code CLI: ${r.text.slice(0, 150)}). Dikerjain di sesi harian berikutnya.`).catch(() => {});
  } else {
    const summary = r.text.split('\n').filter(Boolean).pop() ?? '';
    setAgent(maker, 'done', task);
    note(maker, `Revisi #${x.id} kelar: ${summary.slice(0, 120)}`);
    let queued = false; // video suara OmniVoice → laptop yang render & kirim (laptop mati = nunggu)
    try { queued = JSON.parse(JSON.parse(office('content', 'get', String(x.id))).data_json ?? '{}')._laptop != null; } catch { /* abaikan */ }
    if (queued) await sayAs('video', `🎙️ Revisi #${x.id} kelar, videonya dirender di laptop (suara natural) lalu dikirim otomatis.`).catch(() => {});
    else {
    setAgent('publisher', 'working', `QA & kirim ulang #${x.id}`);
    exportState();
    try { await submit(x.id, { note: `Hasil revisi: ${summary}` }); log(`#${x.id} dikirim ulang`); setAgent('publisher', 'waiting', `#${x.id} ${title}`); }
    catch (e) { log(`submit gagal: ${e.message}`); setAgent('publisher', 'done'); await sayAs('publisher', `⚠️ Revisi #${x.id} selesai tapi gagal dikirim: ${e.message}`).catch(() => {}); }
    }
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
    for (const r of await publishDue()) {
      log(r.ok ? `#${r.id} tayang: ${r.posted.join(' + ')}` : `#${r.id} gagal posting: ${r.errors.join(' | ')}`);
      beat('publish', r.ok, r.ok ? `#${r.id} tayang` : `#${r.id}: ${r.errors.join(' | ')}`);
    }
  } catch (e) { log(`auto-post gagal: ${e.message}`); beat('publish', false, e.message); }
  posting = false;
  exportState();
}

// Fahriah: usul boost sekali sehari + pasang iklan yang sudah di-✅ Owner (aktif kalau setelan iklan lengkap di .env)
let boosting = false;
async function ads() {
  if (boosting) return;
  if (!adsReady()) return beat('ads', null, loadEnv().ADS_PAUSE !== '0' ? 'libur (iklan Meta belum bisa)' : 'setelan iklan belum lengkap', 'paused');
  boosting = true;
  try {
    for (const r of await runApproved()) log(r.ok ? `boost B${r.id} jalan` : `boost B${r.id} gagal: ${r.error}`);
    const p = await propose();
    if (p.proposed) log(`usul boost B${p.proposed} (#${p.content})`);
  } catch (e) { log(`boost gagal: ${e.message}`); }
  boosting = false;
  exportState();
}

// pesan bebas Owner di Telegram (tanya status / kasih tugas) + tugas pantau terjadwal — dikerjakan satu per satu
const inbox = [];
let talking = false;
async function talk() {
  if (talking) return;
  talking = true;
  try {
    while (inbox.length) {
      const item = inbox.shift();
      if (item.decision) {
        log(`keputusan owner: ${item.decision.action} #${item.decision.id}`);
        await handleDecision(item.decision, log);
        exportState();
        continue;
      }
      const { msg, photos } = item;
      log(`pesan owner: ${msg.slice(0, 80)}${photos.length ? ` (+${photos.length} foto)` : ''}`);
      const r = await handleOwnerMessage(msg, log, photos);
      log(`pesan owner beres (${r.kind}${r.ok === false ? ', gagal' : ''})`);
      exportState();
    }
    const f = await runFollowups(log);
    await syncMonitor();
    if (f) exportState();
  } catch (e) { log(`chat gagal: ${e.message}`); }
  talking = false;
}

// GitHub Pages: push state.json tiap 10 menit kalau ada perubahan (status pegawai, aktivitas, chit-chat). 0 token.
const SYNC_EVERY = 10 * 60_000;
const PAGES_DATA = () => ['docs/data/state.json', 'docs/data/tiktok.json', 'docs/data/socials.json', 'docs/data/health.json'].filter((f) => existsSync(join(ROOT, f)));
async function syncPages() {
  if (posting) return; // publish.mjs juga lagi push media, jangan tabrakan
  const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    exportState();
    if (loadEnv().TIKTOK_REFRESH_TOKEN) await tiktokExport().catch((e) => log(`studio tiktok.json gagal: ${e.message}`));
    if (!git('status', '--porcelain', '--', ...PAGES_DATA()).trim()) return;
    git('add', '--', ...PAGES_DATA());
    git('commit', '-m', 'state: update dashboard', '--', ...PAGES_DATA());
    git('pull', '--rebase', '--autostash', '-q'); // repo juga di-push dari laptop → hindari non-fast-forward
    git('push');
    log('state.json ke-push ke GitHub Pages');
  } catch (e) { log(`push state gagal: ${String(e.stderr || e.message).trim().split('\n').pop()}`); }
}

// Raka (data IG tiap 3 jam + laporan Minggu) & Budi (cek harga tiap 2 jam) — tanpa AI
let crunching = false;
async function staff() {
  if (crunching) return;
  crunching = true;
  try {
    const a = await analystTick();
    if (a) { log(`raka: ${JSON.stringify(a)}`); beat('analyst', true, JSON.stringify(a)); }
    const p = await priceTick();
    if (p) {
      log(`budi: ${JSON.stringify(p).slice(0, 200)}`);
      const bad = p.filter((x) => x.error);
      beat('price', !bad.length, bad.length ? bad.map((x) => `${x.url.split('/').pop()}: ${x.error}`).join(' · ') : `${p.length} halaman kebaca`);
    }
    const l = await limitsTick().catch((e) => log(`cek limit gagal: ${e.message}`));
    if (l) log(`limit claude: ${JSON.stringify(l)}`);
    const so = await socialsTick().catch((e) => { log(`analytics sosmed gagal: ${e.message}`); beat('socials', false, e.message); });
    if (so) { log(`analytics sosmed: ${JSON.stringify(so)}`); beat('socials', true, 'data akun ketarik'); }
    if (a || p) exportState();
  } catch (e) { log(`raka/budi gagal: ${e.message}`); beat('analyst', false, e.message); }
  crunching = false;
}

async function tick() {
  autopost();
  ads();
  talk();
  staff();
  beat('watcher', true, 'jalan');
  laptopFallback(log).catch((e) => log(`fallback laptop gagal: ${e.message}`));
  try {
    const got = await poll().then((r) => { beat('n8n', true, 'nyambung'); return r; }, (e) => { beat('n8n', false, e.message); throw e; });
    if (!got.length) return;
    log(`${got.length} keputusan baru`);
    // Owner udah mutusin → Fikri nggak nunggu approval lagi
    if (got.some((g) => ['approve', 'reject'].includes(g.action))) setAgent('publisher', 'done');
    if (got.some((g) => g.action === 'boost_skip')) setAgent('ads', 'done');
    // tombol Zataa Studio (TIKTOK LOGIN / TIKTOK POST) → langsung dikerjakan Fikri, tanpa AI
    for (const g of got.filter((x) => x.action === 'chat' && isTiktokCommand(x.note ?? ''))) {
      log(`perintah studio: ${g.note.split('\n')[0].slice(0, 80)}`);
      tiktokCommand(g.note).then((r) => log(`studio beres: ${JSON.stringify(r)}`), (e) => log(`studio gagal: ${e.message}`)).finally(syncPages);
    }
    for (const g of got.filter((x) => x.action === 'chat' && !isTiktokCommand(x.note ?? '') && (x.note || x.photos?.length))) inbox.push({ msg: g.note ?? '', photos: g.photos ?? [] });
    for (const g of got.filter((x) => ['plan_approve', 'plan_revision', 'idea_approve', 'idea_skip', 'price_promo'].includes(x.action))) inbox.push({ decision: g });
    if (inbox.length) talk();
    exportState();
    // revisi terakhir per konten saja (kalau Owner kirim beberapa catatan, gabungkan)
    const notes = new Map();
    for (const x of got.filter((g) => g.action === 'revision')) {
      const n = notes.get(x.id) ?? { note: '', photos: [] };
      notes.set(x.id, { note: [n.note, x.note].filter(Boolean).join('; '), photos: [...n.photos, ...(x.photos ?? [])] });
    }
    for (const [id, n] of notes) if (!busy.has(id)) await revise({ id, ...n });
  } catch (e) { log(`cek gagal: ${e.message}`); }
}

log('watcher approval jalan (cek tiap 60 dtk)');
await tick();
if (!process.argv.includes('--once')) {
  setInterval(tick, EVERY);
  syncPages();
  setInterval(syncPages, SYNC_EVERY);
  startFinanceBot(log); // bot Telegram Aprista (keuangan Owner), long polling terpisah
  startShortsBot(log); // bot @zataashortbot Zataa History (approval → upload Private → ingatkan Publik)
  startStoryBot(); // bot @zataastorybot Zataa Story: proses anak (brand beda = modul beda), mati → hidup lagi 30 dtk
}
