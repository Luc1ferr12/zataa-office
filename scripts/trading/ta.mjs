// Indikator teknikal sederhana (tanpa library): EMA, RSI, ATR, swing high/low, level support–resistance, struktur market.
export function ema(vals, n) {
  const k = 2 / (n + 1), out = [];
  let e = null;
  vals.forEach((v, i) => { e = e === null ? v : v * k + e * (1 - k); out[i] = i >= n - 1 ? e : null; });
  return out;
}
export function rsi(vals, n = 14) {
  const out = new Array(vals.length).fill(null);
  let g = 0, l = 0;
  for (let i = 1; i < vals.length; i++) {
    const d = vals[i] - vals[i - 1], up = Math.max(d, 0), dn = Math.max(-d, 0);
    if (i <= n) { g += up / n; l += dn / n; if (i === n) out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); continue; }
    g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n;
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}
export function atr(b, n = 14) {
  const out = new Array(b.length).fill(null);
  let a = null;
  for (let i = 1; i < b.length; i++) {
    const tr = Math.max(b[i].h - b[i].l, Math.abs(b[i].h - b[i - 1].c), Math.abs(b[i].l - b[i - 1].c));
    a = a === null ? tr : (a * (n - 1) + tr) / n;
    if (i >= n) out[i] = a;
  }
  return out;
}
// swing (fraktal): titik tertinggi/terendah dibanding k candle kiri-kanan
export function swings(b, k = 3) {
  const hi = [], lo = [];
  for (let i = k; i < b.length - k; i++) {
    let isH = true, isL = true;
    for (let j = i - k; j <= i + k; j++) { if (j === i) continue; if (b[j].h >= b[i].h) isH = false; if (b[j].l <= b[i].l) isL = false; }
    if (isH) hi.push({ i, p: b[i].h, t: b[i].t });
    if (isL) lo.push({ i, p: b[i].l, t: b[i].t });
  }
  return { hi, lo };
}
// struktur: higher-high + higher-low = +1 (naik), lower-high + lower-low = −1 (turun), selain itu 0
export function structure(b, k = 3) {
  const { hi, lo } = swings(b, k);
  if (hi.length < 2 || lo.length < 2) return 0;
  const [h1, h2] = hi.slice(-2), [l1, l2] = lo.slice(-2);
  if (h2.p > h1.p && l2.p > l1.p) return 1;
  if (h2.p < h1.p && l2.p < l1.p) return -1;
  return 0;
}
// level S/R: swing yang berdekatan (≤ tol) digabung; kekuatan = jumlah sentuhan
export function levels(b, tol, k = 3) {
  const { hi, lo } = swings(b, k);
  const pts = [...hi, ...lo].map((s) => s.p).sort((x, y) => x - y);
  const out = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && p - last.p0 <= tol) { last.n++; last.sum += p; last.p = last.sum / last.n; }
    else out.push({ p0: p, p, sum: p, n: 1 });
  }
  return out.map(({ p, n }) => ({ p: +p.toFixed(2), n }));
}
// pola candle sederhana di candle terakhir
export function engulf(b) {
  const a = b[b.length - 2], c = b[b.length - 1];
  if (!a || !c) return 0;
  if (c.c > c.o && a.c < a.o && c.c >= a.o && c.o <= a.c) return 1;
  if (c.c < c.o && a.c > a.o && c.c <= a.o && c.o >= a.c) return -1;
  return 0;
}
export const last = (arr) => arr[arr.length - 1];
// Bollinger Band: tengah = SMA(n), atas/bawah = tengah ± k × simpangan baku
export function bollinger(vals, n = 20, k = 2) {
  const mid = [], up = [], lo = [];
  for (let i = 0; i < vals.length; i++) {
    if (i < n - 1) { mid[i] = up[i] = lo[i] = null; continue; }
    const w = vals.slice(i - n + 1, i + 1), m = w.reduce((s, v) => s + v, 0) / n;
    const sd = Math.sqrt(w.reduce((s, v) => s + (v - m) ** 2, 0) / n);
    mid[i] = m; up[i] = m + k * sd; lo[i] = m - k * sd;
  }
  return { mid, up, lo };
}
// MACD(12, 26, 9): garis = EMA cepat − EMA lambat, sinyal = EMA garis, histogram = garis − sinyal
export function macd(vals, f = 12, s = 26, sig = 9) {
  const a = ema(vals, f), b = ema(vals, s);
  const line = vals.map((_, i) => (a[i] != null && b[i] != null ? a[i] - b[i] : null));
  const start = line.findIndex((v) => v != null), sg = new Array(vals.length).fill(null);
  if (start >= 0) ema(line.slice(start), sig).forEach((v, i) => { sg[start + i] = v; });
  return { line, signal: sg, hist: line.map((v, i) => (v != null && sg[i] != null ? v - sg[i] : null)) };
}
// Stokastik lambat (14, 3, 3): %K = posisi close di rentang high–low n candle, dihaluskan; %D = rata-rata %K
export function stoch(b, n = 14, smooth = 3, d = 3) {
  const raw = b.map((_, i) => {
    if (i < n - 1) return null;
    const w = b.slice(i - n + 1, i + 1), hh = Math.max(...w.map((x) => x.h)), ll = Math.min(...w.map((x) => x.l));
    return hh === ll ? 50 : (b[i].c - ll) / (hh - ll) * 100;
  });
  const sma = (arr, m) => arr.map((_, i) => { const w = arr.slice(i - m + 1, i + 1); return i < m - 1 || w.some((v) => v == null) ? null : w.reduce((s, v) => s + v, 0) / m; });
  const k = sma(raw, smooth);
  return { k, d: sma(k, d) };
}
