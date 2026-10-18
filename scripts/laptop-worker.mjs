// Pekerja laptop: ambil antrean video bersuara OmniVoice dari VPS → render-laptop.mjs <id> --submit (video Marketing)
// atau shorts-laptop.mjs <id> --submit (YouTube Shorts, channel 'youtube').
// Dijalankan Task Scheduler Windows tiap 10 menit (scripts/laptop-worker.vbs, tanpa jendela).
//   node scripts/laptop-worker.mjs           # 1 putaran
// Antrean = konten draft/revision bertanda data_json._laptop = 1 (video: render.mjs VPS, Shorts: shorts-bot.mjs new/queue).
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
    let yt = ''; try { db.prepare('SELECT channel FROM contents LIMIT 1').get(); yt = "OR channel = 'youtube'"; } catch {}
    console.log(JSON.stringify(db.prepare("SELECT id, format FROM contents WHERE (format = 'video' " + yt + ") AND status IN ('draft', 'revision') AND json_extract(data_json, '$._laptop') = 1 ORDER BY day, id").all()));`);
  if (q.status !== 0) { log(`VPS tidak terjangkau: ${(q.stderr || '').trim().slice(-150)}`); process.exit(0); }
  for (const { id, format } of JSON.parse(q.stdout.trim() || '[]')) {
    const shorts = format === 'shorts';
    log(`render ${shorts ? 'shorts ' : ''}#${id}`);
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts', shorts ? 'shorts-laptop.mjs' : 'render-laptop.mjs'), String(id), '--submit'], { encoding: 'utf8' });
    const ok = r.status === 0;
    const full = `${r.stdout ?? ''}\n${r.stderr ?? ''}`.trim();
    if (!ok) appendFileSync(join(ROOT, 'logs', `render-${id}.log`), `===== ${new Date().toISOString()}\n${full}\n`); // log lengkap, nggak kepotong
    const why = full.split('\n').map((l) => l.trim()).filter((l) => /^Error:|error|gagal|ENOENT|403|timeout/i.test(l)).slice(-2).join(' | ') || full.slice(-300);
    log(ok ? `selesai #${id}: ${r.stdout.trim().slice(-300)}` : `gagal #${id}: ${why.slice(0, 400)} (lengkap: logs/render-${id}.log)`);
    const what = shorts ? 'Shorts' : 'video';
    const msg = ok ? `${what} #${id} dirender di laptop (suara OmniVoice) & dikirim ke Owner` : `Render laptop ${what} #${id} gagal, cek logs/laptop-worker.log di laptop`;
    vps(`node scripts/office.mjs log ${shorts ? 'yvideo' : 'video'} ${JSON.stringify(msg)}`);
  }
} finally {
  closeSync(fd);
  try { unlinkSync(LOCK); } catch {}
}
