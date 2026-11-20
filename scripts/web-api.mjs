// Panel approval di web (docs/js/approve.js) → server kecil di dalam watcher VPS. Owner bisa ✅/✏️/❌ dari web selain Telegram.
// Keputusan masuk jalur yang sama dengan tombol Telegram:
//   About Esports (konten, plan mingguan, ide briefing) → antrean office-bot.mjs (webDecision) → approval.mjs poll()
//   Zaa Clips (campaign usulan Hendra + clip jadi) → file tmp/web-inbox/clips/*.json → diambil bot clipper.mjs (webInbox)
//   Shorts History/Story/Marvel → file tmp/web-inbox/<brand>/*.json → diambil bot brand itu (shorts-bot.mjs webInbox)
// Aman: wajib header Authorization: Bearer <WEB_APPROVAL_TOKEN> (.env VPS, acak ≥32 karakter), salah 8× per IP / 10 menit = diblok.
// HTTPS lewat Cloudflare quick tunnel (scripts/vps/zataa-tunnel.service, gratis tanpa domain); alamatnya berubah tiap tunnel restart,
// jadi watcher cek /quicktunnel tiap menit & tulis docs/data/api.json (ikut push GitHub Pages). Punya domain sendiri → isi WEB_API_URL.
//   .env: WEB_APPROVAL_TOKEN=<rahasia>  [WEB_API_PORT=8790] [WEB_API_URL=https://…] [WEB_ORIGIN=https://luc1ferr12.github.io]
//   tes lokal: node scripts/web-api.mjs serve   (pakai .env laptop: keputusan beneran masuk antrean, hati-hati)
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual, createHash } from 'node:crypto';
import { db, loadEnv } from './approval.mjs';
import { webDecision } from './office-bot.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = () => ({ ...loadEnv(), ...process.env });
const SHORTS = { youtube: 'history', story: 'story', marvel: 'marvel' };   // channel DB → brand bot
const BRAND = { '': 'About Esports', youtube: 'Zaa History', story: 'Zaa Story', marvel: 'Marvel Talk' };
const API_JSON = join(ROOT, 'docs', 'data', 'api.json');
const TUNNEL_METRICS = 'http://127.0.0.1:20241/quicktunnel';

// ---------- keamanan
const hash = (s) => createHash('sha256').update(String(s)).digest();
function authed(req) {
  const tok = env().WEB_APPROVAL_TOKEN ?? '';
  const got = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  return tok.length >= 24 && got.length > 0 && timingSafeEqual(hash(tok), hash(got));
}
const fails = new Map();   // ip → [timestamp gagal]
const ipOf = (req) => String(req.headers['cf-connecting-ip'] ?? req.socket.remoteAddress ?? '?');
const blocked = (ip) => (fails.get(ip) ?? []).filter((t) => Date.now() - t < 600_000).length >= 8;
const fail = (ip) => fails.set(ip, [...(fails.get(ip) ?? []).filter((t) => Date.now() - t < 600_000), Date.now()]);

function cors(req, res) {
  const o = req.headers.origin;   // web GitHub Pages + preview lokal (scripts/serve.mjs)
  if (o && (o === (env().WEB_ORIGIN || 'https://luc1ferr12.github.io') || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(o))) { res.setHeader('Access-Control-Allow-Origin', o); res.setHeader('Vary', 'Origin'); }
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Max-Age', '600');
}
const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
async function body(req, max = 20_000) {
  let s = '';
  for await (const c of req) { s += c; if (s.length > max) throw new Error('kebesaran'); }
  return s ? JSON.parse(s) : {};
}

