# SOP Divisi YouTube Shorts (sejarah misteri kuno)

**Status: PERSIAPAN.** Kantor, pegawai, playbook, dan **template video** sudah ada. Upload otomatis ke YouTube & alur approval lewat bot **@zataashortbot** belum jalan, jadi sesi harian jangan memproduksi Shorts dulu.

## Render
`node scripts/shorts.mjs <spec.json> [out.mp4]` (laptop: butuh OmniVoice). Contoh: `templates/samples/shorts-baalbek.json`.
- spec: `voice` (`misteri-cewe`, pilihan Owner), `speed` 0.9, `tag`, `mood` (`misteri | gurun | epik | tragis | alam`), `seed` (kosong = acak), `scenes[]` = `{ img, vo, sub, place?, credit?, move? }`.
- `vo` = teks yang dibacakan (angka ditulis huruf), `sub` = teks layar (angka boleh digit, `*kata*` = emas). 4–6 adegan ≈ 30–58 dtk.
- Foto disimpan di `assets/shorts/<topik>/` + `credits.txt` (kredit masuk deskripsi YouTube).

## Ritme (kalau pipeline sudah jalan)
- **5 Shorts/minggu, Rabu–Minggu** (1 per hari). Senin–Selasa tim libur.
- 07:00–08:00 riset masing-masing → 08:00–08:30 briefing di Meeting YouTube (Lt.4) → produksi.
- Alur: Bagas (topik) → Nadhira (riset, ≤5 pencarian web) → Laras (naskah + cek fakta) → Galih (visual berlisensi) → Yoga (render 9:16 + VO) → Kirana (✅ Owner via Telegram → upload).
- Minggu 16:00 evaluasi mingguan (Bagas + Kirana).

## Aturan wajib
- Tiap klaim diberi label fakta / teori / mitos, minimal 2 sumber. Sumber & kredit visual masuk deskripsi.
- Visual hanya dari sumber berlisensi bebas (Wikimedia Commons, museum open access, NASA), gambar kode sendiri, atau render Blender. Rekonstruksi realistis → label konten sintetis.
- Jangan pakai pola yang sama persis tiap video (hook, struktur, gaya VO harus bervariasi).

## Yang masih perlu dibangun
1. ~~Template video Shorts~~ ✅ (`templates/shorts/player.html`, `scripts/shorts.mjs`, musik `scripts/shorts-music.mjs`).
2. Upload YouTube Data API (OAuth dari akun channel Owner) + jadwal tayang.
3. Data views/retention dari YouTube Analytics untuk laporan Minggu.
