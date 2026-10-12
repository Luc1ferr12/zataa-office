// Jadwal, aktivitas, dan mood pegawai — semuanya dihitung di browser dari jam WITA (0 token).
// Kantor jalan 24 jam: pegawai tinggal di mess (tidur malam, Subuh, mandi pagi), kerja 07:00–±19:30, malam santai.
// Tim Trading (XAUUSD) ikut jam pasar: Senin–Jumat, sebagian jaga sesi New York sampai malam; Sabtu review mingguan.
// Deterministik: jam yang sama selalu menghasilkan keadaan yang sama, jadi dashboard & kantor selalu sinkron.
import { CAP as SCENE_CAP } from './px/scene.js';

// desk = nomor meja di bilik (px/scene.js DESK_LIST: 0–7 Marketing, 8–13 Trading)
export const AGENTS = [
  { id: 'dir',        name: 'Andre',     avatar: '#2b4c7e', title: 'Marketing Director',     gender: 'm', team: 'mkt', lead: true, commute: true },
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
];
// tampilan tiap orang (sprite pixel) ada di js/px/sprites.js, versi 3D di blender/toy_lib.py

const DOW = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
// kapasitas tempat (dari px/scene.js) — yang nomor urutnya lewat kapasitas pilih tempat lain
const CAP = SCENE_CAP;
// kasur (px/scene.js S.bed): 0–9 mess cewek, 10–17 mess cowok, 18–19 king bed Zamiir & Aprista
// Andre (commute) belum dapet kasur → pulang ke rumah tiap sore
const BED_SLOT = {
  researcher: 0, copywriter: 1, designer: 2, ads: 3, ob: 4, tresearch: 5, ttech: 6, teval: 7, treport: 8,
  video: 10, publisher: 11, analyst: 12, price: 13, tdir: 14, texec: 15, trisk: 16,
  sec: 18, owner: 19,
};
const BED = (idx, agent) => BED_SLOT[agent.id] ?? idx;
const LUNCH_SEAT = { sec: 0, owner: 1, ob: 27 }; // Zamiir & Aprista semeja (meja cafe pertama)
const seatOf = (idx, agent) => LUNCH_SEAT[agent.id] ?? 4 + idx;
// bioskop: baris belakang kursi 16–17 = love seat Zamiir & Aprista
const CINE_SEAT = { owner: 16, sec: 17 };
const cineSeat = (idx, agent) => CINE_SEAT[agent.id] ?? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 18, 19][idx % 18];
// urutan mandi pagi per kamar mandi (3 shower pria, 3 shower wanita)
const BATH_RANK = {};
for (const g of ['m', 'f']) AGENTS.filter((a) => a.gender === g && !a.ob).forEach((a, i) => { BATH_RANK[a.id] = i; });
const deskLoc = (agent) => (agent.boss || agent.sec ? 'boss' : agent.id === 'dir' ? 'dirDesk' : agent.id === 'tdir' ? 'tdirDesk' : 'desk');
const trading = (agent) => agent.team === 'trd';
const RESEARCH = {
  dir: 'Siapin bahan briefing', researcher: 'Riset tren & berita esport', copywriter: 'Riset hook & caption viral',
  designer: 'Cari referensi desain', video: 'Cari referensi video', publisher: 'Cek jam tayang terbaik',
  ads: 'Riset iklan kompetitor', analyst: 'Rekap data kemarin', price: 'Cek harga web & kompetitor',
  tdir: 'Cek status semua agent trading', tresearch: 'Baca kalender ekonomi & berita USD', ttech: 'Scan chart XAUUSD multi-timeframe',
  trisk: 'Cek limit risiko & ekuitas', texec: 'Cek koneksi EA MT5', teval: 'Evaluasi trade kemarin', treport: 'Siapin laporan pagi',
};
// Aprista numpang komputer Bos: gantian per 30 menit (deterministik, jadi dua-duanya sepakat siapa yang pegang PC)
const secTurn = (t) => hash(Math.floor(t.minutes / 30) * 2.3 + (t.dayNum ?? t.dow) * 5.7) < 0.45;
const SEC_TASK = ['Nyatet pengeluaran Bos', 'Rekap uang masuk & keluar', 'Cek tagihan bulanan Bos', 'Rapihin catatan keuangan'];
const NY_TASK = { tdir: 'Jaga sesi New York', texec: 'Pantau order sesi New York', treport: 'Laporan sesi New York' };
// kursi rapat: Marketing (10 kursi), Trading (8 kursi)
const MKT_SEAT = { owner: 8, dir: 9, researcher: 0, copywriter: 1, designer: 2, video: 3, publisher: 4, ads: 5, analyst: 6, price: 7 };
const TRD_SEAT = { tdir: 6, tresearch: 0, ttech: 1, trisk: 2, texec: 3, teval: 4, treport: 5 };

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
  const MT = trading(agent) ? MOOD_TEXT_TRD : MOOD_TEXT;
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

