#!/usr/bin/env node
// Raka (Data Analyst): narik angka post IG (0 token) tiap 3 jam → tabel metrics; laporan divisi Marketing ke bot kantor:
// harian 19:00 WITA, mingguan Minggu 19:30 WITA.
//   node scripts/analyst.mjs collect          tarik metrik sekarang
//   node scripts/analyst.mjs daily [--dry]    laporan harian sekarang (--dry = cetak saja, tidak dikirim)
//   node scripts/analyst.mjs weekly [--dry]   laporan mingguan sekarang
//   node scripts/analyst.mjs slots            performa per jam tayang 28 hari (feed vs video) + saran jam
process.removeAllListeners('warning');
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadEnv, db, say, SLOT } from './approval.mjs';
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
  const posts = d.prepare("SELECT id, title, ig_media_id FROM contents WHERE ig_media_id IS NOT NULL AND channel IS NOT 'youtube' AND posted_at >= datetime('now', '-14 days')").all();
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

// ---------- laporan divisi Marketing ke bot kantor (0 token): harian 19:00 WITA, mingguan Minggu 19:30 WITA
// Shorts YouTube dilaporkan Kirana di @zataashortbot, trading oleh Selena di bot trading → di sini cuma konten marketing.
const MK = (p = '') => `${p}channel IS NOT 'youtube' AND COALESCE(json_extract(${p}data_json, '$._test'), 0) = 0`;
const ST = { draft: '📝 draft', pending_approval: '⏳ nunggu ✅ Bos', revision: '✏️ revisi', approved: '✅ terjadwal', scheduled: '✅ terjadwal', posted: '📢 tayang', failed: '⚠️ gagal post' };
const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const num = (n) => Number(n ?? 0).toLocaleString('id-ID');
const rp = (n) => `Rp${num(n)}`;
const plus = (n) => ` (${n >= 0 ? '+' : ''}${num(n)})`;
const utcOf = (date) => new Date(Date.parse(`${date}T00:00:00+08:00`)).toISOString().slice(0, 19).replace('T', ' '); // 00:00 WITA → UTC (format DB)
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const dm = (date) => `${date.slice(8)}/${date.slice(5, 7)}`;
function socials() { // angka akun IG/TikTok dari socials.mjs (ditarik tiap jam)
  try { return JSON.parse(readFileSync(new URL('../docs/data/socials.json', import.meta.url), 'utf8')); } catch { return {}; }
}
const accLine = (k, label, s, prev) => {
  const a = s[k];
  if (!a || a.error) return `${label}: <i>data belum ada</i>`;
  const p = prev?.[k];
  return `${label} ${esc(a.handle)}: 👥 ${num(a.followers)}${p ? plus(a.followers - p.f) : ''} · 👀 ${num(a.views)}${p ? plus(a.views - p.v) : ''} · ❤️ ${num(a.likes)}${p ? plus(a.likes - p.l) : ''}`;
};
const snapOf = (s) => JSON.stringify(Object.fromEntries(['instagram', 'tiktok'].filter((k) => s[k] && !s[k].error).map((k) => [k, { f: s[k].followers ?? 0, v: s[k].views ?? 0, l: s[k].likes ?? 0 }])));
const snap = (d, key) => { try { return JSON.parse(flag(d, key) ?? 'null'); } catch { return null; } };
const priceChanges = (d, from) => { try { return d.prepare('SELECT COUNT(*) n FROM price_snapshots WHERE diff IS NOT NULL AND ts >= ?').get(from).n; } catch { return 0; } };

