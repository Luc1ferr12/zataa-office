#!/usr/bin/env node
// YouTube Data API untuk divisi Shorts (Kirana). Kredensial di .env: YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN.
//   node scripts/youtube.mjs auth                      izin sekali dari akun channel (buka link di browser, laptop) → cetak refresh token
//   node scripts/youtube.mjs whoami                    cek channel yang tersambung
//   node scripts/youtube.mjs upload <mp4> <meta.json>  upload Shorts (meta: { title, description, tags[], synthetic?, privacy? })
// Catatan: project API yang belum diaudit YouTube → video yang di-upload lewat API otomatis Private (Owner ubah ke Publik di YouTube Studio).
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, createReadStream } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...Object.fromEntries((existsSync(join(ROOT, '.env')) ? readFileSync(join(ROOT, '.env'), 'utf8') : '').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])), ...process.env };
const SCOPES = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly', 'https://www.googleapis.com/auth/yt-analytics.readonly'];
const need = (k) => env[k] || (console.error(`${k} kosong di .env`), process.exit(1));

async function token() {
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ client_id: need('YT_CLIENT_ID'), client_secret: need('YT_CLIENT_SECRET'), refresh_token: need('YT_REFRESH_TOKEN'), grant_type: 'refresh_token' }) });
  const j = await r.json();
  if (!j.access_token) throw new Error(`token YouTube gagal: ${j.error_description ?? j.error}`);
  return j.access_token;
}

const [cmd, a1, a2] = process.argv.slice(2);
if (cmd === 'auth') {
  // alur "loopback" untuk Desktop app: server kecil di 127.0.0.1 menangkap kode izin
  const srv = createServer(async (req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    const code = u.searchParams.get('code');
    if (!code) return res.writeHead(404).end();
    const redirect = `http://127.0.0.1:${srv.address().port}`;
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ code, client_id: need('YT_CLIENT_ID'), client_secret: need('YT_CLIENT_SECRET'), redirect_uri: redirect, grant_type: 'authorization_code' }) });
    const j = await r.json();
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(j.refresh_token ? '<h2>Zataa Shorts tersambung ke YouTube ✅</h2>Tab ini boleh ditutup.' : `<h2>Gagal</h2>${j.error_description ?? j.error}`);
    if (j.refresh_token) console.log(`YT_REFRESH_TOKEN=${j.refresh_token}`);
    else console.error('gagal:', j.error_description ?? j.error);
    srv.close();
  }).listen(+(env.YT_AUTH_PORT ?? 0), '127.0.0.1', () => {
    const p = new URLSearchParams({ client_id: need('YT_CLIENT_ID'), redirect_uri: `http://127.0.0.1:${srv.address().port}`, response_type: 'code', scope: SCOPES.join(' '), access_type: 'offline', prompt: 'consent' });
    console.error(`Buka link ini di browser dan pilih akun channel YouTube:\nhttps://accounts.google.com/o/oauth2/v2/auth?${p}`);
  });
} else if (cmd === 'whoami') {
  const r = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true', { headers: { Authorization: `Bearer ${await token()}` } });
  const c = (await r.json()).items?.[0];
  console.log(c ? JSON.stringify({ id: c.id, title: c.snippet.title, handle: c.snippet.customUrl, subscribers: c.statistics.subscriberCount, videos: c.statistics.videoCount }) : 'tidak ada channel di akun ini');
} else if (cmd === 'upload') {
  if (!a1 || !existsSync(a1)) { console.error('pakai: upload <file.mp4> <meta.json>'); process.exit(1); }
  const meta = a2 ? JSON.parse(readFileSync(a2, 'utf8')) : {};
  const title = String(meta.title ?? 'Shorts').slice(0, 100);
  const body = {
    snippet: { title, description: meta.description ?? '', tags: meta.tags ?? [], categoryId: '27', defaultLanguage: 'id', defaultAudioLanguage: 'id' },   // 27 = Education
    status: { privacyStatus: meta.privacy ?? 'private', selfDeclaredMadeForKids: false, containsSyntheticMedia: !!meta.synthetic },
  };
  const size = statSync(a1).size;
  const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'video/mp4', 'X-Upload-Content-Length': String(size) }, body: JSON.stringify(body),
  });
  if (!init.ok) throw new Error(`upload gagal dimulai: ${init.status} ${await init.text()}`);
  const up = await fetch(init.headers.get('location'), { method: 'PUT', headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(size) }, body: createReadStream(a1), duplex: 'half' });
  const v = await up.json();
  if (!v.id) throw new Error(`upload gagal: ${JSON.stringify(v).slice(0, 300)}`);
  console.log(JSON.stringify({ ok: true, id: v.id, url: `https://youtube.com/shorts/${v.id}`, privacy: v.status?.privacyStatus }));
} else {
  console.error('pakai: youtube.mjs auth | whoami | upload <mp4> <meta.json>');
}
