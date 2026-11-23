# Zaa Office — handbook

Kantor virtual **Zaa Office** (dulu Zataa, ganti nama 15 Nov 2026): divisi **About Esports** (eks Marketing, media esports TikTok/YouTube), **Zaa History**, **Zaa Story**, **Marvel Talk**, **Cowo Bingung** (fakta unik, 23 Nov 2026), Trading.
**Video SEMUA divisi = film lemo-opuscar (Owner 23 Nov 2026)**: skill `lemo-opuscar` (library `~/lemo-opuscar`, terpasang di VPS & laptop), SOP `office/film.md`, film contoh `films/_contoh/`, `node scripts/film.mjs new|check|build`. Gaya tetap: History `woodcut`, Story `shadow-puppet`, Marvel `pop-art`, Cowo Bingung `brick-toy`, About Esports `caption-news`. Suara: **ElevenLabs** (`scripts/eleven.mjs`, paket API Starter ±34rb karakter/bulan) untuk Cowo Bingung (Depa), Story (Indah), Marvel (suara belum dipilih → sementara VoxCPM); **VoxCPM2** (env Studio Maliki, laptop CPU) untuk History & About Esports. Render film hanya di laptop.
**Web top up zataa.my.id DIMATIKAN Owner (15 Nov 2026)** → About Esports nol promo/top up/harga/zataa.my.id; Budi libur. Nyalain lagi: `.env` `STORE_ON=1` (Budi jalan, QA balik wajib CTA toko). Handle/akun/bot/env/service lama (`zataa*`) tetap, cuma nama tampilan yang ganti. Claude memerankan semua pegawai secara berurutan: sesi Shorts 1× pagi + **About Esports 4 sesi riset/hari** (pagi 07:00, siang 12:00, sore 16:00, malam 20:00 WITA, sejak 22 Nov 2026). Owner approve via Telegram/web: Shorts = tiap video; About Esports = **hasil riset tiap sesi** (✅ → konten dibuat → lolos QA langsung tayang tanpa approval kedua).

## Aturan hemat token (wajib)
- Jangan baca file besar/riwayat. Konteks per pegawai cukup dari `node scripts/office.mjs brief <agent>`.
- Desain feed **selalu pakai template** di `templates/` (skema: `templates/README.md`). Video = film lemo-opuscar: **mulai dari film contoh** `films/_contoh/<brand>`, baca hanya `STYLE.md` gaya brand, jangan desain/engine ulang dari nol.
- Riset esport mulai dari `node scripts/feeds.mjs` (RSS, 0 token); riset tren maksimal ~10 pencarian web per hari (mayoritas esport oleh Salsa), simpan hasil lewat `office.mjs research`.
- Simpan pelajaran penting (1 kalimat) dengan `office.mjs memory <agent> "..."`, jangan catatan panjang.
- Akhiri sesi dengan `office.mjs export` lalu commit + push `docs/`.

