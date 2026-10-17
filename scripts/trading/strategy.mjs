// Inti strategi XAUUSD (fungsi murni → dipakai siklus live & backtest). Fokus M15, arahan Owner 17 Okt 2026:
//   Keira  technical(): reaksi RSI, MACD & Stokastik saat harga nyentuh Bollinger Band M15 (pantulan balik ke tengah band),
//          H1 cuma konteks (jangan lawan tren besar di luar jam Asia)
//   Aryaputra decide(): sesi (Asia = aktif, London–NY = cari aman, 04–08 WITA = libur) + berita + risiko → BUY / SELL / NO TRADE
import { ema, rsi, atr, structure, bollinger, macd, stoch, last } from './ta.mjs';

// arah per timeframe (M10/M15/M30/H1): harga vs EMA20, EMA20 vs EMA50, struktur swing → skor −3…+3
export const TREND_MIN_BARS = 60;
export function trend(b) {
  if (b.length < TREND_MIN_BARS) return { bias: null, n: b.length, note: `ngumpulin data (${b.length}/${TREND_MIN_BARS} candle)` };
  const c = b.map((x) => x.c), e20 = last(ema(c, 20)), e50 = last(ema(c, 50)), price = last(c);
  const score = Math.sign(price - e20) + Math.sign(e20 - e50) + structure(b, 2);
  const bias = score >= 2 ? 'bullish' : score <= -2 ? 'bearish' : 'sideways';
  return { bias, score, price: +price.toFixed(2), ema20: +e20.toFixed(2), ema50: +e50.toFixed(2), rsi: +last(rsi(c, 14)).toFixed(1), n: b.length };
}

