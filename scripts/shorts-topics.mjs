#!/usr/bin/env node
// Bank topik YouTube Shorts (DB tabel shorts_topics). Tiap ide video punya data lengkap sebelum diproduksi (aturan Owner 18 Okt).
// Kuota mingguan (Senin–Minggu): 7 Shorts, WAJIB ≥4 Hidden History, 3 sisanya bebas pilar mana saja. Tanpa AI → 0 token.
//   node scripts/shorts-topics.mjs pillars                     daftar pilar + kode
//   node scripts/shorts-topics.mjs add <json|file>             tambah 1 topik atau array topik (topic_id otomatis, status awal backlog)
//   node scripts/shorts-topics.mjs list [status] [pillar]      daftar ringkas (default: semua kecuali published)
//   node scripts/shorts-topics.mjs get <topic_id>
//   node scripts/shorts-topics.mjs set <topic_id> <json|file>  ubah field (status approved wajib lengkap: core_question, angle, hook, ≥2 sources, evergreen_score)
//   node scripts/shorts-topics.mjs week [tgl]                  kuota minggu itu (per pilar) + pilar yang wajib untuk hari tgl
//   node scripts/shorts-topics.mjs next [tgl]                  rekomendasi topik approved untuk hari tgl (sesuai kuota)
// Status: backlog → research → approved → production (otomatis saat shorts-bot new) → published (otomatis saat tayang, isi published_url).
process.removeAllListeners('warning');
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const PILLARS = {
  hidden_history: { code: 'HH', label: 'Hidden History', desc: 'sejarah tersembunyi, fakta jarang diketahui, kisah masa lalu yang terlewat (WAJIB ≥4/minggu)' },
  lost_civilizations: { code: 'LC', label: 'Lost Civilizations', desc: 'peradaban runtuh, kota ditinggalkan, masyarakat kuno yang hilang/berubah' },
  historical_figures: { code: 'HF', label: 'Historical Figures', desc: 'raja, kaisar, penemu, pemimpin, tokoh yang mengubah dunia' },
  historical_mysteries: { code: 'HM', label: 'Historical Mysteries', desc: 'misteri sejarah yang belum terpecahkan / masih diperdebatkan' },
  ancient_secrets: { code: 'AS', label: 'Ancient Secrets & Inventions', desc: 'teknologi kuno, penemuan, matematika & pengetahuan masa lalu' },
  strange_events: { code: 'SE', label: 'Strange Historical Events', desc: 'peristiwa nyata yang absurd, aneh, sulit dipercaya' },
  greek_myth: { code: 'GM', label: 'Mitologi Yunani', desc: 'dewa-dewi, Titan, pahlawan, monster (pilar bebas, label mitos)' },
};
export const STATUSES = ['backlog', 'research', 'approved', 'production', 'published'];
export const WEEK_TOTAL = 7, HH_MIN = 4;
const QUOTA_START = '2026-10-19'; // aturan kuota berlaku mulai minggu ini (Senin)

const SQL = `CREATE TABLE IF NOT EXISTS shorts_topics (
  topic_id TEXT PRIMARY KEY, pillar TEXT NOT NULL, subject TEXT NOT NULL, core_question TEXT, angle TEXT, hook TEXT,
  sources TEXT, evergreen_score INTEGER, status TEXT NOT NULL DEFAULT 'backlog', published_url TEXT, content_id INTEGER, notes TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`;

export async function tdb() {
  const { DatabaseSync } = await import('node:sqlite');
  const d = new DatabaseSync(join(ROOT, 'db', 'office.db'));
  d.exec(SQL);
  return d;
}
const srcOf = (t) => { try { return JSON.parse(t.sources ?? '[]'); } catch { return []; } };
export const getTopic = (d, id) => d.prepare('SELECT * FROM shorts_topics WHERE topic_id = ?').get(id);

