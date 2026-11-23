// Kirim pesan ke bot divisi yang BENAR (dipakai laptop-worker lewat SSH, karena .env laptop cuma punya bot kantor About Esports).
// Pakai: node scripts/tgsay.mjs <clips|shorts|story|marvel|cowo|office> "<pesan>"
import { loadEnv } from './approval.mjs';
const env = { ...loadEnv(), ...process.env };
const BOTS = {
  clips: [env.CLIPPER_BOT_TOKEN, env.CLIPPER_OWNER_ID || env.SHORTS_OWNER_ID],
  shorts: [env.SHORTS_BOT_TOKEN, env.SHORTS_OWNER_ID],
  story: [env.STORY_BOT_TOKEN, env.SHORTS_OWNER_ID],
  marvel: [env.MARVEL_BOT_TOKEN, env.SHORTS_OWNER_ID],
  cowo: [env.COWO_BOT_TOKEN, env.SHORTS_OWNER_ID],
  office: [env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID],
};
const [bot, ...rest] = process.argv.slice(2);
const [token, chat] = BOTS[bot] ?? [];
if (!token || !chat) { console.error(`bot "${bot}" belum dikonfigurasi (token/owner kosong)`); process.exit(2); }
const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text: rest.join(' ') }) });
if (!r.ok) { console.error(`telegram ${r.status}`); process.exit(1); }
