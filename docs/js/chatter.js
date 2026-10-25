// Chit-chat antar pegawai. Obrolan digenerate dari jadwal, mood, hubungan, ulang tahun & event (social.js) —
// deterministik (0 token): jam yang sama selalu menghasilkan obrolan yang sama, jadi semua yang buka web lihat hal yang sama.
// Obrolan oper kerjaan asli datang dari database (state.chats) lalu digabung.
import { AGENTS, activityAt, hash } from './schedule.js';
import { dateOf, birthdaysOn, CAKE, relationsOn, relationOf, eventPlan } from './social.js';

const BLOCK = 5;          // menit per "kesempatan ngobrol"
const LOOKBACK = 4 * 60;  // tampilkan obrolan 4 jam terakhir
const MAX = 180;   // dibagi dua card di dashboard (kerja & chit-chat)

// isian acak biar kalimat yang sama nggak keulang persis
const FILL = {
  hero: ['Fanny', 'Ling', 'Chou', 'Gusion', 'Lancelot', 'Kagura', 'Valir', 'Beatrix', 'Joy', 'Nolan', 'Floryn', 'Khufra', 'Tigreal', 'Wanwan', 'Brody', 'Esmeralda', 'Yve', 'Hayabusa'],
  agen: ['Jett', 'Reyna', 'Sage', 'Omen', 'Killjoy', 'Clove', 'Raze', 'Sova', 'Neon', 'Viper'],
  makanan: ['nasi padang', 'mie ayam', 'bakso urat', 'seblak level 5', 'ayam geprek', 'martabak manis', 'nasi goreng kampung', 'sate padang', 'coto makassar', 'pisang epe', 'es teler', 'pempek', 'konro bakar', 'dimsum'],
  film: ['film horor yang baru tayang', 'drakor yang lagi rame', 'anime isekai baru', 'film superhero terbaru', 'dokumenter piramida', 'film komedi Indo', 'series detektif Netflix', 'film animasi Pixar'],
  lagu: ['lagu Tulus', 'lagu Hindia', 'lagu Nadin Amizah', 'lagu Sheila on 7', 'lagu NewJeans', 'lagu Juicy Luicy', 'lagu Dewa 19', 'lagu Bernadya', 'lagu Coldplay', 'OST anime'],
  tempat: ['Bali', 'Labuan Bajo', 'Raja Ampat', 'Jogja', 'Toraja', 'Bromo', 'Lombok', 'Malino', 'Bandung', 'Jepang'],
  hewan: ['kucing oren', 'kucing anggora', 'ikan cupang', 'kelinci', 'hamster', 'anak kucing kampung'],
  hobi: ['main gitar', 'lari pagi', 'masak', 'gowes', 'motret', 'nanem tanaman', 'baca komik', 'ngerakit gunpla'],
  hp: ['HP baru', 'earbuds baru', 'keyboard mekanikal baru', 'mouse gaming baru', 'smartwatch'],
};