## Pegawai (`agent id`)
| id | Nama | Tugas |
|---|---|---|
| dir | Andre | Director About Esports (santai tapi tegas). Pilih 1–3 berita hangat tiap sesi riset (tanpa plan mingguan sejak 22 Nov 2026). Minggu: evaluasi + ide minggu depan |
| sec | Nabila | Sekretaris pribadi Owner: catat keuangan pribadi Owner lewat bot Telegram sendiri @zataaaccountingbot ke Google Sheet (`scripts/finance-bot.mjs` + `finance.mjs`, haiku, data TIDAK masuk DB/web). Meja sendiri di ruang Bos |
| researcher | Salsa | Tren & berita ML / Valorant / Free Fire, turnamen, transfer pemain, update patch |
| copywriter | Tiara | Headline, isi template, caption, hashtag, CTA |
| designer | Vania | Render feed/carousel dari template → JPG 1080×1080 IG feed (+9:16) |
| video | Dimas | Render video 9:16 dari template |
| publisher | Fikri | QA akhir, kirim ke Telegram Owner untuk approval (`scripts/approval.mjs submit <id>`); video yang di-✅ tayang IG Reels + TikTok Publik (via Zernio); draf IG Story harian + balasan komen ke Owner buat posting manual (`scripts/engage.mjs`, otomatis di watcher) |
| ads | Fahriah | **LIBUR sejak 20 Okt 2026** (iklan Meta belum bisa; default libur kecuali `ADS_PAUSE=0`, nyalain lagi `boost.mjs resume` kalau Owner minta). Boost post IG terbaik (usul via Telegram, budget bulanan dikunci; otomatis lewat watcher, `scripts/boost.mjs`). Owner minta ubah budget → `boost.mjs budget <bulanan> [per_boost] [hari]` (min Meta ±Rp18rb/hari). Jeda/lanjut: `boost.mjs pause|resume` |
| analyst | Raka | Data IG tiap 3 jam + laporan About Esports harian 19:00 & mingguan Minggu 19:30 WITA di bot kantor (otomatis, `scripts/analyst.mjs`); riset pagi dari data |
| price | Budi | **LIBUR sejak 15 Nov 2026** (web top up mati, `STORE_ON` ≠ 1). Pantau harga zataa.my.id tiap 2 jam, perubahan → usul konten promo (otomatis, `scripts/price.mjs`) |
| ob | Mbak Sari | Office girl (animasi kantor saja, tidak diperankan Claude) |
| tdir | Mahendra | Trading Director: atur alur agent trading XAUUSD |
| tresearch | Davina | Berita & kalender ekonomi (Fed, CPI, NFP, USD), sentimen emas |
| ttech | Keira | Analisa teknikal XAUUSD multi-timeframe |
| trisk | Aryaputra | Keputusan BUY/SELL/NO TRADE + risiko, gerbang `riskGate` sebelum order (dari trader-skill); pemilik EA MQL5 |
| texec | Wiratama | Eksekusi order ke EA MT5, SL/TP |
| teval | Jihan | Evaluasi trade, backtest, usulan perbaikan |
| treport | Selena | Laporan trading ke Telegram |
| ydir | Bagas | Manajer YouTube Shorts **Zaa History** (sejarah kuno dunia): antrean topik, briefing, evaluasi Minggu |
| yresearch | Nadhira | Riset misteri kuno dunia + sumber (≤5 pencarian/hari) |
| yscript | Laras | Naskah Shorts + cek fakta (label fakta/teori/mitos) |
| yvisual | Galih | Visual berlisensi bebas / gambar kode / Blender |
| yvideo | Yoga | Render Shorts 9:16 + VO OmniVoice |
| ypublish | Kirana | ✅ Owner di @zataashortbot, judul/deskripsi/SEO, upload YouTube (Publik via Zernio) + TikTok @zaa.history (sejak 16 Nov 2026: konten baru langsung ikut tayang jam 18:00, 10:00 WIB upload ulang 1 konten lama dari YouTube; Zernio `ZERNIO_HISTORY_API_KEY`, satu login dengan YouTube), laporan Shorts harian 19:00 & mingguan Minggu 19:30 WITA (channel + produksi + kuota) |
| sdir | Raditya | Manajer **Zaa Story** (misteri & horor Nusantara): antrean topik, briefing, evaluasi Minggu |
| sresearch | Sekar | Riset misteri & horor Nusantara + sumber (≤5 pencarian/hari) |
| sscript | Dinda | Naskah + hook + cek fakta (label fakta/teori/mitos) |
| svisual | Arga | Foto arsip & lokasi berlisensi bebas / gambar kode / Blender |
| svideo | Bima | Render Shorts 9:16 + VO OmniVoice |
| spublish | Nayla | ✅ Owner di @zataastorybot, tayang YouTube + TikTok Zaa Story (Zernio akun 2), laporan harian 19:00 & mingguan Minggu 19:30 WITA |
| vdir | Reza | Manajer **Marvel Talk** (lore, teori, fakta & berita MCU): antrean topik, briefing, evaluasi Minggu |
| vresearch | Citra | Riset Marvel & berita/rumor MCU + sumber (≤5 pencarian/hari) |
| vscript | Fajar | Naskah + hook + cek fakta (label FAKTA/TEORI/RUMOR) |
| vvisual | Intan | Visual = klip film/komik asli yang RELEVAN dengan topik (cari+unduh+pilih momen otomatis di laptop, `clip-scout.mjs`), potongan 1–2 dtk, grafik kode hanya pelengkap |
| vvideo | Kevin | Render Shorts 9:16 + VO OmniVoice |
| vpublish | Putri | ✅ Owner di bot Marvel Talk, tayang YouTube + TikTok (Zernio akun 3), laporan harian & mingguan |
| cdir | Hendra | Manajer **Zaa Clips**: saring campaign Clippo (app.clippo.id), usul 3 terbaik ke Owner tiap pagi |
| cbrief | Maya | Baca brief campaign, pilih momen dari transkrip |
| cedit | Rizky | Edit clip 9:16 + subtitle + hook (laptop, ffmpeg) |
| ccopy | Wulan | Hook, caption, SEMUA hashtag & tag wajib brief |
| cpublish | Tasya | Upload TikTok + IG (Zernio akun 4), pantau views, ajukan ke Clippo, laporan 19:00 |
| bdir | Aurel | Manajer **Cowo Bingung** (fakta unik/nyeleneh, tim cewek semua): antrean topik, briefing, evaluasi Minggu |
| bresearch | Keisha | Riset fakta unik + ≥2 sumber (≤5 pencarian/hari) |
| bscript | Naura | Naskah coba–gagal–berhasil + tag ekspresi ElevenLabs (`lines.json`) + cek fakta |
| bvisual | Zahra | Film lemo-opuscar Brick Toy (`film.js`, dari `films/_contoh/cowo-brick-toy`) |
| bvideo | Celine | Suara ElevenLabs Depa, caption per kata, cek render laptop |
| bpublish | Alya | ✅ Owner di @cowobingungbot, tayang YouTube + TikTok (Zernio `ZERNIO_COWO_API_KEY`), laporan harian & mingguan |

