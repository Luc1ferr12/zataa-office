# SOP Divisi Zataa Story (misteri & horor Nusantara berbasis sejarah · YouTube + TikTok)

**Divisi baru sejak 26 Okt 2026 (keputusan Owner 25 Okt).** Channel YouTube baru **Zataa Story** + TikTok **@zataa.story** (akun zataastory@gmail.com), terpisah dari Zataa History (tim Bagas, `office/youtube.md`). Niche: cerita seram/mistis yang dicari penonton Indonesia, tapi tetap dibedah pakai fakta + sumber (beda dari channel horor biasa). Alasan: peminat konten misteri/horor lokal jauh lebih besar (Nessie Judge, Jurnal Risa, Nadia Omara jutaan subs), saingan versi "berbasis sejarah & sumber" masih sepi. Dorong subscriber: format **seri** ("Part 1/2"), ajakan follow spesifik di akhir.

Kode sama dengan Zataa History (`scripts/shorts-bot.mjs`, `shorts-topics.mjs`, `shorts.mjs`), bedanya **selalu pakai `--brand=story`** di tiap perintah. DB `contents.channel = 'story'`.

## Tim (Lt.2)
| id | Nama | Tugas |
|---|---|---|
| sdir | Raditya | Manajer: antrean topik, approve bank topik, briefing, evaluasi Minggu |
| sresearch | Sekar | Riset misteri & horor Nusantara + sumber (≤5 pencarian/hari) |
| sscript | Dinda | Naskah + hook + cek fakta (label fakta/teori/mitos) |
| svisual | Arga | Foto arsip & lokasi berlisensi bebas / gambar kode / Blender |
| svideo | Bima | Render 9:16 + VO OmniVoice (laptop) |
| spublish | Nayla | ✅ Owner di **@zataastorybot**, judul/deskripsi/caption, tayang YouTube + TikTok, laporan harian & mingguan |

## Akun & kunci (.env VPS)
- Bot Telegram **@zataastorybot**: `STORY_BOT_TOKEN` (penerima tetap `SHORTS_OWNER_ID`). Jalan sebagai proses anak watcher (`shorts-bot.mjs bot --brand=story`).
- Zernio **akun 2** (login zataastory@gmail.com): `ZERNIO_STORY_API_KEY` → TikTok @zataa.story + YouTube Zataa Story. Akun 1 (`ZERNIO_API_KEY`) = TikTok zataa.topup + YouTube Zataa History, **jangan pernah dipakai untuk Story**.
- Statistik/retensi YouTube Zataa Story: `STORY_YT_REFRESH_TOKEN` (sekali izin: `node scripts/youtube.mjs auth --brand=story` di laptop, login zataastory@gmail.com). Belum ada → laporan cuma TikTok + produksi.

## Alur otomatis
1. **Sesi harian** (Raditya → Sekar → Dinda → Arga): topik dari bank (`shorts-topics.mjs next --brand=story`), riset, naskah, gambar di `assets/shorts/<topik>/` (+ `credits.txt`), lalu
   `node scripts/shorts-bot.mjs new <file.json> --brand=story` → konten DB `channel: 'story'` + antrean laptop (`_laptop: 1`).
   file.json = `{ topic_id (wajib, approved), title (≤60 karakter), caption (baris 1 = pertanyaan komentar, lalu ringkasan + sumber + kredit visual), hashtags ("#Shorts #misteri #nusantara #horor …"), sources, tags?, synthetic?, day?, jam? ("HH:MM" WIB), test?, spec: { voice, speed, tag, mood, hook, scenes[{ img, vo, sub, place?, credit?, move? }] } }`. `tag` default "MISTERI NUSANTARA".
2. **Laptop** (Task Scheduler → `laptop-worker.mjs` → `shorts-laptop.mjs <id> --submit`): render OmniVoice 28–45 dtk, lalu otomatis `submit --brand=story`. Laptop mati >3 jam → Bima kabari Owner.
3. **Nayla** kirim video + judul/deskripsi ke Owner di @zataastorybot: ✅ Approve / ✏️ Revisi / ❌ Tolak. "langsung post" = ✅ + tayang saat itu juga.
4. ✅ → di jam tayang **upload YouTube Publik lewat Zernio akun 2**, lalu **otomatis tayang juga di TikTok @zataa.story** (video sama, caption = judul + pertanyaan + hashtag). TikTok gagal → Nayla kabari, YouTube tetap aman, ulang: `shorts-bot.mjs tiktok <id> --brand=story`.
5. ❌ → topik balik `backlog`, tim langsung bikin pengganti (hari & jam sama). ✏️ → ubah lewat `shorts-bot.mjs set <id> <json> --brand=story` → render ulang.
- CLI: `shorts-bot.mjs list | get | set | queue | submit | upload | tiktok | report | weekly --brand=story`.

