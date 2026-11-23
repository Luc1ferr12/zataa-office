# SOP Divisi Cowo Bingung (fakta unik, nyeleneh & lucu · YouTube + TikTok)

**Divisi baru sejak 23 Nov 2026 (keputusan Owner, pilot film "Kenapa Rel Kereta Pakai Kerikil").** Niche: fakta sehari-hari yang bikin "hah, masa sih?": kenapa benda/aturan dibuat begitu, format "coba kita bikin sendiri" (coba–gagal–coba lagi–ternyata ini jawabannya), fakta aneh, tubuh & alam. Nama channel "Cowo Bingung", **tim cewek semua**. Referensi gaya cerita: TikTok fakta unik ala @bukan.guffro (grammar saja, jangan tiru isi/suara orangnya).

Kode sama dengan brand Shorts lain (`shorts-bot.mjs`, `shorts-topics.mjs`), **selalu `--brand=cowo`**. DB `contents.channel = 'cowo'`. Video = **film lemo-opuscar 3 gaya sesuai tema**: `brick-toy` (coba bikin, kenapa benda dibuat begitu), `isometric-picture-book` (aturan & kebiasaan sehari-hari, fakta aneh), `colored-pencil` (tubuh, hewan & alam) (SOP `office/film.md`, contoh `films/_contoh/cowo-brick-toy/`), suara **ElevenLabs Depa**.

## Tim (Lt.4)
| id | Nama | Tugas |
|---|---|---|
| bdir | Aurel | Manajer: antrean topik, approve bank topik, briefing, evaluasi Minggu |
| bresearch | Keisha | Riset fakta unik + ≥2 sumber, tandai mitos (≤5 pencarian/hari) |
| bscript | Naura | Naskah coba–gagal–berhasil + hook + tag ekspresi ElevenLabs + cek fakta |
| bvisual | Zahra | Film lemo-opuscar (Brick Toy / Isometric / Colored Pencil sesuai tema): adegan & judul (film.js) |
| bvideo | Celine | Suara (ElevenLabs), caption per kata, cek hasil render laptop |
| bpublish | Alya | ✅ Owner di @cowobingungbot, judul/deskripsi, tayang YouTube + TikTok, laporan harian & mingguan |

## Akun & kunci (.env VPS, sudah diisi Owner 23 Nov 2026)
- Bot Telegram **@cowobingungbot**: `COWO_BOT_TOKEN` (penerima `SHORTS_OWNER_ID`). Watcher nyalain `shorts-bot.mjs bot --brand=cowo` otomatis.
- Zernio (TikTok **cowo.bingung65** + YouTube **cowobingung**): `ZERNIO_COWO_API_KEY`. Jangan pakai key divisi lain.
- ElevenLabs: `ELEVENLABS_API_KEY` (paket API Starter, dibagi dengan Story & Marvel). Suara default Depa (`hpPL1KjDqf2Aab49mbHk`), ganti lewat `ELEVEN_VOICE_COWO`.

## Alur otomatis
1. Sesi harian (Aurel → Keisha → Naura → Zahra → Celine): `shorts-topics.mjs next --brand=cowo` → riset → naskah `lines.json` → film `films/<slug>/` → `film.mjs check` → `shorts-bot.mjs new <file.json> --brand=cowo` dengan `spec.film`.
2. Laptop render film (ElevenLabs + whisper + lemo-opuscar, ±20–30 menit) → Alya kirim ke Owner: ✅ / ✏️ / ❌.
3. ✅ → jam tayang: YouTube Publik lewat Zernio, lalu otomatis TikTok. ❌ → topik balik `backlog`, tim bikin pengganti.

## Ritme
- **7 Shorts/minggu, 1 per hari** (mulai Senin 23 Nov 2026). Kuota: ≥3 **Kenapa Gitu?** per minggu (`shorts-topics.mjs week --brand=cowo`).
- 07:00–08:00 riset → briefing (Meeting Kreator Lt.4) → produksi. Laporan harian 19:00 WITA, mingguan Minggu 19:30 di @cowobingungbot.

## Bank topik (`shorts-topics.mjs --brand=cowo`)
| pillar | kode | isi |
|---|---|---|
| kenapa_gitu | KG | kenapa benda/aturan sehari-hari dibuat begitu (WAJIB ≥3/minggu) |
| coba_bikin | CB | "coba kita bikin sendiri": 2–3 percobaan gagal, lalu solusi asli terungkap |
| fakta_aneh | FA | fakta nyeleneh/lucu (≥2 sumber, mitos ditulis mitos) |
| tubuh_alam | TA | kenapa tubuh, hewan & alam bekerja begitu |

## Aturan wajib
- Fakta ≥2 sumber (ensiklopedia, jurnal populer, situs resmi/teknik); yang belum pasti tulis "katanya"/"mitos".
- Struktur 55–65 dtk: hook pertanyaan (detik 0–3) → coba 1 gagal → coba 2 gagal → (coba 3) → jawaban asli + kenapa jenius → nama istilahnya → ajak komen ("Kamu baru tahu juga?").
- Lucu dari situasi (tukang bata kesal, sesuatu ambruk), bukan dari ngeledek orang/SARA. Tanpa merek/logo.
- Judul & caption Indonesia santai; hashtag `#Shorts #faktaunik #cowobingung` + 1–2 topik.
