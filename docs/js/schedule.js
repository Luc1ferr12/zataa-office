// Jadwal, aktivitas, dan mood pegawai — semuanya dihitung di browser dari jam WITA (0 token).
// Kantor jalan 24 jam & nggak ada yang pulang: jam kerja ikut plan/tugas harian (07:00–±19:30), di luar itu tiap
// pegawai beraktivitas acak (nongkrong, mabar, billiard, nonton, renang, ngadem di gazebo…) — tanpa mess, tanpa tidur.
// Tugas dadakan dari Owner (status 'working' di database) selalu menang: pegawainya langsung ke meja kerja.
// Divisi yang lagi nunggu approval Owner di Telegram → manajernya duduk nunggu di depan ruang Bos (Lt.3).
// Tim Trading (XAUUSD) ikut jam pasar: Senin–Jumat, sebagian jaga sesi New York sampai malam; Sabtu review mingguan.
// Deterministik: jam yang sama selalu menghasilkan keadaan yang sama, jadi dashboard & kantor selalu sinkron.
import { CAP as SCENE_CAP } from './px/scene.js';
import { socialActivity, coupleDate } from './social.js';

// desk = nomor meja di bilik (px/scene.js DESK_LIST: 0–7 Marketing, 8–13 Trading, 14–19 YouTube)
export const AGENTS = [
  { id: 'dir',        name: 'Andre',     avatar: '#2b4c7e', title: 'Marketing Director',     gender: 'm', team: 'mkt', lead: true },
  { id: 'researcher', name: 'Clariana',  avatar: '#6b4fd8', title: 'Researcher',             gender: 'f', team: 'mkt', desk: 0 },
  { id: 'copywriter', name: 'Ista',      avatar: '#2f6b65', title: 'Copywriter',             gender: 'f', team: 'mkt', desk: 1 },
  { id: 'designer',   name: 'Maria',     avatar: '#c0668a', title: 'Graphic Designer',       gender: 'f', team: 'mkt', desk: 2 },
  { id: 'video',      name: 'Dimas',     avatar: '#7a3b3b', title: 'Video Production',       gender: 'm', team: 'mkt', desk: 3 },
  { id: 'publisher',  name: 'Fikri',     avatar: '#33415c', title: 'Social Media Publisher', gender: 'm', team: 'mkt', desk: 4 },
  { id: 'ads',        name: 'Fahriah',   avatar: '#0d9488', title: 'Ads Specialist',         gender: 'f', team: 'mkt', desk: 5 },
  { id: 'analyst',    name: 'Raka',      avatar: '#475569', title: 'Data Analyst',           gender: 'm', team: 'mkt', desk: 6 },
  { id: 'price',      name: 'Budi',      avatar: '#d97706', title: 'Price Watcher',          gender: 'm', team: 'mkt', desk: 7 },
  { id: 'owner',      name: 'Zamiir',    avatar: '#5b1fd6', title: 'Owner / Boss',           gender: 'm', boss: true, imam: true, partner: 'sec' },
  { id: 'ob',         name: 'Mbak Sari', avatar: '#3d7ea6', title: 'Office Girl',            gender: 'f', ob: true },
  { id: 'tdir',       name: 'Mahendra',  avatar: '#1f2a4a', title: 'Trading Director',       gender: 'm', team: 'trd', lead: true, nyShift: true },
  { id: 'tresearch',  name: 'Davina',    avatar: '#5b2a86', title: 'Research & Fundamental', gender: 'f', team: 'trd', desk: 8 },
  { id: 'ttech',      name: 'Keira',     avatar: '#27272a', title: 'Technical Analysis',     gender: 'f', team: 'trd', desk: 9 },
  { id: 'trisk',      name: 'Aryaputra', avatar: '#3b0764', title: 'Decision & Risk · MQL Dev', gender: 'm', team: 'trd', desk: 10 },
  { id: 'texec',      name: 'Wiratama',  avatar: '#4c1d95', title: 'Execution',              gender: 'm', team: 'trd', desk: 11, nyShift: true },
  { id: 'teval',      name: 'Jihan',     avatar: '#8b7d6b', title: 'Evaluation & Optimization', gender: 'f', team: 'trd', desk: 12 },
  { id: 'treport',    name: 'Selena',    avatar: '#7e22ce', title: 'Reporting',              gender: 'f', team: 'trd', desk: 13, nyShift: true },
  // Aprista: sekretaris pribadi Bos (catat keuangan), numpang komputer Bos
  { id: 'sec',        name: 'Aprista',   avatar: '#8a5a3c', title: 'Sekretaris Pribadi',     gender: 'f', partner: 'owner', sec: true },
  // tim YouTube Shorts (sejarah kuno): produksi tiap hari, 1 Shorts/hari (tanpa libur, keputusan Owner 18 Okt)
  { id: 'ydir',       name: 'Bagas',     avatar: '#991b1b', title: 'Manajer YouTube',        gender: 'm', team: 'yt', lead: true },
  { id: 'yresearch',  name: 'Nadhira',   avatar: '#a16207', title: 'Riset Sejarah & Tren',   gender: 'f', team: 'yt', desk: 14 },
  { id: 'yscript',    name: 'Laras',     avatar: '#7c2d12', title: 'Scriptwriter & Fact Checker', gender: 'f', team: 'yt', desk: 15 },
  { id: 'yvisual',    name: 'Galih',     avatar: '#365314', title: 'Visual & Creative',      gender: 'm', team: 'yt', desk: 16 },
  { id: 'yvideo',     name: 'Yoga',      avatar: '#1e3a8a', title: 'Video Producer',         gender: 'm', team: 'yt', desk: 17 },
  { id: 'ypublish',   name: 'Kirana',    avatar: '#be185d', title: 'Publisher, SEO & Growth', gender: 'f', team: 'yt', desk: 18 },
];
// tampilan tiap orang (sprite pixel) ada di js/px/sprites.js, versi 3D di blender/toy_lib.py

