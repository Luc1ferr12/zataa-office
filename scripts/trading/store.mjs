// Penyimpanan tim Trading (XAUUSD) di db/office.db — satu database dengan kantor, tabel berawalan trd_.
process.removeAllListeners('warning');
const { DatabaseSync } = await import('node:sqlite');
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAT_SQL } from '../chatter.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const db = new DatabaseSync(join(ROOT, 'db', 'office.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA busy_timeout = 5000');
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
  rr: 2.0,               // target reward : risk
  slAtr: 2.0,            // jarak SL minimal = slAtr × ATR(M15)
  minSl: 5, maxSl: 35,   // batas jarak SL (USD) — emas ±4000an, ATR H1 ±10
  minScore: 2,           // kekuatan tren minimal (2 dari 3: H4, EMA H1, struktur)
  emaFast: 50, emaSlow: 200,
  pullbackAtr: 1.2,      // harga harus dekat area (EMA50 H1 / support-resistance), dalam ×ATR(H1)
  maxPositions: 1,
  dailyLossPct: 3,       // berhenti hari ini kalau rugi ≥ ini
  maxConsecLoss: 3,      // berhenti hari ini setelah kalah beruntun segini
  maxSpread: 0.8,        // USD
  sessionUTC: [6, 20],   // jam trading (UTC): London + New York
  newsBlackoutMin: 45,   // tidak entry ±menit dari rilis berita USD berdampak tinggi
  maxLot: 1.0, minLot: 0.01, lotStep: 0.01, contract: 100,   // 1 lot XAU = 100 oz
  ddAlertPct: 5,         // peringatan drawdown dari puncak ekuitas
};
export const params = () => ({ ...DEFAULT_PARAMS, ...kv('params', {}) });
// mode: paper (simulasi di server, harga asli) | demo (EA MT5 akun demo) | live (akun asli — hanya kalau Owner aktifkan)
export const mode = () => kv('mode', 'paper');
export const paused = () => !!kv('paused', false);