function clean(p, partial = false) {
  const o = {};
  if (p.pillar !== undefined) { if (!PILLARS[p.pillar]) throw new Error(`pillar tidak dikenal: ${p.pillar} (pakai: ${Object.keys(PILLARS).join(', ')})`); o.pillar = p.pillar; }
  for (const k of ['subject', 'core_question', 'angle', 'hook', 'published_url', 'notes']) if (p[k] !== undefined) o[k] = p[k] == null ? null : String(p[k]);
  if (p.sources !== undefined) o.sources = JSON.stringify((Array.isArray(p.sources) ? p.sources : String(p.sources).split(/\s+/)).filter(Boolean));
  if (p.evergreen_score !== undefined) { const n = Number(p.evergreen_score); if (!(n >= 1 && n <= 5)) throw new Error('evergreen_score harus 1–5'); o.evergreen_score = Math.round(n); }
  if (p.status !== undefined) { if (!STATUSES.includes(p.status)) throw new Error(`status harus: ${STATUSES.join(' | ')}`); o.status = p.status; }
  if (!partial && (!o.pillar || !o.subject)) throw new Error('butuh pillar + subject');
  return o;
}
function checkReady(t) {
  const miss = ['core_question', 'angle', 'hook'].filter((k) => !t[k]);
  if (srcOf(t).length < 2) miss.push('sources (≥2 URL)');
  if (!t.evergreen_score) miss.push('evergreen_score');
  if (miss.length) throw new Error(`topik ${t.topic_id} belum bisa approved, kurang: ${miss.join(', ')}`);
}