export async function dailyReport({ dry = false } = {}) {
  const d = await db();
  const w = wita();
  const date = w.toISOString().slice(0, 10);
  const from = utcOf(date);
  const made = d.prepare(`SELECT id, slot, format, title, status FROM contents WHERE ${MK()} AND day = ? AND status != 'rejected' ORDER BY id`).all(date);
  const posted = d.prepare(`SELECT c.id, c.title, m.likes, m.comments, m.views FROM contents c
    LEFT JOIN metrics m ON m.id = (SELECT id FROM metrics WHERE content_id = c.id AND platform = 'instagram' ORDER BY id DESC LIMIT 1)
    WHERE ${MK('c.')} AND c.posted_at >= ? ORDER BY c.posted_at`).all(from);
  const waiting = d.prepare(`SELECT COUNT(*) n FROM contents WHERE ${MK()} AND status IN ('pending_approval','revision')`).get().n;
  const tomorrow = d.prepare(`SELECT COUNT(*) n FROM contents WHERE ${MK()} AND day = ? AND status != 'rejected'`).get(addDays(date, 1)).n;
  const boosts = d.prepare("SELECT b.status, b.amount, c.title FROM boosts b JOIN contents c ON c.id = b.content_id WHERE b.created_at >= ? OR b.status = 'active'").all(from);
  const ideas = d.prepare('SELECT COUNT(*) n, COALESCE(SUM(chosen), 0) c FROM ideas WHERE day = ?').get(date);
  const prices = priceChanges(d, from);
  const s = socials();
  const prev = snap(d, 'mk_daily_snap');
  const text = [
    `<b>Raka</b>: 📊 <b>Laporan harian Marketing</b> · ${DAYS[w.getUTCDay()]} ${dm(date)}`, '',
    '<b>Akun</b>', accLine('instagram', '📸 IG', s, prev), accLine('tiktok', '🎵 TikTok', s, prev), '',
    `<b>Produksi hari ini</b> (${made.length} konten)`,
    ...(made.length ? made.map((c) => `• #${c.id} ${esc(c.title.slice(0, 50))} · ${c.format} ${c.slot} — ${ST[c.status] ?? esc(c.status)}`) : ['• belum ada konten hari ini']),
    ...(ideas.n ? [`💡 Ide tambahan briefing: ${ideas.n} (dipilih Andre ${ideas.c})`] : []), '',
    `<b>Tayang hari ini</b> (${posted.length})`,
    ...(posted.length ? posted.map((c) => `• #${c.id} ${esc(c.title.slice(0, 50))} · ❤️ ${num(c.likes)} · 💬 ${num(c.comments)}${c.views ? ` · 👀 ${num(c.views)}` : ''}`) : ['• belum ada yang tayang']), '',
    `💰 Budi: harga zataa.my.id ${prices ? `berubah ${prices}× hari ini` : 'stabil hari ini'}`,
    `🚀 Fahriah: ${boosts.length ? boosts.map((b) => `${esc(b.title.slice(0, 30))} (${b.status}, ${rp(b.amount)})`).join('; ') : 'nggak ada boost baru'}`,
    `⏳ Nunggu ✅/revisi Bos: ${waiting} · 📅 Besok terjadwal: ${tomorrow} konten`,
    prev ? '\n<i>(angka dalam kurung = kenaikan sejak laporan kemarin)</i>' : '',
  ].join('\n').trim();
  if (dry) return text;
  await say(text);
  flag(d, 'mk_daily_snap', snapOf(s));
  chat(d, 'analyst', 'dir', `Laporan harian marketing udah aku kirim ke Bos, ${posted.length} konten tayang hari ini 📊`, 'oper');
  return { made: made.length, posted: posted.length };
}