export const M15_MIN_BARS = 120;
export function technical(m15, h1, p) {
  if (m15.length < M15_MIN_BARS || h1.length < p.emaSlow + 5) return { bias: 'sideways', score: 0, ok: false, note: 'data candle belum cukup' };
  const n = m15.length - 1, c = m15.map((b) => b.c), price = c[n];
  const bb = bollinger(c, p.bbLen, p.bbDev), r = rsi(c, 14), md = macd(c), st = stoch(m15), a = atr(m15);
  // konteks H1: harga vs EMA50, EMA50 vs EMA200, struktur swing → −3…+3
  const c1 = h1.map((b) => b.c), e1f = last(ema(c1, p.emaFast)), e1s = last(ema(c1, p.emaSlow));
  const h1Score = Math.sign(last(c1) - e1f) + Math.sign(e1f - e1s) + structure(h1, 3);
  const bias = h1Score >= 2 ? 'bullish' : h1Score <= -2 ? 'bearish' : 'sideways';
  const L = p.bbLookback, win = [...Array(L).keys()].map((k) => n - k);   // candle terakhir yang sudah tutup + L−1 sebelumnya
  const width = (i) => (bb.up[i] - bb.lo[i]) / bb.mid[i];
  const avgWidth = [...Array(50).keys()].reduce((s, k) => s + width(n - k), 0) / 50;
  // bahaya: candle spike (biasanya berita dadakan) atau band melebar kencang (breakout, bukan pantulan)
  const spike = [n, n - 1].some((i) => m15[i].h - m15[i].l > p.spikeAtr * a[i - 1]);
  const expanding = width(n) > p.bbExpand * avgWidth;
  const side = (dir) => {   // dir +1 = BUY dari band bawah, −1 = SELL dari band atas
    const band = dir > 0 ? bb.lo : bb.up;
    const touched = win.filter((i) => (dir > 0 ? m15[i].l <= band[i] : m15[i].h >= band[i]));
    if (!touched.length) return null;
    const outside = [...Array(6).keys()].filter((k) => (dir > 0 ? c[n - k] < bb.lo[n - k] : c[n - k] > bb.up[n - k])).length;
    const back = dir > 0 ? price > bb.lo[n] && price > m15[n].o : price < bb.up[n] && price < m15[n].o;   // close balik ke dalam band + candle searah
    const why = [];
    // RSI: sempat jenuh di area sentuhan lalu berbalik
    const rx = dir > 0 ? Math.min(...win.map((i) => r[i])) : Math.max(...win.map((i) => r[i]));
    if ((dir > 0 ? rx <= p.rsiLo : rx >= 100 - p.rsiLo) && (dir > 0 ? r[n] > r[n - 1] : r[n] < r[n - 1])) why.push('RSI');
    // Stokastik: %K sempat di bawah 20 / atas 80 lalu nyilang %D searah
    const kx = dir > 0 ? Math.min(...win.map((i) => st.k[i])) : Math.max(...win.map((i) => st.k[i]));
    const cross = [n, n - 1].some((i) => (dir > 0 ? st.k[i] > st.d[i] && st.k[i - 1] <= st.d[i - 1] : st.k[i] < st.d[i] && st.k[i - 1] >= st.d[i - 1]));
    if ((dir > 0 ? kx <= p.stochLo : kx >= 100 - p.stochLo) && cross && (dir > 0 ? st.k[n] > st.d[n] : st.k[n] < st.d[n])) why.push('Stokastik');
    // MACD: histogram berbalik arah (momentum lawan mulai habis)
    const h0 = md.hist[n], h1x = md.hist[n - 1];
    if (dir > 0 ? h0 > h1x && Math.min(...win.map((i) => md.hist[i])) < 0 : h0 < h1x && Math.max(...win.map((i) => md.hist[i])) > 0) why.push('MACD');
    // divergensi RSI: harga bikin ekstrem baru di band tapi RSI nggak
    const ext = (i) => (dir > 0 ? m15[i].l : m15[i].h), better = (x, y) => (dir > 0 ? x < y : x > y);
    const cur = touched.reduce((b, i) => (better(ext(i), ext(b)) ? i : b), touched[0]);
    let prev = null;
    for (let i = n - 30; i < n - L; i++) if (prev === null || better(ext(i), ext(prev))) prev = i;
    if (prev !== null && better(ext(cur), ext(prev)) && (dir > 0 ? r[cur] > r[prev] + 2 : r[cur] < r[prev] - 2)) why.push('divergensi');
    return { dir, back, walk: outside >= 3, why, extreme: ext(cur) };
  };
  const cand = [side(1), side(-1)].filter((x) => x && x.back && !x.walk).sort((x, y) => y.why.length - x.why.length)[0] ?? null;
  const setup = cand ? (cand.dir > 0 ? 'buy' : 'sell') : null;
  const f2 = (v) => +v.toFixed(2);
  const pos = price > bb.up[n] ? 'di atas band atas' : price < bb.lo[n] ? 'di bawah band bawah' : price > bb.mid[n] ? 'di atas tengah band' : 'di bawah tengah band';
  return {
    ok: true, bias, score: cand ? cand.why.length : 0, h1Score, trigger: setup, confirm: cand?.why ?? [], extreme: cand?.extreme ?? null,
    spike, expanding, price, atrM15: a[n], bbMid: f2(bb.mid[n]), bbUp: f2(bb.up[n]), bbLo: f2(bb.lo[n]),
    rsiM15: +r[n].toFixed(1), stochK: +st.k[n].toFixed(0), macdHist: +md.hist[n].toFixed(2),
    note: `M15 ${price.toFixed(2)} ${pos} (${bb.lo[n].toFixed(1)}–${bb.up[n].toFixed(1)}) · RSI ${r[n].toFixed(0)} · Stoch ${st.k[n].toFixed(0)} · MACD ${md.hist[n] >= 0 ? '+' : ''}${md.hist[n].toFixed(2)} · H1 ${bias}`
      + (setup ? ` · setup ${setup.toUpperCase()} (${cand.why.join('+') || 'tanpa konfirmasi'})` : ''),
  };
}

// sesi dari jam UTC: asia = aktif (lebih sering masuk), aman = London–NY (syarat ketat, risiko kecil), libur = rollover & pasar sepi
export function session(d, p) {
  const h = d.getUTCHours(), inR = ([a, b]) => (a <= b ? h >= a && h < b : h >= a || h < b);
  return inR(p.asiaUTC) ? 'asia' : inR(p.offUTC) ? 'libur' : 'aman';
}
const SES_TXT = { asia: 'sesi Asia', aman: 'London–NY (mode aman)' };

