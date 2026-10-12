#!/usr/bin/env node
// Fahriah (Ads Specialist): pilih post IG terbaik → usul boost ke Owner via Telegram → kalau di-✅, pasang iklan (Marketing API).
// Uang hanya keluar setelah Owner klik ✅ Boost, dan total per bulan dikunci ADS_MONTHLY_BUDGET. Tanpa AI → 0 token.
//   node scripts/boost.mjs propose      cari kandidat & kirim usulan (watcher: sekali sehari mulai ADS_HOUR WITA)
//   node scripts/boost.mjs run          pasang iklan untuk usulan yang sudah di-✅ (watcher: tiap menit)
//   node scripts/boost.mjs status       sisa budget bulan ini + daftar boost
//   node scripts/boost.mjs check        cek token iklan & akun iklan
process.removeAllListeners('warning');
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { loadEnv, setEnv, db, tg } from './approval.mjs';
import { chat } from './chatter.mjs';

// jangan pernah bocorkan token ke log/Telegram (pesan error Meta kadang memuatnya)
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const hide = (m) => String(m).replace(/EAA[A-Za-z0-9]{10,}/g, 'EAA…');
const out = (o) => console.log(typeof o === 'string' ? o : JSON.stringify(o));
const env = () => ({ ...loadEnv(), ...process.env });
const rp = (n) => `Rp${Number(n).toLocaleString('id-ID')}`;
const witaNow = () => new Date(Date.now() + 8 * 3600_000); // dibaca pakai getUTC*
const month = () => witaNow().toISOString().slice(0, 7);
const today = () => witaNow().toISOString().slice(0, 10);

function cfg() {
  const e = env();
  return {
    budget: +(e.ADS_MONTHLY_BUDGET || 100000), // Rp per bulan (kalender, WITA)
    per: +(e.ADS_PER_BOOST || 20000), // Rp per boost (lifetime budget iklan)
    days: +(e.ADS_DAYS || 2), // durasi iklan
    hour: +(e.ADS_HOUR || 10), // jam WITA Fahriah mulai cek kandidat
    account: String(e.ADS_ACCOUNT_ID || '').replace(/^act_/, ''),
    token: e.ADS_ACCESS_TOKEN,
    page: e.FB_PAGE_ID,
    ig: e.IG_USER_ID,
    v: e.GRAPH_VERSION || 'v23.0',
  };
}
export const adsReady = () => { const c = cfg(); return !!(c.account && c.token && c.page && c.ig); };

async function graph(path, params = {}, method = 'POST', token = cfg().token) {
  const c = cfg();
  const body = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)])), access_token: token ?? '' });
  const url = `https://graph.facebook.com/${c.v}/${path}`;
  const r = method === 'GET' ? await fetch(`${url}?${body}`) : await fetch(url, { method, body });
  const j = await r.json();
  if (j.error) throw new Error(`Meta: ${hide(j.error.error_user_msg || j.error.message)}`);
  return j;
}

const setFahriah = (d, status, task = null) => d.prepare("UPDATE agents SET status = ?, current_task = ?, updated_at = datetime('now') WHERE id = 'ads'").run(status, task);
const activity = (d, msg) => d.prepare("INSERT INTO activity (agent_id, message) VALUES ('ads', ?)").run(msg);

// budget terpakai = semua boost bulan ini yang disetujui/jalan (lifetime budget = batas atas belanja)
function used(d) {
  return d.prepare("SELECT COALESCE(SUM(amount),0) s FROM boosts WHERE month = ? AND status IN ('approved','active')").get(month()).s;
}
function reserved(d) {
  return d.prepare("SELECT COALESCE(SUM(amount),0) s FROM boosts WHERE month = ? AND status IN ('proposed','approved','active')").get(month()).s;
}

