// ❌ Owner = tim WAJIB cari konten pengganti (Owner 25 Nov 2026). Tugasnya dicatat di DB (tabel redo), bukan cuma di memori proses:
// restart watcher (deploy) atau Claude gagal nggak boleh bikin penggantinya hilang (kejadian Shorts Zaa Story #229).
// kind 'content' → ref = konten yang ditolak · kind 'ideas' → ref = ide pertama dari sesi riset yang ditolak semua.
// channel = channel Shorts ('youtube' | 'story' | 'marvel' | 'cowo') atau 'esports' (bot kantor); tiap bot cuma ngambil punyanya.
// result = id konten / ide pengganti, diisi oleh perintah yang membuatnya (lewat env di bawah), jadi nggak tergantung omongan model.
const SQL = `CREATE TABLE IF NOT EXISTS redo (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, ref INTEGER NOT NULL,
  channel TEXT NOT NULL, note TEXT, status TEXT NOT NULL DEFAULT 'open', tries INTEGER NOT NULL DEFAULT 0, pid INTEGER, result INTEGER,
  next_at TEXT NOT NULL DEFAULT (datetime('now')), created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(kind, ref))`; // status: open | running | done | failed

export const REDO_ENV = { content: 'ZAA_GANTI_KONTEN', ideas: 'ZAA_GANTI_IDE' };
export const RETRY_MIN = [15, 60, 180]; // jeda sebelum coba lagi (limit Claude bisa lama); percobaan ke-4 gagal = menyerah
const STALE_MIN = 120; // klaim lebih lama dari ini dianggap macet

const ready = (d) => { d.exec(SQL); return d; };
const alive = (pid) => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

export const addRedo = (d, kind, ref, channel, note = null) =>
  ready(d).prepare('INSERT OR IGNORE INTO redo (kind, ref, channel, note) VALUES (?, ?, ?, ?)').run(kind, ref, channel, note).changes > 0;
export const getRedo = (d, kind, ref) => ready(d).prepare('SELECT * FROM redo WHERE kind = ? AND ref = ?').get(kind, ref) ?? null;
export const countRedo = (d, kind, note) => ready(d).prepare('SELECT COUNT(*) n FROM redo WHERE kind = ? AND note = ?').get(kind, note).n;

// tugas berikutnya yang siap dikerjakan; yang klaimnya yatim (proses mati) dibuka lagi dulu
export function dueRedo(d, channel) {
  ready(d);
  const stale = d.prepare(`SELECT id, pid, updated_at < datetime('now', ?) old FROM redo WHERE channel = ? AND status = 'running'`).all(`-${STALE_MIN} minutes`, channel);
  for (const r of stale) if (r.old || !alive(r.pid)) d.prepare("UPDATE redo SET status = 'open', pid = NULL, updated_at = datetime('now') WHERE id = ?").run(r.id);
  return d.prepare("SELECT * FROM redo WHERE channel = ? AND status = 'open' AND next_at <= datetime('now') ORDER BY id LIMIT 1").get(channel) ?? null;
}
export function claimRedo(d, channel) {
  const job = dueRedo(d, channel);
  if (!job) return null;
  const r = d.prepare("UPDATE redo SET status = 'running', pid = ?, updated_at = datetime('now') WHERE id = ? AND status = 'open'").run(process.pid, job.id);
  return r.changes ? job : null;
}

// dipanggil pembuat konten / pengirim ide; di luar tugas pengganti (env kosong) tidak berbuat apa-apa
export function markRedo(d, kind, result, env = process.env) {
  const ref = +(env[REDO_ENV[kind]] || 0);
  if (ref) ready(d).prepare("UPDATE redo SET result = ?, updated_at = datetime('now') WHERE kind = ? AND ref = ?").run(result, kind, ref);
}
export const redoResult = (d, id) => d.prepare('SELECT result FROM redo WHERE id = ?').get(id)?.result ?? null;
export const doneRedo = (d, id) => d.prepare("UPDATE redo SET status = 'done', pid = NULL, updated_at = datetime('now') WHERE id = ?").run(id);

export function failRedo(d, id) {
  const tries = (d.prepare('SELECT tries FROM redo WHERE id = ?').get(id)?.tries ?? 0) + 1;
  const wait = RETRY_MIN[tries - 1];
  d.prepare("UPDATE redo SET tries = ?, status = ?, pid = NULL, next_at = datetime('now', ?), updated_at = datetime('now') WHERE id = ?")
    .run(tries, wait ? 'open' : 'failed', `+${wait ?? 0} minutes`, id);
  return { tries, wait: wait ?? null };
}
