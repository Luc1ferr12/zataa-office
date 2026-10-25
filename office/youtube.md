# SOP Divisi YouTube Shorts (misteri & horor Nusantara berbasis sejarah)

**Niche sejak 26 Okt 2026 (keputusan Owner):** pindah dari sejarah kuno dunia ke **misteri & horor Nusantara yang berbasis sejarah**: cerita seram/mistis yang dicari penonton Indonesia, tapi tetap dibedah pakai fakta + sumber (beda dari channel horor biasa). Alasan: peminat konten misteri/horor lokal jauh lebih besar (Nessie Judge, Jurnal Risa, Nadia Omara jutaan subs), saingan versi "berbasis sejarah & sumber" masih sepi. Dorong subscriber: format **seri** ("Part 1/2"), ajakan follow spesifik di akhir.

**Status: JALAN** (sejak 16 Okt 2026). Produksi **1 Shorts/hari, tiap hari** (7/minggu, sejak 19 Okt) lewat sesi harian; render otomatis di laptop, approval & upload lewat bot **@zataashortbot** (`scripts/shorts-bot.mjs`, jalan di watcher VPS).

## Alur otomatis
1. **Sesi harian** (Bagas → Nadhira → Laras → Galih): topik dari **bank topik** (`shorts-topics.mjs next`), riset, naskah, gambar di `assets/shorts/<topik>/` (+ `credits.txt`), lalu
   `node scripts/shorts-bot.mjs new <file.json>` → konten DB `channel: 'youtube'` (format/slot `shorts`, jam tayang dari riset harian Kirana, default 18:00 WIB) + masuk antrean laptop (`_laptop: 1`).
   file.json = `{ topic_id (wajib, status approved), title (≤60 karakter), caption (deskripsi: ringkasan + sumber + kredit visual), hashtags ("#Shorts #sejarah …"), sources, tags?, synthetic?, day?, jam? ("HH:MM" WIB), test?, spec: { voice, speed, tag, mood, scenes[{ img, vo, sub, place?, credit?, move? }] } }`. Path `img` relatif dari root repo.
2. **Laptop** (Task Scheduler "Zataa Laptop Worker" tiap 10 mnt → `scripts/laptop-worker.mjs` → `scripts/shorts-laptop.mjs <id> --submit`): gambar yang belum ada diambil dari VPS, render `scripts/shorts.mjs` (OmniVoice, 40–59 dtk), hasil ke `out/shorts/` VPS. Tidak ada fallback suara VPS: laptop mati >3 jam → Yoga kabari Owner; render gagal → `_laptop: 3` + Owner dikabari.
3. **Kirana** kirim video + judul/deskripsi ke Owner di @zataashortbot: ✅ Approve / ✏️ Revisi / ❌ Tolak (aturan Owner: tidak ada tombol upload). Owner bilang "langsung post/upload" = ✅ + upload saat itu juga.
4. ✅ → status `approved`, bot **upload otomatis di jam tayang** (`jam`; sudah lewat jam → langsung) **langsung Publik lewat Zernio** (`scripts/zernio.mjs`, keputusan Owner 18 Okt) → status `posted` + Kirana kirim link; topik di bank otomatis `published` + `published_url`. Lalu **cross-post TikTok Zataa Story** otomatis (video sama, caption = judul + pertanyaan + hashtag) kalau `ZERNIO_STORY_TIKTOK_ACCOUNT` (id akun di `zernio.mjs accounts`) diisi di .env VPS; gagal → Kirana kabari, YouTube tetap aman, ulang: `shorts-bot.mjs tiktok <id>`. Tidak pernah pakai akun TikTok zataa.topup.
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
- **7 Shorts/minggu, Senin–Minggu, 1 per hari, tanpa libur** (keputusan Owner 18 Okt; dulu 5/minggu Rabu–Minggu).
- **Kuota pilar (mulai minggu 26 Okt):** minimal **3 Horor Bersejarah** per minggu (Senin–Minggu), **maksimal 1 Misteri Dunia**, sisanya bebas dari 5 pilar Nusantara lain. Dicek otomatis oleh `shorts-bot.mjs new`: kalau sisa slot minggu itu = sisa kebutuhan Horor Bersejarah, hari itu WAJIB Horor Bersejarah; pilar lama (niche sejarah kuno dunia) ditolak. Cek: `shorts-topics.mjs week`.
- 07:00–08:00 riset masing-masing → 08:00–08:30 briefing di Meeting YouTube (Lt.3) → produksi.
- Sebelum riset/naskah: `node scripts/office.mjs brief <id>` → `owner_feedback` = ❌/✏️ Owner 30 hari terakhir, jangan diulang.
- **Riset jam tayang tiap hari** (Kirana, aturan Owner): data YouTube Studio channel sendiri > hasil Shorts kita per jam > maks 2 pencarian web studi terbaru. Hasil → `jam` di Shorts hari itu + 1 kalimat alasan (`office.mjs log ypublish`). Channel belum punya data → uji jam berbeda, bandingkan tiap Minggu.
- Alur: Bagas (topik) → Nadhira (riset, ≤5 pencarian web) → Laras (naskah + cek fakta) → Galih (visual berlisensi) → Yoga (render 9:16 + VO) → Kirana (jam tayang + judul/SEO → ✅ Owner via Telegram → upload).
- **Tiap hari 19:00 WITA** Kirana kirim laporan harian ke Owner di @zataashortbot (otomatis, 0 token): subscriber, views, likes + kenaikan sejak kemarin, 5 video teratas, status produksi hari ini & besok, kuota minggu (x/7, Horor Bersejarah x/3, Misteri Dunia x/1), bank topik siap. Manual: `shorts-bot.mjs report` (`--dry` = cetak saja).
- **Minggu 19:30 WITA** laporan mingguan (otomatis): kenaikan subs/views seminggu, produksi vs target, top video, pilar paling ditonton → bahan evaluasi Bagas. Manual: `shorts-bot.mjs weekly [--dry]`.

