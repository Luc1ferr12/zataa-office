// Data tab 📶 Progress di web: posisi tiap konten per divisi + antrean render laptop (urutan & perkiraan selesai). 0 token.
// Dipakai web-api.mjs (GET /api/progress, live lewat tunnel) & office.mjs export (docs/data/progress.json, cadangan tiap ±10 menit).
// Isinya cuma hal yang memang sudah tampil di state.json (judul, status, jadwal); pesan error mentah TIDAK ikut.
//   node scripts/progress.mjs [path-db]   → cetak JSON (buat cek)
// Laporan laptop (scripts/render-progress.mjs) ditaruh di tmp/render-progress.json; nggak ada → perkiraan dari tabel EST.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.mjs';
import { BRANDS } from './brand.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'data', 'progress.json');
const MIN = 60_000;
// menit per film kalau laptop belum kirim angka asli (dari render 24 Nov 2026)
const EST = { 'brick-toy': 17, 'game-show': 25, 'caption-news': 8, telestrator: 10 };
const EST_ANY = 12;
// jam slot WIB (sama dengan SLOT di approval.mjs)
const SLOT = { pagi: '10:00', siang: '12:00', sore: '16:00', malam: '19:00', petang: '21:00' };
const ESPORTS_SESSIONS = ['07:00', '12:00', '16:00', '20:00']; // WITA

const DIVISIONS = [
  { key: 'esports', channel: '', name: 'About Esports', sessions: ESPORTS_SESSIONS,
    team: { dir: 'meeting', researcher: 'riset', copywriter: 'naskah', designer: 'editing', video: 'editing', publisher: 'approval' } },
  ...['history', 'story', 'marvel', 'cowo'].map((k) => {
    const B = BRANDS[k], T = B.team;
    return { key: k, channel: B.channel, name: B.name, sessions: ['07:00'],
      team: { [T.dir]: 'meeting', [T.research]: 'riset', [T.script]: 'naskah', [T.visual]: 'editing', [T.video]: 'editing', [T.publish]: 'approval' } };
  }),
];

const json = (s, d = {}) => { try { return JSON.parse(s) ?? d; } catch { return d; } };
const read = (p, d = null) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return d; } };
const utc = (ts) => (ts ? Date.parse(`${ts.replace(' ', 'T')}Z`) : null);
const iso = (ms) => (ms == null ? null : new Date(ms).toISOString());
const witaDay = (ms) => new Date(ms + 8 * 3600_000).toISOString().slice(0, 10);
const witaAt = (day, hm) => Date.parse(`${day}T${hm}:00+08:00`);
const wibAt = (day, hm) => Date.parse(`${day}T${hm}:00+07:00`);

const styleOf = (slug) => (slug ? read(join(ROOT, 'films', slug, 'film.json'))?.style ?? null : null);

// antrean render = urutan yang sama dengan laptop-worker.mjs (ORDER BY day, id); yang lagi dirender di paling atas
export function renderQueue(rows, laptop, now) {
  const renderFrom = laptop?.renderFrom ?? '09:45';
  const estOf = (style) => laptop?.est?.[style] ?? EST[style] ?? laptop?.est?._ ?? EST_ANY;
  const mine = rows.filter((c) => ['draft', 'revision'].includes(c.status) && [1, 2, 3].includes(c.d._laptop));
  const order = { 2: 0, 1: 1, 3: 2 };
  mine.sort((a, b) => order[a.d._laptop] - order[b.d._laptop] || a.day.localeCompare(b.day) || a.id - b.id);
  const open = witaAt(witaDay(now), renderFrom);
  const fresh = laptop?.at && now - Date.parse(laptop.at) < 3 * MIN;
  let free = now, pos = 0;
  return mine.map((c) => {
    const slug = c.d.film ? basename(c.d.film) : null;
    const style = styleOf(slug);
    const estMin = estOf(style);
    const q = { id: c.id, channel: c.channel ?? '', title: c.title, style, estMin };
    if (c.d._laptop === 3) return { ...q, state: 'gagal' };
    q.pos = ++pos;
    if (c.d._laptop === 2) {
      const live = fresh && slug && laptop.current?.slug === slug ? laptop.current : null;
      const start = live?.startedAt ? Date.parse(live.startedAt) : utc(c.updated_at); // updated_at = jam laptop ambil antrean
      const eta = live?.etaAt ? Date.parse(live.etaAt) : start + estMin * MIN;
      free = Math.max(eta, now + MIN);
      return { ...q, state: 'render', startAt: iso(start), etaAt: iso(eta), live: !!live, step: live?.step ?? null, stepPct: live?.stepPct ?? null, late: eta < now };
    }
    const start = Math.max(free, open);
    free = start + estMin * MIN;
    return { ...q, state: 'antre', startAt: iso(start), etaAt: iso(free), waitingWindow: open > now };
  });
}

