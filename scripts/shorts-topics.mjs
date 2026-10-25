#!/usr/bin/env node
// Bank topik YouTube Shorts (DB tabel shorts_topics). Tiap ide video punya data lengkap sebelum diproduksi (aturan Owner 18 Okt).
// Niche sejak 26 Okt 2026 (keputusan Owner): MISTERI & HOROR NUSANTARA berbasis sejarah.
// Kuota mingguan (Senin–Minggu): 7 Shorts, WAJIB ≥3 Horor Bersejarah, maks 1 Misteri Dunia, sisanya bebas pilar Nusantara. Tanpa AI → 0 token.
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
import { openDb } from './db.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const PILLARS = {
  horor_sejarah: { code: 'HS', label: 'Horor Bersejarah', desc: 'tempat angker & cerita seram Nusantara + kisah nyata/sejarah di baliknya (WAJIB ≥3/minggu)' },
  legenda_mitos: { code: 'LM', label: 'Legenda & Mitos Nusantara', desc: 'legenda rakyat, makhluk mitos, asal-usul tempat; dikaitkan ke fakta (label mitos)' },
  sejarah_kelam: { code: 'SK', label: 'Sejarah Kelam Nusantara', desc: 'tragedi, bencana, wabah, pembantaian, kapal karam di Nusantara' },
  misteri_kuno: { code: 'MK', label: 'Misteri Kuno Nusantara', desc: 'situs, kerajaan, manusia purba & peninggalan Nusantara yang masih misterius' },
  ritual_mistis: { code: 'RM', label: 'Ritual & Tradisi Mistis', desc: 'ritual, pemakaman & kepercayaan adat Nusantara (hormat, bukan diejek)' },
  peristiwa_aneh: { code: 'PA', label: 'Peristiwa Aneh Nusantara', desc: 'kejadian/fenomena nyata yang ganjil, kapal hantu, hilang misterius (rumor/hoaks ditulis jelas)' },
  misteri_dunia: { code: 'MD', label: 'Misteri Dunia', desc: 'misteri & sejarah kuno luar Nusantara (maks 1/minggu)' },
  // pilar lama (niche sejarah kuno dunia, s.d. 25 Okt): cuma buat label data lama, topik baru ditolak
  hidden_history: { code: 'HH', label: 'Hidden History', desc: 'sejarah tersembunyi, fakta jarang diketahui, kisah masa lalu yang terlewat', legacy: true },
  lost_civilizations: { code: 'LC', label: 'Lost Civilizations', desc: 'peradaban runtuh, kota ditinggalkan, masyarakat kuno yang hilang/berubah', legacy: true },
  historical_figures: { code: 'HF', label: 'Historical Figures', desc: 'raja, kaisar, penemu, pemimpin, tokoh yang mengubah dunia', legacy: true },
  historical_mysteries: { code: 'HM', label: 'Historical Mysteries', desc: 'misteri sejarah yang belum terpecahkan / masih diperdebatkan', legacy: true },
  ancient_secrets: { code: 'AS', label: 'Ancient Secrets & Inventions', desc: 'teknologi kuno, penemuan, matematika & pengetahuan masa lalu', legacy: true },
  strange_events: { code: 'SE', label: 'Strange Historical Events', desc: 'peristiwa nyata yang absurd, aneh, sulit dipercaya', legacy: true },
  greek_myth: { code: 'GM', label: 'Mitologi Yunani', desc: 'dewa-dewi, Titan, pahlawan, monster (pilar bebas, label mitos)', legacy: true },
};
export const STATUSES = ['backlog', 'research', 'approved', 'production', 'published'];
export const WEEK_TOTAL = 7, CORE = 'horor_sejarah', CORE_MIN = 3, FOREIGN = 'misteri_dunia', FOREIGN_MAX = 1;
const QUOTA_START = '2026-10-26'; // kuota niche Nusantara berlaku mulai minggu ini (Senin)

const SQL = `CREATE TABLE IF NOT EXISTS shorts_topics (
  topic_id TEXT PRIMARY KEY, pillar TEXT NOT NULL, subject TEXT NOT NULL, core_question TEXT, angle TEXT, hook TEXT,
  sources TEXT, evergreen_score INTEGER, status TEXT NOT NULL DEFAULT 'backlog', published_url TEXT, content_id INTEGER, notes TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`;

