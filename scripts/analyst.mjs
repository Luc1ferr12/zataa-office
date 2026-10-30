#!/usr/bin/env node
// Raka (Data Analyst): narik angka post IG (0 token) tiap 3 jam → tabel metrics; laporan divisi Marketing ke bot kantor:
// harian 19:00 WITA, mingguan Minggu 19:30 WITA.
//   node scripts/analyst.mjs collect          tarik metrik sekarang
//   node scripts/analyst.mjs daily [--dry]    laporan harian sekarang (--dry = cetak saja, tidak dikirim)
//   node scripts/analyst.mjs weekly [--dry]   laporan mingguan sekarang
//   node scripts/analyst.mjs slots            performa per jam tayang 28 hari, IG & TikTok terpisah (feed vs video) + saran jam
//   node scripts/analyst.mjs score            skor performa per format/pilar/game 28 hari (Andre pakai buat milih ide)
process.removeAllListeners('warning');
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadEnv, db, say, SLOT } from './approval.mjs';
import { chat } from './chatter.mjs';
import { clickStats, SOURCES } from './golink.mjs';

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
  const posts = d.prepare("SELECT id, title, ig_media_id FROM contents WHERE ig_media_id IS NOT NULL AND COALESCE(channel, '') NOT IN ('youtube', 'story') AND posted_at >= datetime('now', '-14 days')").all();
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
const MK = (p = '') => `COALESCE(${p}channel, '') NOT IN ('youtube', 'story') AND COALESCE(json_extract(${p}data_json, '$._test'), 0) = 0`;
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
// klik link pelacak GO_BASE (scripts/golink.mjs) — satu-satunya sinyal "konten → toko", zataa.my.id nggak punya analytics
const clickLine = (d, from) => {
  try {
    const k = clickStats(d, from);
    if (!k.clicks) return '🔗 Klik ke zataa.my.id: lihat GA4 (Akuisisi → utm_source)';
    const src = k.by_src.map((r) => `${SOURCES[r.src] ?? esc(r.src)} ${r.n}`).join(' · ');
    const top = k.top.length ? `
   konten: ${k.top.map((r) => `#${r.id}${r.title ? ` ${esc(r.title.slice(0, 30))}` : ''} (${r.n})`).join('; ')}` : '';
    return `🔗 Klik ke zataa.my.id: <b>${num(k.clicks)}</b> (${num(k.visitors)} orang) — ${src}${top}`;
  } catch { return '🔗 Klik ke zataa.my.id: data belum kebaca'; }
};
const priceChanges = (d, from) => { try { return d.prepare('SELECT COUNT(*) n FROM price_snapshots WHERE diff IS NOT NULL AND ts >= ?').get(from).n; } catch { return 0; } };