// [pembicara 0|1, teks]; {a} = pembicara pertama, {b} = lawan bicara, {c}/{d} = orang yang diomongin
const BANK = {
  makan: [
    [[0, 'Makan apa nih {b}? Aku pesen {makanan} lagi 😅'], [1, 'Sama! Porsinya hari ini gede banget'], [0, 'Pantes ngantuk abis ini wkwk']],
    [[0, '{b}, sambalnya jangan diabisin dong'], [1, 'Hehe sorry, pedesnya nagih 🌶️']],
    [[0, 'Diet aku gagal lagi gara-gara {makanan}'], [1, 'Diet mulai Senin aja, tradisi 😂']],
    [[0, 'Abis makan enaknya mabar nggak sih?'], [1, 'Gas, tapi satu match aja ya']],
    [[0, 'Pernah nyoba {makanan} deket kantor?'], [1, 'Belum, enak?'], [0, 'Wajib! Besok kita ke sana']],
    [[0, 'Kenapa ya makan siang tuh selalu kerasa cepet banget'], [1, 'Karena kerjanya yang kerasa lama 😭']],
  ],
  ngopi: [
    [[0, 'Kopi ketiga hari ini ☕'], [1, 'Itu darah apa kopi {a}? 😂']],
    [[0, 'Es kopi susu atau americano?'], [1, 'Es kopi susu dong, americano pahit kayak revisi'], [0, 'HAHAHA bener juga']],
    [[0, '{b}, nitip satu ya'], [1, 'Oke, transfer dulu tapi 😏']],
    [[0, 'Mbak Sari bikin kopi gula aren tadi, enak parah'], [1, 'Serius? Aku belum kebagian 😤']],
    [[0, 'Matcha latte enak juga ternyata'], [1, 'Kamu udah pindah aliran? 😳']],
  ],
  santai: [
    [[0, 'Kemarin udah nonton MPL belom?'], [1, 'Udah! Gila comeback-nya'], [0, 'Konten minggu depan bahas itu aja kali ya']],
    [[0, 'Akhirnya kerjaan beres juga 🥳'], [1, 'Mantap, besok kita grind lagi']],
    [[0, 'Ada yang mau ke taman? Udaranya enak'], [1, 'Ikut! Sekalian ngadem']],
    [[0, 'Kolamnya kosong tuh, renang yuk'], [1, 'Lagi males basah, aku rebahan aja 😴']],
    [[0, 'Weekend ini mau ke mana {b}?'], [1, 'Rebahan, nonton {film}'], [0, 'Produktif banget 👍']],
    [[0, 'Baru nonton {film}, rekomen nggak?'], [1, 'Lumayan, endingnya bikin kepikiran'], [0, 'Wah jangan spoiler!']],
  ],
  game: [
    [[0, 'Push rank yuk {b}, aku stuck di Epic'], [1, 'Epic mulu dari musim lalu 🤭'], [0, 'Jangan dibuka aibnya dong']],
    [[0, 'Hero {hero} lagi meta banget sekarang'], [1, 'Iya, aku kemarin kena hajar {hero} 3 kali'], [0, 'Ban aja langsung 😤']],
    [[0, '{b} main {hero} kamu jago juga ternyata'], [1, 'Latihan diem-diem tiap malem 😎']],
    [[0, 'Patch Valorant baru udah nyoba?'], [1, 'Udah, {agen} di-buff lumayan'], [0, 'Bakal di-nerf minggu depan pasti']],
    [[0, 'Kemarin aku ace pake {agen} 🔥'], [1, 'Clip-nya mana? Upload dong'], [0, 'Lupa rekam 😭']],
    [[0, 'Free Fire ada event baru tuh'], [1, 'Bundle-nya bagus, top up di zataa aja ya hehe'], [0, 'Promosi terselubung 😂']],
    [[0, 'Mabar malem ini? Aku jadi tank deh'], [1, 'Deal, aku {hero}'], [0, 'Jangan feeding ya 🙏']],
    [[0, 'Kenapa sih tiap aku solo queue timnya afk semua'], [1, 'Karma revisi kali 😂']],
  ],
  acak: [
    [[0, 'Semalem mimpi aneh, kantor kita jadi kapal bajak laut'], [1, 'Terus kamu jadi apa?'], [0, 'Jadi burung beonya 🦜'], [1, 'Pas sih 😂']],
    [[0, 'Tebak-tebakan: ikan apa yang bisa terbang?'], [1, 'Apa?'], [0, 'Lelelawar 🦇'], [1, 'Aku resign aja deh']],
    [[0, 'Barusan beli {hp} pas flash sale 🤑'], [1, 'Pamer nih ceritanya'], [0, 'Dikit 😆']],
    [[0, '{b} punya hewan peliharaan nggak?'], [1, 'Ada {hewan}, galak banget sama tamu'], [0, 'Kayak bos pas revisi 😭']],
    [[0, 'Pengen liburan ke {tempat} 😩'], [1, 'Nabung dulu, akhir tahun kita jalan bareng'], [0, 'Janji ya!']],
    [[0, 'Lagi muter {lagu} terus dari pagi'], [1, 'Pantes mukamu galau 😂'], [0, 'Enak tau lagunya']],
    [[0, 'Sekarang aku lagi suka {hobi}'], [1, 'Wih, sejak kapan?'], [0, 'Sejak minggu lalu, masih semangat-semangatnya 😅']],
    [[0, 'Kalau menang lotre… eh nggak deh, kalau dapet bonus gede mau beli apa?'], [1, 'Kursi gaming yang nyaman'], [0, 'Pinggang kita emang udah minta tolong']],
    [[0, 'Cuaca hari ini panas banget ya'], [1, 'Makassar mode matahari dua 🥵']],
    [[0, 'Ada yang liat charger aku?'], [1, 'Dipinjem Raka kayaknya'], [0, 'Raka lagi Raka lagi 😤']],
    [[0, 'Fun fact: lumba-lumba tidur setengah otak'], [1, 'Kayak aku pas meeting jam 8 🐬']],
    [[0, 'Kenapa ya kalau kerja dari kantor lebih fokus'], [1, 'Soalnya kasur jauh 😂']],
    [[0, 'Kita butuh mesin es krim di cafe'], [1, 'Setuju! Ajuin ke bos'], [0, 'Kamu aja yang ngomong, aku takut 🫣']],
    [[0, 'Aku baru tau Mbak Sari jago main pingpong'], [1, 'Serius? Tantang dia minggu ini!']],
  ],
  kerja: [
    [[0, '{b}, headline yang ini kepanjangan nggak?'], [1, 'Dikit, potong 2 kata aja biar kebaca di HP']],
    [[0, 'Warna ungunya kurang nendang nggak sih?'], [1, 'Tambahin aksen emas, biar ala ML'], [0, 'Oke noted!']],
    [[0, 'Sumber beritanya udah dua kan?'], [1, 'Udah, aman']],
    [[0, 'Harga diamond hari ini ada yang berubah?'], [1, 'Aku cek web dulu bentar ya, jangan nebak 😆']],
    [[0, '{b}, render-nya udah kelar?'], [1, 'Bentar lagi, PC-ku lagi ngos-ngosan']],
    [[0, 'Caption-nya kurang CTA nih'], [1, 'Tambahin "top up di zataa.my.id" aja, simpel']],
    [[0, 'Konten {hero} kemarin engagement-nya naik'], [1, 'Mantap, bikin seri aja']],
    [[0, 'Jam tayang malam kayaknya lebih rame'], [1, 'Data minggu lalu juga bilang gitu 📈']],
  ],
  trading: [
    [[0, '{b}, CPI malam ini rilis jam berapa?'], [1, '20:30 WITA, siap-siap volatil 🔥'], [0, 'Oke, lot dikecilin dulu']],
    [[0, 'H4 masih bullish, tapi H1 udah bikin lower high'], [1, 'Tunggu konfirmasi di support dulu deh'], [0, 'Setuju, jangan FOMO']],
    [[0, 'Risk per trade tetap 1% ya'], [1, 'Siap, RR minimal 1:2 kan?'], [0, 'Betul, kalau nggak masuk ya NO TRADE']],
    [[0, 'Order udah ke-fill, SL TP kepasang'], [1, 'Mantap, aku kirim laporan ke Telegram']],
    [[0, 'Backtest versi baru winrate naik dikit'], [1, 'Forward test seminggu dulu sebelum deploy ya'], [0, 'Siap bos']],
    [[0, 'Spread lagi lebar banget nih'], [1, 'Tahan dulu entry-nya, tunggu normal']],
    [[0, 'Fed ngomong hawkish lagi 😬'], [1, 'Gold bisa turun, cek level 2 hari terakhir']],
  ],
  youtube: [
    [[0, 'Hook 3 detik pertama kurang nendang nih'], [1, 'Buka pakai pertanyaan aja: "Siapa yang mindahin batu 800 ton ini?"'], [0, 'Nah itu!']],
    [[0, 'Ini fakta apa teori, {b}?'], [1, 'Teori. Kasih label "menurut sebagian peneliti" ya'], [0, 'Oke, aman dari hoaks']],
    [[0, 'Fotonya lisensinya CC BY-SA'], [1, 'Sip, cantumin kreditnya di deskripsi']],
    [[0, 'Retention kemarin jeblok di detik 20'], [1, 'Bagian situ kebanyakan angka, besok dipadetin'], [0, 'Noted, max 1 angka per adegan']],
    [[0, 'Voice-over-nya kecepetan nggak?'], [1, 'Dikit, turunin 5% biar misteriusnya kerasa 🕯️']],
    [[0, 'Topik mitologi Yunani minggu ini apa?'], [1, 'Kotak Pandora aja, orang banyak salah paham']],
  ],
  story: [   // tim Zataa Story (misteri & horor Nusantara)
    [[0, 'Ini kejadian beneran atau cuma legenda, {b}?'], [1, 'Legenda. Tulis "konon" ya, jangan diklaim fakta'], [0, 'Siap, aman 👻']],
    [[0, 'Hook-nya: "Kenapa warga nggak berani lewat jembatan ini lewat jam 12?"'], [1, 'Nah gitu, langsung merinding'], [0, 'Hehe']],
    [[0, 'Foto arsip KITLV-nya lisensi bebas kan?'], [1, 'Iya, public domain. Kreditnya tetep dicantumin']],
    [[0, 'VO-nya pelanin dikit, biar kerasa seremnya'], [1, 'Oke, aku turunin tempo + kasih jeda sebelum twist']],
    [[0, 'TikTok kemarin banyak yang nanya lokasinya'], [1, 'Bikin part 2 aja, sekalian sejarah tempatnya'], [0, 'Gas, aku masukin antrean']],
    [[0, 'Musiknya jangan yang kena klaim lagi ya'], [1, 'Pakai ambience bikinan sendiri aja, aman']],
  ],
  // hubungan
  pacaran: [   // Zamiir & Aprista
    [[0, 'Udah makan belum? Jangan kerja mulu 🥺'], [1, 'Belum, nungguin kamu dong'], [0, 'Gombal ah 🙈']],
    [[0, 'Nanti malem nonton bareng yuk'], [1, 'Boleh, tapi aku yang pilih filmnya ya'], [0, 'Asal bukan horor 😤']],
    [[0, 'Kamu capek ya? Mukanya kusut'], [1, 'Dikit, tapi liat kamu langsung seger lagi'], [0, 'Dasar bos gombal 😆']],
    [[0, 'Kopinya aku pesenin yang less sugar ya'], [1, 'Kok tau? 🥰'], [0, 'Udah hafal lah']],
  ],
  pacaran2: [
    [[0, 'Pulang kerja nanti jalan bentar yuk'], [1, 'Ke mana?'], [0, 'Ke gazebo aja, liat bintang 🌙'], [1, 'Romantis amat 🙈']],
    [[0, 'Aku bawain {makanan} buat kamu'], [1, 'Ihh kamu tau aja aku laper 🥹']],
    [[0, 'Kamu duet sama aku pas karaoke ya'], [1, 'Lagu apa?'], [0, '{lagu}'], [1, 'Deal 🎤']],
    [[0, 'Jangan begadang lagi ya'], [1, 'Iya sayang… eh, iya {a} 😳'], [0, 'Hahaha ketauan']],
  ],
  pdkt: [
    [[0, 'Eh {b}, udah makan?'], [1, 'Udah, kamu?'], [0, 'Belum sih… mau bareng nggak? 😳'], [1, 'Boleh 🙂']],
    [[0, 'Aku liat kamu suka {lagu}?'], [1, 'Iya! Kok tau?'], [0, 'Kebetulan aja… hehe 🙈']],
    [[0, '{b}, ini kopinya, tadi kelebihan pesen'], [1, 'Kelebihan apa sengaja? 😏'], [0, 'K-kelebihan beneran kok']],
    [[0, 'Kamu kalau senyum gitu bikin aku lupa mau ngomong apa'], [1, 'Gombal pertama hari ini ya 😆'], [0, 'Belum yang terakhir']],
    [[0, 'Weekend ini free nggak, {b}?'], [1, 'Kayaknya free, kenapa?'], [0, 'Ada {film}, nonton bareng mau?'], [1, 'Boleh deh 😊']],
    [[0, 'Kok kamu jago banget sih main {hero}'], [1, 'Mau aku ajarin?'], [0, 'Mau banget 🥹']],
  ],
  ditolak: [
    [[0, 'Hai {b}… masih canggung ya kita'], [1, 'Dikit, tapi kita tetep temen kan?'], [0, 'Iya, tenang aja 🙂']],
    [[0, 'Pagi {b}'], [1, 'Pagi juga… semangat ya hari ini'], [0, 'Makasih 🙂']],
  ],
  putus: [
    [[0, 'Oh… hai'], [1, 'Hai'], [0, 'Aku ambil kopi dulu ya'], [1, '…oke']],
    [[0, 'File kemarin udah aku kirim'], [1, 'Oke, makasih'], [0, '…sama-sama']],
  ],
  teman: [
    [[0, '{b}, mabar nanti?'], [1, 'Gas! Kayak dulu ya'], [0, 'Udah biasa aja kan kita sekarang 😄'], [1, 'Udah, santai 🤝']],
    [[0, 'Seneng deh kita bisa ngobrol normal lagi'], [1, 'Iya, temen tetep temen 🙂']],
  ],
  sahabat: [
    [[0, '{b} traktir dong, kan sahabat'], [1, 'Sahabat apaan kalau cuma pas laper 😂']],
    [[0, 'Kamu kenapa? Mukanya ditekuk'], [1, 'Gapapa…'], [0, 'Udah, cerita aja, aku dengerin'], [1, 'Makasih ya, kamu emang yang paling ngerti 🫂']],
    [[0, 'Ingat nggak pertama kali kita ketemu, kamu nyasar ke ruang billiard'], [1, 'Jangan diungkit 😭']],
    [[0, 'Aku foto kamu tidur pas meeting kemarin'], [1, 'HAPUS SEKARANG'], [0, 'Udah aku jadiin stiker 🤣']],
  ],
  rival: [
    [[0, 'Desain kamu bagus… tapi masih bagus punyaku'], [1, 'Mimpi kamu 😤']],
    [[0, 'Taruhan traktir kopi, konten siapa yang views-nya lebih tinggi?'], [1, 'Siapin dompet ya'], [0, 'Kamu yang siapin 😏']],
    [[0, 'Kamu nyolong ide aku ya kemarin?'], [1, 'Ide bagus emang dateng ke orang yang tepat 💅'], [0, 'Ngeselin 😤']],
  ],
  gosip: [
    [[0, 'Eh, {c} sama {d} makin deket ya 👀'], [1, 'Iya! Kemarin makan siang berdua'], [0, 'Fix ini mah bentar lagi jadian']],
    [[0, 'Kamu liat nggak {c} senyum-senyum sendiri liat HP?'], [1, 'Pasti chat-an sama {d} 🤭']],
    [[0, 'Taruhan traktir es kopi, {c} sama {d} jadian bulan ini'], [1, 'Deal, aku pegang bulan depan 😂']],
    [[0, '{c} tadi nawarin kopi ke {d}, padahal dia nggak pernah nawarin aku'], [1, 'Ya beda lah, kamu bukan crush-nya 😆']],
  ],
  gosipPacaran: [
    [[0, '{c} sama {d} lucu ya, kemana-mana bareng'], [1, 'Bikin iri aja 😮‍💨']],
    [[0, 'Liat tuh {c} sama {d} ngedate di gazebo'], [1, 'Kita jagain dari jauh aja 🤫']],
  ],
  jadian: [
    [[0, 'BREAKING NEWS: {c} sama {d} JADIAN!! 🎉'], [1, 'HAH SERIUS?? Akhirnya!'], [0, 'PJ-nya ditunggu ya 😂']],
    [[0, 'Selamat ya {c} & {d} 💕'], [1, 'Langgeng ya kaliaan']],
  ],
  putusGosip: [
    [[0, 'Kamu udah denger? {c} sama {d} putus 😢'], [1, 'Hah, kok bisa? Kemarin masih baik-baik aja'], [0, 'Katanya beda prinsip… kasih mereka ruang dulu ya']],
    [[0, 'Jangan bahas pacaran dulu di depan {c} ya'], [1, 'Siap, aku ngerti 🤐']],
  ],
  curhatPutus: [
    [[0, 'Masih kepikiran {d}…'], [1, 'Wajar kok, butuh waktu'], [0, 'Iya… makasih udah mau dengerin'], [1, 'Kapan aja 🫂']],
    [[0, 'Kayaknya aku harus fokus kerja dulu deh'], [1, 'Bagus, sambil healing. Mau ikut mabar nanti?'], [0, 'Boleh, biar lupa dikit 😅']],
  ],
  ledek: [
    [[0, 'Itu bos sama Kak Aprista berduaan mulu ya 👀'], [1, 'Cieeee, kantor jadi berbunga-bunga 🌸']],
    [[0, 'Kapan nih undangannya bos? 😏'], [1, 'Kerja dulu kerja, hus hus 😂']],
    [[0, 'Pantes approve konten hari ini cepet, lagi bucin 🤭'], [1, 'Wkwk jangan kenceng-kenceng, kedengeran']],
  ],
  // ulang tahun
  ultah: [
    [[0, 'Selamat ulang tahun {c}!! 🎂🎉'], [1, 'HBD {c}! Wish you all the best 🥳']],
    [[0, 'Sore nanti tiup lilin di cafe, jangan lupa ya'], [1, 'Kuenya rasa apa?'], [0, 'Rahasia 🤫 pokoknya enak']],
    [[0, 'Kado buat {c} udah siap?'], [1, 'Udah, {hp} hasil patungan'], [0, 'Wih mantap!']],
    [[0, 'Jangan bilang-bilang ya, kita mau kasih surprise ke {c}'], [1, 'Aman, mulutku terkunci 🤐']],
  ],
  ultahSaya: [   // ngobrol sama yang ultah
    [[1, 'HBD {a}!! Panjang umur & makin sukses ya 🎂'], [0, 'Makasih banyak {b} 🥹']],
    [[1, 'Traktirannya mana nih yang ultah 😏'], [0, 'Nanti sore ada kue kok, sabar 😂']],
    [[1, 'Umur berapa sekarang {a}?'], [0, 'Rahasia negara 🤫']],
  ],
  ultahAbis: [
    [[0, 'Kuenya enak banget tadi 🍰'], [1, 'Aku nambah dua potong, jangan bilang siapa-siapa']],
    [[0, 'Muka {c} pas tiup lilin lucu banget'], [1, 'Udah aku rekam, nanti aku kirim ke grup 😂']],
  ],
  // event
  eventPre: [
    [[0, 'Malam ini {ev}! Ikut nggak {b}?'], [1, 'Ikut dong, siap-siap juara 😎'], [0, 'PD amat 😂']],
    [[0, 'Jagoanku buat {ev} malam ini: {c}'], [1, 'Aku pegang {d} sih'], [0, 'Taruhan traktir es kopi?'], [1, 'Deal!']],
    [[0, 'Aku udah latihan buat {ev} dari kemarin'], [1, 'Pantes nggak keliatan di cafe 🤭']],
  ],
  eventPost: [
    [[0, 'Gila tadi {ev} seru banget'], [1, 'Selamat buat {c}, mainnya keren!']],
    [[0, 'Final tadi tegang parah 😮‍💨'], [1, '{c} pantes juara sih'], [0, 'Minggu depan aku balas dendam']],
    [[0, 'Kamu kalah di babak awal ya kemarin? 😆'], [1, 'Jangan dibahas, lagi apes aja']],
  ],
  ob: [
    [[0, 'Mbak Sari, kopinya hari ini enak banget ☕'], [1, 'Makasih! Pake gula aren hari ini']],
    [[1, 'Awas, lantainya masih basah ya 🧹'], [0, 'Siap Mbak, jalan jinjit nih 😆']],
    [[0, 'Mbak udah makan belum?'], [1, 'Nanti abis beres-beres, gampang'], [0, 'Jangan telat makan lho Mbak']],
    [[1, 'Siapa yang naro gelas di meja meeting ini? 🙄'], [0, 'Hehe aku Mbak, maaf…']],
    [[1, 'Mas/Mbak, nanti ikut nonton turnamen nggak?'], [0, 'Ikut Mbak, sekalian nyemangatin']],
  ],
  curhat: [
    [[0, 'Capek banget hari ini 😮‍💨'], [1, 'Semangat {a}! Abis ini ngopi bareng yuk'], [0, 'Makasih ya 🥹']],
    [[0, 'Revisi lagi… aku salah di mana coba'], [1, 'Bukan salah kamu, bos emang detail. Itu tanda dia peduli'], [0, 'Iya sih, oke lanjut deh']],
    [[0, 'PC aku nge-hang pas render, ilang semua 😭'], [1, 'Autosave nyala nggak?'], [0, 'Nyala… untungnya'], [1, 'Nah kan aman, tarik napas dulu']],
    [[0, 'Wifi lemot banget hari ini'], [1, 'Pindah ke meja deket router aja'], [0, 'Udah, tetep aja 😤']],
    [[0, 'Ide lagi buntu nih'], [1, 'Coba jalan ke taman 10 menit, biasanya muncul'], [0, 'Oke aku coba']],
  ],
};
const KIND_OF = { kerja: 'kerja', trading: 'kerja', youtube: 'kerja', story: 'kerja', curhat: 'curhat', curhatPutus: 'curhat', pacaran: 'pacaran', pacaran2: 'pacaran', pdkt: 'pdkt',
  gosip: 'gosip', gosipPacaran: 'gosip', jadian: 'gosip', putusGosip: 'gosip', ledek: 'gosip', ultah: 'ultah', ultahSaya: 'ultah', ultahAbis: 'ultah', eventPre: 'event', eventPost: 'event' };

