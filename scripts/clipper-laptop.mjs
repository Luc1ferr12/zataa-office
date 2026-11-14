#!/usr/bin/env node
// Divisi Zaa Clips — edit 1 clip di laptop (GPU Whisper + ffmpeg), lalu kirim ke VPS buat tayang TikTok + IG.
//   node scripts/clipper-laptop.mjs <job_id>
// 1) ambil job + brief campaign dari VPS  2) download footage campaign (yt-dlp; folder Google Drive → gdown)  3) transkrip whisper.cpp
// 4) Maya (Claude CLI) pilih momen sesuai brief + Wulan hook & caption (hashtag/tag wajib)  5) Rizky render 9:16 (latar blur + subtitle + hook)
// 6) scp ke VPS out/clips/ → clipper.mjs post <id> (Tasya upload TikTok + IG). Gagal → status failed + kabar Owner.
// .env laptop opsional: WHISPER_BIN, WHISPER_MODEL, CLAUDE_BIN, CLIPPER_MODEL (default sonnet).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VPS = process.env.ZATAA_VPS ?? 'zataa-vps';
const id = +process.argv[2];
if (!id) { console.log('pakai: clipper-laptop.mjs <job_id>'); process.exit(0); }
const WDIR = join(homedir(), 'AppData', 'Local', 'Programs', 'whisper.cpp');
const WHISPER = process.env.WHISPER_BIN || join(WDIR, 'Release', 'whisper-cli.exe');
const MODEL = process.env.WHISPER_MODEL || join(WDIR, 'models', 'ggml-large-v3-turbo-q5_0.bin');
const CACHE = join(ROOT, 'tmp', 'clipper');
const work = join(CACHE, `job-${id}`);
mkdirSync(work, { recursive: true });

const run = (bin, args, opt = {}) => {
  const r = spawnSync(bin, args, { encoding: 'utf8', maxBuffer: 1 << 26, ...opt });
  if (r.status !== 0) throw new Error(`${bin.split(/[\\/]/).pop()}: ${(r.stderr || r.stdout || r.error?.message || '').trim().split('\n').slice(-3).join(' ').slice(-300)}`);
  return r.stdout;
};
const vps = (cmd, input) => run('ssh', [VPS, `cd ~/zataa-office && ${cmd}`], input ? { input } : {}).trim();
const setjob = (p) => vps(`node scripts/clipper.mjs setjob ${id}`, JSON.stringify(p));
const ts = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = (s % 60).toFixed(2).padStart(5, '0'); return `${h}:${String(m).padStart(2, '0')}:${x}`; };