// performa per jam tayang (slot) 28 hari terakhir, dipisah feed vs video → bahan Andre geser jam di plan Senin
const SLOT_DAYS = 28, SLOT_MIN = 4; // slot baru dinilai kalau sudah ada ≥4 post
const PLAN_SLOT = { feed: 'siang', video: 'malam' }; // jam plan harian sekarang (office/roles/dir.md)
export async function slotStats() {
  const d = await db();
  const rows = d.prepare(`SELECT c.slot, CASE WHEN c.format = 'video' THEN 'video' ELSE 'feed' END kind, COUNT(*) n,
      AVG(m.views) views, AVG(m.likes + 3 * m.comments + 2 * m.saves) score
    FROM contents c JOIN metrics m ON m.id = (SELECT id FROM metrics WHERE content_id = c.id AND platform = 'instagram' ORDER BY id DESC LIMIT 1)
    WHERE ${MK('c.')} AND c.status = 'posted' AND c.posted_at >= datetime('now', ?) GROUP BY c.slot, kind`).all(`-${SLOT_DAYS} days`);
  const out = {};
  for (const kind of ['feed', 'video']) {
    const list = rows.filter((r) => r.kind === kind).sort((a, b) => b.views - a.views);
    const ok = list.filter((r) => r.slot !== 'kilat' && SLOT[r.slot] && r.n >= SLOT_MIN);
    const plan = list.find((r) => r.slot === PLAN_SLOT[kind]);
    const best = ok[0];
    let advice;
    if (!best || !plan || plan.n < SLOT_MIN) advice = `data belum cukup (butuh ≥${SLOT_MIN} post per jam)`;
    else if (best.slot !== plan.slot && best.views >= plan.views * 1.3) advice = `geser ${kind} plan dari ${SLOT[plan.slot]} ke <b>${SLOT[best.slot]} WIB</b> (views +${Math.round((best.views / Math.max(plan.views, 1) - 1) * 100)}%)`;
    else advice = `jam plan ${SLOT[plan.slot]} WIB udah paling oke, pertahankan`;
    out[kind] = { list, advice };
  }
  return out;
}
const slotLines = (st) => ['', `<b>Jam tayang terbaik</b> (${SLOT_DAYS} hari, rata-rata per post)`,
  ...['feed', 'video'].flatMap((kind) => [
    `${kind === 'video' ? '🎬 Video' : '🖼️ Feed'}: ${st[kind].list.length ? st[kind].list.map((r) => `${r.slot === 'kilat' ? 'kilat' : `${SLOT[r.slot] ?? r.slot}`} 👀${num(Math.round(r.views))} ❤️${(r.score).toFixed(1)} (${r.n})`).join(' · ') : 'belum ada data'}`,
    `   → ${st[kind].advice}`])];

