#!/usr/bin/env node
// Divisi Clipper — akses Clippo lewat Chrome laptop Owner yang sudah login (Clippo nolak request dari server, 403).
// Pakai Claude CLI + ekstensi Claude in Chrome (`claude --chrome`), dipanggil laptop-worker.mjs:
//   node scripts/clipper-chrome.mjs scout    baca semua campaign aktif (+ detail brief) di halaman Clippo → file JSON → VPS clipper.mjs ingest
//   node scripts/clipper-chrome.mjs submit   kerjain antrean VPS (clipper.mjs submitq): Join Campaign yang di-✅ Owner + ajukan clip yang lolos syarat
// Syarat: laptop nyala, Chrome kebuka & login app.clippo.id, ekstensi Claude in Chrome tersambung. CLAUDE_BIN / CLIPPO_DL_DIR (default ~/Downloads) opsional.
import { spawnSync } from 'node:child_process';
import { existsSync, unlinkSync, mkdtempSync, copyFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const VPS = process.env.ZATAA_VPS ?? 'zataa-vps';
const BIN = process.env.CLAUDE_BIN || 'claude';
const DL = process.env.CLIPPO_DL_DIR || join(homedir(), 'Downloads');
const vps = (cmd) => {
  const r = spawnSync('ssh', [VPS, `cd ~/zataa-office && ${cmd}`], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`VPS: ${(r.stderr || r.stdout || '').trim().slice(-300)}`);
  return r.stdout.trim();
};
// 1 tugas browser ke Claude (model ringan cukup), cuma boleh pakai tool Chrome
function claudeChrome(prompt, timeoutMin = 15) {
  const r = spawnSync(BIN, ['-p', '--chrome', '--model', process.env.CLIPPER_CHROME_MODEL || 'sonnet', '--allowedTools', 'mcp__claude-in-chrome__*', '--', prompt],
    { encoding: 'utf8', timeout: timeoutMin * 60_000, shell: process.platform === 'win32' });
  if (r.status !== 0) throw new Error(`claude --chrome gagal: ${(r.stderr || r.stdout || r.error?.message || '').trim().slice(-300)}`);
  return r.stdout.trim();
}

// JS yang dijalankan DI halaman Clippo (sesi login Owner, sama persis dengan yang dilakukan web Clippo sendiri) → unduh 1 file JSON
const SCOUT_JS = (name) => `(async () => {
  const get = async (p) => (await (await fetch('/api/proxy' + p)).json()).data;
  const list = [];
  for (let page = 1; page <= 5; page++) { const d = await get('/campaigns?page=' + page); list.push(...(d.data || [])); if (page >= (d.totalPage || 1)) break; }
  const out = [];
  for (const c of list) {
    const ok = c.status === 3 && (c.platformSupported || []).some((p) => p === 0 || p === 1) && (c.budgetPercentage || 0) >= 15;
    out.push(ok ? { ...c, ...(await get('/campaigns/' + c.id).catch(() => ({}))) } : c);
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(out)], { type: 'application/json' }));
  a.download = '${name}'; document.body.appendChild(a); a.click(); a.remove();
  return out.length + ' campaign';
})()`;

async function scout() {
  const name = `clippo-campaigns-${Date.now()}.json`;
  const out = claudeChrome(`Buka tab baru di Chrome ke https://app.clippo.id/campaigns (akun Owner sudah login; kalau ternyata belum login, BERHENTI dan jawab "BELUM LOGIN").
Tunggu halaman selesai dimuat, lalu jalankan JavaScript berikut di halaman itu PERSIS apa adanya (jangan diubah), tunggu sampai selesai, lalu tutup tab yang kamu buka:
${SCOUT_JS(name)}
Jawab singkat: jumlah campaign yang dikembalikan script, atau pesan error-nya.`);
  if (/BELUM LOGIN/i.test(out)) throw new Error('Chrome laptop belum login Clippo');
  const file = join(DL, name);
  for (let i = 0; i < 30 && !existsSync(file); i++) await new Promise((r) => setTimeout(r, 1000));
  if (!existsSync(file)) throw new Error(`file ${name} nggak muncul di ${DL} (output Claude: ${out.slice(0, 200)})`);
  const tmp = join(mkdtempSync(join(tmpdir(), 'clippo-')), 'c.json');
  copyFileSync(file, tmp); unlinkSync(file);
  const up = spawnSync('scp', ['-q', tmp, `${VPS}:zataa-office/tmp/clippo-campaigns.json`], { stdio: 'inherit' });
  if (up.status !== 0) throw new Error('kirim data campaign ke VPS gagal');
  return vps('node scripts/clipper.mjs ingest tmp/clippo-campaigns.json');
}

async function submit() {
  const q = JSON.parse(vps('node scripts/clipper.mjs submitq') || '[]');
  const done = [];
  for (const t of q) {
    const page = `https://app.clippo.id/campaigns/${t.campaignId}`;
    const task = t.join
      ? `Buka ${page} di tab baru Chrome (akun Owner sudah login). Kalau tombol "Join Campaign" ada, klik, centang persetujuan/syarat yang diminta lalu konfirmasi join (Owner sudah menyetujui campaign ini di Telegram). Kalau diminta tanda tangan nama, pakai nama profil akun yang tampil di Clippo. Kalau sudah join, tidak usah apa-apa. Tutup tab.`
      : `Buka ${page} di tab baru Chrome (akun Owner sudah login). Ajukan/submit clip berikut ke campaign ini lewat form submit clip di halaman itu (tempel URL, cek, lanjut, kirim): ${t.urls.join(' , ')}. Owner sudah menyetujui pengajuan ini. Jangan ubah hal lain. Tutup tab.`;
    let res;
    try {
      const out = claudeChrome(`${task}\nJawab di baris terakhir PERSIS salah satu: "HASIL: ok" atau "HASIL: gagal <alasan singkat>".`, 10);
      res = (out.match(/HASIL:\s*(.+)\s*$/i)?.[1] ?? `gagal output tidak jelas: ${out.slice(-120)}`).trim();
    } catch (e) { res = `gagal ${e.message.slice(0, 150)}`; }
    vps(`node scripts/clipper.mjs submitted ${t.job} '${res.replace(/['\$`]/g, '')}'`);
    done.push({ job: t.job, res });
  }
  return done;
}

const cmd = process.argv[2];
try {
  if (cmd === 'scout') console.log(await scout());
  else if (cmd === 'submit') console.log(JSON.stringify(await submit()));
  else console.log('pakai: clipper-chrome.mjs scout | submit');
} catch (e) { console.error(`Error: ${e.message}`); process.exit(1); }