## Bank topik (`scripts/shorts-topics.mjs`, DB tabel `shorts_topics`)
Tiap ide video wajib masuk bank dulu, lengkap dengan: `topic_id` (otomatis, mis. `HS-001`), `pillar`, `subject` (peristiwa/tokoh/tempat/objek), `core_question` (pertanyaan utama video), `angle` (sudut cerita), `hook` (pembuka 3 detik), `sources` (≥2 URL untuk verifikasi), `evergreen_score` (1–5: 5 = tetap relevan bertahun-tahun, 1 = cuma ramai sesaat), `status`, `published_url` (otomatis setelah tayang).
- Status: `backlog` (ide mentah) → `research` (Nadhira lagi verifikasi) → `approved` (Bagas setuju, data lengkap) → `production` (otomatis saat `shorts-bot new`) → `published` (otomatis saat tayang).
- CLI: `pillars | add <json> | list [status] [pillar] | get <id> | set <id> <json> | week [tgl] | next [tgl]`. Status `approved` ditolak kalau data belum lengkap.
- Target stok: selalu ada **≥10 topik approved, minimal 4 di antaranya Horor Bersejarah**. Nadhira tambah 1–2 ide/hari ke backlog dari risetnya; Bagas approve tiap pagi.
- Judul & naskah selalu **bahasa Indonesia** (contoh dari Owner yang berbahasa Inggris cuma referensi gaya).

### Pilar (kode `pillar`)
1. `horor_sejarah` (HS) — **Horor Bersejarah, WAJIB ≥3/minggu**: tempat angker & cerita seram yang punya kisah nyata/sejarah di baliknya. Polanya: "katanya angker → faktanya apa yang pernah terjadi di sana". Contoh: Lawang Sewu, Benteng Van den Bosch (Benteng Pendem) Ngawi, Toko Merah & Geger Pacinan 1740, Museum Taman Prasasti, kota Pontianak yang namanya dari hantu.
2. `legenda_mitos` (LM) — legenda rakyat & makhluk mitos Nusantara, dikaitkan ke fakta (geologi, sejarah, asal-usul nama). Contoh: Nyi Roro Kidul & kamar 308, Sangkuriang = jejak Danau Bandung purba, Wewe Gombel, Kelimutu danau arwah. Wajib label "mitos/legenda".
3. `sejarah_kelam` (SK) — tragedi, bencana, wabah, pembantaian, kapal karam di Nusantara. Contoh: Tambora 1815 & kerajaan yang terkubur, Krakatau 1883, pembantaian Banda 1621, wabah pes Malang 1911.
4. `misteri_kuno` (MK) — situs, kerajaan, manusia purba & peninggalan Nusantara yang masih misterius. Contoh: Gunung Padang, Situs Liyangan, Sriwijaya yang sempat terlupakan, Yupa Kutai, manusia Flores.
5. `ritual_mistis` (RM) — ritual, pemakaman & kepercayaan adat. Contoh: Ma'nene Toraja, kuburan Trunyan, Tiwah Dayak. Diceritakan dengan hormat (bukan diejek atau dibikin seram berlebihan).
6. `peristiwa_aneh` (PA) — kejadian/fenomena nyata yang ganjil. Contoh: kapal hantu SS Ourang Medan (kemungkinan hoaks, tulis jelas), Kelimutu ganti warna, orang hilang di gunung yang tercatat media.
7. `misteri_dunia` (MD) — **maks 1/minggu**: misteri & sejarah kuno luar Nusantara (stok topik lama: Voynich, Nan Madol, wabah menari, Talos, dll.).

