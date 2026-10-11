#!/usr/bin/env node
// Budi (Price Watcher): cek harga zataa.my.id tiap 2 jam (07:00–22:00 WITA), 0 token.
// Ada perubahan → kabarin Owner + tombol 🎨 bikin konten promo. Web nggak bisa dibuka → kabarin (maks 1×/12 jam).
//   node scripts/price.mjs check      cek sekarang
// Halaman yang dipantau: PRICE_URLS di .env (pisah koma), default https://zataa.my.id
process.removeAllListeners('warning');
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { loadEnv, db, sayAs, tg } from './approval.mjs';
import { chat } from './chatter.mjs';

const env = () => ({ ...loadEnv(), ...process.env });
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const wita = () => new Date(Date.now() + 8 * 3600_000);
const setBudi = (d, status, task = null) => d.prepare("UPDATE agents SET status = ?, current_task = ?, updated_at = datetime('now') WHERE id = 'price'").run(status, task);
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
  const urls = String(env().PRICE_URLS || 'https://zataa.my.id').split(',').map((u) => u.trim()).filter(Boolean);
  setBudi(d, 'working', 'Cek harga di zataa.my.id');
  const res = [];
  for (const url of urls) {
    let html;
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 ZataaPriceWatcher' }, signal: AbortSignal.timeout(20_000) });
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

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const [cmd] = process.argv.slice(2);
  if (cmd === 'check') console.log(JSON.stringify(await check()));
  else console.log('pakai: price.mjs check');
}
