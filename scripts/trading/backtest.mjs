// Jihan (Evaluation & Optimization): backtest strategi di data historis (M15 + H1), bandingkan varian parameter.
//   node scripts/trading/backtest.mjs            → backtest parameter sekarang
//   node scripts/trading/backtest.mjs --grid     → cari varian lebih baik (hasil masuk proposal, butuh ACC Owner)
import { technical, decide } from './strategy.mjs';
import { resample, TF_SEC } from './market.mjs';
import { all, params } from './store.mjs';

// simulasi bar demi bar: sinyal di penutupan M15, isi di harga close + spread, keluar saat SL/TP tersentuh (SL duluan kalau dua-duanya)
export function backtest(m15, h1, p, { spread = 0.3, equity0 = 10000, fund = null } = {}) {
  let equity = equity0, peak = equity0, maxDd = 0, pos = null, consec = 0, dayKey = '', dayPnl = 0;
  const trades = [];
  let j = 0;
  for (let i = 60; i < m15.length; i++) {
    const b = m15[i];
    if (pos) {
      const hitSl = pos.side === 'buy' ? b.l <= pos.sl : b.h >= pos.sl;
      const hitTp = pos.side === 'buy' ? b.h >= pos.tp : b.l <= pos.tp;
      if (hitSl || hitTp) {
        const exit = hitSl ? pos.sl : pos.tp;
        const pnl = (pos.side === 'buy' ? exit - pos.entry : pos.entry - exit) * pos.lot * p.contract;
        equity += pnl; dayPnl += pnl;
        trades.push({ ...pos, exit, pnl, r: pnl / pos.risk, closeT: b.t });
        consec = pnl < 0 ? consec + 1 : 0;
        peak = Math.max(peak, equity); maxDd = Math.max(maxDd, (peak - equity) / peak);
        pos = null;
      }
      continue;
    }
    const d = new Date((b.t + TF_SEC.M15) * 1000);
    const dk = d.toISOString().slice(0, 10);
    if (dk !== dayKey) { dayKey = dk; dayPnl = 0; consec = 0; }
    while (j < h1.length && h1[j].t + TF_SEC.H1 <= b.t + TF_SEC.M15) j++;
    const H1 = h1.slice(Math.max(0, j - 400), j);
    if (H1.length < p.emaSlow + 5) continue;
    const H4 = resample(H1, TF_SEC.H4);
    const tech = technical(m15.slice(i - 59, i + 1), H1, H4, p);
    const q = { bid: b.c - spread / 2, ask: b.c + spread / 2 };
    const dec = decide(tech, { equity, open: 0, dayPnl, consecLoss: consec, spread, quote: q, fund, now: d }, p);
    if (dec.decision === 'NO TRADE') continue;
    pos = { side: dec.side, entry: dec.entry, sl: dec.sl, tp: dec.tp, lot: dec.lot, risk: dec.risk, openT: b.t };
  }
  const wins = trades.filter((t) => t.pnl > 0);
  const gw = wins.reduce((s, t) => s + t.pnl, 0), gl = -trades.filter((t) => t.pnl <= 0).reduce((s, t) => s + t.pnl, 0);
  return {
    trades: trades.length, winrate: trades.length ? +(wins.length / trades.length * 100).toFixed(1) : 0,
    profitFactor: gl ? +(gw / gl).toFixed(2) : gw ? 99 : 0, netPct: +((equity - equity0) / equity0 * 100).toFixed(2),
    maxDdPct: +(maxDd * 100).toFixed(2), avgR: trades.length ? +(trades.reduce((s, t) => s + t.r, 0) / trades.length).toFixed(2) : 0,
    from: m15[0] ? new Date(m15[0].t * 1000).toISOString().slice(0, 10) : null, to: m15.at(-1) ? new Date(m15.at(-1).t * 1000).toISOString().slice(0, 10) : null,
    list: trades,
  };
}

export function loadHistory(src = 'yahoo') {
  const m15 = all("SELECT t, o, h, l, c, v FROM trd_bars WHERE tf = 'M15' AND src = ? ORDER BY t", src);
  const h1 = all("SELECT t, o, h, l, c, v FROM trd_bars WHERE tf = 'H1' AND src = ? ORDER BY t", src);
  return { m15, h1 };
}

// varian parameter yang dicoba (kecil, biar cepat): RR, jarak SL, area pullback
export function grid(base) {
  const out = [];
  for (const rr of [1.5, 2, 2.5]) for (const slAtr of [1.5, 2, 2.5]) for (const pullbackAtr of [0.7, 1.2]) for (const minScore of [2, 3]) out.push({ ...base, rr, slAtr, pullbackAtr, minScore });
  return out;
}
export const score = (s) => (s.trades < 8 ? -99 : s.profitFactor * 2 + s.netPct / 5 - s.maxDdPct / 2);

if (process.argv[1]?.endsWith('backtest.mjs')) {
  const { m15, h1 } = loadHistory();
  const p = params();
  const base = backtest(m15, h1, p);
  const { list, ...b } = base;
  console.log('sekarang', JSON.stringify(b));
  if (process.argv.includes('--grid')) {
    const rows = grid(p).map((q) => { const { list: _, ...s } = backtest(m15, h1, q); return { q: { rr: q.rr, slAtr: q.slAtr, pullbackAtr: q.pullbackAtr, minScore: q.minScore }, s, sc: score(s) }; }).sort((a, b) => b.sc - a.sc);
    for (const r of rows.slice(0, 5)) console.log(JSON.stringify(r));
  }
}
