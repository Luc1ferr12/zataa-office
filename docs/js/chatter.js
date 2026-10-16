// Chit-chat antar pegawai. Obrolan santai/curhat digenerate dari jadwal & mood (deterministik, 0 token):
// jam yang sama selalu menghasilkan obrolan yang sama, jadi semua yang buka web lihat hal yang sama.
// Obrolan oper kerjaan asli datang dari database (state.chats) lalu digabung.
import { AGENTS, activityAt, hash } from './schedule.js';

const BLOCK = 12; // menit per "kesempatan ngobrol"
const LOOKBACK = 3 * 60; // tampilkan obrolan 3 jam terakhir

// [pembicara 0|1, teks]; {a} = pembicara pertama, {b} = lawan bicara
const BANK = {
  makan: [
    [[0, 'Makan apa nih {b}? Aku pesen nasi padang lagi 😅'], [1, 'Sama! Rendangnya hari ini gede banget'], [0, 'Pantes ngantuk abis ini wkwk']],
    [[0, '{b}, sambalnya jangan diabisin dong'], [1, 'Hehe sorry, pedesnya nagih 🌶️']],
    [[0, 'Diet aku gagal lagi gara-gara cafe ini'], [1, 'Diet mulai Senin aja, tradisi 😂']],
    [[0, 'Abis makan enaknya mabar nggak sih?'], [1, 'Gas, tapi satu match aja ya, kerjaan masih numpuk']],
  ],
  ngopi: [
    [[0, 'Kopi ketiga hari ini ☕'], [1, 'Itu darah apa kopi {a}? 😂']],
    [[0, 'Es kopi susu atau americano?'], [1, 'Es kopi susu dong, americano pahit kayak revisi'], [0, 'HAHAHA bener juga']],
    [[0, '{b}, nitip satu ya'], [1, 'Oke, transfer dulu tapi 😏']],
  ],
  santai: [
    [[0, 'Kemarin udah nonton MPL belom?'], [1, 'Udah! Gila comeback-nya'], [0, 'Konten minggu depan bahas itu aja kali ya']],
    [[0, 'Push rank yuk {b}, aku stuck di Epic'], [1, 'Epic mulu dari musim lalu 🤭'], [0, 'Jangan dibuka aibnya dong']],
    [[0, 'Akhirnya kerjaan beres juga 🥳'], [1, 'Mantap, besok kita grind lagi']],
    [[0, 'Ada yang mau ke taman? Udaranya enak'], [1, 'Ikut! Sekalian ngadem']],
    [[0, 'Patch Valorant baru udah nyoba?'], [1, 'Udah, agen barunya OP banget sih'], [0, 'Bakal di-nerf minggu depan pasti']],
    [[0, 'Kolamnya kosong tuh, renang yuk'], [1, 'Lagi males basah, aku rebahan aja 😴']],
  ],
  kerja: [
    [[0, '{b}, headline yang ini kepanjangan nggak?'], [1, 'Dikit, potong 2 kata aja biar kebaca di HP']],
    [[0, 'Warna ungunya kurang nendang nggak sih?'], [1, 'Tambahin aksen emas, biar ala ML'], [0, 'Oke noted!']],
    [[0, 'Sumber beritanya udah dua kan?'], [1, 'Udah, detik sama viva. Aman']],
    [[0, 'Harga diamond hari ini ada yang berubah?'], [1, 'Aku cek web dulu bentar ya, jangan nebak 😆']],
    [[0, '{b}, render-nya udah kelar?'], [1, 'Bentar lagi, PC-ku lagi ngos-ngosan']],
    [[0, 'Caption-nya kurang CTA nih'], [1, 'Tambahin "top up di zataa.my.id" aja, simpel']],
  ],
  trading: [
    [[0, '{b}, CPI malam ini rilis jam berapa?'], [1, '20:30 WITA, siap-siap volatil 🔥'], [0, 'Oke, aku kabarin Aryaputra biar lot dikecilin']],
    [[0, 'H4 masih bullish, tapi H1 udah bikin lower high'], [1, 'Tunggu konfirmasi di support dulu deh'], [0, 'Setuju, jangan FOMO']],
    [[0, 'Risk per trade tetap 1% ya'], [1, 'Siap, RR minimal 1:2 kan?'], [0, 'Betul, kalau nggak masuk ya NO TRADE']],
    [[0, 'Order udah ke-fill, SL TP kepasang'], [1, 'Mantap, aku kirim laporan ke Telegram']],
    [[0, 'Backtest versi baru winrate naik dikit'], [1, 'Forward test seminggu dulu sebelum deploy ya'], [0, 'Siap bos']],
    [[0, 'Spread lagi lebar banget nih'], [1, 'Tahan dulu entry-nya, tunggu normal']],
    [[0, 'Fed ngomong hawkish lagi 😬'], [1, 'Gold bisa turun, cek level 2 hari terakhir']],
  ],
  youtube: [
    [[0, '{b}, Göbekli Tepe umurnya beneran 11 ribu tahun?'], [1, 'Kisaran 9500 SM, ada di jurnal arkeologi. Tulis "sekitar" ya'], [0, 'Siap, jangan dibulatin lebay']],
    [[0, 'Hook 3 detik pertama kurang nendang nih'], [1, 'Buka pakai pertanyaan aja: "Siapa yang mindahin batu 800 ton ini?"'], [0, 'Nah itu!']],
    [[0, 'Ini fakta apa teori, {b}?'], [1, 'Teori. Kasih label "menurut sebagian peneliti" ya'], [0, 'Oke, aman dari hoaks']],
    [[0, 'Fotonya dari Wikimedia, lisensinya CC BY-SA'], [1, 'Sip, cantumin kreditnya di deskripsi']],
    [[0, 'Retention kemarin jeblok di detik 20'], [1, 'Bagian situ kebanyakan angka, besok dipadetin'], [0, 'Noted, max 1 angka per adegan']],
    [[0, 'Voice-over-nya kecepetan nggak?'], [1, 'Dikit, turunin 5% biar misteriusnya kerasa 🕯️']],
  ],
  pacaran: [
    [[0, 'Udah makan belum? Jangan kerja mulu 🥺'], [1, 'Belum, nungguin kamu dong'], [0, 'Gombal ah 🙈']],
    [[0, 'Nanti malem nonton bareng yuk'], [1, 'Boleh, tapi aku yang pilih filmnya ya'], [0, 'Asal bukan horor 😤']],
    [[0, 'Kamu capek ya? Mukanya kusut'], [1, 'Dikit, tapi liat kamu langsung seger lagi'], [0, 'Dasar bos gombal 😆']],
    [[0, 'Kopinya aku pesenin yang less sugar ya'], [1, 'Kok tau? 🥰'], [0, 'Udah hafal lah']],
    [[0, 'Jangan lupa istirahat ya'], [1, 'Siap, bu director 🫡'], [0, 'Hehe good boy']],
  ],
  ledek: [
    [[0, 'Itu bos sama Kak Aprista berduaan mulu ya 👀'], [1, 'Cieeee, kantor jadi berbunga-bunga 🌸']],
    [[0, 'Kapan nih undangannya bos? 😏'], [1, 'Kerja dulu kerja, hus hus 😂']],
    [[0, 'Pantes approve konten hari ini cepet, lagi bucin 🤭'], [1, 'Wkwk jangan kenceng-kenceng, kedengeran']],
  ],
  ob: [
    [[0, 'Mbak Sari, kopinya hari ini enak banget ☕'], [1, 'Makasih, Mas/Mbak! Pake gula aren hari ini']],
    [[1, 'Awas, lantainya masih basah ya 🧹'], [0, 'Siap Mbak, jalan jinjit nih 😆']],
    [[0, 'Mbak udah makan belum?'], [1, 'Nanti abis beres-beres, gampang'], [0, 'Jangan telat makan lho Mbak']],
    [[1, 'Siapa yang naro gelas di meja meeting ini? 🙄'], [0, 'Hehe aku Mbak, maaf…']],
  ],
  curhat: [
    [[0, 'Capek banget hari ini 😮‍💨'], [1, 'Semangat {a}! Abis ini ngopi bareng yuk'], [0, 'Makasih ya 🥹']],
    [[0, 'Revisi lagi… aku salah di mana coba'], [1, 'Bukan salah kamu, bos emang detail. Itu tanda dia peduli'], [0, 'Iya sih, oke lanjut deh']],
    [[0, 'PC aku nge-hang pas render, ilang semua 😭'], [1, 'Autosave nyala nggak?'], [0, 'Nyala… untungnya'], [1, 'Nah kan aman, tarik napas dulu']],
    [[0, 'Wifi lemot banget hari ini'], [1, 'Pindah ke meja deket router aja'], [0, 'Udah, tetep aja 😤']],
    [[0, 'Ide lagi buntu nih'], [1, 'Coba scroll TikTok 10 menit, biasanya muncul'], [0, 'Itu namanya nyari alasan main HP 😂']],
  ],
};

