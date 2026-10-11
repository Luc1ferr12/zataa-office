// Kantor virtual pixel art: gedung dirender sekali (Web Worker), pegawai & layar digambar tiap frame.
// API sama dengan versi 3D lama supaya main.js tidak banyak berubah.
import { W, H, PXH, VW, proj, depthOf, pack, blend, bayer, hash2, UP } from './px/engine.js';
import { makeSpots, ROOMS, DESKS } from './px/scene.js';
import { sprite, flamingoSprite } from './px/sprites.js';
import { textBitmap } from './px/font.js';
import { AGENTS } from './schedule.js';
import { locationFor, route } from './nav.js';

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const hx = (h) => { const n = parseInt(h.slice(1), 16); return pack((n >> 16) & 255, (n >> 8) & 255, n & 255); };
const mul = (c, r, g, b) => pack((c & 255) * r, ((c >>> 8) & 255) * g, ((c >>> 16) & 255) * b);

// "kotak pandang" bagian menarik di kanvas (dipakai saat zoom pas layar)
const FOCUS = { x: 90, y: 60, w: 820, h: 640 };
const SEAT_N = new Set(['type', 'talk', 'phone', 'game', 'bench', 'eat']);
const PRAY = [['qiyam', 6], ['ruku', 3], ['itidal', 2], ['sujud', 3], ['duduk', 2], ['sujud', 3], ['itidal', 1]];
const PRAY_LEN = PRAY.reduce((s, p) => s + p[1], 0);
const MOOD_AT_DESK = { capek: ['up', 22, 3], kesel: ['face', 16, 3], marah: ['shake', 10, 1.6] };

const WATER_D = ['#0f6f9e', '#1a8fc0', '#2cb0d8', '#62d2ec', '#c9f6ff'].map(hx);
const WATER_N = ['#05294a', '#0a4a72', '#127aa6', '#2fb2d8', '#9cefff'].map(hx);
const C = Object.fromEntries(Object.entries({
  scrBg: '#151331', scrOff: '#0a0912', glare: '#34314a', code1: '#a78bfa', code2: '#5eead4', code3: '#f9a8d4', code4: '#fde68a', dim: '#4b4870',
  tvTop: '#3b1592', tvBot: '#140a2e', white: '#f8f6ff', violet: '#b794ff', amber: '#fbbf24', green: '#34d399', red: '#f87171',
  field: '#1f5d3a', field2: '#2a7a4a', lane: '#c7b98a',
}).map(([k, v]) => [k, hx(v)]));

function layer() {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, H);
  return { cv, ctx, img, u32: new Uint32Array(img.data.buffer) };
}

async function loadLogo() {
  try {
    const im = new Image();
    await new Promise((res, rej) => { im.onload = res; im.onerror = rej; setTimeout(rej, 2500); im.src = 'assets/logo.png'; });
    const c = document.createElement('canvas'); c.width = c.height = 40;
    const g = c.getContext('2d');
    g.drawImage(im, 0, 0, 40, 40);
    const d = g.getImageData(0, 0, 40, 40);
    return { w: 40, h: 40, data: d.data };
  } catch { return null; }
}

