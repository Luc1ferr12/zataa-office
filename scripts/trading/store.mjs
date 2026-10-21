// Penyimpanan tim Trading (XAUUSD) di db/office.db — satu database dengan kantor, tabel berawalan trd_.
process.removeAllListeners('warning');
import { openDb } from '../db.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAT_SQL } from '../chatter.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const db = openDb();
db.exec('PRAGMA journal_mode = WAL');
db.exec(CHAT_SQL);
db.exec(`
CREATE TABLE IF NOT EXISTS trd_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS trd_bars (tf TEXT NOT NULL, t INTEGER NOT NULL, o REAL, h REAL, l REAL, c REAL, v REAL, src TEXT, PRIMARY KEY (tf, t));
CREATE TABLE IF NOT EXISTS trd_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (datetime('now')), price REAL,
  fund TEXT, tech TEXT, decision TEXT NOT NULL, side TEXT, entry REAL, sl REAL, tp REAL, lot REAL, rr REAL, risk_usd REAL, reason TEXT);
CREATE TABLE IF NOT EXISTS trd_trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT, signal_id INTEGER, mode TEXT NOT NULL, side TEXT NOT NULL, lot REAL NOT NULL,
  entry REAL, sl REAL, tp REAL, open_ts TEXT, close_ts TEXT, exit REAL, pnl REAL, r REAL, ticket TEXT,
  status TEXT NOT NULL DEFAULT 'pending', reason_open TEXT, reason_close TEXT, eval TEXT);
CREATE TABLE IF NOT EXISTS trd_commands (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (datetime('now')), trade_id INTEGER, action TEXT NOT NULL,
  payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', result TEXT, updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS trd_proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (datetime('now')), params TEXT NOT NULL, stats TEXT, note TEXT,
  status TEXT NOT NULL DEFAULT 'proposed');
CREATE TABLE IF NOT EXISTS trd_equity (ts TEXT PRIMARY KEY, mode TEXT, balance REAL, equity REAL);
`);
// pegawai baru di tabel agents (dashboard & obrolan)
const ins = db.prepare('INSERT OR IGNORE INTO agents (id, name, title) VALUES (?, ?, ?)');
for (const [id, name, title] of [
  ['tdir', 'Mahendra', 'Trading Director'], ['tresearch', 'Davina', 'Research & Fundamental'], ['ttech', 'Keira', 'Technical Analysis'],
  ['trisk', 'Aryaputra', 'Decision & Risk · MQL Developer'], ['texec', 'Wiratama', 'Execution'], ['teval', 'Jihan', 'Evaluation & Optimization'],
  ['treport', 'Selena', 'Reporting'],
]) { try { ins.run(id, name, title); } catch { /* tabel agents belum ada (db belum init) */ } }

export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const get = (sql, ...p) => db.prepare(sql).get(...p);
export const run = (sql, ...p) => db.prepare(sql).run(...p);

// ---------------------------------------------------------------- key/value (setelan, status akun, bias fundamental…)
export function kv(key, fallback = null) {
  const r = get('SELECT value FROM trd_kv WHERE key = ?', key);
  if (!r) return fallback;
  try { return JSON.parse(r.value); } catch { return r.value; }
}
export function setKv(key, value) {
  run("INSERT INTO trd_kv (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", key, JSON.stringify(value));
}
export const kvAge = (key) => {
  const r = get("SELECT (julianday('now') - julianday(updated_at)) * 1440 AS m FROM trd_kv WHERE key = ?", key);
  return r ? r.m : Infinity;   // menit sejak terakhir diubah
};

