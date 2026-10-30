// Link pelacak klik ke zataa.my.id (zataa.my.id sendiri nggak punya analytics): <GO_BASE>/<sumber>[/<id konten>][?g=<slug game>]
// → catat 1 baris di tabel clicks → 302 ke zataa.my.id (bawa utm_*). Cloudflare (proxy, HTTPS) → VPS port 80 (service zataa-golink).
// GO_BASE (.env) = domain link pelacak. zataa.my.id dikelola platform toko, nggak bisa bikin subdomain → butuh domain sendiri.
// GO_BASE kosong = belum ada domain: linkFor() balik ke zataa.my.id polos (biar nggak ada link mati).
// Privasi: IP nggak disimpan, cuma hash harian (ip+ua+tanggal) buat hitung pengunjung unik.
//   node scripts/golink.mjs serve            → server (GO_PORT, default 8790; service VPS pakai 80)
//   node scripts/golink.mjs url <sumber> [id] [game]   → bikin link
//   node scripts/golink.mjs stats [hari]     → ringkasan klik
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.mjs';
import { loadEnv } from './approval.mjs';

export const GO_BASE = (process.env.GO_BASE || loadEnv().GO_BASE || '').replace(/\/+$/, '') || null;
const SITE = 'https://zataa.my.id';
// sumber yang dikenal (yang lain tetap dicatat apa adanya, asal lolos regex)
export const SOURCES = {
  ig: 'IG bio', igs: 'IG Story', tt: 'TikTok bio', tg: 'Telegram', yt: 'YouTube', wa: 'WhatsApp',
};
const SQL = `CREATE TABLE IF NOT EXISTS clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (datetime('now')),
  src TEXT NOT NULL, content_id INTEGER, game TEXT, visitor TEXT, country TEXT, bot INTEGER DEFAULT 0)`;
export function ensureClicks(d) {
  d.exec(SQL);
  d.exec('CREATE INDEX IF NOT EXISTS idx_clicks_ts ON clicks(ts)');
}

const BOT = /bot|crawl|spider|preview|facebookexternalhit|whatsapp|telegram|slack|discord|curl|wget|python|headless/i;
const SRC_RE = /^[a-z0-9-]{1,20}$/, GAME_RE = /^[a-z0-9-]{1,60}$/;

// path → { src, content_id, game } atau null (path asing)
export function parse(url) {
  const u = new URL(url, 'http://go.local');
  const [src, id, ...rest] = u.pathname.split('/').filter(Boolean).map((s) => s.toLowerCase());
  if (!src || rest.length || !SRC_RE.test(src) || (id && !/^\d{1,7}$/.test(id))) return null;
  const g = (u.searchParams.get('g') ?? '').toLowerCase();
  return { src, content_id: id ? +id : null, game: GAME_RE.test(g) ? g : null };
}

// tujuan selalu di zataa.my.id (bukan open redirect): beranda atau /game/<slug>
export function target({ src, content_id, game }) {
  const u = new URL(game ? `/game/${game}` : '/', SITE);
  u.searchParams.set('utm_source', src);
  u.searchParams.set('utm_medium', 'social');
  if (content_id) u.searchParams.set('utm_campaign', `konten-${content_id}`);
  return u.href;
}

export const linkFor = (src, contentId, game) => !GO_BASE ? SITE :
  `${GO_BASE}/${src}${contentId ? `/${contentId}` : ''}${game ? `?g=${game}` : ''}`;

function serve() {
  const d = openDb();
  ensureClicks(d);
  const ins = d.prepare('INSERT INTO clicks (src, content_id, game, visitor, country, bot) VALUES (?, ?, ?, ?, ?, ?)');
  const port = +(process.env.GO_PORT ?? 8790);
  createServer((req, res) => {
    const path = req.url ?? '/';
    if (path === '/health') return res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
    if (path === '/robots.txt') return res.writeHead(200, { 'Content-Type': 'text/plain' }).end('User-agent: *\nDisallow: /\n');
    const p = parse(path);
    if (!p) return res.writeHead(302, { Location: SITE, 'Cache-Control': 'no-store' }).end(); // beranda / path asing: lempar aja, nggak dicatat
    const ua = req.headers['user-agent'] ?? '';
    const ip = req.headers['cf-connecting-ip'] ?? req.socket.remoteAddress ?? '';
    const day = new Date().toISOString().slice(0, 10);
    const visitor = createHash('sha256').update(`${ip}|${ua}|${day}`).digest('hex').slice(0, 16);
    try { ins.run(p.src, p.content_id, p.game, visitor, String(req.headers['cf-ipcountry'] ?? '').slice(0, 2) || null, BOT.test(ua) ? 1 : 0); }
    catch (e) { console.error('[golink] gagal catat:', e.message); } // DB sibuk pun redirect tetap jalan
    res.writeHead(302, { Location: target(p), 'Cache-Control': 'no-store' }).end();
  }).listen(port, () => console.log(`[golink] jalan di port ${port}`));
}

// ringkasan buat laporan Raka & web (bot nggak dihitung)
export function clickStats(d, fromIso, toIso = '9999') {
  ensureClicks(d);
  const w = 'bot = 0 AND ts >= ? AND ts < ?';
  const t = d.prepare(`SELECT COUNT(*) clicks, COUNT(DISTINCT visitor) visitors FROM clicks WHERE ${w}`).get(fromIso, toIso);
  const bySrc = d.prepare(`SELECT src, COUNT(*) n FROM clicks WHERE ${w} GROUP BY src ORDER BY n DESC`).all(fromIso, toIso);
  const byContent = d.prepare(`SELECT k.content_id id, c.title, COUNT(*) n FROM clicks k LEFT JOIN contents c ON c.id = k.content_id
    WHERE k.content_id IS NOT NULL AND k.bot = 0 AND k.ts >= ? AND k.ts < ? GROUP BY k.content_id ORDER BY n DESC LIMIT 3`).all(fromIso, toIso);
  return { clicks: Number(t.clicks), visitors: Number(t.visitors), by_src: bySrc.map((r) => ({ ...r, n: Number(r.n) })), top: byContent.map((r) => ({ ...r, n: Number(r.n) })) };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'serve') {
    (await import('./reload.mjs')).markCode();
    serve();
  } else if (cmd === 'url') {
    const [src, id, game] = args;
    if (!src || !SRC_RE.test(src)) { console.error(`sumber: ${Object.keys(SOURCES).join(' | ')}`); process.exit(1); }
    if (!GO_BASE) console.error('GO_BASE belum di-set di .env → link polos zataa.my.id (klik nggak kehitung)');
    console.log(linkFor(src, id && /^\d+$/.test(id) ? id : null, game));
  } else if (cmd === 'stats') {
    const days = +(args[0] ?? 7);
    const from = new Date(Date.now() - days * 86400_000).toISOString().replace('T', ' ').slice(0, 19);
    console.log(JSON.stringify(clickStats(openDb(), from), null, 2));
  } else {
    console.log('perintah: serve | url <sumber> [id_konten] [slug_game] | stats [hari]');
  }
}
