// Render video bersuara OmniVoice di laptop (VPS tidak punya GPU), lalu kirim hasilnya ke VPS.
//   node scripts/render-laptop.mjs <content_id> [--submit]
// 1) ambil data konten dari DB VPS  2) render.mjs try (lokal, OmniVoice)  3) scp ke docs/media/<tgl>/ di VPS
// 4) isi asset_path/asset_url di DB VPS  5) --submit → approval.mjs submit <id> (kirim ke Telegram Owner)
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VPS = process.env.ZATAA_VPS ?? 'zataa-vps';
const [id, flag] = process.argv.slice(2);
if (!id) { console.log('pakai: render-laptop.mjs <content_id> [--submit]'); process.exit(0); }

// jalankan JS (ESM) di folder kantor VPS lewat stdin, hasil = stdout
function onVps(js) {
  const r = spawnSync('ssh', [VPS, 'cd ~/zataa-office && node --no-warnings --input-type=module -'], { input: js, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`VPS: ${(r.stderr || r.error?.message || '').trim().slice(-300)}`);
  return r.stdout.trim();
}
const DB = "const { DatabaseSync } = await import('node:sqlite'); const db = new DatabaseSync('db/office.db');";

const c = JSON.parse(onVps(`${DB} console.log(JSON.stringify(db.prepare('SELECT id, title, day, format, data_json FROM contents WHERE id = ?').get(${+id}) ?? null));`));
if (!c) throw new Error(`konten ${id} tidak ada di VPS`);
if (c.format !== 'video' || !c.data_json) throw new Error(`konten ${id} bukan video atau belum punya data_json`);

const tmp = mkdtempSync(join(tmpdir(), 'zataa-laptop-'));
try {
  writeFileSync(join(tmp, 'data.json'), c.data_json);
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'render.mjs'), 'try', 'video', join(tmp, 'data.json'), tmp], { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`render gagal: ${r.stdout.slice(-300)}`);
  const res = JSON.parse(r.stdout.trim().split('\n').pop());

  // nama file sama persis dengan render.mjs <id>
  const slug = String(c.title).toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const base = `${c.id}-${slug}`;
  const files = { video: `${base}.mp4`, cover: `${base}-cover.jpg` };
  renameSync(join(tmp, res.video), join(tmp, files.video));
  renameSync(join(tmp, res.cover), join(tmp, files.cover));

  const rel = `docs/media/${c.day}`;
  onVps(`import { mkdirSync } from 'node:fs'; mkdirSync('${rel}', { recursive: true });`);
  const up = spawnSync('scp', ['-q', join(tmp, files.video), join(tmp, files.cover), `${VPS}:zataa-office/${rel}/`], { stdio: 'inherit' });
  if (up.status !== 0) throw new Error('upload ke VPS gagal');

  const paths = { video: `${rel}/${files.video}`, cover: `${rel}/${files.cover}` };
  onVps(`${DB} import { readFileSync, existsSync } from 'node:fs';
    const env = existsSync('.env') ? Object.fromEntries(readFileSync('.env', 'utf8').split(/\\r?\\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])) : {};
    const base = (env.PUBLIC_BASE_URL ?? '').replace(/\\/$/, '');
    const f = ${JSON.stringify(files)};
    const urls = base ? JSON.stringify({ video: base + '/media/${c.day}/' + f.video, cover: base + '/media/${c.day}/' + f.cover }) : null;
    db.prepare("UPDATE contents SET asset_path = ?, asset_url = COALESCE(?, asset_url), template = 'video', updated_at = datetime('now') WHERE id = ?").run(${JSON.stringify(JSON.stringify(paths))}, urls, ${c.id});`);

  const out = { ok: true, id: c.id, ...paths, duration: res.duration, music: res.music, bg: res.bg, vo: res.vo };
  if (flag === '--submit') {
    const r2 = spawnSync('ssh', [VPS, `cd ~/zataa-office && node scripts/approval.mjs submit ${c.id}`], { encoding: 'utf8' });
    out.submit = r2.status === 0 ? r2.stdout.trim() : `gagal: ${(r2.stderr || '').trim().slice(-200)}`;
  }
  console.log(JSON.stringify(out));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
