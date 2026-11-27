#!/usr/bin/env node
// Usulan pertumbuhan manajer Shorts (office/daily.md §3U): tiap minggu 3 usulan per brand (1 seri, 1 gaya, 1 tren)
// → ✅/❌ Owner di bot brand → video dibuat dengan "usulan": <id> → dinilai otomatis vs median channel → lanjut / stop. 0 token.
//   node scripts/growth.mjs status [--brand=…]     perlu usulan baru atau tidak, yang menunggu, yang aktif, hasil terakhir
//   kirim usulan ke Owner: node scripts/shorts-bot.mjs usul <file.json> --brand=…
// Semua ditolak → status minta usulan pengganti (maks 3 ronde per minggu). Usulan baru hanya dibuka Senin–Rabu; pengganti kapan saja.
import { pathToFileURL } from 'node:url';
import { openDb } from './db.mjs';
import { BRANDS } from './brand.mjs';
import { videoRows, mondayOf, addDays, todayWita } from './learn-core.mjs';

export const KINDS = { seri: '📺 Seri', gaya: '🎨 Gaya', tren: '🔥 Tren' };
const MAX_ROUNDS = 3, MIN_MATURE = 2, GIVE_UP_DAYS = 14;

export function ensure(d) {
  d.exec(`CREATE TABLE IF NOT EXISTS proposals (id INTEGER PRIMARY KEY AUTOINCREMENT, brand TEXT NOT NULL, week TEXT NOT NULL, round INTEGER NOT NULL,
    kind TEXT NOT NULL, title TEXT NOT NULL, plan TEXT NOT NULL, reason TEXT NOT NULL, videos INTEGER NOT NULL, target REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', result TEXT, created_at TEXT DEFAULT (datetime('now')), decided_at TEXT)`);
}
const get = (d, id) => d.prepare('SELECT * FROM proposals WHERE id = ?').get(id);
const brandRows = (d, brand, where = '', ...args) => d.prepare(`SELECT * FROM proposals WHERE brand = ? ${where} ORDER BY id`).all(brand, ...args);
const videosOf = (d, brand, id) => d.prepare(`SELECT id, title, status FROM contents WHERE channel = ? AND status != 'rejected' AND json_extract(data_json, '$._usulan') = ?`).all(BRANDS[brand].channel, id);

// nilai usulan aktif dari minggu-minggu lewat: lift rata-rata (views ÷ median channel) video yang sudah matang vs target
export function evaluate(d, brand, today = todayWita()) {
  ensure(d);
  const week = mondayOf(today);
  d.prepare("UPDATE proposals SET status = 'expired', result = 'tidak dijawab sampai minggunya lewat' WHERE brand = ? AND status = 'pending' AND week < ?").run(brand, week);
  const open = brandRows(d, brand, "AND status = 'approved' AND week < ?", week);
  if (!open.length) return [];
  const rows = videoRows(d, brand, today);
  const done = [];
  for (const p of open) {
    const mine = rows.filter((r) => r.usulan === p.id && r.mature);
    const overdue = today >= addDays(p.week, GIVE_UP_DAYS);
    let status, result;
    // dinilai kalau semua video rencana sudah terukur; lewat 14 hari → cukup ≥2 (sebelum itu sisa videonya masih boleh dibuat)
    if (mine.length >= p.videos || (overdue && mine.length >= MIN_MATURE)) {
      const lift = mine.reduce((a, r) => a + r.lift, 0) / mine.length;
      status = lift >= p.target ? 'lanjut' : 'stop';
      result = `${mine.length} video · rata-rata ${lift.toFixed(2)}× median channel (target ${p.target.toFixed(2)}×)`;
    } else if (overdue) {
      status = 'data_kurang';
      result = `cuma ${mine.length} video terukur dalam ${GIVE_UP_DAYS} hari (dibuat ${videosOf(d, brand, p.id).length} dari ${p.videos})`;
    } else continue;
    d.prepare('UPDATE proposals SET status = ?, result = ? WHERE id = ?').run(status, result, p.id);
    done.push({ id: p.id, title: p.title, status, result });
  }
  return done;
}

export function status(d, brand, today = todayWita()) {
  evaluate(d, brand, today);
  const week = mondayOf(today);
  const now = brandRows(d, brand, 'AND week = ?', week);
  const rounds = now.reduce((m, p) => Math.max(m, p.round), 0);
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  let perlu = false, alasan;
  if (!now.length) {
    perlu = dow >= 1 && dow <= 3;
    alasan = perlu ? 'belum ada usulan minggu ini' : 'usulan baru dibuka lagi Senin';
  } else if (now.every((p) => p.status === 'rejected')) {
    perlu = rounds < MAX_ROUNDS;
    alasan = perlu ? `semua ditolak Owner → ajukan pengganti (ronde ${rounds + 1}/${MAX_ROUNDS}), jangan ulang ide yang ditolak` : `sudah ${MAX_ROUNDS} ronde ditolak → stop, minta arahan Owner`;
  } else alasan = 'usulan minggu ini sudah dikirim';
  const brief = (p) => ({ id: p.id, jenis: p.kind, judul: p.title, rencana: p.plan, target: `${p.target}× median`, video: `${videosOf(d, brand, p.id).length}/${p.videos}` });
  return {
    brand, minggu: week, perlu_usulan: perlu, alasan,
    menunggu_owner: now.filter((p) => p.status === 'pending').map(brief),
    aktif: brandRows(d, brand, "AND status = 'approved'").map(brief),
    ditolak_minggu_ini: now.filter((p) => p.status === 'rejected').map((p) => p.title),
    hasil_terakhir: brandRows(d, brand, "AND status IN ('lanjut', 'stop', 'data_kurang')").slice(-4).map((p) => ({ judul: p.title, keputusan: p.status, hasil: p.result })),
  };
}

