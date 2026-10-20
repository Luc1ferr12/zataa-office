#!/usr/bin/env node
// Clariana: tarik berita esport ML / Valorant / Free Fire dari RSS (0 token, tanpa search web).
// Hasilnya bahan awal riset pagi; search web cukup buat cek silang / rumor / yang nggak ada di sini.
//   node scripts/feeds.mjs            berita 36 jam terakhir, dikelompokkan per game (maks 12/game)
//   node scripts/feeds.mjs 72 ml      jendela 72 jam, cuma game ml|valorant|ff
// Aturan tetap: berita yang dipakai wajib dicek ≥2 sumber (judul sama dari 2 media beda = sudah 2 sumber).
process.removeAllListeners('warning');
import { fileURLToPath } from 'node:url';

const gn = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:3d`)}&hl=id&gl=ID&ceid=ID:id`;
export const FEEDS = [
  { url: gn('MPL ID OR MDL OR "Mobile Legends" esports'), game: 'ml' },
  { url: gn('VCT OR "Valorant Champions" OR "Valorant Pacific"'), game: 'valorant' },
  { url: gn('"Free Fire" esports OR FFWS OR FFML'), game: 'ff' },
  { url: 'https://www.vlr.gg/rss', game: 'valorant' },
  { url: 'https://www.revivaltv.id/feed/' },
  { url: 'https://www.esportsnesia.com/feed/' },
  { url: 'https://www.gamebrott.com/feed' },
  { url: 'https://jagatplay.com/feed/' },
  { url: 'https://kincir.com/feed/' },
];
const GAME = {
  ml: /\b(mobile legends?|mlbb|mpl|mdl|msc|m[5-9] world|onic|rrq|evos|alter ego|geek fam|dewa united|bigetron|btr|navi|team liquid id|aura)\b/i,
  valorant: /\b(valorant|vct|vlr|champions tour|pacific|paper rex|prx|rrq valorant)\b/i,
  ff: /\b(free fire|ffws|ffml|ffwsi|booyah|garena ff)\b/i,
};

const decode = (s) => String(s ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#8217;/g, '’').replace(/\s+/g, ' ').trim();
const tag = (x, t) => decode(x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, 'i'))?.[1]);

async function pull(f) {
  const r = await fetch(f.url, { headers: { 'user-agent': 'Mozilla/5.0 ZataaNewsDesk' }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const xml = await r.text();
  return [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)].map(([x]) => {
    let title = tag(x, 'title');
    let source = tag(x, 'source') || new URL(f.url).hostname.replace(/^www\./, '');
    if (title.endsWith(` - ${source}`)) title = title.slice(0, -source.length - 3); // gaya judul Google News
    return { title, link: tag(x, 'link'), at: Date.parse(tag(x, 'pubDate')) || 0, source, game: f.game };
  });
}

export async function news({ hours = 36, only = null } = {}) {
  const since = Date.now() - hours * 3600_000;
  const errors = [];
  const items = (await Promise.all(FEEDS.map((f) => pull(f).catch((e) => { errors.push(`${new URL(f.url).hostname}: ${e.message}`); return []; })))).flat();
  const seen = new Map();
  for (const it of items) {
    if (it.at < since || !it.title) continue;
    const game = it.game ?? Object.keys(GAME).find((g) => GAME[g].test(it.title));
    if (!game || (only && game !== only)) continue;
    const key = it.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 70);
    const prev = seen.get(key);
    if (prev) { if (!prev.sources.includes(it.source)) prev.sources.push(it.source); continue; } // judul sama dari media lain = sumber ke-2
    seen.set(key, { game, title: it.title, link: it.link, sources: [it.source], wita: new Date(it.at + 8 * 3600_000).toISOString().slice(5, 16).replace('T', ' ') });
  }
  const out = {};
  for (const it of [...seen.values()].sort((a, b) => b.sources.length - a.sources.length || b.wita.localeCompare(a.wita))) {
    const { game, ...rest } = it;
    if ((out[game] ??= []).length < 12) out[game].push(rest);
  }
  return { hours, ...out, ...(errors.length ? { errors } : {}) };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const [h, g] = process.argv.slice(2);
  console.log(JSON.stringify(await news({ hours: +h || 36, only: g ?? null }), null, 1));
}