export async function addTopics(input) {
  const d = await tdb();
  const out = [];
  for (const p of Array.isArray(input) ? input : [input]) {
    const o = clean({ status: 'backlog', ...p });
    const code = PILLARS[o.pillar].code;
    const last = d.prepare("SELECT topic_id FROM shorts_topics WHERE topic_id LIKE ? ORDER BY topic_id DESC LIMIT 1").get(`${code}-%`);
    o.topic_id = `${code}-${String((last ? Number(last.topic_id.slice(3)) : 0) + 1).padStart(3, '0')}`;
    if (o.status === 'approved') checkReady(o);
    const keys = Object.keys(o);
    d.prepare(`INSERT INTO shorts_topics (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).run(...keys.map((k) => o[k]));
    out.push(o.topic_id);
  }
  return { ok: true, added: out };
}

export async function setTopic(id, p) {
  const d = await tdb();
  const t = getTopic(d, id);
  if (!t) throw new Error(`topik ${id} tidak ada`);
  const o = clean(p, true);
  if ((o.status ?? t.status) === 'approved') checkReady({ ...t, ...o });
  const keys = Object.keys(o);
  if (keys.length) d.prepare(`UPDATE shorts_topics SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE topic_id = ?`).run(...keys.map((k) => o[k]), id);
  return getTopic(d, id);
}

// dipanggil shorts-bot: production saat Shorts dibuat, published saat tayang, balik backlog saat Owner ❌
export function syncTopic(d, id, status, { url = null, contentId = null, note = null } = {}) {
  if (!id) return;
  d.exec(SQL);
  d.prepare(`UPDATE shorts_topics SET status = ?, published_url = COALESCE(?, published_url), content_id = COALESCE(?, content_id),
    notes = CASE WHEN ? IS NULL THEN notes ELSE trim(COALESCE(notes, '') || ' ' || ?) END, updated_at = datetime('now') WHERE topic_id = ?`)
    .run(status, url, contentId, note, note, id);
}

// ---------- kuota mingguan (Senin–Minggu)
const iso = (dt) => dt.toISOString().slice(0, 10);
export function weekOf(day) {
  const dt = new Date(`${day}T00:00:00Z`);
  const mon = new Date(dt); mon.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  const sun = new Date(mon); sun.setUTCDate(mon.getUTCDate() + 6);
  return { mon: iso(mon), sun: iso(sun) };
}
export function weekStats(d, day, excludeId = null) {
  d.exec(SQL);
  const { mon, sun } = weekOf(day);
  const rows = d.prepare(`SELECT c.id, c.day, c.title, json_extract(c.data_json, '$._topic') topic, t.pillar FROM contents c
    LEFT JOIN shorts_topics t ON t.topic_id = json_extract(c.data_json, '$._topic')
    WHERE c.channel = 'youtube' AND c.status != 'rejected' AND COALESCE(json_extract(c.data_json, '$._test'), 0) = 0 AND c.day BETWEEN ? AND ? AND c.id IS NOT ?
    ORDER BY c.day, c.id`).all(mon, sun, excludeId);
  const hh = rows.filter((r) => r.pillar === 'hidden_history').length;
  const left = Math.max(0, WEEK_TOTAL - rows.length);
  const needHH = Math.max(0, HH_MIN - hh);
  return { mon, sun, rows, hh, left, needHH, mustHH: mon >= QUOTA_START && needHH > 0 && needHH >= left };
}
// lempar error kalau Shorts dengan pilar ini bikin kuota Hidden History minggu itu mustahil terpenuhi
export function checkQuota(d, day, pillar, excludeId = null) {
  const w = weekStats(d, day, excludeId);
  if (w.mon < QUOTA_START) return w;
  if (w.left <= 0) throw new Error(`minggu ${w.mon}–${w.sun} sudah ${WEEK_TOTAL} Shorts (maks 1/hari)`);
  if (pillar !== 'hidden_history' && w.needHH >= w.left) throw new Error(`kuota: minggu ini masih butuh ${w.needHH} Hidden History dan sisa slot ${w.left}, jadi Shorts ini WAJIB pilar hidden_history`);
  return w;
}

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar' }).format(new Date());
const line = (t) => `${t.topic_id}\t${t.status}\t${PILLARS[t.pillar]?.label ?? t.pillar}\tEG${t.evergreen_score ?? '-'}\t${t.subject}${t.core_question ? ` — ${t.core_question}` : ''}`;

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [cmd, a, b] = process.argv.slice(2);
  const json = (s) => JSON.parse(existsSync(s) ? readFileSync(s, 'utf8') : s);
  const print = (o) => console.log(typeof o === 'string' ? o : JSON.stringify(o, null, 1));
  try {
    const d = await tdb();
    if (cmd === 'pillars') print(Object.entries(PILLARS).map(([k, v]) => `${k} (${v.code}) — ${v.label}: ${v.desc}`).join('\n'));
    else if (cmd === 'add') print(await addTopics(json(a)));
    else if (cmd === 'get') { const t = getTopic(d, a); if (!t) throw new Error(`topik ${a} tidak ada`); print({ ...t, sources: srcOf(t) }); }
    else if (cmd === 'set') print(await setTopic(a, json(b)));
    else if (cmd === 'list') {
      const st = STATUSES.includes(a) ? a : null, pl = PILLARS[a] ? a : PILLARS[b] ? b : null;
      const rows = d.prepare(`SELECT * FROM shorts_topics WHERE (? IS NULL AND status != 'published' OR status = ?) AND (? IS NULL OR pillar = ?) ORDER BY status, pillar, evergreen_score DESC, topic_id`).all(st, st, pl, pl);
      print(rows.length ? rows.map(line).join('\n') : '(kosong)');
      const n = d.prepare("SELECT pillar, COUNT(*) n FROM shorts_topics WHERE status = 'approved' GROUP BY pillar").all();
      print(`approved siap pakai: ${n.map((r) => `${PILLARS[r.pillar]?.code ?? r.pillar} ${r.n}`).join(', ') || '0'}`);
    } else if (cmd === 'week' || cmd === 'next') {
      const day = a ?? today();
      const w = weekStats(d, day);
      if (cmd === 'week') {
        print(`Minggu ${w.mon}–${w.sun}: ${w.rows.length}/${WEEK_TOTAL} Shorts, Hidden History ${w.hh}/${HH_MIN} (sisa slot ${w.left})`);
        for (const r of w.rows) print(`  ${r.day} #${r.id} [${r.topic ?? 'tanpa topik'}${r.pillar ? ` ${PILLARS[r.pillar].code}` : ''}] ${r.title}`);
      }
      const used = w.rows.some((r) => r.day === day);
      print(used ? `${day}: sudah ada Shorts.` : `${day}: ${w.mustHH ? 'WAJIB Hidden History' : `bebas (masih butuh ${w.needHH} Hidden History dari ${w.left} slot)`}`);
      if (cmd === 'next') {
        const rows = d.prepare(`SELECT * FROM shorts_topics WHERE status = 'approved' ${w.mustHH ? "AND pillar = 'hidden_history'" : ''} ORDER BY evergreen_score DESC, topic_id LIMIT 5`).all();
        print(rows.length ? rows.map(line).join('\n') : '⚠️ belum ada topik approved yang cocok — Nadhira/Bagas isi bank dulu (add → approved)');
      }
    } else { print('pakai: pillars | add <json> | list [status] [pillar] | get <id> | set <id> <json> | week [tgl] | next [tgl]'); process.exit(1); }
  } catch (e) { console.error(e.message); process.exit(1); }
}
