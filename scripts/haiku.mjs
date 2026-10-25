// Jawaban pertama semua bot Telegram (Marketing, Shorts, Trading, Aprista): Haiku duluan → murah & cepat.
// Haiku boleh jawab pertanyaan APA AJA (umum, divisi lain, data kantor read-only). Kalau ternyata butuh kerja beneran
// (bikin/ubah konten, eksekusi perintah) dia balas ESCALATE → bot oper ke model utama / bot divisi yang pas.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const ESCALATE = '[[ESKALASI]]';

function envVal(key) {
  if (process.env[key]) return process.env[key];
  try { return readFileSync(join(ROOT, '.env'), 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim(); } catch { return undefined; }
}

// alat baca-saja: data kantor dari CLI masing-masing divisi + 2 pencarian web buat pertanyaan umum
export const LOOKUPS = ['Read', 'Glob', 'Grep', 'WebSearch',
  'Bash(node scripts/trading/cli.mjs status)', 'Bash(node scripts/shorts-bot.mjs list)', 'Bash(node scripts/shorts-bot.mjs list --brand=story)', 'Bash(node scripts/office.mjs brief:*)', 'Bash(node scripts/price.mjs latest:*)'];

export const OFFICE = `Kantor Zataa (zataa.my.id, top up game), 5 divisi:
- Marketing (bot Zataa Office Marketing): Andre (dir, Marketing Director), Clariana (researcher), Ista (copywriter), Maria (designer), Dimas (video), Fikri (publisher), Fahriah (ads, lagi libur — iklan Meta belum bisa), Raka (analyst), Budi (price).
- YouTube Shorts "Zataa History" (sejarah misteri kuno dunia, 4 Shorts/minggu, bot @zataashortbot): Bagas (ydir), Nadhira (yresearch), Laras (yscript), Galih (yvisual), Yoga (yvideo), Kirana (ypublish).
- Zataa Story (misteri & horor Nusantara, YouTube + TikTok tiap hari, bot @zataastorybot): Raditya (sdir), Sekar (sresearch), Dinda (sscript), Arga (svisual), Bima (svideo), Nayla (spublish).
- Trading XAUUSD (bot Zataa Office Trading): Mahendra (tdir), Davina (tresearch), Keira (ttech), Aryaputra (trisk), Wiratama (texec), Jihan (teval), Selena (treport).
- Aprista (sec): sekretaris pribadi & pacar Bos, catat keuangan pribadi di @zataaaccountingbot.
Owner = Bos Zamiir.`;

export const ANSWER_ANY = `Pertanyaan APA PUN (pengetahuan umum, saran, divisi lain, kondisi kantor) → JAWAB langsung, jangan suruh pindah bot.
Data kantor ambil baca-saja kalau perlu: trading "node scripts/trading/cli.mjs status", Shorts "node scripts/shorts-bot.mjs list" (Zataa Story: tambah --brand=story), marketing "node scripts/office.mjs brief <id>", harga zataa "node scripts/price.mjs latest [kata]". Jangan ngarang angka; datanya nggak ada → bilang jujur. Fakta terkini boleh cari web maks 2×.`;

export function haiku(prompt, { minutes = 3, tools = LOOKUPS } = {}) {
  const bin = envVal('CLAUDE_BIN') || 'claude';
  const model = envVal('CHAT_MODEL') || 'haiku';
  return new Promise((resolve) => {
    const win = process.platform === 'win32'; // shell Windows memecah argumen berspasi → kutip
    const args = ['-p', '--model', model, '--allowedTools', ...tools].map((a) => (win && /[\s()]/.test(a) ? `"${a}"` : a));
    const p = spawn(bin, args, { cwd: ROOT, shell: win, windowsHide: true });
    let o = '', e = '';
    const timer = setTimeout(() => { p.kill(); e += `\n(dihentikan: lewat ${minutes} menit)`; }, minutes * 60_000);
    p.stdout.on('data', (b) => { o += b; });
    p.stderr.on('data', (b) => { e += b; });
    p.on('error', (err) => { clearTimeout(timer); resolve({ ok: false, text: err.message }); });
    p.on('close', (code) => { clearTimeout(timer); resolve({ ok: code === 0, text: (code === 0 ? o : e || o).trim(), escalate: o.includes(ESCALATE) }); });
    p.stdin.end(prompt);
  });
}

// teks setelah "BALASAN:" (format semua bot)
export const replyOf = (text) => {
  const i = text.lastIndexOf('BALASAN:');
  return (i >= 0 ? text.slice(i + 8) : text).trim();
};
