#!/usr/bin/env node
// Render Shorts bergaya "klip film + narasi + teks kata-per-kata" (Marvel Talk, keputusan Owner 15 Nov 2026).
//   node scripts/shorts-clip.mjs <spec.json> [out.mp4] [--test]
// spec = { voice, speed?, mood?, seed?, scenes: [{ vo, hl?: ["kata"], clips: [{ src, ss, x? }] }] }
//   src = path video (relatif ke spec atau repo), ss = detik mulai, x = 0..1 posisi crop horizontal (default .5)
//   Durasi adegan = narasi + jeda; tiap klip kebagian durasi sama (potongan ganti cepat). Suara asli klip DIBUANG.
//   Teks = SATU lapis: kata-per-kata di tengah, kata di `hl` (atau ditulis *kata* di vo) berwarna kuning.
import { copyFileSync, readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEST = process.argv.includes('--test');
const args = process.argv.slice(2).filter((a) => a !== '--test');
const specPath = resolve(args[0] ?? '');
const outPath = resolve(args[1] ?? join(ROOT, 'out', 'shorts-clip.mp4'));
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const FPS = 30, COVER_AT = 1.5, LEAD = 0.15, GAP = 0.35, TAIL = 0.9, MIN_DUR = 28, MAX_DUR = 45;
const FONT = process.env.CLIP_FONT ?? 'C:/Windows/Fonts/ariblk.ttf';   // disalin ke folder kerja → fontsdir=. (hindari escape drive Windows)

const dur = (f) => { const r = spawnSync(ffmpegPath, ['-i', f, '-f', 'null', '-'], { encoding: 'utf8' }); const m = [...(r.stderr ?? '').matchAll(/time=(\d+):(\d+):([\d.]+)/g)].pop(); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0; };
const ts = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return `${h}:${String(m).padStart(2, '0')}:${x.toFixed(2).padStart(5, '0')}`; };
const strip = (s) => s.replaceAll('*', '');
const tmp = mkdtempSync(join(tmpdir(), 'marvel-clip-'));
try {
  // 1. narasi OmniVoice per adegan
  const py = [process.env.OMNIVOICE_PY, 'D:/.venv-omnivoice/Scripts/python.exe'].find((p) => p && existsSync(p));
  if (!py) throw new Error('OmniVoice belum terinstal (set OMNIVOICE_PY)');
  const items = spec.scenes.map((s, i) => ({ text: strip(s.vo), speed: s.speed ?? spec.speed ?? 0.95, out: join(tmp, `vo-${i}.wav`) }));
  writeFileSync(join(tmp, 'job.json'), JSON.stringify({ voice: spec.voice ?? 'kalem-2', items }));
  process.stderr.write('narasi…\n');
  const r = spawnSync(py, [join(ROOT, 'scripts', 'voice.py'), 'say', join(tmp, 'job.json')], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8', HF_HOME: process.env.HF_HOME ?? 'D:/.hf-cache' } });
  if (r.status !== 0) throw new Error(`narasi gagal: ${(r.stderr ?? '').slice(-300)}`);

  // 2. jadwal
  let t = 0;
  const scenes = spec.scenes.map((s, i) => {
    const vd = dur(items[i].out), lead = i === 0 ? LEAD : 0.2, tail = i === spec.scenes.length - 1 ? TAIL : GAP;
    const sc = { ...s, vd, voStart: t + lead, at: t, dur: lead + vd + tail };
    t += sc.dur;
    return sc;
  });
  const total = t;
  if (!TEST && (total < MIN_DUR || total > MAX_DUR)) throw new Error(`durasi ${total.toFixed(1)} dtk di luar ${MIN_DUR}–${MAX_DUR} dtk`);

  // 3. teks kata-per-kata (ASS, satu lapis)
  const clean = (w) => strip(w).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const ev = [];
  for (const s of scenes) {
    const words = s.vo.split(/\s+/).filter(Boolean).map((w) => ({ hl: w.includes('*') || (s.hl ?? []).some((h) => clean(w) === h.toLowerCase()), text: strip(w).replace(/[,.…]+$/, '').toUpperCase() }));
    const wts = words.map((w) => w.text.length + 2), sum = wts.reduce((a, b) => a + b, 0);
    let a = s.voStart;
    words.forEach((w, k) => {
      const d = (s.vd * wts[k]) / sum, end = k === words.length - 1 ? a + d + 0.25 : a + d;
      const col = w.hl ? '{\\c&H3AD2FF&}' : '';
      ev.push(`Dialogue: 0,${ts(a)},${ts(end)},W,,0,0,0,,{\\an5\\pos(540,1130)\\fscx82\\fscy82\\t(0,90,\\fscx100\\fscy100)}${col}${w.text}`);
      a += d;
    });
  }
  const head = '[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 2\n\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\nStyle: W,Arial Black,128,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,9,4,5,40,40,0,1\n\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n';
  copyFileSync(FONT, join(tmp, 'font.ttf'));
  writeFileSync(join(tmp, 'cap.ass'), head + ev.join('\n') + '\n');

  // 4. video: potongan klip 9:16 (crop tengah), ganti cepat
  const inputs = [], fc = [];
  let n = 0;
  for (const s of scenes) {
    const d = s.dur / s.clips.length;
    for (const c of s.clips) {
      const src = [resolve(dirname(specPath), c.src), resolve(ROOT, c.src)].find(existsSync);
      if (!src) throw new Error(`klip tidak ada: ${c.src}`);
      inputs.push('-ss', String(c.ss), '-t', (d + 0.1).toFixed(2), '-i', src);
      fc.push(`[${n}:v]scale=-2:1920:flags=lanczos,crop=1080:1920:(iw-1080)*${c.x ?? 0.5}:0,setsar=1,fps=${FPS},trim=0:${d.toFixed(3)},setpts=PTS-STARTPTS,eq=contrast=1.06:saturation=1.1[c${n}]`);
      n++;
    }
  }
  fc.push(`${Array.from({ length: n }, (_, i) => `[c${i}]`).join('')}concat=n=${n}:v=1:a=0[vc]`);
  fc.push(`[vc]ass=cap.ass:fontsdir=.[vout]`);

  // 5. audio: narasi per adegan + musik epik pelan (menyusut saat narasi)
  const music = join(tmp, 'music.wav');
  const seed = spec.seed ?? Math.floor(Math.random() * 1e6);
  spawnSync(process.execPath, [join(ROOT, 'scripts', 'shorts-music.mjs'), music, (total + 0.5).toFixed(2), scenes.slice(1).map((s) => s.at.toFixed(2)).join(','), `--mood=${spec.mood ?? 'epik'}`, `--seed=${seed}`], { stdio: 'inherit' });
  inputs.push('-i', music);
  const mi = n;
  scenes.forEach((s, i) => {
    inputs.push('-i', items[i].out);
    const ms = Math.round(s.voStart * 1000);
    fc.push(`[${mi + 1 + i}:a]adelay=${ms}|${ms}[a${i}]`);
  });
  fc.push(`${scenes.map((_, i) => `[a${i}]`).join('')}amix=inputs=${scenes.length}:normalize=0,volume=1.6,apad[vo]`);
  fc.push('[vo]asplit[v1][v2]');
  fc.push(`[${mi}:a]volume=0.30,afade=t=out:st=${(total - 1).toFixed(2)}:d=1[m]`);
  fc.push('[m][v1]sidechaincompress=threshold=0.04:ratio=6[md]');
  fc.push(`[md][v2]amix=inputs=2:normalize=0,atrim=0:${total.toFixed(2)},loudnorm=I=-14:TP=-1.5:LRA=11[aout]`);

  mkdirSync(dirname(outPath), { recursive: true });
  const p = spawnSync(ffmpegPath, ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', fc.join(';'), '-map', '[vout]', '-map', '[aout]', '-t', total.toFixed(2), '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-movflags', '+faststart', outPath], { cwd: tmp, encoding: 'utf8' });
  if (p.status !== 0) throw new Error(`ffmpeg gagal: ${(p.stderr ?? '').slice(-600)}`);
  spawnSync(ffmpegPath, ['-y', '-loglevel', 'error', '-ss', String(COVER_AT), '-i', outPath, '-frames:v', '1', '-q:v', '2', outPath.replace(/\.mp4$/, '-cover.jpg')]);   // cover = frame awal
  console.log(JSON.stringify({ ok: true, out: outPath, mood: spec.mood ?? 'epik', seed, duration: +total.toFixed(2), scenes: scenes.map((s) => +s.at.toFixed(2)) }));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
