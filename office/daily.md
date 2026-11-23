# SOP sesi kerja (pagi 07:00 + sesi riset About Esports siang 12:00 / sore 16:00 / malam 20:00 WITA)

Kamu menjalankan satu hari kerja Zaa Office (divisi About Esports = media esports IG/TikTok; web top up zataa.my.id lagi DIMATIKAN → nol promo/harga/top up di konten) di folder repo ini. Kantor jalan 24 jam (pegawai nggak pulang, aktivitas acak di luar jam kerja); sesi ini = pagi kerja. Kerjakan mandiri tanpa menunggu konfirmasi (kecuali ✅ Owner di langkah 1 yang memang wajib). Bahasa konten: Indonesia santai ala gamer.

## 0. Persiapan
- Baca `CLAUDE.md` (aturan hemat token & konten). Patuhi.
- `node scripts/office.mjs brief dir` → tanggal & hari WITA, campaign minggu ini (+ `status`), memori.
- `node scripts/approval.mjs poll` (kalau gagal, lanjut dan sebutkan di ringkasan).
- Sebelum memerankan pegawai, baca HANYA playbook-nya `office/roles/<id>.md` + `office.mjs brief <id>`.
- `owner_feedback` di brief = ❌/✏️ Owner 30 hari terakhir. Wajib dibaca & jangan diulang (topik, gaya, kesalahan yang sama).
- Tiap pegawai mulai/selesai: `office.mjs agent <id> working "<tugas>"` → `office.mjs agent <id> done "<tugas>"` (otomatis jadi obrolan oper kerjaan), plus `office.mjs log <id> "<pesan>"`. Boleh 1–2 obrolan natural: `office.mjs chat <dari> <ke|all> santai "<pesan>"`.

## 1. About Esports — 4 sesi riset sehari (22 Nov 2026, menggantikan plan mingguan)
Tidak ada lagi plan mingguan Senin & briefing ide pagi. Berita esport basi dalam hitungan jam, jadi About Esports kerja per **sesi riset**: **pagi 07:00, siang 12:00, sore 16:00, malam 20:00 WITA** (cron: `scripts/vps/daily.sh` untuk pagi, `scripts/vps/esports-sesi.sh <siang|sore|malam>` untuk tiga lainnya). Satu sesi = satu siklus:
1. **Salsa riset** hanya berita HANGAT (terbit ≤6 jam untuk hasil/transfer/patch, ≤24 jam untuk preview/jadwal): `node scripts/feeds.mjs` dulu (0 token), lalu ≤3 pencarian web (total ≤12/hari untuk 4 sesi). Cek `office.mjs brief researcher` → `recent_topics` + ide hari ini supaya tidak dobel. Rumor ditandai rumor, ≥2 sumber untuk berita. Simpan: `office.mjs research <file.json>`.
2. **Pitching singkat**: Salsa + Tiara + Dimas masing-masing boleh usul sudut (feed atau video). Semua masuk `office.mjs idea add ideas.json` dengan `[{agent, title, concept, format, game, pillar, sesi:"<pagi|siang|sore|malam>", sources:[url,url]}]` — `concept` = angle + 1 kalimat kenapa hangat sekarang.
3. **Andre pilih 1–3** terbaik (tanpa kuota 2 feed + 1 video; boleh nol kalau memang tidak ada berita layak — kirim catatan saja, jangan paksa): `office.mjs idea pick <id…>` → `node scripts/approval.mjs ideas` (Telegram + tab Approval web). Cek `analyst.mjs score` + `owner_feedback` sebelum memilih.
4. **STOP.** Jangan produksi sebelum Owner ✅. Setelah ✅ watcher membangunkan tim: konten dibuat `office.mjs content new` dengan `"slot":"kilat","auto":1`, Tiara isi teks (+`sources`), Vania/Dimas render, Fikri `approval.mjs submit <id>` → **QA lolos = otomatis tayang tanpa approval kedua** dan Owner dikabari; QA bermasalah = tetap minta ✅ Owner. Owner ❌ semua = ditunggu sesi berikutnya (tidak ada ronde ulang).
5. Jangan ulang berita yang sudah tayang/ditolak hari itu (lihat `office.mjs idea list` dan `owner_feedback`).
- Hanya sesi **pagi** yang sekalian menjalankan langkah 3Y (Shorts) di bawah. Siang/sore/malam = riset About Esports saja, lalu penutup (langkah 5).
- Senin sama seperti hari lain; evaluasi Minggu (langkah 4) tetap ada, dan Raka tetap kirim laporan harian/mingguan.

## 3C. Zaa Clips (tim Hendra, SOP `office/clipper.md`)
Jalan sendiri tanpa sesi ini (bot Zaa Clips + laptop): campaign Clippo dibaca Chrome laptop 07:30, usulan ke Owner 07:45, clip dibikin cuma dari campaign yang di-✅. Sesi pagi cukup cek `node scripts/clipper.mjs jobs` → ada `failed` → catat penyebabnya di log (`office.mjs log cedit "..."`), jangan bikin clip manual.

