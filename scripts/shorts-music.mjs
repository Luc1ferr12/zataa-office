#!/usr/bin/env node
// Musik latar Shorts sejarah (synth sendiri, 100% bebas lisensi), 5 mood sesuai tema video:
//   misteri  situs/artefak tak terjelaskan   drone gelap, pad minor, lonceng bergema, angin
//   gurun    Mesir, Mesopotamia, Persia     tangga nada Timur Tengah, petikan senar (oud), suling, rebana pelan
//   epik     perang, kerajaan, Romawi        drum besar yang makin rapat, string & brass, nada naik
//   tragis   peradaban runtuh, kota hilang   piano minor pelan, pad lembut, sunyi
//   alam     Maya, Nan Madol, Nusantara       gamelan (pentatonik), suling bambu, ombak, burung
// Tiap video dapat variasi sendiri (nada dasar, tempo, melodi) dari seed.
//   node scripts/shorts-music.mjs <out.wav> [detik=8] [dentuman: detik,detik,...] [--mood=misteri] [--seed=1]
import { writeFileSync } from 'node:fs';

const SR = 44100, TAU = Math.PI * 2;
const argv = process.argv.slice(2);
const opt = (k, d) => argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const pos = argv.filter((a) => !a.startsWith('--'));
const out = pos[0] ?? 'out/shorts-test/music.wav';
const DUR = +(pos[1] ?? 8);
const HITS = (pos[2] ?? '').split(',').filter(Boolean).map(Number);
const MOOD = opt('mood', 'misteri');
const SEED = +opt('seed', 1);
const N = Math.floor(SR * DUR);
const L = new Float32Array(N), R = new Float32Array(N);
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
let s0 = 1 + Math.floor(Math.abs(Math.sin(SEED * 12.9898 + 4.1) * 43758.5453) % 1 * 2147483645);
const rnd = () => ((s0 = (s0 * 16807) % 2147483647) / 2147483647) * 2 - 1;   // −1…1
const r01 = () => (rnd() + 1) / 2;
for (let k = 0; k < 8; k++) rnd();   // panaskan generator acak supaya seed berdekatan tetap beda jauh
const pick = (a) => a[Math.floor(r01() * a.length) % a.length];
const lpA = (fc) => 1 - Math.exp(-TAU * fc / SR);
const add = (i, l, r = l) => { if (i >= 0 && i < N) { L[i] += l; R[i] += r; } };
const fadeIO = (t, a = 1.5, b = 1.2) => Math.min(1, t / a) * Math.max(0, Math.min(1, (DUR - t) / b));
// variasi per video: nada dasar (sekitar D) & tempo
const KEY = pick([-2, -1, 0, 1, 2, 3]), TEMPO = 0.92 + r01() * 0.16;

