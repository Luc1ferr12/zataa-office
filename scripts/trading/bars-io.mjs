#!/usr/bin/env node
// Pindah riwayat candle antar mesin (mis. laptop → VPS kalau Yahoo diblokir di IP server).
//   node scripts/trading/bars-io.mjs export <file.json> [src=yahoo]
//   node scripts/trading/bars-io.mjs import <file.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { all } from './store.mjs';
import { saveBars } from './market.mjs';
const [cmd, file, src = 'yahoo'] = process.argv.slice(2);
if (cmd === 'export') {
  const out = {};
  for (const tf of ['M15', 'H1', 'H4']) out[tf] = all('SELECT t, o, h, l, c, v FROM trd_bars WHERE tf = ? AND src = ? ORDER BY t', tf, src);
  writeFileSync(file, JSON.stringify({ src, bars: out }));
  console.log('ok', Object.entries(out).map(([k, v]) => `${k}:${v.length}`).join(' '));
} else if (cmd === 'import') {
  const j = JSON.parse(readFileSync(file, 'utf8'));
  for (const [tf, rows] of Object.entries(j.bars)) saveBars(tf, rows, j.src);
  console.log('ok', Object.entries(j.bars).map(([k, v]) => `${k}:${v.length}`).join(' '));
} else console.log('pakai: export <file> [src] | import <file>');
