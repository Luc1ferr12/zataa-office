// Jadwal, aktivitas, dan mood pegawai — semuanya dihitung di browser dari jam kantor WITA (0 token).
// Kantor buka tiap hari 07:00–21:00 WITA (Asia/Makassar).
// Deterministik: jam yang sama selalu menghasilkan keadaan yang sama, jadi dashboard & kantor 3D selalu sinkron.

export const AGENTS = [
  { id: 'dir',        name: 'Aprista',  avatar: '#8a5a3c', title: 'Marketing Director',     gender: 'f' },
  { id: 'researcher', name: 'Clariana', avatar: '#6b4fd8', title: 'Researcher',             gender: 'f' },
  { id: 'copywriter', name: 'Ista',     avatar: '#2f6b65', title: 'Copywriter',             gender: 'f' },
  { id: 'designer',   name: 'Maria',    avatar: '#c0668a', title: 'Graphic Designer',       gender: 'f' },
  { id: 'video',      name: 'Dimas',    avatar: '#7a3b3b', title: 'Video Production',       gender: 'm' },
  { id: 'publisher',  name: 'Fikri',    avatar: '#33415c', title: 'Social Media Publisher', gender: 'm' },
  { id: 'ads',        name: 'Fahriah',  avatar: '#0d9488', title: 'Ads Specialist',         gender: 'f' },
  { id: 'owner',      name: 'Zamiir',   avatar: '#5b1fd6', title: 'Owner / Boss',           gender: 'm', boss: true, imam: true },
];
// tampilan tiap orang (sprite pixel) ada di js/px/sprites.js

const DOW = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export function wita(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Makassar', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).map((p) => [p.type, p.value]),
  );
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  const minutes = +parts.hour * 60 + +parts.minute + +parts.second / 60;
  return { dow, minutes, dayName: DOW[dow], date: `${parts.year}-${parts.month}-${parts.day}`, hh: parts.hour, mm: parts.minute };
}

export const hash = (n) => {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};
const at = (h, m = 0) => h * 60 + m;
const pick = (arr, r) => arr[Math.floor(r * arr.length) % arr.length];

// Perkiraan jam tugas harian selesai (kalau database tidak bilang sebaliknya)
function doneAt(idx, agent, dow) {
  const video = dow === 3 || dow === 6;
  const base = {
    dir: dow === 1 ? at(15, 40) : at(14, 50),
    researcher: at(10, 40),
    copywriter: at(11, 30),
    designer: video ? at(13, 50) : at(14, 30),
    video: video ? at(16, 10) : at(13, 40),
    publisher: at(15, 10),
    ads: at(16, 20),
    owner: at(15, 45),
  }[agent.id];
  return base + Math.floor(hash(dow * 7 + idx) * 30) - 10;
}

const MOOD_TEXT = {
  marah: ['PC nge-hang pas render!!', 'Wifi lemot banget', 'File kehapus 😭'],
  kesel: ['Revisi lagi…', 'Render error mulu', 'Ide lagi buntu', 'Notif grup ga berhenti'],
  senang: ['Konten kemarin rame!', 'Dapet ide bagus', 'Kerjaan lancar jaya'],
};

export function moodAt(idx, agent, t, done) {
  const m = t.minutes;
  const block = Math.floor(m / 30);
  const r = hash(block * 7.31 + idx * 31.7 + t.dow * 13.1);
  const r2 = hash(block * 3.7 + idx * 5.3 + t.dow);
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
  const r = hash(Math.floor(m / 25) * 3.3 + idx * 17.9 + t.dow * 101.1);
  const canSwim = agent.gender === 'm' && m >= at(9) && m < at(17, 45);
  if (agent.boss) {
    // boss santainya di ruangannya sendiri, cafe, atau kolam
    const b = [['bossSofa', 'Santai di ruang boss', '🛋️'], ['cafe', 'Ngopi santai', '☕'], ...(canSwim ? [['pool', 'Berenang', '🏊']] : [])];
    const [loc, label, emoji] = pick(b, r);
    return { act: 'free', loc, label, emoji };
  }
  const opts = [
    ['cafe', 'Ngopi santai', '☕'],
    ['lounge', 'Rebahan sambil scroll HP', '📱'],
    ['game', 'Mabar di ruang santai', '🎮'],
    ['lounger', 'Santai di pinggir kolam', '🕶️'],
    ['garden', 'Ngadem di taman', '🌿'],
  ];
  if (canSwim) opts.push(['pool', 'Berenang', '🏊'], ['pool', 'Berenang', '🏊']);
  const [loc, label, emoji] = pick(opts, r);
  return { act: 'free', loc, label, emoji };
}

