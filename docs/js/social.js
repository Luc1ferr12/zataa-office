// Kehidupan sosial kantor (0 token, deterministik per tanggal WITA → semua yang buka web lihat hal yang sama):
// ulang tahun + perayaan kecil, event mingguan (turnamen billiard, mabar ML antar divisi, lomba renang, karaoke, kuis,
// pingpong) lengkap dengan bracket & pemenang, dan alur hubungan antar pegawai yang berubah seiring tanggal
// (pdkt → jadian → putus → temenan, sahabat, rival). Dipakai schedule.js (posisi pegawai) & chatter.js (obrolan).
// Sengaja tidak meng-import schedule.js (hindari import melingkar): daftar pegawai dioper lewat argumen.

export const hashS = (n) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
const at = (h, m = 0) => h * 60 + m;
const dayNumOf = (date) => Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);

// tanggal (YYYY-MM-DD) dari waktu t; mode simulasi cuma punya dow → pakai tanggal hari itu di minggu ini
export function dateOf(t) {
  if (t.date) return t.date;
  const today = new Date(Date.now() + 8 * 3600e3);   // WITA = UTC+8
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + (t.dow - today.getUTCDay())));
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- ulang tahun (Zamiir 12 Feb & Aprista 22 Apr permintaan Owner, sisanya acak)
export const BIRTHDAYS = {
  owner: '02-12', sec: '04-22', ob: '06-18',
  dir: '07-09', researcher: '03-17', copywriter: '10-27', designer: '12-05', video: '01-21', publisher: '11-03', ads: '05-30', analyst: '09-14', price: '08-08',
  tdir: '01-04', tresearch: '06-02', ttech: '11-19', trisk: '03-29', texec: '08-25', teval: '12-24', treport: '02-27',
  ydir: '05-11', yresearch: '09-01', yscript: '04-07', yvisual: '07-23', yvideo: '10-30', ypublish: '01-15',
};
export const birthdaysOn = (date) => Object.keys(BIRTHDAYS).filter((id) => BIRTHDAYS[id] === date.slice(5));
export const CAKE = { start: at(17, 5), end: at(17, 25) };   // tiup lilin di cafe (abis Ashar & evaluasi Minggu)

// ---------------------------------------------------------------- hubungan (tiap tahap berlaku mulai tanggalnya)
export const ARCS = [
  { a: 'owner', b: 'sec', stages: [['2026-01-01', 'pacaran']] },
  { a: 'publisher', b: 'ypublish', stages: [['2026-10-12', 'pdkt'], ['2026-11-07', 'pacaran']] },                       // Fikri & Kirana
  { a: 'analyst', b: 'researcher', stages: [['2026-08-17', 'pacaran'], ['2026-10-21', 'putus'], ['2026-11-22', 'teman']] }, // Raka & Clariana
  { a: 'yvisual', b: 'yscript', stages: [['2026-10-23', 'pdkt'], ['2026-12-02', 'pacaran']] },                          // Galih & Laras
  { a: 'yvideo', b: 'ttech', stages: [['2026-10-06', 'pdkt'], ['2026-11-01', 'ditolak'], ['2026-11-12', 'teman']] },     // Yoga & Keira
  { a: 'trisk', b: 'tresearch', stages: [['2026-05-20', 'pacaran']] },                                                   // Aryaputra & Davina
  { a: 'texec', b: 'treport', stages: [['2025-01-01', 'sahabat']] },                                                     // Wiratama & Selena
  { a: 'price', b: 'designer', stages: [['2025-01-01', 'rival']] },                                                      // Budi & Maria
  { a: 'video', b: 'copywriter', stages: [['2026-03-01', 'sahabat'], ['2026-11-25', 'pdkt']] },                          // Dimas & Ista: friendzone → pdkt
  { a: 'ydir', b: 'teval', stages: [['2026-10-18', 'pdkt']] },                                                           // Bagas & Jihan (beda divisi)
];
export const STAGE_LABEL = { pdkt: 'lagi PDKT 💘', pacaran: 'pacaran 💕', putus: 'baru putus 💔', ditolak: 'abis ditolak 🥲', teman: 'temenan lagi 🤝', sahabat: 'sahabatan 🫂', rival: 'rival bebuyutan 😤' };
export function relationsOn(date) {
  const out = [];
  for (const r of ARCS) {
    const cur = r.stages.filter(([d]) => d <= date).pop();
    if (!cur) continue;
    out.push({ a: r.a, b: r.b, stage: cur[1], since: cur[0], fresh: dayNumOf(date) - dayNumOf(cur[0]) <= 2 });
  }
  return out;
}
export const relationOf = (x, y, date) => relationsOn(date).find((r) => (r.a === x && r.b === y) || (r.a === y && r.b === x)) ?? null;

