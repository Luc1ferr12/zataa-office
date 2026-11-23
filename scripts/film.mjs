#!/usr/bin/env node
// Film Shorts gaya lemo-opuscar (23 Nov 2026, keputusan Owner: SEMUA divisi video pakai skill lemo-opuscar).
// Sesi harian (VPS, skill lemo-opuscar terpasang) menulis proyek film → shorts-bot new {film:"films/<slug>"} → laptop merender (VPS 2 core/3 GB nggak kuat).
//   node scripts/film.mjs new <slug> --brand=cowo      bikin kerangka films/<slug>/ (film.json, lines.json, README) dari gaya tetap brand
//   node scripts/film.mjs check <films/slug>           cek kontrak proyek sebelum shorts-bot new (0 token)
//   node scripts/film.mjs build <films/slug> --brand=cowo [--test]   (LAPTOP) suara → caption per kata → render → mux → out/final.mp4 + out/cover.jpg
//
// Kontrak proyek (selain file lemo-opuscar biasa: index.html, main.js, film.js, mix.py):
//   lines.json  {"items":[{"id":"L1","text":"kalimat bersih (caption & VoxCPM)","el":"[curious] versi ElevenLabs dengan tag ekspresi","style":"gaya VoxCPM (opsional)","seed":11}]}
//   film.json   {"brand":"cowo","style":"brick-toy","title":"…","poster_t":33.5,"grain":1,"crf":22}
//   film.js     WAJIB baca timeline dari out/vo/dur.json (durasi tiap baris) dan caption per kata dari out/vo/words.json ([kata, t0, t1] per baris)
// Suara: brand.voice = 'eleven' (ElevenLabs, scripts/eleven.mjs) atau 'voxcpm' (VoxCPM2 CPU di laptop + buang gema). Eleven tanpa voice id → VoxCPM.
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRANDS } from './brand.mjs';
import { voiceFor } from './eleven.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WIN = process.platform === 'win32';
const fileEnv = () => {
  const p = join(ROOT, '.env');
  if (!existsSync(p)) return {};
  return Object.fromEntries(readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => /^\s*[A-Z0-9_]+\s*=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]));
};
const env = { ...fileEnv(), ...process.env };
const LIB = env.LEMO_LIB || (WIN ? 'C:/Users/arkan/lemo-opuscar' : join(process.env.HOME ?? '', 'lemo-opuscar'));
const LIBPY = join(LIB, '.venv', WIN ? 'Scripts/python.exe' : 'bin/python');
const SH = env.SH_BIN || (WIN && existsSync('C:/Program Files/Git/bin/sh.exe') ? 'C:/Program Files/Git/bin/sh.exe' : 'sh');
// VoxCPM2 = env uv milik Studio Maliki (model sudah di cache HF); referensi timbre per brand
const VOXPY = env.VOXCPM_PY || 'C:/Users/arkan/AppData/Local/uv/cache/environments-v2/suara-dd8fb1fe76a0eea4/Scripts/python.exe';
const VOX_REF = { history: 'assets/voices/misteri-cewe.wav', story: 'assets/voices/misteri-cewe.wav', marvel: 'assets/voices/kalem-2.wav', cowo: 'assets/voices/ceria-vox-dry.wav', esports: 'assets/voices/cewe-ceria.wav' };
const VOX_BASE = 'perempuan Indonesia dewasa muda, aksen Indonesia natural, seperti bercerita langsung ke teman bukan membaca naskah, intonasi hidup naik turun alami, jeda di koma dan titik, tekan kata penting, tidak berlebihan, tidak formal, suara kering tanpa gema, ';
// gaya tetap per brand (brand.mjs `film`); About Esports bukan brand Shorts → di sini
const STYLE = { ...Object.fromEntries(Object.values(BRANDS).map((b) => [b.key, b.film])), esports: 'caption-news' };
// film contoh per brand (pilot yang sudah di-✅/dibikin): titik awal, JANGAN desain ulang dari nol
export const EXAMPLE = { history: 'films/_contoh/history-woodcut', story: 'films/_contoh/story-shadow-puppet', cowo: 'films/_contoh/cowo-brick-toy' };