## Ritme
- **7 Shorts/minggu, 1 per hari, tanpa libur.** 07:00–08:00 riset → 08:00–08:30 briefing → produksi.
- **Kuota pilar (mulai minggu 26 Okt):** minimal **3 Horor Bersejarah** per minggu, sisanya bebas dari 5 pilar lain. Dicek otomatis: kalau sisa slot = sisa kebutuhan Horor Bersejarah, hari itu WAJIB Horor Bersejarah. Cek: `shorts-topics.mjs week --brand=story`.
- Sebelum riset/naskah: `node scripts/office.mjs brief <id>` → `owner_feedback` jangan diulang.
- **Jam tayang**: Nayla riset tiap hari (data channel/TikTok sendiri > hasil Shorts kita per jam > maks 2 pencarian web). Belum ada data → uji jam beda tiap hari.
- **19:00 WITA** laporan harian Nayla di @zataastorybot (otomatis): YouTube (subs, views, top video, retensi) + TikTok (followers, views, top video) + produksi & kuota. **Minggu 19:30** laporan mingguan → bahan evaluasi Raditya. Manual: `shorts-bot.mjs report|weekly --brand=story [--dry]`.

## Bank topik (`scripts/shorts-topics.mjs --brand=story`)
Sama seperti Zataa History (`office/youtube.md` bagian Bank topik): tiap ide lengkap `pillar, subject, core_question, angle, hook, sources (≥2), evergreen_score` sebelum `approved`. Target stok **≥10 approved, minimal 4 Horor Bersejarah**. Sekar tambah 1–2 ide/hari, Raditya approve tiap pagi.

### Pilar (kode `pillar`)
1. `horor_sejarah` (HS) — **Horor Bersejarah, WAJIB ≥3/minggu**: tempat angker & cerita seram yang punya kisah nyata/sejarah di baliknya. Polanya: "katanya angker → faktanya apa yang pernah terjadi di sana". Contoh: Lawang Sewu, Benteng Van den Bosch (Benteng Pendem) Ngawi, Toko Merah & Geger Pacinan 1740, Museum Taman Prasasti, kota Pontianak yang namanya dari hantu.
2. `legenda_mitos` (LM) — legenda rakyat & makhluk mitos Nusantara, dikaitkan ke fakta (geologi, sejarah, asal-usul nama). Contoh: Nyi Roro Kidul & kamar 308, Sangkuriang = jejak Danau Bandung purba, Wewe Gombel. Wajib label "mitos/legenda".
3. `sejarah_kelam` (SK) — tragedi, bencana, wabah, pembantaian, kapal karam di Nusantara. Contoh: Tambora 1815, Krakatau 1883, pembantaian Banda 1621, wabah pes Malang 1911.
4. `misteri_kuno` (MK) — situs, kerajaan, manusia purba & peninggalan Nusantara yang masih misterius. Contoh: Gunung Padang, Situs Liyangan, Sriwijaya, Yupa Kutai, manusia Flores.
5. `ritual_mistis` (RM) — ritual, pemakaman & kepercayaan adat. Contoh: Ma'nene Toraja, kuburan Trunyan, Tiwah Dayak. Diceritakan dengan hormat.
6. `peristiwa_aneh` (PA) — kejadian/fenomena nyata yang ganjil. Contoh: kapal hantu SS Ourang Medan (kemungkinan hoaks, tulis jelas), Kelimutu ganti warna.

Gilir pilar 2–6, jangan pilar sama 2 hari berturut-turut (kecuali seri Part 1/2). Topik dunia (luar Nusantara) = milik Zataa History, bukan di sini.

## Retensi & hook
- **Target tiap video**: bertahan (engaged/views) **≥70%**, rata-rata ditonton **≥90%** (>100% = diulang). Angkanya di laporan Nayla (YouTube Analytics, telat ±2 hari).
- **Frame pertama**: gambar paling kuat (close-up gelap/aneh) + teks `hook` besar langsung tampil, VO mulai 0,15 dtk.
- **Durasi 30–40 dtk** (5–6 adegan, 55–70 kata). **Komentar**: tutup dengan pertanyaan gampang ("Kamu berani masuk sini malam-malam?"); baris pertama deskripsi = pertanyaan yang sama.
- **Evaluasi**: bertahan <70% → hook/gambar pertama salah; ditonton <90% → tengah kepanjangan. Raditya catat 1 pelajaran/minggu (`office.mjs memory sdir`).

## Aturan wajib
- **Horor tetap berbasis fakta:** hal gaib/penampakan selalu "konon / menurut cerita warga / kepercayaan setempat", tidak pernah sebagai fakta. Sisi sejarahnya wajib bersumber.
- **Tanpa SARA & hormat budaya:** ritual adat/agama tidak diejek, tidak disebut sesat. Tidak promosi/ajari praktik mistis (pesugihan, santet, dll.).
- **Korban nyata:** tanpa sensasi, tanpa foto jenazah/gore, tanpa nama korban kasus baru (<25 tahun) atau keluarganya.
- **Visual seram tapi jujur:** tidak ada "foto penampakan" palsu. Foto arsip (KITLV/Tropenmuseum/Nationaal Archief via Wikimedia, public domain), foto lokasi berlisensi bebas, siluet/ilustrasi kode, atau Blender (label sintetis).
- Tiap klaim label fakta / teori / mitos, minimal 2 sumber; sumber & kredit visual masuk deskripsi (TikTok cukup judul + pertanyaan + hashtag).
- Variasi hook, struktur, gaya VO tiap video (hindari konten massal berulang).

## Yang masih perlu dibangun
0. **Video panjang 5–10 menit** begitu tembus ±500 subscriber (Shorts tetap jalan).
1. Ruang & karakter kantor untuk tim Raditya (sprite pixel + chibi 3D, render latar Blender).
