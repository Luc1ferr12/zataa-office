#!/usr/bin/env node
// Raka (Data Analyst): narik angka post IG (0 token) tiap 3 jam → tabel metrics, laporan mingguan tiap Minggu sore ke Telegram.
//   node scripts/analyst.mjs collect    tarik metrik sekarang
//   node scripts/analyst.mjs report     kirim laporan minggu ini sekarang
process.removeAllListeners('warning');
import { fileURLToPath } from 'node:url';
import { loadEnv, db, say, sayAs } from './approval.mjs';
import { chat } from './chatter.mjs';

const env = () => ({ ...loadEnv(), ...process.env });
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const wita = () => new Date(Date.now() + 8 * 3600_000); // dibaca pakai getUTC*
const setRaka = (d, status, task = null) => d.prepare("UPDATE agents SET status = ?, current_task = ?, updated_at = datetime('now') WHERE id = 'analyst'").run(status, task);
const flag = (d, key, value) => {
  d.exec('CREATE TABLE IF NOT EXISTS flags (key TEXT PRIMARY KEY, value TEXT)');
  if (value === undefined) return d.prepare('SELECT value FROM flags WHERE key = ?').get(key)?.value;
  d.prepare('INSERT INTO flags (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
};

async function graph(path, params) {
  const e = env();
  const r = await fetch(`https://graph.facebook.com/${e.GRAPH_VERSION || 'v23.0'}/${path}?${new URLSearchParams({ ...params, access_token: e.IG_ACCESS_TOKEN ?? '' })}`);
  return r.json();
}

export async function collect() {
  const d = await db();
  const posts = d.prepare("SELECT id, title, ig_media_id FROM contents WHERE ig_media_id IS NOT NULL AND posted_at >= datetime('now', '-14 days')").all();
  if (!posts.length) return { collected: 0 };
  setRaka(d, 'working', `Narik data insight ${posts.length} post IG`);
  let n = 0;
  for (const p of posts) {
    const m = await graph(p.ig_media_id, { fields: 'like_count,comments_count' });
    if (m.error) continue;
    // reach/saved/shares butuh izin instagram_manage_insights; kalau belum ada, cukup like & komentar
    const ins = await graph(`${p.ig_media_id}/insights`, { metric: 'reach,saved,shares,views' });
    const v = Object.fromEntries((ins.data ?? []).map((x) => [x.name, x.values?.[0]?.value ?? x.total_value?.value ?? 0]));
    d.prepare('INSERT INTO metrics (content_id, platform, views, likes, comments, shares, saves) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(p.id, 'instagram', v.views ?? v.reach ?? 0, m.like_count ?? 0, m.comments_count ?? 0, v.shares ?? 0, v.saved ?? 0);
    n++;
  }
  setRaka(d, 'done');
  d.prepare("INSERT INTO activity (agent_id, message) VALUES ('analyst', ?)").run(`Update data ${n} post IG 📈`);
  return { collected: n };
}

export async function weeklyReport() {
  const d = await db();
  // metrik terakhir per konten minggu ini (Senin–Minggu WITA)
  const rows = d.prepare(`SELECT c.id, c.title, c.pillar, c.format, m.views, m.likes, m.comments, m.saves
    FROM contents c JOIN metrics m ON m.id = (SELECT id FROM metrics WHERE content_id = c.id ORDER BY id DESC LIMIT 1)
    WHERE c.posted_at >= datetime('now', '-7 days')`).all();
  if (!rows.length) {
    await sayAs('analyst', '📊 <b>Laporan mingguan</b>\nMinggu ini belum ada post IG yang bisa dianalisis.');
    return { posts: 0 };
  }
  const score = (r) => r.likes + 3 * r.comments + 2 * r.saves;
  const top = [...rows].sort((a, b) => score(b) - score(a)).slice(0, 3);
  const pillars = {};
  for (const r of rows) (pillars[r.pillar ?? 'lain'] ??= []).push(score(r));
  const avg = Object.entries(pillars).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length]).sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((a, r) => ({ likes: a.likes + r.likes, comments: a.comments + r.comments, views: a.views + r.views }), { likes: 0, comments: 0, views: 0 });
  const text = [
    '<b>Raka</b>: 📊 <b>Laporan mingguan</b>', `${rows.length} post · ❤️ ${total.likes} · 💬 ${total.comments}${total.views ? ` · 👀 ${total.views}` : ''}`, '',
    '<b>Top 3 post:</b>', ...top.map((r, i) => `${i + 1}. #${r.id} ${esc(r.title)} (❤️ ${r.likes} · 💬 ${r.comments})`), '',
    '<b>Pilar paling works:</b>', ...avg.map(([k, v]) => `• ${esc(k)}: skor rata-rata ${v.toFixed(1)}`), '',
    `Saran: perbanyak pilar <b>${esc(avg[0][0])}</b> minggu depan. Andre pakai ini buat evaluasi & plan Senin.`,
  ].join('\n');
  await say(text);
  chat(d, 'analyst', 'dir', `Kak, laporan minggu ini udah aku kirim ke Bos. Pilar ${avg[0][0]} paling rame 📈`, 'oper');
  return { posts: rows.length };
}

// dipanggil watcher tiap menit: koleksi tiap 3 jam, laporan Minggu 16:00 WITA (pas rapat evaluasi)
export async function analystTick() {
  if (!env().IG_ACCESS_TOKEN) return null;
  const d = await db();
  const w = wita();
  const hourKey = `${w.toISOString().slice(0, 10)}-${Math.floor(w.getUTCHours() / 3)}`;
  if (flag(d, 'analyst_collect') !== hourKey) { flag(d, 'analyst_collect', hourKey); return { collect: await collect() }; }
  const week = w.toISOString().slice(0, 10);
  if (w.getUTCDay() === 0 && w.getUTCHours() >= 16 && flag(d, 'analyst_report') !== week) { flag(d, 'analyst_report', week); return { report: await weeklyReport() }; }
  return null;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const [cmd] = process.argv.slice(2);
  if (cmd === 'collect') console.log(JSON.stringify(await collect()));
  else if (cmd === 'report') console.log(JSON.stringify(await weeklyReport()));
  else console.log('pakai: analyst.mjs collect | report');
}