const DOW = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
// kapasitas tempat (dari px/scene.js) — yang nomor urutnya lewat kapasitas pilih tempat lain
const CAP = SCENE_CAP;
const LUNCH_SEAT = { sec: 0, owner: 1, ob: 27 }; // Zamiir & Aprista semeja (meja cafe pertama)
const seatOf = (idx, agent) => LUNCH_SEAT[agent.id] ?? 2 + idx;   // 2–26, nggak bentrok sama kursi 0, 1, 27
// bioskop 4 baris × 7 kursi: baris belakang kursi 23–24 = love seat Zamiir & Aprista
const CINE_SEAT = { owner: 23, sec: 24 };
const CINE_FREE = [...Array(28).keys()].filter((i) => i !== 23 && i !== 24);
const cineSeat = (idx, agent) => CINE_SEAT[agent.id] ?? CINE_FREE[idx % CINE_FREE.length];
const MGR = ['dir', 'tdir', 'ydir'];   // punya ruang sendiri di Lt.2 (px/scene.js MGR_ROOM)
const WAIT_SLOT = { dir: 0, tdir: 1, ydir: 2 };   // kursi tunggu depan ruang Bos (px/scene.js S.waitBoss)
const deskLoc = (agent) => (agent.boss ? 'boss' : agent.sec ? 'secDesk' : MGR.includes(agent.id) ? `${agent.id}Desk` : 'desk');
const trading = (agent) => agent.team === 'trd';
const youtube = (agent) => agent.team === 'yt';
const RESEARCH = {
  dir: 'Siapin bahan briefing', researcher: 'Riset tren & berita esport', copywriter: 'Riset hook & caption viral',
  designer: 'Cari referensi desain', video: 'Cari referensi video', publisher: 'Cek jam tayang terbaik',
  ads: 'Riset iklan kompetitor', analyst: 'Rekap data kemarin', price: 'Cek harga web & kompetitor',
  tdir: 'Cek status semua agent trading', tresearch: 'Baca kalender ekonomi & berita USD', ttech: 'Scan chart XAUUSD multi-timeframe',
  trisk: 'Cek limit risiko & ekuitas', texec: 'Cek koneksi EA MT5', teval: 'Evaluasi trade kemarin', treport: 'Siapin laporan pagi',
  ydir: 'Cek retention Shorts kemarin', yresearch: 'Gali misteri kuno & sumbernya', yscript: 'Baca jurnal & arsip sejarah',
  yvisual: 'Kumpulin foto situs & artefak', yvideo: 'Cek referensi editing Shorts', ypublish: 'Cek trending & komentar YouTube',
};
// Aprista punya meja sendiri di ruang Bos (px/scene.js SEC_DESK)
const SEC_TASK = ['Nyatet pengeluaran Bos', 'Rekap uang masuk & keluar', 'Cek tagihan bulanan Bos', 'Rapihin catatan keuangan'];
const NY_TASK = { tdir: 'Jaga sesi New York', texec: 'Pantau order sesi New York', treport: 'Laporan sesi New York' };
// kursi rapat: Marketing (10 kursi), Trading (8 kursi)
const MKT_SEAT = { owner: 8, dir: 9, researcher: 0, copywriter: 1, designer: 2, video: 3, publisher: 4, ads: 5, analyst: 6, price: 7 };
const TRD_SEAT = { tdir: 6, tresearch: 0, ttech: 1, trisk: 2, texec: 3, teval: 4, treport: 5 };
const YT_SEAT = { ydir: 4, yresearch: 0, yscript: 1, yvisual: 2, yvideo: 3, ypublish: 5 };

export function wita(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Makassar', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).map((p) => [p.type, p.value]),
  );
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  const minutes = +parts.hour * 60 + +parts.minute + +parts.second / 60;
  const dayNum = Math.floor(Date.UTC(+parts.year, +parts.month - 1, +parts.day) / 86400000); // variasi harian
  return { dow, minutes, dayNum, dayName: DOW[dow], date: `${parts.year}-${parts.month}-${parts.day}`, hh: parts.hour, mm: parts.minute };
}

export const hash = (n) => {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};
const at = (h, m = 0) => h * 60 + m;
const pick = (arr, r) => arr[Math.floor(r * arr.length) % arr.length];

// Perkiraan jam tugas harian selesai (kalau database tidak bilang sebaliknya)
function doneAt(idx, agent, dow, day = dow) {
  const video = dow === 3 || dow === 6;
  if (trading(agent)) return at(17, 10) + Math.floor(hash(day * 5.9 + idx) * 50) - 20;   // sesi London buka → beres sore
  if (youtube(agent)) return ({ ydir: at(15, 30), yresearch: at(11), yscript: at(12, 20), yvisual: at(14, 20), yvideo: at(16, 10), ypublish: at(17) }[agent.id] ?? at(15))
    + Math.floor(hash(day * 6.7 + idx) * 50) - 20;
  const base = {
    dir: dow === 1 ? at(15, 40) : at(14, 50),
    researcher: at(11, 10),
    copywriter: at(11, 50),
    designer: video ? at(14, 10) : at(14, 40),
    video: video ? at(16, 20) : at(13, 50),
    publisher: at(15, 20),
    ads: at(16, 20),
    analyst: at(15, 40),
    price: at(14, 20),
    owner: at(15, 45),
    sec: at(15, 30),
  }[agent.id] ?? at(15);
  return base + Math.floor(hash(day * 7.7 + idx) * 60) - 25; // tiap hari beda ±30 menit
}