## Shorts: empat divisi, kode sama (`scripts/brand.mjs`, pilih `--brand=history|story|marvel|cowo`)
**Cowo Bingung** (tim Aurel, `b*`, cewek semua, sejak 23 Nov 2026): fakta unik/nyeleneh/lucu sehari-hari (format "coba kita bikin sendiri"), YouTube + TikTok cowo.bingung65, 7/minggu ≥3 Kenapa Gitu?, `channel 'cowo'`, SOP `office/cowo.md`, bot @cowobingungbot `COWO_BOT_TOKEN` (proses anak watcher), Zernio `ZERNIO_COWO_API_KEY`, film `brick-toy` + suara ElevenLabs Depa. Ruang di Lt.4 (bekas Studio Podcast), briefing Meeting Kreator 09:00.
Alur film (semua brand): naskah `films/<slug>/lines.json` + adegan `film.js` → `film.mjs check` → `shorts-bot.mjs new` dengan `"spec":{"film":"films/<slug>"}` → laptop (`shorts-laptop.mjs` → `film.mjs build`: suara → whisper caption per kata → lemo-opuscar 1080×1920 → −14 LUFS) → submit.
**Marvel Talk** (tim Reza, `v*`, sejak 16 Nov 2026): lore/teori/fakta + berita MCU, YouTube + TikTok baru, 7/minggu ≥3 Lore & Teori, `channel 'marvel'`, SOP `office/marvel.md`, bot `MARVEL_BOT_TOKEN` (proses anak watcher, nyala sendiri begitu token diisi), Zernio akun 3 `ZERNIO_MARVEL_API_KEY`. Gaya video sejak 23 Nov 2026 = film lemo-opuscar `pop-art` (gaya klip film asli `shorts-clip.mjs` DIPENSIUNKAN, cuma untuk antrean lama); karakter = figur/siluet orisinal, DILARANG kostum persis/logo/musik Marvel. Ruang & meeting di Lt.4 (Meeting Kreator 08:00).
| | **Zaa History** (tim Bagas, `y*`) | **Zaa Story** (tim Raditya, `s*`) |
|---|---|---|
| Niche | sejarah misteri kuno dunia + mitologi Yunani | misteri & horor Nusantara berbasis sejarah (gaib selalu "konon") |
| Platform | YouTube channel lama (dulu @zataastory, ganti nama 25 Okt), akun zataatopup | YouTube channel baru + TikTok @zataa.story, akun zataastory |
| Kuota | **7/minggu** (1/hari), ≥2 Hidden History | **7/minggu** (1/hari), ≥3 Horor Bersejarah |
| Bot / Zernio | @zataashortbot `SHORTS_BOT_TOKEN` · Zernio `ZERNIO_HISTORY_API_KEY` (YouTube + TikTok) | @zataastorybot `STORY_BOT_TOKEN` · Zernio `ZERNIO_STORY_API_KEY` (YouTube + TikTok) |
| DB / SOP | `channel 'youtube'` · `office/youtube.md` | `channel 'story'` · `office/story.md` (semua perintah `--brand=story`) |
Zaa History & Zaa Story: ruang di Lt.2 (bilik & ruang manajer sendiri per brand), meeting di Lt.3 (Meeting YouTube gantian: History 08:00, Story 08:30). Tiap ide wajib dari **bank topik** `scripts/shorts-topics.mjs` (pilar milik satu brand; topic_id, pillar, subject, core_question, angle, hook, sources, evergreen_score, status, published_url); kuota dicek otomatis per brand. Target: **±500 subscriber → tambah video panjang 5–10 menit**; Shorts tetap jalan bareng.
Alur: sesi harian `node scripts/shorts-bot.mjs new <file.json> [--brand=story]` → render OmniVoice otomatis di laptop (`laptop-worker.mjs` → `shorts-laptop.mjs`, submit ikut brand) → publisher kirim ke Owner di bot brand itu → ✅ Approve / ✏️ Revisi / ❌ Tolak (❌ = tim bikin pengganti) → upload YouTube di jam tayang **langsung Publik lewat Zernio** akun brand → `posted` → Story otomatis juga posting TikTok. Bot History jalan di watcher, bot Story = proses anak watcher. Upload + statistik/retensi YouTube **cuma lewat Zernio** (OAuth Google & `youtube.mjs` dihapus 21 Nov 2026). About Esports punya login Zernio sendiri `ZERNIO_ESPORTS_API_KEY` (TikTok esports.news12 + YouTube About Esports).
Skill `.claude/skills/yt-*` (MIT): manajer `/yt-plan` + `/yt-audit` bulanan, riset `/yt-viral`, naskah `/yt-script` (`hookscore.py`), publisher `/yt-package` `/yt-seo` `/yt-retention` (kurva manual dari YouTube Studio) `/yt-comment`; suara `office/youtube/voice-<brand>.md`. Cara pakai per pegawai ada di playbook-nya.

