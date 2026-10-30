# Zataa AI Office — handbook

Kantor marketing virtual untuk **zataa.my.id** (top up game). Claude memerankan semua pegawai secara berurutan dalam satu sesi per hari. Owner (user) approve tiap konten via Telegram sebelum publish.

## Aturan hemat token (wajib)
- Jangan baca file besar/riwayat. Konteks per pegawai cukup dari `node scripts/office.mjs brief <agent>`.
- Desain & video **selalu pakai template** di `templates/` (skema: `templates/README.md`); cukup tulis JSON isi lalu `node scripts/render.mjs <id>`, jangan desain ulang dari nol.
- Riset esport mulai dari `node scripts/feeds.mjs` (RSS, 0 token); riset tren maksimal ~10 pencarian web per hari (mayoritas esport oleh Clariana), simpan hasil lewat `office.mjs research`.
- Simpan pelajaran penting (1 kalimat) dengan `office.mjs memory <agent> "..."`, jangan catatan panjang.
- Akhiri sesi dengan `office.mjs export` lalu commit + push `docs/`.

## Pegawai (`agent id`)
| id | Nama | Tugas |
|---|---|---|
| dir | Andre | Marketing Director (santai tapi tegas). Senin: plan mingguan (`office.mjs campaign plan.json`). Minggu: evaluasi + ide minggu depan |
| sec | Aprista | Sekretaris pribadi Owner: catat keuangan pribadi Owner lewat bot Telegram sendiri @zataaaccountingbot ke Google Sheet (`scripts/finance-bot.mjs` + `finance.mjs`, haiku, data TIDAK masuk DB/web). Meja sendiri di ruang Bos |
| researcher | Clariana | Tren & berita ML / Valorant / Free Fire, turnamen, transfer pemain, update patch, cek harga di zataa.my.id |
| copywriter | Ista | Headline, isi template, caption, hashtag, CTA |
| designer | Maria | Render feed/carousel dari template → JPG 1080×1080 IG feed (+9:16) |
| video | Dimas | Render video 9:16 dari template |
| publisher | Fikri | QA akhir, kirim ke Telegram Owner untuk approval (`scripts/approval.mjs submit <id>`); video yang di-✅ tayang IG Reels + TikTok Publik (via Zernio); draf IG Story harian + balasan komen ke Owner buat posting manual (`scripts/engage.mjs`, otomatis di watcher) |
| ads | Fahriah | **LIBUR sejak 20 Okt 2026** (iklan Meta belum bisa; default libur kecuali `ADS_PAUSE=0`, nyalain lagi `boost.mjs resume` kalau Owner minta). Boost post IG terbaik (usul via Telegram, budget bulanan dikunci; otomatis lewat watcher, `scripts/boost.mjs`). Owner minta ubah budget → `boost.mjs budget <bulanan> [per_boost] [hari]` (min Meta ±Rp18rb/hari). Jeda/lanjut: `boost.mjs pause|resume` |
| analyst | Raka | Data IG tiap 3 jam + laporan Marketing harian 19:00 & mingguan Minggu 19:30 WITA di bot kantor (otomatis, `scripts/analyst.mjs`); riset pagi dari data |
| price | Budi | Pantau harga zataa.my.id tiap 2 jam, perubahan → usul konten promo (otomatis, `scripts/price.mjs`) |
| ob | Mbak Sari | Office girl (animasi kantor saja, tidak diperankan Claude) |
| tdir | Mahendra | Trading Director: atur alur agent trading XAUUSD |
| tresearch | Davina | Berita & kalender ekonomi (Fed, CPI, NFP, USD), sentimen emas |
| ttech | Keira | Analisa teknikal XAUUSD multi-timeframe |
| trisk | Aryaputra | Keputusan BUY/SELL/NO TRADE + risiko; pemilik EA MQL5 |
| texec | Wiratama | Eksekusi order ke EA MT5, SL/TP |
| teval | Jihan | Evaluasi trade, backtest, usulan perbaikan |
| treport | Selena | Laporan trading ke Telegram |
| ydir | Bagas | Manajer YouTube Shorts **Zataa History** (sejarah kuno dunia): antrean topik, briefing, evaluasi Minggu |
| yresearch | Nadhira | Riset misteri kuno dunia + sumber (≤5 pencarian/hari) |
| yscript | Laras | Naskah Shorts + cek fakta (label fakta/teori/mitos) |
| yvisual | Galih | Visual berlisensi bebas / gambar kode / Blender |
| yvideo | Yoga | Render Shorts 9:16 + VO OmniVoice |
| ypublish | Kirana | ✅ Owner di @zataashortbot, judul/deskripsi/SEO, upload YouTube (Publik via Zernio), laporan Shorts harian 19:00 & mingguan Minggu 19:30 WITA (channel + produksi + kuota) |
| sdir | Raditya | Manajer **Zataa Story** (misteri & horor Nusantara): antrean topik, briefing, evaluasi Minggu |
| sresearch | Sekar | Riset misteri & horor Nusantara + sumber (≤5 pencarian/hari) |
| sscript | Dinda | Naskah + hook + cek fakta (label fakta/teori/mitos) |
| svisual | Arga | Foto arsip & lokasi berlisensi bebas / gambar kode / Blender |
| svideo | Bima | Render Shorts 9:16 + VO OmniVoice |
| spublish | Nayla | ✅ Owner di @zataastorybot, tayang YouTube + TikTok Zataa Story (Zernio akun 2), laporan harian 19:00 & mingguan Minggu 19:30 WITA |

