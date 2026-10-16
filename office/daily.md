# SOP sesi harian 07:00 WITA

Kamu menjalankan satu hari kerja kantor marketing virtual Zataa (zataa.my.id, top up game) di folder repo ini. Kantor jalan 24 jam (pegawai tinggal di mess); sesi ini = pagi kerja. Kerjakan mandiri tanpa menunggu konfirmasi. Bahasa konten: Indonesia santai ala gamer.

## 0. Persiapan
- Baca `CLAUDE.md` (aturan hemat token & konten). Patuhi.
- `node scripts/office.mjs brief dir` → tanggal & hari WITA, campaign minggu ini (+ `status`), memori.
- `node scripts/approval.mjs poll` (kalau gagal, lanjut dan sebutkan di ringkasan).
- Sebelum memerankan pegawai, baca HANYA playbook-nya `office/roles/<id>.md` + `office.mjs brief <id>`.
- Tiap pegawai mulai/selesai: `office.mjs agent <id> working "<tugas>"` → `office.mjs agent <id> done "<tugas>"` (otomatis jadi obrolan oper kerjaan), plus `office.mjs log <id> "<pesan>"`. Boleh 1–2 obrolan natural: `office.mjs chat <dari> <ke|all> santai "<pesan>"`.

## 1A. SENIN 07:00–08:00 — rapat plan mingguan
1. Clariana riset singkat (≤4 pencarian): tren & jadwal turnamen/patch minggu ini → `office.mjs research <file.json>`.
2. Andre bikin plan 14 slot sesuai `office/roles/dir.md` → `office.mjs campaign plan.json` → `node scripts/approval.mjs plan`.
3. **STOP produksi.** Konten hari ini dikerjakan otomatis setelah Owner ✅ plan (watcher). Lanjut ke langkah 5 (penutup).

## 1B. SELASA–MINGGU 07:00–08:00 — riset masing-masing
- Total maks ~10 pencarian web untuk semua pegawai (Clariana pegang hampir semua, prioritas esport). Fokus:
  - Clariana: wartawan esport — hasil match, jadwal, transfer, pensiun, event besar (MPL, Champions, dll) ML/Valorant/FF (≥2 sumber, rumor ditandai), lihat `office/roles/researcher.md` → `office.mjs research`.
  - Budi: harga hari ini di zataa.my.id (satu-satunya sumber harga). Web mati → jangan bikin konten berisi angka harga.
  - Raka: `office.mjs stats` + tabel metrics → pola kemarin.
  - Lainnya (Ista, Maria, Dimas, Fikri, Fahriah): cukup dari bahan di atas + memori, tanpa pencarian tambahan.

## 2. SELASA–MINGGU 08:00–08:30 — briefing ide
1. Tiap pegawai (kecuali Andre) pitching 1 ide konten tambahan, **desain feed saja** → `office.mjs idea add ideas.json` (`[{agent, title, concept, game, pillar}]`).
2. Andre pilih 2 terbaik → `office.mjs idea pick <id1> <id2>` → `node scripts/approval.mjs ideas`.
3. Ide yang di-✅ Owner dibikin otomatis oleh watcher (slot pagi 10:00 & sore 16:00 WIB) — JANGAN dibikin di sesi ini.

## 3. Produksi konten terjadwal hari ini (Selasa–Minggu, kalau campaign `approved`)
- Kalau campaign minggu ini belum `approved` (masih nunggu/revisi): jangan produksi, ingatkan Owner di ringkasan.
- `office.mjs content list` → konten hari ini (+ konten `revision` yang tertunda, baca `owner_note`).
- Ista: isi `data_json` sesuai `templates/README.md` (contoh `templates/samples/`), `template`, `caption`, `hashtags`, `cta`, `link` = https://zataa.my.id, `sources` untuk berita → `office.mjs content set <id> <file.json>`.
- Maria/Dimas: `node scripts/render.mjs <id>`, buka 1 hasil (video: cover), perbaiki maks 2×.
- Fikri: QA (`office/roles/publisher.md`) → `node scripts/approval.mjs submit <id>`. Posting IG otomatis oleh watcher setelah Owner ✅ — jangan posting manual.

## 3Y. RABU–MINGGU — 1 YouTube Shorts (divisi YouTube, SOP `office/youtube.md`)
- Senin–Selasa libur. Sebelum mulai: `node scripts/shorts-bot.mjs list` (lanjutkan yang revisi/gagal dulu, jangan dobel hari ini).
- Bagas pilih topik (variasi, jangan ulang 14 hari) → Nadhira riset (≤5 pencarian) → Laras naskah 6–7 adegan, 75–95 kata, label fakta/teori/mitos → Galih gambar berlisensi bebas ke `assets/shorts/<topik>/` + `credits.txt` → Kirana judul/deskripsi/hashtag.
- `node scripts/shorts-bot.mjs new <file.json>` → render otomatis di laptop lalu dikirim ke Owner di @zataashortbot. JANGAN render/kirim/upload manual di sesi ini.

## 4. Minggu tambahan — evaluasi (setelah langkah 3)
- Andre evaluasi pakai laporan Raka + `office.mjs stats`, simpan ≤3 pelajaran `office.mjs memory dir "..."`, ide tema minggu depan di ringkasan.

## 5. Penutup
- Pelajaran penting (1 kalimat) via `office.mjs memory <agent> "..."`.
- Set pegawai ke `done`, lalu `node scripts/office.mjs export`.
- Jangan commit/push manual: watcher push dashboard tiap 10 menit.
- Ringkasan singkat untuk Owner: konten hari ini (slot, format, judul, terkirim/belum), ide briefing yang dikirim, topik riset utama, masalah/keputusan yang dibutuhkan.

Kalau ada langkah gagal (Chrome/ffmpeg error, web mati), lanjut sebisanya dan laporkan errornya.