// ctx: { equity, open (posisi terbuka), dayPnl, consecLoss, spread, quote: {bid, ask}, fund: {bias, blackout, danger, note}, now: Date }
export function decide(tech, ctx, p) {
  const no = (reason) => ({ decision: 'NO TRADE', reason });
  if (!tech.ok) return no(tech.note);
  const ses = session(ctx.now, p);
  if (ses === 'libur') return no('jam rollover/pasar sepi (04:00–08:00 WITA), libur dulu');
  if (ctx.fund?.blackout) return no(`berita berdampak tinggi: ${ctx.fund.blackout}`);
  if (ctx.fund?.danger) return no(`kondisi berita bahaya: ${ctx.fund.danger}`);
  if (tech.spike) return no('ada candle spike di M15 (kemungkinan berita dadakan), tunggu tenang');
  if (ctx.open >= p.maxPositions) return no('masih ada posisi terbuka');
  if (ctx.dayPnl <= -ctx.equity * p.dailyLossPct / 100) return no(`batas rugi harian ${p.dailyLossPct}% tercapai`);
  if (ctx.consecLoss >= p.maxConsecLoss) return no(`${ctx.consecLoss}× kalah beruntun, istirahat sampai besok`);
  if (ctx.spread > p.maxSpread) return no(`spread ${ctx.spread} kelebaran`);
  if (!tech.trigger) return no(`belum ada pantulan di Bollinger Band M15 (${SES_TXT[ses]})`);
  const side = tech.trigger, dir = side === 'buy' ? 1 : -1;
  if (tech.expanding) return no('Bollinger Band melebar kencang (breakout), pantulan berisiko');
  const need = ses === 'asia' ? p.minConfAsia : p.minConfSafe;
  if (tech.score < need) return no(`setup ${side.toUpperCase()} di band, konfirmasi baru ${tech.score}/${need} (${tech.confirm.join('+') || '-'}) · ${SES_TXT[ses]}`);
  const h1Against = Math.sign(tech.h1Score) === -dir;
  if (ses === 'aman' && h1Against) return no(`${side.toUpperCase()} lawan tren H1 (${tech.bias}), di luar jam Asia cari aman`);
  if (ses === 'asia' && h1Against && Math.abs(tech.h1Score) >= 3) return no(`tren H1 ${tech.bias} kuat banget, ${side.toUpperCase()} dilewati`);
  if (ctx.fund?.bias && Math.sign(ctx.fund.bias) === -dir) return no(`fundamental berlawanan (${ctx.fund.note ?? ''})`);
  const entry = side === 'buy' ? ctx.quote.ask : ctx.quote.bid;
  // SL di balik ujung sentuhan band + buffer ATR; TP ke tengah band (dibatasi RR)
  let dist = Math.abs(entry - tech.extreme) + p.slBufAtr * tech.atrM15;
  dist = Math.min(Math.max(dist, p.minSl), p.maxSl);
  const rr = Math.min(p.maxRr, dir * (tech.bbMid - entry) / dist);
  if (rr < p.minRr) return no(`tengah band terlalu dekat buat target (RR ${Math.max(rr, 0).toFixed(1)} < ${p.minRr})`);
  const sl = entry - dir * dist, tp = entry + dir * dist * rr;
  const riskPct = p.riskPct * (ses === 'asia' ? 1 : p.safeRiskMul);
  const lot = Math.min(p.maxLot, Math.floor(ctx.equity * riskPct / 100 / (dist * p.contract) / p.lotStep + 1e-9) * p.lotStep);
  if (lot < p.minLot) return no(`lot minimum terlalu besar untuk risiko ${riskPct}% (SL ${dist.toFixed(2)})`);
  const r2 = (v) => +v.toFixed(2);
  return {
    decision: side.toUpperCase(), side, entry: r2(entry), sl: r2(sl), tp: r2(tp), lot: +lot.toFixed(2), rr: +rr.toFixed(2),
    risk: r2(lot * dist * p.contract),
    reason: `pantulan band ${side === 'buy' ? 'bawah' : 'atas'} BB M15, konfirmasi ${tech.confirm.join('+')} · ${SES_TXT[ses]} risiko ${riskPct}% · SL ${dist.toFixed(2)} · TP tengah band RR 1:${rr.toFixed(1)}${ctx.fund?.note ? ` · fundamental: ${ctx.fund.note}` : ''}`,
  };
}