## Divisi Zaa Clips (campaign Clippo → TikTok + IG, sejak 16 Nov 2026, SOP `office/clipper.md`)
**LIBUR sejak 20 Nov 2026 (Owner)**: jangan kerjain apa pun untuk Clips (`cdir`/`cbrief`/`cedit`/`ccopy`/`cpublish`) sampai Owner prompt lagi. Worker laptop & bot Clips mati kecuali `.env` `CLIPPER_ON=1`.
`scripts/clipper.mjs` (VPS, bot `CLIPPER_BOT_TOKEN` proses anak watcher) + `clipper-chrome.mjs` & `clipper-laptop.mjs` (laptop, dipanggil `laptop-worker.mjs`). Clippo **nolak request dari server (403)** → semua akses Clippo (baca campaign, Join, ajukan clip) lewat **Chrome laptop Owner yang login** + ekstensi Claude in Chrome (`claude --chrome`); jangan akalin proteksinya. Alur: 07:30 laptop baca campaign → 07:45 bot usul 3 terbaik → **Owner ✅ wajib** → 3 clip/hari (`CLIP_PER_DAY`): yt-dlp/gdown → whisper.cpp → Claude pilih momen sesuai brief → ffmpeg 9:16 → TikTok + IG Reels (Zernio akun 4 `ZERNIO_CLIP_API_KEY`) → tiap jam cek views; ≥ min views (1.000) & like rate ≥0,5% → laptop ajukan ke Clippo. Video jangan dihapus 180 hari.

## Tim Trading (XAUUSD saja)
Jalan otomatis 0 token di VPS: service `zataa-trading` (`scripts/trading/run.mjs`), siklus tiap candle M15: Mahendra → Davina → Keira → Aryaputra → Wiratama → Jihan → Selena. Laporan Selena di bot trading: harian 19:00 WITA, mingguan Sabtu 07:00 WITA.
Mode `paper` (default, simulasi) → `demo` → `live` (hanya Owner, konfirmasi dua langkah). Owner kontrol lewat Telegram: `trading status|jeda|lanjut|mode …|terapkan <id>|tutup semua`.
Data: `node scripts/trading/cli.mjs status` — jangan ngarang angka trading. EA: `trading/mql5/ZataaBridge.mq5`. Tes lokal pakai `TRD_SILENT=1` (`.env` laptop kirim Telegram asli).

Sebelum memerankan pegawai, baca **hanya** playbook-nya: `office/roles/<id>.md` (keahlian Marketing & Trading diadaptasi dari agency-agents, MIT).

