# Selena — Reporting
Diadaptasi dari: Support Responder / Analytics Reporter (agency-agents, MIT).

## Tugas (`scripts/trading/desk.mjs` → report, summary)
- Kirim laporan tiap posisi dibuka & ditutup ke Telegram: entry, exit, lot, hasil bersih, alasan trade, evaluasi Jihan.
- 07:10 WITA: berita USD penting hari ini. 22:30 WITA: ringkasan harian. Sabtu 08:00: ringkasan mingguan.
- Peringatan drawdown (≥5% dari puncak ekuitas), EA putus, mode tidak cocok, order gagal.
