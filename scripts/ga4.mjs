// GA4 toko zataa.my.id (property "Zataa Store", tag G-GX33CTMBHG dipasang di panel UniPlay → SEO & Pixel).
// Baca lewat Google Analytics Data API pakai service account (tanpa dependency: JWT RS256 ditandatangani node:crypto).
// .env: GA4_PROPERTY_ID=<angka property>, GA4_KEY_FILE=.env.ga4.json (default; file JSON key service account, ke-ignore git)
//   node scripts/ga4.mjs [hari]   → ringkasan kunjungan per sumber (utm_source) & konten (utm_campaign)
import { readFileSync, existsSync } from 'node:fs';
import { createSign } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './approval.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const b64url = (s) => Buffer.from(s).toString('base64url');

function config() {
  const e = { ...loadEnv(), ...process.env };
  const keyFile = join(ROOT, e.GA4_KEY_FILE || '.env.ga4.json');
  if (!e.GA4_PROPERTY_ID || !existsSync(keyFile)) return null;
  return { property: e.GA4_PROPERTY_ID, key: JSON.parse(readFileSync(keyFile, 'utf8')) };
}
export const ga4Ready = () => !!config();

let cached = null; // { token, exp }
async function token(key) {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({ iss: key.client_email, scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const sig = createSign('RSA-SHA256').update(`${head}.${claim}`).sign(key.private_key, 'base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST',
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claim}.${sig}` }) });
  const j = await r.json();
  if (!j.access_token) throw new Error(`GA4 token gagal: ${j.error_description ?? j.error ?? r.status}`);
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return cached.token;
}

async function report(cfg, body) {
  const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${cfg.property}:runReport`, {
    method: 'POST', headers: { Authorization: `Bearer ${await token(cfg.key)}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(`GA4 runReport ${r.status}: ${j.error?.message ?? ''}`.slice(0, 200));
  return (j.rows ?? []).map((row) => [...(row.dimensionValues ?? []).map((v) => v.value), ...(row.metricValues ?? []).map((v) => Number(v.value))]);
}

// tanggal YYYY-MM-DD (zona property = WIB) atau 'today' / 'NdaysAgo'
export async function ga4Stats(startDate, endDate = 'today') {
  const cfg = config();
  if (!cfg) return null;
  const dateRanges = [{ startDate, endDate }];
  const [tot] = await report(cfg, { dateRanges, metrics: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'keyEvents' }] });
  const bySrc = await report(cfg, { dateRanges, dimensions: [{ name: 'sessionSource' }], metrics: [{ name: 'sessions' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 6 });
  // utm_campaign=konten-<id> dari golink.mjs → kunjungan per konten
  const byContent = await report(cfg, { dateRanges, dimensions: [{ name: 'sessionCampaignName' }], metrics: [{ name: 'sessions' }],
    dimensionFilter: { filter: { fieldName: 'sessionCampaignName', stringFilter: { matchType: 'BEGINS_WITH', value: 'konten-' } } },
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 3 });
  return {
    sessions: tot?.[0] ?? 0, users: tot?.[1] ?? 0, key_events: tot?.[2] ?? 0,
    by_src: bySrc.map(([src, n]) => ({ src, n })),
    top: byContent.map(([c, n]) => ({ id: +c.slice(7), n })),
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  if (!ga4Ready()) { console.error('GA4 belum disetel: isi GA4_PROPERTY_ID di .env + taruh key service account di .env.ga4.json'); process.exit(1); }
  const days = +(process.argv[2] ?? 7);
  console.log(JSON.stringify(await ga4Stats(`${days - 1}daysAgo`), null, 2));
}
