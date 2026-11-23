#!/usr/bin/env node
// Upload TikTok & YouTube lewat Zernio (zernio.com, app-nya sudah lolos audit → langsung Publik). IG tetap lewat publish.mjs.
// Tanpa AI → 0 token. Satu login Zernio per divisi (21 Nov 2026), masing-masing TikTok + YouTube:
//   ZERNIO_ESPORTS_API_KEY About Esports · ZERNIO_HISTORY_API_KEY Zaa History · ZERNIO_STORY_API_KEY Zaa Story · ZERNIO_MARVEL_API_KEY Marvel Talk · ZERNIO_CLIP_API_KEY Zaa Clips
//   Id akun tetap opsional: <PREFIX>_<PLATFORM>_ACCOUNT (mis. ZERNIO_STORY_TIKTOK_ACCOUNT); kosong = akun aktif pertama di login itu.
// Key default ikut brand proses (--brand=story → akun 2); socials.mjs bisa pilih lewat opsi keyEnv.
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
import { B } from './brand.mjs';

const API = 'https://zernio.com/api/v1';
const env = () => ({ ...loadEnv(), ...process.env });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const zernioOn = () => !!env()[B.zernioEnv];
// TikTok brand: satu login dengan YouTube-nya (B.tiktokEnv opsional kalau suatu saat dipisah)
export const tiktokEnv = () => B.tiktokEnv ?? B.zernioEnv;
export const tiktokOn = () => !!env()[tiktokEnv()];

