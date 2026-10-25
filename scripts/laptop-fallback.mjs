// Fallback antrean render laptop (video bersuara OmniVoice, data_json._laptop): kalau laptop Owner mati / tidak
// sempat, VPS render sendiri pakai suara Gadis lalu kirim ke Owner. Dipanggil watcher tiap menit.
// _laptop = 1 antre · 2 sedang dirender laptop · 3 render laptop gagal (_err = sebabnya). Batas: slot − 2 jam (min. 20 mnt
// sejak antre); kilat 30 mnt. Klaim laptop (2) yang macet >30 mnt dianggap laptop mati; gagal (3) langsung diambil alih.
// Tiap ambil alih & kegagalan dikabari ke Owner di bot Marketing (Dimas), biar nggak ada video yang macet diam-diam.
import { execFile } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.mjs';
import { SLOT, submit, sayAs } from './approval.mjs';
import { beat } from './health.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIN = 60_000;
const queuedAt = (c) => new Date(`${c.updated_at.replace(' ', 'T')}Z`).getTime();
function deadline(c) {
  if (c.st === 3) return 0;
  if (c.st === 2) return queuedAt(c) + 30 * MIN;
  if (c.slot === 'kilat' || !SLOT[c.slot]) return queuedAt(c) + 30 * MIN;
  const air = new Date(`${c.day}T${SLOT[c.slot]}:00+07:00`).getTime();
  return Math.max(air - 120 * MIN, queuedAt(c) + 20 * MIN);
}
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
// baris error yang berguna (bukan cuma ekor stack trace)
const errLine = (s) => {
  const lines = String(s ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  return (lines.filter((l) => /error|exception|gagal|denied|not found|ENOENT|403|404|timeout/i.test(l)).slice(-2).join(' | ') || lines.slice(-2).join(' | ')).slice(0, 300);
};
const render = (id) => new Promise((ok, no) => execFile(process.execPath, ['scripts/render.mjs', String(id)], { cwd: ROOT, timeout: 15 * MIN }, (e, out, err) => (e ? no(new Error(errLine(err || out || e.message))) : ok(out))));

let running = false;
export async function laptopFallback(log) {
  if (running) return;
  running = true;
  const db = openDb();
  try {
    const rows = db.prepare("SELECT id, day, slot, updated_at, json_extract(data_json, '$._laptop') st, json_extract(data_json, '$.voice') voice, json_extract(data_json, '$._err') err, title FROM contents WHERE format = 'video' AND status IN ('draft', 'revision') AND json_extract(data_json, '$._laptop') IN (1, 2, 3)").all();
    for (const c of rows.filter((r) => Date.now() >= deadline(r))) {
      // ambil alih: voice → gadis + hapus tanda antre (atomik, supaya hasil laptop yang telat ditolak)
      const took = db.prepare("UPDATE contents SET data_json = json_set(json_remove(data_json, '$._laptop'), '$.voice', 'gadis'), updated_at = datetime('now') WHERE id = ? AND json_extract(data_json, '$._laptop') = ?").run(c.id, c.st).changes;
      if (!took) continue;
      const why = c.st === 3 ? `render di laptop gagal (${c.err ?? '?'})` : c.st === 2 ? 'render di laptop macet >30 menit' : 'laptop belum ambil antrean (offline?)';
      log(`#${c.id}: ${why} → render Gadis di VPS`);
      beat('laptop', false, `#${c.id}: ${why}`);
      await sayAs('video', `⚠️ Video #${c.id} "${esc(c.title)}": ${esc(why)}. Aku alihin render pakai suara Gadis di VPS ya Bos.`).catch(() => {});
      try {
        await render(c.id);
        await submit(c.id, { note: `💻 ${why} → video ini pakai suara Gadis (bukan ${c.voice ?? process.env.VIDEO_VOICE ?? 'kalem-1'}).` });
        log(`#${c.id} dikirim (fallback Gadis)`);
      } catch (e) {
        log(`fallback #${c.id} gagal: ${e.message}`);
        db.prepare("UPDATE contents SET data_json = json_set(data_json, '$._err', ?), updated_at = datetime('now') WHERE id = ?").run(`fallback Gadis: ${e.message}`.slice(0, 300), c.id);
        await sayAs('video', `❌ Video #${c.id} gagal dirender di laptop maupun VPS.\nSebab: ${esc(e.message)}\nTim beresin di sesi berikutnya. Kalau mau cepat, suruh Dimas antre ulang #${c.id} di sini.`).catch(() => {});
      }
    }
  } finally {
    db.close();
    running = false;
  }
}