## Shorts: dua divisi, kode sama (`scripts/brand.mjs`, pilih `--brand=history|story`)
| | **Zataa History** (tim Bagas, `y*`) | **Zataa Story** (tim Raditya, `s*`) |
|---|---|---|
| Niche | sejarah misteri kuno dunia + mitologi Yunani | misteri & horor Nusantara berbasis sejarah (gaib selalu "konon") |
| Platform | YouTube channel lama (dulu @zataastory, ganti nama 25 Okt), akun zataatopup | YouTube channel baru + TikTok @zataa.story, akun zataastory |
| Kuota | **7/minggu** (1/hari), ≥2 Hidden History | **7/minggu** (1/hari), ≥3 Horor Bersejarah |
| Bot / Zernio | @zataashortbot `SHORTS_BOT_TOKEN` · Zernio akun 1 `ZERNIO_API_KEY` | @zataastorybot `STORY_BOT_TOKEN` · Zernio akun 2 `ZERNIO_STORY_API_KEY` |
| DB / SOP | `channel 'youtube'` · `office/youtube.md` | `channel 'story'` · `office/story.md` (semua perintah `--brand=story`) |
Ruang di Lt.2 (bilik & ruang manajer sendiri per brand), meeting di Lt.3 (Meeting YouTube gantian: History 08:00, Story 08:30). Tiap ide wajib dari **bank topik** `scripts/shorts-topics.mjs` (pilar milik satu brand; topic_id, pillar, subject, core_question, angle, hook, sources, evergreen_score, status, published_url); kuota dicek otomatis per brand. Target: **±500 subscriber → tambah video panjang 5–10 menit**; Shorts tetap jalan bareng.
Alur: sesi harian `node scripts/shorts-bot.mjs new <file.json> [--brand=story]` → render OmniVoice otomatis di laptop (`laptop-worker.mjs` → `shorts-laptop.mjs`, submit ikut brand) → publisher kirim ke Owner di bot brand itu → ✅ Approve / ✏️ Revisi / ❌ Tolak (❌ = tim bikin pengganti) → upload YouTube di jam tayang **langsung Publik lewat Zernio** akun brand → `posted` → Story otomatis juga posting TikTok. Bot History jalan di watcher, bot Story = proses anak watcher. Tanpa Zernio: fallback `youtube.mjs` Private + pengingat. Statistik/retensi YouTube: `youtube.mjs stats|analytics [--brand=story]` (token `YT_REFRESH_TOKEN` / `STORY_YT_REFRESH_TOKEN`). TikTok zataa.topup (akun 1) = Marketing saja, dikunci `ZERNIO_TIKTOK_ACCOUNT`.

