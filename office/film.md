# SOP Film lemo-opuscar (semua divisi video, keputusan Owner 23 Nov 2026)

**Semua video divisi wajib dibuat pakai skill `lemo-opuscar`** (film yang digambar lewat kode, library `~/lemo-opuscar`, skill sudah terpasang di VPS & laptop). Gaya lama (gambar + Ken Burns `shorts.mjs`, klip film `shorts-clip.mjs`, template video About Esports) hanya untuk konten yang sudah terlanjur antre.

## 3 gaya per divisi, dipilih per video sesuai tema (Owner 23 Nov 2026, `node scripts/film.mjs styles`)
Nggak pakem satu gaya: tiap divisi punya 3 gaya yang paling cocok, dan **tiap video pakai gaya yang paling pas dengan temanya**. `film.mjs new … --pillar=<pilar topik>` otomatis memilih dari peta pilar → gaya; boleh pilih manual `--style=<gaya>` (harus salah satu dari 3). Variasikan: hindari gaya yang sama 3 video berturut-turut kecuali temanya memang paling cocok.

| Divisi (suara) | Gaya | Dipakai untuk tema |
|---|---|---|
| **Zaa History** (VoxCPM2) | `woodcut` Woodcut Print | tokoh, peristiwa & sejarah tersembunyi, kejadian aneh (pilar hidden_history, historical_figures, strange_events) |
| | `dark-documentary` Radar Sweep Documentary | situs, artefak, peradaban hilang, misteri & penemuan kuno (lost_civilizations, historical_mysteries, ancient_secrets) |
| | `stained-glass` Stained Glass | mitologi Yunani, dewa-dewi, legenda (greek_myth) |
| **Zaa Story** (ElevenLabs Naya) | `shadow-puppet` Shadow Puppetry (wayang) | legenda, mitos, ritual & misteri kuno Nusantara (legenda_mitos, ritual_mistis, misteri_kuno) |
| | `backrooms` Liminal Found Footage | tempat angker & horor lokasi (horor_sejarah) |
| | `newsreel` 1920s Newsreel | sejarah kelam & peristiwa nyata era kolonial, kapal hantu, hilang misterius (sejarah_kelam, peristiwa_aneh) |
| **Marvel Talk** (ElevenLabs Indah) | `pop-art` Pop Art | fakta, benda & teknologi (fakta_marvel) |
| | `manga-panels` Manga Panels | profil karakter, versus & ranking (karakter, ranking) |
| | `text-flash-cuts` Text Flash Cuts | lore, teori & berita/rumor yang dramatis (lore_teori, berita_mcu) |
| **Cowo Bingung** (ElevenLabs Depa) | `brick-toy` Brick Toy | "coba bikin sendiri", kenapa benda/bangunan dibuat begitu (coba_bikin, kenapa_gitu) |
| | `isometric-picture-book` Isometric People Scene | aturan & kebiasaan sehari-hari, fakta aneh tentang orang (fakta_aneh) |
| | `colored-pencil` Colored-Pencil Science Illustration | tubuh, hewan & alam (tubuh_alam) |
| **About Esports** (VoxCPM2) | `caption-news` Caption News | berita, hasil match, transfer, jadwal, patch (news/esport) |
| | `telestrator` Sports Telestrator | analisis draft, strategi, tips & meta (tips/analisis) |
| | `game-show` Rhythm Game Show | kuis, polling, prediksi, ranking & engagement (kuis/prediksi/ranking) |

**Film contoh per gaya** (titik awal, `EXAMPLE` di `scripts/film.mjs`): woodcut `films/_contoh/history-woodcut/` · shadow-puppet `films/_contoh/story-shadow-puppet/` · brick-toy `films/_contoh/cowo-brick-toy/` (**kontrak paling lengkap**: dur.json + karaoke()) · pop-art `films/marvel-vibranium-pop/`. Gaya lain belum punya contoh: film pertamanya dibuat dari `STYLE.md` + `DIRECTOR.md` (teknik boleh diambil dari demo: `sh <skill>/scripts/setup.sh demo <gaya>`), pola timeline + caption disalin dari film Cowo Bingung, lalu setelah di-✅ Owner didaftarkan sebagai contoh.

## Langkah (sesi harian, setelah naskah & cek fakta lolos)
1. `node scripts/film.mjs new <slug> --brand=<brand> --pillar=<pilar topik>` → kerangka `films/<slug>/` dengan gaya yang cocok (+ README berisi gaya & film contoh). Ganti gaya manual: `--style=<salah satu dari 3>`.
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

## Satu kata salah ucap (ElevenLabs)
Jangan bikin ulang seluruh take (±1.000 karakter). Bikin ulang baris itu saja: tulis `tmp/<x>/lines.json` berisi baris itu (`el` boleh dieja, mis. `me-le-dak`, + `seed`), `node scripts/eleven.mjs say tmp/<x>/lines.json tmp/<x> --brand=… L8`, cek whisper, salin `l8.wav` ke `films/<slug>/out/vo/`, perbarui `dur.json` + `python scripts/film/words.py`, lalu build ulang (take yang sama tidak dipotong ulang, jadi baris perbaikan tetap dipakai).

## Revisi ✏️ Owner
Bot brand menjalankan Claude untuk mengubah `films/<slug>/` (naskah `lines.json` / adegan `film.js`) lalu antre render ulang otomatis kalau isi folder berubah (`film.mjs` sidik jari). Judul/caption saja → kirim ulang tanpa render.
