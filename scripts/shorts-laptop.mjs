// Render YouTube Shorts di laptop (OmniVoice butuh GPU laptop), lalu kirim hasilnya ke VPS.
//   node scripts/shorts-laptop.mjs <content_id> [--submit]
// 1) ambil spec (data_json) dari DB VPS + klaim antrean (_laptop 1 → 2)  2) gambar yang belum ada di laptop diambil dari VPS (scp)
// 3) scripts/shorts.mjs, atau shorts-clip.mjs kalau adegan bergaya klip (durasi 28–45 dtk; _test = --test)  4) scp mp4 + cover ke out/shorts/ VPS, isi asset_path
// 3b) spec.film (23 Nov 2026) → proyek films/<slug> diambil dari VPS lalu scripts/film.mjs build (film lemo-opuscar, suara ElevenLabs/VoxCPM)
// 5) --submit → shorts-bot.mjs submit <id> di VPS (Kirana kirim ke Owner di @zataashortbot). Gagal → _laptop 3 + _err (bot kabari Owner).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync, mkdirSync, copyFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DB_SNIPPET } from './db.mjs';
import { resolveClips } from './clip-scout.mjs';
import { ssh, scpFrom, scpTo, scpDirFrom } from './vps-link.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const [id, flag] = process.argv.slice(2);
if (!id) { console.log('pakai: shorts-laptop.mjs <content_id> [--submit]'); process.exit(0); }

function onVps(js) {
  const r = ssh('node --no-warnings --input-type=module -', js); // coba ulang + gantian port 22/443 (vps-link.mjs)
  if (r.status !== 0) throw new Error(`VPS: ${(r.stderr || r.error?.message || '').trim().slice(-300)}`);
  return r.stdout.trim();
}
const DB = DB_SNIPPET;

const c = JSON.parse(onVps(`${DB} console.log(JSON.stringify(db.prepare("SELECT id, title, day, channel, data_json FROM contents WHERE id = ? AND channel IN ('youtube', 'story', 'marvel', 'cowo')").get(${+id}) ?? null));`));
if (!c?.data_json) throw new Error(`Shorts ${id} tidak ada di VPS / belum punya spec`);
const spec = JSON.parse(c.data_json);
const queued = spec._laptop != null;
if (queued) onVps(`${DB} db.prepare("UPDATE contents SET data_json = json_set(data_json, '$._laptop', 2), updated_at = datetime('now') WHERE id = ? AND json_extract(data_json, '$._laptop') = 1").run(${c.id});`);
const fail = (msg) => {
  if (queued) onVps(`${DB} db.prepare("UPDATE contents SET data_json = json_set(data_json, '$._laptop', 3, '$._err', ?), updated_at = datetime('now') WHERE id = ?").run(${JSON.stringify(msg.slice(0, 400))}, ${c.id});`);
  throw new Error(msg);
};