Pilar lama (Hidden History, Lost Civilizations, Historical Figures, Historical Mysteries, Ancient Secrets, Strange Events, Mitologi Yunani) sudah nggak dipakai buat topik baru; topik approved lama yang Nusantara dipindah ke `misteri_kuno`, sisanya ke `misteri_dunia`. Gilir pilar 2–6, jangan pilar sama 2 hari berturut-turut (kecuali seri Part 1/2).

## Retensi & hook (aturan 25 Okt, setelah semua video mentok ±1.000 views)
Masalah channel bukan topik/jumlah upload, tapi **3 detik pertama**: YouTube cuma dorong video yang lolos tes ±1.000 penonton pertama.
- **Target tiap video**: bertahan (engaged/views, proxy "ditonton vs di-swipe") **≥70%**, rata-rata ditonton **≥90%** (>100% = diulang). Angkanya otomatis di laporan harian/mingguan Kirana (YouTube Analytics, telat ±2 hari).
- **Frame pertama**: gambar paling kuat (close-up gelap/aneh, bukan pemandangan lebar) + teks `hook` besar langsung tampil, VO mulai di 0,15 dtk. Template sudah tanpa fade dari hitam.
- **Durasi 30–40 dtk** (5–6 adegan, 55–70 kata). Jangan nambah kalimat cuma buat ngejar durasi.
- **Komentar**: tiap video ditutup pertanyaan yang gampang dijawab; baris pertama deskripsi = pertanyaan yang sama.
- **Evaluasi**: bertahan <70% → yang salah hook/gambar pertama; ditonton <90% → tengah video kepanjangan/lambat. Bagas catat 1 pelajaran per minggu (`office.mjs memory ydir`).

## Aturan wajib
- **Horor tetap berbasis fakta:** hal gaib/penampakan selalu ditulis "konon / menurut cerita warga / kepercayaan setempat", tidak pernah sebagai fakta. Sisi sejarahnya (tahun, peristiwa, tokoh) wajib bersumber.
- **Tanpa SARA & hormat budaya:** ritual adat/agama diceritakan apa adanya, tidak diejek, tidak disebut sesat. Tidak promosi/ajari praktik mistis (pesugihan, santet, dll.).
- **Korban nyata:** tragedi & kasus diceritakan tanpa sensasi, tanpa foto jenazah/gore, tanpa nyebut nama korban kasus baru (<25 tahun) atau keluarganya.
- **Visual seram tapi jujur:** tidak ada "foto penampakan" palsu. Suasana seram dari foto arsip (KITLV/Tropenmuseum/Nationaal Archief via Wikimedia, public domain), foto lokasi berlisensi bebas, siluet/ilustrasi kode, atau Blender (label sintetis).
- **Format seri** dianjurkan untuk topik yang kuat (Part 1/2, tayang hari berurutan); akhir video ajak follow spesifik ("follow biar nggak ketinggalan part 2").
- Tiap klaim diberi label fakta / teori / mitos, minimal 2 sumber. Sumber & kredit visual masuk deskripsi.
- Visual hanya dari sumber berlisensi bebas (Wikimedia Commons, museum open access, NASA), gambar kode sendiri, atau render Blender. Rekonstruksi realistis → label konten sintetis.
- Jangan pakai pola yang sama persis tiap video (hook, struktur, gaya VO harus bervariasi).

## Yang masih perlu dibangun
0. **Video panjang 5–10 menit** (bahas full satu misteri/kisah Nusantara) begitu channel tembus **±500 subscriber** (keinginan Owner 16 Okt). **Video panjang itu TAMBAHAN — Shorts 7/minggu tetap jalan seperti biasa**, jadi jadwal & jatah token disusun untuk dua-duanya. Laporan harian Kirana otomatis kasih tanda saat angka itu tercapai → Bagas susun rencana format & jadwal, minta ✅ Owner.
1. Data views/retention dari YouTube Analytics untuk laporan Minggu (Kirana).
