#!/usr/bin/env node
// Fikri (publisher): draf engagement IG buat Owner posting MANUAL (otomasi komen/story melanggar ToS IG).
// Pola dari skill .claude/skills/ig-story & ig-reply (MIT). Penulis draf = Haiku, kirim ke bot kantor.
//   node scripts/engage.mjs story [--dry]     draf IG Story hari ini (3–5 frame + polling/kuis)
//   node scripts/engage.mjs replies [--dry]   komen IG baru yang belum dibalas → draf balasan (--dry = nggak ditandai terkirim)
// Watcher: story 09:00 WITA, cek komen tiap 2 jam 08:00–23:00 WITA (cuma kirim kalau ada komen baru).
process.removeAllListeners('warning');
import { fileURLToPath } from 'node:url';
import { loadEnv, db, sayAs, SLOT } from './approval.mjs';
import { haiku, replyOf } from './haiku.mjs';

const env = () => ({ ...loadEnv(), ...process.env });
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const wita = () => new Date(Date.now() + 8 * 3600_000); // dibaca pakai getUTC*
const flag = (d, key, value) => {
  d.exec('CREATE TABLE IF NOT EXISTS flags (key TEXT PRIMARY KEY, value TEXT)');
  if (value === undefined) return d.prepare('SELECT value FROM flags WHERE key = ?').get(key)?.value;
  d.prepare('INSERT INTO flags (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
};
const setFikri = (d, status, task = null) => d.prepare("UPDATE agents SET status = ?, current_task = ?, updated_at = datetime('now') WHERE id = 'publisher'").run(status, task);
const MK = "COALESCE(channel, '') NOT IN ('youtube', 'story') AND COALESCE(json_extract(data_json, '$._test'), 0) = 0";

async function graph(path, params) {
  const e = env();
  const r = await fetch(`https://graph.facebook.com/${e.GRAPH_VERSION || 'v23.0'}/${path}?${new URLSearchParams({ ...params, access_token: e.IG_ACCESS_TOKEN ?? '' })}`);
  return r.json();
}

const VOICE = `Akun IG Zataa (zataa.my.id, top up game): tempat nongkrong gamer ML / Valorant / Free Fire. Bahasa Indonesia santai ala gamer (gaskeun, auto, mabar, push rank), kayak temen, bukan brosur; panggil "kamu", bukan lo/gue. Tanpa SARA, judi, kata kasar. Emoji 1–2 aja. Klasemen MPL pakai "Match Point/MP", bukan "poin". Jangan ngarang angka atau harga.`;

// ---------- IG Story harian
export async function storyDraft({ dry = false } = {}) {
  const d = await db();
  const day = wita().toISOString().slice(0, 10);
  const posts = d.prepare(`SELECT slot, format, pillar, game, title, status, substr(caption, 1, 160) caption FROM contents WHERE day = ? AND ${MK} ORDER BY id`).all(day);
  let research = [];
  try { research = d.prepare('SELECT game, topic FROM research WHERE day >= ? ORDER BY score DESC, id DESC LIMIT 6').all(day); } catch { /* tabel belum ada */ }
  const postLines = posts.map((p) => `- ${SLOT[p.slot] ?? p.slot} WIB · ${p.format} · ${p.pillar}/${p.game} · "${p.title}" (${p.status})${p.caption ? ` · caption: ${p.caption.replace(/\s+/g, ' ')}` : ''}`).join('\n') || '- (belum ada konten terjadwal hari ini)';
  const resLines = research.map((r) => `- [${r.game}] ${r.topic}`).join('\n') || '- (riset hari ini belum masuk)';
  if (!dry) setFikri(d, 'working', 'Nyusun draf IG Story hari ini');
  const r = await haiku(`Kamu Fikri, social media publisher Zataa. Tulis draf IG STORY hari ini (${day}) yang bakal Owner posting MANUAL.
${VOICE}

Konten feed/Reels hari ini:
${postLines}

Bahan riset hari ini:
${resLines}

Aturan story (dari skill ig-story):
- 3–5 frame. Frame 1 harus ada gerakan (rekaman layar gameplay, cuplikan Reels hari ini, tangan pegang HP), bukan teks di latar polos.
- 1 ide per frame, teks layar maks 10 kata, ngomong ke "kamu" (1 orang).
- Frame 3 atau 4 = SATU stiker: Polling (biar banyak yang tap), Kuis (kalau ada salah kaprah), atau Kotak pertanyaan (panen ide konten). Tulis pertanyaan + pilihannya.
- Frame terakhir: hasil/penutup + arahkan ke post hari ini (bilang kenapa layak dibuka, jangan cuma repost polos) ATAU stiker link zataa.my.id.
- Kalau mau sebut harga, WAJIB cek dulu "node scripts/price.mjs latest <kata>"; datanya nggak ada → jangan sebut harga.
- Akhiri dengan 1 baris "Habis itu:" = apa yang Owner lakukan ke yang jawab stiker (mis. balas DM yang vote X).

Format tiap frame (teks polos, tanpa markdown):
1. [visual] teks di layar | stiker (kalau ada)

Tulis drafnya setelah baris BALASAN:`, { minutes: 3, tools: ['Bash(node scripts/price.mjs latest:*)'] });
  if (!r.ok) { if (!dry) setFikri(d, 'done'); throw new Error(`haiku gagal: ${r.text.slice(0, 200)}`); }
  const draft = replyOf(r.text);
  const text = `📱 <b>Draf IG Story hari ini</b> (posting manual ya, Bos)\n\n${esc(draft)}\n\n<i>Polling/kotak pertanyaan = bahan konten. Jawaban yang menarik terusin ke aku, nanti jadi ide.</i>`;
  if (dry) return text;
  await sayAs('publisher', text);
  setFikri(d, 'done');
  d.prepare("INSERT INTO activity (agent_id, message) VALUES ('publisher', ?)").run('Kirim draf IG Story ke Bos 📱');
  return { sent: true, frames: (draft.match(/^\s*\d+\./gm) ?? []).length };
}

// ---------- balasan komen
async function newComments(d) {
  const e = env();
  if (!e.IG_ACCESS_TOKEN || !e.IG_USER_ID) throw new Error('IG_ACCESS_TOKEN / IG_USER_ID belum ada');
  const me = (await graph(e.IG_USER_ID, { fields: 'username' })).username;
  const mine = (x) => x.username === me || x.from?.id === e.IG_USER_ID || x.from?.username === me; // username kadang kosong → cek from
  const media = await graph(`${e.IG_USER_ID}/media`, { fields: 'id,caption,permalink,comments_count,timestamp', limit: 20 });
  if (media.error) throw new Error(media.error.message);
  const seen = new Set(JSON.parse(flag(d, 'ig_reply_seen') ?? '[]'));
  const since = Date.now() - 7 * 86400_000; // balasan telat >7 hari udah nggak ngaruh
  const out = [];
  for (const m of (media.data ?? []).filter((x) => x.comments_count > 0 && Date.parse(x.timestamp) >= since)) {
    const c = await graph(`${m.id}/comments`, { fields: 'id,text,username,from,timestamp,like_count,replies{username,from}', limit: 50 });
    if (c.error) throw new Error(c.error.message);
    for (const k of c.data ?? []) {
      if (seen.has(k.id) || mine(k)) continue;
      if ((k.replies?.data ?? []).some(mine)) continue; // udah dibalas Owner
      out.push({ id: k.id, user: k.username || k.from?.username || '?', text: k.text, likes: k.like_count ?? 0, post: (m.caption ?? '').split('\n')[0].slice(0, 90), link: m.permalink });
    }
  }
  return { me, items: out.slice(0, 25), seen };
}

export async function replyDrafts({ dry = false } = {}) {
  const d = await db();
  const { items, seen } = await newComments(d);
  if (!items.length) return { comments: 0 };
  if (!dry) setFikri(d, 'working', `Nyusun draf balasan ${items.length} komen IG`);
  const r = await haiku(`Kamu Fikri, social media publisher Zataa. Ada komen IG baru yang belum dibalas. Owner bakal balas MANUAL pakai drafmu.
${VOICE}

Komen (JSON):
${JSON.stringify(items.map(({ id, user, text, likes, post }) => ({ id, user, text, likes, post })))}

Aturan (dari skill ig-reply):
- Kelompokkan: LEAD (nanya top up/harga/cara beli), SUBSTANCE (nambah data/prediksi/beda pendapat), QUESTION (pertanyaan yang banyak orang juga penasaran), SUPPORT ("mantap", emoji, tag temen), NOISE (spam, promo akun lain, judi, nyerang).
- Jawab pertanyaannya langsung di balasan, jangan cuma "cek DM". Panjang balasan setara komennya; SUPPORT cukup 3–8 kata.
- LEAD: jawab dulu, tutup 1 kalimat ajakan ke zataa.my.id (link di bio). Harga cuma boleh dari "node scripts/price.mjs latest <kata>", nggak ada → jangan sebut angka.
- Beda pendapat: akui bagian yang benar dulu, baru pendapat kita. NOISE: reply kosong "" (nggak usah dibalas, sembunyikan kalau kasar).
- QUESTION yang layak jadi Reels: isi "reel" = ide judul video singkat.

Balas HANYA JSON array setelah baris BALASAN:, contoh:
BALASAN:
[{"id":"...","bucket":"LEAD","reply":"...","reel":""}]`, { minutes: 3, tools: ['Bash(node scripts/price.mjs latest:*)'] });
  if (!r.ok) { if (!dry) setFikri(d, 'done'); throw new Error(`haiku gagal: ${r.text.slice(0, 200)}`); }
  let drafts = [];
  try { drafts = JSON.parse(replyOf(r.text).match(/\[[\s\S]*\]/)?.[0] ?? '[]'); } catch { /* format ngaco → kirim mentah */ }
  const byId = Object.fromEntries(drafts.map((x) => [x.id, x]));
  const ORDER = ['LEAD', 'QUESTION', 'SUBSTANCE', 'SUPPORT', 'NOISE'];
  const rows = items.map((k) => ({ ...k, ...byId[k.id] })).sort((a, b) => ORDER.indexOf(a.bucket ?? 'SUPPORT') - ORDER.indexOf(b.bucket ?? 'SUPPORT'));
  const lines = drafts.length
    ? rows.map((k) => {
      const head = `<b>${esc(k.bucket ?? '?')}</b> · <a href="${esc(k.link)}">${esc(k.post || 'post')}</a>\n${k.user === '?' ? '' : `@${esc(k.user)}: `}"${esc(k.text)}"${k.likes ? ` (❤️ ${k.likes})` : ''}`;
      const body = k.reply ? `\n↳ <code>${esc(k.reply)}</code>` : '\n↳ <i>skip, nggak usah dibalas</i>';
      return head + body + (k.reel ? `\n🎬 Bisa jadi Reels: ${esc(k.reel)}` : '');
    })
    : [esc(replyOf(r.text))];
  const text = `💬 <b>${items.length} komen IG baru belum dibalas</b> (balas manual, makin cepat makin bagus buat jangkauan)\nTap teks balasan buat nyalin.\n\n${lines.join('\n\n')}`;
  if (dry) return text;
  await sayAs('publisher', text.slice(0, 4000));
  flag(d, 'ig_reply_seen', JSON.stringify([...seen, ...items.map((k) => k.id)].slice(-500)));
  setFikri(d, 'done');
  d.prepare("INSERT INTO activity (agent_id, message) VALUES ('publisher', ?)").run(`Kirim draf balasan ${items.length} komen IG ke Bos 💬`);
  return { comments: items.length, drafted: drafts.length };
}

// dipanggil watcher tiap menit (lewat staff): story 09:00 WITA, cek komen tiap 2 jam 08:00–23:00 WITA
export async function engageTick() {
  const d = await db();
  const w = wita();
  const day = w.toISOString().slice(0, 10);
  const h = w.getUTCHours();
  if (h >= 9 && flag(d, 'ig_story') !== day) { flag(d, 'ig_story', day); return { story: await storyDraft() }; }
  const key = `${day}-${Math.floor(h / 2)}`;
  if (h >= 8 && h <= 23 && env().IG_ACCESS_TOKEN && flag(d, 'ig_reply_check') !== key) {
    flag(d, 'ig_reply_check', key);
    const r = await replyDrafts();
    return r.comments ? { replies: r } : null;
  }
  return null;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const [cmd] = process.argv.slice(2);
  const dry = process.argv.includes('--dry');
  const show = (r) => console.log(typeof r === 'string' ? r : JSON.stringify(r));
  if (cmd === 'story') show(await storyDraft({ dry }));
  else if (cmd === 'replies') show(await replyDrafts({ dry }));
  else console.log('pakai: engage.mjs story [--dry] | replies [--dry]');
}