// ---------------------------------------------------------------- event mingguan (dow 0 = Minggu)
export const EVENTS = [
  { id: 'esport', dow: 2, start: at(20), end: at(21, 30), name: 'Turnamen Mabar ML antar divisi', emoji: '🎮', loc: 'game' },
  { id: 'kuis', dow: 3, start: at(19, 45), end: at(20, 45), name: 'Kuis trivia esport & sejarah', emoji: '❓', loc: 'cafe' },
  { id: 'billiard', dow: 4, start: at(19, 45), end: at(21), name: 'Turnamen Billiard Zataa Cup', emoji: '🎱', loc: 'billiard' },
  { id: 'karaoke', dow: 5, start: at(20, 15), end: at(21, 45), name: 'Karaoke Jumat malam', emoji: '🎤', loc: 'cinema' },
  { id: 'renang', dow: 6, start: at(16), end: at(16, 45), name: 'Lomba Renang 50 m', emoji: '🏊', loc: 'pool' },
  { id: 'pingpong', dow: 0, start: at(19, 45), end: at(20, 50), name: 'Turnamen Pingpong', emoji: '🏓', loc: 'arcade' },
];
const NY = new Set(['tdir', 'texec', 'treport']);   // jaga sesi New York (Senin–Jumat malam)
export const eventOn = (date) => { const ev = EVENTS.find((e) => e.dow === new Date(`${date}T00:00:00Z`).getUTCDay()); return ev ?? null; };

// peserta & hasil, deterministik per tanggal
function shuffle(ids, seed) { return [...ids].sort((x, y) => hashS(seed + x.length * 7.1 + x.charCodeAt(0) * 0.37 + x.charCodeAt(1) * 1.9) - hashS(seed + y.length * 7.1 + y.charCodeAt(0) * 0.37 + y.charCodeAt(1) * 1.9)); }
const planCache = new Map();
export function eventPlan(date, agents) {
  if (!planCache.has(date)) planCache.set(date, buildPlan(date, agents));
  return planCache.get(date);
}
function buildPlan(date, agents) {
  const ev = eventOn(date); if (!ev) return null;
  const dn = dayNumOf(date), weekday = ev.dow >= 1 && ev.dow <= 5;
  const pool = agents.filter((a) => !a.ob && !(weekday && NY.has(a.id)) && !(ev.id !== 'billiard' && a.boss && ev.id !== 'karaoke'));
  const win = (x, y, k) => (hashS(dn * 3.7 + k * 11.3 + x.length + y.charCodeAt(0)) < 0.5 ? [x, y] : [y, x]);
  const P = { ...ev, date };
  if (ev.id === 'billiard') {   // 8 pemain: perempat final 4 meja → semifinal → final
    const pl = shuffle(pool.map((a) => a.id), dn * 1.3).slice(0, 8);
    const qf = [0, 1, 2, 3].map((k) => win(pl[k * 2], pl[k * 2 + 1], k));
    const sf = [0, 1].map((k) => win(qf[k * 2][0], qf[k * 2 + 1][0], 10 + k));
    const fi = win(sf[0][0], sf[1][0], 20);
    P.rounds = [{ name: 'Perempat final', start: at(19, 45), end: at(20, 5), games: qf }, { name: 'Semifinal', start: at(20, 10), end: at(20, 30), games: sf },
      { name: 'Final', start: at(20, 35), end: at(20, 55), games: [fi] }];
    P.players = pl; P.champ = fi[0]; P.runner = fi[1];
  } else if (ev.id === 'pingpong') {   // 4 pemain: semifinal → final
    const pl = shuffle(pool.map((a) => a.id), dn * 2.1).slice(0, 4);
    const sf = [0, 1].map((k) => win(pl[k * 2], pl[k * 2 + 1], k));
    const fi = win(sf[0][0], sf[1][0], 5);
    P.rounds = [{ name: 'Semifinal', start: at(19, 45), end: at(20, 15), games: sf }, { name: 'Final', start: at(20, 20), end: at(20, 50), games: [fi] }];
    P.players = pl; P.champ = fi[0]; P.runner = fi[1];
  } else if (ev.id === 'esport') {   // 2 tim × 5 (lintas divisi), best of 3
    const pl = shuffle(pool.map((a) => a.id), dn * 0.7).slice(0, 10);
    P.teams = [{ name: 'Tim Ungu', ids: pl.slice(0, 5) }, { name: 'Tim Hitam', ids: pl.slice(5) }];
    const s = hashS(dn * 9.1) < 0.5 ? [2, 1] : hashS(dn * 4.3) < 0.5 ? [1, 2] : [2, 0];
    P.score = s; P.champTeam = s[0] > s[1] ? 0 : 1; P.players = pl;
    P.mvp = P.teams[P.champTeam].ids[Math.floor(hashS(dn * 6.6) * 5)];
  } else if (ev.id === 'renang') {   // cowok, 1 heat 6 orang
    const pl = shuffle(pool.filter((a) => a.gender === 'm').map((a) => a.id), dn * 3.3).slice(0, 6);
    P.players = pl; P.order = shuffle(pl, dn * 5.5); P.champ = P.order[0];
    P.times = P.order.map((_, i) => (31 + i * 1.7 + hashS(dn + i) * 1.4).toFixed(1));
  } else if (ev.id === 'kuis') {   // tim per divisi
    P.players = pool.map((a) => a.id);
    const tm = ['Marketing', 'YouTube', 'Trading']; P.champTeam = tm[Math.floor(hashS(dn * 2.2) * 3)];
  } else if (ev.id === 'karaoke') {
    P.players = pool.map((a) => a.id);
    P.singers = shuffle(P.players, dn * 7.7).slice(0, 6);
  }
  return P;
}