const people = AGENTS;
const idxOf = (id) => AGENTS.findIndex((a) => a.id === id);

function topicOf(a1, a2) {
  const ids = [a1.a.id, a2.a.id];
  if (ids.includes('dir') && ids.includes('owner')) return 'pacaran';
  if (ids.includes('ob')) return 'ob';
  if (ids.includes('owner')) return null; // bos jarang nimbrung obrolan santai
  if (a1.mood?.key && ['marah', 'kesel', 'capek'].includes(a1.mood.key)) return 'curhat';
  if (a1.act === 'lunch' || a2.act === 'lunch') return 'makan';
  if (a1.act === 'coffee' || a1.loc === 'cafe') return 'ngopi';
  if (a1.act === 'work' && a2.act === 'work') return a1.a.team === 'trd' && a2.a.team === 'trd' ? 'trading' : a1.a.team === 'yt' && a2.a.team === 'yt' ? 'youtube' : 'kerja';
  if (a1.act === 'free' || a1.act === 'break') return 'santai';
  return null;
}

// obrolan simulasi di sekitar waktu t ({dow, minutes}); real = status DB per agent
export function simulatedChats(t, real = {}, dayDate = new Date()) {
  const out = [];
  const startBlock = Math.floor((t.minutes - LOOKBACK) / BLOCK);
  const endBlock = Math.floor(t.minutes / BLOCK);
  for (let b = Math.max(0, startBlock); b <= endBlock; b++) {
    const r = hash(b * 3.17 + t.dow * 101.3);
    if (r > 0.55) continue; // nggak tiap saat ngobrol
    const m = b * BLOCK + Math.floor(hash(b + t.dow) * 4);
    const tt = { ...t, minutes: m };
    const acts = people.map((a) => ({ a, ...activityAt(idxOf(a.id), a, tt, real[a.id]) }));
    // pasangan yang lagi di tempat yang sama (meja kerja dihitung satu ruangan)
    const room = (x) => (x.loc === 'desk' ? `work-${x.a.team}` : x.loc);
    const here = acts.filter((x) => !['off', 'pray', 'meeting', 'sleep'].includes(x.act));
    const groups = {};
    for (const x of here) (groups[room(x)] ??= []).push(x);
    const rooms = Object.values(groups).filter((g) => g.length >= 2);
    if (!rooms.length) continue;
    const g = rooms[Math.floor(hash(b * 7.7) * rooms.length) % rooms.length];
    const i1 = Math.floor(hash(b * 5.1 + 1) * g.length) % g.length;
    const i2 = (i1 + 1 + Math.floor(hash(b * 9.3) * (g.length - 1))) % g.length; // selalu beda orang
    const [p1, p2] = [g[i1], g[i2]];
    let topic = topicOf(p1, p2);
    // kadang yang lain ngeledekin Zamiir & Aprista pas mereka lagi berduaan
    const couple = here.filter((x) => x.a.partner).length === 2 && here.find((x) => x.a.id === 'dir')?.loc === here.find((x) => x.a.id === 'owner')?.loc;
    if (couple && topic !== 'pacaran' && !['ob'].includes(topic) && hash(b * 4.4) < 0.5) topic = 'ledek';
    if (!topic) continue;
    const dialog = BANK[topic][Math.floor(hash(b * 2.3 + t.dow) * BANK[topic].length) % BANK[topic].length];
    dialog.forEach(([who, text], k) => {
      const minute = m + k;
      if (minute > t.minutes) return; // belum terjadi
      const [from, to] = who === 0 ? [p1.a, p2.a] : [p2.a, p1.a];
      out.push({
        minute, from: from.id, to: to.id, kind: topic === 'curhat' ? 'curhat' : ['kerja', 'trading', 'youtube'].includes(topic) ? 'kerja' : topic === 'pacaran' ? 'pacaran' : 'santai',
        message: text.replaceAll('{a}', p1.a.name).replaceAll('{b}', p2.a.name),
      });
    });
  }
  return out;
}

const fmt = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(Math.floor(min % 60)).padStart(2, '0')}`;
const witaMinutes = (ts) => {
  const d = new Date(ts.replace(' ', 'T') + 'Z');
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Makassar', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: +p.hour * 60 + +p.minute };
};

// gabungan: obrolan DB (asli) hari ini + simulasi, terbaru di atas
export function chatFeed(t, state, today, simulated = false) {
  const real = Object.fromEntries((state?.agents ?? []).map((a) => [a.id, a]));
  const sim = simulatedChats(t, simulated ? {} : real);
  const db = simulated ? [] : (state?.chats ?? []).map((c) => {
    const w = witaMinutes(c.ts);
    return w.date === today ? { minute: w.minutes, from: c.agent_id, to: c.to_id, kind: c.kind, message: c.message, real: true } : null;
  }).filter(Boolean);
  return [...db, ...sim].sort((x, y) => y.minute - x.minute || (y.real ? 1 : 0) - (x.real ? 1 : 0)).slice(0, 40).map((c) => ({ ...c, time: fmt(c.minute) }));
}
