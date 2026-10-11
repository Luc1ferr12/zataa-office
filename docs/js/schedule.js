// Jadwal, aktivitas, dan mood pegawai — semuanya dihitung di browser dari jam WITA (0 token).
// Kantor jalan 24 jam: pegawai tinggal di mess (tidur malam, Subuh, mandi pagi), kerja 07:00–±19:30, malam santai.
// Deterministik: jam yang sama selalu menghasilkan keadaan yang sama, jadi dashboard & kantor selalu sinkron.

export const AGENTS = [
  { id: 'dir',        name: 'Aprista',   avatar: '#8a5a3c', title: 'Marketing Director',     gender: 'f', partner: 'owner' },
  { id: 'researcher', name: 'Clariana',  avatar: '#6b4fd8', title: 'Researcher',             gender: 'f' },
  { id: 'copywriter', name: 'Ista',      avatar: '#2f6b65', title: 'Copywriter',             gender: 'f' },
  { id: 'designer',   name: 'Maria',     avatar: '#c0668a', title: 'Graphic Designer',       gender: 'f' },
  { id: 'video',      name: 'Dimas',     avatar: '#7a3b3b', title: 'Video Production',       gender: 'm' },
  { id: 'publisher',  name: 'Fikri',     avatar: '#33415c', title: 'Social Media Publisher', gender: 'm' },
  { id: 'ads',        name: 'Fahriah',   avatar: '#0d9488', title: 'Ads Specialist',         gender: 'f' },
  { id: 'analyst',    name: 'Raka',      avatar: '#475569', title: 'Data Analyst',           gender: 'm' },
  { id: 'price',      name: 'Nadia',     avatar: '#d97706', title: 'Price Watcher',          gender: 'f' },
  { id: 'owner',      name: 'Zamiir',    avatar: '#5b1fd6', title: 'Owner / Boss',           gender: 'm', boss: true, imam: true, partner: 'dir' },
  { id: 'ob',         name: 'Mbak Sari', avatar: '#3d7ea6', title: 'Office Girl',            gender: 'f', ob: true },
];
// tampilan tiap orang (sprite pixel) ada di js/px/sprites.js

const DOW = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
// kapasitas tempat (sinkron dengan px/scene.js CAP) — yang nomor urutnya lewat kapasitas pilih tempat lain
const CAP = { lounge: 9, garden: 8, lounger: 7, counter: 8 };
const BED = (idx, agent) => (agent.ob ? 9 : idx); // 10 kasur: 9 pegawai + Mbak Sari
const LUNCH_SEAT = { dir: 10, owner: 11, ob: 0 }; // Zamiir & Aprista semeja

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
  }[agent.id] ?? at(15);
  return base + Math.floor(hash(day * 7.7 + idx) * 60) - 25; // tiap hari beda ±30 menit
}

const MOOD_TEXT = {
  marah: ['PC nge-hang pas render!!', 'Wifi lemot banget', 'File kehapus 😭'],
  kesel: ['Revisi lagi…', 'Render error mulu', 'Ide lagi buntu', 'Notif grup ga berhenti'],
  senang: ['Konten kemarin rame!', 'Dapet ide bagus', 'Kerjaan lancar jaya'],
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
  if (r < 0.05) mood = { key: 'marah', emoji: '😡', label: pick(MOOD_TEXT.marah, r2) };
  else if (r < 0.17) mood = { key: 'kesel', emoji: '😤', label: pick(MOOD_TEXT.kesel, r2) };
  else if (r < 0.27) mood = { key: 'senang', emoji: '😄', label: pick(MOOD_TEXT.senang, r2) };
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
    // boss santainya di ruangannya sendiri, cafe, atau kolam
    const b = [['bossSofa', 'Santai di ruang boss', '🛋️'], ['cafe', 'Ngopi santai', '☕'], ...(canSwim ? [['pool', 'Berenang', '🏊']] : [])];
    const [loc, label, emoji] = pick(b, r);
    return { act: 'free', loc, label, emoji };
  }
  const night = m >= at(19, 30) || m < at(6);
  const opts = [
    ['cafe', 'Ngopi santai', '☕'],
    ['lounge', night ? 'Nonton TV bareng' : 'Rebahan sambil scroll HP', night ? '📺' : '📱'],
    ['game', 'Mabar di ruang santai', '🎮'],
    ...(night ? [] : [['lounger', 'Santai di pinggir kolam', '🕶️']]),
    ['garden', night ? 'Ngobrol di taman, liat bintang' : 'Ngadem di taman', night ? '🌙' : '🌿'],
  ].filter(([loc]) => idx < (CAP[loc === 'game' ? 'lounge' : loc] ?? 99));
  if (canSwim) opts.push(['pool', 'Berenang', '🏊'], ['pool', 'Berenang', '🏊']);
  const [loc, label, emoji] = pick(opts, r);
  return { act: 'free', loc, label, emoji };
}

