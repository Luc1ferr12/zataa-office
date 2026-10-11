// Mesin pixel art isometrik: rasterizer software kecil (tanpa WebGL).
// Dunia ditulis dalam koordinat yang sama dengan nav.js (x kanan, y atas, z ke arah kamera).
// Hasil render = buffer piksel siang & malam + kedalaman, lalu sprite pegawai ditempel per frame.

export const UP = 3.6;

// ---------------------------------------------------------------- kamera (ortografis, dari depan-kiri atas)
const TAN_YAW = 0.25; // kamera agak dari kiri
const SIN_EL = 0.75;  // elevasi ±49°
// RES = kelipatan resolusi (1 = pixel art klasik 944×752, 2 = HD 1888×1504)
export const RES = 2;
export const K = 16 * RES;  // piksel per meter di sumbu x
const cP = 1 / Math.hypot(1, TAN_YAW), sP = TAN_YAW * cP, cE = Math.sqrt(1 - SIN_EL * SIN_EL);
const S = K / cP;
const RX = [K, 0, K * TAN_YAW];
const RY = [-S * sP * SIN_EL, -S * cE, S * cP * SIN_EL];
export const VW = [-sP * cE, SIN_EL, cP * cE]; // arah ke kamera (kedalaman: makin besar makin dekat)
export const PXH = S * cE; // piksel per meter tinggi
export const W = 944 * RES, H = 752 * RES, OX = 506 * RES, OY = 420 * RES;

export const proj = (x, y, z) => [OX + RX[0] * x + RX[2] * z, OY + RY[0] * x + RY[1] * y + RY[2] * z];
export const depthOf = (x, y, z) => VW[0] * x + VW[1] * y + VW[2] * z;
const S2 = S * S;
// titik dunia pada sinar layar (sx, sy) dengan kedalaman 0
const unproj0 = (sx, sy) => {
  const a = (sx - OX) / S2, b = (sy - OY) / S2;
  return [RX[0] * a + RY[0] * b, RY[1] * b, RX[2] * a + RY[2] * b];
};

// ---------------------------------------------------------------- cahaya matahari (dari kiri-depan-atas)
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const SUN = norm([-0.62, 1, 0.42]);
const LU = norm(cross([0, 1, 0], SUN));
const LV = cross(SUN, LU);
const SM = 14; // texel bayangan per meter

// ---------------------------------------------------------------- warna & palet
export const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const pack = (r, g, b, a = 255) => ((a << 24) | (Math.max(0, Math.min(255, b | 0)) << 16) | (Math.max(0, Math.min(255, g | 0)) << 8) | Math.max(0, Math.min(255, r | 0))) >>> 0;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const SHADOW_HUE = hex('#24163f'), LIGHT_HUE = hex('#fff2d2');
export const RAMP_N = 8;
// ramp ala pixel art: bayangan bergeser ke ungu, terang ke kuning hangat
export function ramp(h) {
  const c = hex(h);
  const dark = mix(c.map((v) => v * 0.32), SHADOW_HUE, 0.32);
  const light = mix(c.map((v) => v + (255 - v) * 0.38), LIGHT_HUE, 0.18);
  const out = [];
  for (let i = 0; i < RAMP_N; i++) {
    const t = i / (RAMP_N - 1);
    const rgb = t < 0.5 ? mix(dark, c, t / 0.5) : mix(c, light, (t - 0.5) / 0.5);
    out.push(rgb.map(Math.round));
  }
  return out;
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);
export const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];
export const hash2 = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export const hash3 = (a, b, c) => hash2(hash2(a, b) * 1e6 | 0, c);
export function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// ---------------------------------------------------------------- material
// { color, base (0..1), tex(u,v,a,b,x,y,z,px,py) → offset shade, emissive, glass (alpha), dyn (id surface dinamis), night (warna malam) }
export const MATS = [null];
export const T = { m: 0 }; // tekstur boleh mengganti material per piksel lewat T.m
export function material(o) {
  const m = { base: 0.5, ...o };
  m.ramp = ramp(o.color);
  m.id = MATS.length;
  MATS.push(m);
  return m;
}