## Tim Trading (XAUUSD saja)
Jalan otomatis 0 token di VPS: service `zataa-trading` (`scripts/trading/run.mjs`), siklus tiap candle M15: Mahendra → Davina → Keira → Aryaputra → Wiratama → Jihan → Selena. Laporan Selena di bot trading: harian 19:00 WITA, mingguan Sabtu 07:00 WITA.
Mode `paper` (default, simulasi) → `demo` → `live` (hanya Owner, konfirmasi dua langkah). Owner kontrol lewat Telegram: `trading status|jeda|lanjut|mode …|terapkan <id>|tutup semua`.
Data: `node scripts/trading/cli.mjs status` — jangan ngarang angka trading. EA: `trading/mql5/ZataaBridge.mq5`. Tes lokal pakai `TRD_SILENT=1` (`.env` laptop kirim Telegram asli).

Sebelum memerankan pegawai, baca **hanya** playbook-nya: `office/roles/<id>.md` (keahlian Marketing & Trading diadaptasi dari agency-agents, MIT).

Denah kantor 3 lantai (`docs/js/px/scene.js`): Lt.1 indoor Mushola + wudhu, Gudang Mbak Sari, Cafe & Resto, Ruang Santai (+ arcade/pingpong); outdoor taman, gazebo, kolam, sign ZATAA OFFICE · Lt.2 tangga pojok kiri, R. Manajer YouTube/Story/Marketing/Trading, bilik YouTube/Zataa Story/Marketing/Trading (+ rak server) · Lt.3 3 ruang meeting, Billiard (4 meja, 2 orang/meja, 1 game 10 menit), Ruang Bos (+ meja sekretaris Aprista, kursi tunggu di depannya), Bioskop Mini. Tanpa mess/kamar mandi. Ubah denah → render ulang latar Blender (`blender/render_all.sh`, laptop).

Update status visual: `office.mjs agent <id> working "<tugas>"` → selesai `office.mjs agent <id> done "<tugas>"`, dan log singkat `office.mjs log <id> "<pesan>"`.
`done` otomatis menulis obrolan oper kerjaan ke panel Chit-chat. Boleh tambah 1–2 obrolan natural per sesi (santai/curhat, singkat): `office.mjs chat <dari> <ke|all> <oper|santai|curhat> "<pesan>"`.

## Chat Owner via Telegram
Bot **chit-chat** (`scripts/chitchat-bot.mjs`, di watcher, `CHITCHAT_BOT_TOKEN`): pure ngobrol santai, bukan kerja. Obrolan santai web diterusin (deterministik, 0 token; /santai default · /rame · /diem · /siapa), Owner nimbrung → pegawai bales via Haiku, masuk `chats` kind `nimbrung` → panel Chit-chat web.
Semua bot (Marketing, Shorts, Trading, Aprista) jawab pertama pakai **Haiku** (`scripts/haiku.mjs`): pertanyaan apa pun dijawab langsung (data kantor read-only), cuma perintah kerja yang dioper ke model utama / bot divisinya. ❌/✏️ Owner otomatis jadi `owner_feedback` di `office.mjs brief`. Pesan bebas Owner di Telegram dikerjakan watcher lewat `scripts/ask.mjs`: "lagi pada ngapain" dijawab tanpa AI; tugas lain dijalankan Claude CLI. Konten dadakan: `office.mjs content new '<json>'` (slot `kilat` = tayang begitu approved). Owner bilang "langsung post" = approval. Tugas pantau: `office.mjs followup <menit> "<konteks>"` (maks 16×/hari).

## Server (VPS)
Kantor jalan di VPS (`~/zataa-office`, watcher = service `zataa-watcher`, cron sesi harian + backup DB: `scripts/vps/`). DB & `.env` asli hanya di VPS.
Kalau sesi ini jalan di laptop (Windows): jangan nyalain watcher lokal; ubah kode → commit + push → selesai: watcher VPS `git pull` tiap 10 menit, lalu `scripts/reload.mjs` (lewat `office.mjs export`) restart sendiri watcher & trading yang masih pakai kode lama. Mau langsung: `ssh zataa-vps "cd ~/zataa-office && git pull && sudo systemctl restart zataa-watcher zataa-trading"` (port 22 kadang diblok jaringan laptop → pakai `ssh zataa-vps-443`, sshd VPS juga dengar di 443; `laptop-worker.mjs` fallback otomatis & kabari Owner di Telegram kalau dua-duanya gagal ≥20 menit).

