// Pekerja laptop: ambil antrean video bersuara OmniVoice dari VPS → render-laptop.mjs <id> --submit (video Marketing)
// atau shorts-laptop.mjs <id> --submit (Shorts: channel 'youtube' = Zaa History, 'story' = Zaa Story).
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

// bot = clips | shorts | office. Tiap divisi punya bot sendiri: JANGAN kirim ke bot kantor About Esports (TELEGRAM_BOT_TOKEN).
// Token bot divisi dipakai dari .env laptop kalau ada, kalau tidak dikirim lewat SSH ke VPS (scripts/tgsay.mjs); gagal semua → cuma dilog.
const BOT_ENV = { clips: ['CLIPPER_BOT_TOKEN', 'CLIPPER_OWNER_ID'], shorts: ['SHORTS_BOT_TOKEN', 'SHORTS_OWNER_ID'], office: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'] };
async function tg(text, bot = 'office') {
  if (process.env.TRD_SILENT === '1') return log(`(silent) telegram[${bot}]: ${text}`);
  const env = existsSync(join(ROOT, '.env')) ? Object.fromEntries(readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])) : {};
  const [tk, ck] = BOT_ENV[bot];
  const chat = env[ck] || (bot === 'clips' ? env.SHORTS_OWNER_ID : '');
  if (env[tk] && chat) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${env[tk]}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text }) });
      if (r.ok) return;
      log(`telegram[${bot}] gagal: ${r.status}`);
    } catch (e) { log(`telegram[${bot}] gagal: ${e.message}`); }
  }
  const r = vps(`node scripts/tgsay.mjs ${bot} "$(cat)"`, text);
  if (r.status !== 0) log(`telegram[${bot}] via VPS gagal: ${(r.stderr || '').trim().slice(-150)}`);
}
const readDown = () => { try { return JSON.parse(readFileSync(DOWN, 'utf8')); } catch { return null; } };

