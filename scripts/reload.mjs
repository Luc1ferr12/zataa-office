// Deploy otomatis di VPS tanpa SSH: watcher narik kode (git pull) tiap 10 menit, tapi proses lama tetap pakai kode di memori.
// Tiap service (watcher / trading) waktu start nyatet versi kodenya (markCode = hash tree git scripts/ + docs/js di HEAD).
// Dipanggil tiap `office.mjs export`: kalau versi kode di HEAD sudah beda dari catatan service → dimatikan (SIGTERM),
// systemd (Restart=always) nyalain lagi pakai kode baru.
// Sengaja BUKAN mtime file: `git pull --autostash` nulis ulang file yang diedit lokal → mtime selalu baru → restart tiap 2 menit (Okt 2026).
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVICES = ['scripts/watch.mjs', 'scripts/trading/run.mjs', 'scripts/golink.mjs'];
const MARKS = join(tmpdir(), 'zataa-code');

function codeId() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD:scripts', 'HEAD:docs/js'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().replace(/\s+/g, ' ');
  } catch { return null; }
}

// dipanggil sekali waktu service start
export function markCode() {
  if (process.platform !== 'linux') return;
  try { mkdirSync(MARKS, { recursive: true }); writeFileSync(join(MARKS, String(process.pid)), codeId() ?? 'unknown'); } catch { /* abaikan */ }
}

// detik sejak proses start, dari /proc: btime boot + starttime (clock tick, 100/detik di Linux)
function ageSec(pid) {
  const btime = +readFileSync('/proc/stat', 'utf8').match(/^btime (\d+)/m)[1];
  const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
  const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
  return Date.now() / 1000 - (btime + +fields[19] / 100);
}

export function reloadStale() {
  if (process.platform !== 'linux') return []; // laptop Windows: nggak ada service
  const code = codeId();
  if (!code) return [];
  const pids = readdirSync('/proc').filter((p) => /^\d+$/.test(p));
  try { for (const f of readdirSync(MARKS)) if (!pids.includes(f)) rmSync(join(MARKS, f), { force: true }); } catch { /* belum ada */ }
  const killed = [];
  for (const pid of pids) {
    try {
      const cmd = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0');
      const svc = SERVICES.find((s) => cmd[0]?.endsWith('node') && cmd.includes(s));
      if (!svc) continue;
      let mark = null;
      try { mark = readFileSync(join(MARKS, pid), 'utf8').trim(); } catch { /* service versi lama, belum nyatet */ }
      if (mark === 'unknown' || mark === code) continue;
      if (!mark && ageSec(pid) < 120) continue; // baru nyala, kasih waktu nyatet
      process.kill(+pid, 'SIGTERM');
      killed.push(svc);
    } catch { /* proses sudah hilang / bukan punya kita */ }
  }
  return killed;
}
