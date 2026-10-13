// Fallback antrean render laptop (video bersuara OmniVoice, data_json._laptop): kalau laptop Owner mati / tidak
// sempat, VPS render sendiri pakai suara Gadis lalu kirim ke Owner. Dipanggil watcher tiap menit.
// _laptop = 1 antre · 2 sedang dirender laptop. Batas: slot − 2 jam (min. 20 mnt sejak antre); kilat 30 mnt.
// Klaim laptop (2) yang macet >30 mnt dianggap laptop mati.
import { execFile } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { SLOT, submit } from './approval.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIN = 60_000;
const queuedAt = (c) => new Date(`${c.updated_at.replace(' ', 'T')}Z`).getTime();
function deadline(c) {
  if (c.st === 2) return queuedAt(c) + 30 * MIN;
  if (c.slot === 'kilat' || !SLOT[c.slot]) return queuedAt(c) + 30 * MIN;
  const air = new Date(`${c.day}T${SLOT[c.slot]}:00+07:00`).getTime();
  return Math.max(air - 120 * MIN, queuedAt(c) + 20 * MIN);
}
const render = (id) => new Promise((ok, no) => execFile(process.execPath, ['scripts/render.mjs', String(id)], { cwd: ROOT, timeout: 15 * MIN }, (e, out, err) => (e ? no(new Error((err || out || e.message).slice(-200))) : ok(out))));

let running = false;
export async function laptopFallback(log) {
  if (running) return;
  running = true;
  const db = new DatabaseSync(join(ROOT, 'db', 'office.db'));
  try {
    const rows = db.prepare("SELECT id, day, slot, updated_at, json_extract(data_json, '$._laptop') st, json_extract(data_json, '$.voice') voice FROM contents WHERE format = 'video' AND status IN ('draft', 'revision') AND json_extract(data_json, '$._laptop') IN (1, 2)").all();
    for (const c of rows.filter((r) => Date.now() >= deadline(r))) {
      // ambil alih: hapus voice + tanda antre (atomik, supaya hasil laptop yang telat ditolak)
      const took = db.prepare("UPDATE contents SET data_json = json_remove(data_json, '$._laptop', '$.voice'), updated_at = datetime('now') WHERE id = ? AND json_extract(data_json, '$._laptop') = ?").run(c.id, c.st).changes;
      if (!took) continue;
      log(`#${c.id}: laptop belum render (suara ${c.voice}) → render Gadis di VPS`);
      try {
        await render(c.id);
        await submit(c.id, { note: `💻 Laptop offline, suara ${c.voice} belum bisa dirender → video ini pakai suara Gadis.` });
        log(`#${c.id} dikirim (fallback Gadis)`);
      } catch (e) { log(`fallback #${c.id} gagal: ${e.message}`); }
    }
  } finally {
    db.close();
    running = false;
  }
}