const idxOf = (id) => AGENTS.findIndex((a) => a.id === id);
const nameOf = (id) => AGENTS.find((a) => a.id === id)?.name ?? id;
const pickH = (arr, r) => arr[Math.floor(r * arr.length) % arr.length];

function fill(text, v, seed) {
  let k = 0;
  return text.replace(/\{(\w+)\}/g, (_, key) => (v[key] != null ? v[key] : FILL[key] ? pickH(FILL[key], hash(seed + (k++) * 3.7)) : `{${key}}`));
}

function topicOf(p1, p2, ctx, r) {
  const ids = [p1.a.id, p2.a.id];
  const rel = relationOf(ids[0], ids[1], ctx.date);
  if (rel && r < 0.75) {
    if (rel.a === 'owner') return 'pacaran';
    return { pacaran: 'pacaran2', pdkt: 'pdkt', putus: 'putus', ditolak: 'ditolak', teman: 'teman', sahabat: 'sahabat', rival: 'rival' }[rel.stage];
  }
  if (ids.includes('ob')) return 'ob';
  if (ctx.bdays.length) {
    if (ctx.bdays.includes(ids[0]) && r < 0.6) return 'ultahSaya';
    if (ctx.bdays.includes(ids[1]) && r < 0.6) return 'ultahSaya2';
    if (r < 0.3) return ctx.minute >= CAKE.end ? 'ultahAbis' : 'ultah';
  }
  if (ctx.ev && r > 0.62 && r < 0.9) {
    if (ctx.minute >= ctx.ev.start - 240 && ctx.minute < ctx.ev.start) return 'eventPre';
    if (ctx.minute >= ctx.ev.end && ctx.minute < ctx.ev.end + 180) return 'eventPost';
  }
  if (ids.includes('owner')) return r < 0.5 ? 'ledek' : null;   // bos jarang nimbrung obrolan santai, tapi sering diledekin
  const broke = ctx.rels.find((x) => x.stage === 'putus' && ids.includes(x.a) !== ids.includes(x.b) && (ids.includes(x.a) || ids.includes(x.b)));
  if (broke && r < 0.35) return 'curhatPutus';
  if (ctx.rels.some((x) => x.fresh && x.stage === 'pacaran' && x.a !== 'owner') && r < 0.3) return 'jadian';
  if (ctx.rels.some((x) => x.fresh && x.stage === 'putus') && r < 0.3) return 'putusGosip';
  if (r > 0.9) return ctx.rels.some((x) => x.stage === 'pdkt') ? 'gosip' : 'gosipPacaran';
  if (p1.mood?.key && ['marah', 'kesel', 'capek'].includes(p1.mood.key)) return 'curhat';
  if (p1.act === 'lunch' || p2.act === 'lunch') return r < 0.6 ? 'makan' : 'acak';
  if (p1.act === 'coffee' || p1.loc === 'cafe') return r < 0.45 ? 'ngopi' : r < 0.75 ? 'acak' : 'game';
  if (p1.act === 'work' && p2.act === 'work') {
    if (r < 0.25) return 'acak';
    return p1.a.team === 'trd' && p2.a.team === 'trd' ? 'trading' : p1.a.team === 'yt' && p2.a.team === 'yt' ? 'youtube'
      : p1.a.team === 'st' && p2.a.team === 'st' ? 'story' : 'kerja';
  }
  if (['free', 'break'].includes(p1.act)) return r < 0.3 ? 'santai' : r < 0.6 ? 'game' : 'acak';
  return null;
}

