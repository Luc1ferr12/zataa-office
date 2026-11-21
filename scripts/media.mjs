// Lampiran Owner di Telegram (semua bot) → file lokal + catatan prompt buat Claude/Haiku (16 Nov 2026).
//   foto / gambar dokumen → disimpan, dibaca pakai Read (Claude bisa lihat gambar)
//   video / video note / GIF → 6 frame JPG merata (ffmpeg) + durasi; suaranya ikut ditranskrip kalau mesin transkripsi ada
//   voice note / audio → ditranskrip jadi teks (22 Nov 2026): whisper.cpp (WHISPER_BIN + WHISPER_MODEL) → faster-whisper (python) → API opsional GROQ_API_KEY / OPENAI_API_KEY
//     (API = audio dikirim ke penyedia itu; cuma jalan kalau Owner sendiri mengisi key-nya). Tidak ada mesin → bot jujur bilang belum bisa dengar.
//   .docx / .xlsx / .pptx → teksnya diekstrak (python zipfile); link YouTube → subtitle, TikTok/IG/X → audio ditranskrip kalau mesin ada
//   PDF / dokumen lain → disimpan, path-nya dikasih (Read bisa buka PDF)
//   link di teks → YouTube/TikTok/IG/X/FB: judul, kreator, durasi, deskripsi, thumbnail (yt-dlp); web biasa: judul + isi ringkas
// Batas Bot API: file >20 MB nggak bisa diunduh bot → minta Owner kirim link. File di tmp/telegram/<bot>/ (gitignore), dihapus >3 hari.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readdirSync, statSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import ffmpegStatic from 'ffmpeg-static';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const has = (bin) => spawnSync(bin, ['-version'], { encoding: 'utf8' }).status === 0 || spawnSync(bin, ['--version'], { encoding: 'utf8' }).status === 0;
let HAVE = null;
const FFMPEG = ffmpegStatic || 'ffmpeg'; // binary ikut node_modules (ffmpeg-static), nggak perlu install di server
const tools = () => (HAVE ??= { ffmpeg: has(FFMPEG), ytdlp: has('yt-dlp') });
const SOCIAL = /(?:youtube\.com|youtu\.be|tiktok\.com|instagram\.com|facebook\.com|fb\.watch|twitter\.com|x\.com|threads\.net)\//i;

