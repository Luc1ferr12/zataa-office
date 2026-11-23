# SOP Film lemo-opuscar (semua divisi video, keputusan Owner 23 Nov 2026)

**Semua video divisi wajib dibuat pakai skill `lemo-opuscar`** (film yang digambar lewat kode, library `~/lemo-opuscar`, skill sudah terpasang di VPS & laptop). Gaya lama (gambar + Ken Burns `shorts.mjs`, klip film `shorts-clip.mjs`, template video About Esports) hanya untuk konten yang sudah terlanjur antre.

## Gaya tetap per divisi (`node scripts/film.mjs styles`)
| Divisi | Gaya | Suara | Film contoh |
|---|---|---|---|
| Zaa History | `woodcut` | VoxCPM2 (laptop, CPU) | `films/_contoh/history-woodcut/` |
| Zaa Story | `shadow-puppet` | ElevenLabs **Indah** | `films/_contoh/story-shadow-puppet/` |
| Marvel Talk | `pop-art` | ElevenLabs (suara belum dipilih Owner → sementara VoxCPM) | belum ada, film pertama jadi contoh |
| Cowo Bingung | `brick-toy` | ElevenLabs **Depa** | `films/_contoh/cowo-brick-toy/` (**kontrak paling lengkap**) |
| About Esports | `caption-news` | VoxCPM2 | belum ada (alur esports masih dipindah, lihat `office/daily.md`) |
Ganti gaya hanya kalau Owner minta. Satu channel satu gaya → ciri khas konsisten.

## Langkah (sesi harian, setelah naskah & cek fakta lolos)
1. `node scripts/film.mjs new <slug> --brand=<brand>` → kerangka `films/<slug>/` (+ README berisi gaya & film contoh).
2. Baca **hanya** `~/lemo-opuscar/styles/<gaya>/STYLE.md` (+ `DIRECTOR.md` sekali kalau belum pernah). **Salin film contoh** (index.html, main.js, film.js, mix.py, file js pendukung) lalu ganti cerita & adegan. Jangan desain dari nol, jangan baca seluruh library (hemat token).
3. `lines.json` = naskah per baris `L1…Ln` (±8–11 baris, total ≤1.100 karakter ≈ 55–65 dtk):
   - `text` = kalimat bersih (dipakai caption & VoxCPM).
   - `el` = versi ElevenLabs (model v4) dengan tag ekspresi (`[curious]`, `[excited]`, `[whispers]`, `[surprised]`, `[confused]`, `[sighs]`, `[warmly]`, `[mysterious]`, `[impressed]`, `[annoyed]`), isi kata harus sama dengan `text`.
   - `style` (opsional, VoxCPM) = emosi baris dalam bahasa Indonesia ("bertanya penasaran lalu mengajak hangat").
   - Gaya bicara (semua brand): perempuan/laki-laki Indonesia natural, seperti cerita ke teman, intonasi naik-turun, tanya naik, pernyataan turun tegas, seru berenergi; JANGAN lebay, mendayu, formal, atau seperti robot.
4. `film.js` WAJIB: timeline dari `out/vo/dur.json` (detik tiap baris + jeda), caption **per kata** dari `out/vo/words.json` (pola `karaoke()` film Cowo Bingung: 2–3 kata, huruf besar putih bergaris hitam, kata yang sedang diucapkan berwarna). Tanpa merek/logo/karakter bermerek (lemo-opuscar melarang), tokoh = figur orisinal.
5. `node scripts/film.mjs check films/<slug>` harus `ok:true`.
6. `node scripts/shorts-bot.mjs new <file.json> --brand=<brand>` dengan `"spec": {"film": "films/<slug>"}` (+ topic_id, title, caption, hashtags, sources). Laptop otomatis: suara → caption per kata (whisper) → render 1080×1920 → mix −14 LUFS → kirim ke Owner. **Jangan render di VPS** (2 core/3 GB, nggak kuat).

## Hemat kredit & token
- ElevenLabs model `eleven_v4`, paket API Starter: **±34rb karakter/bulan ≈ 30 film per bulan untuk SEMUA divisi ElevenLabs** (1 film ≈ 1.000 karakter). Naskah dibuat **satu take** (tempo natural) lalu dipotong per baris; teks sama = tidak dibuat ulang (cache `out/vo/take.wav.json`), revisi naskah = 1 take baru. Kredit kurang → `film.mjs` otomatis pakai VoxCPM. Cek sisa: `node scripts/eleven.mjs quota`.
- Naskah >1.400 karakter ditolak `film.mjs check` (warning). Film >70 dtk = kepanjangan.
- Token: satu film ±1 sesi produksi. Pakai film contoh, ubah adegan seperlunya; jangan tulis ulang engine/helper yang sudah ada di contoh.

## Revisi ✏️ Owner
Bot brand menjalankan Claude untuk mengubah `films/<slug>/` (naskah `lines.json` / adegan `film.js`) lalu antre render ulang otomatis kalau isi folder berubah (`film.mjs` sidik jari). Judul/caption saja → kirim ulang tanpa render.