export async function weeklyReport({ dry = false } = {}) {
  const d = await db();
  const w = wita();
  const date = w.toISOString().slice(0, 10);
  const monday = addDays(date, -((w.getUTCDay() + 6) % 7));
  const from = utcOf(monday);
  // metrik IG terakhir per konten marketing yang tayang minggu ini (Senin–Minggu WITA)
  const rows = d.prepare(`SELECT c.id, c.title, c.pillar, c.format, m.views, m.likes, m.comments, m.saves
    FROM contents c JOIN metrics m ON m.id = (SELECT id FROM metrics WHERE content_id = c.id AND platform = 'instagram' ORDER BY id DESC LIMIT 1)
    WHERE ${MK('c.')} AND c.posted_at >= ?`).all(from);
  const prod = d.prepare(`SELECT COUNT(*) total, COALESCE(SUM(status = 'posted'), 0) posted, COALESCE(SUM(status = 'rejected'), 0) rejected,
    COALESCE(SUM(status IN ('pending_approval','revision')), 0) waiting, COALESCE(SUM(revisions), 0) revs, COALESCE(SUM(format = 'video'), 0) video
    FROM contents WHERE ${MK()} AND day BETWEEN ? AND ?`).get(monday, date);
  const boost = d.prepare("SELECT COUNT(*) n, COALESCE(SUM(amount), 0) s FROM boosts WHERE created_at >= ? AND status IN ('approved','active')").get(from);
  const prices = priceChanges(d, from);
  const s = socials();
  const prev = snap(d, 'mk_weekly_snap');
  const score = (r) => r.likes + 3 * r.comments + 2 * r.saves;
  const top = [...rows].sort((a, b) => score(b) - score(a)).slice(0, 3);
  const pillars = {};
  for (const r of rows) (pillars[r.pillar ?? 'lain'] ??= []).push(score(r));
  const avg = Object.entries(pillars).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length]).sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((a, r) => ({ likes: a.likes + r.likes, comments: a.comments + r.comments, views: a.views + r.views }), { likes: 0, comments: 0, views: 0 });
  const slots = await slotStats();
  const text = [
    `<b>Raka</b>: 🗓️ <b>Laporan mingguan Marketing</b> · ${dm(monday)}–${dm(date)}`, '',
    '<b>Akun</b>', accLine('instagram', '📸 IG', s, prev), accLine('tiktok', '🎵 TikTok', s, prev), '',
    '<b>Produksi</b>',
    `${prod.total} konten (video ${prod.video}) · 📢 tayang ${prod.posted} · ❌ ditolak ${prod.rejected} · ✏️ revisi ${prod.revs}× · ⏳ masih nunggu ${prod.waiting}`, '',
    `<b>Performa IG</b> (${rows.length} post tayang)`,
    `❤️ ${num(total.likes)} · 💬 ${num(total.comments)}${total.views ? ` · 👀 ${num(total.views)}` : ''}`,
    ...(top.length ? ['<b>Top 3 post:</b>', ...top.map((r, i) => `${i + 1}. #${r.id} ${esc(r.title)} (❤️ ${r.likes} · 💬 ${r.comments})`)] : []),
    ...(avg.length ? ['', '<b>Pilar paling works:</b>', ...avg.map(([k, v]) => `• ${esc(k)}: skor rata-rata ${v.toFixed(1)}`)] : []),
    ...slotLines(slots), '',
    `🚀 Boost minggu ini: ${boost.n}× · ${rp(boost.s)}`,
    `💰 Perubahan harga zataa.my.id: ${prices}×`, '',
    avg.length ? `Saran: perbanyak pilar <b>${esc(avg[0][0])}</b> minggu depan. Andre pakai ini (pilar + jam tayang) buat plan Senin.` : 'Minggu ini belum ada data IG yang cukup buat dianalisis.',
    prev ? '<i>(angka dalam kurung = kenaikan sejak laporan minggu lalu)</i>' : '',
  ].join('\n').trim();
  if (dry) return text;
  await say(text);
  flag(d, 'mk_weekly_snap', snapOf(s));
  chat(d, 'analyst', 'dir', avg.length ? `Kak, laporan minggu ini udah aku kirim ke Bos. Pilar ${avg[0][0]} paling rame 📈` : 'Kak, laporan minggu ini udah aku kirim ke Bos 📈', 'oper');
  return { posts: rows.length };
}

// dipanggil watcher tiap menit: koleksi IG tiap 3 jam, laporan harian 19:00 WITA, mingguan Minggu 19:30 WITA
export async function analystTick() {
  const d = await db();
  const w = wita();
  const day = w.toISOString().slice(0, 10);
  const min = w.getUTCHours() * 60 + w.getUTCMinutes();
  if (env().IG_ACCESS_TOKEN) {
    const hourKey = `${day}-${Math.floor(w.getUTCHours() / 3)}`;
    if (flag(d, 'analyst_collect') !== hourKey) { flag(d, 'analyst_collect', hourKey); return { collect: await collect() }; }
  }
  if (min >= 19 * 60 && flag(d, 'mk_daily') !== day) { flag(d, 'mk_daily', day); return { daily: await dailyReport() }; }
  if (w.getUTCDay() === 0 && min >= 19 * 60 + 30 && flag(d, 'mk_weekly') !== day) { flag(d, 'mk_weekly', day); return { weekly: await weeklyReport() }; }
  return null;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const [cmd] = process.argv.slice(2);
  const dry = process.argv.includes('--dry');
  const show = (r) => console.log(typeof r === 'string' ? r : JSON.stringify(r));
  if (cmd === 'collect') show(await collect());
  else if (cmd === 'daily') show(await dailyReport({ dry }));
  else if (cmd === 'weekly' || cmd === 'report') show(await weeklyReport({ dry }));
  else if (cmd === 'slots') show(await slotStats());
  else console.log('pakai: analyst.mjs collect | daily [--dry] | weekly [--dry] | slots');
}