// orang yang diomongin (gosip / ultah / event)
function subject(topic, p1, p2, ctx, r) {
  const ids = [p1.a.id, p2.a.id];
  const pairOf = (stages) => ctx.rels.filter((x) => stages.includes(x.stage) && x.a !== 'owner' && !ids.includes(x.a) && !ids.includes(x.b));
  if (['gosip', 'gosipPacaran', 'jadian', 'putusGosip'].includes(topic)) {
    const want = topic === 'gosip' ? ['pdkt'] : topic === 'putusGosip' ? ['putus'] : ['pacaran'];
    const c = pickH(pairOf(want).filter((x) => topic !== 'jadian' || x.fresh), r);
    return c ? { c: nameOf(c.a), d: nameOf(c.b) } : null;
  }
  if (topic === 'curhatPutus') {
    const x = ctx.rels.find((y) => y.stage === 'putus' && (ids.includes(y.a) || ids.includes(y.b)));
    const me = ids.includes(x.a) ? x.a : x.b;
    return { swap: me !== ids[0], d: nameOf(me === x.a ? x.b : x.a) };
  }
  if (['ultah', 'ultahAbis'].includes(topic)) {
    const c = ctx.bdays.filter((id) => !ids.includes(id));
    return c.length ? { c: c.map(nameOf).join(' & ') } : null;
  }
  if (topic === 'eventPre' || topic === 'eventPost') {
    const P = ctx.ev, pl = P.players ?? [];
    const champ = P.champ ?? (P.teams ? P.teams[P.champTeam].name : P.champTeam);
    return { ev: P.name, c: topic === 'eventPost' ? (P.champ ? nameOf(champ) : champ) : nameOf(pickH(pl, r)), d: nameOf(pickH(pl, r * 0.7 + 0.13)) };
  }
  return {};
}

