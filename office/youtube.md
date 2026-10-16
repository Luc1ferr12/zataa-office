# SOP Divisi YouTube Shorts (sejarah misteri kuno)

**Status: JALAN** (sejak 16 Okt 2026). Produksi 1 Shorts/hari Rabu–Minggu lewat sesi harian; render otomatis di laptop, approval & upload lewat bot **@zataashortbot** (`scripts/shorts-bot.mjs`, jalan di watcher VPS).

## Alur otomatis
1. **Sesi harian** (Bagas → Nadhira → Laras → Galih): topik, riset, naskah, gambar di `assets/shorts/<topik>/` (+ `credits.txt`), lalu
   `node scripts/shorts-bot.mjs new <file.json>` → konten DB `channel: 'youtube'` (format/slot `shorts`, jam tayang dari riset harian Kirana, default 18:00 WIB) + masuk antrean laptop (`_laptop: 1`).
   file.json = `{ title (≤60 karakter), caption (deskripsi: ringkasan + sumber + kredit visual), hashtags ("#Shorts #sejarah …"), sources, tags?, synthetic?, day?, jam? ("HH:MM" WIB), test?, spec: { voice, speed, tag, mood, scenes[{ img, vo, sub, place?, credit?, move? }] } }`. Path `img` relatif dari root repo.
2. **Laptop** (Task Scheduler "Zataa Laptop Worker" tiap 10 mnt → `scripts/laptop-worker.mjs` → `scripts/shorts-laptop.mjs <id> --submit`): gambar yang belum ada diambil dari VPS, render `scripts/shorts.mjs` (OmniVoice, 40–59 dtk), hasil ke `out/shorts/` VPS. Tidak ada fallback suara VPS: laptop mati >3 jam → Yoga kabari Owner; render gagal → `_laptop: 3` + Owner dikabari.
3. **Kirana** kirim video + judul/deskripsi ke Owner di @zataashortbot: ✅ Approve / ✏️ Revisi / ❌ Tolak (aturan Owner: tidak ada tombol upload). Owner bilang "langsung post/upload" = ✅ + upload saat itu juga.
4. ✅ → status `approved`, bot **upload otomatis di jam tayang** (`jam`; sudah lewat jam → langsung). Upload lewat `scripts/youtube.mjs upload` **selalu Private** (project API belum diaudit) → status `uploaded` + Kirana kirim link & **pengingat ubah ke Publik** (YouTube Studio). Diingatkan lagi di jam tayang (`jam`) lalu tiap pagi (maks 3×).
5. Owner tekan **✅ Sudah Publik** (atau bilang "udah publik") → status `posted`. **Belum dianggap tayang sebelum Owner konfirmasi.**
6. ❌ Tolak → Claude CLI (tim YouTube) langsung bikin **Shorts pengganti** topik lain untuk hari & jam yang sama → render laptop → dikirim lagi.
7. ✏️ Revisi → Claude CLI (tim YouTube) ubah lewat `shorts-bot.mjs set` → render ulang di laptop → dikirim lagi (cuma judul/deskripsi → langsung dikirim ulang tanpa render).
- Pesan bebas Owner di @zataashortbot dijawab tim YouTube (Claude CLI); "status" = rekap tanpa AI. Urusan marketing/trading dioper ke bot kantor.
- Status Shorts: `draft` (antre/render) → `pending_approval` → `approved` (nunggu jam tayang) → `uploading` → `uploaded` (Private) → `posted` · `revision` · `rejected` · `upload_failed` (tombol coba lagi).
- CLI: `shorts-bot.mjs list | get <id> | set <id> <json> | queue <id> | submit <id> | upload <id> | say <agent> "<teks>"`. Jangan pakai `render.mjs`/`approval.mjs` untuk Shorts.

## Render
`node scripts/shorts.mjs <spec.json> [out.mp4]` (laptop: butuh OmniVoice). Contoh: `templates/samples/shorts-baalbek.json` (versi uji 30 dtk, render pakai `--test`).
- spec: `voice` (`misteri-cewe`, pilihan Owner), `speed` 0.9, `tag`, `mood` (`misteri | gurun | epik | tragis | alam`), `seed` (kosong = acak), `scenes[]` = `{ img, vo, sub, place?, credit?, move? }`.
- `vo` = teks yang dibacakan (angka ditulis huruf), `sub` = teks layar (angka boleh digit, `*kata*` = emas). **Durasi: minimal 40 dtk, target 45–55, maksimal 59** (6–7 adegan, 75–95 kata). Di luar itu render ditolak; `--test` untuk uji coba pendek.
- Upload lewat API selalu **Private** → Kirana wajib ingatkan Owner di @zataashortbot untuk ubah ke Publik (aturan Owner).
- Foto disimpan di `assets/shorts/<topik>/` + `credits.txt` (kredit masuk deskripsi YouTube).

## Ritme
- **5 Shorts/minggu, Rabu–Minggu** (1 per hari). Senin–Selasa tim libur.
- 07:00–08:00 riset masing-masing → 08:00–08:30 briefing di Meeting YouTube (Lt.4) → produksi.
- **Riset jam tayang tiap hari** (Kirana, aturan Owner): data YouTube Studio channel sendiri > hasil Shorts kita per jam > maks 2 pencarian web studi terbaru. Hasil → `jam` di Shorts hari itu + 1 kalimat alasan (`office.mjs log ypublish`). Channel belum punya data → uji jam berbeda, bandingkan tiap Minggu.
- Alur: Bagas (topik) → Nadhira (riset, ≤5 pencarian web) → Laras (naskah + cek fakta) → Galih (visual berlisensi) → Yoga (render 9:16 + VO) → Kirana (jam tayang + judul/SEO → ✅ Owner via Telegram → upload).
- Minggu 16:00 evaluasi mingguan (Bagas + Kirana).

## Aturan wajib
- Tiap klaim diberi label fakta / teori / mitos, minimal 2 sumber. Sumber & kredit visual masuk deskripsi.
- Visual hanya dari sumber berlisensi bebas (Wikimedia Commons, museum open access, NASA), gambar kode sendiri, atau render Blender. Rekonstruksi realistis → label konten sintetis.
- Jangan pakai pola yang sama persis tiap video (hook, struktur, gaya VO harus bervariasi).

## Yang masih perlu dibangun
1. Data views/retention dari YouTube Analytics untuk laporan Minggu (Kirana).
2. Upload Publik/terjadwal otomatis setelah project YouTube API lolos audit (sementara Owner ubah ke Publik manual).