// ---------------------------------------------------------------- alat musik
function boom(at, g = 1) {   // dentuman sinematik (sine turun 70→32 Hz + noise rendah)
  let ph = 0, lp = 0;
  const i0 = Math.floor(at * SR);
  for (let i = 0; i < SR * 3; i++) {
    const t = i / SR, f = 32 + 38 * Math.exp(-t * 3);
    ph += TAU * f / SR; lp += (rnd() - lp) * lpA(180);
    const env = Math.exp(-t * 1.4) * Math.min(1, t * 200) * g;
    add(i0 + i, (Math.sin(ph) * 0.55 + lp * 0.5 * Math.exp(-t * 5)) * env);
  }
}
function drone(notes, gain = 1, from = 0) {   // nada panjang yang "bernapas" (detune pelan kiri-kanan)
  const ph = notes.map(() => [0, 0]);
  for (let i = Math.floor(from * SR); i < N; i++) {
    const t = i / SR, env = fadeIO(t - from) * gain;
    let l = 0, r = 0;
    notes.forEach(([m, a], k) => {
      const f = hz(m + KEY);
      ph[k][0] += TAU * f * (1 + 0.0015 * Math.sin(t * 0.7 + k)) / SR; ph[k][1] += TAU * f * (1 - 0.0015 * Math.sin(t * 0.6 + k)) / SR;
      l += Math.sin(ph[k][0]) * a; r += Math.sin(ph[k][1]) * a;
    });
    add(i, l * env, r * env);
  }
}
function pad(chords, barSec, gain, { from = 0, bright = 500, swell = 3 } = {}) {   // saw difilter, ganti akor tiap bar
  const ph = new Float64Array(8);
  let lpL = 0, lpR = 0;
  for (let i = Math.floor(from * SR); i < N; i++) {
    const t = i / SR, ch = chords[Math.floor(t / barSec) % chords.length];
    const env = Math.max(0, Math.min(1, (t - from) / swell)) * Math.min(1, (DUR - t) / 1.5);
    let l = 0, r = 0;
    ch.forEach((m, k) => {
      ph[k] = (ph[k] + hz(m + KEY) * (1 + (k - 1.5) * 0.002) / SR) % 1;
      const s = ph[k] * 2 - 1; if (k % 2) l += s; else r += s;
    });
    const fc = bright + bright * 0.6 * Math.sin(t * 0.5);
    lpL += (l - lpL) * lpA(fc); lpR += (r - lpR) * lpA(fc);
    add(i, lpL * gain * env, lpR * gain * env);
  }
}
function bell(at, m, g = 0.11, decay = 1.6) {   // lonceng/denting FM
  const i0 = Math.floor(at * SR), f = hz(m + KEY), pan = ((m % 5) / 5 - 0.4);
  for (let j = 0; j < SR * 3.5; j++) {
    const t = j / SR, env = Math.exp(-t * decay) * Math.min(1, t * 400);
    const s = Math.sin(TAU * f * t + 1.2 * Math.exp(-t * 3) * Math.sin(TAU * f * 3.5 * t)) * env * g;
    add(i0 + j, s * (1 - pan), s * (1 + pan));
  }
}
function gong(at, m, g = 0.1) {   // bilah gamelan: parsial tidak harmonis, gaung panjang + sedikit "ombak" (beating)
  const i0 = Math.floor(at * SR), f = hz(m + KEY), pan = r01() * 0.8 - 0.4;
  const parts = [[1, 1, 1.1], [2.76, 0.35, 2.4], [5.4, 0.12, 4], [1.007, 0.6, 1.0]];
  for (let j = 0; j < SR * 4; j++) {
    const t = j / SR; let s = 0;
    for (const [mul, a, d] of parts) s += Math.sin(TAU * f * mul * t) * a * Math.exp(-t * d);
    s *= g * Math.min(1, t * 300);
    add(i0 + j, s * (1 - pan), s * (1 + pan));
  }
}
function pluck(at, m, g = 0.22, bright = 0.5) {   // petikan senar (Karplus-Strong) ala oud
  const f = hz(m + KEY), n = Math.max(2, Math.round(SR / f)), buf = new Float32Array(n);
  for (let k = 0; k < n; k++) buf[k] = rnd() * (k < n * bright ? 1 : 0.3);
  const i0 = Math.floor(at * SR), pan = r01() * 0.6 - 0.3; let p = 0;
  for (let j = 0; j < SR * 2.2; j++) {
    const a = buf[p], b = buf[(p + 1) % n];
    buf[p] = (a + b) * 0.5 * 0.996; p = (p + 1) % n;
    const s = a * g * Math.min(1, j / 40);
    add(i0 + j, s * (1 - pan), s * (1 + pan));
  }
}
function piano(at, m, g = 0.12, len = 3.5) {   // piano sederhana: parsial meluruh, nada tinggi lebih cepat habis
  const i0 = Math.floor(at * SR), f = hz(m + KEY), pan = (m - 60) / 60;
  for (let j = 0; j < SR * len; j++) {
    const t = j / SR;
    let s = 0;
    for (let h = 1; h <= 6; h++) s += Math.sin(TAU * f * h * (1 + 0.0004 * h * h) * t) / (h * h * 0.8) * Math.exp(-t * (0.9 + h * 0.55));
    s *= g * Math.min(1, t * 900) * Math.min(1, (len - t) / 0.3);
    add(i0 + j, s * (1 - pan), s * (1 + pan));
  }
}
function flute(at, m, len, g = 0.07, breath = 0.35) {   // suling/ney: sine + vibrato + napas
  const i0 = Math.floor(at * SR), f = hz(m + KEY); let ph = 0, nz = 0;
  for (let j = 0; j < SR * len; j++) {
    const t = j / SR, vib = 1 + 0.006 * Math.sin(TAU * 5.2 * t) * Math.min(1, t / 0.6);
    ph += TAU * f * vib / SR; nz += (rnd() - nz) * lpA(f * 2);
    const env = Math.min(1, t / 0.25) * Math.min(1, (len - t) / 0.4);
    const s = (Math.sin(ph) + 0.25 * Math.sin(2 * ph) + nz * breath) * env * g;
    add(i0 + j, s * 0.9, s);
  }
}
function drum(at, g = 0.5, pitch = 55, decay = 6, noise = 0.3) {   // drum tangan / taiko
  const i0 = Math.floor(at * SR); let ph = 0, lp = 0;
  for (let j = 0; j < SR * 1.2; j++) {
    const t = j / SR, f = pitch * (1 + 1.5 * Math.exp(-t * 30));
    ph += TAU * f / SR; lp += (rnd() - lp) * lpA(900);
    const s = (Math.sin(ph) + lp * noise * Math.exp(-t * 25)) * Math.exp(-t * decay) * g * Math.min(1, t * 2000);
    add(i0 + j, s);
  }
}
function noiseBed(gain, fc0, fc1, rate = 0.9, from = 0, wave = 0) {   // angin / ombak (wave = periode ombak dalam detik)
  let lo = 0, hi = 0;
  for (let i = Math.floor(from * SR); i < N; i++) {
    const t = i / SR, n = rnd(), fc = fc0 + fc1 * Math.sin(t * rate);
    lo += (n - lo) * lpA(fc); hi += (lo - hi) * lpA(fc * 0.5);
    const sw = wave ? Math.pow(0.5 + 0.5 * Math.sin(TAU * t / wave), 2) : 0.6 + 0.4 * Math.sin(t * 1.3);
    const env = gain * sw * fadeIO(t - from, 2, 1.2);
    add(i, (lo - hi) * env, (lo - hi) * env * 0.85);
  }
}
function bird(at, g = 0.05) {   // kicau burung: chirp FM cepat
  const i0 = Math.floor(at * SR), base = 2600 + r01() * 1600, n = 2 + Math.floor(r01() * 3), pan = r01() * 1.2 - 0.6;
  for (let c = 0; c < n; c++) {
    const c0 = i0 + Math.floor(c * 0.11 * SR); let ph = 0;
    for (let j = 0; j < SR * 0.08; j++) {
      const t = j / SR, f = base * (1 + 0.35 * Math.sin(TAU * 38 * t)) * (1 + t * 4);
      ph += TAU * f / SR;
      const s = Math.sin(ph) * Math.sin(Math.PI * t / 0.08) * g;
      add(c0 + j, s * (1 - pan), s * (1 + pan));
    }
  }
}
// rangkai melodi acak (seed) dari tangga nada, tanpa lompatan jauh
function melody(scale, count, start = 2) {
  const out = []; let k = start;
  for (let i = 0; i < count; i++) { k = Math.max(0, Math.min(scale.length - 1, k + pick([-2, -1, -1, 1, 1, 2, 0]))); out.push(scale[k]); }
  return out;
}

