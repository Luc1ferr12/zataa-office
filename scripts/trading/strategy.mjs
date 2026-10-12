// Inti strategi XAUUSD (fungsi murni → dipakai siklus live & backtest):
//   Keira  technical(): bias multi-timeframe (H4, H1, struktur), area potensial entry, pemicu di M15
//   Aryaputra decide(): gabung fundamental + teknikal → BUY / SELL / NO TRADE, hitung entry, SL, TP, lot, RR, tolak kalau risiko lewat batas
import { ema, rsi, atr, structure, levels, engulf, swings, last } from './ta.mjs';

// arah per timeframe (M10/M15/M30/H1): harga vs EMA20, EMA20 vs EMA50, struktur swing → skor −3…+3
export const TREND_MIN_BARS = 60;
export function trend(b) {
  if (b.length < TREND_MIN_BARS) return { bias: null, n: b.length, note: `ngumpulin data (${b.length}/${TREND_MIN_BARS} candle)` };
  const c = b.map((x) => x.c), e20 = last(ema(c, 20)), e50 = last(ema(c, 50)), price = last(c);
  const score = Math.sign(price - e20) + Math.sign(e20 - e50) + structure(b, 2);
  const bias = score >= 2 ? 'bullish' : score <= -2 ? 'bearish' : 'sideways';
  return { bias, score, price: +price.toFixed(2), ema20: +e20.toFixed(2), ema50: +e50.toFixed(2), rsi: +last(rsi(c, 14)).toFixed(1), n: b.length };
}

export function technical(m15, h1, h4, p) {
  if (m15.length < 60 || h1.length < p.emaSlow + 5 || h4.length < p.emaFast + 5) return { bias: 'sideways', score: 0, ok: false, note: 'data candle belum cukup' };
  const c15 = m15.map((b) => b.c), c1 = h1.map((b) => b.c), c4 = h4.map((b) => b.c);
  const e4 = last(ema(c4, p.emaFast)), e1f = ema(c1, p.emaFast), e1s = ema(c1, p.emaSlow);
  const a15 = last(atr(m15)), a1 = last(atr(h1));
  const price = last(c15);
  const st = structure(h1, 3);
  const score = Math.sign(last(c4) - e4) + Math.sign(last(e1f) - last(e1s)) + st;
  const need = p.minScore ?? 2;
  const bias = score >= need ? 'bullish' : score <= -need ? 'bearish' : 'sideways';
  // area: EMA50 H1 + level S/R H1 terdekat
  const lv = levels(h1.slice(-240), a1 * 0.35).filter((l) => l.n >= 2);
  const below = lv.filter((l) => l.p <= price).sort((x, y) => y.p - x.p)[0];
  const above = lv.filter((l) => l.p >= price).sort((x, y) => x.p - y.p)[0];
  const ema50 = last(e1f);
  const nearSupport = Math.min(Math.abs(price - ema50), below ? price - below.p : Infinity) <= p.pullbackAtr * a1;
  const nearResist = Math.min(Math.abs(price - ema50), above ? above.p - price : Infinity) <= p.pullbackAtr * a1;
  // pemicu M15 (candle terakhir yang sudah tutup): RSI balik dari area 40/60 atau engulfing
  const r = rsi(c15, 14), r0 = r[r.length - 1], r1 = r[r.length - 2], r2 = r[r.length - 3];
  const eng = engulf(m15);
  const trigBuy = (r1 < 42 || r2 < 42) && r0 > r1 && r0 > 40 || eng === 1;
  const trigSell = (r1 > 58 || r2 > 58) && r0 < r1 && r0 < 60 || eng === -1;
  const e20 = last(ema(c15, 20));
  const trigger = bias === 'bullish' && nearSupport && trigBuy && price > e20 ? 'buy'
    : bias === 'bearish' && nearResist && trigSell && price < e20 ? 'sell' : null;
  const { hi, lo } = swings(m15.slice(-40), 2);
  return {
    ok: true, bias, score, trigger, price, atrM15: a15, atrH1: a1, ema50H1: +ema50.toFixed(2), rsiM15: +r0.toFixed(1),
    support: below?.p ?? null, resistance: above?.p ?? null, swingLow: lo.at(-1)?.p ?? null, swingHigh: hi.at(-1)?.p ?? null,
    note: `${bias} (skor ${score}) · harga ${price.toFixed(2)} · EMA50 H1 ${ema50.toFixed(2)} · RSI M15 ${r0.toFixed(0)}${trigger ? ` · pemicu ${trigger.toUpperCase()}` : ''}`,
  };
}