// ---------- usulan harian
export async function propose({ force = false } = {}) {
  const c = cfg();
  const d = await db();
  if (!force) {
    if (witaNow().getUTCHours() < c.hour) return { skip: 'belum jamnya' };
    if (d.prepare('SELECT 1 FROM boosts WHERE date(created_at, \'+8 hours\') = ?').get(today())) return { skip: 'sudah usul hari ini' };
  }
  if (d.prepare("SELECT 1 FROM boosts WHERE status = 'proposed'").get()) return { skip: 'masih ada usulan yang belum dijawab' };
  const left = c.budget - reserved(d);
  if (left < c.per) return { skip: `budget bulan ini tinggal ${rp(left)}` };
  // pacing: jangan habiskan budget di awal bulan
  const w = witaNow();
  const dim = new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth() + 1, 0)).getUTCDate();
  const slots = Math.floor(c.budget / c.per);
  const allowed = Math.ceil((slots * w.getUTCDate()) / dim);
  const count = d.prepare("SELECT COUNT(*) n FROM boosts WHERE month = ? AND status IN ('proposed','approved','active')").get(month()).n;
  if (count >= allowed) return { skip: `jatah boost s/d hari ini sudah ${count}/${allowed}` };

  // kandidat: sudah tayang di IG 20–72 jam lalu, belum pernah diusulkan
  const rows = d.prepare(`SELECT id, title, pillar, format, ig_media_id FROM contents
    WHERE status = 'posted' AND ig_media_id IS NOT NULL
      AND posted_at BETWEEN datetime('now', '-72 hours') AND datetime('now', '-20 hours')
      AND id NOT IN (SELECT content_id FROM boosts)`).all();
  if (!rows.length) return { skip: 'belum ada post yang umurnya pas (20–72 jam)' };
  setFahriah(d, 'working', 'Analisa performa post buat boost');
  const scored = [];
  for (const r of rows) {
    try {
      const m = await graph(r.ig_media_id, { fields: 'like_count,comments_count,permalink' }, 'GET', env().IG_ACCESS_TOKEN);
      // komentar lebih berharga dari like; konten promo diprioritaskan (langsung jualan)
      const score = ((m.like_count ?? 0) + 3 * (m.comments_count ?? 0)) * (r.pillar === 'promo' ? 1.5 : 1);
      scored.push({ ...m, ...r, score }); // r terakhir: `id` dari Graph (media IG) jangan menimpa id konten
    } catch { /* post dihapus / tidak bisa dibaca → lewati */ }
  }
  setFahriah(d, 'done');
  const best = scored.sort((a, b) => b.score - a.score)[0];
  if (!best) return { skip: 'statistik post tidak bisa dibaca' };

  const id = Number(d.prepare('INSERT INTO boosts (content_id, month, amount, days, score) VALUES (?, ?, ?, ?, ?)').run(best.id, month(), c.per, c.days, best.score).lastInsertRowid);
  const text = [
    `<b>Fahriah</b>: 💸 <b>Usulan boost B${id}</b>`,
    `Post #${best.id}: ${best.title}`,
    `❤️ ${best.like_count ?? 0} · 💬 ${best.comments_count ?? 0} (paling rame dari ${scored.length} post terakhir)`,
    `Budget: <b>${rp(c.per)}</b> selama ${c.days} hari · target Indonesia 18–34, IG`,
    `Sisa budget ${month()}: ${rp(left)} dari ${rp(c.budget)}`,
    best.permalink ?? '',
  ].filter(Boolean).join('\n');
  await tg('sendMessage', {
    chat_id: env().TELEGRAM_CHAT_ID, text, parse_mode: 'HTML', disable_web_page_preview: false,
    reply_markup: { inline_keyboard: [[{ text: `✅ Boost ${rp(c.per)}`, callback_data: `boost:${id}` }, { text: '❌ Skip', callback_data: `skip:${id}` }]] },
  });
  setFahriah(d, 'waiting', `Usulan boost B${id} (#${best.id})`);
  activity(d, `Usul boost #${best.id} ${rp(c.per)} ke Owner`);
  chat(d, 'ads', 'publisher', `Fik, post "${best.title.slice(0, 40)}" rame nih (❤️ ${best.like_count ?? 0}). Aku usulin boost ke Bos ya 💸`, 'oper');
  return { proposed: id, content: best.id, amount: c.per };
}