const MOOD_TEXT = {
  marah: ['PC nge-hang pas render!!', 'Wifi lemot banget', 'File kehapus 😭'],
  kesel: ['Revisi lagi…', 'Render error mulu', 'Ide lagi buntu', 'Notif grup ga berhenti'],
  senang: ['Konten kemarin rame!', 'Dapet ide bagus', 'Kerjaan lancar jaya'],
};
const MOOD_TEXT_TRD = {
  marah: ['MT5 disconnect pas mau entry!!', 'Spread melebar parah', 'Data feed telat 😤'],
  kesel: ['Market choppy, ga jelas arah', 'Kena SL tipis banget', 'Nunggu rilis CPI deg-degan', 'Backtest-nya ngaco'],
  senang: ['TP kena! 🎯', 'Setup-nya clean banget', 'Drawdown aman terkendali'],
};

const MOOD_TEXT_YT = {
  marah: ['Render 9:16 crash pas 90%!!', 'Video kena klaim hak cipta 😤', 'Sumbernya ternyata hoaks'],
  kesel: ['Retention drop di detik 3', 'Sumber sejarahnya beda-beda', 'Voice-over kudu ulang', 'Thumbnail ditolak Bagas'],
  senang: ['Shorts kemarin tembus views!', 'Nemu misteri yang jarang dibahas', 'Hook-nya nendang banget'],
};

export function moodAt(idx, agent, t, done) {
  const m = t.minutes;
  const block = Math.floor(m / 30);
  const D = t.dayNum ?? t.dow;
  const r = hash(block * 7.31 + idx * 31.7 + D * 13.1);
  const r2 = hash(block * 3.7 + idx * 5.3 + D);
  if (agent.partner && (m >= at(19, 30) || (m >= at(12) && m < at(13, 30))) && r < 0.4) return { key: 'senang', emoji: '🥰', label: 'Lagi berbunga-bunga' };
  // energi: turun pelan, naik lagi setelah istirahat/ngopi
  let e = m < at(12) ? 0.95 - ((m - at(7)) / 300) * 0.4 : m < at(13) ? 0.85 : 0.85 - ((m - at(13)) / 300) * 0.45;
  if (m >= at(15, 45)) e += 0.15;
  if (m >= at(19)) e += 0.2; // habis makan malam
  e -= m >= at(19) ? ((m - at(19)) / 120) * 0.25 : 0;
  if (done) return { key: 'santai', emoji: '😎', label: 'Santai, kerjaan beres' };
  let mood;
  const MT = trading(agent) ? MOOD_TEXT_TRD : youtube(agent) ? MOOD_TEXT_YT : MOOD_TEXT;
  if (r < 0.05) mood = { key: 'marah', emoji: '😡', label: pick(MT.marah, r2) };
  else if (r < 0.17) mood = { key: 'kesel', emoji: '😤', label: pick(MT.kesel, r2) };
  else if (r < 0.27) mood = { key: 'senang', emoji: '😄', label: pick(MT.senang, r2) };
  else if (m >= at(13) && m < at(14) && r < 0.55) mood = { key: 'ngantuk', emoji: '😴', label: 'Ngantuk abis makan' };
  else if (e < 0.5) mood = { key: 'capek', emoji: '😮‍💨', label: 'Mulai capek' };
  else if (m < at(10)) mood = { key: 'semangat', emoji: '💪', label: 'Semangat pagi' };
  else mood = { key: 'fokus', emoji: '🧐', label: 'Lagi fokus' };
  // burnout: kalau lagi bete/capek, kadang rehat 12 menit di ruang santai
  const mm = m % 30;
  mood.burnout = ['marah', 'kesel', 'capek'].includes(mood.key) && r2 < 0.35 && mm >= 10 && mm < 22;
  return mood;
}

// waktu luang 24 jam: tiap ±25 menit pilih kegiatan acak (deterministik per orang per hari), pilihannya ikut jam
function freeTime(idx, agent, t) {
  const m = t.minutes;
  const day = t.dayNum ?? t.dow;
  const r = hash(Math.floor(m / 25) * 3.3 + idx * 17.9 + day * 101.1);
  const late = m >= at(22) || m < at(4, 30);              // tengah malam: begadang
  const night = late || m >= at(19, 30) || m < at(5, 30);
  const canSwim = agent.gender === 'm' && m >= at(6, 30) && m < at(21);
  // urutan tempat digilir tiap hari (permutasi) → yang kebagian arcade ganti-ganti, nggak numpuk
  const order = (loc) => (loc === 'cafe' ? seatOf(idx, agent) : loc === 'cinema' ? cineSeat(idx, agent) : (idx + Math.floor(hash(day * 2.7) * AGENTS.length)) % AGENTS.length);
  const capOf = (loc) => CAP[loc === 'game' ? 'lounge' : loc] ?? 99;
  if (agent.boss) {
    // Bos santainya di ruangannya, cafe, kolam, atau bioskop kalau malam (+ billiard, lihat billiardWish)
    const b = [['bossSofa', 'Santai di ruang boss', '🛋️'], ['cafe', late ? 'Ngopi begadang' : 'Ngopi santai', '☕'],
      ...(night ? [['cinema', 'Nonton film di bioskop mini', '🍿']] : []), ...(canSwim ? [['pool', 'Berenang', '🏊']] : [])];
    const [loc, label, emoji] = pick(b, r);
    return billiardWish(idx, t, { act: 'free', loc, label, emoji, slot: ['cafe', 'cinema'].includes(loc) ? order(loc) : 0 });
  }
  const cd = coupleDate(agent, t);   // pasangan yang lagi pacaran: kencan malam di tempat yang sama
  if (cd && (cd.loc === 'cafe' || order(cd.loc) < capOf(cd.loc))) return { act: 'free', loc: cd.loc, label: cd.label, emoji: cd.emoji, slot: order(cd.loc) };
  const opts = [
    ['cafe', late ? 'Ngopi begadang' : m < at(7) ? 'Ngeteh pagi' : 'Ngopi santai', late ? '🌙' : '☕'],
    ['lounge', night ? 'Nonton TV bareng' : 'Rebahan sambil scroll HP', night ? '📺' : '📱'],
    ['game', 'Mabar di ruang santai', '🎮'],
    ['arcade', pick(['Main arcade', 'Main pingpong'], hash(idx + day)), '🕹️'],
    ...(night ? [['cinema', late ? 'Nonton film tengah malam' : 'Nonton film di bioskop mini', '🍿']] : [['lounger', 'Santai di pinggir kolam', '🕶️']]),
    ['garden', night ? 'Ngobrol di gazebo, liat bintang' : 'Ngadem di gazebo taman', night ? '🌙' : '🌿'],
  ].filter(([loc]) => order(loc) < capOf(loc));
  if (canSwim) opts.push(['pool', 'Berenang', '🏊']);
  if (!opts.length) opts.push(['cafe', 'Ngopi santai', '☕']);
  const [loc, label, emoji] = pick(opts, r);
  return billiardWish(idx, t, { act: 'free', loc, label, emoji, slot: order(loc) });
}

