#!/usr/bin/env node
// Budi (Price Watcher): cek harga zataa.my.id tiap 2 jam (07:00–22:00 WITA), 0 token.
// Ada perubahan → kabarin Owner + tombol 🎨 bikin konten promo. Web nggak bisa dibuka → kabarin (maks 1×/12 jam).
//   node scripts/price.mjs check      cek sekarang
//   node scripts/price.mjs latest [kata]  harga terbaru (filter kata, mis. "86 diamond")
// Halaman yang dipantau: PRICE_URLS di .env (pisah koma), default halaman game ML/Valorant/FF
// (beranda zataa nggak nampilin harga; halaman /game/<slug> sudah memuat harga di HTML-nya)
process.removeAllListeners('warning');
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { loadEnv, db, sayAs, tg } from './approval.mjs';
import { chat } from './chatter.mjs';

const env = () => ({ ...loadEnv(), ...process.env });
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const wita = () => new Date(Date.now() + 8 * 3600_000);
const setBudi = (d, status, task = null) => d.prepare("UPDATE agents SET status = ?, current_task = ?, updated_at = datetime('now') WHERE id = 'price'").run(status, task);
const DEF = ['mobile-legends', 'valorant', 'free-fire'].map((g) => `https://zataa.my.id/game/${g}`).join(',');
// beranda zataa nggak nampilin harga → kalau PRICE_URLS lama masih nunjuk beranda, ganti ke halaman game
const pageUrls = () => [...new Set(String(env().PRICE_URLS || DEF).split(',').map((u) => u.trim()).filter(Boolean)
  .flatMap((u) => (/^https?:\/\/[^/]+\/?$/.test(u) ? DEF.split(',') : [u])))];
const SQL = `CREATE TABLE IF NOT EXISTS price_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT NOT NULL, ts TEXT DEFAULT (datetime('now')),
  hash TEXT, text TEXT, diff TEXT)`;
const flag = (d, key, value) => {
  d.exec('CREATE TABLE IF NOT EXISTS flags (key TEXT PRIMARY KEY, value TEXT)');
  if (value === undefined) return d.prepare('SELECT value FROM flags WHERE key = ?').get(key)?.value;
  d.prepare('INSERT INTO flags (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
};

// ambil baris yang memuat harga ("Rp 12.000", "IDR 12000") beserta nama produk di sekitarnya
export function priceLines(html) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h\d|\/a|\/span|\/td)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out = [];
  for (let i = 0; i < text.length; i++) {
    if (!/(rp|idr)\s?\.?\s?\d/i.test(text[i])) continue;
    const label = /[a-z]{3,}/i.test(text[i].replace(/(rp|idr)\s?\.?\s?[\d.,]+/gi, '')) ? '' : `${text[i - 1] ?? ''} `;
    out.push(`${label}${text[i]}`.slice(0, 120));
  }
  return [...new Set(out)].sort();
}

