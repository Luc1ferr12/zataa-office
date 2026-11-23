// Peta bot Telegram ↔ pegawai (22 Nov 2026): tiap pegawai punya SATU kamar (bot) tempat dia boleh ngomong.
// - sayVia/botReady: kirim ke bot yang benar (approval.mjs sayAs ikut ini, jadi Nabila nggak nongol di bot About Esports lagi)
// - addressedAgent/redirectText: Owner manggil pegawai di bot yang salah → pegawai bot ini nunjuk kamar yang benar (bukan dijawab orang asing)
// Murni tanpa import ke modul lain (approval.mjs mengimpor ini), .env dibaca sendiri.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENV_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
const fileEnv = () => {
  const o = {};
  if (existsSync(ENV_FILE)) for (const l of readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
  return o;
};
const env = () => ({ ...fileEnv(), ...process.env });

export const BOTS = {
  office: { label: 'bot kantor About Esports', token: 'TELEGRAM_BOT_TOKEN', chat: ['TELEGRAM_CHAT_ID'], speaker: 'dir' },
  finance: { label: 'bot keuangan Nabila (@zataaaccountingbot)', token: 'FINANCE_BOT_TOKEN', chat: ['FINANCE_OWNER_ID'], speaker: 'sec' },
  history: { label: 'bot Zaa History (@zataashortbot)', token: 'SHORTS_BOT_TOKEN', chat: ['SHORTS_OWNER_ID'], speaker: 'ydir' },
  story: { label: 'bot Zaa Story (@zataastorybot)', token: 'STORY_BOT_TOKEN', chat: ['SHORTS_OWNER_ID'], speaker: 'sdir' },
  marvel: { label: 'bot Marvel Talk', token: 'MARVEL_BOT_TOKEN', chat: ['SHORTS_OWNER_ID'], speaker: 'vdir' },
  cowo: { label: 'bot Cowo Bingung (@cowobingungbot)', token: 'COWO_BOT_TOKEN', chat: ['SHORTS_OWNER_ID'], speaker: 'bdir' },
  clips: { label: 'bot Zaa Clips', token: 'CLIPPER_BOT_TOKEN', chat: ['CLIPPER_OWNER_ID', 'SHORTS_OWNER_ID'], speaker: 'cdir' },
  trading: { label: 'bot Zaa Office Trading', token: 'TRD_TG_TOKEN', chat: ['TRD_TG_CHAT'], speaker: 'tdir' },
};

const TEAM = {
  office: ['dir', 'researcher', 'copywriter', 'designer', 'video', 'publisher', 'ads', 'analyst', 'price', 'ob', 'owner'],
  finance: ['sec'],
  history: ['ydir', 'yresearch', 'yscript', 'yvisual', 'yvideo', 'ypublish'],
  story: ['sdir', 'sresearch', 'sscript', 'svisual', 'svideo', 'spublish'],
  marvel: ['vdir', 'vresearch', 'vscript', 'vvisual', 'vvideo', 'vpublish'],
  cowo: ['bdir', 'bresearch', 'bscript', 'bvisual', 'bvideo', 'bpublish'],
  clips: ['cdir', 'cbrief', 'cedit', 'ccopy', 'cpublish'],
  trading: ['tdir', 'tresearch', 'ttech', 'trisk', 'texec', 'teval', 'treport'],
};
const HOME = Object.fromEntries(Object.entries(TEAM).flatMap(([bot, ids]) => ids.map((id) => [id, bot])));
export const homeOf = (agent) => HOME[agent] ?? 'office';

// nama panggilan → id pegawai (dipakai ask.mjs & penjaga kamar)
export const WHO = { andre: 'dir', nabila: 'sec', salsa: 'researcher', tiara: 'copywriter', vania: 'designer', dimas: 'video', fikri: 'publisher', fahriah: 'ads', raka: 'analyst', budi: 'price', sari: 'ob',
  mahendra: 'tdir', davina: 'tresearch', keira: 'ttech', aryaputra: 'trisk', arya: 'trisk', wiratama: 'texec', wira: 'texec', jihan: 'teval', selena: 'treport',
  bagas: 'ydir', nadhira: 'yresearch', laras: 'yscript', galih: 'yvisual', yoga: 'yvideo', kirana: 'ypublish',
  raditya: 'sdir', sekar: 'sresearch', dinda: 'sscript', arga: 'svisual', bima: 'svideo', nayla: 'spublish',
  reza: 'vdir', citra: 'vresearch', fajar: 'vscript', intan: 'vvisual', kevin: 'vvideo', putri: 'vpublish',
  hendra: 'cdir', maya: 'cbrief', rizky: 'cedit', wulan: 'ccopy', tasya: 'cpublish',
  aurel: 'bdir', keisha: 'bresearch', naura: 'bscript', zahra: 'bvisual', celine: 'bvideo', alya: 'bpublish' };

const chatOf = (key, e = env()) => BOTS[key].chat.map((k) => e[k]).find(Boolean) ?? '';
export const botReady = (key) => { const e = env(); return !!(e[BOTS[key]?.token] && chatOf(key, e)); };

// kirim ke bot `key` (HTML). Lempar error kalau bot belum dikonfigurasi / Telegram menolak.
export async function sayVia(key, text, extra = {}) {
  const e = env();
  const token = e[BOTS[key].token], chat = chatOf(key, e);
  if (!token || !chat) throw new Error(`${BOTS[key].label}: token/chat belum diisi di .env`);
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra }), signal: AbortSignal.timeout(20_000) });
  const j = await r.json();
  if (!j.ok) throw new Error(`Telegram ${key}: ${j.description}`);
  return j.result;
}

// pesan DITUJUKAN ke pegawai (nama di awal pesan, boleh didahului sapaan): "Nabila catat...", "halo kak Bagas", "p dimas"
const NAME_RE = Object.keys(WHO).join('|');
const GREET = '(?:halo+|hai+|hi+|hey+|p+|woy+|woi+|oi+|bang|kak|mbak|mba|mas|dek|bro|sis|neng|tolong|minta)';
const ADDR_RE = new RegExp(`^[\\s"'“(\\[]*(?:${GREET}[\\s,]+)*(${NAME_RE})\\b`, 'i');
export const addressedAgent = (text) => WHO[(String(text ?? '').match(ADDR_RE)?.[1] ?? '').toLowerCase()] ?? null;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const nameOfAgent = (agent) => cap(Object.entries(WHO).find(([, id]) => id === agent)?.[0] ?? agent);

// Owner manggil `agent` di bot `here` padahal kamarnya bot lain → teks arahan (null = kamarnya memang di sini)
export function redirectText(here, agent) {
  const home = homeOf(agent);
  if (!agent || home === here) return null;
  return `${nameOfAgent(agent)} kerjanya di <b>${BOTS[home].label}</b>, Bos. Panggil dia di sana ya 🙏`;
}
