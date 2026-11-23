#!/usr/bin/env node
// ElevenLabs TTS (23 Nov 2026, keputusan Owner): suara narasi film Cowo Bingung, Zaa Story & Marvel Talk.
// History & About Esports tetap VoxCPM (scripts/film.mjs). Paket API Starter (±34rb karakter/bulan) → hemat: 1 baris = 1 panggilan,
// generate ulang cuma kalau Whisper menangkap salah ucap (maks ELEVEN_RETRY kali per baris, default 1).
//   node scripts/eleven.mjs take <lines.json> <take.wav> --brand=cowo       → satu take seluruh naskah (dipakai film.mjs, lalu split.py)
//   node scripts/eleven.mjs say <lines.json> <outdir> --brand=cowo [ids]   → per baris <outdir>/l1.wav … + dur.json (cadangan)
//   node scripts/eleven.mjs quota                                          → sisa karakter bulan ini
//   node scripts/eleven.mjs voices                                         → suara di akun (id, nama, bahasa)
// lines.json = {"items":[{"id":"L1","text":"kalimat bersih (buat caption)","el":"[curious] kalimat dengan tag ekspresi"}]}
// Suara per brand: ELEVEN_VOICE_<BRAND> di .env menimpa default di bawah. Marvel belum dipilih Owner → kosong = film.mjs pakai VoxCPM.
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const fileEnv = () => {
  const p = join(ROOT, '.env');
  if (!existsSync(p)) return {};
  return Object.fromEntries(readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => /^\s*[A-Z0-9_]+\s*=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]));
};
const env = { ...fileEnv(), ...process.env };
const API = 'https://api.elevenlabs.io';
export const MODEL = env.ELEVEN_MODEL || 'eleven_v4';   // v4 (Nov 2026): lebih cepat & natural dari v3, tag ekspresi tetap jalan, harga sama
// voice id dari Voice Library (sudah ditambahkan ke "My Voices" akun Owner)
const DEFAULT_VOICE = {
  cowo: 'hpPL1KjDqf2Aab49mbHk',   // Depa - Smooth, Clear & Expressive (id) — pilihan Owner 23 Nov 2026
  story: 'm6elNOMAsoqePTs244dg',  // Indah - Expressive, Clean, Deep, Relaxed (id)
  marvel: '',                     // belum dipilih Owner
};
export const voiceFor = (brand) => env[`ELEVEN_VOICE_${String(brand).toUpperCase()}`] ?? DEFAULT_VOICE[brand] ?? '';
export const elevenReady = (brand) => !!(env.ELEVENLABS_API_KEY && voiceFor(brand));