const tmp = mkdtempSync(join(tmpdir(), 'zataa-shorts-laptop-'));
const BRAND = { story: 'story', marvel: 'marvel', cowo: 'cowo' }[c.channel] ?? 'history';
try {
  if (spec.film) {   // 23 Nov 2026: film lemo-opuscar — proyek films/<slug> ditulis sesi harian di VPS, dirender di sini (scripts/film.mjs build)
    const slug = basename(spec.film), local = join(ROOT, 'films', slug);
    mkdirSync(join(ROOT, 'films'), { recursive: true });
    const keepOut = existsSync(join(local, 'out', 'vo')) ? join(tmp, 'vo-cache') : null;   // suara lama dipakai lagi kalau teksnya sama (hemat kredit ElevenLabs)
    if (keepOut) cpSync(join(local, 'out', 'vo'), keepOut, { recursive: true });
    rmSync(local, { recursive: true, force: true });
    const g = scpDirFrom(spec.film, join(ROOT, 'films'));
    if (g.status !== 0) fail(`proyek film ${spec.film} gagal diambil dari VPS: ${(g.stderr || '').trim().slice(-120)}`);
    if (keepOut) { mkdirSync(join(local, 'out'), { recursive: true }); cpSync(keepOut, join(local, 'out', 'vo'), { recursive: true }); }
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'film.mjs'), 'build', `films/${slug}`, `--brand=${BRAND}`, ...(spec._test ? ['--test'] : [])], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', maxBuffer: 64 << 20 });
    if (r.status !== 0) fail(`render film gagal: ${(r.stderr || r.stdout).trim().split('\n').filter(Boolean).pop()?.slice(0, 300) ?? ''}`);
    const res = JSON.parse(r.stdout.trim().split('\n').pop());
    const files = { video: `${c.id}-${slug}.mp4`, cover: `${c.id}-${slug}-cover.jpg` };
    copyFileSync(res.video, join(tmp, files.video)); copyFileSync(res.cover, join(tmp, files.cover));
    onVps(`import { mkdirSync } from 'node:fs'; mkdirSync('out/shorts', { recursive: true });`);
    const up = scpTo([join(tmp, files.video), join(tmp, files.cover)], 'out/shorts');
    if (up.status !== 0) fail(`upload hasil render ke VPS gagal: ${(up.stderr || '').trim().slice(-120)}`);
    const paths = { video: `out/shorts/${files.video}`, cover: `out/shorts/${files.cover}` };
    if (onVps(`${DB} db.prepare("UPDATE contents SET asset_path = ?, data_json = json_set(json_remove(data_json, '$._laptop', '$._err'), '$.duration', ?, '$.voice', ?), updated_at = datetime('now') WHERE id = ?${queued ? " AND json_extract(data_json, '$._laptop') = 2" : ''}").run(${JSON.stringify(JSON.stringify(paths))}, ${res.duration}, ${JSON.stringify(res.voice)}, ${c.id}).changes || console.log('TAKEN');`) === 'TAKEN') {
      throw new Error('antrean sudah berubah (revisi baru?), hasil render ini tidak dipakai');
    }
    const out = { ok: true, id: c.id, ...paths, duration: res.duration, film: spec.film, voice: res.voice };
    if (flag === '--submit') {
      const r2 = ssh(`node scripts/shorts-bot.mjs submit ${c.id} --brand=${BRAND}`);
      out.submit = r2.status === 0 ? r2.stdout.trim() : `gagal: ${(r2.stderr || r2.stdout || '').trim().slice(-200)}`;
    }
    console.log(JSON.stringify(out));
    rmSync(tmp, { recursive: true, force: true });
    process.exit(0);
  }
  // gambar dari sesi harian (VPS) yang belum ada di laptop → ambil lewat scp (lewat folder tmp, path repo laptop ada spasinya)
  const isClip = spec.scenes.some((s) => Array.isArray(s.clips));   // gaya klip film (Marvel Talk) → shorts-clip.mjs
  for (const img of [...new Set(spec.scenes.flatMap((s) => (isClip ? s.clips.map((k) => k.src).filter(Boolean) : [s.img])))]) {
    const dst = join(ROOT, img);
    if (existsSync(dst)) continue;
    const t = join(tmp, basename(img));
    const r = scpFrom(img, t);
    if (r.status !== 0) fail(`${isClip ? 'klip' : 'gambar'} ${img} gagal diambil dari VPS: ${(r.stderr || '').trim().slice(-120)}`);
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(t, dst);
  }
  const { _laptop, _err, _test, duration, tags, synthetic, ...render } = spec;
  render.scenes = render.scenes.map((s) => (isClip ? { ...s, clips: s.clips.map((k) => (k.src ? { ...k, src: join(ROOT, k.src) } : k)) } : { ...s, img: join(ROOT, s.img) }));
  if (isClip) {   // klip `find`/`yt`: cari + unduh + pilih momen di laptop (yt-dlp di VPS diblok YouTube)
    try { resolveClips(render, (m) => process.stderr.write(`${m}
`)); } catch (e) { fail(`klip: ${e.message}`); }
  }
  writeFileSync(join(tmp, 'spec.json'), JSON.stringify(render));
  const slug = String(c.title).toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const files = { video: `${c.id}-${slug}.mp4`, cover: `${c.id}-${slug}-cover.jpg` };
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts', isClip ? 'shorts-clip.mjs' : 'shorts.mjs'), join(tmp, 'spec.json'), join(tmp, files.video), ...(_test ? ['--test'] : [])], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  if (r.status !== 0) fail(`render gagal: ${(() => { const L = (r.stderr || r.stdout).trim().split('\n').map((l) => l.trim()).filter(Boolean); return (L.filter((l) => /^Error:/.test(l)).pop() ?? L.pop() ?? '').slice(0, 300); })()}`);
  const res = JSON.parse(r.stdout.trim().split('\n').pop());

  onVps(`import { mkdirSync } from 'node:fs'; mkdirSync('out/shorts', { recursive: true });`);
  const up = scpTo([join(tmp, files.video), join(tmp, files.cover)], 'out/shorts');
  if (up.status !== 0) fail(`upload hasil render ke VPS gagal: ${(up.stderr || '').trim().slice(-120)}`);
  const paths = { video: `out/shorts/${files.video}`, cover: `out/shorts/${files.cover}` };
  if (onVps(`${DB} db.prepare("UPDATE contents SET asset_path = ?, data_json = json_set(json_remove(data_json, '$._laptop', '$._err'), '$.duration', ?, '$.seed', ?), updated_at = datetime('now') WHERE id = ?${queued ? " AND json_extract(data_json, '$._laptop') = 2" : ''}").run(${JSON.stringify(JSON.stringify(paths))}, ${res.duration}, ${res.seed}, ${c.id}).changes || console.log('TAKEN');`) === 'TAKEN') {
    throw new Error('antrean sudah berubah (revisi baru?), hasil render ini tidak dipakai');
  }
  const out = { ok: true, id: c.id, ...paths, duration: res.duration, mood: res.mood };
  if (flag === '--submit') {
    const r2 = ssh(`node scripts/shorts-bot.mjs submit ${c.id} --brand=${BRAND}`);
    out.submit = r2.status === 0 ? r2.stdout.trim() : `gagal: ${(r2.stderr || r2.stdout || '').trim().slice(-200)}`;
  }
  console.log(JSON.stringify(out));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
