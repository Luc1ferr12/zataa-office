# SOP Divisi Marvel Talk (lore, teori, fakta & berita MCU · YouTube + TikTok)

> **23 Nov 2026 (keputusan Owner): video = film lemo-opuscar (3 gaya sesuai tema, tabel `office/film.md`), suara ElevenLabs Indah** → SOP `office/film.md`. Bagian visual/render di bawah yang menyebut gambar, Ken Burns, klip film asli (gaya klip DIPENSIUNKAN) atau OmniVoice hanya untuk konten lama yang sudah antre.

**Divisi baru sejak 16 Nov 2026 (keputusan Owner 15 Nov).** Channel YouTube baru **Marvel Talk** + TikTok Marvel Talk (akun baru Owner). Niche: ngobrolin Marvel (MCU, komik, serial) dalam bahasa Indonesia santai: asal-usul & lore, teori fans, fakta/easter egg, profil karakter, ranking/versus, plus berita & rumor MCU. Target: ±500 subscriber → mulai video panjang 5–10 menit; Shorts tetap jalan.

Kode sama dengan Zaa History/Story (`scripts/shorts-bot.mjs`, `shorts-topics.mjs`, `shorts.mjs`), bedanya **selalu pakai `--brand=marvel`**. DB `contents.channel = 'marvel'`.

## Tim (Lt.4)
| id | Nama | Tugas |
|---|---|---|
| vdir | Reza | Manajer: antrean topik, approve bank topik, briefing, evaluasi Minggu |
| vresearch | Citra | Riset lore/teori/fakta + berita MCU (≤5 pencarian/hari) |
| vscript | Fajar | Naskah + hook + cek fakta (label FAKTA / TEORI / RUMOR) |
| vvisual | Intan | Visual klip film relevan (gaya klip, lihat Aturan wajib); grafik kode hanya pelengkap |
| vvideo | Kevin | Render 9:16 + VO OmniVoice (laptop) |
| vpublish | Putri | ✅ Owner di bot Marvel Talk, judul/deskripsi/caption, tayang YouTube + TikTok, laporan harian & mingguan |

## Akun & kunci (.env VPS) — diisi Owner
- Bot Telegram Marvel Talk (bikin di BotFather): `MARVEL_BOT_TOKEN` (penerima tetap `SHORTS_OWNER_ID`). Watcher otomatis nyalain `shorts-bot.mjs bot --brand=marvel` begitu token ada (cek tiap 10 menit).
- Zernio **akun 3** (login akun Google channel Marvel Talk, sambungkan YouTube + TikTok): `ZERNIO_MARVEL_API_KEY`; kunci id akun kalau perlu: `ZERNIO_MARVEL_YOUTUBE_ACCOUNT`, `ZERNIO_MARVEL_TIKTOK_ACCOUNT`. **Jangan pakai key akun 1/2.**
- Statistik YouTube + TikTok: Zernio `ZERNIO_MARVEL_API_KEY` saja (OAuth Google dipensiunkan 21 Nov 2026).

## Alur otomatis (sama persis dengan Zaa Story, `office/story.md`)
1. Sesi harian (Reza → Citra → Fajar → Intan): `shorts-topics.mjs next --brand=marvel` → riset → naskah → gambar di `assets/shorts/<topik>/` (+ `credits.txt`) → `node scripts/shorts-bot.mjs new <file.json> --brand=marvel` (antrean laptop). `spec.tag` default "MARVEL TALK", hashtags "#Shorts #marvel #mcu …".
2. Laptop render OmniVoice 28–45 dtk → `submit --brand=marvel` → Putri kirim ke Owner: ✅ / ✏️ / ❌.
3. ✅ → jam tayang: YouTube Publik lewat Zernio akun 3, lalu otomatis TikTok. ❌ → topik balik `backlog`, tim bikin pengganti.

## Ritme
- **7 Shorts/minggu, 1 per hari** (mulai Senin 16 Nov 2026). Kuota pilar: ≥3 **Lore & Teori** per minggu (`shorts-topics.mjs week --brand=marvel`).
- 07:00–08:00 riset → 08:00–08:30 briefing (Meeting Kreator Lt.4) → produksi. Laporan harian 19:00 WITA, mingguan Minggu 19:30 di bot Marvel Talk.
- Berita besar (trailer baru, casting, jadwal rilis) boleh nyelip sebagai Shorts hari itu (pilar `berita_mcu`), tetap ≥2 sumber.

## Bank topik (`shorts-topics.mjs --brand=marvel`)
| pillar | kode | isi |
|---|---|---|
| lore_teori | LT | asal-usul, timeline, multiverse, teori fans (WAJIB ≥3/minggu) |
| fakta_marvel | FM | fakta jarang diketahui, easter egg, komik vs film |
| berita_mcu | BM | casting, rilis, trailer, box office (rumor ditulis "rumor") |
| karakter | KR | profil, kekuatan/kelemahan, versi terkuat |
| ranking | RK | top 5, versus, siapa menang (ajak debat di komen) |

## Aturan wajib (hak cipta & fakta)
- **Visual = klip film/serial/komik asli yang RELEVAN dengan yang dibahas** (keputusan Owner 15 Nov 2026, risiko strike/Content ID ditanggung Owner; ini menggantikan larangan klip sebelumnya). Gaya referensi: potongan ganti tiap 1–2 dtk, suara asli klip dibuang, **satu lapis teks saja: kata-per-kata di tengah** (kata penting kuning), tanpa label/judul tambahan di layar. Alur otomatis sama seperti gaya gambar (`shorts-bot.mjs new ... --brand=marvel`, adegan `{vo, hl?, clips:[{src, ss, x?}]}`, laptop render lewat `shorts-clip.mjs`); contoh spec `templates/samples/shorts-marvel-clip.json`, klip di `assets/shorts/<topik>/clips/`. Tetap DILARANG: musik/soundtrack Marvel (musik latar pakai `shorts-music.mjs`) dan scan halaman komik utuh tanpa diubah. Gambar yang tidak nyambung dengan topik (grafik dekoratif) tidak boleh dipakai.
- Selalu label: **FAKTA** (ada sumber resmi/komik), **TEORI** (fans/kreator, sebut siapa), **RUMOR** (belum dikonfirmasi). Berita ≥2 sumber (Marvel.com, Variety, Deadline, THR, IGN, ScreenRant buat rumor).
- Spoiler film/serial < 2 minggu tayang → tulis "SPOILER" di detik pertama & judul.
- Judul & caption bahasa Indonesia; nama karakter/film pakai nama resmi Inggris.
- Akhiri dengan pertanyaan debat ("Menurut kamu siapa yang menang?") + ajakan follow buat part berikutnya.