const clean = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
// items = [{ jenis, judul, rencana, alasan, video (2–5), target (1.0–3.0 × median) }] → tepat satu per jenis
export function add(d, brand, items, today = todayWita()) {
  const s = status(d, brand, today);
  if (!s.perlu_usulan) throw new Error(`belum perlu usulan baru: ${s.alasan}`);
  const kinds = Array.isArray(items) ? items.map((x) => x?.jenis).sort().join(',') : '';
  if (kinds !== Object.keys(KINDS).sort().join(',')) throw new Error(`harus 3 usulan, satu per jenis: ${Object.keys(KINDS).join(', ')}`);
  const rows = items.map((x) => {
    const r = { kind: x.jenis, title: clean(x.judul, 80), plan: clean(x.rencana, 400), reason: clean(x.alasan, 300), videos: +(x.video ?? 3), target: +(x.target ?? 1.2) };
    if (!r.title || !r.plan || !r.reason) throw new Error(`usulan ${x.jenis}: judul, rencana, alasan wajib diisi`);
    if (!Number.isInteger(r.videos) || r.videos < MIN_MATURE || r.videos > 5) throw new Error(`usulan ${x.jenis}: video harus ${MIN_MATURE}–5`);
    if (!(r.target >= 1 && r.target <= 3)) throw new Error(`usulan ${x.jenis}: target harus 1.0–3.0 (kali median views channel)`);
    return r;
  });
  const week = mondayOf(today);
  const round = brandRows(d, brand, 'AND week = ?', week).reduce((m, p) => Math.max(m, p.round), 0) + 1;
  const ins = d.prepare('INSERT INTO proposals (brand, week, round, kind, title, plan, reason, videos, target) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  return rows.map((r) => get(d, Number(ins.run(brand, week, round, r.kind, r.title, r.plan, r.reason, r.videos, r.target).lastInsertRowid)));
}
export const remove = (d, ids) => { for (const id of ids) d.prepare("DELETE FROM proposals WHERE id = ? AND status = 'pending'").run(id); };

// keputusan Owner; null = tombol basi (usulan nggak ada / sudah diputus / kedaluwarsa)
export function decide(d, brand, id, ok, today = todayWita()) {
  ensure(d);
  const p = get(d, id);
  if (!p || p.brand !== brand || p.status !== 'pending' || p.week !== mondayOf(today)) return null;
  d.prepare("UPDATE proposals SET status = ?, decided_at = datetime('now') WHERE id = ?").run(ok ? 'approved' : 'rejected', id);
  return get(d, id);
}

// video baru yang menjalankan usulan: cuma boleh usulan brand ini yang sudah ✅
export function checkTag(d, brand, id) {
  ensure(d);
  const p = get(d, +id);
  if (!p || p.brand !== brand) throw new Error(`usulan #${id} tidak ada di brand ini (node scripts/growth.mjs status --brand=${brand})`);
  if (p.status !== 'approved') throw new Error(`usulan #${id} statusnya ${p.status}, belum bisa dipakai (harus ✅ Owner & belum dinilai)`);
  return p.id;
}

export const messageText = (p) => [`${KINDS[p.kind]} · <b>${esc(p.title)}</b>`, esc(p.plan), `📊 ${esc(p.reason)}`, `🎯 ${p.videos} video, target ${p.target}× median views channel`].join('\n');
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

// buat office.mjs brief pegawai tim Shorts
export function briefGrowth(d, agent) {
  const b = Object.values(BRANDS).find((x) => Object.values(x.team).includes(agent));
  if (!b) return null;
  const s = status(d, b.key);
  const manajer = agent === b.team.dir;
  if (!manajer && !s.aktif.length) return null;
  return {
    ...(manajer ? { perlu_usulan: s.perlu_usulan, alasan: s.alasan, menunggu_owner: s.menunggu_owner.map((p) => p.judul), ditolak_minggu_ini: s.ditolak_minggu_ini, hasil_terakhir: s.hasil_terakhir } : {}),
    aktif: s.aktif,
    ...(s.aktif.length ? { aturan: 'Video yang menjalankan usulan aktif WAJIB diberi "usulan": <id> di JSON shorts-bot new (tanpa itu hasilnya tidak terukur).' } : {}),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [cmd] = process.argv.slice(2).filter((x) => !x.startsWith('--brand='));
  const arg = process.argv.find((x) => x.startsWith('--brand='));
  if (cmd !== 'status') { console.log('pakai: growth.mjs status [--brand=history|story|marvel|cowo]'); process.exit(1); }
  const d = openDb();
  for (const k of arg ? [arg.slice(8)] : Object.keys(BRANDS)) console.log(JSON.stringify(status(d, k)));
}
