// Antrean permintaan report RGE (kerjaan kantor Owner) dari bot Nabila → agen di laptop.
// File RGE cuma ada di OneDrive laptop, jadi VPS cuma nitip pesan Owner; datanya nggak pernah lewat VPS/DB/web.
//   node scripts/rge-queue.mjs push "<pesan Owner>"   # dipanggil finance-bot.mjs
//   node scripts/rge-queue.mjs pop                    # dipanggil laptop (ssh): cetak JSON antrean, kosongkan, catat detak laptop
//   node scripts/rge-queue.mjs hold on|off            # laptop: report pagi ditahan (angka belum update) / udah kekirim
//   node scripts/rge-queue.mjs status                # menit sejak laptop terakhir ngecek
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const Q = join(ROOT, 'tmp', 'rge-queue.json');
const BEAT = join(ROOT, 'tmp', 'rge-laptop-beat');
const read = () => { try { return JSON.parse(readFileSync(Q, 'utf8')); } catch { return []; } };
const write = (a) => { mkdirSync(dirname(Q), { recursive: true }); writeFileSync(Q, JSON.stringify(a)); };

// report pagi ditahan (angka belum update) → balasan Bos kayak "udah update" / "kirim aja" dioper ke laptop
const HOLD = join(ROOT, 'tmp', 'rge-hold');
export function holding() { try { return Date.now() - +readFileSync(HOLD, 'utf8') < 36 * 3600e3; } catch { return false; } }
const HOLD_RE = /\b(update|updet|apdet|di ?update|kirim|gas|beres|done)\b/i;
const MONEY_RE = /\b(bayar|beli|catat|rb|ribu|jt|juta|transfer|gaji|tagihan|struk|tabung|nabung)\b|\d/i;
export const holdReply = (msg) => holding() && !MONEY_RE.test(msg) && (HOLD_RE.test(msg) || /^\s*(udah|sudah|udh|sdh|ok(e|ay)?|siap)\b[\s\w!.]{0,12}$/i.test(msg));

export function pushRge(text) { write([...read(), { t: Date.now(), text: String(text).slice(0, 2000) }].slice(-20)); }
export function laptopIdleMin() { try { return (Date.now() - +readFileSync(BEAT, 'utf8')) / 60e3; } catch { return Infinity; } }

// pesan yang jelas soal dashboard kantor → langsung ke laptop tanpa Haiku
export const RGE_RE = /\b(rge|kecamatan attack|kec(?:amatan)? attack|activity dmp|dashboard (?:dmp|kantor|rge)|dmp|ga sp|daily ga|mtd vs lmtd|desa attack|stock posm|track asset|gcp)\b/i;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'push') { pushRge(rest.join(' ')); console.log('ok'); }
  else if (cmd === 'pop') {
    mkdirSync(dirname(BEAT), { recursive: true });
    writeFileSync(BEAT, String(Date.now()));
    console.log(JSON.stringify(read()));
    write([]);
  } else if (cmd === 'hold') {
    mkdirSync(dirname(HOLD), { recursive: true });
    if (rest[0] === 'on') writeFileSync(HOLD, String(Date.now())); else { try { unlinkSync(HOLD); } catch { /* udah nggak ada */ } }
    console.log(`hold ${holding() ? 'on' : 'off'}`);
  } else if (cmd === 'status') console.log(`laptop terakhir ngecek ${laptopIdleMin().toFixed(1)} menit lalu, antrean ${read().length}, report ditahan: ${holding() ? 'ya' : 'nggak'}`);
  else console.log('pakai: push "<pesan>" | pop | hold on|off | status');
}