## 3Y. Shorts — empat divisi, kode sama, bedanya `--brand`
**23 Nov 2026 (keputusan Owner): SEMUA video = film lemo-opuscar** (skill `lemo-opuscar`, SOP `office/film.md`). Gaya tetap: History `woodcut`, Story `shadow-puppet`, Marvel `pop-art`, Cowo Bingung `brick-toy`. Suara: Cowo Bingung/Story/Marvel ElevenLabs, History VoxCPM2. Alur per divisi: topik → riset → naskah jadi `films/<slug>/lines.json` → adegan `film.js` (salin film contoh `films/_contoh/…`) → `node scripts/film.mjs check films/<slug>` → `shorts-bot.mjs new <file.json> --brand=…` dengan `"spec":{"film":"films/<slug>"}`. Laptop yang render (±20–30 menit/film). Langkah "gambar berlisensi / 5–6 adegan 55–70 kata / spec scenes" di bawah DIGANTI ini; film 55–65 dtk (≤1.100 karakter). Urutan pengerjaan kalau waktu sesi mepet: Cowo Bingung → Story → Marvel → History (sisanya lanjut di sesi berikut, jangan bikin film setengah jadi).
**Cowo Bingung** (tim Aurel, cewek semua, SOP `office/cowo.md`, mulai Senin 23 Nov 2026, SETIAP HARI 1 Shorts, YouTube + TikTok): semua perintah `--brand=cowo`, playbook `office/roles/b*.md`, kuota 7/minggu ≥3 Kenapa Gitu?, dikirim ke Owner di @cowobingungbot. Tim: Aurel → Keisha → Naura → Zahra → Celine → Alya.
**Marvel Talk** (tim Reza, SOP `office/marvel.md`, SETIAP HARI 1 Shorts, YouTube + TikTok): semua perintah `--brand=marvel`, playbook `office/roles/v*.md`, kuota 7/minggu ≥3 Lore & Teori, dikirim ke Owner di bot Marvel Talk. Gaya klip film asli DIPENSIUNKAN 23 Nov 2026 → film `pop-art`; karakter digambar sebagai figur/siluet orisinal (tanpa kostum persis, logo, atau musik Marvel), nama karakter disebut di narasi.
**Zaa Story** (tim Raditya, SOP `office/story.md`, SETIAP HARI 1 Shorts, tayang YouTube + TikTok): semua perintah pakai `--brand=story`, playbook `office/roles/s*.md`, kuota 7/minggu ≥3 Horor Bersejarah, dikirim ke Owner di @zataastorybot. Langkahnya sama persis dengan Zaa History di bawah (ganti nama tim: Raditya → Sekar → Dinda → Arga → Bima → Nayla).
**Zaa History** (tim Bagas, SOP `office/youtube.md`, **SETIAP HARI 1 Shorts** (7/minggu sejak 30 Okt)):
- **Belajar dari data (22 Nov 2026, semua brand Shorts)**: `office.mjs brief <id>` sekarang punya blok `belajar`: `pola_data` (video TERBAIK vs TERBURUK + kelompok hook/panjang/suara/jam yang lift-nya beda) dan `eksperimen_minggu_ini` (SATU variabel per minggu per brand + varian yang paling kurang dipakai = `dibutuhkan_video_berikutnya`). Penulis wajib baca sebelum nulis hook; jangan ulang pola TERBURUK; JANGAN ubah variabel lain di luar eksperimen. Varian voice/speed/mood/jam dipasang otomatis oleh `shorts-bot.mjs new`; varian hook (pertanyaan/klaim) dan panjang (pendek ≤62 kata / panjang ≥63) dipenuhi penulis. Data ditarik watcher tiap ±6 jam (`scripts/learn.mjs`), laporan belajar Minggu 19:45 WITA di bot brand. CLI: `learn.mjs exp|report|collect [--brand=…]`.
- Sebelum mulai: `node scripts/shorts-bot.mjs list` (lanjutkan yang revisi/gagal dulu, jangan dobel hari ini) + `node scripts/shorts-topics.mjs week` (kuota: 7/minggu, ≥2 Hidden History).
- Topik hari ini dari `node scripts/shorts-topics.mjs next` (bank topik, status approved). Stok approved kurang dari 8 (atau Hidden History kurang dari 3) → Nadhira isi bank dulu (`add`, data lengkap, ≤5 pencarian) lalu Bagas `set` jadi approved. Tiap hari Nadhira tetap tambah 1–2 ide baru.
- Bagas pilih topik (variasi, jangan ulang 14 hari) → Nadhira riset (≤5 pencarian) → Laras naskah 5–6 adegan, 55–70 kata (30–40 dtk) + `hook` teks layar + pertanyaan penutup, label fakta/teori/mitos → Galih gambar berlisensi bebas ke `assets/shorts/<topik>/` + `credits.txt` → Kirana judul/deskripsi/hashtag + **riset jam tayang hari itu** (data channel dulu, maks 2 pencarian web) → isi `jam` (HH:MM WIB).
- `node scripts/shorts-bot.mjs new <file.json>` → render otomatis di laptop lalu dikirim ke Owner di @zataashortbot. JANGAN render/kirim/upload manual di sesi ini.

## 4. Minggu tambahan — evaluasi (setelah langkah 3)
- Andre evaluasi pakai laporan Raka + `office.mjs stats`, simpan ≤3 pelajaran `office.mjs memory dir "..."`, ide tema minggu depan di ringkasan.

## 5. Penutup
- Pelajaran penting (1 kalimat) via `office.mjs memory <agent> "..."`.
- Set pegawai ke `done`, lalu `node scripts/office.mjs export`.
- Jangan commit/push manual: watcher push dashboard tiap 10 menit.
- Ringkasan singkat untuk Owner: konten hari ini (slot, format, judul, terkirim/belum), ide briefing yang dikirim, topik riset utama, masalah/keputusan yang dibutuhkan.

Kalau ada langkah gagal (Chrome/ffmpeg error, web mati), lanjut sebisanya dan laporkan errornya.
