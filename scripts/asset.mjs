#!/usr/bin/env node
// Simpan logo tim / foto pemain dari web untuk feed & video (aturan Owner: logo tim selalu, foto kalau ada).
//   node scripts/asset.mjs get <url-gambar> teams/<tim>          → assets/teams/<tim>.png|jpg|webp|svg
//   node scripts/asset.mjs get <url-gambar> players/<pemain>     → foto 1 pemain
//   node scripts/asset.mjs get <url-gambar> photos/<tim>-<acara> → foto bareng satu tim
//   node scripts/asset.mjs list                                  → aset yang sudah ada (cek dulu sebelum download)
// Nama file: huruf kecil, pisah "-", mis. teams/rrq, players/rrq-alberttt, photos/onic-mpl-s16.
import { writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KINDS = ['teams', 'players', 'photos'];
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' };
const MAX = 8 * 1024 * 1024;

async function get(url, target) {
  const [kind, name] = String(target).split('/');
  if (!KINDS.includes(kind) || !/^[a-z0-9-]+$/.test(name ?? '')) throw new Error(`tujuan harus ${KINDS.join('|')}/<nama-huruf-kecil>`);
  if (!/^https:\/\//.test(url)) throw new Error('url harus https');
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (ZataaOffice asset fetch)', Accept: 'image/*' }, redirect: 'follow', signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const type = (r.headers.get('content-type') ?? '').split(';')[0].trim();
  if (!EXT[type]) throw new Error(`bukan gambar (${type || 'tanpa content-type'}) — pakai URL file gambarnya langsung, bukan halaman`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > MAX) throw new Error('gambar > 8 MB');
  const dir = join(ROOT, 'assets', kind);
  mkdirSync(dir, { recursive: true });
  const file = `${name}.${EXT[type]}`;
  writeFileSync(join(dir, file), buf);
  return `assets/${kind}/${file}`;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const [cmd, a, b] = process.argv.slice(2);
  try {
    if (cmd === 'get') console.log(JSON.stringify({ ok: true, path: await get(a, b) }));
    else if (cmd === 'list') for (const k of KINDS) { const d = join(ROOT, 'assets', k); console.log(`${k}: ${existsSync(d) ? readdirSync(d).filter((f) => !f.endsWith('.txt')).join(', ') || '-' : '-'}`); }
    else console.log('pakai: asset.mjs get <url> <teams|players|photos>/<nama> | list');
  } catch (e) { console.log(JSON.stringify({ ok: false, error: e.message })); process.exitCode = 1; }
}