function freeTime(idx, agent, t) {
  const m = t.minutes;
  const r = hash(Math.floor(m / 25) * 3.3 + idx * 17.9 + (t.dayNum ?? t.dow) * 101.1);
  const canSwim = agent.gender === 'm' && m >= at(9) && m < at(17, 45);
  if (agent.boss) {
    // boss santainya di ruangannya sendiri, terasnya, cafe, atau kolam
    const b = [['bossSofa', 'Santai di ruang boss', '🛋️'], ['terasBoss', 'Rebahan di teras', '🌤️'], ['cafe', 'Ngopi santai', '☕'], ...(canSwim ? [['pool', 'Berenang', '🏊']] : [])];
    const [loc, label, emoji] = pick(b, r);
    return { act: 'free', loc, label, emoji, slot: loc === 'cafe' ? seatOf(idx, agent) : 0 };
  }
  const night = m >= at(19, 30) || m < at(6);
  // tiap tempat punya urutan duduk sendiri biar nggak numpuk
  const order = (loc) => (loc === 'cafe' ? seatOf(idx, agent) : loc === 'cinema' ? cineSeat(idx, agent) : idx);
  const capOf = (loc) => CAP[loc === 'game' ? 'lounge' : loc] ?? 99;
  const opts = [
    ['cafe', 'Ngopi santai', '☕'],
    ['lounge', night ? 'Nonton TV bareng' : 'Rebahan sambil scroll HP', night ? '📺' : '📱'],
    ['game', 'Mabar di ruang santai', '🎮'],
    ...(night ? [['cinema', 'Nonton film di bioskop mini', '🍿']] : [['lounger', 'Santai di pinggir kolam', '🕶️']]),
    ['garden', night ? 'Ngobrol di gazebo, liat bintang' : 'Ngadem di gazebo taman', night ? '🌙' : '🌿'],
    ['gardenTop', 'Nyantai di taman atas', '🌳'],
  ].filter(([loc]) => order(loc) < capOf(loc));
  if (canSwim) opts.push(['pool', 'Berenang', '🏊'], ['pool', 'Berenang', '🏊']);
  const [loc, label, emoji] = pick(opts, r);
  return { act: 'free', loc, label, emoji, slot: order(loc) };
}

// waktu sholat (WITA) 5 menit; wudhu 5 gelombang @1 menit sebelumnya (biar keran nggak rebutan)
const PRAYERS = [
  { name: 'Subuh', at: at(4, 40), len: 5 },
  { name: 'Dzuhur', at: at(12), len: 5 },
  { name: 'Ashar', at: at(15, 15), len: 5 },
  { name: 'Maghrib', at: at(18, 5), len: 5 },
  { name: 'Isya', at: at(19, 15), len: 5 },
];

