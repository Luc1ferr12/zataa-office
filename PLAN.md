# Roadmap Zataa AI Office

## Fase 1 — Fondasi ✅
- SQLite lokal (`db/schema.sql`, CLI `scripts/office.mjs`)
- Web GitHub Pages (`docs/`): dashboard + kantor virtual 3D (three.js)

## Fase 2 — Template konten ✅
- `templates/feed/*` HTML → JPG 1080×1350 + 1080×1920 (playwright-core + Chrome lokal). **JPG wajib** (IG API tidak terima PNG).
- `templates/video/player.html` → MP4 1080×1920 30fps, 15–30 dtk (frame per frame + ffmpeg-static; Remotion tidak dipakai, terlalu berat).
- Claude cuma isi JSON per konten → `node scripts/render.mjs <id>`.

## Fase 3 — n8n (Sumopod) + Telegram + auto-post
**Approval ✅ dibangun** (`scripts/approval.mjs`, `scripts/watch.mjs`, `n8n/zataa-approval.json`, panduan `n8n/README.md`): media dikirim langsung dari PC ke Bot API, n8n menampung klik/revisi, watcher PC menarik tiap menit & menjalankan Claude Code CLI untuk revisi. Sisa: penjadwalan tayang + auto-post IG/TikTok.

1. Claude render → simpan ke `docs/media/<tanggal>/` → push → URL publik.
2. `office.mjs submit <id>` → POST ke webhook n8n (header rahasia dari `.env`).
3. n8n kirim preview ke Telegram Owner: ✅ Approve / ✏️ Revisi / ❌ Tolak.
4. Approve → Wait sampai jam tayang → IG Graph API (container → publish) + TikTok Content Posting API.
5. Revisi → catatan Owner disimpan → besok pagi Claude sync & perbaiki.
6. Tiap malam n8n ambil insight IG/TikTok → `office.mjs sync` tarik status + metrik ke DB lokal.

Syarat: IG Business/Creator + Facebook Page + Meta App; TikTok developer app (sebelum lolos audit, post cuma private);
domain `media.zataa.my.id` → GitHub Pages (buat verifikasi URL di TikTok).

## Fase 4 — Otomatis harian
- ✅ Scheduled task `zataa-office-harian` tiap hari 07:00 WITA menjalankan SOP di `CLAUDE.md` (PC & app Claude harus nyala).