// pengumuman & momen event/ultah (bukan obrolan berpasangan): skor ronde, juara, ucapan pagi ultah
function moments(ctx) {
  const out = [];
  const add = (minute, from, to, kind, message) => out.push({ minute, from, to, kind, message });
  for (const id of ctx.bdays) {   // ucapan pagi dari beberapa teman
    const friends = AGENTS.filter((a) => a.id !== id && !a.ob).sort((x, y) => hash(idxOf(x.id) * 1.7 + ctx.dn) - hash(idxOf(y.id) * 1.7 + ctx.dn)).slice(0, 4);
    friends.forEach((f, k) => add(7 * 60 + 5 + k * 6 + Math.floor(hash(ctx.dn + k) * 4), f.id, id, 'ultah',
      pickH(['Selamat ulang tahun {c}!! 🎂', 'HBD {c} 🥳 sehat & makin sukses!', 'Happy birthday {c}! Traktiran ditunggu 😆', 'Met ultah {c} 🎉 semoga cita-citanya tercapai'], hash(ctx.dn * 2 + k)).replace('{c}', nameOf(id))));
    add(CAKE.start + 2, 'sec', null, 'ultah', `🎂 Ayo kumpul di cafe, tiup lilin buat ${nameOf(id)}! Selamat ulang tahun 🥳`);
    add(CAKE.start + 8, id, null, 'ultah', 'Makasih banyak semuanya 🥹 kuenya enak, kalian the best!');
  }
  const P = ctx.ev;
  if (!P) return out;
  add(7 * 60 + 40, 'sec', null, 'event', `📣 Nanti ${P.dow === 6 ? 'sore' : 'malam'} ada ${P.name} ${P.emoji}! Yang ikut siap-siap ya`);
  if (P.rounds) {
    for (const r of P.rounds) for (const [w, l] of r.games) {
      add(r.end - 1, w, l, 'event', pickH([`${P.emoji} ${r.name}: ${nameOf(w)} menang lawan ${nameOf(l)}!`, `${P.emoji} GG ${nameOf(l)}, aku lolos dari ${r.name.toLowerCase()} 😎`, `${P.emoji} ${r.name} beres, ${nameOf(w)} lanjut!`], hash(ctx.dn + w.length + l.length)));
    }
    add(P.end - 3, P.champ, null, 'event', `🏆 JUARA ${P.name}! Makasih ${nameOf(P.runner)}, final yang seru 🙌`);
    add(P.end - 1, 'owner', P.champ, 'event', `Selamat ${nameOf(P.champ)}! Hadiahnya voucher diamond dari bos 💎`);
  } else if (P.teams) {
    const [w, l] = [P.teams[P.champTeam], P.teams[1 - P.champTeam]];
    add(P.start + 2, w.ids[0], l.ids[0], 'event', `🎮 Draft pick dimulai! ${w.name} vs ${l.name}, Bo3`);
    add(P.end - 3, w.ids[0], null, 'event', `🏆 ${w.name} MENANG ${Math.max(...P.score)}-${Math.min(...P.score)}! MVP: ${nameOf(P.mvp)} 🔥`);
    add(P.end - 1, l.ids[0], w.ids[0], 'event', 'GG wp, minggu depan rematch! 😤');
  } else if (P.id === 'renang') {
    add(P.start + 3, 'sec', null, 'event', `🏊 Peserta: ${P.players.map(nameOf).join(', ')}. Siap… mulai!`);
    add(P.end - 3, P.champ, null, 'event', `🥇 Juara lomba renang ${P.times[0]} detik! Runner-up ${nameOf(P.order[1])} (${P.times[1]} dtk)`);
  } else if (P.id === 'kuis') {
    add(P.start + 5, 'sec', null, 'event', '❓ Soal pertama: hero ML pertama yang rilis tahun 2016 siapa?');
    add(P.end - 2, 'sec', null, 'event', `🏆 Juara kuis malam ini: Tim ${P.champTeam}! 🎉`);
  } else if (P.id === 'karaoke') {
    P.singers.forEach((id, k) => add(P.start + 6 + k * 12, id, null, 'event', `🎤 Giliranku! Nyanyi ${pickH(FILL.lagu, hash(ctx.dn + k))} 🎶`));
    add(P.end - 2, 'owner', null, 'event', 'Suara kalian bagus-bagus, minggu depan lanjut lagi 👏');
  }
  return out;
}