// ---------------------------------------------------------------- scan polygon cembung
function scan(pts, w, h, fn) {
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
  const y0 = Math.max(0, Math.ceil(minY - 0.5)), y1 = Math.min(h - 1, Math.floor(maxY - 0.5));
  const n = pts.length;
  for (let y = y0; y <= y1; y++) {
    const cy = y + 0.5;
    let xl = Infinity, xr = -Infinity;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      if ((a[1] <= cy && b[1] > cy) || (b[1] <= cy && a[1] > cy)) {
        const x = a[0] + ((cy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
        if (x < xl) xl = x;
        if (x > xr) xr = x;
      }
    }
    if (xl > xr) continue;
    const x0 = Math.max(0, Math.ceil(xl - 0.5)), x1 = Math.min(w - 1, Math.floor(xr - 0.5));
    for (let x = x0; x <= x1; x++) fn(x, y);
  }
}

function newell(P) {
  const n = [0, 0, 0];
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    n[0] += (a[1] - b[1]) * (a[2] + b[2]);
    n[1] += (a[2] - b[2]) * (a[0] + b[0]);
    n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return norm(n);
}

// ---------------------------------------------------------------- render statis → buffer siang & malam
// prims: [{ kind:'poly', P:[[x,y,z]..], mat, two, cast } | { kind:'ell', c, r, mat, leafy, cast }]
// lights: [{ p:[x,y,z], color:[r,g,b] (0..1), r: radius, i: intensitas }]
export function renderScene(prims, lights) {
  const N = W * H;
  const depth = new Float32Array(N).fill(-1e9);
  const matId = new Uint16Array(N);
  const shade = new Float32Array(N);
  const nrm = new Int8Array(N * 3);
  const pos = new Float32Array(N * 3);
  const glassD = new Float32Array(N).fill(-1e9);
  const glassM = new Uint16Array(N);
  const glassS = new Float32Array(N);
  const uvA = new Float32Array(N), uvB = new Float32Array(N);

  // ---- peta bayangan dari arah matahari
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (const x of [-34, 30]) for (const y of [-1, 10]) for (const z of [-30, 24]) {
    const p = [x, y, z];
    uMin = Math.min(uMin, dot(p, LU)); uMax = Math.max(uMax, dot(p, LU));
    vMin = Math.min(vMin, dot(p, LV)); vMax = Math.max(vMax, dot(p, LV));
  }
  const SW = Math.ceil((uMax - uMin) * SM), SH = Math.ceil((vMax - vMin) * SM);
  const smap = new Float32Array(SW * SH).fill(-1e9);
  const toL = (p) => [(dot(p, LU) - uMin) * SM, (dot(p, LV) - vMin) * SM];
  const unL0 = (u, v) => {
    const a = u / SM + uMin, b = v / SM + vMin;
    return [LU[0] * a + LV[0] * b, LU[1] * a + LV[1] * b, LU[2] * a + LV[2] * b];
  };

  for (const pr of prims) {
    if (pr.cast === false || pr.mat.glass || pr.mat.emissive && pr.noCast) continue;
    if (pr.kind === 'poly') {
      const P = pr.P;
      const n = newell(P);
      const dn = dot(n, SUN);
      if (Math.abs(dn) < 0.03) continue;
      const lp = P.map(toL);
      const d0 = dot(P[0], SUN);
      // kedalaman cahaya linear di bidang: d = d0 + gu*(u-u0) + gv*(v-v0)
      const e1 = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]];
      const e2 = [P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]];
      const E1 = [lp[1][0] - lp[0][0], lp[1][1] - lp[0][1]], E2 = [lp[2][0] - lp[0][0], lp[2][1] - lp[0][1]];
      const det = E1[0] * E2[1] - E1[1] * E2[0];
      if (Math.abs(det) < 1e-9) continue;
      const k1 = dot(e1, SUN), k2 = dot(e2, SUN);
      const gu = (k1 * E2[1] - k2 * E1[1]) / det, gv = (k2 * E1[0] - k1 * E2[0]) / det;
      scan(lp, SW, SH, (x, y) => {
        const d = d0 + gu * (x + 0.5 - lp[0][0]) + gv * (y + 0.5 - lp[0][1]);
        const i = y * SW + x;
        if (d > smap[i]) smap[i] = d;
      });
    } else {
      const { c, r } = pr;
      const ext = Math.max(r[0], r[1], r[2]);
      const [cu, cv] = toL(c);
      const R = ext * SM + 1;
      for (let y = Math.max(0, Math.floor(cv - R)); y < Math.min(SH, Math.ceil(cv + R)); y++) {
        for (let x = Math.max(0, Math.floor(cu - R)); x < Math.min(SW, Math.ceil(cu + R)); x++) {
          const t = rayEll(unL0(x + 0.5, y + 0.5), SUN, c, r);
          if (t === null) continue;
          if (pr.leafy && leafCut(t, unL0(x + 0.5, y + 0.5), SUN, c, r)) continue;
          const i = y * SW + x;
          if (t > smap[i]) smap[i] = t;
        }
      }
    }
  }
  const inShadow = (x, y, z) => {
    const p = [x, y, z];
    const u = Math.floor((dot(p, LU) - uMin) * SM), v = Math.floor((dot(p, LV) - vMin) * SM);
    if (u < 0 || v < 0 || u >= SW || v >= SH) return false;
    const d = dot(p, SUN);
    // ambil maksimum 2x2 texel supaya tepi bayangan tidak bergerigi berlebihan
    return smap[v * SW + u] > d + 0.06;
  };

  // ---- G-buffer dari sudut kamera
  const dyn = new Map();
  for (const pr of prims) {
    const m = pr.mat;
    if (pr.kind === 'poly') {
      const P = pr.P;
      let n = newell(P);
      let f = dot(n, VW);
      if (f <= 0) { if (!pr.two) continue; n = [-n[0], -n[1], -n[2]]; f = -f; }
      if (f < 0.015) continue;
      const sp = P.map((p) => proj(p[0], p[1], p[2]));
      const last = P.length - 1;
      const e1 = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]];
      const e2 = [P[last][0] - P[0][0], P[last][1] - P[0][1], P[last][2] - P[0][2]];
      const E1 = [sp[1][0] - sp[0][0], sp[1][1] - sp[0][1]], E2 = [sp[last][0] - sp[0][0], sp[last][1] - sp[0][1]];
      const det = E1[0] * E2[1] - E1[1] * E2[0];
      if (Math.abs(det) < 1e-9) continue;
      const ax = n.map(Math.abs);
      const axis = ax[1] >= ax[0] && ax[1] >= ax[2] ? 1 : ax[2] >= ax[0] ? 2 : 0;
      const n8 = n.map((v) => Math.round(v * 127));
      const tex = pr.tex ?? m.tex;
      const x0 = sp[0][0], y0 = sp[0][1];
      scan(sp, W, H, (x, y) => {
        const dx = x + 0.5 - x0, dy = y + 0.5 - y0;
        const a = (dx * E2[1] - dy * E2[0]) / det, b = (E1[0] * dy - E1[1] * dx) / det;
        const wx = P[0][0] + a * e1[0] + b * e2[0], wy = P[0][1] + a * e1[1] + b * e2[1], wz = P[0][2] + a * e1[2] + b * e2[2];
        const d = VW[0] * wx + VW[1] * wy + VW[2] * wz;
        const i = y * W + x;
        const u = axis === 0 ? wz : wx, v = axis === 1 ? wz : wy;
        T.m = 0;
        const off = tex ? tex(u, v, a, b, wx, wy, wz, x, y) : 0;
        if (off !== off) return; // NaN = bolong
        const mm = T.m ? MATS[T.m] : m;
        if (mm.glass) {
          if (d > glassD[i]) { glassD[i] = d; glassM[i] = mm.id; glassS[i] = mm.base + off; }
          return;
        }
        if (d <= depth[i]) return;
        depth[i] = d; matId[i] = mm.id; shade[i] = mm.base + off;
        nrm[i * 3] = n8[0]; nrm[i * 3 + 1] = n8[1]; nrm[i * 3 + 2] = n8[2];
        pos[i * 3] = wx; pos[i * 3 + 1] = wy; pos[i * 3 + 2] = wz;
        if (mm.dyn) { uvA[i] = a; uvB[i] = b; }
      });
    } else {
      const { c, r } = pr;
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
        const p = proj(c[0] + sx * r[0], c[1] + sy * r[1], c[2] + sz * r[2]);
        x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
      }
      for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(H - 1, Math.ceil(y1)); y++) {
        for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(W - 1, Math.ceil(x1)); x++) {
          const o = unproj0(x + 0.5, y + 0.5);
          const t = rayEll(o, VW, c, r);
          if (t === null) continue;
          if (pr.leafy && leafCut(t, o, VW, c, r)) continue;
          const i = y * W + x;
          if (t <= depth[i]) continue;
          const hx = o[0] + VW[0] * t, hy = o[1] + VW[1] * t, hz = o[2] + VW[2] * t;
          const n = norm([(hx - c[0]) / (r[0] * r[0]), (hy - c[1]) / (r[1] * r[1]), (hz - c[2]) / (r[2] * r[2])]);
          T.m = 0;
          const off = m.tex ? m.tex(hx, hz, n[0], n[1], hx, hy, hz, x, y) : 0;
          const mm = T.m ? MATS[T.m] : m;
          depth[i] = t; matId[i] = mm.id; shade[i] = mm.base + off;
          nrm[i * 3] = Math.round(n[0] * 127); nrm[i * 3 + 1] = Math.round(n[1] * 127); nrm[i * 3 + 2] = Math.round(n[2] * 127);
          pos[i * 3] = hx; pos[i * 3 + 1] = hy; pos[i * 3 + 2] = hz;
        }
      }
    }
  }

  // ---- cahaya malam (lampu titik), dikuantisasi supaya tetap terasa pixel art
  const lr = new Float32Array(N), lg = new Float32Array(N), lb = new Float32Array(N);
  const AMB = [0.2, 0.22, 0.4];
  lr.fill(AMB[0]); lg.fill(AMB[1]); lb.fill(AMB[2]);
  for (const L of lights) {
    const [cx, cy] = proj(...L.p);
    const Lrad = L.r * 1.25, R = Lrad * S * 1.1;
    const lx0 = Math.max(0, Math.floor(cx - R)), lx1 = Math.min(W - 1, Math.ceil(cx + R));
    const ly0 = Math.max(0, Math.floor(cy - R * 0.4)), ly1 = Math.min(H - 1, Math.ceil(cy + R * 1.3));
    for (let y = ly0; y <= ly1; y++) for (let x = lx0; x <= lx1; x++) {
      const i = y * W + x;
      if (!matId[i]) continue;
      const dx = L.p[0] - pos[i * 3], dy = L.p[1] - pos[i * 3 + 1], dz = L.p[2] - pos[i * 3 + 2];
      const dist = Math.hypot(dx, dy, dz);
      if (dist >= Lrad) continue;
      const nd = (nrm[i * 3] * dx + nrm[i * 3 + 1] * dy + nrm[i * 3 + 2] * dz) / (127 * (dist || 1));
      if (nd <= 0 && dist > 0.4) continue;
      const k = (1 - dist / Lrad) ** 2 * L.i * 1.8 * (0.35 + 0.65 * Math.max(0, nd));
      lr[i] += L.color[0] * k; lg[i] += L.color[1] * k; lb[i] += L.color[2] * k;
    }
  }

  // ---- komposisi: siang, malam, kaca
  const day = new Uint32Array(N), night = new Uint32Array(N), lightQ = new Uint8Array(N * 3);
  const q = (v, x, y) => Math.max(0, Math.round(v * 5 + bayer(x, y) * 0.7) / 5);
  // garis tepi ala pixel art: siluet objek digelapkan, tepi atas permukaan datar diterangkan
  const edge = new Float32Array(N);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x, d = depth[i];
    if (d - depth[i - 1] > 0.55 || d - depth[i + 1] > 0.55 || d - depth[i - W] > 0.55 || d - depth[i + W] > 0.55) edge[i] = -0.3;
    else if (nrm[i * 3 + 1] > 90 && nrm[(i + W) * 3 + 1] < 40 && Math.abs(d - depth[i + W]) < 0.3) edge[i] = 0.16;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const m = MATS[matId[i]];
    if (!m) { day[i] = night[i] = pack(20, 30, 20); continue; }
    if (!m.emissive && !m.noEdge) shade[i] += edge[i];
    const R = m.ramp;
    const nx = nrm[i * 3] / 127, ny = nrm[i * 3 + 1] / 127, nz = nrm[i * 3 + 2] / 127;
    const ndl = nx * SUN[0] + ny * SUN[1] + nz * SUN[2];
    const b = bayer(x, y) * 0.5;
    let L3 = [q(lr[i], x, y), q(lg[i], x, y), q(lb[i], x, y)];
    lightQ[i * 3] = Math.min(255, L3[0] * 100); lightQ[i * 3 + 1] = Math.min(255, L3[1] * 100); lightQ[i * 3 + 2] = Math.min(255, L3[2] * 100);
    if (m.emissive) {
      const c = R[Math.max(0, Math.min(RAMP_N - 1, Math.round(shade[i] * (RAMP_N - 1))))];
      const dc = m.dayDim ? c.map((v) => v * m.dayDim) : c;
      day[i] = pack(dc[0], dc[1], dc[2]);
      night[i] = pack(c[0], c[1], c[2]);
      continue;
    }
    const lit = m.flat || (ndl > 0 && !inShadow(pos[i * 3] + nx * 0.03, pos[i * 3 + 1] + ny * 0.03, pos[i * 3 + 2] + nz * 0.03));
    let s = shade[i] + (m.flat ? 0.08 : 0.3 * Math.max(0, ndl)) - 0.17 - (lit ? 0 : 0.15);
    let k = Math.max(0, Math.min(RAMP_N - 1, Math.floor(s * (RAMP_N - 1) + 0.5 + b)));
    let c = R[k];
    day[i] = pack(c[0], c[1], c[2]);
    const sn = shade[i] + 0.08 * ny - 0.04;
    k = Math.max(0, Math.min(RAMP_N - 1, Math.floor(sn * (RAMP_N - 1) + 0.5 + b)));
    c = R[k];
    night[i] = pack(c[0] * L3[0], c[1] * L3[1], c[2] * L3[2]);
  }
  // kaca: dicampur di atas piksel buram, disimpan juga supaya sprite di belakang kaca ikut tertutup
  const glassDay = new Uint32Array(N), glassNight = new Uint32Array(N);
  for (let i = 0; i < N; i++) {
    if (!glassM[i] || glassD[i] <= depth[i]) { glassD[i] = -1e9; continue; }
    const m = MATS[glassM[i]];
    const x = i % W, y = (i / W) | 0;
    const k = Math.max(0, Math.min(RAMP_N - 1, Math.floor(glassS[i] * (RAMP_N - 1) + 0.5 + bayer(x, y) * 0.6)));
    const c = m.ramp[k];
    const a = Math.round(m.glass * 255);
    glassDay[i] = pack(c[0], c[1], c[2], a);
    glassNight[i] = pack(c[0] * 0.35, c[1] * 0.4, c[2] * 0.6, a);
    day[i] = blend(day[i], glassDay[i]);
    night[i] = blend(night[i], glassNight[i]);
  }
  // permukaan dinamis (air, layar): simpan daftar pikselnya
  for (let i = 0; i < N; i++) {
    const m = MATS[matId[i]];
    if (!m?.dyn) continue;
    let d = dyn.get(m.dyn);
    if (!d) dyn.set(m.dyn, (d = { idx: [], a: [], b: [], x: [], y: [] }));
    d.idx.push(i); d.a.push(uvA[i]); d.b.push(uvB[i]); d.x.push(i % W); d.y.push((i / W) | 0);
  }
  return { day, night, depth, glassD, glassDay, glassNight, lightQ, dyn };
}

