#!/usr/bin/env node
// Divisi Zaa Clips — edit 1 clip di laptop (GPU Whisper + ffmpeg), lalu kirim ke VPS buat tayang TikTok + IG.
//   node scripts/clipper-laptop.mjs <job_id>
// 1) ambil job + brief campaign dari VPS  2) download footage campaign (yt-dlp; folder Google Drive → gdown)  3) transkrip whisper.cpp
// 4) Maya (Claude CLI) pilih momen sesuai brief + Wulan hook & caption (hashtag/tag wajib)  5) Rizky render 9:16 (latar blur + subtitle + hook)
// 6) scp ke VPS → dikirim ke Owner di bot Zaa Clips, tayang HANYA setelah ✅ Owner. Gagal → status failed + kabar Owner.
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

  // ---- 2) footage: coba link job dulu, kalau nggak ada videonya (mis. TikTok cuma kasih audio) lanjut ke materi campaign lain (folder Drive dst)
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
  const urls = [...new Set([job.source_url, ...JSON.parse(job.assets || '[]').map((x) => x.url)].filter(Boolean))];
  let all = [];
  for (const url of urls) {
    const srcDir = join(CACHE, 'src', createHash('sha1').update(url).digest('hex').slice(0, 12));
    mkdirSync(srcDir, { recursive: true });
    const vids = () => walk(srcDir).filter((f) => /\.(mp4|mkv|webm|mov)$/i.test(f));
    if (!vids().length) {
      try {
        if (/drive\.google\.com\/drive\/folders/.test(url)) run('python', ['-m', 'gdown', '--folder', '--quiet', '-O', srcDir, url]);
        else run('yt-dlp', ['-q', '--no-playlist', '-f', 'bv*[height<=1080]+ba/b[height<=1080]/b', '--merge-output-format', 'mp4', '-o', join(srcDir, '%(id)s.%(ext)s'), url]);
      } catch (e) { console.error(`footage ${url.slice(0, 60)} gagal: ${e.message.slice(0, 120)}`); }
    }
    all = vids().sort((x, y) => statSync(y).size - statSync(x).size);
    if (all.length) break;
  }
  if (!all.length) throw new Error('footage gagal didownload dari semua link campaign (link Drive private? minta akses / pip install gdown)');

  // ---- 3) kenali footage: durasi, ada suara asli?, contact sheet 8 frame (Maya LIHAT gambarnya, bukan cuma transkrip)
  const sheetDir = join(CACHE, 'sheets');
  mkdirSync(sheetDir, { recursive: true });
  const meanDb = (f) => { const r = spawnSync('ffmpeg', ['-v', 'info', '-i', f, '-vn', '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 26 }); const m = /mean_volume:\s*(-?[\d.]+)/.exec(r.stderr ?? ''); return m ? +m[1] : -91; };
  const durOf = (f) => +run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).trim();
  const cands = [];
  for (const f of all.filter((x) => !/capcut/i.test(x)).sort((x, y) => (/Creator/i.test(y) ? 1 : 0) - (/Creator/i.test(x) ? 1 : 0))) {
    if (cands.length >= 14) break;
    const d = durOf(f);
    if (!(d >= 15 && d <= 600)) continue;
    const key = createHash('sha1').update(f).digest('hex').slice(0, 10);
    const sheet = join(sheetDir, `${key}.jpg`);
    if (!existsSync(sheet)) run('ffmpeg', ['-v', 'error', '-y', '-i', f, '-vf', `fps=${(8 / d).toFixed(5)},scale=270:-1,tile=4x2`, '-frames:v', '1', '-q:v', '4', sheet]);
    cands.push({ f, d, key, sheet, db: meanDb(f), name: f.split(/[\\/]/).pop() });
  }
  if (!cands.length) throw new Error('nggak ada footage video ≥15 detik di materi campaign');

  // ---- 4) pilih video + momen + naskah (Claude CLI boleh Read gambar), lalu QA sendiri setelah render
  const usedFile = join(ROOT, 'logs', 'clipper-used.json');
  const usedAll = (() => { try { return JSON.parse(readFileSync(usedFile, 'utf8')); } catch { return {}; } })();
  const used = usedAll[job.campaign_id] ?? [];
  const m = String(job.brief).match(/Durasi:\s*(\d+)\D+(\d+)/);
  const [dmin, dmax] = m ? [Math.max(+m[1], 15), Math.min(+m[2], 90)] : [15, 60];
  const claude = (prompt, tools = 'Read') => run(process.env.CLAUDE_BIN || 'claude', ['-p', '--model', process.env.CLIPPER_MODEL || 'sonnet', '--allowedTools', tools, '--add-dir', CACHE], { input: prompt, cwd: CACHE, timeout: 10 * 60_000, shell: process.platform === 'win32' });
  const jsonOf = (s) => JSON.parse(s.match(/\{[\s\S]*\}/)?.[0] ?? 'null');
  const list = cands.map((c, i) => `${i + 1}. ${c.name} — ${c.d.toFixed(0)} dtk — ${c.db > -45 ? 'ADA suara asli' : 'TANPA suara (footage bisu)'} — gambar: ${c.sheet}`).join('\n');
  const BRIEF = String(job.brief).slice(0, 6000);
  const ask = (feedback) => `Kamu tim Zaa Clips (Maya pilih momen, Wulan nulis naskah & caption) yang bikin 1 clip TikTok/IG Reels untuk campaign Clippo.
BRIEF CAMPAIGN "${job.ctitle}":
${BRIEF}

FOOTAGE YANG TERSEDIA (tiap file punya contact sheet 8 frame berurutan, kiri→kanan, atas→bawah, jarak sama sepanjang durasi). WAJIB buka gambarnya dengan tool Read dan LIHAT isinya sebelum memilih:
${list}

Sudah dipakai clip sebelumnya (jangan sama persis): ${JSON.stringify(used)}
${feedback ? `\nREVISI WAJIB dari QA clip sebelumnya, perbaiki semuanya: ${feedback}\n` : ''}
Aturan keras:
- Pilih SATU file + SATU angle (ROUTE A/B/C/D di brief) yang BENAR-BENAR terlihat di frame-nya. Jangan klaim apa pun yang tidak terlihat (mikroskop, warna/varian botol, waterproof mascara, "1x usap", Tasya) kecuali memang tampak.
- Sebut varian/warna produk HANYA sesuai botol di frame. Jangan bilang "biru" kalau botolnya kuning/pink.
- Ikuti semua DO/DON'T brief (tanpa merek lain, tanpa klaim berlebihan, tanpa testimoni pribadi palsu: tulis sebagai reaksi/demo yang terlihat, bukan "aku sudah pakai").
- Durasi clip ${dmin}-${Math.min(dmax, 45)} detik, dalam batas durasi file.
- Kalau file TANPA suara: tulis "vo" = narasi 1–4 kalimat bahasa Indonesia santai, spontan, sesuai gambar, kira-kira 14 detik ucapan (±40–50 kata), kalimat pertama = hook. Kalau file ADA suara asli: "vo" = "" (suara asli dipakai).
Jawab HANYA JSON satu baris: {"file": nomor, "start": detik, "end": detik, "route": "A|B|C|D", "hook": "teks layar ≤8 kata, tanpa emoji", "vo": "...", "caption": "≤300 karakter: 1 kalimat pancingan + SEMUA hashtag wajib + SEMUA tag akun wajib dari brief", "terlihat": "apa yang kamu lihat di frame (varian botol, aksi) — 1 kalimat"}`;

  let pick, vo = '', c, start, end, feedback = '', file = `clip-${id}.mp4`;
  for (let attempt = 1; attempt <= 2; attempt++) {
    pick = jsonOf(claude(ask(feedback)));
    c = cands[(pick?.file ?? 0) - 1];
    if (!c || !(pick.end > pick.start)) throw new Error(`pilihan momen nggak valid: ${JSON.stringify(pick)?.slice(0, 200)}`);
    start = Math.max(0, +pick.start); end = Math.min(c.d, +pick.end);
    const orig = c.db > -40;
    let segs = [];
    if (orig) { // suara asli: transkrip buat subtitle
      const tj = `${c.f}.whisper.json`;
      if (!existsSync(tj)) {
        const wav = join(work, 'a.wav');
        run('ffmpeg', ['-v', 'error', '-y', '-i', c.f, '-ac', '1', '-ar', '16000', wav]);
        run(WHISPER, ['-m', MODEL, '-l', 'id', '-oj', '-of', c.f + '.whisper', '-f', wav]);
      }
      segs = (JSON.parse(readFileSync(tj, 'utf8')).transcription ?? []).map((s) => ({ a: s.offsets.from / 1000, b: s.offsets.to / 1000, t: s.text.trim() })).filter((s) => s.t && !/^terima kasih\.?$/i.test(s.t));
    }
    vo = orig && segs.length ? '' : String(pick.vo ?? '').trim();
    if (!vo && !segs.length) throw new Error('footage bisu tapi Claude nggak nulis naskah VO');

    // ---- 5) render 9:16: latar blur + video tengah + hook 4 dtk + subtitle; suara = asli ATAU VO OmniVoice (cewe-ceria)
    const assEsc = (s) => String(s).replace(/[{}]/g, '').replace(/\n/g, ' ');
    let voWav = null, voDur = 0, events = [];
    if (vo) {
      const py = [process.env.OMNIVOICE_PY, 'D:/.venv-omnivoice/Scripts/python.exe'].find((p) => p && existsSync(p));
      if (!py) throw new Error('OmniVoice belum terinstal (set OMNIVOICE_PY)');
      voWav = join(work, 'vo.wav');
      writeFileSync(join(work, 'job.json'), JSON.stringify({ voice: process.env.CLIP_VOICE || 'cewe-ceria', items: [{ text: vo, speed: 1.0, out: voWav }] }));
      const r = spawnSync(py, [join(ROOT, 'scripts', 'voice.py'), 'say', join(work, 'job.json')], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8', HF_HOME: process.env.HF_HOME ?? 'D:/.hf-cache' } });
      if (r.status !== 0) throw new Error(`VO OmniVoice gagal: ${(r.stderr ?? '').slice(-250)}`);
      voDur = durOf(voWav);
      const LEAD = 0.4;
      const total = Math.max(dmin, voDur + LEAD + 0.8);
      if (c.d < total) throw new Error(`footage ${c.name} (${c.d.toFixed(0)} dtk) lebih pendek dari VO (${total.toFixed(0)} dtk)`);
      start = Math.min(start, c.d - total); end = start + total;
      const words = vo.split(/\s+/).filter(Boolean), wts = words.map((w) => w.length + 2), sum = wts.reduce((a, b) => a + b, 0);
      let a = LEAD;
      for (let k = 0; k < words.length; k += 3) {
        const grp = words.slice(k, k + 3), w = wts.slice(k, k + 3).reduce((x, y) => x + y, 0), d = (voDur * w) / sum;
        events.push(`Dialogue: 0,${ts(a)},${ts(a + d)},Sub,,0,0,0,,${assEsc(grp.join(' ').toUpperCase())}`);
        a += d;
      }
    } else {
      events = segs.filter((s) => s.b > start && s.a < end).map((s) => `Dialogue: 0,${ts(Math.max(0, s.a - start))},${ts(Math.min(end, s.b) - start)},Sub,,0,0,0,,${assEsc(s.t)}`);
    }
    writeFileSync(join(work, 's.ass'), `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,Arial,64,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,5,1,2,70,70,330,1
Style: Hook,Arial,78,&H0000E5FF,&H0000E5FF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,6,2,8,60,60,230,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 1,${ts(0)},${ts(Math.min(4, end - start))},Hook,,0,0,0,,${assEsc(pick.hook ?? '').toUpperCase()}
${events.join('\n')}
`);
    const fc = '[0:v]split[a][b];[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=24:2,eq=brightness=-0.08[bg];[b]scale=1080:1920:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,ass=s.ass[v]';
    const args = ['-v', 'error', '-y', '-ss', String(start), '-t', String(end - start), '-i', c.f];
    if (voWav) args.push('-i', voWav, '-filter_complex', `${fc};[1:a]adelay=400|400,apad[aud]`, '-map', '[v]', '-map', '[aud]');
    else args.push('-filter_complex', fc, '-map', '[v]', '-map', '0:a');
    args.push('-t', String(end - start), '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', file);
    run('ffmpeg', args, { cwd: work });

    // ---- 5b) QA sendiri: audio ada? lalu Claude LIHAT hasil render vs brief
    const outPath = join(work, file);
    if (meanDb(outPath) < -60) throw new Error('hasil render nggak ada suara (cek VO/footage)');
    const qa = join(work, 'qa.jpg');
    run('ffmpeg', ['-v', 'error', '-y', '-i', outPath, '-vf', `fps=${(8 / (end - start)).toFixed(5)},scale=270:-1,tile=4x2`, '-frames:v', '1', '-q:v', '4', qa]);
    let verdict;
    try {
      verdict = jsonOf(claude(`Kamu QA Zaa Clips. Buka gambar ${qa} (8 frame clip jadi, berurutan) dengan tool Read dan periksa terhadap BRIEF.
BRIEF:
${BRIEF}

HOOK layar: "${pick.hook}"
${vo ? `NARASI (VO): "${vo}"` : 'Suara asli footage dipakai.'}
CAPTION: "${pick.caption}"
Cek: (1) hook/narasi/caption tidak mengklaim hal yang tak terlihat di frame (varian/warna botol, mikroskop, mascara, Tasya, "1x usap") (2) produk Light+ terlihat jelas & dibahas (3) patuh semua DON'T brief, tanpa merek lain/testimoni pribadi palsu (4) hashtag wajib ada di caption (5) teks tidak menutupi produk/wajah penting, tidak ada subtitle aneh.
Jawab HANYA JSON satu baris: {"ok": true|false, "masalah": "daftar singkat masalah, kosong kalau ok"}`));
    } catch (e) { verdict = null; }
    if (!verdict || verdict.ok !== false) break;
    feedback = String(verdict.masalah ?? 'tidak sesuai brief').slice(0, 600);
    if (attempt === 2) throw new Error(`QA gagal 2x: ${feedback}`);
  }
  usedAll[job.campaign_id] = [...used, { file: c.name, start, end }].slice(-40);
  writeFileSync(usedFile, JSON.stringify(usedAll));

  // ---- 6) ke VPS → kirim ke Owner buat di-✅ dulu (BELUM tayang)
  vps(`mkdir -p out/clips`);
  run('scp', ['-q', join(work, file), `${VPS}:zataa-office/out/clips/${file}`]);
  setjob({ status: 'review', start, end, hook: pick.hook ?? '', caption: pick.caption ?? '', file: `out/clips/${file}` });
  vps(`node scripts/office.mjs log cedit ${JSON.stringify(`Clip #${id} (${job.ctitle}) kelar diedit: ${Math.round(end - start)} dtk, nunggu approval Bos`)}`);
  console.log(vps(`node scripts/clipper.mjs review ${id}`));
} catch (e) {
  try { setjob({ status: 'failed', err: e.message.slice(0, 400) }); } catch { /* VPS nggak terjangkau */ }
  console.error(`Error: ${e.message}`);
  process.exit(1);
}