// Divisi Zaa Clips (16 Nov 2026): edit clip di antrean (clipper-laptop.mjs), tiap pagi ≥07:30 WITA baca campaign Clippo lewat Chrome
// (clipper-chrome.mjs scout), dan maks tiap 30 menit kerjain antrean join/ajukan ke Clippo (clipper-chrome.mjs submit).
const CSTATE = join(ROOT, 'logs', 'clipper-chrome.json');
async function clipperWork() {
  const node = (args, min = 30) => spawnSync(process.execPath, [join(ROOT, 'scripts', args[0]), ...args.slice(1)], { encoding: 'utf8', timeout: min * 60_000, env: { ...process.env, ZATAA_VPS: VPS } });
  const say = (r) => `${(r.stdout ?? '').trim().slice(-200)} ${(r.stderr ?? '').trim().slice(-200)}`.trim();
  const ids = (() => { const r = vps('node scripts/clipper.mjs queue'); try { return r.status === 0 ? JSON.parse(r.stdout.trim() || '[]') : []; } catch { return []; } })();
  for (const id of ids.slice(0, 3)) { const r = node(['clipper-laptop.mjs', String(id)]); log(`clip #${id} ${r.status === 0 ? 'ok' : 'gagal'}: ${say(r)}`); }
  const st = (() => { try { return JSON.parse(readFileSync(CSTATE, 'utf8')); } catch { return {}; } })();
  const w = new Date(Date.now() + 8 * 3600e3), day = w.toISOString().slice(0, 10), min = w.getUTCHours() * 60 + w.getUTCMinutes();
  if (min >= 7 * 60 + 30 && st.scout !== day && Date.now() - (st.scoutTry ?? 0) >= 60 * 60e3) { // gagal → coba lagi paling cepat 1 jam kemudian
    st.scoutTry = Date.now();
    const r = node(['clipper-chrome.mjs', 'scout'], 20); log(`clippo scout ${r.status === 0 ? 'ok' : 'gagal'}: ${say(r)}`);
    if (r.status === 0) st.scout = day; else if ((st.fail ?? '') !== day) { st.fail = day; await tg(`Hendra: Bos, laptop gagal baca campaign Clippo lewat Chrome (${say(r).slice(0, 160)}). Pastikan Chrome kebuka, login app.clippo.id & ekstensi Claude in Chrome nyambung ya.`, 'clips'); }
  }
  if (Date.now() - (st.submitAt ?? 0) >= 30 * 60e3) {
    const q = vps('node scripts/clipper.mjs submitq');
    if (q.status === 0 && q.stdout.trim().startsWith('[') && q.stdout.trim() !== '[]') { const r = node(['clipper-chrome.mjs', 'submit'], 40); log(`clippo submit: ${say(r)}`); }
    st.submitAt = Date.now();
  }
  writeFileSync(CSTATE, JSON.stringify(st));
}
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
    let yt = ''; try { db.prepare('SELECT channel FROM contents LIMIT 1').get(); yt = "OR channel IN ('youtube', 'story', 'marvel')"; } catch {}
    console.log(JSON.stringify(db.prepare("SELECT id, format FROM contents WHERE (format = 'video' " + yt + ") AND status IN ('draft', 'revision') AND json_extract(data_json, '$._laptop') = 1 ORDER BY day, id").all()));`;
  let q;
  for (const h of HOSTS) {
    VPS = h;
    q = vps('node --no-warnings --input-type=module -', QUERY);
    if (q.status === 0) break;
  }
  // render gagal gara-gara jaringan (ssh/scp putus, gambar gagal diambil) → antre ulang otomatis, maks 3× per konten (_retry), hanya yang gagal <12 jam lalu (jangan bangkitkan konten basi);
  // dulu status 3 nunggu sesi Claude berikutnya, jadi Owner lihat "gagal" padahal laptop nyala & tinggal coba lagi
  if (q.status === 0) {
    const rq = vps('node --no-warnings --input-type=module -', `${DB_SNIPPET}
      console.log(db.prepare("UPDATE contents SET data_json = json_set(data_json, '$._laptop', 1, '$._retry', COALESCE(json_extract(data_json, '$._retry'), 0) + 1, '$._warned', 0), updated_at = datetime('now') WHERE status IN ('draft', 'revision') AND json_extract(data_json, '$._laptop') = 3 AND COALESCE(json_extract(data_json, '$._retry'), 0) < 3 AND updated_at >= datetime('now', '-12 hours') AND (json_extract(data_json, '$._err') LIKE '%VPS%' OR json_extract(data_json, '$._err') LIKE '%upload%' OR json_extract(data_json, '$._err') LIKE '%gagal diambil%' OR json_extract(data_json, '$._err') LIKE '%maupun VPS%' OR json_extract(data_json, '$._err') LIKE '%Connection%')").run().changes);`);
    if (rq.status === 0 && +rq.stdout.trim() > 0) { log(`${rq.stdout.trim()} konten gagal-jaringan diantre ulang`); q = vps('node --no-warnings --input-type=module -', QUERY); }
  }
  const down = readDown();
  if (q.status !== 0) {
    const err = (q.stderr || '').trim().slice(-150);
    log(`VPS tidak terjangkau (${HOSTS.join(', ')}): ${err}`);
    const d = down ?? { since: Date.now(), notified: 0 };
    if (Date.now() - d.since >= 20 * 60e3 && Date.now() - d.notified >= 3 * 3600e3) {
      const menit = Math.round((Date.now() - d.since) / 60e3);
      await tg(`Yoga: Bos, laptop udah ${menit} menit nggak bisa nyambung ke VPS (SSH port 22 & 443 gagal), jadi antrean render OmniVoice (Shorts/video) ketahan. Coba ganti wifi / pakai hotspot HP ya. Begitu nyambung aku langsung render.`, 'shorts');
      d.notified = Date.now();
    }
    writeFileSync(DOWN, JSON.stringify(d));
  } else {
    if (down) {
      unlinkSync(DOWN);
      if (down.notified) await tg(`Yoga: Laptop udah nyambung lagi ke VPS (lewat ${VPS}), antrean render jalan lagi, Bos.`, 'shorts');
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
  if (q.status === 0 && process.env.CLIPPER_ON === '1') await clipperWork(); // Zaa Clips LIBUR sejak 20 Nov 2026 (nyalain: .env CLIPPER_ON=1)
} finally {
  closeSync(fd);
  try { unlinkSync(LOCK); } catch {}
}