// billiard: 1 game = 10 menit, 1 meja = 2 orang. Tiap blok 10 menit sebagian orang yang lagi santai pengin main;
// pairBilliard() (dipanggil setelah semua pegawai dihitung) memasangkan mereka per meja, sisanya balik ke rencana awal (alt)
function billiardWish(idx, t, alt) {
  const g = Math.floor(t.minutes / 10), day = t.dayNum ?? t.dow;
  if (hash(g * 7.7 + idx * 3.1 + day * 5.3) >= 0.24 || alt.loc === 'pool') return alt;
  return { act: 'free', loc: 'billiard', label: 'Main billiard', emoji: '🎱', alt };
}
export function pairBilliard(infos, t) {
  const g = Math.floor(t.minutes / 10), day = t.dayNum ?? t.dow;
  const key = (i) => hash(i * 9.1 + g * 1.3 + day * 0.7);
  const want = infos.map((x, i) => i).filter((i) => infos[i]?.loc === 'billiard' && !infos[i].event).sort((a, b) => key(a) - key(b));
  const busy = infos.filter((x) => x?.loc === 'billiard' && x.event).length;   // meja turnamen nggak diganggu
  const n = Math.min(want.length - (want.length % 2), CAP.billiard - busy);
  want.forEach((i, k) => {
    const x = infos[i];
    if (k >= n) { Object.assign(x, x.alt); delete x.alt; return; }
    const lawan = AGENTS[want[k ^ 1]]?.name ?? 'teman';
    Object.assign(x, { slot: k + busy, label: `Main billiard lawan ${lawan} (1 game 10 menit)` });
    delete x.alt;
  });
  return infos;
}

// waktu sholat (WITA) 5 menit; wudhu 7 gelombang @1 menit sebelumnya (4 keran × 7 = 28 orang, biar nggak rebutan)
const PRAYERS = [
  { name: 'Subuh', at: at(4, 40), len: 5 },
  { name: 'Dzuhur', at: at(12), len: 5 },
  { name: 'Ashar', at: at(15, 15), len: 5 },
  { name: 'Maghrib', at: at(18, 5), len: 5 },
  { name: 'Isya', at: at(19, 15), len: 5 },
];

function prayerAt(idx, agent, t) {
  const { dow, minutes: m } = t;
  const jumat = dow === 5;
  const male = agent.gender === 'm';
  // 7 gelombang wudhu @1 menit (maks 4 orang per gelombang, 4 keran) → abis wudhu duduk nunggu di musholla
  const wave = idx % 7;
  const wudhu = (start, label) => {
    const w0 = start - 7 + wave;
    if (m >= w0 && m < w0 + 1) return { act: 'pray', loc: 'wudhu', slot: Math.floor(idx / 7) % 4, label: `Wudhu dulu sebelum ${label}`, emoji: '💧' };
    if (m >= w0 + 1 && m < start) return { act: 'pray', loc: 'musholla', label: `Duduk nunggu ${label}`, emoji: '🕌', phase: 'duduk' };
    return null;
  };
  // Jumat: cowok Jumatan di musholla kantor (khotib & imam: Zamiir), cewek gantian Dzuhur setelahnya
  if (jumat && male) {
    const w = wudhu(at(11, 45), 'Jumatan');
    if (w) return w;
    if (m >= at(11, 45) && m < at(12, 5)) return agent.imam
      ? { act: 'pray', loc: 'mimbar', label: 'Khotbah Jumat di mimbar', emoji: '🎤' }
      : { act: 'pray', loc: 'musholla', label: 'Dengerin khotbah Jumat', emoji: '🕌', phase: 'duduk' };
    if (m >= at(12, 5) && m < at(12, 10)) return { act: 'pray', loc: 'musholla', label: agent.imam ? 'Imam Sholat Jumat' : 'Sholat Jumat', emoji: '🕌' };
  }
  if (jumat && !male) {
    const w = wudhu(at(12, 15), 'Dzuhur');
    if (w) return w;
    if (m >= at(12, 15) && m < at(12, 20)) return { act: 'pray', loc: 'musholla', label: 'Sholat Dzuhur (gantian abis Jumatan)', emoji: '🕌' };
  }
  for (const p of PRAYERS) {
    if (jumat && p.name === 'Dzuhur') continue;
    const w = wudhu(p.at, p.name);
    if (w) return w;
    if (m >= p.at && m < p.at + p.len) return { act: 'pray', loc: 'musholla', label: `Sholat ${p.name}`, emoji: '🕌' };
  }
  return null;
}

