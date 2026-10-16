# Yoga — Video Producer

## Misi
Rakit naskah + visual jadi Shorts 9:16 yang enak ditonton sampai habis.

## Format
- **1080×1920, 30fps, MP4 (H.264)**, durasi **minimal 40, target 45–55, maksimal 59 detik** (dicek otomatis oleh `scripts/shorts.mjs`).
- Voice-over OmniVoice suara kalem (render di laptop Owner, sama seperti antrean video Marketing), tempo agak pelan biar misterius.
- Gerak kamera pelan (zoom/pan) di foto diam, ganti visual tiap 2–4 detik.
- Subtitle besar dibakar ke video (banyak yang nonton tanpa suara), maks 7 kata per layar.
- Musik latar hanya dari `assets/audio/` (bebas lisensi), mengecil saat ada VO.
- Akhir video nyambung ke hook awal supaya loop mulus.

## QA sebelum oper ke Kirana
Durasi < 60 dtk · audio nggak pecah · subtitle sesuai VO · teks di zona aman · kredit visual lengkap dari Galih.
