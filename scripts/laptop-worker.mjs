// Pekerja laptop: ambil antrean video bersuara OmniVoice dari VPS → render-laptop.mjs <id> --submit.
// Dijalankan Task Scheduler Windows tiap 10 menit (scripts/laptop-worker.vbs, tanpa jendela).
//   node scripts/laptop-worker.mjs           # 1 putaran
// Antrean = video draft/revision yang ditandai render.mjs VPS (data_json._laptop = 1).
import { spawnSync } from 'node:child_process';
import { openSync, closeSync, unlinkSync, statSync, appendFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VPS = process.env.ZATAA_VPS ?? 'zataa-vps';
const LOCK = join(tmpdir(), 'zataa-laptop-worker.lock');
mkdirSync(join(ROOT, 'logs'), { recursive: true });
const log = (m) => appendFileSync(join(ROOT, 'logs', 'laptop-worker.log'), `${new Date().toISOString()} ${m}\n`);
const vps = (cmd, input) => spawnSync('ssh', ['-o', 'ConnectTimeout=10', '-o', 'BatchMode=yes', VPS, `cd ~/zataa-office && ${cmd}`], { input, encoding: 'utf8' });

// cegah dobel jalan (render bisa >10 menit); kunci basi >1 jam dibuang
try { if (Date.now() - statSync(LOCK).mtimeMs > 3600e3) unlinkSync(LOCK); } catch {}
let fd;
try { fd = openSync(LOCK, 'wx'); } catch { process.exit(0); }
try {
  const q = vps('node --no-warnings --input-type=module -', `const { DatabaseSync } = await import('node:sqlite'); const db = new DatabaseSync('db/office.db');
    console.log(JSON.stringify(db.prepare("SELECT id FROM contents WHERE format = 'video' AND status IN ('draft', 'revision') AND json_extract(data_json, '$._laptop') = 1 ORDER BY day, id").all().map((r) => r.id)));`);
  if (q.status !== 0) { log(`VPS tidak terjangkau: ${(q.stderr || '').trim().slice(-150)}`); process.exit(0); }
  for (const id of JSON.parse(q.stdout.trim() || '[]')) {
    log(`render #${id}`);
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'render-laptop.mjs'), String(id), '--submit'], { encoding: 'utf8' });
    const ok = r.status === 0;
    log(ok ? `selesai #${id}: ${r.stdout.trim().slice(-300)}` : `gagal #${id}: ${(r.stderr || r.stdout).trim().slice(-300)}`);
    const msg = ok ? `Video #${id} dirender di laptop (suara OmniVoice) & dikirim ke Owner` : `Render laptop video #${id} gagal, cek logs/laptop-worker.log di laptop`;
    vps(`node scripts/office.mjs log video ${JSON.stringify(msg)}`);
  }
} finally {
  closeSync(fd);
  try { unlinkSync(LOCK); } catch {}
}
