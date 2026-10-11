# Setup approval Telegram (sekali saja)

Alur: PC kirim konten → Telegram Owner (✅ / ✏️ / ❌) → n8n simpan keputusan → watcher di PC ambil tiap 1 menit → revisi dikerjakan Claude Code CLI → dikirim ulang.

## 1. Bikin bot Telegram
1. Di Telegram buka **@BotFather** → `/newbot` → kasih nama (mis. *Zataa Office*) dan username (harus berakhiran `bot`, mis. `zataa_office_bot`).
2. Salin **token** yang dikasih BotFather → tempel ke `.env` di baris `TELEGRAM_BOT_TOKEN=`.
3. Buka bot kamu, tekan **Start** (kirim `/start`).
4. Di folder proyek jalankan: `node scripts/approval.mjs setup` → chat ID otomatis tersimpan ke `.env`, dan bot kirim pesan "tersambung".
   (Lakukan langkah ini **sebelum** workflow n8n diaktifkan.)

## 2. Import workflow ke n8n (Sumopod)
1. n8n → **Workflows → Import from file** → pilih `n8n/zataa-approval.json`.
2. Buat credential **Telegram API** (nama: *Telegram Zataa*) → isi token bot yang sama. Pilih credential ini di node *Telegram masuk*, *Tutup loading tombol*, *Balas Owner*.
3. Buat credential **Header Auth** (nama: *Zataa key*): Name = `x-zataa-key`, Value = nilai `N8N_KEY` dari `.env`. Pilih di node *PC ambil keputusan*.
4. Buka node **Proses** → ganti `ISI_CHAT_ID_OWNER` dengan `TELEGRAM_CHAT_ID` dari `.env`.
5. **Save** lalu aktifkan (**Active**).
6. Buka node *PC ambil keputusan* → salin **Production URL** → tempel ke `.env` di `N8N_DECISIONS_URL=`.

## 3. Login Claude Code CLI (untuk revisi otomatis)
Buka Terminal/PowerShell sekali: `claude` → ikuti login akun Claude → ketik `/exit`.

## 4. Nyalakan watcher
- Tes: `node scripts/watch.mjs --once` (harus tampil "watcher approval jalan").
- Jalan otomatis tiap login Windows: tekan `Win+R` → `shell:startup` → buat shortcut ke `scripts\start-watcher.cmd`.
- Log ada di `logs/watcher.log`.

## Pemakaian
- Konten masuk ke Telegram setelah dirender (sesi harian otomatis) atau manual: `node scripts/approval.mjs submit <id>`.
- **✅ Approve** → status `approved`. **❌ Tolak** → `rejected`.
- **✏️ Revisi** lalu ketik catatan, *atau* langsung **reply** pesan kontennya dengan catatan → dikerjakan ± 2–4 menit lalu dikirim ulang (revisi ke-n).
- Kalau PC mati, keputusan tetap tersimpan di n8n dan diproses begitu watcher jalan lagi.