export async function check() {
  const d = await db();
  d.exec(SQL);
  const urls = pageUrls();
  setBudi(d, 'working', 'Cek harga di zataa.my.id');
  const res = [];
  for (const url of urls) {
    let html;
    try {
      const get = () => fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 ZataaPriceWatcher' }, signal: AbortSignal.timeout(20_000) });
      // DNS VPS kadang telat (EAI_AGAIN) → coba sekali lagi 5 detik kemudian
      const r = await get().catch(async (e) => { await new Promise((ok) => setTimeout(ok, 5000)); return get(); });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      html = await r.text();
    } catch (e) {
      const why = e.cause?.code || e.message;
      const last = +(flag(d, `price_down_${url}`) ?? 0);
      if (Date.now() - last > 12 * 3600_000) {
        flag(d, `price_down_${url}`, Date.now());
        await sayAs('price', `⚠️ ${esc(url)} nggak bisa dibuka (${esc(why)}). Konten harga ditunda dulu sampai web normal.`).catch(() => {});
        chat(d, 'price', null, `Web zataa lagi nggak bisa dibuka nih (${why}) 😥 aku cek lagi nanti`, 'curhat');
      }
      res.push({ url, error: why });
      continue;
    }
    const lines = priceLines(html);
    if (!lines.length) { res.push({ url, error: 'harga tidak terbaca (halaman pakai JavaScript?)' }); continue; }
    const text = lines.join('\n');
    const hash = createHash('sha1').update(text).digest('hex');
    const prev = d.prepare('SELECT hash, text FROM price_snapshots WHERE url = ? ORDER BY id DESC LIMIT 1').get(url);
    if (prev?.hash === hash) { res.push({ url, changed: false, items: lines.length }); continue; }
    const before = new Set((prev?.text ?? '').split('\n'));
    const after = new Set(lines);
    const diff = [...lines.filter((l) => !before.has(l)).map((l) => `+ ${l}`), ...[...before].filter((l) => l && !after.has(l)).map((l) => `- ${l}`)].slice(0, 15).join('\n');
    const id = Number(d.prepare('INSERT INTO price_snapshots (url, hash, text, diff) VALUES (?, ?, ?, ?)').run(url, hash, text, prev ? diff : null).lastInsertRowid);
    if (!prev) { res.push({ url, first: true, items: lines.length }); continue; } // snapshot pertama = patokan, belum dilaporkan
    d.prepare("INSERT INTO activity (agent_id, message) VALUES ('price', ?)").run(`Harga di web berubah (${diff.split('\n').length} baris)`);
    chat(d, 'price', 'dir', 'Kak, ada perubahan harga di web! Udah aku laporin ke Bos 💰', 'oper');
    await tg('sendMessage', {
      chat_id: env().TELEGRAM_CHAT_ID, parse_mode: 'HTML',
      text: `<b>Budi</b>: 💰 <b>Harga di web berubah</b>\n${esc(url)}\n\n<pre>${esc(diff)}</pre>\n(+ baru · - lama)\n\nMau dibikinin konten promo?`,
      reply_markup: { inline_keyboard: [[{ text: '🎨 Bikin konten promo', callback_data: `pricepromo:${id}` }]] },
    }).catch(() => {});
    res.push({ url, changed: true, snapshot: id });
  }
  setBudi(d, 'done');
  return res;
}

// dipanggil watcher tiap menit: cek tiap 2 jam antara 07:00–22:00 WITA
export async function priceTick() {
  const w = wita();
  const h = w.getUTCHours();
  if (h < 7 || h >= 22) return null;
  const d = await db();
  const key = `${w.toISOString().slice(0, 10)}-${Math.floor(h / 2)}`;
  if (flag(d, 'price_check') === key) return null;
  flag(d, 'price_check', key);
  return check();
}

// harga terbaru per halaman game (snapshot Budi ≤6 jam; kalau belum ada/basi → baca langsung dari web, tanpa simpan)
// dipakai Haiku di bot (jawab "harga X berapa") & QA Fikri (cocokkan nominal di caption). kata = filter, mis. "86 diamond"
export async function latest(word = '') {
  const urls = pageUrls();
  let d = null;
  try { d = await db(); d.exec(SQL); } catch { /* DB belum ada (laptop) */ }
  const out = [];
  for (const url of urls) {
    let snap = d?.prepare("SELECT ts, text FROM price_snapshots WHERE url = ? AND ts >= datetime('now', '-6 hours') ORDER BY id DESC LIMIT 1").get(url);
    if (!snap) {
      try {
        const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 ZataaPriceWatcher' }, signal: AbortSignal.timeout(20_000) });
        snap = { ts: 'live', text: priceLines(await r.text()).join('\n') };
      } catch (e) { out.push({ url, error: e.cause?.code || e.message }); continue; }
    }
    const words = word.toLowerCase().split(/\s+/).filter(Boolean);
    // angka dicocokkan utuh di nama paket (bagian sebelum "Rp"): "86" ≠ "Rp86.859"
    const hit = (l, w) => { const name = l.toLowerCase().split(/\brp/)[0]; return /^\d+$/.test(w) ? new RegExp(`(^|\\D)${w}(\\D|$)`).test(name) : name.includes(w); };
    const lines = snap.text.split('\n').filter((l) => words.every((w) => hit(l, w)));
    if (lines.length) out.push({ url, ts: snap.ts, items: lines.slice(0, 40) });
  }
  return out;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'check') console.log(JSON.stringify(await check()));
  else if (cmd === 'latest') console.log(JSON.stringify(await latest(rest.join(' ')), null, 1));
  else console.log('pakai: price.mjs check | latest [kata]');
}
