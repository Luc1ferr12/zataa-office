// Panel "Kesehatan Kantor" di dashboard: tiap layanan otomatis lapor sukses/gagal ke docs/data/health.json (0 token).
// Ditulis watcher (beat), di-push bareng state.json tiap 10 menit, dibaca docs/js/main.js.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'data', 'health.json');
export const SERVICES = {
  watcher: 'Watcher kantor', n8n: 'Approval Telegram (n8n)', price: 'Budi · cek harga', analyst: 'Raka · data IG',
  socials: 'Analytics sosmed', publish: 'Auto-post IG/TikTok', laptop: 'Render laptop', ads: 'Fahriah · boost',
};
const read = () => { try { return JSON.parse(readFileSync(FILE, 'utf8')); } catch { return { services: {} }; } };

// ok=true/false; state=null pakai ok, atau 'paused' (sengaja dimatikan). Simpan jam gagal 24 jam terakhir.
export function beat(key, ok, msg = '', state = null) {
  const h = read();
  const now = Date.now();
  const s = h.services[key] ?? { fails: [] };
  const was = s.state, lastAt = s.at ?? 0;
  s.fails = (s.fails ?? []).filter((t) => now - t < 86400_000);
  if (ok === false) s.fails.push(now);
  Object.assign(s, { name: SERVICES[key] ?? key, state: state ?? (ok ? 'ok' : 'error'), at: now, msg: String(msg).replace(/\s+/g, ' ').slice(0, 140) });
  if (ok) s.okAt = now;
  h.services[key] = s;
  h.at = now;
  // status nggak berubah → cukup simpan tiap 5 menit per layanan (biar git nggak commit tiap menit).
  // Patokannya jam simpan layanan itu sendiri, bukan h.savedAt global: dulu beat Fahriah tiap menit selalu duluan
  // nyimpen → beat watcher selalu dilewati → kartu "Watcher kantor" merah padahal jalan (26 Okt)
  if (was === s.state && ok !== false && now - lastAt < 5 * 60_000) return;
  h.savedAt = now;
  try { mkdirSync(dirname(FILE), { recursive: true }); writeFileSync(FILE, JSON.stringify(h)); } catch { /* abaikan */ }
}
