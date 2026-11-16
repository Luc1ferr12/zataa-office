# SOP sesi harian 07:00 WITA

Kamu menjalankan satu hari kerja Zaa Office (divisi About Esports = media esports IG/TikTok; web top up zataa.my.id lagi DIMATIKAN → nol promo/harga/top up di konten) di folder repo ini. Kantor jalan 24 jam (pegawai nggak pulang, aktivitas acak di luar jam kerja); sesi ini = pagi kerja. Kerjakan mandiri tanpa menunggu konfirmasi. Bahasa konten: Indonesia santai ala gamer.

## 0. Persiapan
- Baca `CLAUDE.md` (aturan hemat token & konten). Patuhi.
- `node scripts/office.mjs brief dir` → tanggal & hari WITA, campaign minggu ini (+ `status`), memori.
- `node scripts/approval.mjs poll` (kalau gagal, lanjut dan sebutkan di ringkasan).
- Sebelum memerankan pegawai, baca HANYA playbook-nya `office/roles/<id>.md` + `office.mjs brief <id>`.
- `owner_feedback` di brief = ❌/✏️ Owner 30 hari terakhir. Wajib dibaca & jangan diulang (topik, gaya, kesalahan yang sama).
- Tiap pegawai mulai/selesai: `office.mjs agent <id> working "<tugas>"` → `office.mjs agent <id> done "<tugas>"` (otomatis jadi obrolan oper kerjaan), plus `office.mjs log <id> "<pesan>"`. Boleh 1–2 obrolan natural: `office.mjs chat <dari> <ke|all> santai "<pesan>"`.

## 1A. SENIN 07:00–08:00 — rapat plan mingguan
1. Salsa riset singkat (`node scripts/feeds.mjs` dulu, lalu ≤4 pencarian): tren & jadwal turnamen/patch minggu ini → `office.mjs research <file.json>`.
2. Andre bikin plan 14 slot sesuai `office/roles/dir.md` → `office.mjs campaign plan.json` → `node scripts/approval.mjs plan`.
3. **STOP produksi marketing.** Konten hari ini dikerjakan otomatis setelah Owner ✅ plan (watcher). Lanjut ke langkah 3Y (Shorts tetap jalan Senin), lalu langkah 5 (penutup).

## 1B. SELASA–MINGGU 07:00–08:00 — riset masing-masing
- Total maks ~10 pencarian web untuk semua pegawai (Salsa pegang hampir semua, prioritas esport). Fokus:
  - Salsa: wartawan esport — mulai dari `node scripts/feeds.mjs` (0 token), lalu hasil match, jadwal, transfer, pensiun, event besar (MPL, Champions, dll) ML/Valorant/FF (≥2 sumber, rumor ditandai), lihat `office/roles/researcher.md` → `office.mjs research`.
  - Budi: LIBUR (web top up mati sejak 15 Nov 2026).
  - Raka: `office.mjs stats` + tabel metrics → pola kemarin.
  - Lainnya (Tiara, Vania, Dimas, Fikri; Fahriah & Budi libur): cukup dari bahan di atas + memori, tanpa pencarian tambahan.

## 2. SELASA–MINGGU 08:00–08:30 — briefing ide
1. Tiap pegawai marketing (kecuali Andre, Fahriah & Budi yang libur) pitching 1 ide konten tambahan, **feed atau video** (minimal 2 ide video di antaranya) → `office.mjs idea add ideas.json` (`[{agent, title, concept, format, game, pillar}]`, `format` = `feed`|`video`).
2. Andre cek `node scripts/analyst.mjs score` + `owner_feedback`, lalu pilih **3: 2 feed + 1 video** → `office.mjs idea pick <id1> <id2> <id3>` → `node scripts/approval.mjs ideas`.
3. Owner ✅ 1, 2, atau semua → dibikin otomatis oleh watcher (feed `pagi` 10:00 & `petang` 21:00, video `sore` 16:00 WIB) — JANGAN dibikin di sesi ini. Owner ❌ semua → watcher otomatis bikin ronde ide baru (maks 3 ronde/hari).

## 3. Produksi konten terjadwal hari ini (Selasa–Minggu, kalau campaign `approved`)
- Kalau campaign minggu ini belum `approved` (masih nunggu/revisi): jangan produksi, ingatkan Owner di ringkasan.
- `office.mjs content list` → konten hari ini (+ konten `revision` yang tertunda, baca `owner_note`).
- Tiara: isi `data_json` sesuai `templates/README.md` (contoh `templates/samples/`), `template`, `caption`, `hashtags`, `cta` (follow/komen/simpan, tanpa top up), `sources` untuk berita → `office.mjs content set <id> <file.json>`.
- Vania/Dimas: `node scripts/render.mjs <id>`, buka 1 hasil (video: cover), perbaiki maks 2×.
- Fikri: QA (`office/roles/publisher.md`) → `node scripts/approval.mjs submit <id>`. Posting IG otomatis oleh watcher setelah Owner ✅ — jangan posting manual.

## 3C. Zaa Clips (tim Hendra, SOP `office/clipper.md`)
Jalan sendiri tanpa sesi ini (bot Zaa Clips + laptop): campaign Clippo dibaca Chrome laptop 07:30, usulan ke Owner 07:45, clip dibikin cuma dari campaign yang di-✅. Sesi pagi cukup cek `node scripts/clipper.mjs jobs` → ada `failed` → catat penyebabnya di log (`office.mjs log cedit "..."`), jangan bikin clip manual.

## 3Y. Shorts — tiga divisi, kode sama, bedanya `--brand`
**Marvel Talk** (tim Reza, SOP `office/marvel.md`, mulai Senin 16 Nov 2026, SETIAP HARI 1 Shorts, YouTube + TikTok): langkahnya sama dengan Zaa Story di bawah, semua perintah pakai `--brand=marvel`, playbook `office/roles/v*.md`, kuota 7/minggu ≥3 Lore & Teori, dikirim ke Owner di bot Marvel Talk. **Visual = klip film relevan, BUKAN gambar/grafik kode** (gaya klip, keputusan Owner 15 Nov 2026): spec adegan `{vo, hl?, clips:[{find:"kata cari YouTube", note:"yang harus kelihatan", n?:1-3}]}` tanpa `img`/`sub`; klip dicari, diunduh & dipilih momennya OTOMATIS di laptop saat render (yt-dlp di VPS diblok YouTube → JANGAN coba unduh klip di VPS, JANGAN balik ke gaya gambar). Suara `kalem-2`.
**Zaa Story** (tim Raditya, SOP `office/story.md`, SETIAP HARI 1 Shorts, tayang YouTube + TikTok): semua perintah pakai `--brand=story`, playbook `office/roles/s*.md`, kuota 7/minggu ≥3 Horor Bersejarah, dikirim ke Owner di @zataastorybot. Langkahnya sama persis dengan Zaa History di bawah (ganti nama tim: Raditya → Sekar → Dinda → Arga → Bima → Nayla).
**Zaa History** (tim Bagas, SOP `office/youtube.md`, **SETIAP HARI 1 Shorts** (7/minggu sejak 30 Okt)):
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