export async function dailyReport({ dry = false } = {}) {
  const d = await db();
  const w = wita();
  const date = w.toISOString().slice(0, 10);
  const from = utcOf(date);
  const made = d.prepare(`SELECT id, slot, format, title, status FROM contents WHERE ${MK()} AND day = ? AND status != 'rejected' ORDER BY id`).all(date);
  const posted = d.prepare(`SELECT c.id, c.title, c.tiktok_id, m.likes, m.comments, m.views, t.views tv, t.likes tl FROM contents c
    LEFT JOIN metrics m ON m.id = (SELECT id FROM metrics WHERE content_id = c.id AND platform = 'instagram' ORDER BY id DESC LIMIT 1)
    LEFT JOIN metrics t ON t.id = (SELECT id FROM metrics WHERE content_id = c.id AND platform = 'tiktok' ORDER BY id DESC LIMIT 1)
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
    ...(posted.length ? posted.map((c) => `• #${c.id} ${esc(c.title.slice(0, 50))}
   📸 👀 ${num(c.views)} · ❤️ ${num(c.likes)} · 💬 ${num(c.comments)}${c.tiktok_id ? ` | 🎵 ${c.tv != null ? `👀 ${num(c.tv)} · ❤️ ${num(c.tl)}` : 'data belum masuk'}` : ''}`) : ['• belum ada yang tayang']), '',
    clickLine(d, from),
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

// performa per JAM TAYANG ASLI (WIB) 28 hari terakhir, per platform (IG / TikTok) & per format (feed vs video)
// → bahan Andre geser jam di plan Senin. IG pakai posted_at, TikTok pakai tiktok_at (jam tayang TikTok asli, socials.mjs).
const SLOT_DAYS = 28, SLOT_MIN = 4; // jam baru dinilai kalau sudah ada ≥4 post
const PLAN_SLOT = { feed: 'siang', video: 'malam' }; // jam plan harian sekarang (office/roles/dir.md)
const PF = { instagram: { label: '📸 Instagram', at: 'c.posted_at' }, tiktok: { label: '🎵 TikTok', at: 'c.tiktok_at' } };
const hourOf = (slot) => +(SLOT[slot] ?? '').slice(0, 2);
const lastMetric = (platform) => `m.id = (SELECT id FROM metrics WHERE content_id = c.id AND platform = '${platform}' ORDER BY id DESC LIMIT 1)`;
export async function slotStats(platform = 'instagram') {
  const d = await db();
  const at = PF[platform].at;
  const rows = d.prepare(`SELECT CAST(strftime('%H', ${at}, '+7 hours') AS INTEGER) hour, CASE WHEN c.format = 'video' THEN 'video' ELSE 'feed' END kind,
      COUNT(*) n, AVG(m.views) views, AVG(m.likes + 3 * m.comments + 2 * COALESCE(m.saves, 0)) score
    FROM contents c JOIN metrics m ON ${lastMetric(platform)}
    WHERE ${MK('c.')} AND ${at} IS NOT NULL AND ${at} >= datetime('now', ?) GROUP BY hour, kind`).all(`-${SLOT_DAYS} days`);
  const out = {};
  for (const kind of ['feed', 'video']) {
    const list = rows.filter((r) => r.kind === kind).sort((a, b) => b.views - a.views);
    if (platform === 'tiktok' && kind === 'feed' && !list.length) continue; // TikTok umumnya video saja
    const plan = list.find((r) => r.hour === hourOf(PLAN_SLOT[kind]));
    const best = list.filter((r) => r.n >= SLOT_MIN)[0];
    let advice;
    if (!best || !plan || plan.n < SLOT_MIN) advice = `data belum cukup (butuh ≥${SLOT_MIN} post per jam)`;
    else if (best.hour !== plan.hour && best.views >= plan.views * 1.3) advice = `geser ${kind} plan dari ${SLOT[PLAN_SLOT[kind]]} ke <b>${String(best.hour).padStart(2, '0')}:00 WIB</b> (views +${Math.round((best.views / Math.max(plan.views, 1) - 1) * 100)}%)`;
    else {
      const hint = list.find((r) => r.n < SLOT_MIN && r.views > plan.views * 1.3); // jam lain kelihatan lebih tinggi tapi datanya masih dikit
      advice = `jam plan ${SLOT[PLAN_SLOT[kind]]} WIB terbaik dari jam yang datanya cukup, pertahankan${hint ? ` (jam ${String(hint.hour).padStart(2, "0")}:00 kelihatan lebih tinggi tapi baru ${hint.n} post, layak dites lewat ide tambahan)` : ""}`;
    }
    out[kind] = { list, advice };
  }
  return out;
}
const hourLines = (st) => Object.entries(st).flatMap(([kind, v]) => [
  `${kind === 'video' ? '🎬 Video' : '🖼️ Feed'}: ${v.list.length ? v.list.map((r) => `${String(r.hour).padStart(2, '0')}:00 👀${num(Math.round(r.views))} ❤️${r.score.toFixed(1)} (${r.n})`).join(' · ') : 'belum ada data'}`,
  `   → ${v.advice}`]);

// blok laporan per platform: total, top 3, pilar, jam tayang terbaik
async function platformBlock(d, platform, from) {
  const rows = d.prepare(`SELECT c.id, c.title, c.pillar, c.format, m.views, m.likes, m.comments, COALESCE(m.saves, 0) saves
    FROM contents c JOIN metrics m ON ${lastMetric(platform)}
    WHERE ${MK('c.')} AND COALESCE(${PF[platform].at}, c.posted_at) >= ?`).all(from);
  const score = (r) => r.likes + 3 * r.comments + 2 * r.saves;
  const top = [...rows].sort((a, b) => b.views - a.views || score(b) - score(a)).slice(0, 3);
  const pillars = {};
  for (const r of rows) (pillars[r.pillar ?? 'lain'] ??= []).push(r.views);
  const avg = Object.entries(pillars).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length]).sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((a, r) => ({ likes: a.likes + r.likes, comments: a.comments + r.comments, views: a.views + r.views }), { likes: 0, comments: 0, views: 0 });
  const lines = ['', `<b>${PF[platform].label}</b> (${rows.length} post tayang minggu ini)`];
  if (rows.length) lines.push(
    `👀 ${num(total.views)} · ❤️ ${num(total.likes)} · 💬 ${num(total.comments)}`,
    'Top 3:', ...top.map((r, i) => `${i + 1}. #${r.id} ${esc(r.title.slice(0, 50))} (👀 ${num(r.views)} · ❤️ ${r.likes} · 💬 ${r.comments})`),
    `Pilar paling ditonton: ${avg.map(([k, v]) => `${esc(k)} ${num(Math.round(v))}`).join(' · ')}`);
  lines.push(`<b>Jam tayang terbaik</b> (${SLOT_DAYS} hari, rata-rata per post, jam WIB):`, ...hourLines(await slotStats(platform)));
  return { lines, rows, best: avg[0]?.[0] };
}