// jadwal pacaran Zamiir & Aprista (dua-duanya ngitung hal yang sama, jadi selalu ketemu di tempat yang sama)
function dateAt(t) {
  const m = t.minutes;
  const day = t.dayNum ?? t.dow;
  if (m < at(19, 30) || m >= at(21)) return null;
  const block = Math.floor(m / 20);
  if (hash(block * 1.7 + day * 3.3) > 0.7) return null;
  return hash(block * 5.1 + day) < 0.5
    ? (hash(block * 2.9 + day) < 0.5
      ? { loc: 'bossSofa', label: 'Pacaran di ruang boss 💕', emoji: '💕', slots: { owner: 0, sec: 1 }, pose: 'phone' }
      : { loc: 'cinema', label: 'Nonton berdua di bioskop mini 💕', emoji: '🍿', slots: CINE_SEAT })
    : { loc: 'cafe', label: 'Ngedate di cafe 💕', emoji: '💕', slots: { sec: 0, owner: 1 } };
}

// Mbak Sari (OB): bersih-bersih keliling, tapi juga ngopi, istirahat, makan, sholat, tidur
const ROOMS_CLEAN = ['cafe', 'santai', 'mkt', 'trd', 'yt', 'mushola', 'wudhu', 'meetM', 'meetT', 'meetY', 'boss', 'billiard', 'bioskop', 'dirRoom', 'tdirRoom', 'ydirRoom', 'teras', 'kolam', 'selasar2', 'selasar3'];
const ROOM_NAME = {
  cafe: 'cafe & resto', santai: 'ruang santai', mkt: 'bilik marketing', trd: 'bilik trading', billiard: 'ruang billiard',
  mushola: 'musholla', wudhu: 'tempat wudhu', meetM: 'ruang meeting', meetT: 'meeting trading', boss: 'ruang boss', bioskop: 'bioskop mini',
  dirRoom: 'ruang Andre', tdirRoom: 'ruang Mahendra', teras: 'teras depan', kolam: 'pinggir kolam',
  yt: 'bilik YouTube', meetY: 'meeting YouTube', ydirRoom: 'ruang Bagas',
  selasar2: 'selasar lantai 2', selasar3: 'selasar lantai 3',
};
function obAt(idx, agent, t, withMood, prayer) {
  const m = t.minutes;
  const day = t.dayNum ?? t.dow;
  const clean = (k, night = false) => {
    const room = ROOMS_CLEAN[Math.floor(hash(Math.floor(m / 25) * 2.9 + day * 7 + k) * ROOMS_CLEAN.length)];
    return withMood({ act: 'clean', loc: `clean:${room}`, label: `${night ? 'Bersih-bersih malam: ' : 'Bersihin '}${ROOM_NAME[room]}`, emoji: '🧹' });
  };
  if (prayer) return withMood(prayer);
  // jaga malam (22:00–05:10): gantian bersih-bersih, ngeteh, istirahat di gudang
  if (m >= at(22) || m < at(5, 10)) {
    const r = hash(Math.floor(m / 30) * 5.3 + day * 1.7);
    if (r < 0.3) return withMood({ act: 'break', loc: 'gudang', label: 'Istirahat di gudang sambil nonton HP', emoji: '📱' }, true);
    if (r < 0.45) return withMood({ act: 'coffee', loc: 'cafe', slot: 27, label: 'Ngeteh anget, jaga malam', emoji: '🍵' }, true);
    return clean(3, true);
  }
  if (m < at(5, 20)) return withMood({ act: 'work', loc: 'gudang', label: 'Ambil alat bersih-bersih di gudang', emoji: '🧺' });
  if (m < at(6)) return clean(1);
  if (m < at(6, 40)) return withMood({ act: 'work', loc: 'kitchen', label: 'Nyiapin sarapan & kopi', emoji: '🍳' });
  if (m < at(7)) return withMood({ act: 'lunch', loc: 'cafe', slot: 27, label: 'Sarapan', emoji: '🍞' });
  const coffee = at(9, 40) + Math.floor(hash(day * 1.3) * 40);
  if (m >= coffee && m < coffee + 15) return withMood({ act: 'coffee', loc: 'cafe', slot: 27, label: 'Ngopi dulu, pegel nyapu', emoji: '☕' });
  if (m >= at(12, 50) && m < at(13, 25)) return withMood({ act: 'lunch', loc: 'cafe', slot: 27, label: 'Makan siang (abis yang lain)', emoji: '🍛' });
  if (m >= at(13, 25) && m < at(14)) return withMood({ act: 'break', loc: 'cafe', slot: 27, label: 'Istirahat siang', emoji: '😌' });
  if (m >= at(18, 50) && m < at(19, 10)) return withMood({ act: 'lunch', loc: 'cafe', slot: 27, label: 'Makan malam', emoji: '🍜' });
  if (m >= at(19, 30) && m < at(21)) return withMood({ act: 'free', loc: 'cafe', slot: 27, label: 'Santai, nonton sinetron di HP', emoji: '📱' }, true);
  if (m >= at(21) && m < at(21, 40)) return withMood({ act: 'clean', loc: 'clean:cafe', label: 'Beres-beres cafe', emoji: '🧽' });
  if (m >= at(21, 40)) return withMood({ act: 'free', loc: 'gudang', label: 'Rapihin gudang, siap jaga malam', emoji: '🧺' });
  if (m >= at(14) && m < at(14, 40)) return withMood({ act: 'work', loc: 'gudang', label: 'Nyuci lap & kain pel', emoji: '🧺' });
  // jeda kecil: kadang duduk istirahat bentar
  if (hash(Math.floor(m / 30) * 4.1 + day) < 0.2 && m % 30 >= 20) return withMood({ act: 'break', loc: 'cafe', slot: 27, label: 'Duduk bentar, ngelap keringet', emoji: '😮‍💨' });
  return clean(2);
}