export function blend(dst, src) {
  const a = (src >>> 24) / 255;
  if (a <= 0) return dst;
  const r = (dst & 255) * (1 - a) + (src & 255) * a;
  const g = ((dst >>> 8) & 255) * (1 - a) + ((src >>> 8) & 255) * a;
  const b = ((dst >>> 16) & 255) * (1 - a) + ((src >>> 16) & 255) * a;
  return pack(r, g, b);
}

// sinar o + t*dir vs elipsoid (c, r) → t terbesar (paling dekat ke kamera/cahaya) atau null
function rayEll(o, dir, c, r) {
  const ox = (o[0] - c[0]) / r[0], oy = (o[1] - c[1]) / r[1], oz = (o[2] - c[2]) / r[2];
  const dx = dir[0] / r[0], dy = dir[1] / r[1], dz = dir[2] / r[2];
  const A = dx * dx + dy * dy + dz * dz, B = 2 * (ox * dx + oy * dy + oz * dz), C = ox * ox + oy * oy + oz * oz - 1;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return null;
  return (-B + Math.sqrt(disc)) / (2 * A);
}
// daun: tepi elipsoid dibuat bergerigi
function leafCut(t, o, dir, c, r) {
  const hx = o[0] + dir[0] * t, hy = o[1] + dir[1] * t, hz = o[2] + dir[2] * t;
  const rim = Math.abs(((hx - c[0]) / r[0]) * dir[0] / r[0] + ((hy - c[1]) / r[1]) * dir[1] / r[1] + ((hz - c[2]) / r[2]) * dir[2] / r[2]);
  if (rim > 0.35) return false;
  return hash3(Math.floor(hx * 4), Math.floor(hy * 4), Math.floor(hz * 4)) < 0.55 - rim;
}
