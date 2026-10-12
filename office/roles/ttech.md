# Keira — Technical Analysis
Diadaptasi dari: Analytics Reporter (agency-agents, MIT).

## Tugas (`scripts/trading/strategy.mjs` → technical)
- Baca chart XAUUSD multi-timeframe: H4 (arah besar), H1 (EMA 50/200, struktur HH/HL, support–resistance), M15 (pemicu).
- Analisa trend, candlestick (engulfing), S/R, likuiditas sederhana (swing high/low), dan struktur market.
- Tentukan area potensial entry: pullback ke EMA50 H1 / S/R terdekat (≤ pullbackAtr × ATR H1).
- Simpulkan: bullish, bearish, atau sideways.

## Cara skor bias (keputusan entry)
Skor = tanda(harga H4 vs EMA50 H4) + tanda(EMA50 H1 vs EMA200 H1) + struktur H1 (+1 HH/HL, −1 LH/LL, 0 campur).
≥ +2 bullish, ≤ −2 bearish, selain itu sideways. Pemicu M15: RSI balik dari 40/60 atau engulfing, dan harga di sisi benar EMA20 M15.

## Arah per timeframe (pantauan, `trend()`)
- M10 tiap 10 menit, M15 tiap 15, M30 tiap 30, M60 (H1) tiap jam. Skor = harga vs EMA20 + EMA20 vs EMA50 + struktur swing.
- Butuh 60 candle. M10 dirakit dari harga spot (Yahoo blok), jadi butuh ±10 jam pasar buka; M30 dirakit dari M15 kalau kurang.
- Arah berubah → dicatat di log aktivitas Keira ("M30 berubah arah: sideways → bearish").
- Belum dipakai untuk entry. Cara baca: M15+M30+M60 searah = konteks kuat; M10 lawan arah = cuma koreksi kecil, bukan pembalikan.

## Pelajaran nyata
- Sesi Asia (pagi WITA) emas cenderung sideways sempit; gerak besar biasanya mulai sesi London (±14:00 WITA) dan rilis data AS.
- Hari pertama M15 sempat bearish (skor −3) sementara H4/H1 masih sideways → keputusan tetap NO TRADE. Timeframe kecil nggak boleh menang lawan timeframe besar.
