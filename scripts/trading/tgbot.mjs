// Bot Telegram khusus tim Trading (terpisah dari bot marketing). Token & chat Owner di .env VPS:
//   TRD_TG_TOKEN=...   TRD_TG_CHAT=<chat id Owner>
// Kalau belum diisi, pesan trading tetap lewat bot marketing (approval.mjs).
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// baca .env sendiri, biar jalan juga dari watcher (ask.mjs) yang nggak nge-load .env ke process.env
let fileEnv = null;
const envOf = (k) => {
  if (process.env[k]) return process.env[k];
  if (!fileEnv) {
    fileEnv = {};
    const f = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env');
    if (existsSync(f)) for (const l of readFileSync(f, 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) fileEnv[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
  }
  return fileEnv[k] || '';
};
const token = () => envOf('TRD_TG_TOKEN');
const chatId = () => envOf('TRD_TG_CHAT');
export const tradingBotOn = () => !!(token() && chatId());

async function api(method, body, timeoutMs = 20000) {
  const r = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(`telegram ${method}: ${j.description}`);
  return j.result;
}

export const sendTrading = (html) => api('sendMessage', { chat_id: chatId(), text: html, parse_mode: 'HTML', disable_web_page_preview: true });

// long-poll pesan masuk; cuma pesan dari chat Owner yang diproses, sisanya diabaikan
export async function pollTrading(onText, { getOffset, setOffset, log = console.log }) {
  if (!tradingBotOn()) return;
  for (;;) {
    try {
      const ups = await api('getUpdates', { offset: getOffset(), timeout: 25, allowed_updates: ['message'] }, 35000);
      for (const u of ups) {
        setOffset(u.update_id + 1);
        const m = u.message;
        if (!m?.text || String(m.chat?.id) !== String(chatId())) continue;
        try { await onText(m.text.trim()); } catch (e) { log(`perintah trading: ${e.message}`); }
      }
    } catch (e) {
      log(`bot trading: ${e.message}`);
      await new Promise((r) => setTimeout(r, 10000));
    }
  }
}