const ctxCache = new Map();
function dayCtx(date) {
  if (!ctxCache.has(date)) {
    const dn = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);
    const c = { date, dn, bdays: birthdaysOn(date), rels: relationsOn(date), ev: eventPlan(date, AGENTS) };
    c.moments = moments(c);
    ctxCache.set(date, c);
  }
  return ctxCache.get(date);
}

// obrolan simulasi di sekitar waktu t ({dow, minutes, date?}); real = status DB per agent
export function simulatedChats(t, real = {}) {
  const out = [];
  const ctx = dayCtx(dateOf(t));
  for (const x of ctx.moments) if (x.minute <= t.minutes && x.minute > t.minutes - LOOKBACK) out.push(x);
  const startBlock = Math.floor((t.minutes - LOOKBACK) / BLOCK);
  const endBlock = Math.floor(t.minutes / BLOCK);
  for (let b = Math.max(0, startBlock); b <= endBlock; b++) {
    const seed = b * 3.17 + ctx.dn * 101.3;
    const m = b * BLOCK + Math.floor(hash(seed + 0.5) * 3);
    if (m > t.minutes) continue;
    const tt = { ...t, minutes: m };
    const acts = AGENTS.map((a) => ({ a, ...activityAt(idxOf(a.id), a, tt, real[a.id]) }));
    const room = (x) => (x.loc === 'desk' ? `work-${x.a.team}` : x.loc);
    const here = acts.filter((x) => !['off', 'pray', 'meeting', 'sleep'].includes(x.act));
    const groups = {};
    for (const x of here) (groups[room(x)] ??= []).push(x);
    const rooms = Object.values(groups).filter((g) => g.length >= 2);
    if (!rooms.length) continue;
    const used = new Set();
    for (let s = 0; s < 2; s++) {   // sampai 2 obrolan sekaligus di ruangan berbeda
      const rs = hash(seed + s * 0.71);
      if (rs > (s === 0 ? 0.85 : 0.5)) continue;
      const free = rooms.filter((g) => !used.has(g));
      if (!free.length) break;
      const g = free[Math.floor(hash(seed * 7.7 + s) * free.length) % free.length];
      used.add(g);
      const i1 = Math.floor(hash(seed * 5.1 + s + 1) * g.length) % g.length;
      const i2 = (i1 + 1 + Math.floor(hash(seed * 9.3 + s) * (g.length - 1))) % g.length;
      let [p1, p2] = [g[i1], g[i2]];
      // pasangan yang punya hubungan & lagi satu ruangan lebih sering ngobrol berdua
      const partner = ctx.rels.find((x) => [x.a, x.b].includes(p1.a.id) && x.stage !== 'putus');
      const other = partner && g.find((y) => y.a.id === (partner.a === p1.a.id ? partner.b : partner.a));
      if (other && hash(seed * 2.2 + s) < 0.6) p2 = other;
      const r = hash(seed * 1.9 + s * 4.1);
      let topic = topicOf(p1, p2, { ...ctx, minute: m }, r);
      if (!topic) continue;
      let swap = false;
      if (topic === 'ultahSaya2') { topic = 'ultahSaya'; swap = true; }
      const subj = subject(topic, p1, p2, { ...ctx, minute: m }, hash(seed * 8.3 + s));
      if (!subj) continue;
      if (subj.swap) swap = true;
      if (swap) [p1, p2] = [p2, p1];
      const dialog = pickH(BANK[topic], hash(seed * 2.3 + s));
      const vars = { a: p1.a.name, b: p2.a.name, ...subj };
      dialog.forEach(([who, text], k) => {
        const minute = m + k;
        if (minute > t.minutes) return;   // belum terjadi
        const [from, to] = who === 0 ? [p1.a, p2.a] : [p2.a, p1.a];
        out.push({ minute, from: from.id, to: to.id, kind: KIND_OF[topic] ?? 'santai', message: fill(text, vars, seed + k * 13.1 + s) });
      });
    }
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
  return [...db, ...sim].sort((x, y) => y.minute - x.minute || (y.real ? 1 : 0) - (x.real ? 1 : 0)).slice(0, MAX).map((c) => ({ ...c, time: fmt(c.minute) }));
}
