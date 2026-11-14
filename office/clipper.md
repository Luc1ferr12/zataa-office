# SOP Divisi Clipper (campaign Clippo → clip TikTok + Instagram)

**Divisi baru sejak 16 Nov 2026 (keputusan Owner 15 Nov).** Ikut campaign di **app.clippo.id**: brand/kreator bayar per 1.000 views (CPM) untuk clip dari footage mereka. Akun clipper sendiri: TikTok + Instagram baru (YouTube nggak dipakai: hampir semua campaign cuma bayar TikTok/IG). Target **3 clip/hari**.

## Tim (Lt.4)
| id | Nama | Tugas |
|---|---|---|
| cdir | Hendra | Manajer: saring campaign Clippo, usul 3 terbaik ke Owner, jaga kuota & budget |
| cbrief | Maya | Baca brief (angle wajib, do & don'ts), pilih momen dari transkrip |
| cedit | Rizky | Edit 9:16: latar blur, subtitle, hook 4 detik pertama (laptop, ffmpeg) |
| ccopy | Wulan | Hook teks layar, caption, SEMUA hashtag & tag wajib brief |
| cpublish | Tasya | Upload TikTok + IG (Zernio akun 4), pantau views, ajukan ke Clippo, laporan 19:00 |

## Alur (otomatis, 0 token kecuali pilih momen)
1. **07:30 WITA laptop** (`laptop-worker.mjs` → `clipper-chrome.mjs scout`): Claude buka app.clippo.id di **Chrome Owner yang sudah login** (ekstensi Claude in Chrome), baca semua campaign aktif + detail brief, simpan JSON → VPS `clipper.mjs ingest`. Clippo nolak akses dari server (403), **jangan diakalin**: semua akses Clippo lewat Chrome laptop.
2. **07:45 VPS** (bot Clipper, proses anak watcher): saring otomatis (TikTok/IG, budget ≥15%, ada footage, bukan keranjang kuning/UGC/template CapCut/Threads), skor = rate × sisa budget → **3 terbaik ke Owner** dengan tombol ✅ Ambil / ❌ Lewati (kalau campaign aktif < 3).
3. Owner ✅ → antrean **Join Campaign** (laptop klik lewat Chrome) + bikin job clip. **Tanpa ✅ Owner nggak ada clip yang dibikin.**
4. **08:00** `plan`: job hari ini sampai `CLIP_PER_DAY` (3), dibagi rata ke campaign aktif, footage wajib dulu lalu yang paling jarang dipakai.
5. **Laptop** (`clipper-laptop.mjs`, tiap putaran worker maks 3 job): download footage (yt-dlp / folder Drive pakai `gdown`) → transkrip whisper.cpp → Claude pilih momen + hook + caption sesuai brief → ffmpeg 1080×1920 → scp `out/clips/` → `clipper.mjs post` → **langsung tayang** TikTok + IG Reels (Zernio akun 4).
6. **Tiap jam** `track`: views & likes per video dari Zernio. Lolos syarat Clippo (**≥ minSubmissionViews, biasanya 1.000, dan like rate ≥0,5%**, akun ≥10 follower) → antrean ajukan → laptop isi form submit di Chrome → `submitted` → kabar Owner.
7. **19:00** laporan harian Tasya di bot Clipper: campaign jalan, clip hari ini, views 7 hari, diajukan, estimasi cuan.

## Akun & kunci (.env) — diisi Owner
- VPS: `CLIPPER_BOT_TOKEN` (bot baru di BotFather; watcher otomatis nyalain begitu ada), `CLIPPER_OWNER_ID` (default `SHORTS_OWNER_ID`), `ZERNIO_CLIP_API_KEY` (Zernio **akun 4**, sambungkan TikTok + Instagram clipper; kunci id: `ZERNIO_CLIP_TIKTOK_ACCOUNT`, `ZERNIO_CLIP_INSTAGRAM_ACCOUNT`), `CLIP_PER_DAY` (default 3).
- Clippo: sambungkan akun TikTok & IG clipper di menu Clippo (onboarding langkah 3) **pakai akun yang sama** dengan Zernio akun 4, biar clip bisa diajukan.
- Laptop: Chrome kebuka & login app.clippo.id, ekstensi Claude in Chrome tersambung, `pip install gdown` (footage Drive), whisper.cpp + model sudah ada.

## Aturan wajib (dari aturan umum Clippo)
- Ikuti brief 100%: angle wajib, hashtag & tag wajib, durasi, do & don'ts. Ragu → lewati momen itu.
- **Bukan reupload polos**: selalu ada edit (crop 9:16, subtitle, hook). Hanya footage yang disediakan campaign.
- Dilarang bot/beli views/ads boost, SARA, hoaks, judi. Video & hashtag **jangan dihapus/diubah 180 hari** (pendapatan dibekukan).
- Clip harus dibuat **setelah** campaign mulai. Campaign NDA (`⚠️ Wajib tanda tangan NDA`) → biarkan Owner yang putuskan.

## CLI
`node scripts/clipper.mjs list | jobs | job <id> | approve|skip <campaign> | plan | post <job> | track [--dry] | report [--dry] | submitq | ingest <file>`