async function call(path, init = {}) {
  if (!env.ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY kosong di .env');
  const r = await fetch(`${API}${path}`, { ...init, headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, ...(init.headers ?? {}) } });
  if (!r.ok) throw new Error(`ElevenLabs ${path.split('?')[0]} ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r;
}

export async function quota() {
  const s = await (await call('/v1/user/subscription')).json();
  const left = s.character_limit - s.character_count;
  return { tier: s.tier, used: s.character_count, limit: s.character_limit, left, pct_left: Math.round((100 * left) / Math.max(1, s.character_limit)), reset: new Date(s.next_character_count_reset_unix * 1000).toISOString().slice(0, 10) };
}

// satu baris → mp3 (Buffer). Tag ekspresi ([curious], [whispers], …) ikut dihitung karakter.
export async function tts(text, voice, { seed } = {}) {
  const body = { text, model_id: MODEL, ...(seed != null ? { seed } : {}) };   // voice_settings bawaan suara (setelan Voice Library pemiliknya)
  const r = await call(`/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return Buffer.from(await r.arrayBuffer());
}

let FF = 'ffmpeg';
try { FF = (await import('ffmpeg-static')).default || FF; } catch { /* pakai ffmpeg di PATH */ }
// mp3 → wav 48 kHz mono, potong hening depan/belakang (sisa 60 ms / 120 ms), kembalikan durasi (detik)
function toWav(mp3, wav) {
  const r = spawnSync(FF, ['-v', 'error', '-y', '-i', mp3, '-af',
    'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.06,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.12,areverse',
    '-ar', '48000', '-ac', '1', wav], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg: ${(r.stderr || '').slice(-200)}`);
  const p = spawnSync(FF, ['-i', wav, '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /time=(\d+):(\d+):([\d.]+)/g; let t = 0, x;
  while ((x = m.exec(p.stderr))) t = +x[1] * 3600 + +x[2] * 60 + +x[3];
  return Math.round(t * 1000) / 1000;
}

// SATU take untuk seluruh naskah (default film): tempo & intonasi nyambung kayak orang ngomong sekali jalan
// (per baris terpisah ternyata ±35% lebih lambat & putus-putus). Hasil = <outWav> 48 kHz mono; dipotong per baris oleh scripts/film/split.py.
// Teks sama dengan take sebelumnya → tidak dibuat ulang (hemat kredit). Revisi naskah = 1 take baru (±1.000 karakter).
export async function take(linesPath, outWav, brand, log = (m) => process.stderr.write(`${m}\n`)) {
  const voice = voiceFor(brand);
  if (!voice) throw new Error(`suara ElevenLabs brand "${brand}" belum dipilih (ELEVEN_VOICE_${String(brand).toUpperCase()})`);
  const items = JSON.parse(readFileSync(linesPath, 'utf8')).items;
  const text = items.map((it) => (it.el || it.text).trim()).join('\n\n');
  if (text.length > 4900) throw new Error(`naskah ${text.length} karakter (batas 5.000)`);
  const memoP = `${outWav}.json`, key = `${voice}|${MODEL}|${text}`;
  if (existsSync(outWav) && existsSync(memoP) && readFileSync(memoP, 'utf8') === key) return { ok: true, cached: true, chars: 0 };
  mkdirSync(dirname(outWav), { recursive: true });
  const mp3 = `${outWav}.mp3`;
  writeFileSync(mp3, await tts(text, voice));
  const d = toWav(mp3, outWav); rmSync(mp3, { force: true });
  writeFileSync(memoP, key);
  log(`take ElevenLabs ${d}s (${text.length} karakter)`);
  return { ok: true, cached: false, chars: text.length, duration: d };
}

// semua baris lines.json → <outdir>/lN.wav + dur.json (cadangan: per baris) (yang sudah ada & teksnya sama tidak dibuat ulang → hemat kredit)
export async function say(linesPath, outdir, brand, only = null, log = (m) => process.stderr.write(`${m}\n`)) {
  const voice = voiceFor(brand);
  if (!voice) throw new Error(`suara ElevenLabs brand "${brand}" belum dipilih (ELEVEN_VOICE_${String(brand).toUpperCase()})`);
  const items = JSON.parse(readFileSync(linesPath, 'utf8')).items;
  mkdirSync(outdir, { recursive: true });
  const durP = join(outdir, 'dur.json'), memoP = join(outdir, 'eleven.json');
  const dur = existsSync(durP) ? JSON.parse(readFileSync(durP, 'utf8')) : {};
  const memo = existsSync(memoP) ? JSON.parse(readFileSync(memoP, 'utf8')) : {};
  let chars = 0;
  for (const it of items) {
    if (only && !only.has(it.id)) continue;
    const text = it.el || it.text, key = `${voice}|${MODEL}|${it.seed ?? ''}|${text}`;
    const wav = join(outdir, `${it.id.toLowerCase()}.wav`);
    if (!only && memo[it.id] === key && existsSync(wav)) continue;
    const mp3 = join(outdir, `_${it.id}.mp3`);
    writeFileSync(mp3, await tts(text, voice, { seed: it.seed }));
    dur[it.id] = toWav(mp3, wav); rmSync(mp3, { force: true });
    memo[it.id] = key; chars += text.length;
    log(`${it.id} ${dur[it.id]}s (${text.length} kar)`);
  }
  writeFileSync(durP, JSON.stringify(dur));
  writeFileSync(memoP, JSON.stringify(memo));
  return { ok: true, voice, model: MODEL, chars, dur };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--brand='));
  const brand = (process.argv.find((a) => a.startsWith('--brand=')) ?? '--brand=cowo').slice(8);
  const [cmd, a, b, ids] = args;
  try {
    if (cmd === 'take') console.log(JSON.stringify(await take(a, b, brand)));
    else if (cmd === 'say') console.log(JSON.stringify(await say(a, b, brand, ids ? new Set(ids.split(',')) : null)));
    else if (cmd === 'quota') console.log(JSON.stringify(await quota()));
    else if (cmd === 'voices') {
      const v = await (await call('/v2/voices?page_size=100')).json();
      for (const x of v.voices) console.log(x.voice_id, x.category, x.name, (x.labels ?? {}).language ?? '');
    } else console.log('pakai: eleven.mjs say <lines.json> <outdir> --brand=<cowo|story|marvel> [L1,L2] | quota | voices');
  } catch (e) { console.error(e.message); process.exit(1); }
}