try {
  const job = JSON.parse(vps(`node scripts/clipper.mjs job ${id}`) || 'null');
  if (!job) throw new Error('job nggak ada di VPS');
  if (job.status !== 'queued' && !process.argv.includes('--force')) { console.log(`job ${id} status ${job.status}, dilewati`); process.exit(0); }
  setjob({ status: 'editing' });
  if (!job.source_url) throw new Error('campaign nggak punya link footage');

  // ---- 2) footage (cache per URL, dipakai ulang buat clip berikutnya)
  const key = createHash('sha1').update(job.source_url).digest('hex').slice(0, 12);
  const srcDir = join(CACHE, 'src', key);
  mkdirSync(srcDir, { recursive: true });
  const vids = () => readdirSync(srcDir).filter((f) => /\.(mp4|mkv|webm|mov)$/i.test(f)).map((f) => join(srcDir, f));
  if (!vids().length) {
    if (/drive\.google\.com\/drive\/folders/.test(job.source_url)) run('python', ['-m', 'gdown', '--folder', '--quiet', '-O', srcDir, job.source_url]);
    else run('yt-dlp', ['-q', '--no-playlist', '-f', 'bv*[height<=1080]+ba/b[height<=1080]/b', '--merge-output-format', 'mp4', '-o', join(srcDir, '%(id)s.%(ext)s'), job.source_url]);
  }
  const all = vids().sort((a, b) => statSync(b).size - statSync(a).size);
  if (!all.length) throw new Error('footage gagal didownload (link Drive private? minta akses / pip install gdown)');
  const src = all[id % all.length]; // folder isi banyak video → gilir

  // ---- 3) transkrip (sekali per video)
  const tj = `${src}.whisper.json`;
  if (!existsSync(tj)) {
    const wav = join(work, 'a.wav');
    run('ffmpeg', ['-v', 'error', '-y', '-i', src, '-ac', '1', '-ar', '16000', wav]);
    run(WHISPER, ['-m', MODEL, '-l', 'id', '-oj', '-of', src + '.whisper', '-f', wav]);
  }
  const segs = (JSON.parse(readFileSync(tj, 'utf8')).transcription ?? []).map((s) => ({ a: s.offsets.from / 1000, b: s.offsets.to / 1000, t: s.text.trim() })).filter((s) => s.t);
  if (!segs.length) throw new Error('transkrip kosong (video tanpa suara?)');
  const dur = +run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', src]).trim();

  // ---- 4) pilih momen + hook + caption (Claude CLI, tanpa tool)
  const used = JSON.parse(vps(`node scripts/clipper.mjs used ${id}`) || '[]');
  const m = String(job.brief).match(/Durasi:\s*(\d+)\D+(\d+)/);
  const [dmin, dmax] = m ? [Math.max(+m[1], 15), Math.min(+m[2], 90)] : [20, 60];
  const lines = segs.map((s) => `[${s.a.toFixed(1)}-${s.b.toFixed(1)}] ${s.t}`).join('\n').slice(0, 24_000);
  const prompt = `Kamu tim Zaa Clips (Maya pilih momen, Wulan nulis hook & caption) yang bikin clip pendek TikTok/IG Reels untuk campaign Clippo.
BRIEF CAMPAIGN "${job.ctitle}":
${String(job.brief).slice(0, 5000)}

TRANSKRIP VIDEO SUMBER (detik):
${lines}

Bagian yang SUDAH dipakai clip lain (hindari tumpang tindih): ${JSON.stringify(used)}
Pilih SATU momen paling kuat yang patuh brief (angle wajib, do & don'ts), durasi ${dmin}-${Math.min(dmax, 75)} detik, mulai di awal kalimat dan selesai di akhir kalimat, 3 detik pertama langsung menarik.
Jawab HANYA JSON satu baris: {"start": detik, "end": detik, "hook": "teks layar ≤8 kata, bahasa Indonesia, tanpa emoji", "caption": "caption TikTok/IG ≤300 karakter: 1 kalimat pancingan + SEMUA hashtag wajib + SEMUA tag akun wajib dari brief", "reason": "alasan singkat"}`;
  const out = run(process.env.CLAUDE_BIN || 'claude', ['-p', '--model', process.env.CLIPPER_MODEL || 'sonnet', '--', prompt], { timeout: 8 * 60_000, shell: process.platform === 'win32' });
  const pick = JSON.parse(out.match(/\{[\s\S]*\}/)?.[0] ?? 'null');
  if (!pick || !(pick.end > pick.start)) throw new Error(`pilihan momen nggak valid: ${out.slice(0, 200)}`);
  const start = Math.max(0, +pick.start), end = Math.min(dur, +pick.end);

  // ---- 5) render 9:16: latar blur + video tengah + subtitle per kalimat + hook 4 detik pertama
  const assEsc = (s) => String(s).replace(/[{}]/g, '').replace(/\n/g, ' ');
  const subs = segs.filter((s) => s.b > start && s.a < end).map((s) => `Dialogue: 0,${ts(Math.max(0, s.a - start))},${ts(Math.min(end, s.b) - start)},Sub,,0,0,0,,${assEsc(s.t)}`);
  writeFileSync(join(work, 's.ass'), `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,Arial,60,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,5,1,2,70,70,330,1
Style: Hook,Arial,78,&H0000E5FF,&H0000E5FF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,6,2,8,60,60,230,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 1,${ts(0)},${ts(Math.min(4, end - start))},Hook,,0,0,0,,${assEsc(pick.hook ?? '').toUpperCase()}
${subs.join('\n')}
`);
  const file = `clip-${id}.mp4`;
  run('ffmpeg', ['-v', 'error', '-y', '-ss', String(start), '-to', String(end), '-i', src, '-filter_complex',
    '[0:v]split[a][b];[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=24:2,eq=brightness=-0.08[bg];[b]scale=1080:1920:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,ass=s.ass[v]',
    '-map', '[v]', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', file], { cwd: work });

  // ---- 6) ke VPS → tayang
  vps(`mkdir -p out/clips`);
  run('scp', ['-q', join(work, file), `${VPS}:zataa-office/out/clips/${file}`]);
  setjob({ status: 'ready', start, end, hook: pick.hook ?? '', caption: pick.caption ?? '', file: `out/clips/${file}` });
  vps(`node scripts/office.mjs log cedit ${JSON.stringify(`Clip #${id} (${job.ctitle}) kelar diedit: ${Math.round(end - start)} dtk`)}`);
  console.log(vps(`node scripts/clipper.mjs post ${id}`));
} catch (e) {
  try { setjob({ status: 'failed', err: e.message.slice(0, 400) }); } catch { /* VPS nggak terjangkau */ }
  console.error(`Error: ${e.message}`);
  process.exit(1);
}