// ctx: { equity, open (posisi terbuka), dayPnl, consecLoss, spread, quote: {bid, ask}, fund: {bias, blackout, note}, now: Date }
export function decide(tech, ctx, p) {
  const no = (reason) => ({ decision: 'NO TRADE', reason });
  if (!tech.ok) return no(tech.note);
  const h = ctx.now.getUTCHours();
  if (h < p.sessionUTC[0] || h >= p.sessionUTC[1]) return no('di luar jam sesi London–New York');
  if (ctx.fund?.blackout) return no(`berita berdampak tinggi: ${ctx.fund.blackout}`);
  if (ctx.open >= p.maxPositions) return no('masih ada posisi terbuka');
  if (ctx.dayPnl <= -ctx.equity * p.dailyLossPct / 100) return no(`batas rugi harian ${p.dailyLossPct}% tercapai`);
  if (ctx.consecLoss >= p.maxConsecLoss) return no(`${ctx.consecLoss}× kalah beruntun, istirahat sampai besok`);
  if (ctx.spread > p.maxSpread) return no(`spread ${ctx.spread} kelebaran`);
  if (tech.bias === 'sideways') return no('market sideways, tunggu arah jelas');
  if (!tech.trigger) return no(`${tech.bias}, tapi belum ada pemicu entry di area`);
  const side = tech.trigger;
  if (ctx.fund?.bias && Math.sign(ctx.fund.bias) === (side === 'buy' ? -1 : 1)) return no(`fundamental berlawanan (${ctx.fund.note ?? ''})`);
  const entry = side === 'buy' ? ctx.quote.ask : ctx.quote.bid;
  const swing = side === 'buy' ? tech.swingLow : tech.swingHigh;
  let dist = Math.max(p.slAtr * tech.atrM15, swing ? Math.abs(entry - swing) + 0.2 * tech.atrM15 : 0);
  dist = Math.min(Math.max(dist, p.minSl), p.maxSl);
  const sl = side === 'buy' ? entry - dist : entry + dist;
  const tp = side === 'buy' ? entry + dist * p.rr : entry - dist * p.rr;
  // target jangan menabrak level lawan terdekat
  const wall = side === 'buy' ? tech.resistance : tech.support;
  if (wall && Math.abs(wall - entry) < dist * 1.2 && Math.abs(wall - entry) > 0.01) return no(`${side === 'buy' ? 'resistance' : 'support'} ${wall} terlalu dekat buat target`);
  const riskUsd = ctx.equity * p.riskPct / 100;
  const lot = Math.min(p.maxLot, Math.floor(riskUsd / (dist * p.contract) / p.lotStep) * p.lotStep);
  if (lot < p.minLot) return no(`lot minimum terlalu besar untuk risiko ${p.riskPct}% (SL ${dist.toFixed(2)})`);
  const r2 = (v) => +v.toFixed(2);
  return {
    decision: side.toUpperCase(), side, entry: r2(entry), sl: r2(sl), tp: r2(tp), lot: +lot.toFixed(2), rr: p.rr,
    risk: r2(lot * dist * p.contract),
    reason: `${tech.bias} H4/H1, pullback ke area, pemicu M15 · SL ${dist.toFixed(2)} (ATR ${tech.atrM15.toFixed(2)}) · RR 1:${p.rr}${ctx.fund?.note ? ` · fundamental: ${ctx.fund.note}` : ''}`,
  };
}
