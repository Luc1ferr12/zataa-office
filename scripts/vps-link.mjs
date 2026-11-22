// Sambungan laptop → VPS yang tahan wifi goyang (22 Nov 2026): ssh/scp dicoba ulang + gantian port 22 ↔ 443.
// Dulu satu kali coba saja → "Connection closed"/"Unknown error" langsung bikin render gagal (Esports #216, Marvel #215, History #213).
// Dipakai render-laptop.mjs & shorts-laptop.mjs. Gagal karena perintah di VPS-nya sendiri (bukan jaringan) TIDAK diulang.
import { spawnSync } from 'node:child_process';

const FIRST = process.env.ZATAA_VPS ?? 'zataa-vps';
const HOSTS = [...new Set([FIRST, 'zataa-vps-443'])];
const TRIES = 6; // gantian host: 22, 443, 22, 443, …
const OPT = ['-o', 'ConnectTimeout=15', '-o', 'BatchMode=yes', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=4'];
const sleep = (s) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, s * 1000);
// ssh/scp keluar 255 kalau sambungan putus/nggak tembus; scp juga kadang 1 dengan pesan "Connection closed"
const netFail = (r) => r.status === 255 || r.error != null || /Connection (closed|reset|timed out)|Unknown error|Broken pipe|Could not resolve|No route|kex_exchange|banner exchange/i.test(r.stderr ?? '');

function retry(build) {
  let r;
  for (let i = 0; i < TRIES; i++) {
    r = build(HOSTS[i % HOSTS.length]);
    if (r.status === 0 || !netFail(r)) return r;
    process.stderr.write(`[vps-link] sambungan putus (${HOSTS[i % HOSTS.length]}, coba ${i + 1}/${TRIES}): ${(r.stderr ?? r.error?.message ?? '').trim().split('\n').pop()}\n`);
    if (i < TRIES - 1) sleep(Math.min(5 * (i + 1), 20));
  }
  return r;
}

// jalankan perintah shell di folder kantor VPS; hasil = spawnSync result (status, stdout, stderr)
export const ssh = (cmd, input) => retry((h) => spawnSync('ssh', [...OPT, h, `cd ~/zataa-office && ${cmd}`], { input, encoding: 'utf8' }));

// salin file dari VPS (path relatif ~/zataa-office) ke `local`
export const scpFrom = (remoteRel, local) => retry((h) => spawnSync('scp', ['-q', ...OPT, `${h}:zataa-office/${remoteRel}`, local], { encoding: 'utf8' }));

// salin file lokal ke folder `remoteDirRel` di VPS
export const scpTo = (files, remoteDirRel) => retry((h) => spawnSync('scp', ['-q', ...OPT, ...files, `${h}:zataa-office/${remoteDirRel}/`], { encoding: 'utf8' }));
