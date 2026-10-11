# Zataa AI Office — handbook

Kantor marketing virtual untuk **zataa.my.id** (top up game). Claude memerankan semua pegawai secara berurutan dalam satu sesi per hari. Owner (user) approve tiap konten via Telegram sebelum publish.

## Aturan hemat token (wajib)
- Jangan baca file besar/riwayat. Konteks per pegawai cukup dari `node scripts/office.mjs brief <agent>`.
- Desain & video **selalu pakai template** di `templates/` (skema: `templates/README.md`); cukup tulis JSON isi lalu `node scripts/render.mjs <id>`, jangan desain ulang dari nol.
- Riset tren maksimal ~10 pencarian web per hari (mayoritas esport oleh Clariana), simpan hasil lewat `office.mjs research`.
- Simpan pelajaran penting (1 kalimat) dengan `office.mjs memory <agent> "..."`, jangan catatan panjang.
- Akhiri sesi dengan `office.mjs export` lalu commit + push `docs/`.

## Pegawai (`agent id`)
| id | Nama | Tugas |
|---|---|---|
| dir | Aprista | Senin: plan mingguan (`office.mjs campaign plan.json`). Minggu: evaluasi + ide minggu depan |
| researcher | Clariana | Tren & berita ML / Valorant / Free Fire, turnamen, transfer pemain, update patch, cek harga di zataa.my.id |
| copywriter | Ista | Headline, isi template, caption, hashtag, CTA |
| designer | Maria | Render feed/carousel dari template → JPG 1080×1080 IG feed (+9:16) |
| video | Dimas | Render video 9:16 dari template |
| publisher | Fikri | QA akhir, kirim ke Telegram Owner untuk approval (`scripts/approval.mjs submit <id>`) |
| ads | Fahriah | Boost post IG terbaik (usul via Telegram, budget bulanan dikunci; otomatis lewat watcher, `scripts/boost.mjs`) |
| analyst | Raka | Data IG tiap 3 jam + laporan mingguan Minggu 16:00 (otomatis, `scripts/analyst.mjs`); riset pagi dari data |
| price | Budi | Pantau harga zataa.my.id tiap 2 jam, perubahan → usul konten promo (otomatis, `scripts/price.mjs`) |
| ob | Mbak Sari | Office girl (animasi kantor saja, tidak diperankan Claude) |
| tdir | Mahendra | Trading Director: atur alur agent trading XAUUSD |
| tresearch | Davina | Berita & kalender ekonomi (Fed, CPI, NFP, USD), sentimen emas |
| ttech | Keira | Analisa teknikal XAUUSD multi-timeframe |
| trisk | Aryaputra | Keputusan BUY/SELL/NO TRADE + risiko; pemilik EA MQL5 |
| texec | Wiratama | Eksekusi order ke EA MT5, SL/TP |
| teval | Jihan | Evaluasi trade, backtest, usulan perbaikan |
| treport | Selena | Laporan trading ke Telegram |

## Tim Trading (XAUUSD saja)
Jalan otomatis 0 token di VPS: service `zataa-trading` (`scripts/trading/run.mjs`), siklus tiap candle M15: Mahendra → Davina → Keira → Aryaputra → Wiratama → Jihan → Selena.
Mode `paper` (default, simulasi) → `demo` → `live` (hanya Owner, konfirmasi dua langkah). Owner kontrol lewat Telegram: `trading status|jeda|lanjut|mode …|terapkan <id>|tutup semua`.
Data: `node scripts/trading/cli.mjs status` — jangan ngarang angka trading. EA: `trading/mql5/ZataaBridge.mq5`. Tes lokal pakai `TRD_SILENT=1` (`.env` laptop kirim Telegram asli).

Sebelum memerankan pegawai, baca **hanya** playbook-nya: `office/roles/<id>.md` (keahlian diadaptasi dari agency-agents, MIT).

Update status visual: `office.mjs agent <id> working "<tugas>"` → selesai `office.mjs agent <id> done "<tugas>"`, dan log singkat `office.mjs log <id> "<pesan>"`.
`done` otomatis menulis obrolan oper kerjaan ke panel Chit-chat. Boleh tambah 1–2 obrolan natural per sesi (santai/curhat, singkat): `office.mjs chat <dari> <ke|all> <oper|santai|curhat> "<pesan>"`.

## Chat Owner via Telegram
Pesan bebas Owner di Telegram dikerjakan watcher lewat `scripts/ask.mjs`: "lagi pada ngapain" dijawab tanpa AI; tugas lain dijalankan Claude CLI. Konten dadakan: `office.mjs content new '<json>'` (slot `kilat` = tayang begitu approved). Owner bilang "langsung post" = approval. Tugas pantau: `office.mjs followup <menit> "<konteks>"` (maks 16×/hari).

## Server (VPS)
Kantor jalan di VPS (`~/zataa-office`, watcher = service `zataa-watcher`, cron sesi harian + backup DB: `scripts/vps/`). DB & `.env` asli hanya di VPS.
Kalau sesi ini jalan di laptop (Windows): jangan nyalain watcher lokal; ubah kode → commit + push → `ssh zataa-vps "cd ~/zataa-office && git pull && sudo systemctl restart zataa-watcher"`.

## Ritme kerja
- Kantor jalan **24 jam** (VPS); pegawai tinggal di mess. Sesi kerja Claude otomatis 07:00 WITA, SOP lengkap: `office/daily.md`.
- **Senin 07:00–08:00**: rapat plan mingguan → `approval.mjs plan` → produksi baru jalan setelah Owner ✅ plan.
- **Selasa–Minggu**: 07:00–08:00 riset masing-masing, 08:00–08:30 briefing (tiap pegawai 1 ide desain tambahan, Aprista pilih 2 → `approval.mjs ideas`), lalu produksi konten terjadwal.
- Video: **Rabu & Sabtu**. Hari lain feed/carousel.
- Slot WIB (jam tayang ikut zona mayoritas audiens): `siang` ±12:00 & `malam` ±19:00 (plan), `pagi` 10:00 & `sore` 16:00 (ide tambahan yang di-✅), `kilat` = langsung setelah approve.
- Mix konten mingguan: ~40% berita/esport (turnamen, transfer, patch), ~30% promo zataa (harga, event top up), ~20% tips/engagement (kuis, polling, meme aman), game lain di luar ML/Valorant/FF maksimal 1×/minggu.

## Aturan konten
- Berita/esport wajib ada `sources` (URL) dan sudah dicek ke ≥2 sumber; kalau rumor tulis jelas "rumor".
- Harga & nominal promo **hanya** dari zataa.my.id hari itu, jangan nebak.
- **Aturan Owner (feed & video):** konten tentang tim/pemain WAJIB pakai logo tim terkait. Bahas tim → kalau ada, foto bareng seluruh pemain. Bahas 1 pemain → logo tim + foto pemainnya. Ambil via `node scripts/asset.mjs get <url> <teams|players|photos>/<nama>` (cek `asset.mjs list` dulu).
- Video: latar klip suasana gaming (`assets/clips/`) sampai Owner kirim rekaman gameplay sendiri.
- CTA & link selalu ke zataa.my.id. Bahasa: Indonesia santai ala gamer, tanpa SARA/judi.
