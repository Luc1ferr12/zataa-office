// Inti loop belajar Shorts (Fase 1, 2, 4 — 22 Nov 2026). Murni DB + hitungan, tanpa jaringan, 0 token.
//   - video_stats : snapshot views/likes/retensi tiap video (diisi scripts/learn.mjs collect dari Zernio)
//   - atribut tiap video (tipe hook, jumlah kata, suara, kecepatan, mood, jam, gaya visual) dihitung dari spec → bisa dibandingkan
//   - experiments : SATU variabel per minggu per brand; varian dibagi rata antar video, hasilnya dievaluasi, pemenang dikunci
//   - briefFor    : ringkasan pola + eksperimen yang disuntik ke `office.mjs brief <agent>` penulis/manajer/publisher
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRANDS } from './brand.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// gaya film lemo-opuscar (films/<slug>/film.json) → bisa dibandingkan gaya mana yang paling ditonton
const filmStyle = (film) => { try { return JSON.parse(readFileSync(join(ROOT, String(film), 'film.json'), 'utf8')).style ?? null; } catch { return null; } };

const SQL = [
  `CREATE TABLE IF NOT EXISTS video_stats (id INTEGER PRIMARY KEY AUTOINCREMENT, content_id INTEGER NOT NULL, brand TEXT NOT NULL, platform TEXT NOT NULL,
    day TEXT NOT NULL, age_days INTEGER, views INTEGER DEFAULT 0, likes INTEGER DEFAULT 0, comments INTEGER DEFAULT 0, apv REAL, avd REAL, subs INTEGER,
    captured_at TEXT DEFAULT (datetime('now')), UNIQUE(content_id, platform, day))`,
  `CREATE TABLE IF NOT EXISTS experiments (id INTEGER PRIMARY KEY AUTOINCREMENT, brand TEXT NOT NULL, week TEXT NOT NULL, variable TEXT NOT NULL,
    variants TEXT NOT NULL, decision TEXT, notes TEXT, created_at TEXT DEFAULT (datetime('now')), UNIQUE(brand, week))`,
];
export function ensure(d) { for (const q of SQL) d.exec(q); }

// ---------- variabel eksperimen (satu per minggu per brand, bergilir)
// enforce=true  → otomatis dipasang ke spec saat `shorts-bot new` (voice/speed/mood/jam)
// enforce=false → penulis yang memenuhi (hook/length); yang dicatat adalah varian yang TERBUKTI ada di naskah, brief bilang varian mana yang kurang
const POOL = {
  history: { voice: ['misteri-cewe', 'misteri-cowo'], mood: ['misteri', 'epik'] },
  story: { voice: ['misteri-cewe', 'cewe-kalem'], mood: ['misteri', 'tragis'] },
  marvel: { voice: ['kalem-2', 'kalem-3'], mood: ['epik', 'misteri'] },
  cowo: { voice: ['ceria-vox'], mood: ['ceria'] },
};
export const VARIABLES = {
  hook: { label: 'Tipe hook (kalimat VO adegan 1)', variants: () => ['pertanyaan', 'klaim'], enforce: false,
    how: 'pertanyaan = kalimat pembuka berakhiran "?"; klaim = pernyataan mengejutkan tanpa tanda tanya. Sisa naskah bebas.' },
  jam: { label: 'Jam tayang (WIB)', variants: () => ['12:00', '19:00'], enforce: true, how: 'jam tayang dipasang otomatis oleh shorts-bot new.' },
  voice: { label: 'Suara narator', variants: (b) => POOL[b].voice, enforce: true, how: 'spec.voice dipasang otomatis.' },
  length: { label: 'Panjang naskah', variants: () => ['pendek', 'panjang'], enforce: false,
    how: 'pendek = ≤110 kata total narasi (±45–50 dtk), panjang = ≥111 kata (±55–65 dtk). Film lemo-opuscar maks ±70 dtk.' },
  speed: { label: 'Kecepatan narasi', variants: () => ['0.9', '1'], enforce: true, how: 'spec.speed dipasang otomatis.' },
  mood: { label: 'Mood musik', variants: (b) => POOL[b].mood, enforce: true, how: 'spec.mood dipasang otomatis.' },
};
// 23 Nov 2026: semua video = film lemo-opuscar (suara ElevenLabs/VoxCPM per brand, musik dari mix.py film) → voice/speed/mood bukan variabel lagi
const ORDER = ['hook', 'jam', 'length'];
const OFFSET = { history: 0, story: 1, marvel: 2, cowo: 0 }; // tiap brand beda variabel di minggu yang sama
const LEN_SPLIT = 110;

