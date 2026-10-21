// Pekerja laptop: ambil antrean video bersuara OmniVoice dari VPS → render-laptop.mjs <id> --submit (video Marketing)
// atau shorts-laptop.mjs <id> --submit (YouTube Shorts, channel 'youtube').
// Dijalankan Task Scheduler Windows tiap 10 menit (scripts/laptop-worker.vbs, tanpa jendela).
//   node scripts/laptop-worker.mjs           # 1 putaran
// Antrean = konten draft/revision bertanda data_json._laptop = 1 (video: render.mjs VPS, Shorts: shorts-bot.mjs new/queue).
// VPS nggak kejangkau ≥20 menit → kabari Owner langsung lewat Telegram bot kantor (.env laptop), maks 1×/3 jam; pulih → kabari lagi.
// SSH dicoba port 22 dulu (zataa-vps), lalu 443 (zataa-vps-443 di ~/.ssh/config) — beberapa wifi blok port 22.
import { spawnSync } from 'node:child_process';
import { openSync, closeSync, unlinkSync, readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DB_SNIPPET } from './db.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOSTS = [...new Set([process.env.ZATAA_VPS ?? 'zataa-vps', 'zataa-vps-443'])];
const LOCK = join(tmpdir(), 'zataa-laptop-worker.lock');
const DOWN = join(ROOT, 'logs', 'vps-down.json');
mkdirSync(join(ROOT, 'logs'), { recursive: true });
const log = (m) => appendFileSync(join(ROOT, 'logs', 'laptop-worker.log'), `${new Date().toISOString()} ${m}\n`);
let VPS = HOSTS[0];
const vps = (cmd, input) => spawnSync('ssh', ['-o', 'ConnectTimeout=10', '-o', 'BatchMode=yes', VPS, `cd ~/zataa-office && ${cmd}`], { input, encoding: 'utf8' });

async function tg(text) {
  if (process.env.TRD_SILENT === '1') return log(`(silent) telegram: ${text}`);
  const env = existsSync(join(ROOT, '.env')) ? Object.fromEntries(readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])) : {};
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return log('telegram: TELEGRAM_BOT_TOKEN/CHAT_ID kosong di .env laptop');
  try {
    const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }) });
    if (!r.ok) log(`telegram gagal: ${r.status}`);
  } catch (e) { log(`telegram gagal: ${e.message}`); }
}
const readDown = () => { try { return JSON.parse(readFileSync(DOWN, 'utf8')); } catch { return null; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

// cegah dobel jalan (render bisa >10 menit); lock berisi PID, prosesnya udah mati → lock yatim dibuang
let fd;
try { fd = openSync(LOCK, 'wx'); } catch {
  const pid = +readFileSync(LOCK, 'utf8').trim();
  if (pid && alive(pid)) process.exit(0);
  log(`lock yatim (pid ${pid || '?'}) dibuang`);
  unlinkSync(LOCK);
  try { fd = openSync(LOCK, 'wx'); } catch { process.exit(0); }
}
writeFileSync(fd, String(process.pid));
try {
  const QUERY = `${DB_SNIPPET}
    let yt = ''; try { db.prepare('SELECT channel FROM contents LIMIT 1').get(); yt = "OR channel = 'youtube'"; } catch {}
    console.log(JSON.stringify(db.prepare("SELECT id, format FROM contents WHERE (format = 'video' " + yt + ") AND status IN ('draft', 'revision') AND json_extract(data_json, '$._laptop') = 1 ORDER BY day, id").all()));`;
  let q;
  for (const h of HOSTS) {
    VPS = h;
    q = vps('node --no-warnings --input-type=module -', QUERY);
    if (q.status === 0) break;
  }
  const down = readDown();
  if (q.status !== 0) {
    const err = (q.stderr || '').trim().slice(-150);
    log(`VPS tidak terjangkau (${HOSTS.join(', ')}): ${err}`);
    const d = down ?? { since: Date.now(), notified: 0 };
    if (Date.now() - d.since >= 20 * 60e3 && Date.now() - d.notified >= 3 * 3600e3) {
      const menit = Math.round((Date.now() - d.since) / 60e3);
      await tg(`Yoga: Bos, laptop udah ${menit} menit nggak bisa nyambung ke VPS (SSH port 22 & 443 gagal), jadi antrean render OmniVoice (Shorts/video) ketahan. Coba ganti wifi / pakai hotspot HP ya. Begitu nyambung aku langsung render.`);
      d.notified = Date.now();
    }
    writeFileSync(DOWN, JSON.stringify(d));
  } else {
    if (down) {
      unlinkSync(DOWN);
      if (down.notified) await tg(`Yoga: Laptop udah nyambung lagi ke VPS (lewat ${VPS}), antrean render jalan lagi, Bos.`);
    }
    if (VPS !== HOSTS[0]) log(`pakai ${VPS} (port 22 diblok?)`);
    process.env.ZATAA_VPS = VPS; // render-laptop.mjs / shorts-laptop.mjs ikut host yang tembus
  }
  for (const { id, format } of q.status === 0 ? JSON.parse(q.stdout.trim() || '[]') : []) {
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
