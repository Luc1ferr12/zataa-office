// Perubahan angka sosmed dari riwayat harian docs/data/trend.json (ditulis scripts/trend.mjs).
// field: 'v' views · 'a' subscriber/follower. Pembanding = catatan akun itu 7 hari lalu (boleh mundur 3 hari kalau
// bolong), akun yang lebih baru dari itu dibandingkan dengan catatan pertamanya (periodenya lebih pendek).
const DAY = 86400_000;
const witaDay = (iso) => new Date(Date.parse(iso) + 8 * 3600_000).toISOString().slice(0, 10);
const shift = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

function baseline(days, key, field, today) {
  const has = Object.keys(days).filter((d) => d < today && days[d][key]?.[field] != null).sort();
  const target = shift(today, -7), floor = shift(today, -10);
  return has.filter((d) => d <= target && d >= floor).at(-1) ?? has.find((d) => d > target) ?? null;
}

// jumlah perubahan beberapa akun → { diff, days } atau null kalau belum ada pembanding sama sekali
export function change(trend, socials, keys, field) {
  if (!trend?.days || !socials?.generated_at) return null;
  const today = witaDay(socials.generated_at);
  let diff = 0, span = 0;
  for (const key of keys) {
    const p = socials[key];
    const cur = field === 'v' ? p?.views : p?.subscribers ?? p?.followers;
    if (!p || p.error || cur == null) continue;
    const d = baseline(trend.days, key, field, today);
    if (!d) continue;
    diff += cur - trend.days[d][key][field];
    span = Math.max(span, Math.round((Date.parse(today) - Date.parse(d)) / DAY));
  }
  return span ? { diff, days: span } : null;
}