// act: work | meeting | pray | lunch | coffee | water | free | break | visit | clean | wait
// Prioritas: kerja asli dari database (tugas dadakan, termasuk lembur) > sholat > nunggu approval > jadwal harian > waktu luang acak.
// ctx.visit = { target, label } → lagi nyamperin meja teman; ctx.partnerBusy → pasangan lagi kerja (nggak ngedate)
// ctx.waitApproval → (manajer divisi) ada konten/plan divisinya yang nunggu ✅ Owner di Telegram
export function activityAt(idx, agent, t, real, ctx = {}) {
  const { dow, minutes: m } = t;
  const day = t.dayNum ?? dow; // variasi harian (mode simulasi: per hari dalam minggu)
  const j = (k, span) => Math.floor(hash(day * 13.37 + idx * 7.1 + k) * span); // jitter deterministik per orang per hari
  const withMood = (a, done = false) => ({ ...a, mood: a.act === 'off' ? { key: a.act, emoji: '', label: '' } : moodAt(idx, agent, t, done) });
  const working = real?.status === 'working';
  const busy = working || real?.status === 'waiting';
  const desk = deskLoc(agent);
  const trd = trading(agent), yt = youtube(agent), weekend = dow === 0 || dow === 6;
  const nyShift = trd && agent.nyShift && !weekend;
  const prayer = prayerAt(idx, agent, t);

  // kerja asli dari database menang (lembur malam pun tetap di meja), kecuali pas sholat
  if (working) {
    if (prayer) return withMood(prayer);
    const late = m < at(6, 30) || m >= at(20);
    if (ctx.visit && !late) return withMood({ act: 'visit', loc: 'visit', target: ctx.visit.target, label: ctx.visit.label, emoji: '🗣️' });
    return withMood({ act: 'work', loc: desk, label: late ? 'Lembur' : 'Kerja', emoji: late ? '🌙' : '💻', overtime: late });
  }
  if (agent.ob) return obAt(idx, agent, t, withMood, prayer);
  if (prayer) return withMood(prayer);
  // manajer divisi nunggu approval Owner: duduk di kursi tunggu depan ruang Bos sampai di-✅
  if (ctx.waitApproval && WAIT_SLOT[agent.id] != null) return withMood({ act: 'wait', loc: 'waitBoss', slot: WAIT_SLOT[agent.id], label: 'Nunggu approval Owner di depan ruang Bos', emoji: '⏳' });
  // ultah (tiup lilin di cafe) & event mingguan (turnamen, lomba, karaoke) — lihat social.js
  const soc = socialActivity(agent, t, AGENTS, seatOf(idx, agent));
  if (soc) return withMood(soc, true);

  // dini hari & pagi sebelum kerja: bebas (nggak ada yang tidur/pulang), sarapan 06:20–07:00
  if (m < at(7)) {
    if (m >= at(6, 20) + j(2, 15)) return withMood({ act: 'lunch', loc: 'cafe', slot: seatOf(idx, agent), label: 'Sarapan', emoji: '🍞' });
    return withMood(freeTime(idx, agent, t), true);
  }

  // tim Trading: pasar emas tutup Sabtu–Minggu. Sabtu pagi review mingguan, sisanya libur
  if (trd && weekend) {
    if (dow === 6 && m >= at(9) && m < at(10, 30)) return withMood({ act: 'meeting', loc: 'meetingT', slot: TRD_SEAT[agent.id], label: agent.id === 'teval' ? 'Presentasi evaluasi mingguan' : 'Review mingguan trading', emoji: '📊' });
    if (m >= at(12, 20) && m < at(12, 45) + j(5, 25)) return withMood({ act: 'lunch', loc: 'cafe', slot: seatOf(idx, agent), label: 'Makan siang', emoji: '🍛' });
    if (m >= at(18, 20) && m < at(18, 50) + j(6, 15)) return withMood({ act: 'lunch', loc: 'cafe', slot: seatOf(idx, agent), label: 'Makan malam', emoji: '🍜' });
    if (dow === 6 && m >= at(20) && m < at(22)) return withMood({ act: 'free', loc: 'cinema', slot: cineSeat(idx, agent), label: 'Nobar malam Minggu 🍿', emoji: '🍿' }, true);
    const f = freeTime(idx, agent, t);
    return withMood({ ...f, label: dow === 0 ? `${f.label} (pasar tutup)` : f.label }, true);
  }

  // tim YouTube: produksi tiap hari (tanpa libur sejak 19 Okt). 07:00 riset sendiri, 08:00 briefing di Meeting YouTube (Bagas pilih topik Shorts hari ini)
  if (yt && m < at(8)) return withMood({ act: 'work', loc: desk, label: RESEARCH[agent.id] ?? 'Riset pagi', emoji: '🔎' });
  if (yt && m < at(8, 30)) return withMood({ act: 'meeting', loc: 'meetingY', slot: YT_SEAT[agent.id], label: agent.id === 'ydir' ? 'Mimpin briefing Shorts' : 'Briefing: topik misteri hari ini', emoji: '🏺' });
  // tim Trading: 07:00 riset masing-masing, 08:00 briefing di Meeting Trading (Mahendra mimpin alur agent)
  if (trd && m < at(8)) return withMood({ act: 'work', loc: desk, label: RESEARCH[agent.id] ?? 'Siapin analisa pagi', emoji: '🔎' });
  if (trd && m < at(8, 30)) return withMood({ act: 'meeting', loc: 'meetingT', slot: TRD_SEAT[agent.id], label: agent.id === 'tdir' ? 'Mimpin briefing trading pagi' : 'Briefing trading: rencana XAU hari ini', emoji: '📈' });
  // Aprista: pagi nyiapin catatan keuangan di mejanya sendiri (ruang Bos)
  if (agent.sec && dow !== 1 && m < at(8)) return withMood({ act: 'work', loc: desk, label: 'Nyiapin catatan keuangan Bos', emoji: '🧾' });
  if (agent.sec && m < at(8, 30)) return withMood({ act: 'work', loc: desk, label: 'Rekap keuangan Bos kemarin', emoji: '🧾' });
  // pagi kerja: Senin rapat plan mingguan; Selasa–Minggu riset sendiri lalu briefing pitching ide bareng Bos
  if (dow === 1 && m < at(8)) return withMood({ act: 'meeting', loc: 'meeting', slot: MKT_SEAT[agent.id], label: 'Rapat plan konten mingguan', emoji: '🗓️' });
  if (dow !== 1 && m < at(8)) return withMood({ act: 'work', loc: desk, label: agent.boss ? 'Cek laporan pagi' : RESEARCH[agent.id] ?? 'Riset pagi', emoji: '🔎' });
  if (dow !== 1 && m < at(8, 30)) return withMood({ act: 'meeting', loc: 'meeting', slot: MKT_SEAT[agent.id], label: agent.boss ? 'Dengerin pitching ide tim' : 'Briefing: pitching ide konten', emoji: '💡' });
  if (ctx.visit) return withMood({ act: 'visit', loc: 'visit', target: ctx.visit.target, label: ctx.visit.label, emoji: '🗣️' });

  // makan: jam mulai & lamanya beda tiap hari; Zamiir & Aprista selalu semeja
  const jumat = dow === 5, male = agent.gender === 'm';
  const lunchEnd = at(12, 30) + j(5, 25);
  const eat = (label, emoji) => withMood({ act: 'lunch', loc: 'cafe', slot: seatOf(idx, agent), label: agent.partner ? `${label} bareng ${agent.boss ? 'Aprista' : 'Zamiir'} 💕` : label, emoji });
  if (jumat && male && m >= at(12, 10) && m < at(12, 50) + j(5, 15)) return eat('Makan siang abis Jumatan', '🍛');
  if (jumat && !male && m >= at(12, 20) && m < at(13) + j(5, 15)) return eat('Makan siang', '🍛');
  if (!jumat && m >= at(12, 5) && m < lunchEnd) return eat('Makan siang', '🍛');
  if (m >= at(18, 20) && m < at(18, 50) + j(6, 15)) return eat('Makan malam', '🍜');
  if (dow === 0 && yt && m >= at(16) && m < at(17)) return withMood({ act: 'meeting', loc: 'meetingY', slot: YT_SEAT[agent.id], label: 'Evaluasi mingguan Shorts', emoji: '📊' });
  if (dow === 0 && !agent.sec && !yt && m >= at(16) && m < at(17)) return withMood({ act: 'meeting', loc: 'meeting', slot: MKT_SEAT[agent.id], label: 'Evaluasi mingguan', emoji: '📊' });
  // jaga sesi New York (Mahendra, Wiratama, Selena): balik ke meja sampai ±22:00
  if (nyShift && m >= at(19, 40) && m < at(22, 10)) return withMood({ act: 'work', loc: desk, label: NY_TASK[agent.id], emoji: '🌙', overtime: true });
  // Sabtu malam: nobar bareng di bioskop mini
  if (dow === 6 && m >= at(20) && m < at(22)) return withMood({ act: 'free', loc: 'cinema', slot: cineSeat(idx, agent), label: agent.partner ? 'Nobar, duduk di love seat 💕' : 'Nobar malam Minggu 🍿', emoji: '🍿' }, true);

  // malam: pacaran (Zamiir & Aprista)
  if (agent.partner && !ctx.partnerBusy) {
    const d = dateAt(t);
    if (d) return withMood({ act: 'free', loc: d.loc, slot: d.slots[agent.id], label: d.label, emoji: d.emoji, pose: d.pose }, true);
  }

  const done = real?.status === 'done' || m >= at(19, 30) || (!busy && m >= doneAt(idx, agent, dow, day));
  if (done) return withMood(freeTime(idx, agent, t), true);

  // jeda kecil yang waktunya acak tiap hari (bukan jam pakem)
  const coffeeAt = at(9, 30) + j(10, 6 * 60); // sekali sehari antara 09:30–15:30
  if (hash(day * 3.1 + idx) < 0.7 && m >= coffeeAt && m < coffeeAt + 12 + j(11, 8)) return withMood({ act: 'coffee', loc: 'cafe', slot: seatOf(idx, agent), label: 'Ngopi bentar', emoji: '☕' });
  const rest = agent.boss || agent.sec ? 'bossSofa' : MGR.includes(agent.id) ? `${agent.id}Sofa` : idx < CAP.lounge ? 'lounge' : 'cafe';
  const restSlot = rest === 'lounge' ? idx : rest === 'cafe' ? seatOf(idx, agent) : agent.sec ? 1 : 0;
  const stretchAt = at(10) + j(7, 5 * 60);
  if (!busy && hash(day * 5.3 + idx) < 0.45 && m >= stretchAt && m < stretchAt + 8) return withMood({ act: 'break', loc: rest, slot: restSlot, label: 'Rebahan bentar, pegel', emoji: '🛋️' });

  const mood = moodAt(idx, agent, t, false);
  if (mood.burnout && !busy) return { act: 'break', loc: rest, slot: restSlot, label: 'Rehat bentar, lagi burnout', emoji: '🛋️', mood };

  const hour = Math.floor(m / 60);
  const mm = m % 60;
  const sip = 20 + j(8 + hour, 30);
  if (hash(hour * 7 + idx * 13 + day * 31) < 0.3 && mm >= sip && mm < sip + 5) return { act: 'water', loc: 'counter', slot: idx % CAP.counter, label: 'Ambil minum', emoji: '🥤', mood };

  if (agent.sec) return { act: 'work', loc: desk, label: pick(SEC_TASK, hash(hour + day)), emoji: '🧾', mood };
  return { act: 'work', loc: desk, label: 'Kerja', emoji: '💻', mood };
}