// ---------- tanggal (string YYYY-MM-DD, WITA)
export const mondayOf = (day) => { const dt = new Date(`${day}T00:00:00Z`); dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7)); return dt.toISOString().slice(0, 10); };
export const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
export const todayWita = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar' }).format(new Date());
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400_000);

// ---------- atribut video (dari spec yang tersimpan di data_json)
export const hookType = (vo) => (/\?\s*["”']?\s*$/.test(String(vo ?? '').trim()) ? 'pertanyaan' : 'klaim');
const voWords = (spec) => (spec.scenes ?? []).reduce((n, s) => n + String(s.vo ?? '').replace(/\*/g, '').trim().split(/\s+/).filter(Boolean).length, 0);
export function attrsOf(spec = {}, jam = null) {
  const sc = spec.scenes ?? [];
  const words = voWords(spec);
  return {
    hook_type: hookType(sc[0]?.vo), words, len: words <= LEN_SPLIT ? 'pendek' : 'panjang', scenes: sc.length,
    voice: spec.voice ?? null, speed: String(spec.speed ?? ''), mood: spec.mood ?? null, jam: jam ?? spec._jam ?? '18:00',
    style: sc.some((s) => Array.isArray(s.clips)) ? 'klip' : 'gambar', hook_text: String(spec.hook ?? sc[0]?.vo ?? '').slice(0, 80),
    ...(spec.film ? { film_style: filmStyle(spec.film) } : {}),
  };
}
const dataOf = (c) => { try { return JSON.parse(c.data_json ?? '{}'); } catch { return {}; } };
const attrsOfContent = (c) => { const x = dataOf(c); return { ...attrsOf(x, x._jam), ...(x._attr ?? {}) }; };

// ---------- eksperimen
export function experimentFor(d, brand, day = todayWita()) {
  ensure(d);
  const week = mondayOf(day);
  let e = d.prepare('SELECT * FROM experiments WHERE brand = ? AND week = ?').get(brand, week);
  if (!e) {
    const idx = Math.floor(Date.parse(`${week}T00:00:00Z`) / (7 * 86400_000));
    const variable = ORDER[(idx + OFFSET[brand]) % ORDER.length];
    d.prepare('INSERT INTO experiments (brand, week, variable, variants) VALUES (?, ?, ?, ?)').run(brand, week, variable, JSON.stringify(VARIABLES[variable].variants(brand)));
    e = d.prepare('SELECT * FROM experiments WHERE brand = ? AND week = ?').get(brand, week);
  }
  return { ...e, variants: JSON.parse(e.variants) };
}
const expRows = (d, brand, expId) => d.prepare(`SELECT c.id, c.title, c.data_json FROM contents c WHERE c.channel = ? AND c.status != 'rejected'
  AND COALESCE(json_extract(c.data_json, '$._test'), 0) = 0 AND json_extract(c.data_json, '$._exp.id') = ?`).all(BRANDS[brand].channel, expId);
function usage(d, brand, exp) {
  const n = Object.fromEntries(exp.variants.map((v) => [v, 0]));
  for (const c of expRows(d, brand, exp.id)) { const v = dataOf(c)._exp?.var; if (v in n) n[v]++; }
  return n;
}
// varian yang paling sedikit dipakai minggu ini → itu yang dibutuhkan video berikutnya (seri → urutan variants)
export function neededVariant(d, brand, exp) {
  const n = usage(d, brand, exp);
  return exp.variants.reduce((best, v) => (n[v] < n[best] ? v : best), exp.variants[0]);
}
// pemenang terkunci per variabel (keputusan eksperimen minggu lalu-lalu): dipakai di minggu yang variabelnya bukan sedang diuji
export function lockedWinners(d, brand) {
  ensure(d);
  const out = {};
  for (const r of d.prepare("SELECT variable, decision FROM experiments WHERE brand = ? AND decision LIKE 'winner:%' ORDER BY week").all(brand)) out[r.variable] = r.decision.slice(7);
  return out;
}

// dipanggil shorts-bot newShort sebelum INSERT: pasang varian eksperimen (voice/speed/mood/jam), kunci pemenang lama, variasi gerak visual, hitung atribut
export function annotate(d, brandKey, p, day) {
  ensure(d);
  const spec = { ...p.spec, scenes: p.spec.scenes.map((s) => ({ ...s })) };
  let jam = p.jam ?? null;
  const notes = [];
  if (p.test) return { spec, jam, meta: {}, notes };
  const exp = experimentFor(d, brandKey, day);
  const need = neededVariant(d, brandKey, exp);
  const locks = lockedWinners(d, brandKey);
  const put = (variable, value, forced) => {
    if (variable === 'jam') { if (forced || !jam) jam = value; }
    else if (variable === 'voice') { if (forced || !spec.voice) spec.voice = value; }
    else if (variable === 'speed') { if (forced || spec.speed == null) spec.speed = parseFloat(value); }
    else if (variable === 'mood') { if (forced || !spec.mood) spec.mood = value; }
  };
  for (const v of ORDER.filter((x) => VARIABLES[x].enforce)) {
    if (v === exp.variable) put(v, need, true);
    else if (locks[v]) put(v, locks[v], false);
  }
  // Fase 4: variasi visual — gerak kamera tiap adegan diacak (tanpa ulang berurutan) biar video antar hari nggak terlihat template sama
  if (!spec.film && !spec.scenes.some((s) => Array.isArray(s.clips))) {
    const MOVES = ['in', 'left', 'out', 'right', 'up'];
    let prev = null;
    for (const s of spec.scenes) {
      if (s.move) { prev = s.move; continue; }
      const pick = MOVES.filter((m) => m !== prev);
      s.move = pick[Math.floor(Math.random() * pick.length)];
      prev = s.move;
    }
  }
  const a = attrsOf(spec, jam);
  const observed = { hook: a.hook_type, length: a.len, jam: a.jam, voice: a.voice, speed: String(parseFloat(a.speed) || a.speed), mood: a.mood }[exp.variable];
  const meta = { _attr: a, _exp: { id: exp.id, week: exp.week, variable: exp.variable, var: observed, need } };
  if (!VARIABLES[exp.variable].enforce && observed !== need) notes.push(`eksperimen minggu ini = ${VARIABLES[exp.variable].label}; video ini ${observed}, padahal yang kurang "${need}" (tetap lolos, tapi minggu ini data varian "${need}" kurang)`);
  return { spec, jam, meta, notes };
}

// ---------- analisis
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };
const avg = (xs) => { const v = xs.filter((x) => x != null && !Number.isNaN(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

// satu baris per video tayang: snapshot terdekat umur 3 hari (≥2), atau terbaru kalau belum ada
export function videoRows(d, brandKey, today = todayWita()) {
  ensure(d);
  const cs = d.prepare(`SELECT c.id, c.day, c.title, c.pillar, c.data_json FROM contents c WHERE c.channel = ? AND c.status = 'posted'
    AND COALESCE(json_extract(c.data_json, '$._test'), 0) = 0 ORDER BY c.day`).all(BRANDS[brandKey].channel);
  const out = [];
  for (const c of cs) {
    const snaps = d.prepare("SELECT * FROM video_stats WHERE content_id = ? AND platform = 'youtube' ORDER BY day").all(c.id);
    if (!snaps.length) continue;
    const good = snaps.filter((s) => (s.age_days ?? 0) >= 2);
    const s = good.length ? good.reduce((b, x) => (Math.abs(x.age_days - 3) < Math.abs(b.age_days - 3) ? x : b)) : snaps[snaps.length - 1];
    out.push({ id: c.id, day: c.day, title: c.title, pillar: c.pillar, age: daysBetween(c.day, today), mature: (s.age_days ?? 0) >= 2, views: s.views, likes: s.likes, comments: s.comments, apv: s.apv, subs: s.subs,
      a: attrsOfContent(c), exp: dataOf(c)._exp ?? null, usulan: dataOf(c)._usulan ?? null });
  }
  const med = median(out.filter((r) => r.mature).map((r) => r.views)) || 1;
  for (const r of out) r.lift = r.views / med;
  return out;
}

const KEYS = [['hook_type', 'Tipe hook'], ['len', 'Panjang naskah'], ['pillar', 'Pilar'], ['jam', 'Jam tayang'], ['voice', 'Suara'], ['speed', 'Kecepatan'], ['mood', 'Mood musik'], ['style', 'Gaya visual'], ['film_style', 'Gaya film']];
const val = (r, k) => (k === 'pillar' ? r.pillar : r.a[k]);
export function groups(rows) {
  const res = [];
  for (const [k, label] of KEYS) {
    const m = new Map();
    for (const r of rows.filter((x) => x.mature)) { const g = val(r, k); if (g == null || g === '') continue; (m.get(g) ?? m.set(g, []).get(g)).push(r); }
    if (m.size < 2) continue; // satu nilai saja = tidak ada pembanding
    res.push({ key: k, label, items: [...m].map(([name, rs]) => ({ name, n: rs.length, lift: avg(rs.map((r) => r.lift)), views: Math.round(avg(rs.map((r) => r.views))), apv: avg(rs.map((r) => r.apv)) })).sort((a, b) => b.lift - a.lift) });
  }
  return res;
}

export function evalExperiment(d, brandKey, exp) {
  const rows = videoRows(d, brandKey).filter((r) => r.exp?.id === exp.id && r.mature);
  const by = Object.fromEntries(exp.variants.map((v) => [v, rows.filter((r) => r.exp.var === v)]));
  const stat = exp.variants.map((v) => ({ v, n: by[v].length, lift: avg(by[v].map((r) => r.lift)), views: Math.round(avg(by[v].map((r) => r.views)) ?? 0), apv: avg(by[v].map((r) => r.apv)) }));
  const ready = stat.every((s) => s.n >= 3);
  const sorted = [...stat].filter((s) => s.lift != null).sort((a, b) => b.lift - a.lift);
  let verdict = 'belum cukup data (butuh ≥3 video matang per varian)';
  let winner = null;
  if (ready && sorted.length >= 2) {
    const [a, b] = sorted;
    const apvOk = a.apv == null || b.apv == null || a.apv >= b.apv - 10;
    if (a.lift >= b.lift * 1.25 && apvOk) { winner = a.v; verdict = `pemenang "${a.v}" (lift ${a.lift.toFixed(2)}× vs ${b.lift.toFixed(2)}×)`; }
    else verdict = 'seri / selisih <25% → tidak ada pemenang, ulang atau lanjut variabel lain';
  }
  return { stat, ready, winner, verdict };
}
// minggu-minggu lewat yang datanya sudah cukup → simpan keputusan (pemenang terkunci / seri)
export function settle(d, brandKey, today = todayWita()) {
  ensure(d);
  const done = [];
  for (const e of d.prepare('SELECT * FROM experiments WHERE brand = ? AND decision IS NULL AND week < ?').all(brandKey, mondayOf(today))) {
    const exp = { ...e, variants: JSON.parse(e.variants) };
    if (daysBetween(e.week, today) < 10) continue; // tunggu data video minggu itu matang (2+ hari)
    const r = evalExperiment(d, brandKey, exp);
    if (!r.ready) { d.prepare("UPDATE experiments SET decision = 'none', notes = ? WHERE id = ?").run(r.verdict, e.id); done.push({ week: e.week, variable: e.variable, decision: 'none' }); continue; }
    d.prepare('UPDATE experiments SET decision = ?, notes = ? WHERE id = ?').run(r.winner ? `winner:${r.winner}` : 'none', r.verdict, e.id);
    done.push({ week: e.week, variable: e.variable, decision: r.winner ?? 'none' });
  }
  return done;
}

const f1 = (x) => (x == null ? '–' : x.toFixed(2));
export function patternLines(d, brandKey, { top = 3 } = {}) {
  const rows = videoRows(d, brandKey);
  const lines = [];
  if (!rows.length) return { rows, lines: ['Belum ada data views per video (scripts/learn.mjs collect belum jalan / video belum tayang).'] };
  const sorted = [...rows].sort((a, b) => b.views - a.views);
  const row = (r) => `"${r.title.slice(0, 48)}" · ${r.views} views · hook ${r.a.hook_type}: "${r.a.hook_text.slice(0, 50)}" · ${r.a.len} · jam ${r.a.jam}${r.a.film_style ? ` · gaya ${r.a.film_style}` : ''}${r.apv != null ? ` · ditonton ${Math.round(r.apv)}%` : ''}`;
  lines.push('TERBAIK:', ...sorted.slice(0, top).map(row), 'TERBURUK:', ...sorted.slice(-top).reverse().map(row));
  const insights = [];
  for (const g of groups(rows)) {
    const [hi, lo] = [g.items[0], g.items[g.items.length - 1]];
    if (hi.n >= 2 && lo.n >= 2 && hi.lift >= lo.lift * 1.2) insights.push(`${g.label}: "${hi.name}" ${f1(hi.lift)}× (n=${hi.n}, ±${hi.views} views) > "${lo.name}" ${f1(lo.lift)}× (n=${lo.n}) — lift 1.0 = median channel`);
  }
  lines.push('POLA:', ...(insights.length ? insights : ['belum ada selisih jelas antar kelompok (data masih sedikit, n<2 per kelompok)']));
  return { rows, lines };
}

// ringkasan buat office.mjs brief: hanya untuk pegawai tim Shorts
export function briefFor(d, agent) {
  const brand = Object.values(BRANDS).find((b) => Object.values(b.team).includes(agent));
  if (!brand) return null;
  ensure(d);
  const exp = experimentFor(d, brand.key);
  const V = VARIABLES[exp.variable];
  const need = neededVariant(d, brand.key, exp);
  const { lines } = patternLines(d, brand.key);
  const locks = lockedWinners(d, brand.key);
  return {
    eksperimen_minggu_ini: { variabel: V.label, varian: exp.variants, dibutuhkan_video_berikutnya: need, otomatis: V.enforce, aturan: V.how },
    ...(Object.keys(locks).length ? { pemenang_terkunci: locks } : {}),
    pola_data: lines,
    aturan: 'Hook & judul berikutnya pelajari TERBAIK vs TERBURUK di atas, jangan ulang pola TERBURUK. Hanya ubah variabel eksperimen minggu ini; sisanya jaga tetap sama supaya hasil bisa dibaca.',
  };
}

// ---------- teks laporan mingguan (dikirim ke bot brand)
export function weeklyText(d, brandKey, today = todayWita()) {
  const b = BRANDS[brandKey];
  const rows = videoRows(d, brandKey, today);
  const exp = experimentFor(d, brandKey, today);
  const ev = evalExperiment(d, brandKey, exp);
  const { lines } = patternLines(d, brandKey);
  const out = [`🧪 Laporan belajar ${b.name} · minggu ${exp.week}`, '', `Video terukur: ${rows.filter((r) => r.mature).length}/${rows.length}`, '',
    `Eksperimen minggu ini: ${VARIABLES[exp.variable].label} (${exp.variants.join(' vs ')})`,
    ...ev.stat.map((s) => `• ${s.v}: ${s.n} video · lift ${f1(s.lift)}× · ±${s.views} views${s.apv != null ? ` · ditonton ${Math.round(s.apv)}%` : ''}`), `→ ${ev.verdict}`, '', ...lines];
  const prev = d.prepare('SELECT week, variable, decision, notes FROM experiments WHERE brand = ? AND decision IS NOT NULL ORDER BY week DESC LIMIT 3').all(brandKey);
  if (prev.length) out.push('', 'Keputusan eksperimen sebelumnya:', ...prev.map((p) => `• ${p.week} ${p.variable}: ${p.decision} (${p.notes ?? ''})`));
  return out.join('\n');
}