// ---------------------------------------------------------------- mood
const MOODS = {
  misteri() {
    drone([[26, 0.16], [38, 0.12], [45, 0.07]]);
    pad([[50, 53, 57, 64]], 99, 0.05, { from: 1 });
    const notes = melody([62, 64, 65, 69, 72, 74, 77, 81], 40, 5);
    for (let t = 1.4, k = 0; t < DUR - 1.5; t += (1.5 + r01() * 1.2) / TEMPO, k++) bell(t, notes[k]);
    noiseBed(0.05, 600, 400);
    return { verb: 0.86, wet: 0.55 };
  },
  gurun() {
    // Hijaz / Phrygian dominan: D Eb F# G A Bb C
    const sc = [50, 51, 54, 55, 57, 58, 60, 62, 63, 66, 67, 69];
    drone([[38, 0.14], [45, 0.08], [50, 0.04]]);
    const beat = 60 / (78 * TEMPO);
    const pat = pick(['x..x..x.x...x...', 'x...x.x.x..xx...', 'x..x.x..x..x.x..']);
    for (let b = 0, t = 1.0; t < DUR - 1; b++, t += beat / 2) {
      const c = pat[b % 16];
      if (c === 'x') drum(t, b % 8 === 0 ? 0.42 : 0.26, b % 8 === 0 ? 70 : 140, b % 8 === 0 ? 7 : 14, 0.6);
    }
    const mel = melody(sc, 64, 6);
    for (let t = 2.0, k = 0; t < DUR - 1.5; k++) {   // frase oud: 4–6 petikan lalu jeda
      const n = 4 + Math.floor(r01() * 3);
      for (let q = 0; q < n && t < DUR - 1.5; q++, k++) { pluck(t, mel[k % mel.length], 0.2); t += beat * pick([0.5, 0.5, 1]); }
      t += beat * 2;
    }
    for (let t = 5 + r01() * 2; t < DUR - 4; t += 7 + r01() * 4) flute(t, pick(sc.slice(4, 10)) + 12, 2.6, 0.06, 0.5);
    noiseBed(0.045, 500, 300);
    return { verb: 0.84, wet: 0.45 };
  },
  epik() {
    const beat = 60 / (92 * TEMPO), bar = beat * 4;
    const prog = [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]];   // Dm Bb F C
    pad(prog.map((c) => [...c, c[0] + 12]), bar, 0.06, { bright: 900, swell: 4 });
    pad(prog.map((c) => [c[0] - 12, c[0] - 24]), bar, 0.07, { bright: 220, swell: 2 });   // brass rendah
    drone([[26, 0.12]]);
    // drum makin rapat: awal tiap bar, lalu tiap ketukan, lalu 8-an
    for (let t = 0.5, k = 0; t < DUR - 1; k++) {
      const p = t / DUR;
      drum(t, 0.55, 48, 4.5, 0.25);
      const step = p < 0.3 ? bar : p < 0.65 ? beat : beat / 2;
      if (p > 0.45 && k % 2) drum(t + step / 2, 0.25, 90, 9, 0.5);
      t += step;
    }
    // nada naik di 1/3 akhir
    const rise = DUR * 0.62;
    for (let i = Math.floor(rise * SR), ph = 0; i < N; i++) {
      const t = i / SR - rise, f = hz(62 + KEY) * (1 + t * 0.06);
      ph += TAU * f / SR;
      add(i, Math.sin(ph) * 0.03 * Math.min(1, t / 2) * fadeIO(i / SR, 1, 1.5));
    }
    noiseBed(0.03, 400, 200);
    return { verb: 0.82, wet: 0.4 };
  },
  tragis() {
    const beat = 60 / (58 * TEMPO), bar = beat * 4;
    const prog = pick([[[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], [[50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52]]]);
    pad(prog, bar, 0.035, { bright: 380, swell: 4, from: 0.5 });
    drone([[prog[0][0] - 24, 0.08]]);
    const up = melody([0, 1, 2, 1, 2, 0, 1], 64, 0);   // indeks nada akor (0–2)
    for (let t = 0.8, k = 0; t < DUR - 2; k++) {   // arpeggio piano: akar rendah lalu nada akor naik pelan
      const ch = prog[Math.floor(t / bar) % prog.length];
      piano(t, ch[0] - 12, 0.1, 4);
      for (let q = 0; q < 3 && t < DUR - 2; q++) { t += beat; piano(t, ch[up[(k * 3 + q) % up.length]] + 12, 0.07, 3); }
      t += beat;
    }
    noiseBed(0.02, 900, 300);
    return { verb: 0.9, wet: 0.65 };
  },
  alam() {
    // pentatonik (mirip slendro): D E G A C
    const sc = [62, 64, 67, 69, 72, 74, 76, 79];
    drone([[38, 0.1], [50, 0.04]]);
    const beat = 60 / (70 * TEMPO);
    const mel = melody(sc, 80, 3);
    for (let t = 1.2, k = 0; t < DUR - 1.5; k++) {   // pola bilah gamelan berulang dengan variasi
      gong(t, mel[k % 16 + Math.floor(k / 32) * 2 % 4], 0.09);
      if (k % 8 === 0) gong(t, sc[0] - 24, 0.12);   // gong besar
      t += beat * (k % 4 === 3 ? 2 : 1);
    }
    for (let t = 4 + r01() * 2; t < DUR - 4; t += 6 + r01() * 4) flute(t, pick(sc.slice(2, 7)), 3, 0.05, 0.6);
    noiseBed(0.07, 350, 250, 0.4, 0, 7);   // ombak
    for (let t = 2 + r01() * 3; t < DUR - 1; t += 2.5 + r01() * 4) bird(t);
    return { verb: 0.8, wet: 0.4 };
  },
};
if (!MOODS[MOOD]) { console.error(`mood tidak dikenal: ${MOOD} (pilihan: ${Object.keys(MOODS).join(', ')})`); process.exit(1); }