export class Office {
  constructor(container, labelHost, outfit = 'kerja') {
    this.outfit = outfit;
    this.chars = new Map();
    this.selected = null;
    this.onSelect = null;
    this.showUpper = true;
    this.host = labelHost;
    this.spots = makeSpots();
    this.screens = new Array(DESKS).fill(false);
    this.tv = { theme: 'Belum ada plan', pending: 0, game: false };
    this.nightF = 0; this.golden = 0; this.dim = 0;
    this.t = 0;

    this.cv = document.createElement('canvas');
    this.cv.width = W; this.cv.height = H;
    this.cv.className = 'px-canvas';
    container.appendChild(this.cv);
    this.ctx = this.cv.getContext('2d');
    this.L = { day: layer(), night: layer() };

    this.labels = document.createElement('div');
    this.labels.className = 'px-labels';
    labelHost.appendChild(this.labels);
    this.roomEls = ROOMS.map((r) => {
      const el = document.createElement('div');
      el.className = 'room-label';
      el.innerHTML = `<span>${r.icon}</span>${r.name}`;
      this.labels.appendChild(el);
      return { r, el };
    });
    this.buildZoomUI(labelHost);

    // tampilan: zoom & geser
    this.z = 1; this.tx = 0; this.ty = 0;
    this.bindInput(labelHost);
    new ResizeObserver(() => this.fit(true)).observe(labelHost);

    this.pendingRenders = new Map();
    this.variants = {};
    this.ready = (async () => {
      this.logo = await loadLogo();
      this.base = await this.renderVariant(true);
      this.buildPeople();
      this.fit();
    })();
    this.last = performance.now();
    this.lastDraw = 0;
    const loop = (now) => { this.frame(now); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  // ---------- render gedung (di worker; fallback ke thread utama)
  renderVariant(upper) {
    if (this.variants[upper]) return Promise.resolve(this.variants[upper]);
    if (this.pendingRenders.has(upper)) return this.pendingRenders.get(upper);
    const p = new Promise((resolve) => {
      const done = (r) => { this.variants[upper] = r; this.pendingRenders.delete(upper); resolve(r); };
      try {
        if (!this.worker) {
          this.worker = new Worker(new URL('./px/worker.js', import.meta.url), { type: 'module' });
          this.worker.onmessage = (e) => this.workerDone?.get(e.data.upper)?.(e.data);
          this.workerDone = new Map();
        }
        this.workerDone.set(upper, done);
        this.worker.postMessage({ upper, logo: this.logo });
      } catch {
        Promise.all([import('./px/engine.js'), import('./px/scene.js')]).then(([E, S]) => {
          const { prims, lights } = S.buildScene(this.logo, { upper });
          const R = E.renderScene(prims, lights);
          const dyn = {};
          for (const [k, d] of R.dyn) dyn[k] = d;
          done({ ...R, dyn });
        });
      }
    });
    this.pendingRenders.set(upper, p);
    return p;
  }

  buildPeople() {
    AGENTS.forEach((a, idx) => {
      const loc = locationFor(this.spots, a, idx, 'out');
      const c = {
        agent: a, idx, loc, locKey: 'out', present: false, pos: loc.pos.clone(), path: [], pending: null,
        pose: 'stand', arrivePose: 'stand', yaw: 0, finalYaw: 0, speed: 1.3, speedMul: 1, walkDist: 0,
        seed: hash2(idx, 3) * 10, mood: 'fokus', lane: null,
      };
      const el = document.createElement('div');
      el.className = 'bubble';
      el.innerHTML = `<span class="b-mood"></span><span class="b-name">${a.name}</span><span class="b-act"></span>`;
      el.addEventListener('pointerup', (e) => { e.stopPropagation(); this.select(a.id); });
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
      this.labels.appendChild(el);
      c.label = el;
      this.chars.set(a.id, c);
    });
  }

  // mode: 'init' (taruh langsung), 'walk' (jalan normal), 'rush' (jalan cepat saat waktu simulasi lompat)
  setActivity(id, info, mode = 'walk') {
    const c = this.chars.get(id);
    if (!c) return;
    c.info = info;
    c.mood = info.mood?.key ?? 'fokus';
    c.label.querySelector('.b-mood').textContent = info.mood?.emoji ?? '';
    c.label.querySelector('.b-act').textContent = `${info.emoji} ${info.label}`;
    c.label.classList.toggle('is-selected', this.selected === id);

    const key = info.loc === 'lounge' && info.label.includes('Mabar') ? 'game' : info.loc;
    if (c.idx < DESKS) this.screens[c.idx] = c.locKey === 'desk' && !c.path.length;

    if (mode === 'init') {
      const to = locationFor(this.spots, c.agent, c.idx, key, info);
      c.path = []; c.pending = null; c.locKey = key; c.loc = to;
      c.present = !to.out;
      c.pos.copy(to.pos);
      c.yaw = c.finalYaw = to.rot;
      c.pose = c.arrivePose = to.pose;
      c.lane = to.lane ?? null; c.laneT0 = this.t;
      return;
    }
    if (c.path.length) {
      if (key !== c.locKey || c.pending) c.pending = { key, info, mode };
      if (mode === 'rush') c.speedMul = 4;
      return;
    }
    if (key !== c.locKey) this.go(c, key, info, mode);
  }

  go(c, key, info, mode) {
    if (key === c.locKey) return;
    const to = locationFor(this.spots, c.agent, c.idx, key, info);
    if (!c.present && to.out) { c.locKey = key; c.loc = to; return; }
    const from = c.loc;
    if (!c.present) { c.present = true; c.pos.copy(from.pos); }
    c.path = route(from, to);
    c.lane = null;
    c.finalYaw = to.rot;
    c.arrivePose = to.pose;
    c.speedMul = mode === 'rush' ? 4 : 1;
    c.locKey = key;
    c.loc = to;
    c.onArrive = () => {
      if (to.out) c.present = false;
      if (to.lane) { c.lane = to.lane; c.laneT0 = this.t; }
      if (c.pending) { const p = c.pending; c.pending = null; this.go(c, p.key, p.info, p.mode); }
    };
  }

  // ---------- siang / malam
  setTime(minutes, dow) {
    const h = minutes / 60;
    const day = smooth(5.6, 7, h) * (1 - smooth(17.4, 18.8, h));
    this.nightF = 1 - day;
    this.golden = Math.max(1 - smooth(6, 8.5, h), smooth(15.5, 17.8, h)) * day;
    this.dim = h >= 23 || h < 5 ? 0.45 : 0;
    this.officeOpen = dow !== 0 && h >= 7.5 && h < 17.5;
  }

  setCampaign(theme, pending) {
    this.tv.theme = theme || 'Belum ada plan';
    this.tv.pending = pending ?? 0;
    this.tv.themeBm = textBitmap(this.tv.theme);
  }

  // Senin = baju formal, hari lain = baju kerja (sprite dibuat ulang otomatis)
  setOutfitForDay(dow) { this.outfit = dow === 1 ? 'formal' : 'kerja'; }

  async toggleUpper(show) {
    this.showUpper = show;
    const v = await this.renderVariant(show);
    if (this.showUpper === show) this.base = v;
  }

  focus(id) {
    const c = this.chars.get(id);
    if (!c?.present) return;
    const [sx, sy] = proj(c.pos.x, c.pos.y, c.pos.z);
    const r = this.host.getBoundingClientRect();
    this.z = Math.max(this.z, Math.min(3, this.maxZ));
    this.tx = r.width / 2 - sx * this.z;
    this.ty = r.height / 2 - (sy - 12) * this.z;
    this.clampView();
  }

  select(id) {
    this.selected = id;
    this.chars.forEach((c, k) => c.label.classList.toggle('is-selected', k === id));
    this.onSelect?.(id);
  }

  // ---------- zoom & geser
  buildZoomUI(host) {
    const box = document.createElement('div');
    box.className = 'zoom-ctl';
    box.innerHTML = '<button type="button" data-z="in" aria-label="Perbesar">+</button><button type="button" data-z="out" aria-label="Perkecil">−</button><button type="button" data-z="fit" aria-label="Lihat semua">⤢</button>';
    box.addEventListener('pointerdown', (e) => e.stopPropagation());
    box.addEventListener('click', (e) => {
      const k = e.target.closest('button')?.dataset.z;
      const r = host.getBoundingClientRect();
      if (k === 'fit') this.fit();
      else if (k) this.zoomAt(r.width / 2, r.height / 2, k === 'in' ? 1.4 : 1 / 1.4);
    });
    host.appendChild(box);
  }
  fit(keep = false) {
    const r = this.host.getBoundingClientRect();
    if (!r.width) return;
    this.minZ = Math.max(r.width / W, r.height / H);
    this.maxZ = 6;
    if (keep && this.fitted) { this.clampView(); return; }
    // isi selebar kotak, tapi usahakan seluruh gedung tetap kelihatan
    this.z = clamp(Math.max(Math.min(r.width / FOCUS.w, r.height / FOCUS.h), r.width / W), this.minZ, this.maxZ);
    if (r.width < 700) this.z = Math.max(this.z, 1); // HP: jangan terlalu kecil, geser untuk lihat sisanya
    this.tx = r.width / 2 - (FOCUS.x + FOCUS.w / 2) * this.z;
    this.ty = r.height / 2 - (FOCUS.y + FOCUS.h / 2) * this.z;
    if (FOCUS.h * this.z > r.height) this.ty = -(FOCUS.y + 30) * this.z; // kalau tidak muat, utamakan atap gedung terlihat
    this.fitted = true;
    this.clampView();
  }
  zoomAt(px, py, f) {
    const z = clamp(this.z * f, this.minZ ?? 0.5, this.maxZ ?? 6);
    this.tx = px - ((px - this.tx) * z) / this.z;
    this.ty = py - ((py - this.ty) * z) / this.z;
    this.z = z;
    this.clampView();
  }
  clampView() {
    const r = this.host.getBoundingClientRect();
    const cw = W * this.z, ch = H * this.z;
    this.tx = cw <= r.width ? (r.width - cw) / 2 : clamp(this.tx, r.width - cw, 0);
    this.ty = ch <= r.height ? (r.height - ch) / 2 : clamp(this.ty, r.height - ch, 0);
    this.cv.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.z})`;
    this.cv.classList.toggle('smooth', this.z < 1);
    this.placeLabels();
  }
  bindInput(host) {
    const pts = new Map();
    let drag = null, pinch = null;
    host.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.inspector, .bubble, .zoom-ctl, .legend')) return;
      host.setPointerCapture?.(e.pointerId);
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 1) drag = { x: e.clientX, y: e.clientY, tx: this.tx, ty: this.ty, moved: 0 };
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: this.z };
        drag = null;
      }
    });
    host.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pinch && pts.size === 2) {
        const [a, b] = [...pts.values()];
        const r = host.getBoundingClientRect();
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        this.zoomAt((a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top, (pinch.z * d) / pinch.d / this.z);
        return;
      }
      if (!drag) return;
      drag.moved = Math.max(drag.moved, Math.hypot(e.clientX - drag.x, e.clientY - drag.y));
      this.tx = drag.tx + e.clientX - drag.x;
      this.ty = drag.ty + e.clientY - drag.y;
      this.clampView();
      host.classList.add('dragging');
    });
    const end = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      host.classList.remove('dragging');
      if (pts.size < 2) pinch = null;
      if (drag && drag.moved < 5 && e.type === 'pointerup') this.pick(e);
      if (!pts.size) drag = null;
    };
    host.addEventListener('pointerup', end);
    host.addEventListener('pointercancel', end);
    host.addEventListener('wheel', (e) => {
      if (e.target.closest('.inspector')) return;
      e.preventDefault();
      const r = host.getBoundingClientRect();
      this.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });
  }
  pick(e) {
    const r = this.host.getBoundingClientRect();
    const cx = (e.clientX - r.left - this.tx) / this.z, cy = (e.clientY - r.top - this.ty) / this.z;
    let best = null;
    for (const a of this.actors ?? []) {
      if (!a.c) continue;
      const s = a.spr, x = Math.floor(cx - (a.sx - s.ax)), y = Math.floor(cy - (a.sy - s.ay - s.lift));
      // toleransi 2 px di sekitar sprite (sprite kecil)
      let hit = false;
      for (let dy = -2; dy <= 2 && !hit; dy++) for (let dx = -2; dx <= 2 && !hit; dx++) {
        const X = x + dx, Y = y + dy;
        if (X >= 0 && Y >= 0 && X < s.w && Y < s.h && s.d[Y * s.w + X]) hit = true;
      }
      if (hit && (!best || a.d0 > best.d0)) best = a;
    }
    this.select(best?.c.agent.id ?? null);
  }

  // ---------- label HTML (nama pegawai & ruangan)
  placeLabels() {
    const put = (el, x, y) => { el.style.transform = `translate(${Math.round(this.tx + x * this.z)}px, ${Math.round(this.ty + y * this.z)}px) translate(-50%, -100%)`; };
    for (const { r, el } of this.roomEls) {
      const hide = !this.base || (!this.showUpper && r.p[1] > UP);
      el.hidden = hide;
      if (!hide) { const [x, y] = proj(...r.p); put(el, x, y); }
    }
    // bubble nama: geser ke atas kalau bertumpuk dengan bubble lain
    const placed = [];
    const list = [...this.chars.values()].map((c) => {
      const vis = c.present && (this.showUpper || c.pos.y < UP - 0.5);
      c.label.hidden = !vis;
      if (!vis) return null;
      const [x, y] = proj(c.pos.x, c.pos.y, c.pos.z);
      const top = c.pose === 'lie' ? 14 : c.pose === 'swim' ? 12 : c.pose === 'pray' ? 23 : SEAT_N.has(c.pose) || c.pose === 'beanbag' ? 21 : 24;
      if (!c.labelW) c.labelW = c.label.offsetWidth;
      return { c, x: this.tx + x * this.z, y: this.ty + (y - top) * this.z };
    }).filter(Boolean).sort((a, b) => b.y - a.y);
    for (const L of list) {
      const w = L.c.label.classList.contains('is-selected') ? L.c.label.offsetWidth : L.c.labelW || 80;
      for (let k = 0; k < 6 && placed.some((p) => Math.abs(p.x - L.x) < (p.w + w) / 2 + 2 && Math.abs(p.y - L.y) < 21); k++) L.y -= 21;
      placed.push({ x: L.x, y: L.y, w });
      L.c.label.style.transform = `translate(${Math.round(L.x)}px, ${Math.round(L.y)}px) translate(-50%, -100%)`;
    }
  }

  // ---------- gerak pegawai
  move(c, dt) {
    // jarak tempuh dibagi ke beberapa titik path sekaligus (tetap akurat walau frame jarang, mis. tab di belakang)
    let rest = c.speed * c.speedMul * dt;
    while (c.path.length && rest > 0) {
      const tg = c.path[0], p = c.pos;
      const dx = tg.x - p.x, dy = tg.y - p.y, dz = tg.z - p.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist <= rest) {
        p.copy(tg); c.walkDist += dist; rest -= dist;
        c.path.shift();
        if (!c.path.length) {
          c.pose = c.arrivePose; c.yaw = c.finalYaw; c.speedMul = 1;
          if (c.onArrive) { const f = c.onArrive; c.onArrive = null; f(); }
        }
      } else {
        p.x += (dx * rest) / dist; p.y += (dy * rest) / dist; p.z += (dz * rest) / dist;
        c.walkDist += rest; rest = 0;
        if (Math.hypot(dx, dz) > 0.05) c.yaw = Math.atan2(dx, dz);
        c.pose = p.y < -0.05 ? 'swim' : 'walk';
      }
    }
    if (!c.path.length && c.lane) {
      const L = c.lane, ph = (this.t - c.laneT0) * 0.33;
      c.pos.set(L.x - L.half * Math.cos(ph), L.y, L.z);
      c.yaw = Math.sin(ph) >= 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    if (c.idx < DESKS) this.screens[c.idx] = c.locKey === 'desk' && !c.path.length;
  }

  // ---------- satu frame
  frame(now) {
    const dt = Math.min(1, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    this.chars.forEach((c) => c.present && this.move(c, dt));
    if (!this.base || now - this.lastDraw < 40) return;
    this.lastDraw = now;
    this.tv.game = [...this.chars.values()].some((c) => c.present && c.locKey === 'game' && !c.path.length);

    const B = this.base, t = this.t, nf = this.nightF;
    this.actors = this.collectActors(t);
    const passes = [];
    if (nf < 0.999) passes.push(['day', false]);
    if (nf > 0.001) passes.push(['night', true]);
    for (const [k, night] of passes) {
      const buf = night ? B.night : B.day;
      this.drawDyn(buf, night, t);
      const Lr = this.L[k];
      Lr.u32.set(buf);
      for (const a of this.actors) this.drawActor(Lr.u32, a, night);
      Lr.ctx.putImageData(Lr.img, 0, 0);
    }
    const g = this.ctx;
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    if (nf < 0.999) g.drawImage(this.L.day.cv, 0, 0);
    if (nf > 0.001) { g.globalAlpha = nf < 0.999 ? nf : 1; g.drawImage(this.L.night.cv, 0, 0); g.globalAlpha = 1; }
    const gold = this.golden * 0.45, dim = this.dim * nf;
    if (gold > 0.01 || dim > 0.01) {
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = `rgb(${255 * (1 - dim)}, ${(255 - 70 * gold) * (1 - dim)}, ${(255 - 120 * gold) * (1 - dim * 0.6)})`;
      g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'source-over';
    }
    this.placeLabels();
  }

  collectActors(t) {
    const out = [];
    const prayPhase = (Date.now() / 1000) % PRAY_LEN;
    let acc = 0, phase = 'qiyam';
    for (const [p, d] of PRAY) { if (prayPhase < acc + d) { phase = p; break; } acc += d; }
    this.chars.forEach((c) => {
      if (!c.present || (!this.showUpper && c.pos.y > UP - 0.5)) return;
      const s = Math.sin(c.yaw), co = Math.cos(c.yaw);
      const dir = Math.abs(s) > Math.abs(co) + 0.05 ? (s > 0 ? 'E' : 'W') : co > 0 ? 'S' : 'N';
      let pose = c.pose, f = 0, v = '', jitter = 0;
      if (pose === 'walk') f = Math.floor(c.walkDist / 0.2) % 4;
      else if (pose === 'swim') f = Math.floor(t * 3 + c.seed) % 4;
      else if (pose === 'type') {
        f = Math.floor(t * 5 + c.seed) % 4;
        if (c.mood === 'ngantuk') v = 'sleepy';
        const m = MOOD_AT_DESK[c.mood];
        if (m && (t + c.seed * 7) % m[1] < m[2]) { if (m[0] === 'shake') jitter = Math.floor(t * 12) % 2 ? 1 : -1; else v = m[0]; }
      } else if (pose === 'talk') f = Math.floor(t * 1.3 + c.seed) % 4;
      else if (pose === 'eat' || pose === 'drink') f = Math.floor(t * 0.6 + c.seed) % 4;
      else if (pose === 'pray') v = phase;
      if (pose === 'drink' && f >= 2) pose = 'stand';
      const spr = sprite(c.agent.id, this.outfit, pose, dir, f, v);
      const [x, y] = proj(c.pos.x, c.pos.y, c.pos.z);
      let bias = 0.25;
      if (SEAT_N.has(pose) && dir === 'N') bias = 0.7;
      else if (SEAT_N.has(pose)) bias = 0.35;
      if (pose === 'swim') bias = 0.45;
      const d0 = pose === 'lie' ? depthOf(c.pos.x, 0.45, c.pos.z) + 0.3 : depthOf(c.pos.x, c.pos.y, c.pos.z) + bias;
      out.push({ c, spr, sx: Math.round(x) + jitter, sy: Math.round(y), d0, foot: depthOf(c.pos.x, c.pos.y, c.pos.z), shadow: pose === 'walk' || pose === 'stand' || pose === 'drink', ring: this.selected === c.agent.id });
    });
    // flamingo mengambang pelan
    const fx = 15.5 + Math.sin(t * 0.07) * 1.6, fz = 8.6 + Math.sin(t * 0.05 + 1) * 1.2;
    const [x, y] = proj(fx, -0.1, fz);
    out.push({ c: null, spr: flamingoSprite(), sx: Math.round(x), sy: Math.round(y + Math.sin(t * 1.3) * 0.6), d0: depthOf(fx, -0.1, fz) + 0.3 });
    return out.sort((a, b) => a.d0 - b.d0);
  }

  drawActor(buf, a, night) {
    const B = this.base, s = a.spr, depth = B.depth, glassD = B.glassD, glass = night ? B.glassNight : B.glassDay;
    const fi = clamp(a.sy, 0, H - 1) * W + clamp(a.sx, 0, W - 1);
    let lr = 1, lg = 1, lb = 1;
    if (night) { lr = Math.max(0.3, B.lightQ[fi * 3] / 100); lg = Math.max(0.3, B.lightQ[fi * 3 + 1] / 100); lb = Math.max(0.42, B.lightQ[fi * 3 + 2] / 100); }
    // bayangan kaki & cincin pilihan
    if (a.shadow || a.ring) {
      for (let dy = -2; dy <= 2; dy++) for (let dx = -6; dx <= 6; dx++) {
        const e = (dx * dx) / 36 + (dy * dy) / 4;
        if (e > 1.05) continue;
        const X = a.sx + dx, Y = a.sy + dy;
        if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        const i = Y * W + X;
        if (Math.abs(depth[i] - a.foot) > 0.3) continue;
        if (a.ring && e > 0.55) buf[i] = night ? hx('#c4a5ff') : hx('#8b5cf6');
        else if (a.shadow && e <= 0.75) buf[i] = mul(buf[i], 0.72, 0.7, 0.78);
      }
    }
    const x0 = a.sx - s.ax, y0 = a.sy - s.ay - s.lift;
    for (let j = 0; j < s.h; j++) {
      const Y = y0 + j;
      if (Y < 0 || Y >= H) continue;
      const dd = s.flat ? a.d0 : a.d0 + ((s.ay - j) / PXH) * VW[1];
      for (let i = 0; i < s.w; i++) {
        const col = s.d[j * s.w + i];
        if (!col) continue;
        const X = x0 + i;
        if (X < 0 || X >= W) continue;
        const k = Y * W + X;
        if (dd < depth[k]) continue;
        let c = night ? mul(col, lr, lg, lb) : col;
        if (glassD[k] > dd) c = blend(c, glass[k]);
        buf[k] = c;
      }
    }
  }

  // ---------- permukaan dinamis: air kolam & layar
  drawDyn(buf, night, t) {
    const D = this.base.dyn;
    const water = D.water;
    if (water) {
      const P = night ? WATER_N : WATER_D;
      const { idx, x, y, a, b } = water;
      for (let k = 0; k < idx.length; k++) {
        const X = x[k], Y = y[k];
        let v = 0.5 + 0.2 * Math.sin(X * 0.36 + t * 1.6) * Math.sin(Y * 0.8 - t * 1.2) + 0.16 * Math.sin((X * 0.3 + Y * 0.9) + t * 2.2);
        v -= b[k] * 0.28;
        if (a[k] < 0.012 || a[k] > 0.988 || b[k] < 0.02 || b[k] > 0.98) v += 0.28;
        const c = Math.sin(X * 0.21 + Y * 0.55 + t * 1.1) * Math.sin(X * 0.13 - Y * 0.4 + t * 0.9);
        let q = Math.floor(v * 4 + bayer(X, Y) * 0.8 + 0.5);
        if (c > 0.82) q = 4;
        buf[idx[k]] = P[clamp(q, 0, 4)];
      }
    }
    const surf = (name, Wp, Hp, fn) => {
      const d = D[name];
      if (!d) return;
      for (let k = 0; k < d.idx.length; k++) buf[d.idx[k]] = fn(Math.floor(d.a[k] * Wp), Math.floor((1 - d.b[k]) * Hp), d.x[k], d.y[k]);
    };
    // monitor kerja (12×5 px)
    for (let i = 0; i < DESKS; i++) {
      const on = this.screens[i];
      const kind = AGENTS[i]?.id;
      surf(`scr${i}`, 12, 5, (X, Y, px) => {
        if (!on) return X === 1 && Y === 1 ? C.glare : C.scrOff;
        const side = px % 2;
        if (kind === 'designer') return (X + Y + Math.floor(t)) % 5 === 0 ? C.code3 : X > 6 ? (Y > 2 ? C.code4 : C.code2) : C.code1;
        if (kind === 'video') return Y === 4 ? ((X + Math.floor(t * 4)) % 6 === 0 ? C.white : C.code3) : Y < 3 ? (X > 2 && X < 10 ? C.dim : C.scrBg) : C.scrBg;
        const row = Y + Math.floor(t * 1.5);
        const len = 3 + Math.floor(hash2(row, i * 7 + side) * 8);
        if (X === 0 || X > len) return C.scrBg;
        return [C.code1, C.code2, C.code3, C.code4][Math.floor(hash2(row, X >> 2) * 4)];
      });
    }
    // TV ruang santai (50×19)
    const zt = (this.zt ??= textBitmap('ZATAA', 2)), sub = (this.sub ??= textBitmap('TOP UP GAME'));
    surf('tvLounge', 50, 19, (X, Y) => {
      if (this.tv.game) {
        const lane = Math.abs(Y - 9 - Math.round((X - 25) * 0.3)) < 1;
        const h1 = Math.round(10 + Math.sin(t * 1.3) * 12), h2 = Math.round(38 + Math.sin(t * 1.1 + 2) * 9);
        if (Math.abs(X - h1) <= 1 && Math.abs(Y - 9) <= 1) return C.violet;
        if (Math.abs(X - h2) <= 1 && Math.abs(Y - 11) <= 1) return C.red;
        if (Y === 1 && X < 22) return X < 4 + ((t * 3) % 18) ? C.green : C.dim;
        if (Y === 1 && X > 28) return X > 46 - ((t * 2) % 16) ? C.red : C.dim;
        return lane ? C.lane : (X + Y) % 7 === 0 ? C.field2 : C.field;
      }
      if (zt.on(X - 6, Y - 3)) return C.white;
      if (sub.on(X - 3, Y - 13)) return (Math.floor(t * 2) % 2 || X > 30) ? C.violet : C.white;
      return Y + bayer(X, Y) * 3 < 9 ? C.tvTop : C.tvBot;
    });
    // TV meeting (62×22): tema campaign berjalan
    const head = (this.head ??= textBitmap('CAMPAIGN'));
    const th = this.tv.themeBm ?? (this.tv.themeBm = textBitmap(this.tv.theme));
    const scroll = th.w + 62 > 62 ? Math.floor(t * 14) % (th.w + 62) : 0;
    surf('tvMeet', 62, 22, (X, Y) => {
      if (Y < 8) return head.on(X - 2, Y - 2) ? C.white : C.tvTop;
      if (th.on(X - 62 + scroll, Y - 11)) return C.white;
      if (Y === 19) return X < ((t * 4) % 62) ? C.violet : C.dim;
      return C.tvBot;
    });
    // layar approval di ruang boss (29×11)
    const pend = this.tv.pending;
    const num = (this.numBm && this.numV === pend) ? this.numBm : (this.numV = pend, this.numBm = textBitmap(String(pend), 1));
    const lbl = (this.lblBm ??= textBitmap('ACC'));
    surf('tvBoss', 29, 11, (X, Y) => {
      if (lbl.on(X - 2, Y - 3)) return C.violet;
      if (num.on(X - 16, Y - 3)) return pend > 0 ? C.amber : C.green;
      if (pend > 0 && X >= 25 && X <= 26 && Y >= 1 && Y <= 2 && Math.floor(t * 2) % 2) return C.amber;
      return Y === 9 ? C.dim : C.tvBot;
    });
    // rak server: lampu berkedip
    surf('racks', 13, 21, (X, Y) => {
      if (Y % 3 !== 1 || X % 2 !== 1) return C.scrOff;
      const r = hash2(X * 31 + Y, Math.floor(t * 3 + X));
      return r < 0.55 ? C.green : r < 0.7 ? C.amber : C.scrOff;
    });
  }
}