// iklan "baru" (bukan boost post): upload gambar/video konten ke akun iklan, tayang atas nama akun IG yang sama
async function freshStory(c, act, k) {
  const A = JSON.parse(k.asset_path ?? '{}');
  const caption = [k.caption, k.hashtags].filter(Boolean).join('\n\n');
  const base = { page_id: c.page, instagram_user_id: c.ig };
  if (A.video) {
    const url = `${(env().PUBLIC_BASE_URL ?? '').replace(/\/$/, '')}/${A.video.replace(/^docs\//, '')}`;
    const { id } = await graph(`${act}/advideos`, { file_url: url, name: k.title.slice(0, 100) });
    for (let i = 0; i < 30; i++) { // tunggu Meta selesai proses video
      const s = await graph(id, { fields: 'status' }, 'GET');
      if (s.status?.video_status === 'ready') break;
      if (s.status?.video_status === 'error') throw new Error('Meta gagal memproses video iklan');
      await new Promise((r) => setTimeout(r, 10_000));
    }
    const thumb = A.cover ? `${(env().PUBLIC_BASE_URL ?? '').replace(/\/$/, '')}/${A.cover.replace(/^docs\//, '')}` : undefined;
    return { ...base, video_data: { video_id: id, message: caption, ...(thumb ? { image_url: thumb } : {}) } };
  }
  const file = A.feed?.[0];
  if (!file) throw new Error('aset konten tidak ada untuk iklan baru');
  const bytes = readFileSync(join(ROOT, file)).toString('base64');
  const img = await graph(`${act}/adimages`, { bytes });
  const hash = Object.values(img.images ?? {})[0]?.hash;
  if (!hash) throw new Error('upload gambar iklan gagal');
  return { ...base, photo_data: { image_hash: hash, caption } };
}

// ---------- pasang iklan untuk boost yang di-✅
async function launch(d, b) {
  const c = cfg();
  const k = d.prepare('SELECT id, title, format, ig_media_id, caption, hashtags, asset_path FROM contents WHERE id = ?').get(b.content_id);
  if (used(d) > c.budget) throw new Error('melebihi budget bulanan'); // pengaman terakhir
  const act = `act_${c.account}`;
  const { currency } = await graph(act, { fields: 'currency' }, 'GET');
  if (currency !== 'IDR') throw new Error(`mata uang akun iklan ${currency}, bukan IDR (budget bisa salah hitung)`);
  const name = `Zataa B${b.id} #${k.id} ${k.title}`.slice(0, 120);
  const start = new Date(Date.now() + 5 * 60_000);
  const end = new Date(start.getTime() + b.days * 86400_000);
  // percobaan ulang pakai campaign (PAUSED) yang sudah dibuat, jangan numpuk campaign kosong
  const camp = b.campaign_id ? { id: b.campaign_id } : await graph(`${act}/campaigns`, {
    name, objective: 'OUTCOME_ENGAGEMENT', status: 'PAUSED', special_ad_categories: [], is_adset_budget_sharing_enabled: false,
  });
  d.prepare('UPDATE boosts SET campaign_id = ? WHERE id = ?').run(camp.id, b.id);
  const adset = b.adset_id ? { id: b.adset_id } : await graph(`${act}/adsets`, {
    name, campaign_id: camp.id, lifetime_budget: b.amount, // IDR tanpa sen
    start_time: start.toISOString(), end_time: end.toISOString(),
    billing_event: 'IMPRESSIONS', optimization_goal: 'POST_ENGAGEMENT', destination_type: 'ON_POST', bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    targeting: {
      geo_locations: { countries: ['ID'] }, age_min: 18, age_max: 34,
      targeting_automation: { advantage_audience: 0 }, // wajib diisi sejak v23; 0 = targeting tetap persis ini
      publisher_platforms: ['instagram'], instagram_positions: k.format === 'video' ? ['stream', 'reels'] : ['stream'], // 'explore' ditolak Graph v23
    },
    status: 'ACTIVE',
  });
  d.prepare('UPDATE boosts SET adset_id = ? WHERE id = ?').run(adset.id, b.id);
  let creative;
  try {
    creative = await graph(`${act}/adcreatives`, { name, object_id: c.page, instagram_user_id: c.ig, source_instagram_media_id: k.ig_media_id });
  } catch (e) {
    // post yang di-upload app Meta mode Development tidak boleh di-boost → iklan baru dari file aslinya
    if (!/development mode/i.test(e.message)) throw e;
    creative = await graph(`${act}/adcreatives`, { name, object_story_spec: await freshStory(c, act, k) });
  }
  const ad = await graph(`${act}/ads`, { name, adset_id: adset.id, creative: { creative_id: creative.id }, status: 'ACTIVE' });
  await graph(camp.id, { status: 'ACTIVE' }); // nyalakan setelah semua bagian jadi
  d.prepare("UPDATE boosts SET ad_id = ?, status = 'active', updated_at = datetime('now') WHERE id = ?").run(ad.id, b.id);
  return { ...k, end };
}