// dentuman: keras di awal, halus di tiap pergantian adegan (tragis: lebih pelan)
const hitG = MOOD === 'tragis' ? 0.5 : 1;
boom(0, hitG);
for (const h of HITS) boom(h, 0.45 * hitG);
const { verb, wet } = MOODS[MOOD]();

// reverb sederhana (comb + lowpass)
function reverb(x, delays, fb) {
  const y = new Float32Array(x.length);
  for (const d0 of delays) {
    const d = Math.floor(d0 * SR), buf = new Float32Array(d); let k = 0, lp = 0;
    for (let i = 0; i < x.length; i++) { const o = buf[k]; lp += (o - lp) * 0.35; buf[k] = x[i] + lp * fb; k = (k + 1) % d; y[i] += o / delays.length; }
  }
  return y;
}
const wl = reverb(L, [0.0297, 0.0371, 0.0411, 0.0437], verb), wr = reverb(R, [0.0311, 0.0359, 0.0423, 0.0449], verb);
let peak = 0;
for (let i = 0; i < N; i++) { L[i] = L[i] * 0.7 + wl[i] * wet; R[i] = R[i] * 0.7 + wr[i] * wet; peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }

// WAV 16-bit stereo, dinormalisasi ke −1 dBFS
const g = 0.89 / peak, buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) { buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * g)) * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * g)) * 32767), 46 + i * 4); }
writeFileSync(out, buf);
console.log('ok', out, `${DUR}s`, MOOD, `seed ${SEED}`, `key ${KEY >= 0 ? '+' : ''}${KEY}`, `tempo ×${TEMPO.toFixed(2)}`);