// Divisi mana yang lagi nunggu ✅ Owner (Telegram) → manajernya nunggu di depan ruang Bos.
// Marketing: plan mingguan draft / konten IG-TikTok pending / ada anggota status 'waiting' (mis. usulan boost Fahriah)
// YouTube: Shorts pending · Trading: usulan perbaikan Jihan belum di-"terapkan". Konten hari yang sudah lewat diabaikan.
export function approvalWaits({ campaign = null, contents = [], agents = [], proposals = [], today = null } = {}) {
  const team = Object.fromEntries(AGENTS.map((a) => [a.id, a.team]));
  const waiting = (tm) => agents.some((a) => a.status === 'waiting' && team[a.id] === tm);
  // ch = channel konten: null = Marketing, 'youtube' = Zataa History, 'story' = Zataa Story
  const pend = (ch) => contents.some((c) => c.status === 'pending_approval' && (ch ? c.channel === ch : !['youtube', 'story'].includes(c.channel)) && (!today || !c.day || c.day >= today));
  return {
    dir: campaign?.status === 'draft' || pend(null) || waiting('mkt'),
    ydir: pend('youtube') || waiting('yt'),
    tdir: proposals.length > 0 || waiting('trd'),
  };
}

// Gabungkan dengan status kerja asli dari database (state.json)
export function describe(agent, sched, real) {
  if (sched.act !== 'work' || sched.loc === 'counter') return sched;
  if (real?.status === 'waiting') return { ...sched, label: real.current_task ? `Nunggu approval: ${real.current_task}` : 'Nunggu approval Owner', emoji: '⏳' };
  if (sched.overtime) return { ...sched, label: real?.current_task ? `Lembur: ${real.current_task}` : 'Lembur', emoji: '🌙' };
  if (real?.status === 'working' && real.current_task) return { ...sched, label: real.current_task, emoji: '⚡' };
  if (sched.label !== 'Kerja') return sched;
  const idle = {
    dir: 'Pantau performa konten', sec: 'Nyatet keuangan Bos', researcher: 'Scroll tren & berita esport', copywriter: 'Nyusun bank ide caption',
    designer: 'Rapihin aset template', video: 'Cek referensi motion', publisher: 'Cek komentar & DM', ads: 'Pantau performa post & iklan',
    analyst: 'Ngulik data insight IG', price: 'Mantau harga di web', owner: 'Review konten & cek approval',
    tdir: 'Ngatur alur agent trading', tresearch: 'Pantau berita Fed, CPI, NFP', ttech: 'Analisa trend & S/R XAUUSD',
    trisk: 'Hitung entry, SL, TP & lot', texec: 'Pantau status order MT5', teval: 'Backtest perbaikan strategi', treport: 'Rekap performa trading',
    ydir: 'Review naskah & antrean Shorts', yresearch: 'Riset misteri kuno buat Shorts', yscript: 'Nulis naskah & cek fakta',
    yvisual: 'Nyusun visual adegan Shorts', yvideo: 'Edit Shorts 9:16 + voice-over', ypublish: 'Judul, deskripsi & tag YouTube',
  };
  return { ...sched, label: idle[agent.id] ?? 'Kerja', emoji: '💻' };
}

