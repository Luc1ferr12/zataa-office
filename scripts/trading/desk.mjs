// Meja tim Trading: akun (paper / EA), eksekusi order (Wiratama), evaluasi tiap trade (Jihan), laporan Telegram (Selena),
// plus status pegawai di kantor virtual (dashboard & obrolan oper kerjaan).
import { execFileSync } from 'node:child_process';
import { all, get, run, kv, setKv, params, mode, ROOT } from './store.mjs';
import { quote, bars, eaFresh } from './market.mjs';
import { chat } from '../chatter.mjs';
import { tradingBotOn, sendTrading } from './tgbot.mjs';
import { db as officeDb } from './store.mjs';

const NAME = { tdir: 'Mahendra', tresearch: 'Davina', ttech: 'Keira', trisk: 'Aryaputra', texec: 'Wiratama', teval: 'Jihan', treport: 'Selena' };
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const usd = (v) => `${v >= 0 ? '+' : '−'}$${Math.abs(v).toFixed(2)}`;

// ---------------------------------------------------------------- kantor virtual
export function setAgent(id, status, task = null) {
  run("UPDATE agents SET status = ?, current_task = ?, updated_at = datetime('now') WHERE id = ?", status, task, id);
}
export const note = (id, msg) => run('INSERT INTO activity (agent_id, message) VALUES (?, ?)', id, msg);
export const talk = (from, to, msg, kind = 'oper') => chat(officeDb, from, to, msg, kind);
let lastExport = 0;
export function exportState(force = false) {
  if (!force && Date.now() - lastExport < 5 * 60000) return;
  lastExport = Date.now();
  try { execFileSync(process.execPath, ['scripts/office.mjs', 'export'], { cwd: ROOT, stdio: 'ignore' }); } catch { /* abaikan */ }
}

// ---------------------------------------------------------------- Telegram (Selena)
let tg = null;
async function send(agent, html) {
  if (process.env.TRD_SILENT === '1') { console.log(`[senyap] ${NAME[agent] ?? agent}: ${html.replace(/<[^>]+>/g, '')}`); return false; }
  try {
    const text = `<b>${NAME[agent] ?? agent}</b>: ${html}`;
    if (tradingBotOn()) { await sendTrading(text); return true; }   // bot khusus trading
    tg ??= await import('../approval.mjs');
    await tg.say(text);
    return true;
  } catch (e) { console.log(`[telegram off] ${NAME[agent] ?? agent}: ${html.replace(/<[^>]+>/g, '')}`); return false; }
}
export const report = (html) => send('treport', html);
export const sayAs = send;

// ---------------------------------------------------------------- akun
export function account() {
  const m = mode();
  if (m === 'paper') {
    const p = kv('paper', null) ?? { balance: 10000 };
    const q = quote();
    const open = all("SELECT * FROM trd_trades WHERE mode = 'paper' AND status = 'open'");
    const fl = open.reduce((s, t) => s + floating(t, q), 0);
    return { mode: m, balance: p.balance, equity: p.balance + fl, spread: q?.spread ?? 0.3, ok: !!q };
  }
  const ea = kv('ea', null);
  return { mode: m, balance: ea?.balance ?? 0, equity: ea?.equity ?? 0, spread: ea ? +(ea.ask - ea.bid).toFixed(2) : 99, ok: eaFresh(), demo: ea?.demo };
}
const floating = (t, q) => (q ? (t.side === 'buy' ? q.bid - t.entry : t.entry - q.ask) * t.lot * params().contract : 0);
export const openTrades = () => all("SELECT * FROM trd_trades WHERE status IN ('open', 'pending') AND mode = ?", mode());
export function today() {
  const day = new Date().toISOString().slice(0, 10);
  const rows = all("SELECT pnl FROM trd_trades WHERE status = 'closed' AND mode = ? AND substr(close_ts, 1, 10) = ? ORDER BY id", mode(), day);
  let consec = 0;
  for (const r of rows) consec = r.pnl < 0 ? consec + 1 : 0;
  return { pnl: rows.reduce((s, r) => s + r.pnl, 0), trades: rows.length, consecLoss: consec };
}

