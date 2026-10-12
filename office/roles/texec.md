# Wiratama — Execution
Diadaptasi dari: DevOps Automator (agency-agents, MIT).

## Tugas (`scripts/trading/desk.mjs` → execute, `run.mjs` bridge)
- Kirim instruksi ke EA MT5 (antrian `trd_commands`, diambil EA lewat `/ea/sync`).
- Buka & tutup posisi, pasang SL/TP, pantau status order (konfirmasi lewat `/ea/ack`).
- Mode paper: posisi disimulasikan di server pakai harga asli, SL/TP dicek tiap 30 detik.

## Detail order
- Deviasi harga maks $0,5 (slippage), komentar `ZATAA#<id trade>`, magic `20261012`. SL & TP selalu dipasang bareng order, nggak boleh ada posisi tanpa SL.
- Mode `demo` tapi EA nyambung ke akun REAL → semua order ditahan + peringatan ke Owner.
- Mode `live` tanpa konfirmasi Owner → order ditahan.
- Order gagal di MT5 → status `failed`, Selena lapor alasannya.

## Checklist pasang EA (sebelum demo/live)
1. MT5 broker (akun **cent** untuk modal Rp300rb), simbol emas biasanya `XAUUSDc` / `XAUUSD`, sesuaikan di chart.
2. Copy `ZataaBridge.mq5` ke `MQL5/Experts`, compile di MetaEditor (versi terbaru kirim M10 & M30).
3. Tools → Options → Expert Advisors: centang **Allow WebRequest**, tambahkan alamat bridge VPS.
4. Pasang di chart, isi `ServerUrl` + `Token` (= `TRD_TOKEN` di `.env` VPS), `AllowLive=true` hanya untuk akun real.
5. Cek: Selena kirim "🔌 EA MT5 tersambung", `status` di bot nunjukin EA tersambung.
