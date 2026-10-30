# SOP Divisi Zataa History (YouTube Shorts sejarah kuno: Hidden History + 6 pilar lain)

**Channel lama @zataastory, sejak 25 Okt berganti nama jadi Zataa History** (akun zataatopup@gmail.com, Zernio akun 1). Niche misteri/horor Nusantara pindah ke divisi baru **Zataa Story** (tim Raditya, `office/story.md`); divisi ini tetap sejarah misteri kuno dunia.

**Status: JALAN** (sejak 16 Okt 2026). Produksi **4 Shorts/minggu** (mulai 26 Okt; dulu 7/minggu) lewat sesi harian; render otomatis di laptop, approval & upload lewat bot **@zataashortbot** (`scripts/shorts-bot.mjs`, jalan di watcher VPS).

## Alur otomatis
1. **Sesi harian** (Bagas → Nadhira → Laras → Galih): topik dari **bank topik** (`shorts-topics.mjs next`), riset, naskah, gambar di `assets/shorts/<topik>/` (+ `credits.txt`), lalu
   `node scripts/shorts-bot.mjs new <file.json>` → konten DB `channel: 'youtube'` (format/slot `shorts`, jam tayang dari riset harian Kirana, default 18:00 WIB) + masuk antrean laptop (`_laptop: 1`).
   file.json = `{ topic_id (wajib, status approved), title (≤60 karakter), caption (deskripsi: ringkasan + sumber + kredit visual), hashtags ("#Shorts #sejarah …"), sources, tags?, synthetic?, day?, jam? ("HH:MM" WIB), test?, spec: { voice, speed, tag, mood, scenes[{ img, vo, sub, place?, credit?, move? }] } }`. Path `img` relatif dari root repo.
2. **Laptop** (Task Scheduler "Zataa Laptop Worker" tiap 10 mnt → `scripts/laptop-worker.mjs` → `scripts/shorts-laptop.mjs <id> --submit`): gambar yang belum ada diambil dari VPS, render `scripts/shorts.mjs` (OmniVoice, 40–59 dtk), hasil ke `out/shorts/` VPS. Tidak ada fallback suara VPS: laptop mati >3 jam → Yoga kabari Owner; render gagal → `_laptop: 3` + Owner dikabari.
3. **Kirana** kirim video + judul/deskripsi ke Owner di @zataashortbot: ✅ Approve / ✏️ Revisi / ❌ Tolak (aturan Owner: tidak ada tombol upload). Owner bilang "langsung post/upload" = ✅ + upload saat itu juga.
4. ✅ → status `approved`, bot **upload otomatis di jam tayang** (`jam`; sudah lewat jam → langsung) **langsung Publik lewat Zernio** (`scripts/zernio.mjs`, keputusan Owner 18 Okt) → status `posted` + Kirana kirim link; topik di bank otomatis `published` + `published_url`. Zataa History tidak posting TikTok.
5. Fallback tanpa `ZERNIO_API_KEY`: `scripts/youtube.mjs` Private → `uploaded` + pengingat ubah ke Publik → Owner tekan **✅ Sudah Publik** → `posted`.
6. ❌ Tolak → topik balik `backlog` (catatan "ditolak Owner"), Claude CLI (tim YouTube) langsung bikin **Shorts pengganti** dari topik approved lain (patuhi kuota pilar) untuk hari & jam yang sama → render laptop → dikirim lagi.
7. ✏️ Revisi → Claude CLI (tim YouTube) ubah lewat `shorts-bot.mjs set` → render ulang di laptop → dikirim lagi (cuma judul/deskripsi → langsung dikirim ulang tanpa render).
- Pesan bebas Owner di @zataashortbot dijawab tim YouTube (Claude CLI); "status" = rekap tanpa AI. Urusan marketing/trading dioper ke bot kantor.
- Status Shorts: `draft` (antre/render) → `pending_approval` → `approved` (nunggu jam tayang) → `uploading` → `uploaded` (Private) → `posted` · `revision` · `rejected` · `upload_failed` (tombol coba lagi).
- CLI: `shorts-bot.mjs list | get <id> | set <id> <json> | queue <id> | submit <id> | upload <id> | say <agent> "<teks>"`. Jangan pakai `render.mjs`/`approval.mjs` untuk Shorts.