export function officeStatus(t, overtime = false) {
  const m = t.minutes;
  const night = m < at(4, 30) || m >= at(22, 30);
  if (night) return overtime ? { label: 'Lembur 🌙', tone: 'break' } : { label: 'Malam · nongkrong santai 🌙', tone: 'off' };
  if (m < at(4, 50)) return { label: 'Subuh 🕌', tone: 'break' };
  if (m < at(7)) return { label: 'Pagi · santai & sarapan', tone: 'break' };
  if (t.dow === 1 && m < at(8)) return { label: 'Rapat mingguan 🗓️', tone: 'on' };
  if (m < at(8)) return { label: 'Riset pagi 🔎', tone: 'on' };
  if (t.dow !== 1 && m < at(8, 30)) return { label: 'Briefing ide 💡', tone: 'on' };
  if (t.dow === 5 && m >= at(11, 40) && m < at(12, 20)) return { label: 'Jumatan 🕌', tone: 'break' };
  if (m >= at(11, 55) && m < at(13)) return { label: 'Istirahat & Ibadah', tone: 'break' };
  if (m >= at(15, 10) && m < at(15, 20)) return { label: 'Sholat Ashar', tone: 'break' };
  if (m >= at(18) && m < at(19)) return { label: 'Maghrib & Makan malam', tone: 'break' };
  if (m >= at(19, 10) && m < at(19, 20)) return { label: 'Sholat Isya', tone: 'break' };
  if (m >= at(19, 30)) return overtime ? { label: 'Lembur 🌙', tone: 'break' } : { label: 'Santai malam', tone: 'break' };
  return { label: 'Jam Kerja', tone: 'on' };
}
