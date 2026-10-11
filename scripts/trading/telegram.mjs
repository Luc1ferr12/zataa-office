// Perintah Owner untuk tim Trading lewat Telegram (0 token, tanpa AI). Dipanggil dari scripts/ask.mjs.
//   trading status | trading jeda | trading lanjut | trading mode paper|demo|live | trading live KONFIRMASI
//   trading terapkan <id> | trading tolak <id> | trading tutup semua | trading backtest
import { all, get, run, kv, setKv, params, mode } from './store.mjs';
import { account, openTrades, today, sayAs, closeTrade, note, talk } from './desk.mjs';
import { quote, eaFresh } from './market.mjs';

export const isTradingCommand = (t) => /^\/?(trading|trade|xau)\b/i.test(String(t).trim());
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

export async function handleTrading(msg) {
  const t = String(msg).trim().replace(/^\/?(trading|trade|xau)\s*/i, '').toLowerCase();
  if (!t || /^status|^gimana|^cek/.test(t)) return status();
  if (/^(jeda|pause|stop)\b/.test(t)) { setKv('paused', true); note('tdir', 'Trading dijeda Owner'); return sayAs('tdir', '⏸️ Siap Bos, tim trading berhenti ambil posisi baru. Posisi yang kebuka tetap dijaga SL/TP-nya.'); }
  if (/^(lanjut|resume|mulai)\b/.test(t)) { setKv('paused', false); note('tdir', 'Trading dilanjut Owner'); return sayAs('tdir', '▶️ Oke Bos, tim trading jalan lagi.'); }
  let m;
  if ((m = t.match(/^mode\s+(paper|demo|live)/))) {
    if (m[1] === 'live') {
      setKv('pendingLive', Date.now());
      return sayAs('trisk', '⚠️ Mode <b>LIVE</b> = uang asli. Pastikan EA terpasang di akun real dengan input <i>AllowLive=true</i>, risiko per trade ' +
        `${params().riskPct}%, batas rugi harian ${params().dailyLossPct}%. Kalau yakin, balas persis: <b>trading live KONFIRMASI</b> (berlaku 10 menit).`);
    }
    setKv('mode', m[1]); setKv('liveConfirmed', false);
    return sayAs('tdir', `✅ Mode trading sekarang <b>${m[1]}</b>${m[1] === 'demo' ? ' (order dikirim ke EA MT5 akun demo)' : ' (simulasi pakai harga asli, tanpa uang)'}.`);
  }
  if (/^live konfirmasi$/.test(t)) {
    if (Date.now() - (kv('pendingLive', 0) ?? 0) > 10 * 60000) return sayAs('trisk', 'Konfirmasi kedaluwarsa. Kirim <b>trading mode live</b> dulu ya Bos.');
    setKv('mode', 'live'); setKv('liveConfirmed', true); setKv('pendingLive', 0);
    note('tdir', 'Owner mengaktifkan mode LIVE');
    return sayAs('tdir', '🟢 Mode <b>LIVE</b> aktif. Mahendra & Aryaputra jaga risikonya ketat. Kirim <b>trading jeda</b> kapan aja buat berhenti.');
  }
  if ((m = t.match(/^(terapkan|apply|acc)\s+#?(\d+)/))) {
    const pr = get("SELECT * FROM trd_proposals WHERE id = ? AND status = 'proposed'", +m[2]);
    if (!pr) return sayAs('trisk', `Usulan #${m[2]} nggak ketemu / udah diproses.`);
    const cur = kv('params', {});
    setKv('params', { ...cur, ...JSON.parse(pr.params) });
    run("UPDATE trd_proposals SET status = 'applied' WHERE id = ?", pr.id);
    note('trisk', `Pasang setelan usulan #${pr.id}`);
    talk('trisk', 'teval', `Usulan #${pr.id} udah aku pasang, pantau forward test-nya ya Jihan`);
    return sayAs('trisk', `🛠️ Usulan #${pr.id} udah kepasang: ${esc(Object.entries(JSON.parse(pr.params)).map(([k, v]) => `${k}=${v}`).join(', '))}.`);
  }
  if ((m = t.match(/^(tolak|reject)\s+#?(\d+)/))) {
    run("UPDATE trd_proposals SET status = 'rejected' WHERE id = ?", +m[2]);
    return sayAs('teval', `Oke Bos, usulan #${m[2]} nggak dipakai.`);
  }
  if (/^tutup semua|^close all/.test(t)) {
    const open = openTrades();
    if (!open.length) return sayAs('texec', 'Nggak ada posisi kebuka Bos.');
    if (mode() === 'paper') {
      const q = quote();
      for (const x of open.filter((o) => o.status === 'open')) await closeTrade(x, x.side === 'buy' ? q.bid : q.ask, 'ditutup Owner');
    } else {
      for (const x of open.filter((o) => o.status === 'open')) run('INSERT INTO trd_commands (trade_id, action, payload) VALUES (?, ?, ?)', x.id, 'close', JSON.stringify({ ticket: x.ticket }));
    }
    return sayAs('texec', `Siap, ${open.length} posisi aku tutup sekarang 🫡`);
  }
  return sayAs('tdir', 'Perintah trading: <b>status</b>, <b>jeda</b>, <b>lanjut</b>, <b>mode paper|demo|live</b>, <b>terapkan &lt;id&gt;</b>, <b>tolak &lt;id&gt;</b>, <b>tutup semua</b>.');
}

async function status() {
  const acc = account(), day = today(), open = openTrades();
  const last = get('SELECT decision, reason, ts FROM trd_signals ORDER BY id DESC LIMIT 1');
  const pend = all("SELECT id FROM trd_proposals WHERE status = 'proposed'").map((r) => `#${r.id}`);
  const lines = [
    `📊 <b>Trading XAUUSD</b> · mode <b>${mode()}</b>${kv('paused', false) ? ' · ⏸️ dijeda' : ''}`,
    `Ekuitas $${acc.equity.toFixed(2)} · hari ini ${day.pnl >= 0 ? '+' : ''}$${day.pnl.toFixed(2)} (${day.trades} trade)`,
    `Posisi kebuka: ${open.length ? open.map((o) => `${o.side.toUpperCase()} ${o.lot} @ ${o.entry}`).join(', ') : '-'}`,
    `EA MT5: ${eaFresh() ? 'tersambung ✅' : 'belum tersambung'}`,
    last ? `Analisa terakhir: <b>${last.decision}</b> · ${esc(last.reason)}` : 'Belum ada analisa.',
    pend.length ? `Usulan nunggu ACC: ${pend.join(', ')}` : '',
  ].filter(Boolean);
  return sayAs('tdir', lines.join('\n'));
}