// waktu sholat (WITA) + wudhu 9 menit sebelumnya (dibagi 3 gelombang biar keran nggak rebutan)
const PRAYERS = [
  { name: 'Subuh', at: at(4, 40), len: 15 },
  { name: 'Dzuhur', at: at(12), len: 20 },
  { name: 'Ashar', at: at(15, 15), len: 15 },
  { name: 'Maghrib', at: at(18, 5), len: 15 },
  { name: 'Isya', at: at(19, 15), len: 15 },
];

function prayerAt(idx, agent, t, present) {
  const { dow, minutes: m } = t;
  const jumat = dow === 5;
  const male = agent.gender === 'm';
  // 3 gelombang wudhu @3 menit (maks 4 orang per gelombang, 5 keran) → abis wudhu duduk nunggu di musholla
  const wave = idx % 3;
  const wudhu = (start, label) => {
    const w0 = start - 9 + wave * 3;
    if (m >= w0 && m < w0 + 3) return { act: 'pray', loc: 'wudhu', slot: Math.floor(idx / 3) % 5, label: `Wudhu dulu sebelum ${label}`, emoji: '💧' };
    if (m >= w0 + 3 && m < start) return { act: 'pray', loc: 'musholla', label: `Duduk nunggu ${label}`, emoji: '🕌', phase: 'duduk' };
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
    if (m >= at(12, 5) && m < at(12, 25)) return { act: 'pray', loc: 'musholla', label: agent.imam ? 'Imam Sholat Jumat' : 'Sholat Jumat', emoji: '🕌' };
  }
  if (jumat && !male) {
    const w = wudhu(at(12, 25), 'Dzuhur');
    if (w) return w;
    if (m >= at(12, 25) && m < at(12, 45)) return { act: 'pray', loc: 'musholla', label: 'Sholat Dzuhur (gantian abis Jumatan)', emoji: '🕌' };
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
    ? { loc: 'bossSofa', label: 'Pacaran di ruang boss 💕', emoji: '💕', slots: { owner: 0, dir: 1 }, pose: 'phone' }
    : { loc: 'cafe', label: 'Ngedate di cafe 💕', emoji: '💕', slots: { dir: 10, owner: 11 } };
}

// Mbak Sari (OB): bersih-bersih keliling, tapi juga ngopi, istirahat, makan, sholat, tidur
const ROOMS_CLEAN = ['cafe', 'lounge', 'kerja', 'kerja2', 'kamarmandi', 'musholla', 'wudhu', 'meeting', 'boss', 'teras', 'kolam', 'mess'];
const ROOM_NAME = { cafe: 'cafe', lounge: 'ruang santai', kerja: 'ruang kerja', kerja2: 'ruang kerja', kamarmandi: 'kamar mandi', musholla: 'musholla', wudhu: 'tempat wudhu', meeting: 'ruang meeting', boss: 'ruang boss', teras: 'teras', kolam: 'pinggir kolam', mess: 'mess' };
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
  if (m < at(5, 10)) return withMood({ act: 'free', loc: 'toilet', slot: 2, label: 'Mandi duluan sebelum yang lain bangun', emoji: '🚿' });
  if (m < at(6)) return clean(1);
  if (m < at(6, 40)) return withMood({ act: 'work', loc: 'counter', slot: 7, label: 'Nyiapin sarapan & kopi', emoji: '🍳' });
  if (m < at(7)) return withMood({ act: 'lunch', loc: 'cafe', slot: 0, label: 'Sarapan', emoji: '🍞' });
  const coffee = at(9, 40) + Math.floor(hash(day * 1.3) * 40);
  if (m >= coffee && m < coffee + 15) return withMood({ act: 'coffee', loc: 'cafe', slot: 9, label: 'Ngopi dulu, pegel nyapu', emoji: '☕' });
  if (m >= at(12, 50) && m < at(13, 25)) return withMood({ act: 'lunch', loc: 'cafe', slot: 0, label: 'Makan siang (abis yang lain)', emoji: '🍛' });
  if (m >= at(13, 25) && m < at(14)) return withMood({ act: 'break', loc: 'cafe', slot: 9, label: 'Istirahat siang', emoji: '😌' });
  if (m >= at(18, 50) && m < at(19, 10)) return withMood({ act: 'lunch', loc: 'cafe', slot: 0, label: 'Makan malam', emoji: '🍜' });
  if (m >= at(19, 30) && m < at(21)) return withMood({ act: 'free', loc: 'cafe', slot: 9, label: 'Santai, nonton sinetron di HP', emoji: '📱' }, true);
  if (m >= at(21) && m < at(21, 40)) return withMood({ act: 'clean', loc: 'clean:cafe', label: 'Beres-beres cafe sebelum tidur', emoji: '🧽' });
  if (m >= at(21, 40)) return withMood({ act: 'free', loc: 'sink', slot: 1, label: 'Sikat gigi, siap tidur', emoji: '🪥' });
  // jeda kecil: kadang duduk istirahat bentar
  if (hash(Math.floor(m / 30) * 4.1 + day) < 0.2 && m % 30 >= 20) return withMood({ act: 'break', loc: 'cafe', slot: 9, label: 'Duduk bentar, ngelap keringet', emoji: '😮‍💨' });
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
  const desk = agent.boss ? 'boss' : 'desk';

  // Zamiir pulang malam (punya rumah sendiri); pegawai lain & Mbak Sari tinggal di mess
  const bossHome = agent.boss && (m < at(6, 40) + j(1, 20) || m >= at(21) + j(2, 40));
  const wake = at(4, 25) + j(3, 8);
  const bed = at(22) + j(4, 90);
  const asleep = !agent.boss && (m < wake || m >= bed);
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
  if (!agent.boss && m < at(4, 40)) return withMood({ act: 'sleep', loc: 'bed', slot: BED(idx, agent), label: 'Melek, ngumpulin nyawa buat Subuh', emoji: '🥱' });

  // pagi: abis Subuh tidur lagi / santai → mandi gantian (3 bilik) → sarapan
  if (!agent.boss && m < at(7)) {
    const rank = idx; // 9 pegawai → 3 gelombang mandi
    const bath = at(5, 35) + Math.floor(rank / 3) * 13;
    if (m >= bath && m < bath + 11) return withMood({ act: 'free', loc: 'toilet', slot: rank % 3, label: 'Mandi pagi', emoji: '🚿' });
    if (m >= at(6, 20)) return withMood({ act: 'lunch', loc: 'cafe', label: 'Sarapan', emoji: '🍞' });
    if (m < bath) return hash(day + idx * 3.7) < 0.55
      ? withMood({ act: 'sleep', loc: 'bed', slot: BED(idx, agent), label: 'Tidur lagi bentar abis Subuh', emoji: '💤' })
      : withMood({ act: 'free', loc: idx < CAP.lounge ? 'lounge' : 'cafe', label: 'Nunggu giliran mandi', emoji: '📱' });
    return withMood({ act: 'free', loc: 'cafe', label: 'Ngeteh pagi', emoji: '🍵' });
  }
  if (agent.boss && m < at(7)) return withMood({ act: 'work', loc: 'boss', label: 'Baru dateng, nyalain PC', emoji: '☕' });

  // pagi kerja: Senin rapat plan mingguan; Selasa–Minggu riset sendiri lalu briefing pitching ide bareng Bos
  if (dow === 1 && m < at(8)) return withMood({ act: 'meeting', loc: 'meeting', label: 'Rapat plan konten mingguan', emoji: '🗓️' });
  if (dow !== 1 && m < at(8)) return withMood({ act: 'work', loc: desk, label: agent.boss ? 'Cek laporan pagi' : RESEARCH[agent.id] ?? 'Riset pagi', emoji: '🔎' });
  if (dow !== 1 && m < at(8, 30)) return withMood({ act: 'meeting', loc: 'meeting', label: agent.boss ? 'Dengerin pitching ide tim' : 'Briefing: pitching ide konten', emoji: '💡' });
  if (ctx.visit) return withMood({ act: 'visit', loc: 'visit', target: ctx.visit.target, label: ctx.visit.label, emoji: '🗣️' });

  // makan: jam mulai & lamanya beda tiap hari; Zamiir & Aprista selalu semeja
  const seat = LUNCH_SEAT[agent.id];
  const jumat = dow === 5, male = agent.gender === 'm';
  const lunchEnd = at(12, 45) + j(5, 25);
  const eat = (label, emoji) => withMood({ act: 'lunch', loc: 'cafe', slot: seat, label: agent.partner ? `${label} bareng ${agent.boss ? 'Aprista' : 'Zamiir'} 💕` : label, emoji });
  if (jumat && male && m >= at(12, 25) && m < at(13, 5) + j(5, 15)) return eat('Makan siang abis Jumatan', '🍛');
  if (jumat && !male && m >= at(12, 45) && m < at(13, 20) + j(5, 15)) return eat('Makan siang', '🍛');
  if (!jumat && m >= at(12, 20) && m < lunchEnd) return eat('Makan siang', '🍛');
  if (m >= at(18, 20) && m < at(18, 50) + j(6, 15)) return eat('Makan malam', '🍜');
  if (dow === 0 && m >= at(16) && m < at(17)) return withMood({ act: 'meeting', loc: 'meeting', label: 'Evaluasi mingguan', emoji: '📊' });

  // malam: pacaran (Zamiir & Aprista), sebelum tidur sikat gigi
  if (agent.partner && !ctx.partnerBusy) {
    const d = dateAt(t);
    if (d) return withMood({ act: 'free', loc: d.loc, slot: d.slots[agent.id], label: d.label, emoji: d.emoji, pose: d.pose }, true);
  }
  if (!agent.boss && m >= bed - 12) return withMood({ act: 'free', loc: 'sink', slot: idx % 2, label: 'Sikat gigi, siap tidur', emoji: '🪥' }, true);

  const done = real?.status === 'done' || m >= at(19, 30) || (!busy && m >= doneAt(idx, agent, dow, day));
  if (done) return withMood(freeTime(idx, agent, t), true);

  // jeda kecil yang waktunya acak tiap hari (bukan jam pakem)
  const toiletAt = at(9) + j(9, 9 * 60);
  if (!agent.boss && m >= toiletAt && m < toiletAt + 6) return withMood({ act: 'break', loc: 'toilet', slot: idx % 3, label: 'Ke kamar mandi bentar', emoji: '🚻' });
  const coffeeAt = at(9, 30) + j(10, 6 * 60); // sekali sehari antara 09:30–15:30
  if (hash(day * 3.1 + idx) < 0.7 && m >= coffeeAt && m < coffeeAt + 12 + j(11, 8)) return withMood({ act: 'coffee', loc: 'cafe', slot: seat, label: 'Ngopi bentar', emoji: '☕' });
  const stretchAt = at(10) + j(7, 5 * 60);
  if (!busy && hash(day * 5.3 + idx) < 0.45 && m >= stretchAt && m < stretchAt + 8) return withMood({ act: 'break', loc: agent.boss ? 'bossSofa' : idx < CAP.lounge ? 'lounge' : 'cafe', label: 'Rebahan bentar, pegel', emoji: '🛋️' });

  const mood = moodAt(idx, agent, t, false);
  if (mood.burnout && !busy) return { act: 'break', loc: agent.boss ? 'bossSofa' : idx < CAP.lounge ? 'lounge' : 'cafe', label: 'Rehat bentar, lagi burnout', emoji: '🛋️', mood };

  const hour = Math.floor(m / 60);
  const mm = m % 60;
  const sip = 20 + j(8 + hour, 30);
  if (idx < CAP.counter && hash(hour * 7 + idx * 13 + day * 31) < 0.3 && mm >= sip && mm < sip + 5) return { act: 'water', loc: 'counter', label: 'Ambil minum', emoji: '🥤', mood };

  return { act: 'work', loc: desk, label: 'Kerja', emoji: '💻', mood };
}