const run = (cmd, args, opt = {}) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 << 20, ...opt });
  if (r.status !== 0) {
    const L = `${r.stderr || ''}\n${r.stdout || ''}`.trim().split('\n').map((l) => l.trim()).filter(Boolean);
    throw new Error(`${basename(cmd)} ${args.slice(0, 2).map((a) => basename(String(a))).join(' ')} gagal: ${(L.filter((l) => /error/i.test(l)).pop() ?? L.pop() ?? r.error?.message ?? '').slice(0, 300)}`);
  }
  return r.stdout;
};
const log = (m) => process.stderr.write(`[film] ${m}\n`);
const readJson = (p, d) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : d);

export function voiceEngine(brand) {
  const b = BRANDS[brand];
  if ((b?.voice ?? 'voxcpm') !== 'eleven') return 'voxcpm';
  return env.ELEVENLABS_API_KEY && voiceFor(brand) ? 'eleven' : 'voxcpm';
}

// sidik jari isi proyek (tanpa out/): revisi yang mengubah file film → wajib render ulang
export function filmHash(dir) {
  const D = resolve(ROOT, dir), h = createHash('sha1');
  const walk = (p) => { for (const f of readdirSync(p).sort()) { if (f === 'out' || f === 'fonts' || f === 'node_modules') continue; const q = join(p, f); if (statSync(q).isDirectory()) walk(q); else h.update(f).update(readFileSync(q)); } };
  if (existsSync(D)) walk(D);
  return h.digest('hex').slice(0, 12);
}

// ---------- check (VPS & laptop): kontrak proyek
export function check(dir) {
  const D = resolve(ROOT, dir), err = [], warn = [];
  for (const f of ['index.html', 'film.js', 'mix.py', 'lines.json']) if (!existsSync(join(D, f))) err.push(`${f} tidak ada`);
  const lines = readJson(join(D, 'lines.json'), { items: [] }).items ?? [];
  if (!lines.length) err.push('lines.json kosong');
  lines.forEach((it, i) => {
    if (it.id !== `L${i + 1}`) err.push(`lines.json item ke-${i + 1} harus id "L${i + 1}"`);
    if (!it.text) err.push(`${it.id}: text kosong`);
    if (it.el && it.el.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim().length < it.text.length * 0.8) warn.push(`${it.id}: "el" jauh lebih pendek dari "text" (caption bisa nggak cocok)`);
  });
  const chars = lines.reduce((n, it) => n + (it.el || it.text || '').length, 0);
  if (chars > 1400) warn.push(`narasi ${chars} karakter (>1400): film kepanjangan & boros kredit ElevenLabs`);
  const js = existsSync(join(D, 'film.js')) ? readFileSync(join(D, 'film.js'), 'utf8') : '';
  if (js && !/dur\.json/.test(js)) err.push('film.js harus baca out/vo/dur.json (timeline ikut durasi suara)');
  if (js && !/words\.json/.test(js)) warn.push('film.js belum baca out/vo/words.json (caption per kata wajib, contoh: films/_contoh/cowo-brick-toy/film.js karaoke())');
  const meta = readJson(join(D, 'film.json'), null);
  if (!meta) err.push('film.json tidak ada'); else if (meta.style && meta.brand && STYLE[meta.brand] && meta.style !== STYLE[meta.brand]) warn.push(`gaya ${meta.style} ≠ gaya tetap brand ${STYLE[meta.brand]} (boleh kalau Owner minta)`);
  return { ok: !err.length, dir, lines: lines.length, chars, errors: err, warnings: warn };
}