function prayerAt(idx, agent, t, present) {
  const { dow, minutes: m } = t;
  const jumat = dow === 5;
  const male = agent.gender === 'm';
  // 5 gelombang wudhu @1 menit (maks 4 orang per gelombang, 4 keran) → abis wudhu duduk nunggu di musholla
  const wave = idx % 5;
  const wudhu = (start, label) => {
    const w0 = start - 5 + wave;
    if (m >= w0 && m < w0 + 1) return { act: 'pray', loc: 'wudhu', slot: Math.floor(idx / 5) % 4, label: `Wudhu dulu sebelum ${label}`, emoji: '💧' };
    if (m >= w0 + 1 && m < start) return { act: 'pray', loc: 'musholla', label: `Duduk nunggu ${label}`, emoji: '🕌', phase: 'duduk' };
    return null;
  };
  if (!present) return null;
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
const ROOMS_CLEAN = ['cafe', 'santai', 'mkt', 'trd', 'kmW', 'kmP', 'mushola', 'wudhu', 'meetM', 'meetT', 'boss', 'lobby', 'bioskop', 'messF', 'messM', 'king', 'dirRoom', 'tdirRoom', 'teras', 'kolam', 'toilet', 'selasar2'];
const ROOM_NAME = {
  cafe: 'cafe & resto', santai: 'ruang santai', mkt: 'bilik marketing', trd: 'bilik trading', kmW: 'kamar mandi cewek', kmP: 'kamar mandi cowok',
  mushola: 'musholla', wudhu: 'tempat wudhu', meetM: 'ruang meeting', meetT: 'meeting trading', boss: 'ruang boss', lobby: 'lobby', bioskop: 'bioskop mini',
  messF: 'mess cewek', messM: 'mess cowok', king: 'kamar bos', dirRoom: 'ruang Andre', tdirRoom: 'ruang Mahendra', teras: 'teras depan', kolam: 'pinggir kolam',
  toilet: 'toilet umum', selasar2: 'selasar lantai 2',
};
function obAt(idx, agent, t, withMood, prayer) {
  const m = t.minutes;
  const day = t.dayNum ?? t.dow;
  const clean = (k) => {
    const room = ROOMS_CLEAN[Math.floor(hash(Math.floor(m / 25) * 2.9 + day * 7 + k) * ROOMS_CLEAN.length)];
    return withMood({ act: 'clean', loc: `clean:${room}`, label: `Bersihin ${ROOM_NAME[room]}`, emoji: '🧹' });
  };
  if (m < at(4, 15) || m >= at(22)) return withMood({ act: 'sleep', loc: 'bed', slot: BED(idx, agent), label: 'Tidur', emoji: '💤' });
  if (m < at(4, 30)) return withMood({ act: 'free', loc: 'sink', slot: 1, label: 'Bangun, cuci muka', emoji: '🚿' });
  if (prayer) return withMood(prayer);
  if (m < at(5, 10)) return withMood({ act: 'free', loc: 'mandi', slot: 2, label: 'Mandi duluan sebelum yang lain bangun', emoji: '🚿' });
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
  if (m >= at(21) && m < at(21, 40)) return withMood({ act: 'clean', loc: 'clean:cafe', label: 'Beres-beres cafe sebelum tidur', emoji: '🧽' });
  if (m >= at(14) && m < at(14, 40)) return withMood({ act: 'clean', loc: 'clean:laundry', label: 'Nyuci & jemur baju anak-anak', emoji: '🧺' });
  if (m >= at(21, 40)) return withMood({ act: 'free', loc: 'sink', slot: 1, label: 'Sikat gigi, siap tidur', emoji: '🪥' });
  // jeda kecil: kadang duduk istirahat bentar
  if (hash(Math.floor(m / 30) * 4.1 + day) < 0.2 && m % 30 >= 20) return withMood({ act: 'break', loc: 'cafe', slot: 27, label: 'Duduk bentar, ngelap keringet', emoji: '😮‍💨' });
  return clean(2);
}

// act: sleep | work | meeting | pray | lunch | coffee | water | free | break | visit | clean | off
// Prioritas: sholat > kerja asli dari database (termasuk lembur) > jadwal harian > simulasi.
// ctx.visit = { target, label } → lagi nyamperin meja teman; ctx.partnerBusy → pasangan lagi kerja (nggak ngedate)
export function activityAt(idx, agent, t, real, ctx = {}) {
  const { dow, minutes: m } = t;
  const day = t.dayNum ?? dow; // variasi harian (mode simulasi: per hari dalam minggu)
  const j = (k, span) => Math.floor(hash(day * 13.37 + idx * 7.1 + k) * span); // jitter deterministik per orang per hari
  const withMood = (a, done = false) => ({ ...a, mood: ['off', 'sleep'].includes(a.act) ? { key: a.act, emoji: '', label: '' } : moodAt(idx, agent, t, done) });
  const working = real?.status === 'working';
  const busy = working || real?.status === 'waiting';
  const desk = deskLoc(agent);
  const trd = trading(agent), weekend = dow === 0 || dow === 6;
  const nyShift = trd && agent.nyShift && !weekend;

  // semua tinggal di mess; Zamiir & Aprista sekamar, jadi jam tidur & bangunnya barengan.
  // Andre belum dapet kasur: dateng pagi, pulang ke rumah sore
  const arrive = at(6, 40) + j(12, 15), leave = at(17, 30) + j(13, 40);
  const bossHome = agent.commute && (m < arrive || m >= leave);
  const jj = agent.partner ? (k, span) => Math.floor(hash(day * 13.37 + 0.5 + k) * span) : j;
  const wake = at(4, 25) + jj(3, 8);
  const bed = (nyShift ? at(22, 40) : at(22)) + jj(4, nyShift ? 50 : 90);
  const asleep = m < wake || m >= bed;
  const prayer = prayerAt(idx, agent, t, !bossHome && !asleep);

  // kerja asli dari database menang (lembur malam pun tetap di meja), kecuali pas sholat
  if (working) {
    if (prayer) return withMood(prayer);
    const late = m < at(6, 30) || m >= at(20);
    if (ctx.visit && !late) return withMood({ act: 'visit', loc: 'visit', target: ctx.visit.target, label: ctx.visit.label, emoji: '🗣️' });
    return withMood({ act: 'work', loc: desk, label: late ? 'Lembur' : 'Kerja', emoji: late ? '🌙' : '💻', overtime: late });
  }
  if (agent.ob) return obAt(idx, agent, t, withMood, prayer);
  if (bossHome) return withMood({ act: 'off', loc: 'out', label: m < at(12) ? 'Otw kantor' : 'Pulang ke rumah', emoji: '🏠' });
  if (asleep) return withMood({ act: 'sleep', loc: 'bed', slot: BED(idx, agent), label: 'Tidur', emoji: '💤' });
  if (prayer) return withMood(prayer);
  if (m < at(4, 40)) return withMood({ act: 'sleep', loc: 'bed', slot: BED(idx, agent), label: 'Melek, ngumpulin nyawa buat Subuh', emoji: '🥱' });

  // pagi: abis Subuh tidur lagi / santai → mandi gantian (3 shower pria, 3 shower wanita) → sarapan
  if (agent.commute && m < at(7)) return withMood({ act: 'coffee', loc: 'cafe', slot: seatOf(idx, agent), label: 'Baru nyampe, ngopi dulu', emoji: '☕' });
  if (m < at(7)) {
    const rank = BATH_RANK[agent.id] ?? idx;
    const bath = at(5, 35) + Math.floor(rank / 3) * 13;
    if (m >= bath && m < bath + 11) return withMood({ act: 'free', loc: 'mandi', slot: rank % 3, label: 'Mandi pagi', emoji: '🚿' });
    if (m >= at(6, 20)) return withMood({ act: 'lunch', loc: 'cafe', slot: seatOf(idx, agent), label: 'Sarapan', emoji: '🍞' });
    if (m < bath) return hash(day + idx * 3.7) < 0.55
      ? withMood({ act: 'sleep', loc: 'bed', slot: BED(idx, agent), label: 'Tidur lagi bentar abis Subuh', emoji: '💤' })
      : withMood({ act: 'free', loc: idx < CAP.lounge ? 'lounge' : 'cafe', slot: idx < CAP.lounge ? idx : seatOf(idx, agent), label: 'Nunggu giliran mandi', emoji: '📱' });
    return withMood({ act: 'free', loc: 'cafe', slot: seatOf(idx, agent), label: 'Ngeteh pagi', emoji: '🍵' });
  }

  // tim Trading: pasar emas tutup Sabtu–Minggu. Sabtu pagi review mingguan, sisanya libur
  if (trd && weekend) {
    if (dow === 6 && m >= at(9) && m < at(10, 30)) return withMood({ act: 'meeting', loc: 'meetingT', slot: TRD_SEAT[agent.id], label: agent.id === 'teval' ? 'Presentasi evaluasi mingguan' : 'Review mingguan trading', emoji: '📊' });
    if (m >= at(12, 20) && m < at(12, 45) + j(5, 25)) return withMood({ act: 'lunch', loc: 'cafe', slot: seatOf(idx, agent), label: 'Makan siang', emoji: '🍛' });
    if (m >= at(18, 20) && m < at(18, 50) + j(6, 15)) return withMood({ act: 'lunch', loc: 'cafe', slot: seatOf(idx, agent), label: 'Makan malam', emoji: '🍜' });
    if (m >= bed - 12) return withMood({ act: 'free', loc: 'sink', slot: idx % 2, label: 'Sikat gigi, siap tidur', emoji: '🪥' }, true);
    if (dow === 6 && m >= at(20) && m < at(22)) return withMood({ act: 'free', loc: 'cinema', slot: cineSeat(idx, agent), label: 'Nobar malam Minggu 🍿', emoji: '🍿' }, true);
    const f = freeTime(idx, agent, t);
    return withMood({ ...f, label: dow === 0 ? `${f.label} (pasar tutup)` : f.label }, true);
  }

  // tim Trading: 07:00 riset masing-masing, 08:00 briefing di Meeting Trading (Mahendra mimpin alur agent)
  if (trd && m < at(8)) return withMood({ act: 'work', loc: desk, label: RESEARCH[agent.id] ?? 'Siapin analisa pagi', emoji: '🔎' });
  if (trd && m < at(8, 30)) return withMood({ act: 'meeting', loc: 'meetingT', slot: TRD_SEAT[agent.id], label: agent.id === 'tdir' ? 'Mimpin briefing trading pagi' : 'Briefing trading: rencana XAU hari ini', emoji: '📈' });
  // Aprista: pas Bos rapat/briefing pagi, komputer Bos dia yang pakai (Bos riset pagi di PC → Aprista di sofa)
  if (agent.sec && dow !== 1 && m < at(8)) return withMood({ act: 'free', loc: 'bossSofa', slot: 1, label: 'Nyiapin catatan keuangan di HP', emoji: '📱' });
  if (agent.sec && m < at(8, 30)) return withMood({ act: 'work', loc: desk, label: 'Rekap keuangan Bos kemarin', emoji: '🧾' });
  // pagi kerja: Senin rapat plan mingguan; Selasa–Minggu riset sendiri lalu briefing pitching ide bareng Bos
  if (dow === 1 && m < at(8)) return withMood({ act: 'meeting', loc: 'meeting', slot: MKT_SEAT[agent.id], label: 'Rapat plan konten mingguan', emoji: '🗓️' });
  if (dow !== 1 && m < at(8)) return withMood({ act: 'work', loc: desk, label: agent.boss ? 'Cek laporan pagi' : RESEARCH[agent.id] ?? 'Riset pagi', emoji: '🔎' });
  if (dow !== 1 && m < at(8, 30)) return withMood({ act: 'meeting', loc: 'meeting', slot: MKT_SEAT[agent.id], label: agent.boss ? 'Dengerin pitching ide tim' : 'Briefing: pitching ide konten', emoji: '💡' });
  if (ctx.visit) return withMood({ act: 'visit', loc: 'visit', target: ctx.visit.target, label: ctx.visit.label, emoji: '🗣️' });

  // makan: jam mulai & lamanya beda tiap hari; Zamiir & Aprista selalu semeja
  const seat = LUNCH_SEAT[agent.id];
  const jumat = dow === 5, male = agent.gender === 'm';
  const lunchEnd = at(12, 30) + j(5, 25);
  const eat = (label, emoji) => withMood({ act: 'lunch', loc: 'cafe', slot: seatOf(idx, agent), label: agent.partner ? `${label} bareng ${agent.boss ? 'Aprista' : 'Zamiir'} 💕` : label, emoji });
  if (jumat && male && m >= at(12, 10) && m < at(12, 50) + j(5, 15)) return eat('Makan siang abis Jumatan', '🍛');
  if (jumat && !male && m >= at(12, 20) && m < at(13) + j(5, 15)) return eat('Makan siang', '🍛');
  if (!jumat && m >= at(12, 5) && m < lunchEnd) return eat('Makan siang', '🍛');
  if (m >= at(18, 20) && m < at(18, 50) + j(6, 15)) return eat('Makan malam', '🍜');
  if (dow === 0 && !agent.sec && m >= at(16) && m < at(17)) return withMood({ act: 'meeting', loc: 'meeting', slot: MKT_SEAT[agent.id], label: 'Evaluasi mingguan', emoji: '📊' });
  // jaga sesi New York (Mahendra, Wiratama, Selena): balik ke meja sampai ±22:00
  if (nyShift && m >= at(19, 40) && m < at(22, 10)) return withMood({ act: 'work', loc: desk, label: NY_TASK[agent.id], emoji: '🌙', overtime: true });
  // Sabtu malam: nobar bareng di bioskop mini
  if (dow === 6 && m >= at(20) && m < at(22)) return withMood({ act: 'free', loc: 'cinema', slot: cineSeat(idx, agent), label: agent.partner ? 'Nobar, duduk di love seat 💕' : 'Nobar malam Minggu 🍿', emoji: '🍿' }, true);

  // malam: pacaran (Zamiir & Aprista), sebelum tidur sikat gigi
  if (agent.partner && !ctx.partnerBusy) {
    const d = dateAt(t);
    if (d) return withMood({ act: 'free', loc: d.loc, slot: d.slots[agent.id], label: d.label, emoji: d.emoji, pose: d.pose }, true);
  }
  if (m >= bed - 12) return withMood({ act: 'free', loc: 'sink', slot: idx % 2, label: 'Sikat gigi, siap tidur', emoji: '🪥' }, true);

  const done = real?.status === 'done' || m >= at(19, 30) || (!busy && m >= doneAt(idx, agent, dow, day));
  if (done) return withMood(freeTime(idx, agent, t), true);

  // jeda kecil yang waktunya acak tiap hari (bukan jam pakem)
  const toiletAt = at(9) + j(9, 9 * 60);
  if (!agent.boss && m >= toiletAt && m < toiletAt + 6) return withMood({ act: 'break', loc: 'toilet', slot: idx % 3, label: 'Ke kamar mandi bentar', emoji: '🚻' });
  const coffeeAt = at(9, 30) + j(10, 6 * 60); // sekali sehari antara 09:30–15:30
  if (hash(day * 3.1 + idx) < 0.7 && m >= coffeeAt && m < coffeeAt + 12 + j(11, 8)) return withMood({ act: 'coffee', loc: 'cafe', slot: seatOf(idx, agent), label: 'Ngopi bentar', emoji: '☕' });
  const rest = agent.boss || agent.sec ? 'bossSofa' : agent.id === 'dir' ? 'dirSofa' : agent.id === 'tdir' ? 'tdirSofa' : idx < CAP.lounge ? 'lounge' : 'cafe';
  const restSlot = rest === 'lounge' ? idx : rest === 'cafe' ? seatOf(idx, agent) : 0;
  const stretchAt = at(10) + j(7, 5 * 60);
  if (!busy && hash(day * 5.3 + idx) < 0.45 && m >= stretchAt && m < stretchAt + 8) return withMood({ act: 'break', loc: rest, slot: restSlot, label: 'Rebahan bentar, pegel', emoji: '🛋️' });

  const mood = moodAt(idx, agent, t, false);
  if (mood.burnout && !busy) return { act: 'break', loc: rest, slot: restSlot, label: 'Rehat bentar, lagi burnout', emoji: '🛋️', mood };

  const hour = Math.floor(m / 60);
  const mm = m % 60;
  const sip = 20 + j(8 + hour, 30);
  if (hash(hour * 7 + idx * 13 + day * 31) < 0.3 && mm >= sip && mm < sip + 5) return { act: 'water', loc: 'counter', slot: idx % CAP.counter, label: 'Ambil minum', emoji: '🥤', mood };

  // komputer Bos gantian: yang nggak pegang PC kerja dari sofa ruang boss
  if (agent.sec) return secTurn(t)
    ? { act: 'work', loc: desk, label: pick(SEC_TASK, hash(hour + day)), emoji: '🧾', mood }
    : { act: 'free', loc: 'bossSofa', slot: 1, label: 'Gantian komputer, nyatet di HP', emoji: '📱', mood };
  if (agent.boss && secTurn(t)) return { act: 'free', loc: 'bossSofa', slot: 0, label: 'Gantian komputer sama Aprista', emoji: '📱', mood };
  return { act: 'work', loc: desk, label: 'Kerja', emoji: '💻', mood };
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
  };
  return { ...sched, label: idle[agent.id] ?? 'Kerja', emoji: '💻' };
}

export function officeStatus(t, overtime = false) {
  const m = t.minutes;
  const night = m < at(4, 25) || m >= at(22, 30);
  if (night) return overtime ? { label: 'Lembur 🌙', tone: 'break' } : { label: 'Malam · tim tidur 💤', tone: 'off' };
  if (m < at(4, 45)) return { label: 'Subuh 🕌', tone: 'break' };
  if (m < at(7)) return { label: 'Pagi · mandi & sarapan', tone: 'break' };
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