Denah kantor 4 lantai (`docs/js/px/scene.js`): Lt.1 indoor Mushola + wudhu, Gudang Mbak Sari, Cafe & Resto, Ruang Santai (+ arcade/pingpong); outdoor taman, gazebo, kolam, sign ZAA OFFICE · Lt.2 tangga pojok kiri, R. Manajer YouTube/Story/Marketing/Trading, bilik YouTube/Zaa Story/Marketing/Trading (+ rak server) · Lt.3 3 ruang meeting, Billiard (4 meja, 2 orang/meja, 1 game 10 menit), Ruang Bos (+ meja sekretaris Nabila, kursi tunggu di depannya), Bioskop Mini (+ tangga ke Lt.4 sebelah ruang Bos) · Lt.4 (16 Nov 2026) R. Manajer Zaa Clips & Marvel, Bilik Zaa Clips, Bilik Marvel Talk, Meeting Kreator, R. Manajer & Bilik Cowo Bingung (23 Nov 2026, bekas Studio Podcast). Tanpa mess/kamar mandi. Tampilan web = **pixel art top-down 2D** (`docs/js/topdown.js` + `docs/js/td/map.js` peta, `td/chars.js` sprite; mode 3D Blender dipensiunkan 14 Nov 2026). Ubah denah → cukup edit `scene.js`, peta top-down ikut otomatis.

Update status visual: `office.mjs agent <id> working "<tugas>"` → selesai `office.mjs agent <id> done "<tugas>"`, dan log singkat `office.mjs log <id> "<pesan>"`.
`done` otomatis menulis obrolan oper kerjaan ke panel Chit-chat. Boleh tambah 1–2 obrolan natural per sesi (santai/curhat, singkat): `office.mjs chat <dari> <ke|all> <oper|santai|curhat> "<pesan>"`.

## Approval dari web (20 Nov 2026)
Selain Telegram, Owner bisa ✅/✏️/❌ di tab **✅ Approval** web (`docs/js/approve.js`): konten About Esports + Shorts History/Story/Marvel, plan mingguan, ide briefing, Zaa Clips (campaign usulan Hendra + clip jadi). Default cuma yang jadwalnya hari ini ke depan, yang lewat jadwal dilipat. Server `scripts/web-api.mjs` jalan di watcher (127.0.0.1:8790), HTTPS lewat Cloudflare quick tunnel (`scripts/vps/zataa-tunnel.service`, alamat otomatis ditulis ke `docs/data/api.json`). Kunci = `.env` `WEB_APPROVAL_TOKEN` (kosong = server mati). Keputusan masuk jalur yang sama dengan tombol Telegram (About Esports → antrean `office-bot.mjs`, Shorts → `tmp/web-inbox/<brand>/` diambil bot brand, Zaa Clips → `tmp/web-inbox/clips/` diambil `clipper.mjs`), bot ikut kabarin "🌐 Dari web". Boost belum (tetap Telegram).

