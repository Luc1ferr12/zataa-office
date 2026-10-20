// Deploy otomatis di VPS tanpa SSH: watcher narik kode (git pull) tiap 10 menit, tapi proses lama tetap pakai kode di memori.
// Dipanggil tiap `office.mjs export` (proses baru → selalu kode terbaru): kalau ada service (watcher / trading) yang
// mulai jalan SEBELUM kode terakhir berubah → dimatikan (SIGTERM), systemd (Restart=always) nyalain lagi pakai kode baru.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVICES = ['scripts/watch.mjs', 'scripts/trading/run.mjs'];

function newestCode() {
  let t = 0;
  for (const dir of ['scripts', 'scripts/trading', 'docs/js']) {
    for (const f of readdirSync(join(ROOT, dir))) {
      if (/\.m?js$/.test(f)) t = Math.max(t, statSync(join(ROOT, dir, f)).mtimeMs);
    }
  }
  return t;
}

// jam mulai proses (ms epoch) dari /proc: btime boot + starttime (clock tick, 100/detik di Linux)
function startedAt(pid) {
  const btime = +readFileSync('/proc/stat', 'utf8').match(/^btime (\d+)/m)[1];
  const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
  const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
  return btime * 1000 + (+fields[19] / 100) * 1000;
}

export function reloadStale() {
  if (process.platform !== 'linux') return []; // laptop Windows: nggak ada service
  const code = newestCode();
  if (Date.now() - code < 60_000) return []; // git pull mungkin belum kelar, tunggu ekspor berikutnya
  const killed = [];
  for (const pid of readdirSync('/proc').filter((p) => /^\d+$/.test(p))) {
    try {
      const cmd = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0');
      const svc = SERVICES.find((s) => cmd[0]?.endsWith('node') && cmd.includes(s));
      if (!svc || startedAt(pid) > code) continue;
      process.kill(+pid, 'SIGTERM');
      killed.push(svc);
    } catch { /* proses sudah hilang / bukan punya kita */ }
  }
  return killed;
}