// ---------- new: kerangka proyek
function scaffold(slug, brand) {
  if (!/^[a-z0-9-]{3,60}$/.test(slug)) throw new Error('slug huruf kecil/angka/strip, 3–60 karakter');
  const D = join(ROOT, 'films', slug);
  if (existsSync(D)) throw new Error(`films/${slug} sudah ada`);
  mkdirSync(D, { recursive: true });
  const style = STYLE[brand];
  writeFileSync(join(D, 'film.json'), JSON.stringify({ brand, style, title: '', poster_t: null, grain: 1, crf: 22 }, null, 1));
  writeFileSync(join(D, 'lines.json'), JSON.stringify({ items: [{ id: 'L1', text: '', el: '' }] }, null, 1));
  const ex = EXAMPLE[brand];
  writeFileSync(join(D, 'README.md'), `# ${slug} (${BRANDS[brand]?.name ?? brand})\n\nGaya: \`${style}\` → baca \`${LIB}/styles/${style}/STYLE.md\` (skill lemo-opuscar).\n${ex ? `Mulai dari film contoh \`${ex}/\` (salin index.html, main.js, film.js, mix.py lalu ganti adegan & cerita).` : 'Belum ada film contoh brand ini: ikuti DIRECTOR.md + STYLE.md, simpan juga sebagai contoh setelah di-✅ Owner.'}\nKontrak: lines.json (L1…Ln), timeline dari out/vo/dur.json, caption per kata dari out/vo/words.json. Cek: \`node scripts/film.mjs check films/${slug}\`.\n`);
  return { ok: true, dir: `films/${slug}`, brand, style, example: ex ?? null, voice: voiceEngine(brand) };
}