// ---------------------------------------------------------------- setelan strategi & risiko (bisa diubah lewat proposal yang di-ACC Owner)
export const DEFAULT_PARAMS = {
  riskPct: 1.0,          // risiko per trade (% ekuitas)
  // strategi M15 (17 Okt 2026): pantulan Bollinger Band + konfirmasi RSI / Stokastik / MACD / divergensi
  bbLen: 20, bbDev: 2.2, // Bollinger Band M15 (2,2 deviasi: sentuhan lebih ekstrem, pantulan lebih bersih di backtest)
  bbLookback: 3,         // harga nyentuh band di salah satu dari N candle terakhir
  rsiLo: 35,             // RSI ≤ 35 (BUY) / ≥ 65 (SELL) di area sentuhan
  stochLo: 20,           // Stokastik %K ≤ 20 / ≥ 80 lalu nyilang %D
  minConfAsia: 2,        // konfirmasi minimal di sesi Asia (dari RSI, Stokastik, MACD, divergensi)
  minConfSafe: 3,        // di luar Asia (cari aman) + wajib searah tren H1
  safeRiskMul: 0.5,      // risiko di luar Asia = riskPct × ini
  slBufAtr: 0.6,         // SL = ujung sentuhan band + buffer × ATR(M15)
  minRr: 1.2, maxRr: 2.0,   // TP ke tengah band; RR di bawah minRr = NO TRADE, di atas maxRr dipotong
  spikeAtr: 3,           // candle M15 > 3× ATR = spike (berita dadakan) → NO TRADE
  bbExpand: 1.8,         // lebar band > 1,8× rata-rata 50 candle = breakout → jangan lawan
  minSl: 3, maxSl: 35,   // batas jarak SL (USD)
  emaFast: 50, emaSlow: 200,   // konteks tren H1
  maxPositions: 1,
  dailyLossPct: 3,       // berhenti hari ini kalau rugi ≥ ini
  maxConsecLoss: 3,      // berhenti hari ini setelah kalah beruntun segini
  maxSpread: 0.8,        // USD
  // sesi (UTC, sengaja tetap biar backtest & live konsisten): Asia 00–07 = 08:00–15:00 WITA (aktif),
  // libur 20–24 = 04:00–08:00 WITA (rollover, spread lebar), sisanya London–NY = mode aman
  asiaUTC: [0, 7], offUTC: [20, 24],
  newsBlackoutMin: 45,   // berita USD High: nggak entry 60 mnt sebelum s.d. 45 mnt sesudah rilis
  newsBeforeMin: 60,
  newsMajorBeforeMin: 120, newsMajorAfterMin: 90,   // FOMC / NFP / CPI / Powell: jauh lebih lama
  newsMediumMin: 20,     // berita Medium penting: ±20 mnt
  maxLot: 1.0, minLot: 0.01, lotStep: 0.01, contract: 100,   // 1 lot XAU = 100 oz
  ddAlertPct: 5,         // peringatan drawdown dari puncak ekuitas
};
export const params = () => ({ ...DEFAULT_PARAMS, ...kv('params', {}) });

// mata uang akun. Paper disamakan dengan akun real Owner (akun cent: USC, 1 USC = $0,01).
// Rumus P/L tetap gerak harga × lot × 100, di akun cent hasilnya otomatis dalam USC.
export const currency = () => kv('currency', 'USD');
export function money(v, sign = false) {
  const s = sign ? (v >= 0 ? '+' : '−') : v < 0 ? '−' : '', a = Math.abs(v ?? 0);
  return currency() === 'USC' ? `${s}${a.toLocaleString('id-ID', { maximumFractionDigits: 2 })} USC` : `${s}$${a.toFixed(2)}`;
}
// kurs USD→IDR (gratis, tanpa key); disimpan biar dashboard & laporan bisa nampilin rupiah
export async function usdIdr() {
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(15000) });
    const v = (await r.json())?.rates?.IDR;
    if (v > 1000) { setKv('usdIdr', v); return v; }
  } catch { /* pakai simpanan */ }
  return kv('usdIdr', 16500);
}
// nilai saldo dalam rupiah
export const toIdr = (v, rate = kv('usdIdr', 16500)) => (currency() === 'USC' ? v / 100 : v) * rate;
// mode: paper (simulasi di server, harga asli) | demo (EA MT5 akun demo) | live (akun asli — hanya kalau Owner aktifkan)
export const mode = () => kv('mode', 'paper');
export const paused = () => !!kv('paused', false);