const RESEARCH = {
  dir: 'Siapin bahan briefing', researcher: 'Riset tren & berita esport', copywriter: 'Riset hook & caption viral',
  designer: 'Cari referensi desain', video: 'Cari referensi video', publisher: 'Cek jam tayang terbaik',
  ads: 'Riset iklan kompetitor', analyst: 'Rekap data kemarin', price: 'Cek harga web & kompetitor',
};

// Gabungkan dengan status kerja asli dari database (state.json)
export function describe(agent, sched, real) {
  if (sched.act !== 'work' || sched.loc === 'counter') return sched;
  if (real?.status === 'waiting') return { ...sched, label: real.current_task ? `Nunggu approval: ${real.current_task}` : 'Nunggu approval Owner', emoji: '⏳' };
  if (sched.overtime) return { ...sched, label: real?.current_task ? `Lembur: ${real.current_task}` : 'Lembur', emoji: '🌙' };
  if (real?.status === 'working' && real.current_task) return { ...sched, label: real.current_task, emoji: '⚡' };
  if (sched.label !== 'Kerja') return sched;
  const idle = {
    dir: 'Pantau performa konten', researcher: 'Scroll tren & berita esport', copywriter: 'Nyusun bank ide caption',
    designer: 'Rapihin aset template', video: 'Cek referensi motion', publisher: 'Cek komentar & DM', ads: 'Pantau performa post & iklan',
    analyst: 'Ngulik data insight IG', price: 'Mantau harga di web', owner: 'Review konten & cek approval',
  };
  return { ...sched, label: idle[agent.id] ?? 'Kerja', emoji: '💻' };
}