export async function runApproved() {
  const d = await db();
  const res = [];
  for (const b of d.prepare("SELECT * FROM boosts WHERE status = 'approved' ORDER BY id").all()) {
    setFahriah(d, 'working', `Pasang iklan boost B${b.id}`);
    try {
      const k = await launch(d, b);
      activity(d, `Boost #${k.id} jalan ${rp(b.amount)} / ${b.days} hari 🚀`);
      chat(d, 'ads', null, `Iklan buat "${k.title.slice(0, 40)}" udah jalan! Semoga rame 🤞`, 'santai');
      await tg('sendMessage', { chat_id: env().TELEGRAM_CHAT_ID, parse_mode: 'HTML', text: `<b>Fahriah</b>: 🚀 Boost B${b.id} jalan: #${k.id} ${k.title}\n${rp(b.amount)} sampai ${k.end.toLocaleString('id-ID', { timeZone: 'Asia/Makassar', dateStyle: 'medium', timeStyle: 'short' })} WITA (nunggu review iklan Meta ±15 menit–1 jam).` }).catch(() => {});
      res.push({ id: b.id, ok: true });
    } catch (e) {
      // iklan yang sempat dibuat tetap PAUSED (campaign belum dinyalakan) → tidak ada uang keluar
      d.prepare("UPDATE boosts SET status = 'failed', error = ?, updated_at = datetime('now') WHERE id = ?").run(e.message, b.id);
      activity(d, `Gagal pasang boost B${b.id}: ${e.message.slice(0, 100)}`);
      await tg('sendMessage', { chat_id: env().TELEGRAM_CHAT_ID, parse_mode: 'HTML', text: `<b>Fahriah</b>: ⚠️ Boost B${b.id} gagal dipasang (budget nggak kepakai): ${e.message.slice(0, 300).replace(/[<>&]/g, " ")}` }).catch(() => {});
      res.push({ id: b.id, ok: false, error: e.message });
    }
    setFahriah(d, 'done');
  }
  return res;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const [cmd] = process.argv.slice(2);
  try {
    if (cmd === 'propose') out(await propose({ force: process.argv.includes('--force') }));
    else if (cmd === 'run') out(await runApproved());
    else if (cmd === 'status') {
      const d = await db();
      const c = cfg();
      out({ bulan: month(), budget: c.budget, terpakai: used(d), dipesan: reserved(d), per_boost: c.per, boosts: d.prepare('SELECT id, content_id, amount, status, error FROM boosts WHERE month = ? ORDER BY id').all(month()) });
    } else if (cmd === 'check') {
      const c = cfg();
      const a = await graph(`act_${c.account}`, { fields: 'name,currency,account_status,amount_spent,funding_source_details' }, 'GET');
      out({ akun: a.name, mata_uang: a.currency, aktif: a.account_status === 1, metode_bayar: a.funding_source_details?.display_string ?? 'BELUM ADA', page: c.page, ig: c.ig });
    } else if (cmd === 'budget') {
      // Owner ubah setelan (lewat Telegram → Claude jalankan ini): budget <bulanan> [per_boost] [hari]
      const [, monthly, per, days] = process.argv.slice(2).map(Number);
      if (!monthly && !per && !days) { const c = cfg(); out({ bulanan: c.budget, per_boost: c.per, hari: c.days }); }
      else {
        const MIN_PER_DAY = 18100; // batas minimal Meta ±IDR 18.030/hari (ditolak di bawah ini, Okt 2026)
        const c = cfg();
        const nb = monthly || c.budget, np = per || c.per, nd = days || c.days;
        if (np / nd < MIN_PER_DAY) throw new Error(`Rp${np} untuk ${nd} hari di bawah minimal Meta (±${rp(MIN_PER_DAY)}/hari)`);
        if (np > nb) throw new Error('budget per boost lebih besar dari budget bulanan');
        setEnv('ADS_MONTHLY_BUDGET', nb); setEnv('ADS_PER_BOOST', np); setEnv('ADS_DAYS', nd);
        out({ ok: true, bulanan: nb, per_boost: np, hari: nd, boost_per_bulan: Math.floor(nb / np) });
      }
    } else out('pakai: boost.mjs propose [--force] | run | status | check | budget [bulanan] [per_boost] [hari]');
  } catch (e) { out(`gagal: ${e.message}`); process.exit(1); }
}
