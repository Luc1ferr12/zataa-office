#!/usr/bin/env node
// Database aset esport (permintaan Owner 13 Nov 2026): logo semua tim + foto pemain aktif, update otomatis sebulan sekali.
// Sumber: Liquipedia API (CC-BY-SA; 1 request / 2 detik sesuai aturan API mereka), 0 token.
//   node scripts/roster.mjs raw <wiki> <halaman>        wikitext mentah (cek format)
//   node scripts/roster.mjs sync [game|slug]            tarik logo + roster + foto → assets/teams|players, indeks assets/roster.json
//   node scripts/roster.mjs find <kata>                 cari tim/pemain di database (path logo/foto siap pakai)
//   node scripts/roster.mjs add <game> <slug> "<Halaman Liquipedia>"   tambah tim ke daftar pantau
// Nama file ikut asset.mjs: teams/<slug>, players/<slug>-<pemain>.
process.removeAllListeners('warning');
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { get as saveAsset } from './asset.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = join(ROOT, 'assets', 'roster.json');
const UA = 'ZataaOffice-RosterBot/1.0 (https://zataa.my.id; esport content assets)';
const WIKI = { mlbb: 'mobilelegends', valorant: 'valorant', freefire: 'freefire' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slugify = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// daftar pantau awal: liga yang paling sering kita bahas (MPL ID, VCT 4 region, FF ID/SEA). Tambah lewat `add`.
const SEED = {
  mlbb: { onic: 'ONIC Esports', rrq: 'RRQ Hoshi', evos: 'EVOS', btr: 'Bigetron Esports', ae: 'Alter Ego', dewa: 'Dewa United Esports', geek: 'Geek Fam ID', tlid: 'Team Liquid ID', navi: 'Natus Vincere' },
  valorant: {
    // Pacific
    prx: 'Paper Rex', drx: 'DRX', t1: 'T1', gen: 'Gen.G',ts: 'Team Secret', rrq: 'Rex Regum Qeon', boom: 'BOOM Esports', ge: 'Global Esports', ns: 'Nongshim RedForce', zeta: 'ZETA DIVISION', dfm: 'DetonatioN FocusMe', tln: 'TALON',
    // Americas
    sentinels: 'Sentinels', nrg: 'NRG', c9: 'Cloud9', '100t': '100 Thieves', eg: 'Evil Geniuses', g2: 'G2 Esports', loud: 'LOUD', furia: 'FURIA', mibr: 'MIBR', lev: 'Leviatán', kru: 'KRÜ Esports', envy: 'ENVY',
    // EMEA
    fnatic: 'FNATIC', vitality: 'Team Vitality', th: 'Team Heretics', navi: 'Natus Vincere', fut: 'FUT Esports', kc: 'Karmine Corp', gentlemates: 'GIANTX', bbl: 'BBL Esports', tl: 'Team Liquid', koi: 'Movistar KOI',
    // China
    edg: 'EDward Gaming', blg: 'Bilibili Gaming', fpx: 'FunPlus Phoenix', te: 'Trace Esports', drg: 'Dragon Ranger Gaming', xlg: 'Xi Lai Gaming', ag: 'All Gamers', tec: 'Titan Esports Club', wol: 'Wolves Esports', jdg: 'JD Gaming',
  },
  freefire: { evos: 'EVOS Divine', rrq: 'RRQ Kazu', btr: 'Bigetron Esports', echo: 'ECHO Esports', ae: 'Alter Ego', dewa: 'Dewa United Esports', onic: 'ONIC Esports' },
};

const load = () => (existsSync(INDEX) ? JSON.parse(readFileSync(INDEX, 'utf8')) : { updated: null, source: 'Liquipedia (CC-BY-SA)', watch: SEED, teams: {} });
const save = (db) => writeFileSync(INDEX, JSON.stringify(db, null, 1) + '\n');

let last = 0;
async function api(wiki, params) {
  const wait = 2100 - (Date.now() - last);
  if (wait > 0) await sleep(wait);
  last = Date.now();
  const u = `https://liquipedia.net/${wiki}/api.php?` + new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  const r = await fetch(u, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip' }, signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`Liquipedia HTTP ${r.status}`);
  return r.json();
}

async function wikitext(wiki, page) {
  const j = await api(wiki, { action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', titles: page, redirects: '1' });
  const p = j.query?.pages?.[0];
  if (!p || p.missing) return null;
  return p.revisions?.[0]?.slots?.main?.content ?? null;
}

const field = (txt, name) => txt.match(new RegExp(`\\|\\s*${name}\\s*=\\s*([^|\\n}]+)`))?.[1]?.trim() || null;

// roster aktif: halaman tim cuma berisi {{ActiveSquadAuto}} → di-expand dulu (hasilnya baris "[[File:flag]] &nbsp;[[Link|id]] Nama ...")
// Format lama (SquadPlayer manual tanpa leavedate) tetap dibaca.
async function activePlayers(wiki, page, txt) {
  const sec = txt.split(/\n==(?!=)/).find((s) => /^\s*(Player Roster|Roster)/i.test(s)) ?? '';
  const active = sec.split(/\n===/).find((s) => /^\s*(Active|Current)/i.test(s)) ?? sec;
  let src = active;
  if (/\{\{\s*ActiveSquadAuto/i.test(active)) {
    const j = await api(wiki, { action: 'expandtemplates', title: page, text: active.replace(/^[^\n]*\n/, '').trim(), prop: 'wikitext' });
    src = j.expandtemplates?.wikitext ?? '';
  }
  const out = [];
  const seen = new Set();
  const add = (id, link, name, role) => {
    if (!id || seen.has(id.toLowerCase()) || (role && /coach|manager|analyst|staff/i.test(role))) return;
    seen.add(id.toLowerCase());
    out.push({ id, link: link || id, name: name || null, role: role || null });
  };
  for (const m of src.matchAll(/\{\{\s*(?:SquadPlayer|SquadAutoRow|Person)\s*\|([^{}]+)\}\}/gi)) {
    const body = '|' + m[1];
    if (/\|\s*(leavedate|inactivedate)\s*=\s*\S/.test(body)) continue;
    add(field(body, 'id'), field(body, 'link'), field(body, 'name'), field(body, 'role') ?? field(body, 'position'));
  }
  // hasil expand: tabel HTML, tiap <tr> satu orang (kolom ID, Name, [Position], Join Date); tabel kedua dst = pelatih/staf → cuma tabel pertama
  const table = src.split(/<table/i)[1] ?? '';
  for (const row of table.split(/<tr/i)) {
    const raw = row.replace(/<ref[^]*?(<\/ref>|\/>)/g, '').split(/<td[^>]*>/i).slice(1);
    const m = raw[0]?.match(/\[\[(?!File:)([^\]|]+)(?:\|([^\]]+))?\]\]/i);
    if (!m) continue;
    const cells = raw.map((c) => c.replace(/\[\[[^\]]*\]\]|<[^>]+>|'''|&nbsp;/g, ' ').replace(/\s+/g, ' ').trim());
    const role = cells.find((c) => /^(Head |Assistant )?(Coach|Analyst|Manager|Substitute|Sub|Stand-in)$/i.test(c));
    add((m[2] ?? m[1]).trim(), m[1].trim(), cells[1], role);
  }
  return out.slice(0, 8);
}

// foto tim: gambar pertama di galeri "Rosters" (biasanya foto juara/turnamen terbaru)
const teamPhoto = (txt) => txt.match(/===\s*Rosters?\s*===\s*<gallery[^>]*>\s*\n([^|\n]+\.(?:jpe?g|png|webp))/i)?.[1]?.trim() ?? null;

async function fileUrl(wiki, file) {
  if (!file) return null;
  // thumbnail lebar 1080 (foto asli bisa >8 MB; SVG jadi PNG)
  const j = await api(wiki, { action: 'query', prop: 'imageinfo', iiprop: 'url', iiurlwidth: '1080', titles: `File:${file.replace(/^File:/i, '')}` });
  const i = j.query?.pages?.[0]?.imageinfo?.[0];
  return i?.thumburl ?? i?.url ?? null;
}

const has = (kind, name) => existsSync(join(ROOT, 'assets', kind)) && readdirSync(join(ROOT, 'assets', kind)).find((f) => f.replace(/\.[a-z]+$/, '') === name);

async function syncTeam(db, game, slug, page) {
  const wiki = WIKI[game];
  const key = `${game}:${slug}`;
  const txt = await wikitext(wiki, page);
  if (!txt) return { key, error: 'halaman nggak ketemu' };
  const old = db.teams[key] ?? {};
  const t = { name: field(txt, 'name') ?? page, game, page, wiki: `https://liquipedia.net/${wiki}/${encodeURIComponent(page.replace(/ /g, '_'))}`, logo: old.logo ?? null, logo_light: old.logo_light ?? null, players: [], checked: new Date().toISOString().slice(0, 10) };
  // logo: kalau sudah ada di assets/teams (hasil manual sebelumnya) dipakai, nggak ditimpa
  const exist = has('teams', slug);
  if (exist) t.logo = `assets/teams/${exist}`;
  else {
    const url = await fileUrl(wiki, field(txt, 'image'));
    if (url) t.logo = await saveAsset(url, `teams/${slug}`).catch(() => null);
  }
  const ex2 = has('teams', `${slug}-light`);
  if (ex2) t.logo_light = `assets/teams/${ex2}`;
  else {
    const dark = field(txt, 'imagedark');
    if (dark && dark !== field(txt, 'image')) { const url = await fileUrl(wiki, dark); if (url) t.logo_light = await saveAsset(url, `teams/${slug}-light`).catch(() => null); }
  }
  const gal = teamPhoto(txt);
  t.photo = old.photo_file === gal ? old.photo : null;
  if (gal && !t.photo) { const url = await fileUrl(wiki, gal); if (url) t.photo = await saveAsset(url, `photos/${slug}-${game}-roster`).catch(() => null); }
  t.photo_file = gal;
  t.photo_caption = gal?.replace(/\.[a-z]+$/i, '') ?? null;
  const prev = Object.fromEntries((old.players ?? []).map((p) => [p.id.toLowerCase(), p]));
  for (const p of await activePlayers(wiki, page, txt)) {
    const name = `${slug}-${slugify(p.id)}`;
    const e = has('players', name) || has('players', `${game === 'mlbb' ? 'mlbb' : slug}-${slugify(p.id)}`);
    let photo = e ? `assets/players/${e}` : null;
    if (!photo) {
      const ptxt = await wikitext(wiki, p.link).catch(() => null);
      const url = ptxt ? await fileUrl(wiki, field(ptxt, 'image')) : null;
      if (url) photo = await saveAsset(url, `players/${name}`).catch(() => null);
    }
    t.players.push({ id: p.id, name: p.name, role: p.role, photo });
  }
  const now = new Set(t.players.map((p) => p.id.toLowerCase()));
  t.changes = { masuk: t.players.filter((p) => old.players?.length && !prev[p.id.toLowerCase()]).map((p) => p.id), keluar: (old.players ?? []).filter((p) => !now.has(p.id.toLowerCase())).map((p) => p.id) };
  db.teams[key] = t;
  return { key, logo: !!t.logo, players: t.players.length, photos: t.players.filter((p) => p.photo).length, ...(t.changes.masuk.length || t.changes.keluar.length ? { changes: t.changes } : {}) };
}

export async function sync(filter = '') {
  const db = load();
  const res = [];
  for (const [game, teams] of Object.entries(db.watch)) {
    for (const [slug, page] of Object.entries(teams)) {
      if (filter && filter !== game && filter !== slug) continue;
      try { res.push(await syncTeam(db, game, slug, page)); } catch (e) { res.push({ key: `${game}:${slug}`, error: e.message }); }
      save(db); // simpan per tim biar kalau putus nggak ngulang dari awal
    }
  }
  db.updated = new Date().toISOString().slice(0, 10);
  save(db);
  return res;
}

export function find(word) {
  const w = slugify(word);
  const db = load();
  const out = [];
  for (const [key, t] of Object.entries(db.teams)) {
    const teamHit = key.includes(w) || slugify(t.name).includes(w);
    const ps = t.players.filter((p) => teamHit || slugify(p.id).includes(w) || slugify(p.name ?? '').includes(w));
    if (teamHit || ps.length) out.push({ key, name: t.name, logo: t.logo, logo_light: t.logo_light, photo: t.photo, checked: t.checked, players: ps.map((p) => `${p.id}${p.role ? ` (${p.role})` : ''}: ${p.photo ?? '-'}`) });
  }
  return out;
}

// dipanggil watcher: sync otomatis tanggal 1 tiap bulan (sekali), jam 03:00+ WITA biar nggak ganggu kerja
export async function rosterTick() {
  const w = new Date(Date.now() + 8 * 3600_000);
  if (w.getUTCDate() !== 1 || w.getUTCHours() < 3) return null;
  const key = w.toISOString().slice(0, 7);
  const { db } = await import('./approval.mjs');
  const d = await db();
  d.exec('CREATE TABLE IF NOT EXISTS flags (key TEXT PRIMARY KEY, value TEXT)');
  if (d.prepare('SELECT value FROM flags WHERE key = ?').get('roster_sync')?.value === key) return null;
  d.prepare("INSERT INTO flags (key, value) VALUES ('roster_sync', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key);
  const res = await sync();
  // perubahan roster → catatan riset Salsa (kebaca di brief, bisa jadi ide konten transfer)
  const ch = res.filter((r) => r.changes).map((r) => `${r.key}: masuk ${r.changes.masuk.join(', ') || '-'} / keluar ${r.changes.keluar.join(', ') || '-'}`);
  if (ch.length) d.prepare("INSERT INTO memories (agent_id, note) VALUES ('researcher', ?)").run(`Update roster ${key}: ${ch.join(' · ')}`.slice(0, 1000));
  return { teams: res.length, error: res.filter((r) => r.error).length, changes: ch.length };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const [cmd, a, b, c] = process.argv.slice(2);
  try {
    if (cmd === 'raw') console.log((await wikitext(a, b))?.slice(0, 6000) ?? '(nggak ada)');
    else if (cmd === 'sync') for (const r of await sync(a ?? '')) console.log(JSON.stringify(r));
    else if (cmd === 'find') console.log(JSON.stringify(find(a ?? ''), null, 1));
    else if (cmd === 'add') {
      if (!WIKI[a] || !b || !c) throw new Error(`pakai: add <${Object.keys(WIKI).join('|')}> <slug> "<Halaman Liquipedia>"`);
      const db = load();
      (db.watch[a] ??= {})[slugify(b)] = c;
      save(db);
      console.log(JSON.stringify(await syncTeam(db, a, slugify(b), c)));
      save(db);
    } else console.log('pakai: roster.mjs sync [game|slug] | find <kata> | add <game> <slug> "<Halaman>" | raw <wiki> <halaman>');
  } catch (e) { console.log(JSON.stringify({ ok: false, error: e.message })); process.exitCode = 1; }
}
