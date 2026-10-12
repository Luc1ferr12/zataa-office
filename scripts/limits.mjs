#!/usr/bin/env node
// Aprista ngabarin Owner kalau limit Claude (sesi 5 jam / mingguan) nyentuh ≥95% — tanpa AI, 0 token.
// Cek tiap 10 menit lewat watcher; tiap jenis limit cuma dikabarin 1× per periode reset.
// Token dibaca dari login Claude CLI (~/.claude/.credentials.json); kalau token kedaluwarsa dilewati
// (pemakaian cuma naik saat Claude jalan, dan saat itu CLI otomatis memperbarui token).
//   node scripts/limits.mjs check     cetak pemakaian sekarang
// Ambang: LIMIT_ALERT_PCT di .env (default 95)
process.removeAllListeners('warning');
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, db, sayAs } from './approval.mjs';
import { chat } from './chatter.mjs';

const EVERY_MIN = 10;
const BUCKETS = { five_hour: 'Limit sesi (5 jam)', seven_day: 'Limit mingguan', seven_day_opus: 'Limit mingguan Opus', seven_day_sonnet: 'Limit mingguan Sonnet' };
const flag = (d, key, value) => {
  d.exec('CREATE TABLE IF NOT EXISTS flags (key TEXT PRIMARY KEY, value TEXT)');
  if (value === undefined) return d.prepare('SELECT value FROM flags WHERE key = ?').get(key)?.value;
  d.prepare('INSERT INTO flags (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
};
const whenWita = (iso) => new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Makassar', weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export async function usage() {
  let c;
  try { c = JSON.parse(readFileSync(join(homedir(), '.claude', '.credentials.json'), 'utf8')).claudeAiOauth; } catch { return null; }
  if (!c?.accessToken || (c.expiresAt && c.expiresAt < Date.now())) return null;
  const r = await fetch('https://api.anthropic.com/api/oauth/usage', {
    headers: { Authorization: `Bearer ${c.accessToken}`, 'anthropic-beta': 'oauth-2025-04-20' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`usage API ${r.status}`);
  const j = await r.json();
  return Object.entries(BUCKETS)
    .filter(([k]) => j[k] && typeof j[k].utilization === 'number')
    .map(([k, label]) => ({ key: k, label, pct: Math.round(j[k].utilization), resetsAt: j[k].resets_at }));
}

export async function limitsTick() {
  const d = await db();
  const now = Date.now();
  if (now - Number(flag(d, 'limits_check') ?? 0) < EVERY_MIN * 60_000) return null;
  flag(d, 'limits_check', now);
  const list = await usage();
  if (!list) return null;
  const min = Number(process.env.LIMIT_ALERT_PCT ?? loadEnv().LIMIT_ALERT_PCT) || 95;
  const sent = [];
  for (const u of list) {
    if (u.pct < min || flag(d, `limit_alert_${u.key}`) === u.resetsAt) continue;
    flag(d, `limit_alert_${u.key}`, u.resetsAt);
    const weekly = u.key !== 'five_hour';
    const text = `⚠️ Bos, ${u.label.toLowerCase()} Claude udah <b>${u.pct}%</b>. Reset ${whenWita(u.resetsAt)} WITA.\n`
      + (weekly ? 'Kalau sampai 100%, kerjaan AI (sesi harian, tugas Telegram, revisi) berhenti sampai reset. Auto-post, cek harga & data IG tetap jalan.'
        : 'Kalau penuh, kerjaan AI ketunda sebentar sampai reset.');
    await sayAs('sec', text);
    chat(d, 'sec', 'owner', text.replace(/<\/?b>/g, ''), 'santai');
    sent.push(`${u.key}:${u.pct}%`);
  }
  return sent.length ? { alert: sent } : null;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const [cmd] = process.argv.slice(2);
  if (cmd === 'check') {
    const list = await usage();
    console.log(list ? list.map((u) => `${u.label}: ${u.pct}% (reset ${whenWita(u.resetsAt)} WITA)`).join('\n') : 'token Claude belum ada / kedaluwarsa');
  } else console.log('pakai: limits.mjs check');
}