export async function weeklyReport({ dry = false } = {}) {
  const d = await db();
  const w = wita();
  const date = w.toISOString().slice(0, 10);
  const monday = addDays(date, -((w.getUTCDay() + 6) % 7));
  const from = utcOf(monday);
  const prod = d.prepare(`SELECT COUNT(*) total, COALESCE(SUM(status = 'posted'), 0) posted, COALESCE(SUM(status = 'rejected'), 0) rejected,
    COALESCE(SUM(status IN ('pending_approval','revision')), 0) waiting, COALESCE(SUM(revisions), 0) revs, COALESCE(SUM(format = 'video'), 0) video
    FROM contents WHERE ${MK()} AND day BETWEEN ? AND ?`).get(monday, date);
  const boost = d.prepare("SELECT COUNT(*) n, COALESCE(SUM(amount), 0) s FROM boosts WHERE created_at >= ? AND status IN ('approved','active')").get(from);
  const prices = priceChanges(d, from);
  const s = socials();
  const prev = snap(d, 'mk_weekly_snap');
  const ig = await platformBlock(d, 'instagram', from);
  const tt = await platformBlock(d, 'tiktok', from);
  const text = [
    `<b>Raka</b>: 🗓️ <b>Laporan mingguan Marketing</b> · ${dm(monday)}–${dm(date)}`, '',
    '<b>Akun</b>', accLine('instagram', '📸 IG', s, prev), accLine('tiktok', '🎵 TikTok', s, prev), '',
    '<b>Produksi</b>',
    `${prod.total} konten (video ${prod.video}) · 📢 tayang ${prod.posted} · ❌ ditolak ${prod.rejected} · ✏️ revisi ${prod.revs}× · ⏳ masih nunggu ${prod.waiting}`,
    ...ig.lines, ...tt.lines, '',
    clickLine(d, from),
    `🚀 Boost minggu ini: ${boost.n}× · ${rp(boost.s)}`,
    `💰 Perubahan harga zataa.my.id: ${prices}×`, '',
    ig.best || tt.best ? `Saran: pilar paling ditonton IG <b>${esc(ig.best ?? '-')}</b>, TikTok <b>${esc(tt.best ?? '-')}</b>. Andre pakai ini (pilar + jam tayang per platform) buat plan Senin.` : 'Minggu ini belum ada data yang cukup buat dianalisis.',
    prev ? '<i>(angka dalam kurung = kenaikan sejak laporan minggu lalu)</i>' : '',
  ].join('\n').trim();
  if (dry) return text;
  await say(text);
  flag(d, 'mk_weekly_snap', snapOf(s));
  chat(d, 'analyst', 'dir', `Kak, laporan minggu ini udah aku kirim ke Bos. Jam tayang IG & TikTok udah aku pisah ya 📈`, 'oper');
  return { ig: ig.rows.length, tiktok: tt.rows.length };
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

// ---------- skor buat Andre milih ide (0 token): performa IG 28 hari per format / pilar / game + ide yang di-✅/❌ Owner
// eng = like + 3×komen + 2×share + 2×save (angka terakhir tiap konten). Dipanggil sebelum `office.mjs idea pick`.
export async function scoreStats() {
  const d = await db();
  const rows = d.prepare(`SELECT c.format, c.pillar, c.game, m.views, m.likes, m.comments, m.shares, m.saves
    FROM contents c JOIN metrics m ON m.id = (SELECT id FROM metrics WHERE content_id = c.id AND platform = 'instagram' ORDER BY id DESC LIMIT 1)
    WHERE ${MK('c.')} AND c.posted_at >= datetime('now', '-28 days')`).all();
  const eng = (r) => r.likes + 3 * r.comments + 2 * r.shares + 2 * r.saves;
  const group = (key) => Object.entries(rows.reduce((a, r) => {
    const k = r[key] || '-';
    (a[k] ??= { n: 0, eng: 0, views: 0 }).n++;
    a[k].eng += eng(r); a[k].views += r.views;
    return a;
  }, {})).map(([k, v]) => ({ [key]: k, posts: v.n, eng: Math.round(v.eng / v.n), views: Math.round(v.views / v.n) })).sort((a, b) => b.eng - a.eng);
  let ideas = [];
  try {
    ideas = d.prepare(`SELECT COALESCE(pillar, '-') pillar, COALESCE(format, 'feed') format,
      SUM(status IN ('approved', 'made')) ok, SUM(status = 'skipped') no FROM ideas
      WHERE status IN ('approved', 'made', 'skipped') AND day >= date('now', '-28 days') GROUP BY 1, 2 ORDER BY ok DESC`).all();
  } catch { /* tabel ideas belum ada */ }
  return {
    posts: rows.length, rumus: 'eng = like + 3×komen + 2×share + 2×save (rata-rata per post)',
    format: group('format'), pillar: group('pillar'), game: group('game'), owner_ide: ideas,
    catatan: rows.length < 8 ? 'data masih dikit (<8 post), pakai sebagai petunjuk aja' : undefined,
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const [cmd] = process.argv.slice(2);
  const dry = process.argv.includes('--dry');
  const show = (r) => console.log(typeof r === 'string' ? r : JSON.stringify(r));
  if (cmd === 'collect') show(await collect());
  else if (cmd === 'daily') show(await dailyReport({ dry }));
  else if (cmd === 'weekly' || cmd === 'report') show(await weeklyReport({ dry }));
  else if (cmd === 'slots') show({ instagram: await slotStats('instagram'), tiktok: await slotStats('tiktok') });
  else if (cmd === 'score') show(await scoreStats());
  else console.log('pakai: analyst.mjs collect | daily [--dry] | weekly [--dry] | slots | score');
}