// act: off | work | meeting | pray | lunch | coffee | water | free | break
export function activityAt(idx, agent, t, real) {
  const { dow, minutes: m } = t;
  const s = idx * 2;
  const off = (label, emoji) => ({ act: 'off', loc: 'out', label, emoji });
  const withMood = (a, done = false) => ({ ...a, mood: a.act === 'off' ? { key: 'off', emoji: '', label: '' } : moodAt(idx, agent, t, done) });

  if (m < at(6, 40) + s) return withMood(off('Belum datang', '🏠'));
  if (m >= at(21, 5) + s) return withMood(off('Udah pulang', '🏠'));

  if (m < at(7)) return withMood({ act: 'work', loc: agent.boss ? 'boss' : 'desk', label: 'Baru dateng, nyalain PC', emoji: '☕' });
  if (dow === 1 && m < at(8, 30)) return withMood({ act: 'meeting', loc: 'meeting', label: 'Rapat plan mingguan', emoji: '🗓️' });
  if (dow !== 1 && m < at(7, 15)) return withMood({ act: 'meeting', loc: 'meeting', label: 'Daily stand-up', emoji: '🗣️' });

  // jadwal sholat & makan (WITA)
  if (dow === 5 && agent.gender === 'm') {
    if (m >= at(11, 40) && m < at(12, 50)) return withMood({ act: 'off', loc: 'out', label: 'Sholat Jumat di masjid', emoji: '🕌' });
    if (m >= at(12, 50) && m < at(13, 20)) return withMood({ act: 'lunch', loc: 'cafe', label: 'Makan siang', emoji: '🍛' });
  } else {
    if (m >= at(12) && m < at(12, 20)) return withMood({ act: 'pray', loc: 'musholla', label: 'Sholat Dzuhur', emoji: '🕌' });
    if (m >= at(12, 20) && m < at(13)) return withMood({ act: 'lunch', loc: 'cafe', label: 'Makan siang', emoji: '🍛' });
  }
  if (m >= at(15, 15) && m < at(15, 30)) return withMood({ act: 'pray', loc: 'musholla', label: 'Sholat Ashar', emoji: '🕌' });
  if (m >= at(18, 5) && m < at(18, 20)) return withMood({ act: 'pray', loc: 'musholla', label: 'Sholat Maghrib', emoji: '🕌' });
  if (m >= at(18, 20) && m < at(19)) return withMood({ act: 'lunch', loc: 'cafe', label: 'Makan malam', emoji: '🍜' });
  if (m >= at(19, 15) && m < at(19, 30)) return withMood({ act: 'pray', loc: 'musholla', label: 'Sholat Isya', emoji: '🕌' });
  if (dow === 0 && m >= at(16) && m < at(17)) return withMood({ act: 'meeting', loc: 'meeting', label: 'Evaluasi mingguan', emoji: '📊' });

  // status dari database menang atas simulasi
  const busy = real?.status === 'working' || real?.status === 'waiting';
  const done = real?.status === 'done' || (!busy && m >= doneAt(idx, agent, dow));
  if (done) return withMood(freeTime(idx, agent, t), true);

  if (m >= at(15, 30) && m < at(15, 45) && idx % 2 === 0) return withMood({ act: 'coffee', loc: 'cafe', label: 'Ngopi sore', emoji: '☕' });

  const mood = moodAt(idx, agent, t, false);
  if (mood.burnout) return { act: 'break', loc: agent.boss ? 'bossSofa' : 'lounge', label: 'Rehat bentar, lagi burnout', emoji: '🛋️', mood };

  const hour = Math.floor(m / 60);
  const mm = m % 60;
  if (hash(hour * 7 + idx * 13 + dow * 31) < 0.3 && mm >= 35 && mm < 40) return { act: 'water', loc: 'counter', label: 'Ambil minum', emoji: '🥤', mood };

  return { act: 'work', loc: agent.boss ? 'boss' : 'desk', label: 'Kerja', emoji: '💻', mood };
}

// Gabungkan dengan status kerja asli dari database (state.json)
export function describe(agent, sched, real) {
  if (sched.act !== 'work') return sched;
  if (real?.status === 'waiting') return { ...sched, label: real.current_task ? `Nunggu approval: ${real.current_task}` : 'Nunggu approval Owner', emoji: '⏳' };
  if (real?.status === 'working' && real.current_task) return { ...sched, label: real.current_task, emoji: '⚡' };
  const idle = {
    dir: 'Pantau performa konten', researcher: 'Scroll tren & berita esport', copywriter: 'Nyusun bank ide caption',
    designer: 'Rapihin aset template', video: 'Cek referensi motion', publisher: 'Cek komentar & DM', ads: 'Pantau performa post & iklan', owner: 'Review konten & cek approval',
  };
  return { ...sched, label: idle[agent.id] ?? 'Kerja', emoji: '💻' };
}

export function officeStatus(t) {
  const m = t.minutes;
  if (m < at(6, 40) || m >= at(21, 20)) return { label: 'Tutup', tone: 'off' };
  if (m >= at(12) && m < at(13)) return { label: 'Istirahat & Ibadah', tone: 'break' };
  if (m >= at(15, 15) && m < at(15, 45)) return { label: 'Ashar & Ngopi', tone: 'break' };
  if (m >= at(18, 5) && m < at(19)) return { label: 'Maghrib & Makan malam', tone: 'break' };
  if (m >= at(19, 15) && m < at(19, 30)) return { label: 'Sholat Isya', tone: 'break' };
  return { label: 'Jam Kerja', tone: 'on' };
}