// ---------- build (laptop)
function voice(D, brand) {
  const vo = join(D, 'out', 'vo'); mkdirSync(vo, { recursive: true });
  let engine = voiceEngine(brand);
  if (engine === 'eleven') {   // kredit ElevenLabs nggak cukup → VoxCPM (render tetap jalan, Owner dikabari lewat hasil `voice`)
    try {
      const q = JSON.parse(run(process.execPath, [join(ROOT, 'scripts', 'eleven.mjs'), 'quota']).trim());
      const need = readJson(join(D, 'lines.json'), { items: [] }).items.reduce((n, it) => n + (it.el || it.text || '').length + 2, 0);
      if (q.left < need + 200) { log(`kredit ElevenLabs sisa ${q.left} < ${need} → pakai VoxCPM`); engine = 'voxcpm'; }
    } catch (e) { log(`cek kuota ElevenLabs gagal (${e.message.slice(0, 80)}), tetap coba ElevenLabs`); }
  }
  if (engine === 'eleven') {
    // satu take seluruh naskah → dipotong per baris (whisper + titik sunyi)
    run(process.execPath, [join(ROOT, 'scripts', 'eleven.mjs'), 'take', join(D, 'lines.json'), join(vo, 'take.wav'), `--brand=${brand}`], { stdio: ['ignore', 'pipe', 'inherit'] });
    run(LIBPY, [join(ROOT, 'scripts/film/split.py'), join(vo, 'take.wav'), join(D, 'lines.json'), vo], { env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  } else {
    const items = readJson(join(D, 'lines.json'), { items: [] }).items;
    const memoP = join(vo, 'vox.json'), memo = readJson(memoP, {});
    const todo = items.filter((it) => memo[it.id] !== `${it.text}|${it.style ?? ''}|${it.seed ?? ''}` || !existsSync(join(vo, `${it.id.toLowerCase()}.wav`)));
    if (todo.length) {
      if (!existsSync(VOXPY)) throw new Error(`VoxCPM env tidak ada (${VOXPY}); isi VOXCPM_PY di .env`);
      const tmp = join(vo, '_lines.json');
      writeFileSync(tmp, JSON.stringify({ items: items.map((it) => ({ ...it, style: VOX_BASE + (it.style ?? 'santai dan jelas'), seed: it.seed ?? 11 })) }));
      const ref = join(ROOT, VOX_REF[brand] ?? VOX_REF.cowo);
      log(`VoxCPM ${todo.length} baris (CPU, ±3 menit/baris)…`);
      run(VOXPY, [join(ROOT, 'scripts/film/vox.py'), 'say', ref, ref.replace(/\.wav$/, '.txt'), tmp, vo, todo.map((it) => it.id).join(',')], { env: { ...process.env, HF_HUB_OFFLINE: '1', PYTHONIOENCODING: 'utf-8' }, stdio: ['ignore', 'inherit', 'inherit'] });
      for (const it of todo) run(VOXPY, [join(ROOT, 'scripts/film/dry.py'), join(vo, `${it.id.toLowerCase()}.wav`), join(vo, `${it.id.toLowerCase()}.wav`)]);
      for (const it of todo) memo[it.id] = `${it.text}|${it.style ?? ''}|${it.seed ?? ''}`;
      writeFileSync(memoP, JSON.stringify(memo));
    }
  }
  // caption per kata: whisper.cpp kasih waktu, ejaan tetap dari naskah
  run(LIBPY, [join(ROOT, 'scripts/film/words.py'), join(D, 'lines.json'), vo], { env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  return engine;
}

function build(dir, brand, { test = false } = {}) {
  const D = resolve(ROOT, dir);
  const c = check(D); if (!c.ok) throw new Error(`proyek film belum lengkap: ${c.errors.join('; ')}`);
  const meta = readJson(join(D, 'film.json'), {});
  brand = brand || meta.brand;
  if (!existsSync(join(LIB, 'core/render/video.mjs'))) throw new Error(`library lemo-opuscar tidak ada di ${LIB} (isi LEMO_LIB)`);
  if (existsSync(join(D, 'tools/fonts.sh'))) run(SH, [join(D, 'tools/fonts.sh')], { env: { ...process.env, LIB } });
  const engine = voice(D, brand);
  const size = '1080x1920', fps = test ? '8' : '24';   // ukuran tetap: overlay 2D film (caption, judul) dihitung untuk 1080×1920
  const o = { cwd: LIB, env: { ...process.env, LIB }, stdio: ['ignore', 'pipe', 'pipe'] };
  log('sampel musik…'); run(LIBPY, ['core/audio/sampler.py', '--need', join(D, 'mix.py')], o);
  log('event suara…'); run('node', ['core/render/events.mjs', D, '--size', size], o);
  log(`render ${size} @${fps}…`); run('node', ['core/render/video.mjs', D, '--fps', fps, '--workers', env.FILM_WORKERS || '3', '--size', size, '--out', join(D, 'out/video.mp4')], o);
  log('mix…'); run(LIBPY, [join(D, 'mix.py')], o);
  run(SH, ['core/render/mux.sh', join(D, 'out/video.mp4'), join(D, 'out/mix.wav'), join(D, 'out/muxed.mp4'), fps, String(meta.grain ?? 1)], o);
  const final = join(D, 'out/final.mp4'), cover = join(D, 'out/cover.jpg');
  run('ffmpeg', ['-v', 'error', '-y', '-i', join(D, 'out/muxed.mp4'), '-c:v', 'libx264', '-preset', 'slow', '-crf', String(meta.crf ?? 22), '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', final]);
  const duration = parseFloat(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', final]).trim());
  run('ffmpeg', ['-v', 'error', '-y', '-ss', String(meta.poster_t ?? Math.round(duration * 0.55 * 10) / 10), '-i', final, '-frames:v', '1', '-q:v', '2', cover]);
  return { ok: true, video: final, cover, duration: Math.round(duration * 10) / 10, voice: engine, style: meta.style, size: statSync(final).size };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const brandArg = process.argv.find((a) => a.startsWith('--brand='))?.slice(8);
  const [cmd, a] = process.argv.slice(2).filter((x) => !x.startsWith('--'));
  try {
    if (cmd === 'new') console.log(JSON.stringify(scaffold(a, brandArg ?? 'history')));
    else if (cmd === 'check') { const r = check(a); console.log(JSON.stringify(r)); if (!r.ok) process.exit(1); }
    else if (cmd === 'build') console.log(JSON.stringify(build(a, brandArg, { test: process.argv.includes('--test') })));
    else if (cmd === 'styles') console.log(JSON.stringify({ ...STYLE, contoh: EXAMPLE, voice: Object.fromEntries(Object.keys(STYLE).map((k) => [k, BRANDS[k] ? voiceEngine(k) : 'voxcpm'])) }));
    else console.log('pakai: film.mjs new <slug> --brand=<history|story|marvel|cowo> | check <films/slug> | build <films/slug> [--brand=] [--test] | styles');
  } catch (e) { console.error(e.message); process.exit(1); }
}
