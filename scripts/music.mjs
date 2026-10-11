#!/usr/bin/env node
// Generator musik background (synth sendiri, 100% bebas lisensi) → assets/audio/bg-0N-<gaya>.mp3
// Dimas ambil acak 1 per video kalau data_json.music kosong.
//   node scripts/music.mjs            bikin ulang ke-5 lagu
import { writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SR = 44100;
const TAU = Math.PI * 2;
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
const lpA = (fc) => 1 - Math.exp(-TAU * fc / SR);

// ---------- lagu (16 langkah per bar; pola string: x = bunyi)
const SONGS = [
  { file: 'bg-01-hype', bpm: 128, chords: [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62]], roots: [45, 41, 48, 43],
    kick: 'x...x...x...x...', clap: '....x.......x...', hat: 'xxxxxxxxxxxxxxxx', ohat: '..x...x...x...x.', bass: 'saw', bassPat: '..x...x...x...x.', pad: 'saw', arp: 'up', pump: 0.75 },
  { file: 'bg-02-trap', bpm: 140, chords: [[62, 65, 69], [58, 62, 65], [55, 58, 62], [57, 61, 64]], roots: [38, 34, 31, 33],
    kick: 'x.........x.....', clap: '........x.......', hat: 'x.x.x.x.x.x.xxxx', bass: '808', bassPat: 'x.........x.....', pad: 'dark', arp: 'bell', pump: 0.3 },
  { file: 'bg-03-chill', bpm: 86, chords: [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]], roots: [41, 40, 38, 36],
    kick: 'x......x..x.....', clap: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', bass: 'sine', bassPat: 'x......x..x.....', pad: 'ep', swing: 0.22, lofi: true, pump: 0.2 },
  { file: 'bg-04-future', bpm: 150, chords: [[53, 57, 60, 65], [55, 59, 62, 67], [52, 55, 59, 64], [57, 60, 64, 69]], roots: [41, 43, 40, 45],
    kick: 'x.....x...x.....', clap: '........x.......', hat: '..x...x...x...x.', bass: 'saw', bassPat: 'x.....x...x.....', pad: 'super', stab: 'x..x..x...x.x...', pump: 0.9 },
  { file: 'bg-05-retro', bpm: 110, chords: [[48, 51, 55], [44, 48, 51], [46, 51, 55], [46, 50, 53]], roots: [36, 32, 39, 34],
    kick: 'x...x...x...x...', clap: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', bass: 'octave', bassPat: 'xxxxxxxxxxxxxxxx', pad: 'saw', arp: 'updown', gated: true, pump: 0.5 },
];

function make(s) {
  const bar = (60 / s.bpm) * 4, step = bar / 16;
  const bars = Math.ceil(32 / bar / 4) * 4;
  const len = Math.ceil(bars * bar * SR) + SR;
  const L = new Float32Array(len), R = new Float32Array(len), duck = new Float32Array(len).fill(1);
  const add = (i, l, r = l) => { if (i >= 0 && i < len) { L[i] += l; R[i] += r; } };
  const at = (b, k) => Math.round((b * bar + k * step + (k % 2 ? (s.swing ?? 0) * step : 0)) * SR);
  const hit = (p, k) => p?.[k] === 'x';

  // drum
  const kick = (t0) => {
    let ph = 0;
    for (let i = 0; i < 0.4 * SR; i++) {
      const x = i / SR; ph += TAU * (45 + 120 * Math.exp(-x * 32)) / SR;
      add(t0 + i, Math.sin(ph) * Math.exp(-x * (s.lofi ? 10 : 7)) * 0.95);
      const d = 1 - s.pump * Math.exp(-x * 9);
      if (t0 + i < len) duck[t0 + i] = Math.min(duck[t0 + i], d);
    }
  };
  const clap = (t0) => {
    let lp = 0;
    const dec = s.gated ? 6 : 16;
    for (let i = 0; i < (s.gated ? 0.35 : 0.25) * SR; i++) {
      const x = i / SR, n = rnd(); lp += lpA(s.lofi ? 2500 : 5000) * (n - lp);
      const burst = x < 0.03 ? (Math.floor(x / 0.01) % 2 ? 0.6 : 1) : 1;
      const v = (lp - (s.lofi ? 0 : lp * 0.4)) * Math.exp(-x * dec) * 0.42 * burst + Math.sin(TAU * 190 * x) * Math.exp(-x * 30) * 0.18;
      add(t0 + i, v * (s.gated && x > 0.3 ? 0 : 1), v * (s.gated && x > 0.3 ? 0 : 1) * 0.95);
    }
  };
  const hat = (t0, open, vol) => {
    let lp = 0;
    for (let i = 0; i < (open ? 0.22 : 0.05) * SR; i++) {
      const n = rnd(); lp += lpA(7000) * (n - lp);
      const v = (n - lp) * Math.exp(-(i / SR) * (open ? 14 : 70)) * vol;
      add(t0 + i, v * 0.8, v);
    }
  };
  // nada
  const tone = (t0, dur, freq, o) => {
    const { wave = 'saw', vol = 0.1, atk = 0.005, rel = 0.08, cut = 2000, cutEnv = 0, det = 0, pan = 0, sc = true, glideFrom } = o;
    let ph = Math.random(), lp = 0, lp2 = 0;
    const n = Math.round((dur + rel) * SR);
    for (let i = 0; i < n; i++) {
      const x = i / SR;
      const f = (glideFrom && x < 0.06 ? glideFrom + (freq - glideFrom) * (x / 0.06) : freq) * 2 ** (det / 1200);
      ph = (ph + f / SR) % 1;
      let v = wave === 'saw' ? ph * 2 - 1 : wave === 'sq' ? (ph < 0.5 ? 1 : -1) : wave === 'tri' ? 1 - 4 * Math.abs(ph - 0.5) : Math.sin(ph * TAU);
      if (wave === 'ep') v = Math.sin(ph * TAU) + 0.35 * Math.sin(ph * TAU * 2) * Math.exp(-x * 6);
      if (wave === '808') v = Math.tanh(Math.sin(ph * TAU) * 1.8);
      const env = Math.min(1, x / atk) * (x > dur ? Math.max(0, 1 - (x - dur) / rel) : 1);
      const c = cut + cutEnv * Math.exp(-x * 12);
      lp += lpA(c) * (v - lp); lp2 += lpA(c) * (lp - lp2);
      const out = lp2 * env * vol * (sc ? duck[Math.min(len - 1, t0 + i)] : 1);
      add(t0 + i, out * (1 - pan), out * (1 + pan));
    }
  };

  for (let b = 0; b < bars; b++) {
    const ci = b % s.chords.length, ch = s.chords[ci], root = s.roots[ci];
    for (let k = 0; k < 16; k++) {
      const t = at(b, k);
      if (hit(s.kick, k)) kick(t);
      if (hit(s.clap, k)) clap(t);
      if (hit(s.hat, k)) hat(t, false, k % 4 === 0 ? 0.08 : 0.05);
      if (hit(s.ohat, k)) hat(t, true, 0.07);
      if (s.file.includes('trap') && b % 2 === 1 && k >= 12) for (let r = 1; r < 3; r++) hat(t + Math.round(r * step * SR / 3), false, 0.04);
    }
  }
  seed = 7;
  // kick dulu (isi duck), baru nada yang kena sidechain
  for (let b = 0; b < bars; b++) {
    const ci = b % s.chords.length, ch = s.chords[ci], root = s.roots[ci];
    const t0 = at(b, 0);
    // pad / akor
    if (s.pad === 'saw' || s.pad === 'dark') for (const m of ch) for (const det of [-9, 0, 9]) tone(t0, bar * 0.98, hz(m), { vol: s.pad === 'dark' ? 0.028 : 0.035, atk: 0.25, rel: 0.4, cut: s.pad === 'dark' ? 900 : 1800, det, pan: det / 20 });
    if (s.pad === 'ep') for (let k = 0; k < 16; k += 8) for (const m of ch) tone(at(b, k + (k ? 0 : 0)), step * 6, hz(m), { wave: 'ep', vol: 0.06, atk: 0.01, rel: 0.5, cut: 3000, pan: (m % 3 - 1) * 0.3 });
    if (s.pad === 'super') for (let k = 0; k < 16; k++) if (hit(s.stab, k)) for (const m of ch) for (const det of [-18, -9, 0, 9, 18]) tone(at(b, k), step * 1.6, hz(m + 12), { vol: 0.022, atk: 0.01, rel: 0.15, cut: 3500, cutEnv: 2500, det, pan: det / 30 });
    // bass
    for (let k = 0; k < 16; k++) {
      if (!hit(s.bassPat, k)) continue;
      const t = at(b, k);
      if (s.bass === 'saw') tone(t, step * 1.6, hz(root), { vol: 0.16, cut: 380, cutEnv: 900, rel: 0.04 });
      if (s.bass === 'sine') tone(t, step * 3, hz(root), { wave: 'sine', vol: 0.3, rel: 0.12, cut: 600, sc: false });
      if (s.bass === '808') tone(t, step * 7, hz(root + 12), { wave: '808', vol: 0.32, rel: 0.25, cut: 900, sc: false, glideFrom: k ? hz(root + 17) : undefined });
      if (s.bass === 'octave') tone(t, step * 0.8, hz(root + (k % 2 ? 12 : 0)), { vol: 0.15, cut: 700, cutEnv: 1200, rel: 0.03 });
    }
    // arp / melodi
    if (s.arp) {
      const notes = [...ch, ch[0] + 12, ch[1] + 12];
      for (let k = 0; k < 16; k++) {
        let m;
        if (s.arp === 'up') m = notes[k % notes.length] + 12;
        else if (s.arp === 'updown') { const seq = [...notes, ...notes.slice(1, -1).reverse()]; m = seq[k % seq.length] + 12; }
        else if (s.arp === 'bell') { if (![0, 3, 6, 10, 12].includes(k) || (b % 4 === 3 && k > 6)) continue; m = notes[(k + b) % notes.length] + 12; }
        const t = at(b, k), o = { wave: s.arp === 'bell' ? 'tri' : 'sq', vol: s.arp === 'bell' ? 0.07 : 0.035, atk: 0.003, rel: 0.12, cut: 1400, cutEnv: 3000, pan: k % 2 ? 0.35 : -0.35 };
        tone(t, step * (s.arp === 'bell' ? 2 : 0.6), hz(m), o);
        tone(t + Math.round(step * 3 * SR), step * 0.6, hz(m), { ...o, vol: o.vol * 0.35, pan: -o.pan }); // gema
      }
    }
    // riser sebelum tiap 8 bar
    if (b % 8 === 7) for (let i = 0; i < bar * SR; i++) { const x = i / (bar * SR); const v = rnd() * x * x * 0.08; add(t0 + i, v, v * 0.9); }
  }
  // master: lofi lowpass + kresek, normalisasi, soft clip
  if (s.lofi) {
    let a = 0, c = 0;
    for (let i = 0; i < len; i++) { a += lpA(4200) * (L[i] - a); c += lpA(4200) * (R[i] - c); L[i] = a; R[i] = c; if (Math.random() < 0.0004) { L[i] += rnd() * 0.08; R[i] += rnd() * 0.08; } L[i] += rnd() * 0.004; R[i] += rnd() * 0.004; }
  }
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const g = 0.9 / (peak || 1);
  const pcm = Buffer.alloc(len * 4);
  for (let i = 0; i < len; i++) {
    const fade = Math.min(1, (len - i) / SR);
    pcm.writeInt16LE(Math.round(Math.tanh(L[i] * g * 1.1) * fade * 32000), i * 4);
    pcm.writeInt16LE(Math.round(Math.tanh(R[i] * g * 1.1) * fade * 32000), i * 4 + 2);
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + pcm.length, 4); head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(2, 22); head.writeUInt32LE(SR, 24);
  head.writeUInt32LE(SR * 4, 28); head.writeUInt16LE(4, 32); head.writeUInt16LE(16, 34); head.write('data', 36); head.writeUInt32LE(pcm.length, 40);
  return { wav: Buffer.concat([head, pcm]), secs: (len / SR).toFixed(1) };
}

const dir = join(ROOT, 'assets', 'audio');
mkdirSync(dir, { recursive: true });
for (const s of SONGS) {
  const { wav, secs } = make(s);
  const tmp = join(dir, `${s.file}.wav`);
  writeFileSync(tmp, wav);
  execFileSync(ffmpegPath, ['-y', '-loglevel', 'error', '-i', tmp, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '44100', '-b:a', '192k', join(dir, `${s.file}.mp3`)]);
  unlinkSync(tmp);
  console.log(`${s.file}.mp3 · ${s.bpm} bpm · ${secs} dtk`);
}
