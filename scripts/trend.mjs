// Riwayat harian angka sosmed (docs/data/trend.json) buat "naik berapa dalam 7 hari" di dashboard (docs/js/trend.js).
// 1 catatan per hari WITA per akun = tarikan terakhir hari itu: v views · a subscriber/follower · p jumlah post.
// Akun yang gagal ditarik dilewati (jangan dicatat 0); catatan tarikan sebelumnya di hari itu tetap dipakai.
// Dipanggil socials.mjs setiap selesai menulis socials.json. 0 token.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'data', 'trend.json');
export const KEEP_DAYS = 90;

export function addSnapshot(trend, socials) {
  const day = new Date(Date.parse(socials.generated_at) + 8 * 3600_000).toISOString().slice(0, 10);
  const row = {};
  for (const [key, p] of Object.entries(socials)) {
    if (!p || typeof p !== 'object' || p.error) continue;
    row[key] = { v: p.views ?? null, a: p.subscribers ?? p.followers ?? null, p: p.posts?.total ?? null };
  }
  const days = { ...trend?.days, [day]: { ...trend?.days?.[day], ...row } };
  return { days: Object.fromEntries(Object.keys(days).sort().slice(-KEEP_DAYS).map((d) => [d, days[d]])) };
}

// satu hari per baris, supaya diff git tiap jam tetap kecil
export const serialize = (trend) => `{"days":{\n${Object.entries(trend.days).map(([d, r]) => `${JSON.stringify(d)}:${JSON.stringify(r)}`).join(',\n')}\n}}\n`;

export function writeTrend(socials, file = OUT) {
  let old = null;
  try { old = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; } // file rusak → jangan ditimpa, riwayat hilang
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, serialize(addSnapshot(old, socials)));
}