export async function api(path, { method = 'GET', body, headers = {}, keyEnv = B.zernioEnv } = {}) {
  const key = env()[keyEnv];
  if (!key) throw new Error(`${keyEnv} belum diisi di .env`);
  const r = await fetch(`${API}${path}`, {
    method, headers: { Authorization: `Bearer ${key}`, ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Zernio ${r.status}: ${j.error?.message ?? j.message ?? j.error ?? r.statusText}`);
  return { status: r.status, ...j };
}

// akun per platform: id tetap dari .env kalau diisi (lihat di bawah), kalau tidak ambil akun aktif pertama di login Zernio itu
async function accountId(platform, keyEnv = B.zernioEnv, prefix = B.zernioAcct) {
  // kunci akun per Zernio login: akun 1 ZERNIO_<PLATFORM>_ACCOUNT, akun 2 (Story) ZERNIO_STORY_…, akun 3 (Marvel) ZERNIO_MARVEL_… — jangan sampai id akun 1 dipakai di akun lain
  const fixed = env()[`${prefix}_${platform.toUpperCase()}_ACCOUNT`];
  if (fixed) return fixed;
  const { accounts = [] } = await api('/accounts', { keyEnv });
  const a = accounts.find((x) => x.platform === platform && x.isActive !== false);
  if (!a) throw new Error(`Zernio: belum ada akun ${platform} yang terhubung`);
  return a._id;
}

async function uploadMedia(file, keyEnv = B.zernioEnv) {
  const { uploadUrl, publicUrl } = await api('/media/presign', { method: 'POST', keyEnv, body: { filename: basename(file), contentType: 'video/mp4' } });
  const r = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'video/mp4' }, body: await readFile(file) });
  if (!r.ok) throw new Error(`Zernio upload video: HTTP ${r.status}`);
  return publicUrl;
}

// kunci idempotensi dari id konten → retry tidak bikin posting dobel
const idemKey = (s) => { const h = createHash('sha1').update(s).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`; };

async function post(platform, file, content, extra, key) {
  const keyEnv = extra.keyEnv ?? B.zernioEnv; // Zaa Clips pakai akun Zernio sendiri (ZERNIO_CLIP_API_KEY)
  const body = {
    content, publishNow: true,
    mediaItems: [{ type: 'video', url: await uploadMedia(file, keyEnv) }],
    platforms: [{ platform, accountId: extra.accountId ?? await accountId(platform, keyEnv, extra.prefix), ...(extra.platformSpecificData ? { platformSpecificData: extra.platformSpecificData } : {}) }],
    ...(extra.root ?? {}),
  };
  let { post: p } = await api('/posts', { method: 'POST', keyEnv, body, headers: key ? { 'Idempotency-Key': idemKey(key) } : {} });
  // publishNow biasanya langsung final; kalau masih proses, tunggu maks ±10 menit
  for (let i = 0; i < 60 && !['published', 'failed', 'partial'].includes(p.status); i++) {
    await sleep(10_000);
    ({ post: p } = await api(`/posts/${p._id}`, { keyEnv }));
  }
  const pl = p.platforms?.find((x) => x.platform === platform) ?? {};
  if (pl.status === 'failed' || p.status === 'failed') throw new Error(`Zernio ${platform} gagal: ${pl.errorMessage ?? p.status}`);
  return { postId: p._id, status: pl.status ?? p.status, url: pl.platformPostUrl ?? null, platformPostId: pl.platformPostId ?? null };
}

export async function youtubeUpload(file, meta, key, opts = {}) {
  const r = await post('youtube', file, meta.description ?? '', {
    ...(opts.keyEnv ? { keyEnv: opts.keyEnv, prefix: opts.prefix } : {}), // About Esports: ZERNIO_ESPORTS_API_KEY
    root: { tags: meta.tags ?? [] },
    platformSpecificData: { title: String(meta.title ?? '').slice(0, 100), visibility: 'public', madeForKids: false, containsSyntheticMedia: !!meta.synthetic, categoryId: '27' }, // 27 = Education
  }, key);
  const id = r.platformPostId ?? r.url?.match(/(?:shorts\/|v=|youtu\.be\/)([\w-]{11})/)?.[1] ?? r.postId;
  return { ok: true, id, url: r.url ?? `https://youtube.com/shorts/${id}`, privacy: r.status === 'published' ? 'public' : 'processing', zernio_post: r.postId };
}

// Zaa Clips (16 Nov 2026): 1 clip → TikTok / Instagram (video tunggal = Reel) di Zernio akun 4 (ZERNIO_CLIP_API_KEY, id akun ZERNIO_CLIP_<PLATFORM>_ACCOUNT)
export async function clipPost(platform, file, caption, key) {
  const extra = { keyEnv: 'ZERNIO_CLIP_API_KEY', prefix: 'ZERNIO_CLIP' };
  if (platform === 'tiktok') extra.root = { tiktokSettings: { privacy_level: 'PUBLIC_TO_EVERYONE', allow_comment: true, allow_duet: true, allow_stitch: true, content_preview_confirmed: true, express_consent_given: true } };
  const r = await post(platform, file, caption.slice(0, 2200), extra, key);
  return { ok: true, id: r.platformPostId ?? r.postId, url: r.url, status: r.status, zernio_post: r.postId };
}
// views/likes per post Zernio (id post Zernio → {views, likes, comments, url}) buat syarat Clippo: ≥1.000 views & like rate ≥0,5%
export async function postStatsMap(platform, keyEnv = 'ZERNIO_CLIP_API_KEY', days = 60) {
  const from = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const out = {};
  for (let page = 1; page <= 5; page++) {
    const j = await api(`/analytics?platform=${platform}&fromDate=${from}&limit=100&page=${page}`, { keyEnv });
    // id post yang kita simpan (hasil POST /posts) ada di latePostId; _id = id record analytics → simpan dua-duanya
    for (const p of j.posts ?? []) {
      const s = { views: p.analytics?.views ?? 0, likes: p.analytics?.likes ?? 0, comments: p.analytics?.comments ?? 0, url: p.platformPostUrl ?? null };
      out[p._id] = s;
      if (p.latePostId) out[p.latePostId] = s;
    }
    if (page >= (j.pagination?.pages ?? 1)) break;
  }
  return out;
}

// account: id akun Zernio tertentu (mis. TikTok Zaa Story), kosong = akun TikTok default (zataa.topup)
// opts {keyEnv, prefix}: paksa login Zernio tertentu (About Esports → ZERNIO_ESPORTS_API_KEY/ZERNIO_ESPORTS); tanpa opts ikut brand Shorts proses ini
export async function tiktokPost(file, caption, key, account = null, opts = {}) {
  const r = await post('tiktok', file, caption.slice(0, 2200), {
    accountId: account ?? undefined, keyEnv: opts.keyEnv ?? tiktokEnv(), prefix: opts.prefix ?? B.tiktokAcct ?? B.zernioAcct,
    root: { tiktokSettings: { privacy_level: 'PUBLIC_TO_EVERYONE', allow_comment: true, allow_duet: true, allow_stitch: true, content_preview_confirmed: true, express_consent_given: true } },
  }, key);
  return { ok: true, id: r.platformPostId ?? r.postId, url: r.url, status: r.status };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [cmd, a, b] = process.argv.slice(2).filter((x) => !x.startsWith('--brand='));
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