// semua lampiran di 1 pesan Telegram → [{ id, kind, name? }]
export function mediaIds(m) {
  if (!m) return [];
  const out = [];
  if (m.photo?.length) out.push({ id: m.photo.at(-1).file_id, kind: 'image' });
  for (const k of ['video', 'video_note', 'animation']) if (m[k]) out.push({ id: m[k].file_id, kind: 'video', size: m[k].file_size, dur: m[k].duration });
  if (m.document) {
    const mt = m.document.mime_type ?? '';
    out.push({ id: m.document.file_id, kind: mt.startsWith('image/') ? 'image' : mt.startsWith('video/') ? 'video' : mt.startsWith('audio/') ? 'audio' : 'doc', name: m.document.file_name, size: m.document.file_size });
  }
  for (const k of ['voice', 'audio']) if (m[k]) out.push({ id: m[k].file_id, kind: 'audio', size: m[k].file_size, dur: m[k].duration, name: m[k].file_name });
  if (m.sticker && !m.sticker.is_animated && !m.sticker.is_video) out.push({ id: m.sticker.file_id, kind: 'image' });
  return out;
}
export const urlsOf = (text = '') => [...new Set(String(text).match(/https?:\/\/[^\s<>"')]+/g) ?? [])].slice(0, 3);

function sweep(dir) {
  try { for (const f of readdirSync(dir)) { const p = join(dir, f); if (Date.now() - statSync(p).mtimeMs > 3 * 86400_000) rmSync(p, { recursive: true, force: true }); } } catch { /* belum ada */ }
}

// unduh lampiran (pakai token bot yang nerima pesannya) → [{ kind, path, frames?, dur?, err? }] (path relatif ke root repo)
export async function fetchMedia(token, items, bot = 'telegram') {
  const rel = join('tmp', 'telegram', bot);
  const dir = join(ROOT, rel);
  mkdirSync(dir, { recursive: true });
  sweep(dir);
  const out = [];
  for (const it of items.slice(0, 6)) {
    if (it.size && it.size > 20 * 1024 * 1024) { out.push({ kind: it.kind, err: `file ${(it.size / 1048576).toFixed(0)} MB, kebesaran buat bot (maks 20 MB) — kirim link-nya aja` }); continue; }
    try {
      const f = await (await fetch(`https://api.telegram.org/bot${token}/getFile`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file_id: it.id }) })).json();
      if (!f.ok) throw new Error(f.description);
      const r = await fetch(`https://api.telegram.org/file/bot${token}/${f.result.file_path}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const ext = extname(f.result.file_path) || extname(it.name ?? '') || (it.kind === 'image' ? '.jpg' : it.kind === 'video' ? '.mp4' : '');
      const name = `${Date.now()}-${out.length}${ext}`;
      writeFileSync(join(dir, name), Buffer.from(await r.arrayBuffer()));
      const kind = it.kind === 'doc' && /\.(jpe?g|png|webp|gif)$/i.test(ext) ? 'image' : it.kind === 'doc' && /\.(mp4|mov|mkv|webm)$/i.test(ext) ? 'video' : it.kind === 'doc' && /\.(oga|ogg|opus|mp3|m4a|wav|aac|flac|amr)$/i.test(ext) ? 'audio' : it.kind;
      const item ={ kind, path: `${rel}/${name}`.replace(/\\/g, '/'), name: it.name };
      if (kind === 'video') Object.assign(item, frames(join(dir, name), `${rel}/${name}`));
      if (kind === 'video' && engine()) Object.assign(item, await transcribe(join(dir, name), { quiet: true })); // suara video (tanpa suara → kosong)
      if (kind === 'audio') { Object.assign(item, await transcribe(join(dir, name))); item.dur = it.dur; }
      if (kind === 'doc' && /\.(docx|xlsx|pptx)$/i.test(ext)) item.text = officeText(join(dir, name));
      out.push(item);
    } catch (e) { out.push({ kind: it.kind, err: `gagal unduh (${String(e.message).slice(0, 80)})` }); }
  }
  return out;
}
// ---------- transkripsi suara (voice note, suara video, audio link) — 22 Nov 2026
const envv = (k) => {
  if (process.env[k]) return process.env[k];
  try { return readFileSync(join(ROOT, '.env'), 'utf8').match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim().replace(/^["']|["']$/g, ''); } catch { return undefined; }
};
const WDIR = join(homedir(), 'AppData', 'Local', 'Programs', 'whisper.cpp'); // lokasi whisper.cpp di laptop (sama dengan clipper-laptop.mjs)
const whisperCpp = () => {
  const bin = envv('WHISPER_BIN') || (process.platform === 'win32' ? join(WDIR, 'Release', 'whisper-cli.exe') : 'whisper-cli');
  const model = envv('WHISPER_MODEL') || join(WDIR, 'models', 'ggml-large-v3-turbo-q5_0.bin');
  const found = /[\\/]/.test(bin) ? existsSync(bin) : !spawnSync(bin, ['-h'], { encoding: 'utf8' }).error;
  return found && existsSync(model) ? { bin, model } : null;
};
const PY = () => envv('WHISPER_PY') || (process.platform === 'win32' ? 'python' : 'python3');
const FW = String.raw`import sys
from faster_whisper import WhisperModel
m = WhisperModel(sys.argv[2], compute_type="int8")
segs, _ = m.transcribe(sys.argv[1], language="id")
print(" ".join(s.text.strip() for s in segs))`;
let ENG = null, ENG_AT = 0;
// mesin transkripsi yang tersedia di mesin ini (dicek ulang tiap 5 menit): 'whisper.cpp' | 'faster-whisper' | 'groq' | 'openai' | null
export function engine() {
  if (Date.now() - ENG_AT < 300_000) return ENG;
  ENG_AT = Date.now();
  if (whisperCpp()) return (ENG = 'whisper.cpp');
  if (spawnSync(PY(), ['-c', 'import faster_whisper'], { encoding: 'utf8' }).status === 0) return (ENG = 'faster-whisper');
  if (envv('GROQ_API_KEY')) return (ENG = 'groq');
  if (envv('OPENAI_API_KEY')) return (ENG = 'openai');
  return (ENG = null);
}
const NO_ENGINE = 'server belum punya mesin transkripsi (admin: pasang whisper.cpp → WHISPER_BIN + WHISPER_MODEL, atau pip install faster-whisper, atau isi GROQ_API_KEY di .env)';
export async function transcribe(abs, { quiet = false } = {}) {
  const eng = engine();
  const fail = (e) => (quiet ? {} : { trErr: e });
  if (!eng) return fail(NO_ENGINE);
  const wav = `${abs}.16k.wav`;
  const c = spawnSync(FFMPEG, ['-v', 'error', '-y', '-i', abs, '-vn', '-ar', '16000', '-ac', '1', '-t', '600', wav]); // maks 10 menit pertama
  if (c.status !== 0 || !existsSync(wav)) return fail('audionya nggak kebaca / nggak ada suaranya');
  try {
    let text = '';
    if (eng === 'whisper.cpp') { const w = whisperCpp(); text = spawnSync(w.bin, ['-m', w.model, '-l', 'id', '-nt', '-f', wav], { encoding: 'utf8', timeout: 300_000, maxBuffer: 1 << 26 }).stdout ?? ''; }
    else if (eng === 'faster-whisper') text = spawnSync(PY(), ['-c', FW, wav, envv('WHISPER_MODEL_NAME') || 'small'], { encoding: 'utf8', timeout: 600_000, maxBuffer: 1 << 26 }).stdout ?? '';
    else {
      const groq = eng === 'groq';
      const fd = new FormData();
      fd.append('file', new Blob([readFileSync(wav)], { type: 'audio/wav' }), 'audio.wav');
      fd.append('model', groq ? 'whisper-large-v3-turbo' : 'whisper-1');
      fd.append('language', 'id');
      fd.append('response_format', 'text');
      const r = await fetch(groq ? 'https://api.groq.com/openai/v1/audio/transcriptions' : 'https://api.openai.com/v1/audio/transcriptions',
        { method: 'POST', headers: { Authorization: `Bearer ${envv(groq ? 'GROQ_API_KEY' : 'OPENAI_API_KEY')}` }, body: fd, signal: AbortSignal.timeout(120_000) });
      if (!r.ok) throw new Error(`${eng} HTTP ${r.status}`);
      text = await r.text();
    }
    text = text.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim(); // buang penanda [BLANK_AUDIO] dst
    return text ? { transcript: text.slice(0, 6000) } : fail('suaranya kosong / nggak kedengeran');
  } catch (e) { return fail(`transkripsi gagal (${String(e.message).slice(0, 80)})`); }
  finally { try { rmSync(wav, { force: true }); } catch { /* sudah hilang */ } }
}

// teks dari .docx / .xlsx (string teks sel) / .pptx lewat python zipfile
const OFFICE_PY = String.raw`import sys, zipfile, re, html
z = zipfile.ZipFile(sys.argv[1]); n = z.namelist(); o = []
t = lambda x: html.unescape(re.sub(r"<[^>]+>", "", x))
if "word/document.xml" in n:
    d = z.read("word/document.xml").decode("utf8", "ignore")
    for p in re.findall(r"<w:p[ >].*?</w:p>", d, re.S): o.append(t("".join(re.findall(r"<w:t[^>]*>(.*?)</w:t>", p, re.S))))
elif "xl/sharedStrings.xml" in n:
    d = z.read("xl/sharedStrings.xml").decode("utf8", "ignore")
    o = [t(x) for x in re.findall(r"<si>(.*?)</si>", d, re.S)]
else:
    for f in sorted(x for x in n if re.match(r"ppt/slides/slide\d+\.xml", x)):
        d = z.read(f).decode("utf8", "ignore"); o.append(" ".join(t(x) for x in re.findall(r"<a:t>(.*?)</a:t>", d, re.S)))
print("\n".join(x for x in o if x.strip()))`;
export function officeText(abs) {
  const r = spawnSync(PY(), ['-c', OFFICE_PY, abs], { encoding: 'utf8', timeout: 30_000, maxBuffer: 1 << 25 });
  return r.status === 0 ? r.stdout.trim().slice(0, 6000) : '';
}

// subtitle YouTube (manual/otomatis, id/en) → teks polos; kosong kalau nggak ada
function captionsOf(url, bot) {
  const dir = join(ROOT, 'tmp', 'telegram', bot);
  mkdirSync(dir, { recursive: true });
  const tag = `cap-${Date.now()}`;
  spawnSync('yt-dlp', ['--skip-download', '--write-subs', '--write-auto-subs', '--sub-langs', 'id.*,en.*', '--sub-format', 'vtt', '--no-warnings', '-o', join(dir, tag), url], { encoding: 'utf8', timeout: 60_000 });
  const f = readdirSync(dir).find((x) => x.startsWith(tag) && x.endsWith('.vtt'));
  if (!f) return null;
  const lines = readFileSync(join(dir, f), 'utf8').split(/\r?\n/).filter((l) => l.trim() && !/^(WEBVTT|Kind:|Language:|NOTE)|-->/.test(l)).map((l) => l.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
  for (const x of readdirSync(dir)) if (x.startsWith(tag)) rmSync(join(dir, x), { force: true });
  return lines.filter((l, i) => l !== lines[i - 1]).join(' ').slice(0, 5000) || null;
}
// audio dari link video (maks 10 menit / 25 MB) → path file, buat ditranskrip kalau mesin ada
function linkAudio(url, bot) {
  const dir = join(ROOT, 'tmp', 'telegram', bot);
  mkdirSync(dir, { recursive: true });
  const tag = `aud-${Date.now()}`;
  spawnSync('yt-dlp', ['-x', '--audio-format', 'mp3', '--no-playlist', '--max-filesize', '25M', '--match-filter', 'duration<600', '--no-warnings', '-o', join(dir, `${tag}.%(ext)s`), url], { encoding: 'utf8', timeout: 120_000 });
  const f = readdirSync(dir).find((x) => x.startsWith(tag));
  return f ? join(dir, f) : null;
}

// teks dari voice note yang berhasil ditranskrip (buat dijadikan isi pesan)
export const voiceText = (files = []) => files.filter((f) => f.kind === 'audio' && f.transcript).map((f) => f.transcript).join('\n');
// kalimat buat Owner kalau ada voice note yang belum bisa didengar
export const deafNote = (files = []) => {
  const bad = files.filter((f) => f.kind === 'audio' && !f.transcript);
  return bad.length ? `Voice note-nya belum bisa aku dengar: ${bad[0].trErr ?? bad[0].err ?? 'transkripsi gagal'}. Sementara ketik aja isinya ya Bos 🙏` : '';
};

// 6 frame merata dari video (buat dilihat pakai Read)
function frames(abs, relPath) {
  if (!tools().ffmpeg) return { frames: [], note: 'ffmpeg belum ada di server, isi video belum bisa dilihat' };
  const p = spawnSync(FFMPEG, ['-hide_banner', '-i', abs], { encoding: 'utf8' }); // durasi dari info stderr (tanpa ffprobe)
  const m = String(p.stderr).match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
  const dur = Math.max(0.5, m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0);
  const n = dur < 4 ? 3 : 6, list = [];
  for (let i = 0; i < n; i++) {
    const t = ((i + 0.5) * dur) / n, f = `${abs}-f${i + 1}.jpg`;
    const r = spawnSync(FFMPEG, ['-v', 'error', '-y', '-ss', t.toFixed(2), '-i', abs, '-frames:v', '1', '-vf', 'scale=640:-2', f]);
    if (r.status === 0 && existsSync(f)) list.push(`${relPath}-f${i + 1}.jpg`);
  }
  return { frames: list, dur: Math.round(dur) };
}

// isi link: sosmed → yt-dlp (judul, kreator, deskripsi, thumbnail), web biasa → judul + teks ringkas
export async function readLinks(urls, bot = 'telegram') {
  const out = [];
  for (const url of urls) {
    try {
      if (SOCIAL.test(url) && tools().ytdlp) {
        const r = spawnSync('yt-dlp', ['-j', '--no-playlist', '--skip-download', '--no-warnings', url], { encoding: 'utf8', timeout: 60_000, maxBuffer: 1 << 26 });
        if (r.status === 0) {
          const j = JSON.parse(r.stdout.split('\n').find((l) => l.startsWith('{')) ?? '{}');
          let thumb = null;
          if (j.thumbnail) {
            const tr = await fetch(j.thumbnail, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
            if (tr?.ok) { const rel = `tmp/telegram/${bot}/${Date.now()}-thumb.jpg`; mkdirSync(join(ROOT, dirname(rel)), { recursive: true }); writeFileSync(join(ROOT, rel), Buffer.from(await tr.arrayBuffer())); thumb = rel; }
          }
          // isi ucapan video: subtitle YouTube; TikTok/IG/X (atau tanpa subtitle) → audio ditranskrip kalau mesin ada
          let transcript = /youtube\.com|youtu\.be/i.test(url) ? captionsOf(url, bot) : null;
          if (!transcript && engine() && (j.duration ?? 0) <= 600) {
            const au = linkAudio(url, bot);
            if (au) { transcript = (await transcribe(au, { quiet: true })).transcript ?? null; try { rmSync(au, { force: true }); } catch { /* sudah hilang */ } }
          }
          out.push({ url, kind: 'video', title: j.title ?? j.fulltitle, by: j.uploader ?? j.channel, dur: j.duration, views: j.view_count, likes: j.like_count,
            date: j.upload_date, text: String(j.description ?? '').slice(0, 1200), thumb, transcript });
          continue;
        }
      }
      // cadangan resmi kalau yt-dlp gagal/kuno: oEmbed YouTube & TikTok (judul, kreator, thumbnail; tanpa deskripsi)
      const oe = /youtube\.com|youtu\.be/i.test(url) ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`
        : /tiktok\.com/i.test(url) ? `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}` : null;
      if (oe) {
        const j = await fetch(oe, { signal: AbortSignal.timeout(15_000) }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
        if (j?.title) {
          let thumb = null;
          const tr = j.thumbnail_url ? await fetch(j.thumbnail_url, { signal: AbortSignal.timeout(15_000) }).catch(() => null) : null;
          if (tr?.ok) { const rel = `tmp/telegram/${bot}/${Date.now()}-thumb.jpg`; mkdirSync(join(ROOT, dirname(rel)), { recursive: true }); writeFileSync(join(ROOT, rel), Buffer.from(await tr.arrayBuffer())); thumb = rel; }
          out.push({ url, kind: 'video', title: j.title, by: j.author_name, thumb, text: '(deskripsi nggak kebaca, cuma judul & thumbnail)' });
          continue;
        }
      }
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ZaaOfficeBot/1.0)', Accept: 'text/html,*/*' }, redirect: 'follow', signal: AbortSignal.timeout(20_000) });
      const type = r.headers.get('content-type') ?? '';
      if (/^image\//.test(type)) {
        const rel = `tmp/telegram/${bot}/${Date.now()}-link${type.includes('png') ? '.png' : '.jpg'}`;
        mkdirSync(join(ROOT, dirname(rel)), { recursive: true }); writeFileSync(join(ROOT, rel), Buffer.from(await r.arrayBuffer()));
        out.push({ url, kind: 'image', thumb: rel }); continue;
      }
      const html = (await r.text()).slice(0, 600_000);
      const meta = (k) => html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]+content=["']([^"']+)`, 'i'))?.[1];
      const title = meta('og:title') ?? html.match(/<title[^>]*>([^<]*)/i)?.[1];
      const body = html.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
      out.push({ url, kind: 'web', status: r.status, title: title?.trim(), text: `${meta('og:description') ?? meta('description') ?? ''}\n${body.slice(0, 2500)}`.trim() });
    } catch (e) { out.push({ url, kind: 'web', err: String(e.message).slice(0, 100) }); }
  }
  return out;
}

// catatan buat prompt AI (kosong kalau nggak ada lampiran)
export function mediaNote(files = [], links = []) {
  const L = [];
  for (const f of files) {
    if (f.err) L.push(`- ${f.kind}: ${f.err}`);
    else if (f.kind === 'image') L.push(`- gambar: ${f.path}`);
    else if (f.kind === 'audio') L.push(f.transcript ? `- voice note${f.dur ? ` ${f.dur} dtk` : ''} (hasil transkripsi, mungkin ada salah dengar): "${f.transcript}"` : `- voice note: BELUM BISA DIDENGAR (${f.trErr ?? 'transkripsi gagal'}) → bilang jujur ke Owner kamu nggak bisa dengar dan minta diketik`);
    else if (f.kind === 'video') L.push(`- video ${f.dur ?? '?'} dtk${f.frames?.length ? `, ${f.frames.length} frame berurutan: ${f.frames.join(', ')}` : ` (${f.note ?? 'frame belum bisa diambil'})`} (file asli: ${f.path}${f.transcript ? `; ucapan di video (transkripsi): "${f.transcript}"` : '; suaranya belum bisa didengar/tidak ada ucapan'})`);
    else L.push(`- file${f.name ? ` "${f.name}"` : ''}: ${f.path}${f.text ? `\n  isi: ${f.text.replace(/\n+/g, ' / ').slice(0, 3000)}` : ''}`);
  }
  for (const l of links) {
    if (l.err) { L.push(`- link ${l.url}: belum kebuka otomatis (${l.err}) → coba WebFetch`); continue; }
    if (l.kind === 'video') L.push(`- link video ${l.url}\n  judul: ${l.title ?? '-'} · oleh ${l.by ?? '-'} · ${l.dur ?? '?'} dtk · ${l.views ?? '?'} views · ${l.likes ?? '?'} likes · tgl ${l.date ?? '-'}${l.thumb ? `\n  thumbnail: ${l.thumb}` : ''}\n  deskripsi: ${String(l.text ?? '').replace(/\n+/g, ' ').slice(0, 900)}${l.transcript ? `\n  ucapan di video (subtitle/transkripsi): ${l.transcript.slice(0, 3500)}` : ''}`);
    else if (l.kind === 'image') L.push(`- link gambar ${l.url} → disimpan: ${l.thumb}`);
    else L.push(`- link ${l.url}${l.status && l.status >= 400 ? ` (HTTP ${l.status})` : ''}\n  judul: ${l.title ?? '-'}\n  isi: ${String(l.text ?? '').replace(/\n+/g, ' ').slice(0, 1500)}`);
  }
  if (!L.length) return '';
  return `\n\nLAMPIRAN dari Owner (referensi/bahan buat pesan di atas):\n${L.join('\n')}\nWAJIB buka tiap gambar/frame/thumbnail di atas pakai Read sebelum jawab (kamu bisa lihat gambar), dan pakai isi link sebagai konteks. Link yang isinya kurang → boleh WebFetch. Jelasin singkat apa yang kamu lihat kalau relevan.`;
}

// 1 langkah buat bot: pesan Telegram → { text, note } (text = teks/caption atau penanda kalau cuma kirim lampiran)
export async function digest(m, token, bot) {
  const text = String(m?.text ?? m?.caption ?? '').trim();
  const items = mediaIds(m), urls = urlsOf(text);
  if (!items.length && !urls.length) return { text, note: '', any: false };
  const files = items.length ? await fetchMedia(token, items, bot) : [];
  const links = urls.length ? await readLinks(urls, bot) : [];
  const spoken = voiceText(files); // voice note → ditranskrip jadi isi pesan
  const body = [text, spoken].filter(Boolean).join('\n');
  return { text: body || '(Owner cuma kirim lampiran tanpa teks — lihat lampirannya, tebak maksudnya sesuai kamar bot ini, lalu tanggapi/tanya singkat)', note: mediaNote(files.filter((f) => !(f.kind === 'audio' && f.transcript)), links), any: true };
}
