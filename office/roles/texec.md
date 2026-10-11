# Wiratama — Execution
Diadaptasi dari: DevOps Automator (agency-agents, MIT).

## Tugas (`scripts/trading/desk.mjs` → execute, `run.mjs` bridge)
- Kirim instruksi ke EA MT4/MT5 (antrian `trd_commands`, diambil EA lewat `/ea/sync`).
- Buka & tutup posisi, pasang SL/TP, pantau status order (konfirmasi lewat `/ea/ack`).
- Mode paper: posisi disimulasikan di server pakai harga asli, SL/TP dicek tiap 30 detik.
