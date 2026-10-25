#!/usr/bin/env node
// Fikri (QA): cek otomatis konten marketing sebelum dikirim ke Owner (0 token).
//   node scripts/qa.mjs <id>    → { errors: [...], warnings: [...] }
// errors = wajib dibenerin dulu (approval.mjs submit nolak, kecuali --force); warnings = ikut tampil di pesan ke Owner.
process.removeAllListeners('warning');
import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { db } from './approval.mjs';
import { latest } from './price.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// nama tim di teks → file logo di assets/teams/ (aturan Owner: bahas tim = wajib logo)
const TEAMS = {
  rrq: /\brrq\b/i, onic: /\bonic\b/i, evos: /\bevos\b/i, btr: /\b(bigetron|btr)\b/i, ae: /\balter ego\b/i, geek: /\bgeek( fam)?\b/i,
  dewa: /\bdewa united\b/i, navi: /\b(navi|natus vincere)\b/i, tlid: /\b(team liquid|liquid id|tlid)\b/i,
  '100t': /\b(100 thieves|100t)\b/i, g2: /\bg2\b/i, loud: /\bloud\b/i, vitality: /\bvitality\b/i,
};
const rpOf = (s) => [...String(s).matchAll(/rp\s?\.?\s?(\d{1,3}(?:[.,]\d{3})+|\d{4,})/gi)].map((m) => +m[1].replace(/[.,]/g, ''));

export async function qa(c) {
  const errors = [], warnings = [];
  const data = String(c.data_json ?? '');
  const text = [c.title, c.caption, c.hashtags, data].filter(Boolean).join('\n');
  const words = [c.title, c.caption, data].filter(Boolean).join('\n');

  if (!/zataa\.my\.id/i.test(`${c.caption ?? ''}\n${c.hashtags ?? ''}`)) errors.push('caption belum ada CTA/link zataa.my.id');
  // IG batasi 5 hashtag per post sejak Des 2025 (lihat .claude/skills/ig-caption)
  const tags = new Set(`${c.caption ?? ''}\n${c.hashtags ?? ''}`.match(/#[\p{L}\p{N}_]+/gu) ?? []);
  if (tags.size > 5) warnings.push(`hashtag ${tags.size}, IG maks 5 — sisain yang paling spesifik`);

  if (/esport|news|berita/i.test(c.pillar ?? '')) {
    const urls = new Set(String(c.sources ?? '').match(/https?:\/\/[^\s"',\]]+/g) ?? []);
    if (urls.size < 2 && !/rumor/i.test(words)) errors.push(`berita/esport butuh ≥2 sumber URL (sekarang ${urls.size}), atau tulis jelas "rumor"`);
  }

  const amounts = [...new Set(rpOf(words))];
  if (amounts.length) {
    const pages = await latest('', Infinity).catch(() => []);
    const known = new Set(pages.flatMap((p) => p.items ?? []).flatMap(rpOf));
    if (!known.size) warnings.push('harga di konten belum bisa dicocokkan (data harga zataa nggak kebaca)');
    else {
      const wrong = amounts.filter((n) => !known.has(n));
      if (wrong.length) errors.push(`harga nggak ada di zataa.my.id hari ini: ${wrong.map((n) => `Rp${n.toLocaleString('id-ID')}`).join(', ')}`);
    }
  }

  if (/\b(mpl|mdl|klasemen)\b/i.test(words) && /\b\d+\s*poin\b/i.test(words) && !/match point|\bmp\b/i.test(words)) {
    warnings.push('klasemen MPL tulis "Match Point/MP", bukan "poin" polos (office/esport.md)');
  }

  let logos = [];
  try { logos = readdirSync(join(ROOT, 'assets', 'teams')).map((f) => f.replace(/\.[a-z]+$/, '')); } catch { /* belum ada aset */ }
  for (const [team, re] of Object.entries(TEAMS)) {
    if (re.test(words) && !new RegExp(`teams/${team}[-.]`, 'i').test(data)) {
      warnings.push(logos.includes(team) ? `bahas ${team.toUpperCase()} tapi logo assets/teams/${team} nggak dipakai` : `bahas ${team.toUpperCase()} tapi logonya belum ada (asset.mjs get … teams/${team})`);
    }
  }
  if (!c.asset_path) errors.push('belum dirender');
  return { errors, warnings };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const id = +process.argv[2];
  const c = (await db()).prepare('SELECT * FROM contents WHERE id = ?').get(id);
  console.log(c ? JSON.stringify(await qa(c)) : `konten ${id} tidak ada`);
}