// posisi pegawai karena event / ultah (null = tidak ikut). slot dipakai schedule.js untuk kursi/meja
export function socialActivity(agent, t, agents, seat) {
  const date = dateOf(t), m = t.minutes;
  const bdays = birthdaysOn(date);
  if (bdays.length && m >= CAKE.start && m < CAKE.end && !agent.ob) {
    const names = bdays.map((id) => agents.find((a) => a.id === id)?.name ?? id).join(' & ');
    return bdays.includes(agent.id)
      ? { act: 'free', loc: 'cafe', slot: seat, label: 'Ultah! Tiup lilin & potong kue 🎂', emoji: '🎂' }
      : { act: 'free', loc: 'cafe', slot: seat, label: `Rayain ultah ${names} 🎂`, emoji: '🎉' };
  }
  const P = eventPlan(date, agents);
  if (!P || m < P.start || m >= P.end || !P.players?.includes(agent.id)) return null;
  if (P.rounds) {
    for (const r of P.rounds) {
      if (m < r.start || m >= r.end) continue;
      const k = r.games.findIndex((g) => g.includes(agent.id));
      if (k < 0) return null;   // udah gugur → balik santai
      const g = r.games[k], lawan = agents.find((a) => a.id === g.find((x) => x !== agent.id))?.name ?? 'lawan';
      return { act: 'free', loc: P.loc, slot: k * 2 + g.indexOf(agent.id), label: `${P.emoji} ${r.name} ${P.name.replace('Turnamen ', '')} vs ${lawan}`, emoji: P.emoji, event: P.id };
    }
    return null;
  }
  const i = P.players.indexOf(agent.id);
  if (P.id === 'esport') { const tm = P.teams.find((x) => x.ids.includes(agent.id)); return { act: 'free', loc: 'game', slot: i, label: `${P.emoji} ${P.name} (${tm.name})`, emoji: P.emoji, event: P.id }; }
  if (P.id === 'renang') return { act: 'free', loc: 'pool', slot: i, label: `${P.emoji} ${P.name}`, emoji: P.emoji, event: P.id };
  if (P.id === 'kuis') return { act: 'free', loc: 'cafe', slot: seat, label: `${P.emoji} ${P.name}`, emoji: P.emoji, event: P.id };
  if (P.id === 'karaoke') return { act: 'free', loc: 'cinema', slot: i, label: P.singers.includes(agent.id) ? `${P.emoji} Nyanyi di karaoke` : `${P.emoji} Nonton karaoke`, emoji: P.emoji, event: P.id };
  return null;
}

// kencan pasangan yang lagi pacaran (selain Zamiir & Aprista yang punya jadwal sendiri) — malam setelah kerja
export function coupleDate(agent, t) {
  const date = dateOf(t), m = t.minutes;
  if (m < at(19, 30) || m >= at(21, 30)) return null;
  const r = relationsOn(date).find((x) => x.stage === 'pacaran' && x.a !== 'owner' && (x.a === agent.id || x.b === agent.id));
  if (!r) return null;
  const blk = Math.floor(m / 20), dn = dayNumOf(date), k = r.a.length + r.b.charCodeAt(0);
  if (hashS(blk * 2.3 + dn * 1.7 + k) > 0.45) return null;
  const spots = [['garden', 'Ngobrol berdua di gazebo 💕', '💕'], ['lounger', 'Duduk berdua di pinggir kolam 💕', '💕'], ['cafe', 'Ngedate di cafe 💕', '☕']];
  const [loc, label, emoji] = spots[Math.floor(hashS(blk * 5.9 + dn + k) * spots.length)];
  return { act: 'free', loc, label, emoji, partnerId: r.a === agent.id ? r.b : r.a };
}
