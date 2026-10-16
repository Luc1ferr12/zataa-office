# Draf Audit YouTube API — Zataa Story Uploader

Formulir: https://support.google.com/youtube/contact/yt_api_form (login sebagai pemilik project Google Cloud).
Tujuan: project **zataa-shorts** (nomor **566338684407**) lolos audit → upload lewat API boleh langsung Publik.
**Status: formulir DIKIRIM 16 Okt 2026** (konfirmasi "Terima kasih telah mengirimkan Formulir Layanan YouTube API"); hasil dikirim ke zataatopup@gmail.com.
Status OAuth (dicek 16 Okt 2026): **In production**, External, 1/100 user → refresh token tidak kedaluwarsa 7 hari.

Isian bertanda **[OWNER]** harus diisi Owner sendiri (data pribadi). Jawaban teks ditulis dalam bahasa Inggris (reviewer).

## Bagian 1 — Jenis permintaan
- Alasan: **Menyelesaikan audit kepatuhan untuk meminta kuota tambahan** (opsi pertama; dipakai juga untuk membuka batas Private).

## Bagian 2 — Organisasi & kontak
- Mengajukan sebagai: **Sebagai pengguna perorangan** (kalau Zataa belum badan usaha resmi).
- Nama lengkap resmi: **[OWNER]**
- Nama resmi organisasi: **Zataa** (atau nama usaha terdaftar kalau ada) **[OWNER cek]**
- Perusahaan induk: **diri sendiri**
- Situs utama: `https://zataa.my.id`
- Alamat (negara: Lainnya → Indonesia, alamat, kota, provinsi, kode pos): **[OWNER]**
- Kategori: **Media dan Hiburan**
- Ukuran/jenis: **Developer Independen/Pemilik Usaha Perorangan**
- Kontak utama, teknis, bisnis: nama & email **[OWNER]** (centang "Sama seperti Kontak Utama")

## Bagian 3 — Model bisnis
- Aktivitas terkait YouTube (min. 100 karakter):
  > Zataa runs the YouTube channel "Zataa Story" (@zataastory), which publishes short educational videos (YouTube Shorts) about historical and archaeological mysteries in Indonesian. Each video cites its sources and only uses public-domain or openly licensed images that are credited in the description. Our API client is an internal tool used only by the channel owner to upload the videos the owner has approved to the owner's own channel, with the visibility the owner chooses, and to read the channel's own statistics for a weekly report. We do not access any other channel or any viewer data.
- Audiens target: **Pengguna Internal**
- Monetisasi: **Layanan gratis (kami tidak membebankan biaya kepada pengguna)**
- Iklan di/dalam konten YouTube: **Tidak berlaku**
- Partner Manager Google: **Tidak, saya tidak memiliki perwakilan Google**

## Bagian 4 — Ringkasan klien API
- Nama klien API: **Zataa Story Uploader** · berisi kata "YouTube": **Tidak**
- URL akses utama: `https://luc1ferr12.github.io/zataa-office/zataa-story.html`
- URL kebijakan privasi: `https://luc1ferr12.github.io/zataa-office/youtube-privacy.html`
- URL persyaratan layanan: `https://luc1ferr12.github.io/zataa-office/youtube-terms.html`
- Dapat diakses publik: **Tidak**
- Akun demo: dikosongkan. Petunjuk khusus:
  > This is an internal tool with a single user (the channel owner). Its interface is a private Telegram bot that only accepts the owner's Telegram account, so a demo account cannot be shared. Screenshots of the approval interface (approve / revise / reject and the public / unlisted / private choice), the OAuth consent screen and the upload result are attached in section 5 and 6.

## Bagian 5 — Kasus penggunaan & kuota
- Jumlah project: **1** · Nomor project: **566338684407**
- Kategori kasus penggunaan: **Pengelolaan Akun & Proses Upload Video** dan **Analisis & Pelaporan** (opsional juga **Alat Perusahaan Internal**)
- Login dengan Akun Google: **Ya** (OAuth sekali oleh pemilik channel)
- Kebijakan tambahan: centang setuju
- Endpoint: `youtube.videos.insert`, `youtube.channels.list`, `youtube.videos.list`, YouTube Analytics `reports.query`
- Kuota: **Tidak ada perubahan/Kuota default (10 ribu poin kuota)** — volume kita ±5–7 upload/minggu
- Justifikasi (kalau tetap diminta):
  > We upload at most 1–2 Shorts per day to our own channel and read our own channel statistics a few times per day. The default quota is enough; we mainly need the compliance audit so that videos the owner approves as public are not locked to private.

### Bukti wajib (upload file)
1. **Screenshot kebijakan privasi** → `office/youtube-audit/youtube-privacy.png` (bagian YouTube API Services, link Google Privacy Policy, penghapusan, pencabutan).
2. **Screenshot halaman beranda** (link kebijakan privasi + tulisan "Uses YouTube API Services") → `office/youtube-audit/zataa-story.png`.
3. **Dokumentasi persyaratan layanan** → `office/youtube-audit/youtube-terms.pdf`.

### Bukti bersyarat
- a) **Alur OAuth**: screenshot layar izin Google (nama app, cakupan `youtube.upload`, `youtube.readonly`, `yt-analytics.readonly`) + halaman pencabutan akses. **[OWNER: jalankan `node scripts/youtube.mjs auth` di laptop lalu screenshot layar izinnya, jangan dilanjutkan kalau tidak perlu token baru]**
- b) **Antarmuka upload**: screenshot pesan Kirana di @zataashortbot yang menampilkan video, judul, deskripsi, baris **👁️ Visibilitas**, dan tombol ✅ Approve / ✏️ Revisi / ❌ Tolak. **[OWNER: screenshot dari HP]**
- d) **Fitur/dasbor**: screenshot laporan mingguan (kalau sudah ada).

## Bagian 6 — Bukti tambahan (opsional, membantu)
- Diagram arsitektur / alur pengguna: Owner ✅ di Telegram → server Zataa → `videos.insert` dengan visibilitas pilihan Owner → link dikirim balik ke Owner.

## Bagian 7 — Pengesahan
Centang semua konfirmasi kebijakan & keakuratan → **Kirim** (dilakukan/disetujui Owner).

## Setelah lolos audit
1. Tambah `YT_AUDITED=1` di `.env` VPS → default visibilitas jadi Publik, upload di jam tayang langsung tayang, pengingat "ubah ke Publik" otomatis berhenti.
2. Restart watcher. Owner masih bisa pilih per video: ketik `unlisted #id` / `private #id` di @zataashortbot.

## Sebelum kirim formulir: rapikan Google Auth Platform (project zataa-shorts)
- **Branding**: isi Application home page `https://luc1ferr12.github.io/zataa-office/zataa-story.html`, privacy policy `…/youtube-privacy.html`, terms `…/youtube-terms.html`, authorized domain `luc1ferr12.github.io`.
- **Data Access**: daftarkan scope yang memang dipakai: `youtube.upload`, `youtube.readonly`, `yt-analytics.readonly` (sekarang kosong).
