// Pengawas antrean render laptop (video bersuara OmniVoice, data_json._laptop). Aturan Owner (25 Okt): TIDAK ada
// fallback suara Gadis — kalau laptop mati, video nunggu sampai laptop nyala. Dipanggil watcher tiap menit.
// _laptop = 1 antre · 2 sedang dirender laptop · 3 render laptop gagal (_err = sebabnya). Batas: slot − 2 jam (min. 20 mnt
// sejak antre); kilat 30 mnt. Lewat batas & laptop belum ambil → kabari Owner sekali (_warned). Klaim laptop (2) yang
// macet >30 mnt dianggap laptop mati → antre ulang (1). Gagal (3) → kabari Owner sekali, Dimas antre ulang di sesi berikutnya.
import { openDb } from './db.mjs';
import { SLOT, sayAs } from './approval.mjs';
import { beat } from './health.mjs';

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

let running = false;
export async function laptopFallback(log) {
  if (running) return;
  running = true;
  const db = openDb();
  try {
    const rows = db.prepare("SELECT id, day, slot, updated_at, json_extract(data_json, '$._laptop') st, json_extract(data_json, '$._warned') warned, json_extract(data_json, '$._err') err, title FROM contents WHERE format = 'video' AND status IN ('draft', 'revision') AND json_extract(data_json, '$._laptop') IN (1, 2, 3)").all();
    for (const c of rows.filter((r) => Date.now() >= deadline(r))) {
      if (c.st === 2) {
        // laptop mati di tengah render → balikin ke antrean (atomik, supaya hasil laptop yang telat tetap diterima)
        if (!db.prepare("UPDATE contents SET data_json = json_set(data_json, '$._laptop', 1), updated_at = datetime('now') WHERE id = ? AND json_extract(data_json, '$._laptop') = 2").run(c.id).changes) continue;
        log(`#${c.id}: render laptop macet >30 menit → antre ulang`);
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
        : `⏳ Video #${c.id} "${esc(c.title)}" masih nunggu laptop nyala (suara OmniVoice cuma bisa di laptop). Begitu laptop nyala langsung kurender & kirim, jadi tayangnya bisa telat ya Bos.`).catch(() => {});
    }
  } finally {
    db.close();
    running = false;
  }
}