export async function tdb() {
  const d = openDb();
  d.exec(SQL);
  return d;
}
const active = () => Object.keys(PILLARS).filter((k) => !PILLARS[k].legacy);
const srcOf = (t) => { try { return JSON.parse(t.sources ?? '[]'); } catch { return []; } };
export const getTopic = (d, id) => d.prepare('SELECT * FROM shorts_topics WHERE topic_id = ?').get(id);

function clean(p, partial = false) {
  const o = {};
  if (p.pillar !== undefined) { if (!PILLARS[p.pillar] || PILLARS[p.pillar].legacy) throw new Error(`pillar tidak dikenal/lama: ${p.pillar} (pakai: ${active().join(', ')})`); o.pillar = p.pillar; }
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
  const core = rows.filter((r) => r.pillar === CORE).length, foreign = rows.filter((r) => r.pillar === FOREIGN).length;
  const left = Math.max(0, WEEK_TOTAL - rows.length);
  const needCore = Math.max(0, CORE_MIN - core);
  return { mon, sun, rows, core, foreign, left, needCore, quota: mon >= QUOTA_START, mustCore: mon >= QUOTA_START && needCore > 0 && needCore >= left };
}
// lempar error kalau Shorts dengan pilar ini melanggar kuota minggu itu (Horor Bersejarah ≥3, Misteri Dunia maks 1, pilar lama ditolak)
export function checkQuota(d, day, pillar, excludeId = null) {
  const w = weekStats(d, day, excludeId);
  if (w.mon < QUOTA_START) return w;
  if (w.left <= 0) throw new Error(`minggu ${w.mon}–${w.sun} sudah ${WEEK_TOTAL} Shorts (maks 1/hari)`);
  if (PILLARS[pillar]?.legacy) throw new Error(`pilar ${pillar} sudah nggak dipakai (niche sekarang misteri & horor Nusantara), pindahkan topiknya ke pilar baru`);
  if (pillar === FOREIGN && w.foreign >= FOREIGN_MAX) throw new Error(`kuota: Misteri Dunia maksimal ${FOREIGN_MAX}/minggu dan sudah terpakai, pilih topik Nusantara`);
  if (pillar !== CORE && w.needCore >= w.left) throw new Error(`kuota: minggu ini masih butuh ${w.needCore} Horor Bersejarah dan sisa slot ${w.left}, jadi Shorts ini WAJIB pilar ${CORE}`);
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
    if (cmd === 'pillars') print(Object.entries(PILLARS).filter(([, v]) => !v.legacy).map(([k, v]) => `${k} (${v.code}) — ${v.label}: ${v.desc}`).join('\n'));
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
        print(`Minggu ${w.mon}–${w.sun}: ${w.rows.length}/${WEEK_TOTAL} Shorts, Horor Bersejarah ${w.core}/${CORE_MIN}, Misteri Dunia ${w.foreign}/${FOREIGN_MAX} maks (sisa slot ${w.left})`);
        for (const r of w.rows) print(`  ${r.day} #${r.id} [${r.topic ?? 'tanpa topik'}${r.pillar ? ` ${PILLARS[r.pillar].code}` : ''}] ${r.title}`);
      }
      const used = w.rows.some((r) => r.day === day);
      print(used ? `${day}: sudah ada Shorts.` : `${day}: ${w.mustCore ? 'WAJIB Horor Bersejarah' : `bebas pilar Nusantara (masih butuh ${w.needCore} Horor Bersejarah dari ${w.left} slot${w.foreign >= FOREIGN_MAX ? ', Misteri Dunia sudah habis' : ''})`}`);
      if (cmd === 'next') {
        const skip = Object.keys(PILLARS).filter((k) => PILLARS[k].legacy).concat(w.foreign >= FOREIGN_MAX ? [FOREIGN] : []).map((k) => `'${k}'`).join(', ');
        const rows = d.prepare(`SELECT * FROM shorts_topics WHERE status = 'approved' AND pillar NOT IN (${skip}) ${w.mustCore ? `AND pillar = '${CORE}'` : ''}
          ORDER BY pillar = '${CORE}' DESC, evergreen_score DESC, topic_id LIMIT 5`).all();
        print(rows.length ? rows.map(line).join('\n') : '⚠️ belum ada topik approved yang cocok — Nadhira/Bagas isi bank dulu (add → approved)');
      }
    } else { print('pakai: pillars | add <json> | list [status] [pillar] | get <id> | set <id> <json> | week [tgl] | next [tgl]'); process.exit(1); }
  } catch (e) { console.error(e.message); process.exit(1); }
}