// tahap satu konten → { stage, bad?, note, airAt?, doneAt?, links? }
function itemOf(c, q, working, now) {
  const shorts = c.channel != null && c.channel !== '';
  const jam = c.d._jam ?? '18:00';
  const airAt = shorts ? wibAt(c.day, jam) : SLOT[c.slot] ? wibAt(c.day, SLOT[c.slot]) : null;
  const it = { id: c.id, day: c.day, title: c.title, revisions: c.revisions || 0, airAt: iso(airAt) };
  const revisi = c.status === 'revision';
  switch (c.status) {
    case 'draft':
    case 'revision': {
      if (q?.state === 'render') return { ...it, stage: 'render', render: q, note: revisi ? 'Render ulang (revisi)' : '' };
      if (q?.state === 'antre') return { ...it, stage: 'antre', render: q, note: revisi ? 'Antre render ulang (revisi)' : '' };
      if (q?.state === 'gagal') return { ...it, stage: 'render', bad: true, note: 'Render gagal, nunggu dibenerin tim' };
      // belum masuk antrean → ikut pegawai divisi yang lagi kerja
      const s = ['riset', 'naskah', 'editing'].includes(working?.stage) ? working.stage : c.d.film ? 'editing' : 'naskah';
      return { ...it, stage: s, note: revisi ? 'Dikerjain ulang (revisi dari Bos)' : '', revisi };
    }
    case 'pending_approval': return { ...it, stage: 'approval', note: 'Nunggu ✅ Bos' };
    case 'approved':
    case 'scheduled':
      return airAt && airAt > now
        ? { ...it, stage: 'tunggu', note: 'Sudah di-✅, nunggu jam upload' }
        : { ...it, stage: 'upload', note: 'Sudah waktunya, upload diproses' };
    case 'uploading': return { ...it, stage: 'upload', note: 'Lagi di-upload' };
    case 'upload_failed':
    case 'publish_failed':
    case 'failed': return { ...it, stage: 'upload', bad: true, note: 'Upload gagal' };
    case 'uploaded':
    case 'posted': {
      const links = {};
      if (c.youtube_id) links.youtube = `https://youtube.com/shorts/${c.youtube_id}`;
      return { ...it, stage: 'tayang', done: true, doneAt: iso(utc(c.posted_at)), links, tiktok: !!c.tiktok_id, note: c.status === 'uploaded' ? 'Masih Private, tunggu diubah Publik' : '' };
    }
    case 'rejected': return { ...it, stage: 'approval', bad: true, rejected: true, note: 'Ditolak Bos' };
    default: return { ...it, stage: 'editing', note: c.status };
  }
}

export function buildProgress({ db: path, now = Date.now(), laptop: given } = {}) {
  const d = path ? openDb(path) : openDb();
  try {
    const today = witaDay(now);
    const since = witaDay(now - 3 * 86400_000);
    const rows = d.prepare(`SELECT id, day, slot, format, title, status, channel, data_json, youtube_id, tiktok_id, posted_at, updated_at, revisions
        FROM contents WHERE day >= ? ORDER BY day, id`).all(since)
      .map((c) => ({ ...c, d: json(c.data_json) }))
      .filter((c) => !c.d._test);
    const agents = d.prepare('SELECT id, name, status, current_task, updated_at FROM agents').all();
    const ideas = d.prepare("SELECT id, title, status, sesi FROM ideas WHERE day = ? AND status IN ('proposed', 'approved') ORDER BY id").all(today);
    const laptop = given !== undefined ? given : read(join(ROOT, 'tmp', 'render-progress.json'));
    const queue = renderQueue(rows, laptop, now);
    const qById = new Map(queue.map((q) => [q.id, q]));
    const wita = new Date(now + 8 * 3600_000).toISOString().slice(11, 16);

    const divisions = DIVISIONS.map((div) => {
      // pegawai divisi yang statusnya 'working' ≤90 menit terakhir (lebih lama = sisa status basi)
      const w = agents.filter((a) => a.id in div.team && a.status === 'working' && now - utc(a.updated_at) < 90 * MIN)
        .sort((a, b) => utc(b.updated_at) - utc(a.updated_at))[0];
      const working = w ? { id: w.id, name: w.name, task: w.current_task, stage: div.team[w.id], at: iso(utc(w.updated_at)) } : null;
      const items = rows.filter((c) => (c.channel ?? '') === div.channel)
        .filter((c) => {
          if (c.day === today) return true;
          if (['posted', 'uploaded'].includes(c.status)) return c.posted_at && witaDay(utc(c.posted_at)) === today;
          if (c.status === 'rejected') return false;
          return c.day > today || now - utc(c.updated_at) < 36 * 3600_000; // sisa kemarin yang masih jalan
        })
        .map((c) => itemOf(c, qById.get(c.id), working, now));
      if (div.key === 'esports') {
        for (const x of ideas) items.push({
          idea: x.id, day: today, title: x.title, stage: x.status === 'proposed' ? 'riset' : 'naskah',
          note: x.status === 'proposed' ? 'Hasil riset nunggu ✅ Bos' : 'Ide di-✅, konten mau dibikin', waitOwner: x.status === 'proposed',
        });
      }
      const next = div.sessions.find((s) => s > wita);
      return { key: div.key, name: div.name, working, items, nextSession: next ? `hari ini ${next}` : `besok ${div.sessions[0]}` };
    });

    return {
      at: iso(now), today,
      laptop: laptop?.at ? { at: laptop.at, renderFrom: laptop.renderFrom ?? '09:45' } : { at: null, renderFrom: '09:45' },
      queue,
      divisions,
    };
  } finally { d.close(); }
}

export function writeProgress() {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(buildProgress(), null, 1)}\n`);
  return existsSync(OUT);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(JSON.stringify(buildProgress({ db: process.argv[2] }), null, 1));
}