// ---------- data yang nunggu keputusan Owner
const safe = (fn) => { try { return fn(); } catch { return []; } };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar' }).format(new Date());
const mediaOf = (c) => {
  let A = {};
  try { A = JSON.parse(c.asset_path ?? '{}') ?? {}; } catch { /* belum dirender */ }
  const files = [...(A.video ? [{ kind: 'video', path: A.video }] : []), ...(A.cover ? [{ kind: 'cover', path: A.cover }] : []), ...(A.feed ?? []).map((p) => ({ kind: 'image', path: p }))];
  return files.filter((f) => existsSync(join(ROOT, f.path)));
};
export async function pendingItems() {
  const d = await db();
  const contents = d.prepare("SELECT * FROM contents WHERE status = 'pending_approval' ORDER BY day, id").all()
    .filter((c) => Object.hasOwn(BRAND, c.channel ?? ''))
    .map((c) => ({
      id: c.id, channel: c.channel ?? '', brand: BRAND[c.channel ?? ''], day: c.day, slot: c.slot, format: c.format, title: c.title,
      caption: c.caption, hashtags: c.hashtags, sources: c.sources, revisions: c.revisions ?? 0, updated_at: c.updated_at,
      media: mediaOf(c).map(({ kind }, i) => ({ kind, i })),
    }));
  const plan = d.prepare("SELECT id, week_start, theme, goals FROM campaigns WHERE status = 'pending' ORDER BY week_start DESC LIMIT 1").get() ?? null;
  if (plan) plan.items = d.prepare("SELECT day, slot, format, game, pillar, title FROM contents WHERE campaign_id = ? ORDER BY day, id").all(plan.id);
  const ideas = d.prepare("SELECT id, agent_id, format, title, concept, slot FROM ideas WHERE day = ? AND status = 'proposed' ORDER BY format = 'video', id").all(today());
  // Zaa Clips (tabel dibikin clipper.mjs; belum pernah jalan = kosong)
  const clipCampaigns = safe(() => d.prepare("SELECT id, title, creator, rate, platforms, budget, min_views, brief, proposed_at FROM clip_campaigns WHERE status = 'proposed' ORDER BY score DESC").all()
    .map((c) => ({ ...c, brief: String(c.brief ?? '').split('\n').filter(Boolean).slice(0, 8).join('\n').slice(0, 700), url: `https://app.clippo.id/campaigns/${c.id}` })));
  const clips = safe(() => d.prepare("SELECT j.id, j.day, j.hook, j.caption, j.file, c.title ctitle FROM clip_jobs j JOIN clip_campaigns c ON c.id = j.campaign_id WHERE j.status = 'review' ORDER BY j.id").all()
    .map(({ file, ...j }) => ({ ...j, video: !!file && existsSync(join(ROOT, file)) })));
  return { contents, plan, ideas, clipCampaigns, clips, at: new Date().toISOString() };
}

// klik dobel / dua tab kebuka → keputusan kedua ditolak (antrean diproses watcher tiap 60 dtk, status DB belum berubah)
const recent = new Map();
const dupe = (key) => { const t = recent.get(key); if (t && Date.now() - t < 180_000) return true; recent.set(key, Date.now()); return false; };

