// Bot Telegram chit-chat: obrolan santai pegawai (panel Chit-chat di web) diterusin ke Owner, Owner bisa nimbrung.
// Bukan bot kerja — pure ngobrol. Obrolan web dihitung deterministik dari docs/js/chatter.js (persis sama dengan yang
// tampil di web, 0 token); cuma balasan pegawai ke Owner yang pakai Haiku. Pesan Owner & balasannya masuk tabel chats
// (kind 'nimbrung') → ikut tampil di panel Chit-chat web setelah sinkron.
//   .env: CHITCHAT_BOT_TOKEN, (opsional) CHITCHAT_OWNER_ID (default TELEGRAM_CHAT_ID)
// Perintah di bot: /siapa (yang lagi di kantor) · /rame (semua obrolan) · /santai (default, sesekali) · /diem (nggak nerusin)
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { loadEnv } from './approval.mjs';
import { haiku, replyOf } from './haiku.mjs';
import { openDb } from './db.mjs';
import { chat } from './chatter.mjs';
import { AGENTS, activityAt, wita } from '../docs/js/schedule.js';
import { simulatedChats } from '../docs/js/chatter.js';
import { relationsOn } from '../docs/js/social.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATE = join(ROOT, 'tmp', 'chitchat.json');
const WORK = new Set(['oper', 'kerja', 'bos', 'nimbrung']);
const STICKY = 10;   // menit: Owner masih ngobrol sama orang yang sama
const FRESH = 15;    // menit: obrolan terakhir yang diterusin masih "anget" buat disambung
const AWAY = ['off', 'pray', 'meeting', 'sleep'];
const PEOPLE = AGENTS.filter((a) => a.id !== 'owner');
const nameOf = (id) => AGENTS.find((a) => a.id === id)?.name ?? id;
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const TEAM = { mkt: 'Marketing', trd: 'Trading', yt: 'YouTube Zataa History', st: 'Zataa Story' };
const EMOJI = { santai: '☕', curhat: '💭', pacaran: '💕', pdkt: '💘', gosip: '👀', ultah: '🎂', event: '🏆' };

const load = () => { try { return JSON.parse(readFileSync(STATE, 'utf8')); } catch { return {}; } };
const save = (s) => { mkdirSync(dirname(STATE), { recursive: true }); writeFileSync(STATE, JSON.stringify(s)); };