## Render
`node scripts/shorts.mjs <spec.json> [out.mp4]` (laptop: butuh OmniVoice). Contoh: `templates/samples/shorts-baalbek.json` (versi uji 30 dtk, render pakai `--test`).
- spec: `voice` (`misteri-cewe`, pilihan Owner), `speed` 0.9, `tag`, `mood` (`misteri | gurun | epik | tragis | alam`), `seed` (kosong = acak), `hook` (teks layar besar 3–6 kata di 0–2,6 dtk, **wajib**), `scenes[]` = `{ img, vo, sub, place?, credit?, move? }`.
- `vo` = teks yang dibacakan (angka ditulis huruf), `sub` = teks layar (angka boleh digit, `*kata*` = emas). **Durasi: minimal 28 dtk, target 30–40, maksimal 45** (5–6 adegan, 55–70 kata). Di luar itu render ditolak; `--test` untuk uji coba pendek.
- Foto disimpan di `assets/shorts/<topik>/` + `credits.txt` (kredit masuk deskripsi YouTube).

## Ritme
- **1 Shorts tiap hari (7/minggu)** — keputusan Owner 30 Okt (25–29 Okt sempat 4/minggu).
- **Kuota pilar (aturan Owner):** minimal **2 Hidden History** per minggu (Senin–Minggu), 2 sisanya bebas dari 6 pilar bebas (termasuk Mitologi Yunani). Dicek otomatis oleh `shorts-bot.mjs new`: kalau sisa slot minggu itu = sisa kebutuhan Hidden History, hari itu WAJIB Hidden History. Cek: `shorts-topics.mjs week`.
- 07:00–08:00 riset masing-masing → 08:00–08:30 briefing di Meeting YouTube (Lt.3) → produksi.
- Sebelum riset/naskah: `node scripts/office.mjs brief <id>` → `owner_feedback` = ❌/✏️ Owner 30 hari terakhir, jangan diulang.
- **Riset jam tayang tiap hari** (Kirana, aturan Owner): data YouTube Studio channel sendiri > hasil Shorts kita per jam > maks 2 pencarian web studi terbaru. Hasil → `jam` di Shorts hari itu + 1 kalimat alasan (`office.mjs log ypublish`). Channel belum punya data → uji jam berbeda, bandingkan tiap Minggu.
- Alur: Bagas (topik) → Nadhira (riset, ≤5 pencarian web) → Laras (naskah + cek fakta) → Galih (visual berlisensi) → Yoga (render 9:16 + VO) → Kirana (jam tayang + judul/SEO → ✅ Owner via Telegram → upload).
- **Tiap hari 19:00 WITA** Kirana kirim laporan harian ke Owner di @zataashortbot (otomatis, 0 token): subscriber, views, likes + kenaikan sejak kemarin, 5 video teratas, status produksi hari ini & besok, kuota minggu (x/7, Hidden History x/2), bank topik siap. Manual: `shorts-bot.mjs report` (`--dry` = cetak saja).
- **Minggu 19:30 WITA** laporan mingguan (otomatis): kenaikan subs/views seminggu, produksi vs target, top video, pilar paling ditonton → bahan evaluasi Bagas. Manual: `shorts-bot.mjs weekly [--dry]`.

## Bank topik (`scripts/shorts-topics.mjs`, DB tabel `shorts_topics`)
Tiap ide video wajib masuk bank dulu, lengkap dengan: `topic_id` (otomatis, mis. `HH-001`), `pillar`, `subject` (peristiwa/tokoh/tempat/objek), `core_question` (pertanyaan utama video), `angle` (sudut cerita), `hook` (pembuka 3 detik), `sources` (≥2 URL untuk verifikasi), `evergreen_score` (1–5: 5 = tetap relevan bertahun-tahun, 1 = cuma ramai sesaat), `status`, `published_url` (otomatis setelah tayang).
- Status: `backlog` (ide mentah) → `research` (Nadhira lagi verifikasi) → `approved` (Bagas setuju, data lengkap) → `production` (otomatis saat `shorts-bot new`) → `published` (otomatis saat tayang).
- CLI: `pillars | add <json> | list [status] [pillar] | get <id> | set <id> <json> | week [tgl] | next [tgl]`. Status `approved` ditolak kalau data belum lengkap.
- Target stok: selalu ada **≥10 topik approved, minimal 3 di antaranya Hidden History**. Nadhira tambah 1–2 ide/hari ke backlog dari risetnya; Bagas approve tiap pagi.
- Judul & naskah selalu **bahasa Indonesia** (contoh dari Owner yang berbahasa Inggris cuma referensi gaya).