## Chat Owner via Telegram
Bot **chit-chat** (`scripts/chitchat-bot.mjs`, di watcher, `CHITCHAT_BOT_TOKEN`): pure ngobrol santai, bukan kerja. Obrolan santai web diterusin (deterministik, 0 token; /santai default · /rame · /diem · /siapa), Owner nimbrung → pegawai bales via Haiku, masuk `chats` kind `nimbrung` → panel Chit-chat web.
**Lampiran (16 Nov 2026):** ke-8 bot bisa baca foto, video (6 frame, ffmpeg-static), PDF/dokumen & link (web: isi ringkas; YouTube/TikTok/IG: judul+deskripsi+thumbnail via `yt-dlp`) lewat `scripts/media.mjs` (`digest(m, token, bot)` → catatan prompt), tetap sesuai kamar bot-nya. Bot kantor (About Esports) sejak 16 Nov 2026 **tanpa n8n**: long polling langsung di watcher (`scripts/office-bot.mjs`, `OFFICE_BOT_DIRECT=1`; antrean keputusan `tmp/office-bot.json` → `approval.mjs poll()`). File di `tmp/telegram/<bot>/`, dihapus >3 hari (Nabila langsung dihapus).
**Satu pegawai = satu bot (22 Nov 2026, `scripts/bots.mjs`):** peta pegawai → bot kamarnya (About Esports = bot kantor, Nabila = @zataaaccountingbot, y*/s*/v*/c*/t* = bot divisinya). `approval.mjs sayAs(agent, …)` otomatis kirim ke bot kamar pegawai itu (bot kamar belum diisi di `.env` → jatuh ke bot kantor); Owner manggil pegawai divisi lain di bot yang salah → manajer bot itu bilang "X ada di bot Y" (bukan dijawab orang asing); `formatReply` nggak membiarkan pegawai divisi lain ikut ngomong. Alert sesi kerja gagal pakai Andre (bot kantor), pengingat kuota Claude pakai Nabila (bot keuangan).
**Voice note & lampiran lengkap (22 Nov 2026, `scripts/media.mjs`):** semua bot sekarang bisa buka voice note/audio (ditranskrip: whisper.cpp `WHISPER_BIN`+`WHISPER_MODEL` → faster-whisper → opsional `GROQ_API_KEY`/`OPENAI_API_KEY` — API = audio dikirim ke penyedia itu, aktif hanya kalau Owner mengisi key), suara di dalam video, `.docx/.xlsx/.pptx` (teks diekstrak), subtitle YouTube & audio TikTok/IG/X ≤10 menit. Voice note jadi teks pesan biasa (perintah/revisi lisan langsung jalan). Tidak ada mesin transkripsi di server → bot jujur bilang belum bisa dengar. **VPS belum tentu punya whisper**: pasang salah satu mesin di atas.
Semua bot (About Esports, Shorts, Trading, Nabila) jawab pertama pakai **Haiku** (`scripts/haiku.mjs`): pertanyaan apa pun dijawab langsung (data kantor read-only), cuma perintah kerja yang dioper ke model utama / bot divisinya. ❌/✏️ Owner otomatis jadi `owner_feedback` di `office.mjs brief`. Pesan bebas Owner di Telegram dikerjakan watcher lewat `scripts/ask.mjs`: "lagi pada ngapain" dijawab tanpa AI; tugas lain dijalankan Claude CLI. Konten dadakan: `office.mjs content new '<json>'` (slot `kilat` = tayang begitu approved). Owner bilang "langsung post" = approval. Tugas pantau: `office.mjs followup <menit> "<konteks>"` (maks 16×/hari).

## Loop belajar Shorts (22 Nov 2026, `scripts/learn-core.mjs` + `learn.mjs`)
Tiap video Shorts dicatat atributnya (tipe hook, panjang, suara, kecepatan, mood, jam, pilar) dan angka views/likes/retensi ditarik dari Zernio tiap ±6 jam ke tabel `video_stats`. **Satu variabel eksperimen per minggu per brand** (hook · jam · suara · panjang · kecepatan · mood, bergilir): varian voice/speed/mood/jam dipasang otomatis oleh `shorts-bot.mjs new`; pemenang (≥3 video per varian, lift ≥25%) otomatis terkunci jadi default. `office.mjs brief <agent tim Shorts>` memuat blok `belajar` (TERBAIK vs TERBURUK + pola + eksperimen), laporan belajar Minggu 19:45 WITA di bot tiap brand. `node scripts/learn.mjs exp|report|collect|decide`.

## Server (VPS)
Kantor jalan di VPS (`~/zataa-office`, watcher = service `zataa-watcher`, cron sesi harian + backup DB: `scripts/vps/`). DB & `.env` asli hanya di VPS.
Kalau sesi ini jalan di laptop (Windows): jangan nyalain watcher lokal; ubah kode → commit + push → selesai: watcher VPS `git pull` tiap 10 menit, lalu `scripts/reload.mjs` (lewat `office.mjs export`) restart sendiri watcher & trading yang masih pakai kode lama. Mau langsung: `ssh zataa-vps "cd ~/zataa-office && git pull && sudo systemctl restart zataa-watcher zataa-trading"` (port 22 kadang diblok jaringan laptop → pakai `ssh zataa-vps-443`, sshd VPS juga dengar di 443; `laptop-worker.mjs` fallback otomatis & kabari Owner di Telegram kalau dua-duanya gagal ≥20 menit).