const env = () => loadEnv();
const ownerId = () => env().CHITCHAT_OWNER_ID || env().TELEGRAM_CHAT_ID;
async function api(method, params = {}) {
  const r = await fetch(`https://api.telegram.org/bot${env().CHITCHAT_BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params) });
  const j = await r.json();
  if (!j.ok) throw new Error(`Telegram ${method}: ${j.description}`);
  return j.result;
}
const send = (text, extra = {}) => api('sendMessage', { chat_id: ownerId(), text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra });

function realStatus() {
  const d = openDb();
  try { return Object.fromEntries(d.prepare('SELECT id, status, current_task FROM agents').all().map((a) => [a.id, a])); } finally { d.close(); }
}

// siapa lagi di kantor & ngapain (sama dengan web)
function around(t = wita(new Date())) {
  const real = realStatus();
  return PEOPLE.map((a) => ({ a, ...activityAt(AGENTS.indexOf(a), a, t, real[a.id]) }));
}

// obrolan santai yang udah selesai (baris terakhir ≥2 menit lalu), dikelompokkan per pasangan + menit mulai
function finishedChats(t) {
  const lines = simulatedChats(t, realStatus()).filter((c) => !WORK.has(c.kind) && c.from !== 'owner' && c.to !== 'owner');
  lines.sort((x, y) => x.minute - y.minute);
  const convos = [];
  for (const l of lines) {
    const pair = [l.from, l.to].sort().join('+');
    const c = convos.find((x) => x.pair === pair && l.minute - x.last <= 1);
    if (c) { c.lines.push(l); c.last = l.minute; } else convos.push({ pair, start: l.minute, last: l.minute, kind: l.kind, lines: [l] });
  }
  return convos.filter((c) => t.minutes - c.last >= 2).map((c) => ({ ...c, key: `${t.date}|${c.pair}|${c.start}` }));
}

async function mirror(log) {
  const s = load();
  const mode = s.mode ?? 'santai';
  const t = wita(new Date());
  const seen = new Set(s.seen ?? []);
  const fresh = finishedChats(t).filter((c) => !seen.has(c.key));
  if (!fresh.length) return;
  fresh.forEach((c) => seen.add(c.key));
  s.seen = [...seen].slice(-400);
  const quiet = s.lastSent && Date.now() - s.lastSent < 7 * 60_000;
  const out = mode === 'rame' ? fresh : mode === 'santai' && !quiet ? fresh.slice(-1) : [];
  s.threads ??= {};
  for (const c of out) {
    const who = [...new Set(c.lines.map((l) => l.from))];
    const text = `${EMOJI[c.kind] ?? '☕'} <b>${who.map(nameOf).join(' & ')}</b>\n${c.lines.map((l) => `<b>${esc(nameOf(l.from))}:</b> ${esc(l.message)}`).join('\n')}`;
    try {
      const m = await send(text, { disable_notification: true });
      s.threads[m.message_id] = { who, lines: c.lines.map((l) => `${nameOf(l.from)}: ${l.message}`), at: Date.now() };
      s.last = s.threads[m.message_id];
      s.lastSent = Date.now();
    } catch (e) { log(`chitchat kirim gagal: ${e.message}`); }
  }
  s.threads = Object.fromEntries(Object.entries(s.threads).slice(-60));
  save(s);
}

// siapa yang bales: reply ke obrolan tertentu → mereka; sebut nama → yang disebut; masih ngobrol → orang yang sama;
// obrolan barusan → yang ngobrol; selain itu 1–2 orang yang lagi di kantor
function pickTalkers(text, replyTo, s) {
  const named = PEOPLE.filter((a) => new RegExp(`\\b${a.name.replace(' ', '\\s*')}\\b`, 'i').test(text) || (a.id === 'ob' && /\bsari\b/i.test(text))).map((a) => a.id);
  if (/\b(semua|guys|gaes|kalian|everyone)\b/i.test(text) && !named.length) {
    const here = around().filter((x) => !AWAY.includes(x.act)).sort(() => Math.random() - 0.5).slice(0, 3);
    return { ids: here.map((x) => x.a.id), ctx: s.last?.at > Date.now() - FRESH * 60_000 ? s.last.lines : [] };
  }
  const th = replyTo && s.threads?.[replyTo];
  if (th) return { ids: [...new Set([...th.who, ...named])], ctx: th.lines };
  if (named.length) return { ids: named, ctx: [] };
  if (s.talk && Date.now() - s.talk.at < STICKY * 60_000) return { ids: s.talk.ids, ctx: [] };
  if (s.last && Date.now() - s.last.at < FRESH * 60_000) return { ids: s.last.who, ctx: s.last.lines };
  const here = around().filter((x) => !AWAY.includes(x.act)).sort(() => Math.random() - 0.5);
  return { ids: (here.length ? here : around()).slice(0, 1 + Math.round(Math.random())).map((x) => x.a.id), ctx: [] };
}

function persona(id, date) {
  const a = AGENTS.find((x) => x.id === id);
  const now = around().find((x) => x.a.id === id);
  const rel = relationsOn(date).filter((r) => (r.a === id || r.b === id) && r.stage !== 'putus')
    .map((r) => `${r.stage} sama ${nameOf(r.a === id ? r.b : r.a)}`);
  const extra = id === 'sec' ? ', pacar Bos (manggil Bos "sayang")' : id === 'ob' ? ', office girl ramah, logat ibu-ibu' : '';
  return `- ${a.name} (${a.gender === 'f' ? 'cewek' : 'cowok'}, ${a.title}${a.team ? ` tim ${TEAM[a.team]}` : ''}${extra})${rel.length ? `, ${rel.join(', ')}` : ''}; lagi: ${now?.label ?? 'santai'}`;
}

export async function handleChitchat(text, replyTo, log = console.log, { dry = false } = {}) {
  const s = load();
  const t = wita(new Date());
  const { ids, ctx } = pickTalkers(text, replyTo, s);
  const hist = (s.hist ?? []).slice(-12).join('\n');
  const prompt = `Kamu memerankan pegawai kantor Zataa (top up game zataa.my.id) yang lagi nongkrong & ngobrol SANTAI sama Bos Zamiir (Owner) lewat grup chit-chat Telegram.
Ini BUKAN obrolan kerja: bercanda, curhat, gosip ringan, game (ML, Valorant, FF), makanan, film, musik, hidup sehari-hari. Bahasa Indonesia santai ala anak kantor/gamer, singkat kayak chat beneran (1–2 kalimat per orang), boleh emoji secukupnya, sopan tapi akrab ke Bos. Tiap orang punya gaya sendiri, jangan seragam; ngomong sebagai diri sendiri (jangan nyebut nama sendiri kayak orang lain), boleh saling sahut.
Bos nyinggung kerjaan → tanggepin santai aja, jangan bahas detail/angka kerja; kalau Bos serius mau nyuruh kerja, bilang becanda "kirim ke bot divisinya aja Bos 😆".
Sekarang ${t.dayName} ${t.hh}:${t.mm} WITA.
Yang ngobrol sama Bos:
${ids.map((id) => persona(id, t.date)).join('\n')}
${ctx.length ? `Obrolan mereka barusan (Bos nimbrung ke sini):\n${ctx.join('\n')}\n` : ''}${hist ? `Chat terakhir di grup:\n${hist}\n` : ''}
Pesan baru Bos: "${text}"

Balas 1–3 baris dari orang di atas (nggak harus semua; yang paling nyambung duluan). Boleh cari web maks 1× kalau Bos nanya hal terkini (skor match, rilis film), selain itu jangan pakai alat.
Akhiri dengan baris "BALASAN:" lalu tiap baris format "Nama: pesan".`;
  const r = await haiku(prompt, { minutes: 2, tools: ['WebSearch'] });
  const lines = r.ok ? replyOf(r.text).split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = l.match(/^\**([^:*]{2,20})\**:\s*(.+)$/);
    const a = m && PEOPLE.find((x) => x.name.toLowerCase() === m[1].trim().toLowerCase());
    return a ? { id: a.id, msg: m[2].replace(/\*\*/g, '') } : null;
  }).filter(Boolean).slice(0, 3) : [];
  log(`chitchat: ${r.ok ? `${lines.length} balasan` : 'gagal'}`);
  if (dry) return lines;
  const d = openDb();
  try {
    chat(d, 'owner', ids.length === 1 ? ids[0] : null, text, 'nimbrung');
    for (const l of lines) chat(d, l.id, 'owner', l.msg, 'nimbrung');
  } finally { d.close(); }
  s.hist = [...(s.hist ?? []), `Bos: ${text.slice(0, 200)}`, ...lines.map((l) => `${nameOf(l.id)}: ${l.msg}`)].slice(-16);
  if (lines.length) s.talk = { ids: [...new Set(lines.map((l) => l.id))], at: Date.now() };
  save(s);
  return lines;
}

const HELP = `Halo Bos 👋 Ini tongkrongan anak-anak kantor Zataa.
Obrolan santai mereka di web ikut nongol di sini. Mau nimbrung? Ketik aja, atau <b>reply</b> obrolan tertentu biar yang ngobrol itu yang bales. Sebut nama (mis. "Ista, udah makan?") buat ngajak orang tertentu, "guys" buat semua.

/siapa — siapa aja yang lagi di kantor
/santai — terusin obrolan sesekali (default)
/rame — terusin semua obrolan
/diem — jangan terusin, cuma bales kalau Bos chat`;

function whoText() {
  const all = around();
  const here = all.filter((x) => !AWAY.includes(x.act));
  const by = {};
  for (const x of here) (by[x.label] ??= []).push(x.a.name);
  return `🏢 <b>${here.length} orang lagi di kantor</b>\n${Object.entries(by).map(([k, v]) => `• ${esc(k)}: ${esc(v.join(', '))}`).join('\n')}${all.length > here.length ? `\n\n🚪 Lagi nggak bisa diajak ngobrol: ${esc(all.filter((x) => AWAY.includes(x.act)).map((x) => x.a.name).join(', '))}` : ''}`;
}

export async function startChitchatBot(log = console.log, onChange = () => {}) {
  if (!env().CHITCHAT_BOT_TOKEN || !ownerId()) return log('bot chit-chat: CHITCHAT_BOT_TOKEN/owner id kosong, dilewati');
  log('bot chit-chat jalan');
  setInterval(() => mirror(log).catch((e) => log(`chitchat mirror: ${e.message}`)), 60_000);
  let offset = 0, fails = 0;
  for (;;) {
    let ups = [];
    try { ups = await api('getUpdates', { offset, timeout: 50, allowed_updates: ['message'] }); fails = 0; } catch (e) {
      if (++fails >= 3) log(`bot chit-chat: ${e.message} ×${fails}`);
      await new Promise((r) => setTimeout(r, fails < 3 ? 2_000 : 15_000));
      continue;
    }
    for (const u of ups) {
      offset = u.update_id + 1;
      const m = u.message;
      if (!m || String(m.chat.id) !== String(ownerId()) || !m.text) continue;   // selain Owner: abaikan
      const text = m.text.trim();
      const cmd = text.match(/^\/(start|help|siapa|santai|rame|diem)\b/)?.[1];
      try {
        if (cmd === 'start' || cmd === 'help') { await send(HELP); continue; }
        if (cmd === 'siapa') { await send(whoText()); continue; }
        if (cmd) {
          const s = load(); s.mode = cmd; save(s);
          await send({ santai: '☕ Oke Bos, obrolan diterusin sesekali aja.', rame: '🔊 Siap, semua obrolan diterusin ke sini.', diem: '🤫 Oke, nggak diterusin. Kita bales kalau Bos chat aja.' }[cmd]);
          continue;
        }
        await api('sendChatAction', { chat_id: ownerId(), action: 'typing' }).catch(() => {});
        const lines = await handleChitchat(text, m.reply_to_message?.message_id, log);
        if (!lines.length) { await send('<i>(pada sibuk, nggak ada yang bales… coba lagi bentar 😅)</i>'); continue; }
        for (const l of lines) {
          await send(`<b>${esc(nameOf(l.id))}:</b> ${esc(l.msg)}`);
          await new Promise((r) => setTimeout(r, 1200));
        }
        onChange();
      } catch (e) { log(`bot chit-chat gagal: ${e.message}`); }
    }
  }
}

// tes lokal tanpa Telegram: node scripts/chitchat-bot.mjs say "pesan"  ·  node scripts/chitchat-bot.mjs peek
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'say') console.log(await handleChitchat(rest.join(' '), null, console.log, { dry: true }));
  else if (cmd === 'peek') console.log(JSON.stringify(finishedChats(wita(new Date())).slice(-3), null, 1));
  else console.log(whoText().replace(/<[^>]+>/g, ''));
}