// ---------------------------------------------------------------- eksekusi (Wiratama)
export async function execute(sig) {
  const m = mode(), p = params();
  const tr = run('INSERT INTO trd_trades (signal_id, mode, side, lot, entry, sl, tp, status, reason_open) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    sig.id, m, sig.side, sig.lot, sig.entry, sig.sl, sig.tp, m === 'paper' ? 'open' : 'pending', sig.reason);
  const id = Number(tr.lastInsertRowid);
  setAgent('texec', 'working', `Eksekusi ${sig.side.toUpperCase()} ${sig.lot} lot XAUUSD`);
  if (m === 'paper') {
    run("UPDATE trd_trades SET open_ts = datetime('now'), ticket = ? WHERE id = ?", `P${id}`, id);
    note('texec', `[paper] Buka ${sig.side.toUpperCase()} ${sig.lot} lot @ ${sig.entry} · SL ${sig.sl} · TP ${sig.tp}`);
    await onOpened(get('SELECT * FROM trd_trades WHERE id = ?', id));
  } else {
    // perintah ke EA MT5 (diambil lewat bridge, dikonfirmasi lewat /ea/ack)
    run('INSERT INTO trd_commands (trade_id, action, payload) VALUES (?, ?, ?)', id, 'open',
      JSON.stringify({ side: sig.side, volume: sig.lot, sl: sig.sl, tp: sig.tp, maxDeviation: 0.5, comment: `ZATAA#${id}`, magic: 20261012 }));
    note('texec', `Kirim instruksi ${sig.side.toUpperCase()} ${sig.lot} lot ke EA MT5 (${m})`);
  }
  talk('trisk', 'texec', `Keputusan ${sig.side.toUpperCase()} ${sig.lot} lot, SL ${sig.sl}, TP ${sig.tp}. Eksekusi ya Wir!`);
  return id;
}
export async function onOpened(t) {
  setAgent('texec', 'done', `${t.side.toUpperCase()} ${t.lot} lot terbuka`);
  talk('texec', 'treport', `Order ${t.side.toUpperCase()} #${t.id} ke-fill di ${t.entry}, SL TP kepasang 👍`);
  await report(`📈 <b>Posisi dibuka</b> (${t.mode})\n${t.side.toUpperCase()} XAUUSD ${t.lot} lot @ ${t.entry}\nSL ${t.sl} · TP ${t.tp}\nAlasan: ${esc(t.reason_open)}`);
  exportState();
}
// paper: cek SL/TP dari candle & harga terbaru
export async function monitorPaper() {
  const open = all("SELECT * FROM trd_trades WHERE mode = 'paper' AND status = 'open'");
  if (!open.length) return;
  const q = quote();
  const m15 = bars('M15', 20);
  for (const t of open) {
    const since = Date.parse(`${t.open_ts}Z`) / 1000;
    const recent = m15.filter((b) => b.t + 900 > since);
    const lo = Math.min(...recent.map((b) => b.l), q?.bid ?? Infinity), hi = Math.max(...recent.map((b) => b.h), q?.ask ?? -Infinity);
    const hitSl = t.side === 'buy' ? lo <= t.sl : hi >= t.sl;
    const hitTp = t.side === 'buy' ? hi >= t.tp : lo <= t.tp;
    if (hitSl || hitTp) await closeTrade(t, hitSl ? t.sl : t.tp, hitSl ? 'SL' : 'TP');
  }
}
export async function closeTrade(t, exit, why, pnlOverride = null) {
  const p = params();
  const pnl = pnlOverride ?? (t.side === 'buy' ? exit - t.entry : t.entry - exit) * t.lot * p.contract;
  const risk = Math.abs(t.entry - t.sl) * t.lot * p.contract || 1;
  run("UPDATE trd_trades SET status = 'closed', exit = ?, pnl = ?, r = ?, close_ts = datetime('now'), reason_close = ? WHERE id = ?", exit, pnl, pnl / risk, why, t.id);
  if (t.mode === 'paper') { const pa = kv('paper', { balance: 10000 }); pa.balance += pnl; setKv('paper', pa); }
  const tt = get('SELECT * FROM trd_trades WHERE id = ?', t.id);
  const ev = evaluate(tt);
  run('UPDATE trd_trades SET eval = ? WHERE id = ?', ev, t.id);
  note('texec', `Posisi #${t.id} ditutup (${why}) ${usd(pnl)}`);
  talk('texec', 'teval', `#${t.id} kena ${why}, ${usd(pnl)}. Evaluasi ya Jihan`);
  talk('teval', 'treport', ev.slice(0, 160));
  await report(`${pnl >= 0 ? '✅' : '🔻'} <b>Posisi ditutup</b> (${t.mode}) · ${why}\n${t.side.toUpperCase()} ${t.lot} lot · entry ${t.entry} → exit ${(+exit).toFixed(2)}\nHasil bersih: <b>${usd(pnl)}</b> (${(pnl / risk).toFixed(2)}R)\nAlasan entry: ${esc(t.reason_open)}\nEvaluasi Jihan: ${esc(ev)}`);
  exportState(true);
}

// ---------------------------------------------------------------- evaluasi per trade (Jihan)
export function evaluate(t) {
  const sig = get('SELECT * FROM trd_signals WHERE id = ?', t.signal_id);
  const minutes = t.open_ts && t.close_ts ? Math.round((Date.parse(`${t.close_ts}Z`) - Date.parse(`${t.open_ts}Z`)) / 60000) : null;
  if (t.pnl > 0) return `Profit sesuai rencana (${t.reason_close}, ${minutes ?? '?'} menit). Setup ${sig?.tech ? JSON.parse(sig.tech).bias : ''} jalan, pertahankan.`;
  const fast = minutes != null && minutes < 60;
  return fast
    ? `Rugi cepat (${minutes} menit): entry kemungkinan terlalu awal / SL kesempitan untuk volatilitas saat itu. Catat untuk backtest jarak SL.`
    : `Rugi setelah ${minutes ?? '?'} menit: tren berbalik setelah entry. Cek ulang filter tren & berita sekitar jam itu.`;
}

// ---------------------------------------------------------------- ringkasan harian / mingguan (Selena)
export async function summary(days = 1) {
  const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace('T', ' ');
  const rows = all("SELECT * FROM trd_trades WHERE status = 'closed' AND mode = ? AND close_ts >= ?", mode(), from);
  const sigs = get("SELECT COUNT(*) n, SUM(decision = 'NO TRADE') skip FROM trd_signals WHERE ts >= ?", from);
  const net = rows.reduce((s, r) => s + r.pnl, 0), wins = rows.filter((r) => r.pnl > 0).length;
  const acc = account();
  const label = days === 1 ? 'harian' : 'mingguan';
  await report(`📊 <b>Laporan ${label} XAUUSD</b> (${acc.mode})\nTrade: ${rows.length} (menang ${wins}, kalah ${rows.length - wins})\nHasil bersih: <b>${usd(net)}</b>\nEkuitas: $${acc.equity.toFixed(2)}\nAnalisa: ${sigs?.n ?? 0}× (no trade ${sigs?.skip ?? 0}×)`);
}

// ---------------------------------------------------------------- laporan lengkap paper + kelayakan akun real (Selena, Sabtu 08:00)
// Modal real Owner dalam rupiah (TRD_LIVE_IDR, default Rp300rb). Hasil paper ($10rb) diterjemahkan ke modal itu pakai persen & R.
const LIVE_READY = { minTrades: 10, minPf: 1.3, maxDdPct: 10 };
async function usdIdr() {
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(15000) });
    const v = (await r.json())?.rates?.IDR;
    if (v > 1000) return v;
  } catch { /* pakai cadangan */ }
  return 16500;
}
const rp = (v) => `${v < 0 ? '−' : ''}Rp${Math.round(Math.abs(v)).toLocaleString('id-ID')}`;
export async function paperReport(days = 7) {
  const p = params();
  const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace('T', ' ');
  const rows = all("SELECT * FROM trd_trades WHERE status = 'closed' AND mode = 'paper' AND close_ts >= ? ORDER BY id", from);
  const sigs = get("SELECT COUNT(*) n, SUM(decision = 'NO TRADE') skip, MIN(ts) a FROM trd_signals WHERE ts >= ?", from);
  const why = all("SELECT reason, COUNT(*) n FROM trd_signals WHERE decision = 'NO TRADE' AND ts >= ? GROUP BY reason ORDER BY n DESC LIMIT 3", from);
  const n = rows.length, win = rows.filter((r) => r.pnl > 0), loss = rows.filter((r) => r.pnl < 0);
  const net = rows.reduce((s, r) => s + r.pnl, 0), gw = win.reduce((s, r) => s + r.pnl, 0), gl = -loss.reduce((s, r) => s + r.pnl, 0);
  const pf = gl ? gw / gl : gw ? Infinity : 0, sumR = rows.reduce((s, r) => s + (r.r ?? 0), 0);
  // drawdown & kalah beruntun dari urutan trade minggu ini
  const bal = kv('paper', { balance: 10000 }).balance, start = bal - net;
  let eq = start, peak = start, dd = 0, streak = 0, worstStreak = 0;
  for (const r of rows) { eq += r.pnl; peak = Math.max(peak, eq); dd = Math.max(dd, (peak - eq) / peak * 100); streak = r.pnl < 0 ? streak + 1 : 0; worstStreak = Math.max(worstStreak, streak); }
  const ret = start ? net / start * 100 : 0;
  const best = rows.reduce((b, r) => (!b || r.pnl > b.pnl ? r : b), null), worst = rows.reduce((b, r) => (!b || r.pnl < b.pnl ? r : b), null);
  // terjemahan ke modal real
  const idr = +(process.env.TRD_LIVE_IDR || 300000), rate = await usdIdr(), modalUsd = idr / rate;
  const avgSl = n ? rows.reduce((s, r) => s + Math.abs(r.entry - r.sl), 0) / n : (p.minSl + p.maxSl) / 4;
  const minLotRisk = avgSl * p.minLot * p.contract;            // rugi 0,01 lot kalau kena SL (akun USD standar)
  const stdPct = minLotRisk / modalUsd * 100, centPct = minLotRisk / (modalUsd * 100) * 100;
  const checks = [
    [n >= LIVE_READY.minTrades, `Jumlah trade ≥ ${LIVE_READY.minTrades} (sekarang ${n})`],
    [n > 0 && pf >= LIVE_READY.minPf, `Profit factor ≥ ${LIVE_READY.minPf} (sekarang ${pf === Infinity ? '∞' : pf.toFixed(2)})`],
    [n > 0 && sumR > 0, `Total hasil positif (sekarang ${sumR >= 0 ? '+' : ''}${sumR.toFixed(1)}R)`],
    [dd <= LIVE_READY.maxDdPct, `Drawdown maks ≤ ${LIVE_READY.maxDdPct}% (sekarang ${dd.toFixed(1)}%)`],
    [worstStreak < p.maxConsecLoss + 2, `Kalah beruntun terpanjang wajar (sekarang ${worstStreak}×)`],
  ];
  const ready = checks.every(([ok]) => ok);
  const msg = [
    `📋 <b>Laporan lengkap paper XAUUSD</b> (${days} hari terakhir)`,
    '',
    `<b>Analisa</b>: ${sigs?.n ?? 0} siklus, NO TRADE ${sigs?.skip ?? 0}×`,
    ...why.map((w) => `  • ${esc(w.reason)} (${w.n}×)`),
    '',
    `<b>Trade</b>: ${n} (menang ${win.length}, kalah ${loss.length}${n ? `, win rate ${Math.round(win.length / n * 100)}%` : ''})`,
    `Hasil bersih: <b>${usd(net)}</b> (${ret >= 0 ? '+' : ''}${ret.toFixed(2)}% dari $${start.toFixed(0)}) · ${sumR >= 0 ? '+' : ''}${sumR.toFixed(1)}R`,
    `Profit factor: ${n ? (pf === Infinity ? '∞' : pf.toFixed(2)) : '–'} · total profit ${usd(gw)} · total loss ${usd(-gl)}`,
    `Drawdown maks: ${dd.toFixed(1)}% · kalah beruntun terpanjang: ${worstStreak}×`,
    best ? `Terbaik: ${best.side.toUpperCase()} ${usd(best.pnl)} (${(best.r ?? 0).toFixed(1)}R) · Terburuk: ${worst.side.toUpperCase()} ${usd(worst.pnl)} (${(worst.r ?? 0).toFixed(1)}R)` : null,
    '',
    `<b>Kalau pakai modal ${rp(idr)}</b> (kurs ${rp(rate)}/USD ≈ $${modalUsd.toFixed(2)}), risiko ${p.riskPct}%/trade:`,
    `Hasil minggu ini setara ≈ <b>${rp(idr * ret / 100)}</b> (${ret >= 0 ? '+' : ''}${ret.toFixed(2)}%)`,
    `Lot minimum 0,01 dengan SL rata-rata $${avgSl.toFixed(1)} = rugi ≈ ${rp(minLotRisk * rate)} per kena SL:`,
    `  • Akun USD standar: ${stdPct.toFixed(0)}% modal per trade ${stdPct > p.riskPct * 2 ? '❌ terlalu besar, Aryaputra bakal nolak semua entry' : '✅'}`,
    `  • Akun <b>cent</b> (saldo jadi ±${Math.round(modalUsd * 100)} USC): ${centPct.toFixed(1)}% modal per trade ${centPct <= p.riskPct * 2 ? '✅ cocok' : '⚠️ masih besar'}`,
    '',
    `<b>Kelayakan akun real</b>:`,
    ...checks.map(([ok, t]) => `${ok ? '✅' : '❌'} ${t}`),
    ready
      ? `\n🟢 <b>Paper LAYAK lanjut ke akun real</b>. Saran: akun cent, sambungkan EA, lalu kirim <b>trading mode live</b> + konfirmasi. Mode nggak pindah sendiri.`
      : `\n🟡 <b>Belum layak ke akun real</b>. Paper lanjut minggu depan biar datanya cukup (atau coba mode demo dulu).`,
  ].filter((l) => l !== null).join('\n');
  note('treport', `Laporan lengkap paper: ${ready ? 'LAYAK ke akun real' : 'belum layak ke akun real'}`);
  talk('treport', 'tdir', ready ? 'Paper minggu ini lolos semua syarat, udah kulaporin ke Bos 👍' : 'Paper belum lolos syarat live, udah kulaporin ke Bos');
  await report(msg);
  return { ready, n, pf, dd, ret };
}
