#!/usr/bin/env node
// Upload TikTok & YouTube lewat Zernio (zernio.com, app-nya sudah lolos audit → langsung Publik). IG tetap lewat publish.mjs.
// Aktif kalau ZERNIO_API_KEY ada di .env (VPS). Tanpa AI → 0 token.
//   node scripts/zernio.mjs accounts                         cek key + akun yang terhubung
//   node scripts/zernio.mjs youtube <video.mp4> <meta.json>  upload Shorts publik (meta: title, description, tags, synthetic) → JSON {id,url,privacy}
//   node scripts/zernio.mjs tiktok <video.mp4> "<caption>"   posting TikTok publik → JSON {id,url}
process.removeAllListeners('warning');
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { loadEnv } from './approval.mjs';

const API = 'https://zernio.com/api/v1';
const env = () => ({ ...loadEnv(), ...process.env });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const zernioOn = () => !!env().ZERNIO_API_KEY;

export async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const key = env().ZERNIO_API_KEY;
  if (!key) throw new Error('ZERNIO_API_KEY belum diisi di .env');
  const r = await fetch(`${API}${path}`, {
    method, headers: { Authorization: `Bearer ${key}`, ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Zernio ${r.status}: ${j.error?.message ?? j.message ?? j.error ?? r.statusText}`);
  return { status: r.status, ...j };
}

// akun per platform: ZERNIO_TIKTOK_ACCOUNT / ZERNIO_YOUTUBE_ACCOUNT kalau diisi, kalau tidak ambil akun aktif pertama
async function accountId(platform) {
  const fixed = env()[`ZERNIO_${platform.toUpperCase()}_ACCOUNT`];
  if (fixed) return fixed;
  const { accounts = [] } = await api('/accounts');
  const a = accounts.find((x) => x.platform === platform && x.isActive !== false);
  if (!a) throw new Error(`Zernio: belum ada akun ${platform} yang terhubung`);
  return a._id;
}

async function uploadMedia(file) {
  const { uploadUrl, publicUrl } = await api('/media/presign', { method: 'POST', body: { filename: basename(file), contentType: 'video/mp4' } });
  const r = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'video/mp4' }, body: await readFile(file) });
  if (!r.ok) throw new Error(`Zernio upload video: HTTP ${r.status}`);
  return publicUrl;
}

// kunci idempotensi dari id konten → retry tidak bikin posting dobel
const idemKey = (s) => { const h = createHash('sha1').update(s).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`; };

async function post(platform, file, content, extra, key) {
  const body = {
    content, publishNow: true,
    mediaItems: [{ type: 'video', url: await uploadMedia(file) }],
    platforms: [{ platform, accountId: extra.accountId ?? await accountId(platform), ...(extra.platformSpecificData ? { platformSpecificData: extra.platformSpecificData } : {}) }],
    ...(extra.root ?? {}),
  };
  let { post: p } = await api('/posts', { method: 'POST', body, headers: key ? { 'Idempotency-Key': idemKey(key) } : {} });
  // publishNow biasanya langsung final; kalau masih proses, tunggu maks ±10 menit
  for (let i = 0; i < 60 && !['published', 'failed', 'partial'].includes(p.status); i++) {
    await sleep(10_000);
    ({ post: p } = await api(`/posts/${p._id}`));
  }
  const pl = p.platforms?.find((x) => x.platform === platform) ?? {};
  if (pl.status === 'failed' || p.status === 'failed') throw new Error(`Zernio ${platform} gagal: ${pl.errorMessage ?? p.status}`);
  return { postId: p._id, status: pl.status ?? p.status, url: pl.platformPostUrl ?? null, platformPostId: pl.platformPostId ?? null };
}

export async function youtubeUpload(file, meta, key) {
  const r = await post('youtube', file, meta.description ?? '', {
    root: { tags: meta.tags ?? [] },
    platformSpecificData: { title: String(meta.title ?? '').slice(0, 100), visibility: 'public', madeForKids: false, containsSyntheticMedia: !!meta.synthetic, categoryId: '27' }, // 27 = Education
  }, key);
  const id = r.platformPostId ?? r.url?.match(/(?:shorts\/|v=|youtu\.be\/)([\w-]{11})/)?.[1] ?? r.postId;
  return { ok: true, id, url: r.url ?? `https://youtube.com/shorts/${id}`, privacy: r.status === 'published' ? 'public' : 'processing', zernio_post: r.postId };
}

// account: id akun Zernio tertentu (mis. TikTok Zataa Story), kosong = akun TikTok default (zataa.topup)
export async function tiktokPost(file, caption, key, account = null) {
  const r = await post('tiktok', file, caption.slice(0, 2200), {
    accountId: account ?? undefined,
    root: { tiktokSettings: { privacy_level: 'PUBLIC_TO_EVERYONE', allow_comment: true, allow_duet: true, allow_stitch: true, content_preview_confirmed: true, express_consent_given: true } },
  }, key);
  return { ok: true, id: r.platformPostId ?? r.postId, url: r.url, status: r.status };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [cmd, a, b] = process.argv.slice(2);
  try {
    if (cmd === 'accounts') {
      const { accounts = [] } = await api('/accounts');
      for (const x of accounts) console.log(`${x.platform}\t${x.username}\t${x._id}${x.isActive === false ? '\t(nonaktif)' : ''}`);
    } else if (cmd === 'youtube' && a && b) {
      console.log(JSON.stringify(await youtubeUpload(a, JSON.parse(readFileSync(b, 'utf8')))));
    } else if (cmd === 'tiktok' && a && b) {
      console.log(JSON.stringify(await tiktokPost(a, b)));
    } else {
      console.log('pakai: accounts | youtube <video> <meta.json> | tiktok <video> "<caption>"');
      process.exit(1);
    }
  } catch (e) { console.error(e.message); process.exit(1); }
}
