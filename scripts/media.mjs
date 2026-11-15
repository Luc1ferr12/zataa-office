// Lampiran Owner di Telegram (semua bot) → file lokal + catatan prompt buat Claude/Haiku (16 Nov 2026).
//   foto / gambar dokumen → disimpan, dibaca pakai Read (Claude bisa lihat gambar)
//   video / video note / GIF → 6 frame JPG merata (ffmpeg) + durasi; audio belum bisa didengar
//   PDF / dokumen lain → disimpan, path-nya dikasih (Read bisa buka PDF)
//   link di teks → YouTube/TikTok/IG/X/FB: judul, kreator, durasi, deskripsi, thumbnail (yt-dlp); web biasa: judul + isi ringkas
// Batas Bot API: file >20 MB nggak bisa diunduh bot → minta Owner kirim link. File di tmp/telegram/<bot>/ (gitignore), dihapus >3 hari.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readdirSync, statSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
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
    out.push({ id: m.document.file_id, kind: mt.startsWith('image/') ? 'image' : mt.startsWith('video/') ? 'video' : 'doc', name: m.document.file_name, size: m.document.file_size });
  }
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
      const kind = it.kind === 'doc' && /\.(jpe?g|png|webp|gif)$/i.test(ext) ? 'image' : it.kind === 'doc' && /\.(mp4|mov|mkv|webm)$/i.test(ext) ? 'video' : it.kind;
      const item = { kind, path: `${rel}/${name}`.replace(/\\/g, '/'), name: it.name };
      if (kind === 'video') Object.assign(item, frames(join(dir, name), `${rel}/${name}`));
      out.push(item);
    } catch (e) { out.push({ kind: it.kind, err: `gagal unduh (${String(e.message).slice(0, 80)})` }); }
  }
  return out;
}
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
          out.push({ url, kind: 'video', title: j.title ?? j.fulltitle, by: j.uploader ?? j.channel, dur: j.duration, views: j.view_count, likes: j.like_count,
            date: j.upload_date, text: String(j.description ?? '').slice(0, 1200), thumb });
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
    else if (f.kind === 'video') L.push(`- video ${f.dur ?? '?'} dtk${f.frames?.length ? `, ${f.frames.length} frame berurutan: ${f.frames.join(', ')}` : ` (${f.note ?? 'frame belum bisa diambil'})`} (file asli: ${f.path}; suaranya belum bisa didengar)`);
    else L.push(`- file${f.name ? ` "${f.name}"` : ''}: ${f.path}`);
  }
  for (const l of links) {
    if (l.err) { L.push(`- link ${l.url}: belum kebuka otomatis (${l.err}) → coba WebFetch`); continue; }
    if (l.kind === 'video') L.push(`- link video ${l.url}\n  judul: ${l.title ?? '-'} · oleh ${l.by ?? '-'} · ${l.dur ?? '?'} dtk · ${l.views ?? '?'} views · ${l.likes ?? '?'} likes · tgl ${l.date ?? '-'}${l.thumb ? `\n  thumbnail: ${l.thumb}` : ''}\n  deskripsi: ${String(l.text ?? '').replace(/\n+/g, ' ').slice(0, 900)}`);
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
  return { text: text || '(Owner cuma kirim lampiran tanpa teks — lihat lampirannya, tebak maksudnya sesuai kamar bot ini, lalu tanggapi/tanya singkat)', note: mediaNote(files, links), any: true };
}