export async function decide(x) {
  const action = String(x.action ?? ''), note = String(x.note ?? '').trim().slice(0, 1500);
  const d = await db();
  if (x.kind === 'content') {
    if (!['approve', 'reject', 'revision'].includes(action)) throw Object.assign(new Error('aksi nggak dikenal'), { code: 400 });
    if (action === 'revision' && !note) throw Object.assign(new Error('catatan revisi kosong'), { code: 400 });
    const c = d.prepare('SELECT id, channel, status FROM contents WHERE id = ?').get(+x.id);
    if (!c || !Object.hasOwn(BRAND, c.channel ?? '')) throw Object.assign(new Error(`konten #${x.id} nggak ada`), { code: 404 });
    if (c.status !== 'pending_approval') throw Object.assign(new Error(`#${c.id} udah nggak nunggu approval (status ${c.status})`), { code: 409 });
    if (dupe(`c${c.id}`)) throw Object.assign(new Error(`#${c.id} barusan udah diputusin`), { code: 409 });
    const brand = SHORTS[c.channel ?? ''];
    if (!brand) return { ok: true, text: webDecision(c.id, action, note) };
    const dir = join(ROOT, 'tmp', 'web-inbox', brand);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${Date.now()}-${c.id}.json`), JSON.stringify({ id: c.id, action, note, ts: new Date().toISOString() }));
    return { ok: true, text: `Diteruskan ke bot ${BRAND[c.channel]} (±5 dtk)` };
  }
  if (x.kind === 'plan') {
    if (!['plan_approve', 'plan_revision'].includes(action)) throw Object.assign(new Error('aksi nggak dikenal'), { code: 400 });
    if (action === 'plan_revision' && !note) throw Object.assign(new Error('catatan revisi kosong'), { code: 400 });
    const p = d.prepare('SELECT id, status FROM campaigns WHERE id = ?').get(+x.id);
    if (!p || p.status !== 'pending') throw Object.assign(new Error('plan ini udah nggak nunggu approval'), { code: 409 });
    if (dupe(`p${p.id}`)) throw Object.assign(new Error('plan barusan udah diputusin'), { code: 409 });
    return { ok: true, text: webDecision(p.id, action, note) };
  }
  if (x.kind === 'ideas') {
    const open = d.prepare("SELECT id FROM ideas WHERE day = ? AND status = 'proposed'").all(today()).map((r) => r.id);
    if (!open.length) throw Object.assign(new Error('nggak ada ide yang nunggu'), { code: 409 });
    if (dupe(`i${open.join('-')}`)) throw Object.assign(new Error('ide barusan udah diputusin'), { code: 409 });
    if (action === 'idea_skip') return { ok: true, text: webDecision(open[0], 'idea_skip') };
    const ids = (Array.isArray(x.ids) ? x.ids : []).map(Number).filter((id) => open.includes(id));
    if (action !== 'idea_approve' || !ids.length) { recent.delete(`i${open.join('-')}`); throw Object.assign(new Error('pilih minimal 1 ide'), { code: 400 }); }
    return { ok: true, text: webDecision(ids[0], 'idea_approve', ids.join(',')) };
  }
  if (x.kind === 'clip_campaign' || x.kind === 'clip') {
    if (!['ok', 'no'].includes(action)) throw Object.assign(new Error('aksi nggak dikenal'), { code: 400 });
    const row = x.kind === 'clip'
      ? safe(() => [d.prepare("SELECT id, status FROM clip_jobs WHERE id = ?").get(+x.id)])[0]
      : safe(() => [d.prepare("SELECT id, status, title FROM clip_campaigns WHERE id = ?").get(String(x.id))])[0];
    if (!row) throw Object.assign(new Error('nggak ketemu'), { code: 404 });
    if (row.status !== (x.kind === 'clip' ? 'review' : 'proposed')) throw Object.assign(new Error(`udah nggak nunggu approval (status ${row.status})`), { code: 409 });
    if (dupe(`${x.kind}${row.id}`)) throw Object.assign(new Error('barusan udah diputusin'), { code: 409 });
    const dir = join(ROOT, 'tmp', 'web-inbox', 'clips');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${Date.now()}-${String(row.id).replace(/[^\w-]/g, '')}.json`), JSON.stringify({ kind: x.kind === 'clip' ? 'clip' : 'campaign', id: row.id, action, ts: new Date().toISOString() }));
    const what = x.kind === 'clip' ? `clip #${row.id}` : `campaign "${row.title}"`;
    return { ok: true, text: `${action === 'ok' ? '✅' : '❌'} ${what} diteruskan ke bot Zaa Clips (±5 dtk)` };
  }
  throw Object.assign(new Error('jenis keputusan nggak dikenal'), { code: 400 });
}

