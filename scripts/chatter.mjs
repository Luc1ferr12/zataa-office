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
  // tim YouTube Shorts
  ydir: ['yresearch'],
  yresearch: ['yscript'],
  yscript: ['yvisual'],
  yvisual: ['yvideo'],
  yvideo: ['ypublish'],
  ypublish: ['owner'],
  // tim Zaa Story
  sdir: ['sresearch'],
  sresearch: ['sscript'],
  sscript: ['svisual'],
  svisual: ['svideo'],
  svideo: ['spublish'],
  spublish: ['owner'],
  // tim Marvel Talk & Zaa Clips (16 Nov 2026)
  vdir: ['vresearch'], vresearch: ['vscript'], vscript: ['vvisual'], vvisual: ['vvideo'], vvideo: ['vpublish'], vpublish: ['owner'],
  cdir: ['cbrief'], cbrief: ['cedit'], cedit: ['ccopy'], ccopy: ['cpublish'], cpublish: ['owner'],
  // tim Cowo Bingung (23 Nov 2026, cewek semua)
  bdir: ['bresearch'], bresearch: ['bscript'], bscript: ['bvisual'], bvisual: ['bvideo'], bvideo: ['bpublish'], bpublish: ['owner'],
};
export const NAMES = { dir: 'Andre', sec: 'Nabila', researcher: 'Salsa', copywriter: 'Tiara', designer: 'Vania', video: 'Dimas', publisher: 'Fikri', ads: 'Fahriah', analyst: 'Raka', price: 'Budi', ob: 'Mbak Sari', owner: 'Bos Zamiir',
  tdir: 'Mahendra', tresearch: 'Davina', ttech: 'Keira', trisk: 'Aryaputra', texec: 'Wiratama', teval: 'Jihan', treport: 'Selena',
  ydir: 'Bagas', yresearch: 'Nadhira', yscript: 'Laras', yvisual: 'Galih', yvideo: 'Yoga', ypublish: 'Kirana',
  sdir: 'Raditya', sresearch: 'Sekar', sscript: 'Dinda', svisual: 'Arga', svideo: 'Bima', spublish: 'Nayla',
  vdir: 'Reza', vresearch: 'Citra', vscript: 'Fajar', vvisual: 'Intan', vvideo: 'Kevin', vpublish: 'Putri',
  cdir: 'Hendra', cbrief: 'Maya', cedit: 'Rizky', ccopy: 'Wulan', cpublish: 'Tasya',
  bdir: 'Aurel', bresearch: 'Keisha', bscript: 'Naura', bvisual: 'Zahra', bvideo: 'Celine', bpublish: 'Alya' };

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
  ydir: ['{to}, topik Shorts hari ini: "{task}". Gali sumbernya ya, minimal 2 🏺', 'Brief Shorts "{task}" udah jadi. {to}, gas riset!'],
  yresearch: ['{to}, bahan "{task}" udah aku rangkum + sumbernya. Mana fakta, mana teori udah aku tandain 📜', 'Riset "{task}" beres, {to}. Lanjut naskah ya'],
  yscript: ['{to}, naskah "{task}" udah lolos cek fakta. Tinggal visualin 🎬', 'Script "{task}" ready, {to}. Hook-nya di detik pertama ya'],
  yvisual: ['{to}, visual "{task}" udah lengkap + kredit lisensinya. Siap dirakit 🖼️', 'Aset adegan "{task}" kelar, {to}. Gas edit!'],
  yvideo: ['{to}, Shorts "{task}" udah render 9:16 + VO. Cek judul & tag ya', 'Video "{task}" kelar, {to}. Durasinya pas di bawah 60 detik'],
  ypublish: ['Bos, Shorts "{task}" udah aku kirim ke Telegram. Ditunggu ✅ buat upload 🙏'],
  sdir: ['{to}, topik Zaa Story hari ini: "{task}". Cari sisi sejarahnya ya, jangan cuma seremnya 👻', 'Brief "{task}" udah jadi. {to}, gas riset!'],
  sresearch: ['{to}, bahan "{task}" udah aku rangkum. Yang "konon" sama yang fakta udah aku pisahin 📜', 'Riset "{task}" beres, {to}. Lanjut naskah ya'],
  sscript: ['{to}, naskah "{task}" udah jadi, hook-nya serem di detik pertama 😶', 'Script "{task}" ready, {to}. Tolong cariin foto arsip yang gelap ya'],
  svisual: ['{to}, visual "{task}" lengkap + kredit lisensi. Nggak ada foto penampakan palsu ya 🖼️', 'Aset "{task}" kelar, {to}. Gas edit!'],
  svideo: ['{to}, Shorts "{task}" udah render 9:16 + VO. Siap ke YouTube & TikTok', 'Video "{task}" kelar, {to}. Cek judul & caption TikTok ya'],
  spublish: ['Bos, Shorts "{task}" udah aku kirim ke @zataastorybot. Ditunggu ✅ buat tayang YouTube + TikTok 🙏'],
  vdir: ['{to}, topik Marvel Talk hari ini: "{task}". Cari sumbernya ya, bedain fakta, teori & rumor 🦸', 'Brief "{task}" beres. {to}, gas riset!'],
  vresearch: ['{to}, bahan "{task}" udah aku rangkum + sumbernya. Teori fans udah aku tandain 📚', 'Riset "{task}" kelar, {to}. Ada easter egg seru nih 👀'],
  vscript: ['{to}, naskah "{task}" udah lolos cek fakta. Hook-nya nendang di detik pertama 💥', 'Script "{task}" ready, {to}, tinggal visualin'],
  vvisual: ['{to}, visual "{task}" lengkap, aman lisensi, tanpa footage film asli 🖼️', 'Aset "{task}" kelar, {to}. Siap dirakit'],
  vvideo: ['{to}, Shorts "{task}" udah render 9:16 + VO. Siap ke YouTube & TikTok 🎬', 'Video "{task}" kelar, {to}. Cek judul ya'],
  vpublish: ['Bos, Shorts "{task}" udah aku kirim ke bot Marvel Talk. Ditunggu ✅-nya 🙏', 'Bos, "{task}" nunggu approval di bot Marvel Talk ya'],
  bdir: ['{to}, topik Cowo Bingung hari ini: "{task}". Cari 2 sumber ya, yang bikin orang mikir "hah, masa sih?" 🤔', 'Brief "{task}" beres. {to}, gas riset!'],
  bresearch: ['{to}, fakta "{task}" udah aku cek ke 2 sumber. Mitosnya udah aku tandain 📚', 'Riset "{task}" kelar, {to}. Ini lucu banget sumpah 😂'],
  bscript: ['{to}, naskah "{task}" jadi, format coba-gagal-berhasil. Tag ekspresinya udah aku pasang 🎙️', 'Script "{task}" ready, {to}, tinggal bikin filmnya'],
  bvisual: ['{to}, film "{task}" gaya Brick Toy udah aku rakit di kode. Tinggal suara + render 🧱', 'Adegan "{task}" kelar, {to}. Lucu nggak tuh tukangnya 😆'],
  bvideo: ['{to}, "{task}" udah render 9:16 + suara Depa + caption per kata 🎬', 'Video "{task}" kelar, {to}. Cek judul & caption TikTok ya'],
  bpublish: ['Bos, Shorts "{task}" udah aku kirim ke @cowobingungbot. Ditunggu ✅-nya 🙏', 'Bos, "{task}" nunggu approval di @cowobingungbot ya'],
  cdir: ['{to}, campaign "{task}" udah di-✅ Bos. Baca brief-nya teliti ya, jangan sampe ada larangan kelewat 📋', 'Campaign "{task}" jalan! {to}, cari momen terbaiknya'],
  cbrief: ['{to}, momen buat "{task}" udah aku tandain + alasan sesuai brief ✂️', 'Timestamp "{task}" siap, {to}. Hook-nya di detik awal'],
  cedit: ['{to}, clip "{task}" udah kepotong 9:16 + subtitle. Tinggal caption 🎞️', 'Edit "{task}" kelar, {to}. Durasi masuk brief'],
  ccopy: ['{to}, caption + hashtag + tag wajib buat "{task}" udah lengkap ✍️', 'Hook & caption "{task}" beres, {to}. Gas upload'],
  cpublish: ['Bos, clip "{task}" udah tayang di TikTok & IG. Nanti tembus 1rb views langsung aku ajuin ke Clippo 💸', 'Clip "{task}" udah naik, Bos. Aku pantau views-nya'],
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