export function officeStatus(t, overtime = false) {
  const m = t.minutes;
  const night = m < at(4, 25) || m >= at(22, 30);
  if (night) return overtime ? { label: 'Lembur 🌙', tone: 'break' } : { label: 'Malam · tim tidur 💤', tone: 'off' };
  if (m < at(4, 55)) return { label: 'Subuh 🕌', tone: 'break' };
  if (m < at(7)) return { label: 'Pagi · mandi & sarapan', tone: 'break' };
  if (t.dow === 1 && m < at(8)) return { label: 'Rapat mingguan 🗓️', tone: 'on' };
  if (m < at(8)) return { label: 'Riset pagi 🔎', tone: 'on' };
  if (t.dow !== 1 && m < at(8, 30)) return { label: 'Briefing ide 💡', tone: 'on' };
  if (t.dow === 5 && m >= at(11, 37) && m < at(12, 45)) return { label: 'Jumatan 🕌', tone: 'break' };
  if (m >= at(11, 52) && m < at(13)) return { label: 'Istirahat & Ibadah', tone: 'break' };
  if (m >= at(15, 7) && m < at(15, 30)) return { label: 'Sholat Ashar', tone: 'break' };
  if (m >= at(17, 57) && m < at(19)) return { label: 'Maghrib & Makan malam', tone: 'break' };
  if (m >= at(19, 7) && m < at(19, 30)) return { label: 'Sholat Isya', tone: 'break' };
  if (m >= at(19, 30)) return overtime ? { label: 'Lembur 🌙', tone: 'break' } : { label: 'Santai malam', tone: 'break' };
  return { label: 'Jam Kerja', tone: 'on' };
}
