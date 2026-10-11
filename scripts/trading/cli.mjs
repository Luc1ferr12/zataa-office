#!/usr/bin/env node
// CLI ringkas tim Trading (buat Claude & Owner di terminal, output kecil):
//   node scripts/trading/cli.mjs status        → akun, posisi, analisa terakhir
//   node scripts/trading/cli.mjs signals [n]   → n analisa terakhir
//   node scripts/trading/cli.mjs trades [n]    → n trade terakhir
//   node scripts/trading/cli.mjs cycle         → paksa satu siklus analisa (tanpa nunggu candle)
//   node scripts/trading/cli.mjs backtest      → backtest setelan sekarang
process.removeAllListeners('warning');
import { all, get, kv, params, mode } from './store.mjs';
import { account, openTrades, today } from './desk.mjs';
import { eaFresh } from './market.mjs';

const [cmd = 'status', n = '10'] = process.argv.slice(2);
const out = (o) => console.log(JSON.stringify(o));
if (cmd === 'status') {
  out({ mode: mode(), paused: kv('paused', false), ea: eaFresh(), account: account(), today: today(), open: openTrades().map(({ id, side, lot, entry, sl, tp }) => ({ id, side, lot, entry, sl, tp })),
    last: get('SELECT ts, decision, reason FROM trd_signals ORDER BY id DESC LIMIT 1'), fund: kv('fund', null)?.note ?? null, params: params() });
} else if (cmd === 'signals') out(all('SELECT ts, decision, side, entry, sl, tp, lot, reason FROM trd_signals ORDER BY id DESC LIMIT ?', +n));
else if (cmd === 'trades') out(all('SELECT id, mode, side, lot, entry, exit, pnl, r, status, open_ts, close_ts, reason_close, eval FROM trd_trades ORDER BY id DESC LIMIT ?', +n));
else if (cmd === 'cycle') { const { cycle } = await import('./cycle.mjs'); out(await cycle({ force: true })); }
else if (cmd === 'backtest') { const B = await import('./backtest.mjs'); const { m15, h1 } = B.loadHistory(); const { list, ...s } = B.backtest(m15, h1, params()); out(s); }
else console.log('perintah: status | signals [n] | trades [n] | cycle | backtest');
