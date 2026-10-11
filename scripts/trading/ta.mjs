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
