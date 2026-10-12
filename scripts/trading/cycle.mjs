// Mahendra (Trading Director): mengatur alur semua agent dalam satu siklus analisa XAUUSD.
// Alur: Supervisor → Research (Davina) → Technical (Keira) → Decision & Risk (Aryaputra) → Execution (Wiratama) → Evaluation (Jihan) → Reporting (Selena)
import { run, get, kv, setKv, kvAge, params, mode, paused } from './store.mjs';
import { bars, refreshYahoo, marketOpen, quote, eaFresh, spotFresh } from './market.mjs';
import { refreshCalendar, fundamental, aiSentiment, upcoming } from './research.mjs';
import { technical, decide } from './strategy.mjs';
import { setAgent, note, talk, account, openTrades, today, execute, report, exportState } from './desk.mjs';

const witaHour = () => +new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Makassar', hour: '2-digit', hourCycle: 'h23' }).format(new Date());

export async function cycle({ force = false, log = console.log } = {}) {
  const now = new Date(), p = params(), m = mode();
  // ---- 1. Supervisor: boleh mulai?
  if (paused() && !force) { setAgent('tdir', 'idle', 'Trading dijeda Owner'); return { skip: 'paused' }; }
  if (!marketOpen(now) && !force) { setAgent('tdir', 'idle', 'Pasar emas tutup'); return { skip: 'market closed' }; }
  setAgent('tdir', 'working', 'Mulai siklus analisa XAUUSD');
  // ---- data harga: EA kalau tersambung, kalau tidak Yahoo
  if (!eaFresh()) {
    if (!spotFresh()) try { await refreshYahoo(); } catch (e) { log(`yahoo: ${e.message}`); }
    if (bars('H1', 300).length < p.emaSlow + 5) { setAgent('tdir', 'waiting', 'Data harga belum cukup'); return { skip: 'no data' }; }
  }
  // ---- 2. Research (Davina): kalender & sentimen
  setAgent('tresearch', 'working', 'Cek kalender ekonomi & berita USD');
  if (kvAge('calendar') > 360) { try { await refreshCalendar(); } catch (e) { log(`kalender gagal: ${e.message}`); } }
  const wh = witaHour();
  if (process.env.TRD_AI === '1' && (wh === 7 || wh === 19) && kvAge('fund') > 300) { try { await aiSentiment(); } catch { /* lanjut netral */ } }
  const fund = fundamental(Date.now(), p);
  setAgent('tresearch', 'done', fund.blackout ? `Waspada rilis ${fund.blackout}` : `Fundamental: ${fund.note}`);
  // ---- 3. Technical (Keira)
  setAgent('ttech', 'working', 'Baca chart XAUUSD M15/H1/H4');
  const m15 = bars('M15', 300), h1 = bars('H1', 400), h4 = bars('H4', 300);
  const tech = technical(m15, h1, h4, p);
  setAgent('ttech', 'done', tech.ok ? `Bias ${tech.bias}${tech.trigger ? `, pemicu ${tech.trigger.toUpperCase()}` : ''}` : tech.note);
  // ---- 4. Decision & Risk (Aryaputra)
  setAgent('trisk', 'working', 'Gabungin fundamental + teknikal, hitung risiko');
  const acc = account(), q = quote(), day = today();
  const dec = q && acc.ok
    ? decide(tech, { equity: acc.equity, open: openTrades().length, dayPnl: day.pnl, consecLoss: day.consecLoss, spread: acc.spread, quote: q, fund, now }, p)
    : { decision: 'NO TRADE', reason: m === 'paper' ? 'harga belum tersedia' : 'EA MT5 belum tersambung' };
  const sig = run(`INSERT INTO trd_signals (price, fund, tech, decision, side, entry, sl, tp, lot, rr, risk_usd, reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, tech.price ?? null, JSON.stringify(fund), JSON.stringify({ bias: tech.bias, score: tech.score, trigger: tech.trigger, note: tech.note }),
  dec.decision, dec.side ?? null, dec.entry ?? null, dec.sl ?? null, dec.tp ?? null, dec.lot ?? null, dec.rr ?? null, dec.risk ?? null, dec.reason);
  setAgent('trisk', 'done', dec.decision === 'NO TRADE' ? `NO TRADE: ${dec.reason}` : `${dec.decision} ${dec.lot} lot, RR 1:${dec.rr}`);
  // ---- 5. Execution (Wiratama)
  if (dec.decision !== 'NO TRADE') {
    talk('tresearch', 'ttech', fund.note.slice(0, 120));
    talk('ttech', 'trisk', tech.note.slice(0, 160));
    await execute({ ...dec, id: Number(sig.lastInsertRowid) });
  } else if (kvAge('lastNoTradeNote') > 60) {   // NO TRADE dicatat paling sering sejam sekali (biar log nggak penuh)
    setKv('lastNoTradeNote', 1);
    note('trisk', `NO TRADE · ${dec.reason}`);
  }
  // ---- 6–7. peringatan drawdown & koneksi (Selena)
  await alerts(acc, p);
  setAgent('tdir', 'done', `Siklus beres: ${dec.decision}`);
  exportState();
  return { decision: dec.decision, reason: dec.reason, tech: tech.note, fund: fund.note };
}

async function alerts(acc, p) {
  if (!acc.ok) {
    if (mode() !== 'paper' && kvAge('alertEa') > 60) { setKv('alertEa', 1); await report('⚠️ EA MT5 nggak kirim data >3 menit. Cek terminal MT5 & koneksi internet ya Bos.'); }
    return;
  }
  const peak = Math.max(kv('peakEquity', acc.equity), acc.equity);
  setKv('peakEquity', peak);
  const dd = (peak - acc.equity) / peak * 100;
  if (dd >= p.ddAlertPct && kvAge('alertDd') > 360) {
    setKv('alertDd', 1);
    await report(`⚠️ <b>Drawdown ${dd.toFixed(1)}%</b> dari puncak ekuitas ($${peak.toFixed(2)} → $${acc.equity.toFixed(2)}). Mahendra cek alur, Aryaputra perketat risiko.`);
  }
}

// rilis berita penting 24 jam ke depan (dipakai laporan pagi)
export function newsToday() {
  return upcoming(Date.now(), 24).filter((e) => e.impact === 'High')
    .map((e) => `• ${new Date(e.at).toLocaleTimeString('id-ID', { timeZone: 'Asia/Makassar', hour: '2-digit', minute: '2-digit' })} WITA ${e.title}`).join('\n');
}
