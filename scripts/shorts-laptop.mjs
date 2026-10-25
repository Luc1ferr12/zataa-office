// Render YouTube Shorts di laptop (OmniVoice butuh GPU laptop), lalu kirim hasilnya ke VPS.
//   node scripts/shorts-laptop.mjs <content_id> [--submit]
// 1) ambil spec (data_json) dari DB VPS + klaim antrean (_laptop 1 → 2)  2) gambar yang belum ada di laptop diambil dari VPS (scp)
// 3) scripts/shorts.mjs (durasi 28–45 dtk; _test = --test)  4) scp mp4 + cover ke out/shorts/ VPS, isi asset_path
// 5) --submit → shorts-bot.mjs submit <id> di VPS (Kirana kirim ke Owner di @zataashortbot). Gagal → _laptop 3 + _err (bot kabari Owner).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DB_SNIPPET } from './db.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VPS = process.env.ZATAA_VPS ?? 'zataa-vps';
const [id, flag] = process.argv.slice(2);
if (!id) { console.log('pakai: shorts-laptop.mjs <content_id> [--submit]'); process.exit(0); }

function onVps(js) {
  const r = spawnSync('ssh', [VPS, 'cd ~/zataa-office && node --no-warnings --input-type=module -'], { input: js, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`VPS: ${(r.stderr || r.error?.message || '').trim().slice(-300)}`);
  return r.stdout.trim();
}
const DB = DB_SNIPPET;

const c = JSON.parse(onVps(`${DB} console.log(JSON.stringify(db.prepare("SELECT id, title, day, data_json FROM contents WHERE id = ? AND channel = 'youtube'").get(${+id}) ?? null));`));
if (!c?.data_json) throw new Error(`Shorts ${id} tidak ada di VPS / belum punya spec`);
const spec = JSON.parse(c.data_json);
const queued = spec._laptop != null;
if (queued) onVps(`${DB} db.prepare("UPDATE contents SET data_json = json_set(data_json, '$._laptop', 2), updated_at = datetime('now') WHERE id = ? AND json_extract(data_json, '$._laptop') = 1").run(${c.id});`);
const fail = (msg) => {
  if (queued) onVps(`${DB} db.prepare("UPDATE contents SET data_json = json_set(data_json, '$._laptop', 3, '$._err', ?), updated_at = datetime('now') WHERE id = ?").run(${JSON.stringify(msg.slice(0, 400))}, ${c.id});`);
  throw new Error(msg);
};

const tmp = mkdtempSync(join(tmpdir(), 'zataa-shorts-laptop-'));
try {
  // gambar dari sesi harian (VPS) yang belum ada di laptop → ambil lewat scp (lewat folder tmp, path repo laptop ada spasinya)
  for (const img of [...new Set(spec.scenes.map((s) => s.img))]) {
    const dst = join(ROOT, img);
    if (existsSync(dst)) continue;
    const t = join(tmp, basename(img));
    const r = spawnSync('scp', ['-q', `${VPS}:zataa-office/${img}`, t], { stdio: 'inherit' });
    if (r.status !== 0) fail(`gambar ${img} tidak ada di laptop maupun VPS`);
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(t, dst);
  }
  const { _laptop, _err, _test, duration, tags, synthetic, ...render } = spec;
  render.scenes = render.scenes.map((s) => ({ ...s, img: join(ROOT, s.img) }));
  writeFileSync(join(tmp, 'spec.json'), JSON.stringify(render));
  const slug = String(c.title).toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const files = { video: `${c.id}-${slug}.mp4`, cover: `${c.id}-${slug}-cover.jpg` };
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'shorts.mjs'), join(tmp, 'spec.json'), join(tmp, files.video), ...(_test ? ['--test'] : [])], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  if (r.status !== 0) fail(`render gagal: ${(r.stderr || r.stdout).trim().split('\n').filter((l) => !l.startsWith('\r')).pop()?.slice(-300) ?? ''}`);
  const res = JSON.parse(r.stdout.trim().split('\n').pop());

  onVps(`import { mkdirSync } from 'node:fs'; mkdirSync('out/shorts', { recursive: true });`);
  const up = spawnSync('scp', ['-q', join(tmp, files.video), join(tmp, files.cover), `${VPS}:zataa-office/out/shorts/`], { stdio: 'inherit' });
  if (up.status !== 0) fail('upload hasil render ke VPS gagal');
  const paths = { video: `out/shorts/${files.video}`, cover: `out/shorts/${files.cover}` };
  if (onVps(`${DB} db.prepare("UPDATE contents SET asset_path = ?, data_json = json_set(json_remove(data_json, '$._laptop', '$._err'), '$.duration', ?, '$.seed', ?), updated_at = datetime('now') WHERE id = ?${queued ? " AND json_extract(data_json, '$._laptop') = 2" : ''}").run(${JSON.stringify(JSON.stringify(paths))}, ${res.duration}, ${res.seed}, ${c.id}).changes || console.log('TAKEN');`) === 'TAKEN') {
    throw new Error('antrean sudah berubah (revisi baru?), hasil render ini tidak dipakai');
  }
  const out = { ok: true, id: c.id, ...paths, duration: res.duration, mood: res.mood };
  if (flag === '--submit') {
    const r2 = spawnSync('ssh', [VPS, `cd ~/zataa-office && node scripts/shorts-bot.mjs submit ${c.id}`], { encoding: 'utf8' });
    out.submit = r2.status === 0 ? r2.stdout.trim() : `gagal: ${(r2.stderr || r2.stdout || '').trim().slice(-200)}`;
  }
  console.log(JSON.stringify(out));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
