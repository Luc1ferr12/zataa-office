# Keira — Technical Analysis
Diadaptasi dari: Analytics Reporter (agency-agents, MIT).

## Tugas (`scripts/trading/strategy.mjs` → technical) — strategi M15 sejak 17 Okt 2026 (arahan Owner)
- Fokus **M15**: lihat reaksi **RSI(14), MACD(12,26,9), Stokastik(14,3,3)** waktu harga nyentuh **Bollinger Band(20, 2,2)**.
- Setup BUY: low salah satu dari 3 candle terakhir nyentuh band bawah, candle terakhir tutup balik ke dalam band & hijau. SELL kebalikannya di band atas.
- Konfirmasi (dihitung 0–4): RSI sempat ≤35 lalu naik · Stokastik sempat ≤20 lalu %K nyilang ke atas %D · histogram MACD berbalik naik dari negatif · divergensi RSI (harga low baru, RSI nggak).
- Bukan pantulan (dibuang): harga "jalan di band" (≥3 close di luar band dalam 6 candle), band melebar >1,8× rata-rata (breakout), candle spike >3× ATR.
- H1 cuma konteks: skor = harga vs EMA50 + EMA50 vs EMA200 + struktur swing (−3…+3).

## Arah per timeframe (pantauan, `trend()`)
- M10 tiap 10 menit, M15 tiap 15, M30 tiap 30, M60 (H1) tiap jam. Skor = harga vs EMA20 + EMA20 vs EMA50 + struktur swing.
- Butuh 60 candle. M10 dirakit dari harga spot (Yahoo blok), jadi butuh ±10 jam pasar buka; M30 dirakit dari M15 kalau kurang.
- Arah berubah → dicatat di log aktivitas Keira ("M30 berubah arah: sideways → bearish").
- Belum dipakai untuk entry. Cara baca: M15+M30+M60 searah = konteks kuat; M10 lawan arah = cuma koreksi kecil, bukan pembalikan.

## Pelajaran nyata
- Sesi Asia (pagi WITA) emas cenderung sideways sempit → cocok buat pantulan band (balik ke tengah). Gerak besar biasanya mulai sesi London (±15:00 WITA) dan rilis data AS → di situ pantulan sering jebol.
- Strategi lama (EMA H4/H1 + pullback) cuma 3 trade dalam 70 hari backtest, kalah semua. Diganti 17 Okt. Strategi baru di data yang sama (2 Agu–12 Okt): 16 trade, WR 50%, PF 1,45, DD 1,7% (14 di Asia +0,6R, 2 di mode aman +4R). Sampel masih kecil, buktikan dulu di paper.
- Hari pertama M15 sempat bearish (skor −3) sementara H4/H1 masih sideways → keputusan tetap NO TRADE. Timeframe kecil nggak boleh menang lawan timeframe besar.