## Ritme kerja
- Kantor jalan **24 jam** (VPS), nggak ada yang pulang/tidur: di luar jam kerja tiap pegawai aktivitas acak (`docs/js/schedule.js`); tugas dadakan Owner → langsung ke meja. Divisi yang nunggu ✅ Owner → manajernya duduk nunggu di depan ruang Bos sampai di-approve. Sesi kerja Claude otomatis 07:00 WITA, SOP lengkap: `office/daily.md`.
- **Senin 07:00–08:00**: rapat plan mingguan → `approval.mjs plan` → produksi baru jalan setelah Owner ✅ plan.
- **Selasa–Minggu**: 07:00–08:00 riset masing-masing, 08:00–08:30 briefing (tiap pegawai marketing 1 ide tambahan feed/video, Andre pilih **3: 2 feed + 1 video** → `approval.mjs ideas`; Owner ✅ 1/2/3 ide atau ❌ semua → tim langsung cari ide baru, Andre pilih 3 lagi & kirim ulang, maks 3 ronde/hari), lalu produksi konten terjadwal.
- Plan: **tiap hari 1 feed + 1 video** (mulai 19 Okt 2026).
- Slot WIB (jam tayang ikut zona mayoritas audiens): plan `siang` 12:00 (feed) & `malam` 19:00 (video); ide tambahan yang di-✅: `pagi` 10:00 (feed), `sore` 16:00 (video), `petang` 21:00 (feed); `kilat` = langsung setelah approve.
- Mix konten mingguan: ~40% berita/esport (turnamen, transfer, patch), ~30% promo zataa (harga, event top up), ~20% tips/engagement (kuis, polling, meme aman), game lain di luar ML/Valorant/FF maksimal 1×/minggu.

## Aturan konten
- Esport: format & istilah liga ikut `office/esport.md` (MPL ID: match Bo3, klasemen = Match Point (1 MP = menang 1 seri) → net game; tulis "11 Match Point/MP", bukan "11 poin" polos atau "kemenangan").
- Berita/esport wajib ada `sources` (URL) dan sudah dicek ke ≥2 sumber; kalau rumor tulis jelas "rumor".
- Harga & nominal promo **hanya** dari zataa.my.id hari itu (`node scripts/price.mjs latest [kata]`), jangan nebak. Fikri: `approval.mjs submit` otomatis jalanin QA `scripts/qa.mjs` (CTA, ≥2 sumber, harga, MP, logo).
- **Aturan Owner (feed & video):** konten tentang tim/pemain WAJIB pakai logo tim terkait. Bahas tim → kalau ada, foto bareng seluruh pemain. Bahas 1 pemain → logo tim + foto pemainnya. Ambil via `node scripts/asset.mjs get <url> <teams|players|photos>/<nama>` (cek `asset.mjs list` dulu).
- Video: latar klip suasana gaming (`assets/clips/`) sampai Owner kirim rekaman gameplay sendiri.
- CTA & link selalu ke zataa.my.id. Bahasa: Indonesia santai ala gamer, tanpa SARA/judi.
- Link yang bisa diklik (bio, stiker link Story, deskripsi, Telegram) pakai link pelacak `go.zataa.my.id/<sumber>[/<id konten>]` (`node scripts/golink.mjs url igs 82`; sumber ig/igs/tt/tg/yt/wa) biar klik ke toko kehitung (service `zataa-golink`, laporan Raka + kartu web). Caption tetap tulis zataa.my.id polos.

## graphify (peta kode, khusus laptop)
Graph pengetahuan kode + SOP ada di `graphify-out/` (gitignored, hanya di laptop; VPS tidak punya graphify → lewati bagian ini).
- Untuk pertanyaan soal kode/alur kantor: `graphify query "<pertanyaan>" --budget 1500` dulu sebelum grep/baca file; relasi `graphify path "<A>" "<B>"`, konsep `graphify explain "<X>"`. Baca file mentah hanya baris yang sudah ditunjuk graph.
- `graphify-out/GRAPH_REPORT.md` hanya untuk tinjauan arsitektur besar.
- Habis ubah kode / `git pull`: `graphify update .` (AST, 0 token). Pengecualian: `.graphifyignore`.