## Ritme kerja
- Kantor jalan **24 jam** (VPS), nggak ada yang pulang/tidur: di luar jam kerja tiap pegawai aktivitas acak (`docs/js/schedule.js`); tugas dadakan Owner → langsung ke meja. Divisi yang nunggu ✅ Owner → manajernya duduk nunggu di depan ruang Bos sampai di-approve. Sesi kerja Claude otomatis 07:00 WITA, SOP lengkap: `office/daily.md`.
- **About Esports = 4 sesi riset/hari** (pagi 07:00 · siang 12:00 · sore 16:00 · malam 20:00 WITA, `office/daily.md` §1): Salsa riset berita hangat → Andre pilih 1–3 → `approval.mjs ideas` (Telegram + web) → Owner ✅ → konten dibuat slot `kilat` dengan `auto:1` → QA Fikri lolos = langsung tayang (QA gagal = minta ✅ Owner). ❌ semua = tunggu sesi berikut. Tidak ada plan mingguan & briefing ide pagi lagi.
- Slot WIB lama (`pagi` 10:00, `siang` 12:00, `sore` 16:00, `malam` 19:00, `petang` 21:00) hanya untuk konten lama; konten sesi riset pakai `kilat`.
- Mix konten mingguan About Esports: ~60% berita/esport (hasil, jadwal, turnamen, transfer, patch), ~40% tips/engagement (kuis, polling, prediksi, meme aman), game lain di luar ML/Valorant/FF maksimal 1×/minggu. Pilar `promo`, template `promo` & gaya video `flash` nggak dipakai selama toko mati.

## Aturan konten
- Esport: format & istilah liga ikut `office/esport.md` (MPL ID: match Bo3, klasemen = Match Point (1 MP = menang 1 seri) → net game; tulis "11 Match Point/MP", bukan "11 poin" polos atau "kemenangan").
- Berita/esport wajib ada `sources` (URL) dan sudah dicek ke ≥2 sumber; kalau rumor tulis jelas "rumor".
- Toko mati: nol harga/top up/zataa.my.id/#zataatopup (QA nolak). Kalau `STORE_ON=1` lagi: harga & nominal promo **hanya** dari zataa.my.id hari itu (`node scripts/price.mjs latest [kata]`). Fikri: `approval.mjs submit` otomatis jalanin QA `scripts/qa.mjs` (CTA, ≥2 sumber, harga, MP, logo).
- **Aturan Owner (feed & video):** konten tentang tim/pemain WAJIB pakai logo tim terkait. Bahas tim → kalau ada, foto bareng seluruh pemain. Bahas 1 pemain → logo tim + foto pemainnya. Cek database dulu: `node scripts/roster.mjs find <tim|pemain>` (logo + foto tim + foto pemain aktif MPL ID/VCT/FF, Liquipedia, update otomatis tgl 1 tiap bulan); kalau nggak ada baru `node scripts/asset.mjs get <url> <teams|players|photos>/<nama>`.
- Video: latar klip suasana gaming (`assets/clips/`) sampai Owner kirim rekaman gameplay sendiri.
- CTA = follow / komen / simpan / tag temen (logo & nama brand About Esports otomatis dari `templates/shared/brand.js`, logo `docs/assets/about-esports-logo.png`; semua logo divisi di `docs/assets/*-logo.png` + banner YouTube `docs/assets/banners/` dari `Logos.jpg` Owner). Bahasa: Indonesia santai ala gamer, tanpa SARA/judi.
- (Saat toko nyala lagi) Link yang bisa diklik (bio, stiker link Story, deskripsi, Telegram) pakai link ber-UTM dari `node scripts/golink.mjs url <sumber> [id konten] [game]` (sumber ig/igs/tt/tg/yt/wa) → kebaca di **GA4 toko** (`G-GX33CTMBHG`, property "Zataa Store", dipasang di panel UniPlay → SEO & Pixel). zataa.my.id dikelola UniPlay (nggak bisa subdomain); `GO_BASE` + service `zataa-golink` cadangan kalau nanti punya domain sendiri. Caption tetap tulis zataa.my.id polos.

## graphify (peta kode, khusus laptop)
Graph pengetahuan kode + SOP ada di `graphify-out/` (gitignored, hanya di laptop; VPS tidak punya graphify → lewati bagian ini).
- Untuk pertanyaan soal kode/alur kantor: `graphify query "<pertanyaan>" --budget 1500` dulu sebelum grep/baca file; relasi `graphify path "<A>" "<B>"`, konsep `graphify explain "<X>"`. Baca file mentah hanya baris yang sudah ditunjuk graph.
- `graphify-out/GRAPH_REPORT.md` hanya untuk tinjauan arsitektur besar.
- Habis ubah kode / `git pull`: `graphify update .` (AST, 0 token). Pengecualian: `.graphifyignore`.
