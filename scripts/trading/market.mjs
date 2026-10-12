// Data harga XAUUSD: utama dari EA MT5 (dikirim lewat bridge), cadangan dari Yahoo Finance (GC=F, emas berjangka COMEX).
// Candle disimpan di trd_bars: { t (detik UTC, awal candle), o, h, l, c, v }.
import { all, run, db, kv, setKv as setKvLocal } from './store.mjs';

export const TF_SEC = { M15: 900, H1: 3600, H4: 14400, D1: 86400 };

export function saveBars(tf, rows, src) {
  const st = db.prepare('INSERT INTO trd_bars (tf, t, o, h, l, c, v, src) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(tf, t) DO UPDATE SET o=excluded.o, h=excluded.h, l=excluded.l, c=excluded.c, v=excluded.v, src=excluded.src');
  db.exec('BEGIN');
  try { for (const b of rows) if ([b.o, b.h, b.l, b.c].every(Number.isFinite)) st.run(tf, b.t, b.o, b.h, b.l, b.c, b.v ?? 0, src); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
}

// candle terakhir (urut lama → baru): EA kalau tersambung; kalau tidak, candle spot (dirakit dari harga gold-api)
// disambung riwayat Yahoo (emas berjangka) yang digeser ke level spot (selisih basis)
export function bars(tf, n = 400) {
  const q = (src) => all('SELECT t, o, h, l, c, v FROM trd_bars WHERE tf = ? AND src = ? ORDER BY t DESC LIMIT ?', tf, src, n).reverse();
  if (eaFresh()) { const ea = q('ea'); if (ea.length >= 50) return ea; }
  const spot = q('spot'), yh = q('yahoo');
  if (!spot.length) return yh;
  if (!yh.length) return spot;
  const sp = kv('spot', null), basis = sp && spotFresh() ? sp.price - (yh.at(-1)?.c ?? sp.price) : 0;
  const t0 = spot[0].t;
  const hist = (kv('spotBasis', null) != null ? yh.map((b) => shift(b, kv('spotBasis'))) : yh.map((b) => shift(b, basis))).filter((b) => b.t < t0);
  return [...hist, ...spot].slice(-n);
}
const shift = (b, d) => ({ ...b, o: b.o + d, h: b.h + d, l: b.l + d, c: b.c + d });
export const eaFresh = () => (Date.now() / 1000 - (kv('ea', {})?.at ?? 0)) < 180;
export const spotFresh = () => (Date.now() / 1000 - (kv('spot', {})?.at ?? 0)) < 300;

// harga spot XAU (gratis, tanpa key) → candle M15/H1/H4 sumber 'spot'
export async function tickSpot() {
  const r = await fetch('https://api.gold-api.com/price/XAU', { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`gold-api ${r.status}`);
  const j = await r.json();
  const price = +j.price, now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(price) || price <= 0) throw new Error('gold-api: harga kosong');
  // selisih futures→spot dikunci saat candle spot pertama dibuat (riwayat Yahoo nggak update lagi di VPS)
  if (kv('spotBasis', null) == null) {
    const yl = all("SELECT c FROM trd_bars WHERE tf = 'M15' AND src = 'yahoo' ORDER BY t DESC LIMIT 1")[0];
    if (yl) setKvLocal('spotBasis', +(price - yl.c).toFixed(2));
  }
  setKvLocal('spot', { price, at: now });
  for (const [tf, sec] of Object.entries(TF_SEC)) {
    if (tf === 'D1') continue;
    const t = Math.floor(now / sec) * sec;
    run(`INSERT INTO trd_bars (tf, t, o, h, l, c, v, src) VALUES (?, ?, ?, ?, ?, ?, 0, 'spot')
      ON CONFLICT(tf, t) DO UPDATE SET h = MAX(h, excluded.c), l = MIN(l, excluded.c), c = excluded.c, src = 'spot'`, tf, t, price, price, price, price);
  }
  return price;
}

// gabung candle kecil → besar (mis. H1 → H4)
export function resample(rows, sec) {
  const out = [];
  for (const b of rows) {
    const t = Math.floor(b.t / sec) * sec;
    const last = out[out.length - 1];
    if (last && last.t === t) { last.h = Math.max(last.h, b.h); last.l = Math.min(last.l, b.l); last.c = b.c; last.v += b.v ?? 0; }
    else out.push({ t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v ?? 0 });
  }
  return out;
}

// ---------------------------------------------------------------- Yahoo (tanpa API key)
async function yahoo(interval, range) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=${interval}&range=${range}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`yahoo ${interval} ${r.status}`);
  const j = await r.json();
  const res = j.chart?.result?.[0];
  if (!res?.timestamp) throw new Error('yahoo: data kosong');
  const q = res.indicators.quote[0];
  const rows = res.timestamp.map((t, i) => ({ t, o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i], v: q.volume[i] ?? 0 }))
    .filter((b) => [b.o, b.h, b.l, b.c].every((v) => v != null));
  return { rows, price: res.meta?.regularMarketPrice ?? rows.at(-1)?.c };
}
export async function refreshYahoo({ long = false } = {}) {
  const m15 = await yahoo('15m', long ? '60d' : '5d');
  saveBars('M15', m15.rows, 'yahoo');
  const h1 = await yahoo('60m', long ? '730d' : '1mo');
  saveBars('H1', h1.rows, 'yahoo');
  saveBars('H4', resample(h1.rows, TF_SEC.H4), 'yahoo');
  return { price: m15.price, m15: m15.rows.length, h1: h1.rows.length };
}

// harga terkini: bid/ask dari EA kalau segar, kalau tidak dari candle M15 terakhir (spread perkiraan)
export function quote() {
  const ea = kv('ea', null);
  if (ea && eaFresh() && ea.bid) return { bid: ea.bid, ask: ea.ask, spread: +(ea.ask - ea.bid).toFixed(2), src: 'ea' };
  const sp = kv('spot', null);
  if (sp && spotFresh()) return { bid: sp.price - 0.15, ask: sp.price + 0.15, spread: 0.3, src: 'spot' };
  const last = all("SELECT c FROM trd_bars WHERE tf = 'M15' AND src = 'yahoo' ORDER BY t DESC LIMIT 1")[0];
  if (!last) return null;
  return { bid: last.c - 0.15, ask: last.c + 0.15, spread: 0.3, src: 'yahoo' };
}

// jam pasar emas (UTC): Minggu 22:00 – Jumat 21:00, jeda harian 21:00–22:00
export function marketOpen(d = new Date()) {
  const day = d.getUTCDay(), h = d.getUTCHours() + d.getUTCMinutes() / 60;
  if (day === 6) return false;
  if (day === 0) return h >= 22;
  if (day === 5 && h >= 21) return false;
  return !(h >= 21 && h < 22);
}