// file media konten (cuma file dari asset_path konten yang lagi nunggu approval, path dikunci di dalam repo)
const TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp4': 'video/mp4' };
async function media(req, res, url) {
  const d = await db();
  let path = null;
  if (url.searchParams.has('clip')) { // video clip Zaa Clips yang lagi nunggu ✅
    const j = safe(() => [d.prepare("SELECT file, status FROM clip_jobs WHERE id = ?").get(+url.searchParams.get('clip'))])[0];
    path = j?.status === 'review' ? j.file : null;
  } else {
    const c = d.prepare("SELECT asset_path, status FROM contents WHERE id = ?").get(+url.searchParams.get('id'));
    if (c?.status === 'pending_approval') path = mediaOf(c)[+url.searchParams.get('i')]?.path ?? null;
  }
  const abs = path && resolve(ROOT, path);
  if (!abs || !existsSync(abs) || !abs.startsWith(resolve(ROOT) + sep) || !TYPES[extname(abs).toLowerCase()]) return json(res, 404, { error: 'nggak ada' });
  const size = statSync(abs).size;
  res.writeHead(200, { 'Content-Type': TYPES[extname(abs).toLowerCase()], 'Content-Length': size, 'Cache-Control': 'private, max-age=300' });
  createReadStream(abs).pipe(res);
}

async function route(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/ping') return json(res, 200, { ok: true });
  const ip = ipOf(req);
  if (blocked(ip)) return json(res, 429, { error: 'kebanyakan salah token, coba lagi 10 menit' });
  if (!authed(req)) { fail(ip); return json(res, 401, { error: 'token salah' }); }
  if (req.method === 'GET' && url.pathname === '/api/pending') return json(res, 200, await pendingItems());
  if (req.method === 'GET' && url.pathname === '/api/media') return media(req, res, url);
  if (req.method === 'POST' && url.pathname === '/api/decide') {
    const r = await decide(await body(req));
    (await db()).prepare('INSERT INTO activity (agent_id, message) VALUES (?, ?)').run('owner', `Keputusan dari web: ${r.text.replace(/^🌐 Dari web: /, '').split('\n')[0]}`);
    return json(res, 200, r);
  }
  json(res, 404, { error: 'nggak ada' });
}

// ---------- alamat publik (docs/data/api.json) — dibaca web buat tahu server approval di mana
async function publicUrl() {
  if (env().WEB_API_URL) return env().WEB_API_URL.replace(/\/$/, '');
  const r = await fetch(TUNNEL_METRICS, { signal: AbortSignal.timeout(3000) }).catch(() => null);
  const h = r?.ok ? (await r.json().catch(() => ({}))).hostname : null;
  return h ? `https://${h}` : null;
}
function writeApiJson(url) {
  let old = {};
  try { old = JSON.parse(readFileSync(API_JSON, 'utf8')); } catch { /* belum ada */ }
  if (old.url === url) return false;
  writeFileSync(API_JSON, `${JSON.stringify({ url, updated_at: new Date().toISOString() }, null, 2)}\n`);
  return true;
}

export function startWebApi(log = console.log, onUrlChange = () => {}) {
  if ((env().WEB_APPROVAL_TOKEN ?? '').length < 24) return log('web approval: WEB_APPROVAL_TOKEN belum diisi (min 24 karakter), dilewati');
  const port = +(env().WEB_API_PORT || 8790);
  createServer((req, res) => route(req, res).catch((e) => { if (!res.headersSent) json(res, e.code >= 400 && e.code < 500 ? e.code : 500, { error: e.message }); else res.end(); }))
    .on('error', (e) => log(`web approval: server gagal: ${e.message}`))
    .listen(port, '127.0.0.1', () => log(`web approval: jalan di 127.0.0.1:${port}`));
  const check = async () => {
    const url = await publicUrl();
    if (url && writeApiJson(url)) { log(`web approval: alamat publik ${url}`); onUrlChange(url); }
  };
  check();
  setInterval(check, 60_000);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [cmd] = process.argv.slice(2);
  if (cmd === 'serve') startWebApi();
  else if (cmd === 'pending') console.log(JSON.stringify(await pendingItems(), null, 2));
  else console.log('pakai: web-api.mjs serve | pending');
}
