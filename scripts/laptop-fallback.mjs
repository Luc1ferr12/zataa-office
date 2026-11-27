// Pengawas antrean render laptop (video bersuara OmniVoice, data_json._laptop). Aturan Owner (25 Okt): TIDAK ada
// fallback suara Gadis — kalau laptop mati, video nunggu sampai laptop nyala. Dipanggil watcher tiap menit.
// _laptop = 1 antre · 2 sedang dirender laptop · 3 render laptop gagal (_err = sebabnya). Batas: slot − 2 jam (min. 20 mnt
// sejak antre); kilat 30 mnt. Lewat batas & laptop belum ambil → kabari Owner sekali (_warned). Klaim laptop (2) yang
// macet >30 mnt dianggap laptop mati → antre ulang (1). Gagal (3) → kabari Owner sekali, Dimas antre ulang di sesi berikutnya.
// Antrean (1) baru dihitung telat sejak jendela render buka (≥09:45 WITA, laptop sengaja menahan sebelum itu).
// Status "Render laptop" di web: merah selama ada render gagal/telat/macet yang belum diambil lagi, selain itu hijau.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.mjs';
import { SLOT, sayAs } from './approval.mjs';
import { beat } from './health.mjs';

const MIN = 60_000;
const REPORT = join(dirname(fileURLToPath(import.meta.url)), '..', 'tmp', 'render-progress.json');
const queuedAt = (c) => new Date(`${c.updated_at.replace(' ', 'T')}Z`).getTime();
// jam buka render hari ini (WITA): ikut laporan laptop (.env laptop RENDER_FROM), belum ada laporan → 09:45
function renderOpen(now) {
  let from;
  try { from = JSON.parse(readFileSync(REPORT, 'utf8')).renderFrom; } catch { /* belum ada laporan laptop */ }
  const [h, m] = String(from || process.env.RENDER_FROM || '09:45').split(':').map(Number);
  const midnight = Date.parse(`${new Date(now + 480 * MIN).toISOString().slice(0, 10)}T00:00:00+08:00`);
  return midnight + (h * 60 + (m || 0)) * MIN;
}
function deadline(c, open) {
  if (c.st === 3) return 0;
  if (c.st === 2) return queuedAt(c) + (c.film ? 80 : 30) * MIN;   // film lemo-opuscar ±20–40 menit render → jangan dianggap macet
  const start = Math.max(queuedAt(c), open);
  if (c.slot === 'kilat' || !SLOT[c.slot]) return start + (c.film ? 60 : 30) * MIN;
  const air = new Date(`${c.day}T${SLOT[c.slot]}:00+07:00`).getTime();
  return Math.max(air - 120 * MIN, start + 20 * MIN);
}
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

let running = false;
export async function laptopFallback(log) {
  if (running) return;
  running = true;
  const db = openDb();
  try {
    const rows = db.prepare("SELECT id, day, slot, updated_at, json_extract(data_json, '$._laptop') st, json_extract(data_json, '$._warned') warned, json_extract(data_json, '$._err') err, json_extract(data_json, '$.film') film, json_extract(data_json, '$._stalled') stalled, title FROM contents WHERE format = 'video' AND status IN ('draft', 'revision') AND json_extract(data_json, '$._laptop') IN (1, 2, 3)").all();
    const open = renderOpen(Date.now());
    // _stalled = updated_at saat antre ulang karena macet; masih sama = belum ada yang ambil lagi
    const stuck = (c) => c.st === 3 || (c.st === 1 && (c.stalled === c.updated_at || Date.now() >= deadline(c, open)));
    let bad = rows.some(stuck);
    for (const c of rows.filter((r) => Date.now() >= deadline(r, open))) {
      if (c.st === 2) {
        // laptop mati di tengah render → balikin ke antrean (atomik, supaya hasil laptop yang telat tetap diterima)
        if (!db.prepare("UPDATE contents SET data_json = json_set(data_json, '$._laptop', 1, '$._stalled', datetime('now')), updated_at = datetime('now') WHERE id = ? AND json_extract(data_json, '$._laptop') = 2").run(c.id).changes) continue;
        bad = true;
        log(`#${c.id}: render laptop macet (lewat batas) → antre ulang`);
        beat('laptop', false, `#${c.id}: render macet, antre ulang`);
        continue;
      }
      if (c.warned) continue;
      db.prepare("UPDATE contents SET data_json = json_set(data_json, '$._warned', 1) WHERE id = ?").run(c.id);
      const why = c.st === 3 ? `render di laptop gagal (${c.err ?? '?'})` : 'laptop belum ambil antrean (offline?)';
      log(`#${c.id}: ${why} → nunggu laptop (tanpa fallback Gadis)`);
      beat('laptop', false, `#${c.id}: ${why}`);
      await sayAs('video', c.st === 3
        ? `❌ Video #${c.id} "${esc(c.title)}" gagal dirender di laptop.\nSebab: ${esc(c.err ?? '?')}\nTim beresin di sesi berikutnya. Kalau mau cepat, suruh Dimas antre ulang #${c.id} di sini.`
        : `⏳ Video #${c.id} "${esc(c.title)}" masih nunggu laptop nyala (render video cuma bisa di laptop). Begitu laptop nyala langsung kurender & kirim, jadi tayangnya bisa telat ya Bos.`).catch(() => {});
    }
    if (!bad) beat('laptop', true, 'antrean render aman');
  } finally {
    db.close();
    running = false;
  }
}