### Pilar (kode `pillar`)
1. `hidden_history` (HH) — **Hidden History, WAJIB ≥2/minggu**: sejarah tersembunyi, fakta jarang diketahui, kisah masa lalu yang terlewat. Contoh: kenapa Mesir kuno berhenti bikin piramida, kota hilang di bawah pasir, fakta sejarah yang kedengarannya palsu, teknologi kuno yang belum sepenuhnya dipahami.
2. `lost_civilizations` (LC) — peradaban runtuh, kota ditinggalkan, masyarakat kuno yang hilang/berubah. Contoh: runtuhnya kota-kota Maya, naik-turunnya Kekaisaran Akkadia, kota kuno yang jadi gurun, nasib Peradaban Lembah Indus.
3. `historical_figures` (HF) — raja, kaisar, penemu, pemimpin, tokoh yang mengubah dunia. Contoh: kaisar yang "berperang melawan laut", jenius yang mati muda, bangkitnya Genghis Khan, penguasa yang paling disalahpahami.
4. `historical_mysteries` (HM) — misteri yang belum terpecahkan/masih diperdebatkan. Contoh: Koloni Roanoke, Manuskrip Voynich, siapa yang membangun Petra, hilangnya Ekspedisi Franklin.
5. `ancient_secrets` (AS) — teknologi kuno, penemuan, matematika & pengetahuan masa lalu. Contoh: beton Romawi yang awet berabad-abad, cara orang kuno melacak bintang, Mekanisme Antikythera, cara memindahkan batu raksasa.
6. `strange_events` (SE) — peristiwa nyata yang absurd/aneh. Contoh: Wabah Menari 1518, Perang Emu di Australia, Tahun Tanpa Musim Panas (1816), pasukan yang "kalah" lawan kelinci.
7. `greek_myth` (GM) — **Mitologi Yunani** (pilar bebas, setara pilar 2–6): dewa-dewi Olympus, Titan, pahlawan, monster, Troya/Odisseia. Wajib label "mitos/kisah kepercayaan" + sumber teks kuno.

Pilar 2–7 = **6 pilar bebas** untuk 2 slot non-Hidden History tiap minggu. Topik misteri/horor Nusantara = milik Zataa Story, bukan di sini (gilir, jangan pilar sama 2 hari berturut-turut).

## Retensi & hook (aturan 25 Okt, setelah semua video mentok ±1.000 views)
Masalah channel bukan topik/jumlah upload, tapi **3 detik pertama**: YouTube cuma dorong video yang lolos tes ±1.000 penonton pertama.
- **Target tiap video**: bertahan (engaged/views, proxy "ditonton vs di-swipe") **≥70%**, rata-rata ditonton **≥90%** (>100% = diulang). Angkanya otomatis di laporan harian/mingguan Kirana (YouTube Analytics, telat ±2 hari).
- **Frame pertama**: gambar paling kuat (close-up gelap/aneh, bukan pemandangan lebar) + teks `hook` besar langsung tampil, VO mulai di 0,15 dtk. Template sudah tanpa fade dari hitam.
- **Durasi 30–40 dtk** (5–6 adegan, 55–70 kata). Jangan nambah kalimat cuma buat ngejar durasi.
- **Komentar**: tiap video ditutup pertanyaan yang gampang dijawab; baris pertama deskripsi = pertanyaan yang sama.
- **Evaluasi**: bertahan <70% → yang salah hook/gambar pertama; ditonton <90% → tengah video kepanjangan/lambat. Bagas catat 1 pelajaran per minggu (`office.mjs memory ydir`).

## Aturan wajib
- Tiap klaim diberi label fakta / teori / mitos, minimal 2 sumber. Sumber & kredit visual masuk deskripsi.
- Visual hanya dari sumber berlisensi bebas (Wikimedia Commons, museum open access, NASA), gambar kode sendiri, atau render Blender. Rekonstruksi realistis → label konten sintetis.
- Jangan pakai pola yang sama persis tiap video (hook, struktur, gaya VO harus bervariasi).

## Yang masih perlu dibangun
0. **Video panjang 5–10 menit** (bahas full satu topik sejarah/mitologi) begitu channel tembus **±500 subscriber** (keinginan Owner 16 Okt). **Video panjang itu TAMBAHAN — Shorts 7/minggu tetap jalan seperti biasa**, jadi jadwal & jatah token disusun untuk dua-duanya. Laporan harian Kirana otomatis kasih tanda saat angka itu tercapai → Bagas susun rencana format & jadwal, minta ✅ Owner.
1. Data views/retention dari YouTube Analytics untuk laporan Minggu (Kirana).
