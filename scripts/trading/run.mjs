#!/usr/bin/env node
// Layanan tim Trading XAUUSD (24 jam, di VPS = service zataa-trading):
//  - bridge HTTP untuk EA MT5 (ZataaBridge.mq5): terima harga/akun/posisi, kirim instruksi order
//  - tiap candle M15 tutup → siklus agent (cycle.mjs); tiap 30 dtk cek SL/TP posisi paper
//  - 22:30 WITA laporan harian, Sabtu 08:00 WITA evaluasi + backtest mingguan (proposal perubahan → ACC Owner)
//   node scripts/trading/run.mjs            (jalan terus)
//   node scripts/trading/run.mjs --once     (satu siklus paksa, buat tes)
process.removeAllListeners('warning');
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { all, get, run, kv, setKv, kvAge, params, mode, ROOT } from './store.mjs';
import { saveBars, marketOpen, refreshYahoo, tickSpot, eaFresh, bars, resample, TF_SEC } from './market.mjs';
import { trend } from './strategy.mjs';
import { cycle, newsToday } from './cycle.mjs';
import { monitorPaper, closeTrade, onOpened, summary, report, setAgent, note, talk, sayAs, exportState } from './desk.mjs';
import { backtest, loadHistory, grid, score } from './backtest.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const stamp = () => new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Makassar' });
const log = (m) => console.log(`[${stamp()}] ${m}`);
const env = (() => {
  const f = join(ROOT, '.env'), o = {};
  if (existsSync(f)) for (const l of readFileSync(f, 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
  return { ...o, ...process.env };
})();
process.env.TRD_AI ??= env.TRD_AI ?? '';
process.env.CLAUDE_BIN ??= env.CLAUDE_BIN ?? '';

// ---------------------------------------------------------------- bridge EA MT5
const TOKEN = env.TRD_TOKEN || '';
const PORT = +(env.TRD_PORT || 8787);
const okToken = (h) => {
  if (!TOKEN) return false;
  const a = Buffer.from(String(h || '')), b = Buffer.from(TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
};
const body = (req) => new Promise((res, rej) => { let s = ''; req.on('data', (c) => { s += c; if (s.length > 4e6) req.destroy(); }); req.on('end', () => { try { res(JSON.parse(s || '{}')); } catch (e) { rej(e); } }); });
const send = (res, code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };

async function onSync(d) {
  const prev = kv('ea', {});
  setKv('ea', { login: d.login, server: d.server, demo: !!d.demo, balance: d.balance, equity: d.equity, bid: d.bid, ask: d.ask, positions: d.positions?.length ?? 0, at: Date.now() / 1000 });
  if (!prev.at) await report(`🔌 EA MT5 tersambung (${d.demo ? 'akun DEMO' : 'akun REAL'} ${esc(d.server)}). Mode sistem: <b>${mode()}</b>.`);
  for (const [tf, rows] of Object.entries(d.bars ?? {})) if (['M10', 'M15', 'M30', 'H1', 'H4'].includes(tf)) saveBars(tf, rows.map(([t, o, h, l, c, v]) => ({ t, o, h, l, c, v })), 'ea');
  // deal penutupan dari MT5 → tutup trade di catatan
  for (const x of d.deals ?? []) {
    if (x.entry !== 'out') continue;
    const t = get("SELECT * FROM trd_trades WHERE ticket = ? AND status = 'open'", String(x.position_id));
    if (t) await closeTrade(t, x.price, x.reason || 'EA', (x.profit ?? 0) + (x.commission ?? 0) + (x.swap ?? 0));
  }
  // perintah yang belum diambil EA (hanya mode demo/live; live wajib akun sesuai mode)
  const m = mode();
  if (m === 'paper') return [];
  if (m === 'demo' && !d.demo) { if (kvAge('alertMode') > 60) { setKv('alertMode', 1); await report('⛔ Mode <b>demo</b> tapi EA nyambung ke akun REAL. Order ditahan. Ganti akun demo atau ubah mode.'); } return []; }
  if (m === 'live' && !kv('liveConfirmed', false)) return [];
  const cmds = all("SELECT id, action, payload FROM trd_commands WHERE status = 'pending' ORDER BY id LIMIT 5");
  for (const c of cmds) run("UPDATE trd_commands SET status = 'sent', updated_at = datetime('now') WHERE id = ?", c.id);
  return cmds.map((c) => ({ id: c.id, action: c.action, ...JSON.parse(c.payload) }));
}
async function onAck(a) {
  const c = get('SELECT * FROM trd_commands WHERE id = ?', a.id);
  if (!c) return;
  run("UPDATE trd_commands SET status = ?, result = ?, updated_at = datetime('now') WHERE id = ?", a.ok ? 'done' : 'failed', JSON.stringify(a), a.id);
  if (c.action !== 'open' || !c.trade_id) return;
  if (a.ok) {
    run("UPDATE trd_trades SET status = 'open', ticket = ?, entry = COALESCE(?, entry), open_ts = datetime('now') WHERE id = ?", String(a.ticket), a.price ?? null, c.trade_id);
    await onOpened(get('SELECT * FROM trd_trades WHERE id = ?', c.trade_id));
  } else {
    run("UPDATE trd_trades SET status = 'failed', reason_close = ? WHERE id = ?", a.error ?? 'gagal', c.trade_id);
    setAgent('texec', 'done', 'Order gagal dieksekusi');
    await report(`⚠️ Order #${c.trade_id} gagal di MT5: ${esc(a.error ?? '?')}`);
  }
}
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch]);

function startBridge() {
  if (!TOKEN) { log('TRD_TOKEN belum diisi di .env → bridge EA mati (mode paper tetap jalan)'); return; }
  createServer(async (req, res) => {
    try {
      if (req.url === '/health') return send(res, 200, { ok: true, mode: mode() });
      if (!okToken(req.headers['x-token'])) return send(res, 401, { error: 'token' });
      if (req.method === 'POST' && req.url === '/ea/sync') return send(res, 200, { commands: await onSync(await body(req)), mode: mode() });
      if (req.method === 'POST' && req.url === '/ea/ack') { await onAck(await body(req)); return send(res, 200, { ok: true }); }
      send(res, 404, { error: 'not found' });
    } catch (e) { log(`bridge: ${e.message}`); send(res, 500, { error: 'server' }); }
  }).listen(PORT, () => log(`bridge EA siap di port ${PORT}`));
}

// ---------------------------------------------------------------- evaluasi mingguan (Jihan) → proposal perubahan parameter
export async function weeklyEvaluation() {
  setAgent('teval', 'working', 'Backtest & evaluasi mingguan');
  try { await refreshYahoo({ long: true }); } catch { /* pakai data yang ada */ }
  const { m15, h1 } = loadHistory();
  const cur = params();
  const strip = ({ list, ...s }) => s;
  const now = strip(backtest(m15, h1, cur));
  const rows = grid(cur).map((q) => ({ q, s: strip(backtest(m15, h1, q)) })).map((r) => ({ ...r, sc: score(r.s) })).sort((a, b) => b.sc - a.sc);
  const best = rows[0];
  setAgent('teval', 'done', 'Evaluasi mingguan beres');
  const fmt = (s) => `${s.trades} trade · WR ${s.winrate}% · PF ${s.profitFactor} · net ${s.netPct}% · DD ${s.maxDdPct}%`;
  let msg = `🧪 <b>Evaluasi mingguan</b> (backtest ${now.from} → ${now.to})\nSetelan sekarang: ${fmt(now)}`;
  if (best && best.sc > score(now) + 0.5 && best.s.trades >= 8) {
    const change = { rr: best.q.rr, slAtr: best.q.slAtr, pullbackAtr: best.q.pullbackAtr, minScore: best.q.minScore };
    const pr = run('INSERT INTO trd_proposals (params, stats, note) VALUES (?, ?, ?)', JSON.stringify(change), JSON.stringify(best.s), 'grid mingguan');
    const id = Number(pr.lastInsertRowid);
    msg += `\nUsulan #${id}: ${Object.entries(change).map(([k, v]) => `${k}=${v}`).join(', ')}\nHasil uji: ${fmt(best.s)}\nAryaputra siap pasang setelah forward test. Balas <b>trading terapkan ${id}</b> / <b>trading tolak ${id}</b>.`;
    talk('teval', 'trisk', `Ada usulan #${id} dari backtest, nunggu ACC Bos dulu ya`);
  } else msg += '\nBelum ada varian yang jelas lebih bagus. Setelan tetap.';
  note('teval', 'Evaluasi + backtest mingguan selesai');
  await sayAs('teval', msg);
}

// ---------------------------------------------------------------- arah per timeframe (Keira)
// dicek tiap candle tutup: M10 tiap 10 menit, M15 tiap 15, M30 tiap 30, H1 tiap 60. Cuma pantauan, bukan pemicu entry.
const TREND_TF = ['M10', 'M15', 'M30', 'H1'];
const closedBars = (tf) => {
  const sec = TF_SEC[tf], now = Date.now() / 1000;
  // M30 kalau riwayatnya belum cukup: rakit dari M15
  let b = bars(tf, 300);
  if (tf === 'M30' && b.length < 60) b = resample(bars('M15', 600), sec).slice(-300);
  return b.filter((x) => x.t + sec <= now);
};
function checkTrends() {
  const all = kv('tfTrend', {});
  let changed = false;
  for (const tf of TREND_TF) {
    const sec = TF_SEC[tf] * 1000, slot = Math.floor(Date.now() / sec);
    if (all[tf]?.slot === slot || Date.now() % sec < 40000) continue;
    const r = { ...trend(closedBars(tf)), slot, at: Date.now() };
    const prev = all[tf]?.bias;
    if (prev && r.bias && prev !== r.bias) note('ttech', `${tf === 'H1' ? 'M60' : tf} berubah arah: ${prev} → ${r.bias}`);
    all[tf] = r;
    changed = true;
  }
  if (changed) { setKv('tfTrend', all); exportState(); }
}

// ---------------------------------------------------------------- jadwal
const wita = () => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Makassar', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
let busy = false;
async function tick() {
  if (busy) return;
  busy = true;
  try {
    if (!eaFresh()) { try { await tickSpot(); } catch (e) { if (kvAge('spotErr') > 30) { setKv('spotErr', 1); log(`harga spot: ${e.message}`); } } }
    await monitorPaper();
    if (marketOpen()) checkTrends();
    const w = wita(), hm = `${w.hour}:${w.minute}`, slot = Math.floor(Date.now() / 900000);
    // siklus tiap candle M15 tutup (+40 dtk biar candle sudah final)
    if (kv('lastSlot', 0) !== slot && (Date.now() % 900000) > 40000) {
      setKv('lastSlot', slot);
      if (marketOpen()) { const r = await cycle({ log }); log(`siklus: ${r.decision ?? r.skip} ${r.reason ?? ''}`); }
    }
    const once = async (key, fn) => { if (kv(key) !== new Date().toISOString().slice(0, 10)) { setKv(key, new Date().toISOString().slice(0, 10)); await fn(); } };
    if (hm === '07:10' && !['Sat', 'Sun'].includes(w.weekday)) await once('morningDone', async () => {
      const n = newsToday();
      await sayAs('tresearch', `☀️ Pagi Bos. Mode trading: <b>${mode()}</b>.${n ? `\nBerita USD penting hari ini:\n${n}` : '\nHari ini nggak ada rilis USD berdampak tinggi.'}`);
    });
    if (hm === '22:30' && !['Sat', 'Sun'].includes(w.weekday)) await once('dailyDone', () => summary(1));
    if (hm === '08:00' && w.weekday === 'Sat') await once('weeklyDone', async () => { await summary(7); await weeklyEvaluation(); });
  } catch (e) { log(`tick: ${e.stack || e.message}`); }
  busy = false;
}

if (process.argv.includes('--once')) {
  console.log(await cycle({ force: true, log }));
  process.exit(0);
} else if (process.argv[1]?.endsWith('run.mjs')) {
  log(`tim Trading XAUUSD mulai · mode ${mode()}`);
  startBridge();
  tick();
  setInterval(tick, 30_000);
}
