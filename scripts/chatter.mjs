// Obrolan antar pegawai (panel "Chit-chat" di web). Tanpa AI: oper kerjaan otomatis dari template,
// obrolan santai digenerate di browser (docs/js/chatter.js). Claude boleh nambah lewat `office.mjs chat`.
export const CHAT_SQL = `CREATE TABLE IF NOT EXISTS chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (datetime('now')),
  agent_id TEXT NOT NULL, to_id TEXT, kind TEXT NOT NULL DEFAULT 'santai', -- oper | santai | curhat | bos
  message TEXT NOT NULL)`;

// alur kerja: siapa oper ke siapa setelah tugasnya kelar
export const NEXT = {
  dir: ['researcher'],
  researcher: ['copywriter'],
  copywriter: ['designer', 'video'],
  designer: ['publisher'],
  video: ['publisher'],
  publisher: ['owner'],
  ads: ['owner'],
  analyst: ['dir'],
  price: ['copywriter'],
};
export const NAMES = { dir: 'Aprista', researcher: 'Clariana', copywriter: 'Ista', designer: 'Maria', video: 'Dimas', publisher: 'Fikri', ads: 'Fahriah', analyst: 'Raka', price: 'Nadia', ob: 'Mbak Sari', owner: 'Bos Zamiir' };

const pick = (arr, seed) => arr[Math.abs(seed) % arr.length];
const seedOf = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);

const HANDOFF = {
  dir: ['{to}, plan minggu ini udah aku taruh ya. Fokus "{task}". Tolong cariin bahan beritanya 🙏', 'Brief "{task}" udah jadi. {to}, gas riset ya!'],
  researcher: ['{to}, bahan buat "{task}" udah aku rangkum + sumbernya. Tinggal kamu racik captionnya ✍️', 'Riset "{task}" beres, udah dicek 2 sumber. {to}, lanjut ya~'],
  copywriter: ['{to}, copy "{task}" udah masuk. Headline-nya jangan dikecilin ya 😆', 'Teks buat "{task}" ready. {to}, giliranmu bikin cakep!'],
  designer: ['{to}, desain "{task}" udah render 1080×1080. QA dulu ya sebelum ke bos', 'Visual "{task}" kelar! {to}, cek typo-nya sekalian ya 🙏'],
  video: ['{to}, video "{task}" udah render 9:16. Musiknya aman kok', 'Render "{task}" selesai, {to}. Cek cover-nya ya'],
  publisher: ['Bos, "{task}" udah aku kirim ke Telegram. Ditunggu approve-nya 🙏', '"{task}" udah lolos QA, tinggal nunggu ✅ dari Bos'],
  ads: ['Bos, ada usulan boost buat "{task}". Cek Telegram ya 💸'],
  analyst: ['{to}, data "{task}" udah aku rangkum. Angkanya menarik nih 📈', 'Rekap "{task}" beres, {to}. Bisa buat bahan plan'],
  price: ['{to}, harga buat "{task}" udah aku cek di web. Angkanya aman dipake 💰', '{to}, cek harga "{task}" kelar, jangan sampe salah angka ya'],
};
const REVISION = [
  'Yah revisi… oke deh, aku balik ke meja dulu 💻', 'Siap, revisi dikerjain! Bos-nya teliti banget 😅', 'Noted bos, aku benerin sekarang',
];

export function handoffText(from, to, task, seed = Date.now()) {
  const tpl = HANDOFF[from];
  if (!tpl) return null;
  return pick(tpl, seedOf(`${task}${seed}`)).replaceAll('{to}', NAMES[to] ?? to).replaceAll('{task}', String(task ?? 'kerjaan ini').slice(0, 60));
}
export const revisionText = (seed = Date.now()) => pick(REVISION, seed);

// tulis ke DB (d = DatabaseSync)
export function chat(d, from, to, message, kind = 'santai') {
  d.exec(CHAT_SQL);
  d.prepare('INSERT INTO chats (agent_id, to_id, kind, message) VALUES (?, ?, ?, ?)').run(from, to ?? null, kind, String(message).slice(0, 400));
}
export function handoff(d, from, task, { format } = {}) {
  let next = NEXT[from] ?? [];
  if (from === 'copywriter' && format) next = [format === 'video' ? 'video' : 'designer'];
  for (const to of next.slice(0, 1)) {
    const msg = handoffText(from, to, task);
    if (msg) chat(d, from, to, msg, 'oper');
  }
}
