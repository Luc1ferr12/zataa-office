// Kantor virtual Zataa v2 (terasering 4 tingkat). Gedung dirender sekali (Blender → tile latar, + mesin pixel di
// Web Worker untuk kedalaman/layar/cahaya); tiap frame cuma bagian yang kelihatan di layar yang digambar:
// tile latar sesuai zoom, lapisan layar/air, lalu sprite pegawai yang sudah ditutup perabot di depannya.
import { W, H, PXH, VW, proj, depthOf, pack, bayer, hash2, RES } from './px/engine.js';
import { makeSpots, ROOMS, DESKS, FRONT, LY } from './px/scene.js';
import { sprite, flamingoSprite } from './px/sprites.js';
import { textBitmap } from './px/font.js';
import { AGENTS } from './schedule.js';
import { locationFor, route } from './nav.js';
import { DS, DW, DH, Tiles, loadSprites, toySprite } from './px/toy.js';

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const hx = (h) => { const n = parseInt(h.slice(1), 16); return pack((n >> 16) & 255, (n >> 8) & 255, n & 255); };
const mul = (c, r, g, b) => pack((c & 255) * r, ((c >>> 8) & 255) * g, ((c >>> 16) & 255) * b);
const SEAT_N = new Set(['type', 'talk', 'phone', 'game', 'bench', 'eat']);
const PRAY = [['qiyam', 6], ['ruku', 3], ['itidal', 2], ['sujud', 3], ['duduk', 2], ['sujud', 3], ['itidal', 1]];
const PRAY_LEN = PRAY.reduce((s, p) => s + p[1], 0);
const MOOD_AT_DESK = { capek: ['up', 22, 3], kesel: ['face', 16, 3], marah: ['shake', 10, 1.6] };
const SKY = { day: '#9fc7a4', night: '#0f1a14' };

const WATER_D = ['#0f6f9e', '#1a8fc0', '#2cb0d8', '#62d2ec', '#c9f6ff'].map(hx);
const WATER_N = ['#05294a', '#0a4a72', '#127aa6', '#2fb2d8', '#9cefff'].map(hx);
const C = Object.fromEntries(Object.entries({
  scrBg: '#151331', scrOff: '#0a0912', glare: '#34314a', code1: '#a78bfa', code2: '#5eead4', code3: '#f9a8d4', code4: '#fde68a', dim: '#4b4870',
  tvTop: '#3b1592', tvBot: '#140a2e', white: '#f8f6ff', violet: '#b794ff', amber: '#fbbf24', green: '#34d399', red: '#f87171',
  field: '#1f5d3a', field2: '#2a7a4a', lane: '#c7b98a', chartBg: '#0b1220', grid: '#16233a', gold: '#f5c451', cine: '#05040a',
}).map(([k, v]) => [k, hx(v)]));

// "kotak pandang" awal: seluruh gedung + halaman (koordinat tampilan)
function focusRect() {
  const pts = [[-34, 0, 26], [34, 0, 26], [-34, 14, -38], [34, 14, -38], [-34, 0, -10], [34, 14, -30]];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { const [x, y] = proj(...p); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { x: x0 * DS, y: y0 * DS, w: (x1 - x0) * DS, h: (y1 - y0) * DS };
}
const FOCUS = focusRect();

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
// buffer piksel → canvas (latar cadangan kalau render 3D belum ada)
function toCanvas(u32, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const im = g.createImageData(w, h);
  new Uint32Array(im.data.buffer).set(u32);
  g.putImageData(im, 0, 0);
  return c;
}

export class Office {
  constructor(container, labelHost, outfit = 'kerja') {
    this.outfit = outfit;
    this.chars = new Map();
    this.selected = null;
    this.onSelect = null;
    this.host = labelHost;
    this.spots = makeSpots();
    this.screens = new Array(DESKS).fill(false);
    this.tv = { theme: 'Belum ada plan', pending: 0, game: false, cinema: false };
    this.nightF = 0; this.golden = 0; this.dim = 0;
    this.t = 0;

    this.cv = document.createElement('canvas');
    this.cv.className = 'px-canvas';
    container.appendChild(this.cv);
    this.ctx = this.cv.getContext('2d');
    // lapisan permukaan dinamis (layar, air) di resolusi mesin
    this.dynCv = document.createElement('canvas'); this.dynCv.width = W; this.dynCv.height = H;
    this.dynCtx = this.dynCv.getContext('2d');
    this.dynImg = this.dynCtx.createImageData(W, H);
    this.dynU32 = new Uint32Array(this.dynImg.data.buffer);
    this.actorCv = new Map();

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

    // tampilan: zoom & geser (z = px layar per px tampilan)
    this.z = 0.2; this.tx = 0; this.ty = 0;
    this.bindInput(labelHost);
    new ResizeObserver(() => { this.resize(); this.fit(true); }).observe(labelHost);
    this.resize();

    this.toy = loadSprites(AGENTS.map((a) => a.id)).then(() => true).catch((e) => { console.warn('sprite 3D belum ada, pakai pixel art', e); return false; });
    this.ready = (async () => {
      this.logo = await loadLogo();
      const [base, tiles] = await Promise.all([this.renderBase(), Tiles.load().catch((e) => { console.warn('latar 3D belum ada', e); return null; })]);
      this.base = base;
      this.tiles = tiles;
      if (tiles) tiles.onLoad = () => { this.dirty = true; };
      else { this.fbDay = toCanvas(base.day, W, H); this.fbNight = toCanvas(base.night, W, H); }
      this.toyOn = await this.toy;
      this.buildPeople();
      this.fit();
    })();
    this.last = performance.now();
    this.lastDraw = 0;
    const loop = (now) => { this.frame(now); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  // ---------- data mesin pixel (kedalaman, layar, cahaya) di worker; fallback ke thread utama
  renderBase() {
    return new Promise((resolve) => {
      try {
        const worker = new Worker(new URL('./px/worker.js', import.meta.url), { type: 'module' });
        worker.onmessage = (e) => { worker.terminate(); resolve(e.data); };
        worker.postMessage({ logo: this.logo });
      } catch {
        Promise.all([import('./px/engine.js'), import('./px/scene.js')]).then(([E, S]) => {
          const { prims, lights } = S.buildScene(this.logo);
          const R = E.renderScene(prims, lights);
          const dyn = {};
          for (const [k, d] of R.dyn) dyn[k] = d;
          resolve({ ...R, dyn });
        });
      }
    });
  }

  buildPeople() {
    AGENTS.forEach((a, idx) => {
      const loc = locationFor(this.spots, a, idx, 'out');
      const c = {
        agent: a, idx, loc, locKey: 'out', present: false, pos: loc.pos.clone(), path: [], pending: null,
        pose: 'stand', arrivePose: 'stand', yaw: 0, finalYaw: 0, speed: 1.4, speedMul: 1, walkDist: 0,
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

    const base = info.loc === 'visit' ? `visit:${info.target}` : info.loc === 'lounge' && info.label.includes('Mabar') ? 'game' : info.loc;
    const key = info.slot != null ? `${base}#${info.slot}` : base;

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
  }

  setCampaign(theme, pending) {
    this.tv.theme = theme || 'Belum ada plan';
    this.tv.pending = pending ?? 0;
    this.tv.themeBm = textBitmap(this.tv.theme);
  }

  // Senin = baju formal, hari lain = baju kerja (sprite pixel cadangan)
  setOutfitForDay(dow) { this.outfit = dow === 1 ? 'formal' : 'kerja'; }

  focus(id) {
    const c = this.chars.get(id);
    if (!c?.present) return;
    const [sx, sy] = proj(c.pos.x, c.pos.y, c.pos.z);
    const r = this.host.getBoundingClientRect();
    this.z = Math.max(this.z, Math.min(0.75, this.maxZ));
    this.tx = r.width / 2 - sx * DS * this.z;
    this.ty = r.height / 2 - (sy * DS - 110) * this.z;
    this.clampView();
  }

  select(id) {
    this.selected = id;
    this.chars.forEach((c, k) => c.label.classList.toggle('is-selected', k === id));
    this.onSelect?.(id);
  }

  // ---------- kanvas seukuran layar (tajam di layar HiDPI)
  resize() {
    const r = this.host.getBoundingClientRect();
    if (!r.width) return;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cw = r.width; this.ch = r.height;
    this.cv.width = Math.round(r.width * this.dpr); this.cv.height = Math.round(r.height * this.dpr);
    this.cv.style.width = `${r.width}px`; this.cv.style.height = `${r.height}px`;
    this.dirty = true;
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
    // zoom-out maksimal: seluruh kantor (+ sedikit bukit) muat di layar
    this.minZ = Math.min(r.width / FOCUS.w, r.height / FOCUS.h) * 0.92;
    this.maxZ = 1.6;
    if (keep && this.fitted) { this.z = clamp(this.z, this.minZ, this.maxZ); this.clampView(); return; }
    this.z = Math.min(r.width / FOCUS.w, r.height / FOCUS.h);
    if (r.width < 700) this.z = Math.max(this.z, 0.16); // HP: jangan terlalu kecil, geser untuk lihat sisanya
    this.tx = r.width / 2 - (FOCUS.x + FOCUS.w / 2) * this.z;
    this.ty = r.height / 2 - (FOCUS.y + FOCUS.h / 2) * this.z;
    this.fitted = true;
    this.clampView();
  }
  zoomAt(px, py, f) {
    const z = clamp(this.z * f, this.minZ ?? 0.05, this.maxZ ?? 1.6);
    this.tx = px - ((px - this.tx) * z) / this.z;
    this.ty = py - ((py - this.ty) * z) / this.z;
    this.z = z;
    this.clampView();
  }
  clampView() {
    const r = this.host.getBoundingClientRect();
    const cw = DW * this.z, ch = DH * this.z;
    this.tx = cw <= r.width ? (r.width - cw) / 2 : clamp(this.tx, r.width - cw, 0);
    this.ty = ch <= r.height ? (r.height - ch) / 2 : clamp(this.ty, r.height - ch, 0);
    this.dirty = true;
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
    const X = (e.clientX - r.left - this.tx) / this.z, Y = (e.clientY - r.top - this.ty) / this.z;
    const tol = Math.max(3, 6 / this.z);
    let best = null;
    for (const a of this.actors ?? []) {
      if (!a.c || !a.box) continue;
      const b = a.box;
      if (X < b.x - tol || Y < b.y - tol || X > b.x + b.w + tol || Y > b.y + b.h + tol) continue;
      let hit = false;
      for (let dy = -tol; dy <= tol && !hit; dy += Math.max(1, tol / 3)) for (let dx = -tol; dx <= tol && !hit; dx += Math.max(1, tol / 3)) {
        const x = Math.floor(X + dx - b.x), y = Math.floor(Y + dy - b.y);
        if (x >= 0 && y >= 0 && x < b.w && y < b.h && b.u32[y * b.w + x] >>> 24 > 40) hit = true;
      }
      if (hit && (!best || a.d0 > best.d0)) best = a;
    }
    this.select(best?.c.agent.id ?? null);
  }

  // ---------- label HTML (nama pegawai & ruangan)
  placeLabels() {
    const put = (el, x, y) => { el.style.transform = `translate(${Math.round(this.tx + x * DS * this.z)}px, ${Math.round(this.ty + y * DS * this.z)}px) translate(-50%, -100%)`; };
    const showRooms = this.base && this.z > (this.minZ ?? 0.1) * 1.35;
    for (const { r, el } of this.roomEls) {
      el.hidden = !showRooms;
      if (showRooms) { const [x, y] = proj(...r.p); put(el, x, y); }
    }
    // bubble nama: geser ke atas kalau bertumpuk dengan bubble lain
    const placed = [];
    const list = [...this.chars.values()].map((c) => {
      c.label.hidden = !c.present;
      if (!c.present) return null;
      const [x, y] = proj(c.pos.x, c.pos.y, c.pos.z);
      const top = this.toyOn
        ? (c.pose === 'lie' ? 18 : c.pose === 'swim' ? 10 : c.pose === 'pray' ? 30 : SEAT_N.has(c.pose) || c.pose === 'beanbag' ? 27 : 34)
        : (c.pose === "lie" ? 14 : c.pose === "swim" ? 12 : c.pose === "pray" ? 23 : SEAT_N.has(c.pose) || c.pose === "beanbag" ? 21 : 24);
      if (!c.labelW) c.labelW = c.label.offsetWidth;
      return { c, x: this.tx + x * DS * this.z, y: this.ty + (y - top) * DS * this.z };
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
    const d = c.agent.desk;
    if (d != null) this.screens[d] = c.locKey.startsWith('desk') && !c.path.length;
  }

  // ---------- satu frame
  frame(now) {
    const dt = Math.min(1, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    this.chars.forEach((c) => c.present && this.move(c, dt));
    if (!this.base || now - this.lastDraw < 40) return;
    this.lastDraw = now;
    const here = (k) => [...this.chars.values()].filter((c) => c.present && c.locKey.startsWith(k) && !c.path.length).length;
    this.tv.game = here('game') > 0;
    this.tv.cinema = here('cinema') > 0;

    const g = this.ctx, B = this.base, nf = this.nightF, z = this.z, dpr = this.dpr;
    // area tampilan yang kelihatan
    const vx0 = -this.tx / z, vy0 = -this.ty / z, vx1 = vx0 + this.cw / z, vy1 = vy0 + this.ch / z;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = nf > 0.5 ? SKY.night : SKY.day;
    g.fillRect(0, 0, this.cv.width, this.cv.height);
    g.setTransform(dpr * z, 0, 0, dpr * z, dpr * this.tx, dpr * this.ty);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    // latar gedung: siang, lalu malam di atasnya (transisi senja)
    if (this.tiles) {
      if (nf < 0.999) this.tiles.draw(g, 'day', z * dpr, vx0, vy0, vx1, vy1, 1);
      if (nf > 0.001) this.tiles.draw(g, 'night', z * dpr, vx0, vy0, vx1, vy1, nf < 0.999 ? nf : 1);
    } else {
      g.imageSmoothingEnabled = false;
      if (nf < 0.999) g.drawImage(this.fbDay, 0, 0, DW, DH);
      if (nf > 0.001) { g.globalAlpha = nf < 0.999 ? nf : 1; g.drawImage(this.fbNight, 0, 0, DW, DH); g.globalAlpha = 1; }
    }
    // layar & air
    this.drawDyn(this.t, nf > 0.5);
    g.imageSmoothingEnabled = false;
    g.drawImage(this.dynCv, 0, 0, DW, DH);
    // pegawai (yang sudah ditutup perabot di depannya)
    g.imageSmoothingEnabled = true;
    this.actors = this.collectActors(this.t);
    for (const a of this.actors) {
      const b = this.composite(a, nf);
      if (!b) continue;
      if (b.x > vx1 || b.y > vy1 || b.x + b.w < vx0 || b.y + b.h < vy0) continue;
      g.drawImage(b.cv, b.x, b.y);
    }
    // senja keemasan & malam larut
    const gold = this.golden * 0.45, dim = this.dim * nf;
    if (gold > 0.01 || dim > 0.01) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = `rgb(${255 * (1 - dim)}, ${(255 - 70 * gold) * (1 - dim)}, ${(255 - 120 * gold) * (1 - dim * 0.6)})`;
      g.fillRect(0, 0, this.cv.width, this.cv.height);
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
      if (!c.present) return;
      const s = Math.sin(c.yaw), co = Math.cos(c.yaw);
      const dir = Math.abs(s) > Math.abs(co) + 0.05 ? (s > 0 ? 'E' : 'W') : co > 0 ? 'S' : 'N';
      let pose = c.pose, f = 0, v = '', jitter = 0;
      if (pose === 'walk') f = Math.floor(c.walkDist / 0.2) % 4;
      else if (pose === 'swim') f = Math.floor(t * 3 + c.seed) % 4;
      else if (pose === 'type') {
        f = Math.floor(t * 5 + c.seed) % 4;
        if (c.mood === 'ngantuk') v = 'sleepy';
        const m = MOOD_AT_DESK[c.mood];
        if (m && (t + c.seed * 7) % m[1] < m[2]) { if (m[0] === 'shake') jitter = Math.floor(t * 12) % 2 ? 4 : -4; else v = m[0]; }
      } else if (pose === 'talk') f = c.locKey.startsWith('cinema') ? 0 : Math.floor(t * 1.3 + c.seed) % 4;
      else if (pose === 'sweep') f = Math.floor(t * 2.2 + c.seed) % 4;
      else if (pose === 'eat' || pose === 'drink') f = Math.floor(t * 0.6 + c.seed) % 4;
      else if (pose === 'pray') v = c.info?.phase ?? phase;
      if (pose === 'drink' && f >= 2) pose = 'stand';
      let spr = this.toyOn ? toySprite(c.agent.id, pose, dir, f, v) : null;
      if (!spr) spr = up4(sprite(c.agent.id, this.outfit, pose, dir, f, v));
      const [x0_, y0_] = proj(c.pos.x, c.pos.y, c.pos.z), x = x0_ * DS, y = y0_ * DS;
      let bias = 0.25;
      if (SEAT_N.has(pose) && dir === 'N') bias = 0.7;
      else if (SEAT_N.has(pose)) bias = 0.35;
      if (pose === 'swim') bias = 0.45;
      const d0 = pose === 'lie' ? depthOf(c.pos.x, c.pos.y + 0.45, c.pos.z) + (spr.toy ? 0.75 : 0.3) : depthOf(c.pos.x, c.pos.y, c.pos.z) + bias;
      out.push({ c, spr, sx: Math.round(x) + jitter, sy: Math.round(y), d0, foot: depthOf(c.pos.x, c.pos.y, c.pos.z), shadow: pose === 'walk' || pose === 'stand' || pose === 'drink' || pose === 'sweep', ring: this.selected === c.agent.id });
    });
    if (!this.tiles) {   // flamingo pixel cuma di tampilan cadangan (versi 3D: pelampung ada di render kolam)
      const fx = 15 + Math.sin(t * 0.07) * 4, fz = 12 + Math.sin(t * 0.05 + 1) * 2.4;
      const [x, y] = proj(fx, -0.1, fz);
      out.push({ c: null, spr: up4(flamingoSprite()), sx: Math.round(x * DS), sy: Math.round((y + Math.sin(t * 1.3) * 0.6) * DS), d0: depthOf(fx, -0.1, fz) + 0.3 });
    }
    return out.sort((a, b) => a.d0 - b.d0);
  }

  // sprite + bayangan kaki + cincin pilihan → kanvas kecil, piksel yang ketutup perabot dibuang (uji kedalaman)
  composite(a, nf) {
    const B = this.base, s = a.spr, depth = B.depth;
    const RX = 28, RY = 10;
    const sx0 = a.sx - s.ax, sy0 = a.sy - s.ay - (s.lift ?? 0);
    const x0 = Math.min(sx0, a.sx - RX), y0 = Math.min(sy0, a.sy - RY);
    const x1 = Math.max(sx0 + s.w, a.sx + RX + 1), y1 = Math.max(sy0 + s.h, a.sy + RY + 1);
    const w = x1 - x0, h = y1 - y0;
    const nq = Math.round(nf * 8);
    const key = `${s.key ?? ''}|${a.sx}|${a.sy}|${nq}|${a.ring ? 1 : 0}|${a.shadow ? 1 : 0}|${a.d0.toFixed(2)}`;
    const id = a.c?.agent.id ?? 'flamingo';
    let box = this.actorCv.get(id);
    if (box && box.key === key) { a.box = box; return box; }
    if (!box || box.cv.width < w || box.cv.height < h) {
      const cv = document.createElement('canvas'); cv.width = Math.max(w, box?.cv.width ?? 0); cv.height = Math.max(h, box?.cv.height ?? 0);
      box = { cv, ctx: cv.getContext('2d') };
      this.actorCv.set(id, box);
    }
    const img = new ImageData(w, h), u32 = new Uint32Array(img.data.buffer);
    const dAt = (X, Y) => depth[clamp((Y / DS) | 0, 0, H - 1) * W + clamp((X / DS) | 0, 0, W - 1)];
    // cahaya malam di titik kaki (lampu ruangan)
    let lr = 1, lg = 1, lb = 1;
    if (nf > 0.01) {
      const fi = clamp((a.sy / DS) | 0, 0, H - 1) * W + clamp((a.sx / DS) | 0, 0, W - 1);
      const k = nf;
      lr = 1 - k + k * Math.max(0.3, B.lightQ[fi * 3] / 100); lg = 1 - k + k * Math.max(0.3, B.lightQ[fi * 3 + 1] / 100); lb = 1 - k + k * Math.max(0.42, B.lightQ[fi * 3 + 2] / 100);
    }
    if (a.shadow || a.ring) {
      for (let dy = -RY; dy <= RY; dy++) for (let dx = -RX; dx <= RX; dx++) {
        const e = (dx * dx) / (RX * RX) + (dy * dy) / (RY * RY);
        if (e > 1.05) continue;
        const X = a.sx + dx, Y = a.sy + dy;
        if (Math.abs(dAt(X, Y) - a.foot) > 0.3) continue;
        const q = (Y - y0) * w + (X - x0);
        if (a.ring && e > 0.55) u32[q] = nf > 0.5 ? 0xffffa5c4 : 0xfff65c8b;
        else if (a.shadow && e <= 0.75) u32[q] = 0x52301424;
      }
    }
    for (let j = 0; j < s.h; j++) {
      const Y = sy0 + j;
      const dd = s.flat ? a.d0 : a.d0 + ((s.ay - j) / (PXH * DS)) * VW[1];
      const row = clamp((Y / DS) | 0, 0, H - 1) * W;
      for (let i = 0; i < s.w; i++) {
        const col = s.d[j * s.w + i];
        if (!(col >>> 24)) continue;
        const X = sx0 + i;
        if (dd < depth[row + clamp((X / DS) | 0, 0, W - 1)]) continue;
        const q = (Y - y0) * w + (X - x0);
        u32[q] = nf > 0.01 ? (mul(col, lr, lg, lb) & 0xffffff) | (col & 0xff000000) : col;
      }
    }
    box.ctx.clearRect(0, 0, box.cv.width, box.cv.height);
    box.ctx.putImageData(img, 0, 0);
    Object.assign(box, { key, x: x0, y: y0, w, h, u32 });
    a.box = box;
    return box;
  }

  // ---------- permukaan dinamis: air kolam, monitor, TV, video wall, bioskop
  drawDyn(t, night) {
    const D = this.base.dyn, u32 = this.dynU32, toy = !!this.tiles;
    const dirty = [];
    const water = D.water;
    if (water) {
      const { idx, x, y } = water;
      if (toy) {   // render 3D: air asli dari Blender, di atasnya kilau bergerak (putih tembus)
        if (!water.ph) {
          water.ph = new Float32Array(idx.length * 2);
          for (let k = 0; k < idx.length; k++) { water.ph[k * 2] = x[k] * 0.42 + y[k] * 0.66; water.ph[k * 2 + 1] = x[k] * 0.26 - y[k] * 0.54; }
        }
        const ph = water.ph, ca = Math.cos(t * 1.7), sa = Math.sin(t * 1.7), cb = Math.cos(t * 1.1), sb = Math.sin(t * 1.1);
        for (let k = 0; k < idx.length; k++) {
          const v = Math.sin(ph[k * 2]) * ca + Math.cos(ph[k * 2]) * sa, w = Math.sin(ph[k * 2 + 1]) * cb + Math.cos(ph[k * 2 + 1]) * sb;
          const g = v * w;
          u32[idx[k]] = g > 0.8 ? 0x55ffffff : g > 0.4 ? 0x22ffffff : g < -0.6 ? 0x14301010 : 0;
        }
      } else {
        const P = night ? WATER_N : WATER_D;
        const { a, b } = water;
        if (!water.pre) {
          const n = idx.length, F = () => new Float32Array(n);
          const pre = { s: [F(), F(), F(), F(), F()], c: [F(), F(), F(), F(), F()], base: F(), dith: F() };
          for (let k = 0; k < n; k++) {
            const X = x[k], Y = y[k];
            const ph = [X * 0.36, Y * 0.8, X * 0.3 + Y * 0.9, X * 0.21 + Y * 0.55, X * 0.13 - Y * 0.4];
            for (let j = 0; j < 5; j++) { pre.s[j][k] = Math.sin(ph[j]); pre.c[j][k] = Math.cos(ph[j]); }
            pre.base[k] = 0.5 - b[k] * 0.28 + (a[k] < 0.012 || a[k] > 0.988 || b[k] < 0.02 || b[k] > 0.98 ? 0.28 : 0);
            pre.dith[k] = bayer(x[k], y[k]) * 0.8 + 0.5;
          }
          water.pre = pre;
        }
        const { s: S, c: Cc, base: B0, dith } = water.pre;
        const w = [1.6, -1.2, 2.2, 1.1, 0.9].map((o) => [Math.cos(o * t), Math.sin(o * t)]);
        for (let k = 0; k < idx.length; k++) {
          const A = S[0][k] * w[0][0] + Cc[0][k] * w[0][1];
          const Bv = S[1][k] * w[1][0] + Cc[1][k] * w[1][1];
          const Cv = S[2][k] * w[2][0] + Cc[2][k] * w[2][1];
          const v = B0[k] + 0.2 * A * Bv + 0.16 * Cv;
          const sp = (S[3][k] * w[3][0] + Cc[3][k] * w[3][1]) * (S[4][k] * w[4][0] + Cc[4][k] * w[4][1]);
          let q = Math.floor(v * 4 + dith[k]);
          if (sp > 0.82) q = 4;
          u32[idx[k]] = P[q < 0 ? 0 : q > 4 ? 4 : q];
        }
      }
      dirty.push(water);
    }
    const surf = (name, Wp, Hp, fn) => {
      const d = D[name];
      if (!d) return;
      for (let k = 0; k < d.idx.length; k++) u32[d.idx[k]] = fn(Math.floor(d.a[k] * Wp), Math.floor((1 - d.b[k]) * Hp), d.x[k], d.y[k]) | 0xff000000;
      dirty.push(d);
    };
    // monitor kerja (12×5 px)
    for (let i = 0; i < DESKS; i++) {
      const on = this.screens[i];
      const kind = AGENTS.find((a) => a.desk === i)?.id;
      const trd = i >= 8;
      surf(`scr${i}`, 12, 5, (X, Y, px) => {
        if (!on) return X === 1 && Y === 1 ? C.glare : C.scrOff;
        if (trd) return candle(X, Y, t, i, px);
        const side = px % 2;
        if (kind === 'designer') return (X + Y + Math.floor(t)) % 5 === 0 ? C.code3 : X > 6 ? (Y > 2 ? C.code4 : C.code2) : C.code1;
        if (kind === 'video') return Y === 4 ? ((X + Math.floor(t * 4)) % 6 === 0 ? C.white : C.code3) : Y < 3 ? (X > 2 && X < 10 ? C.dim : C.scrBg) : C.scrBg;
        const row = Y + Math.floor(t * 1.5);
        const len = 3 + Math.floor(hash2(row, i * 7 + side) * 8);
        if (X === 0 || X > len) return C.scrBg;
        return [C.code1, C.code2, C.code3, C.code4][Math.floor(hash2(row, X >> 2) * 4)];
      });
    }
    // monitor director (Aprista & Mahendra)
    const dirOn = (id) => { const c = this.chars.get(id); return c && !c.path.length && /Desk/.test(c.locKey); };
    surf('tvDir', 12, 5, (X, Y) => (dirOn('dir') ? ((X + Y + Math.floor(t)) % 4 === 0 ? C.code1 : Y === 0 ? C.violet : C.scrBg) : C.scrOff));
    surf('tvTdir', 12, 5, (X, Y, px) => (dirOn('tdir') ? candle(X, Y, t, 20, px) : C.scrOff));
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
    // TV meeting marketing (62×22): tema campaign berjalan
    const head = (this.head ??= textBitmap('CAMPAIGN'));
    const th = this.tv.themeBm ?? (this.tv.themeBm = textBitmap(this.tv.theme));
    const scroll = Math.floor(t * 14) % (th.w + 62);
    surf('tvMeet', 62, 22, (X, Y) => {
      if (Y < 8) return head.on(X - 2, Y - 2) ? C.white : C.tvTop;
      if (th.on(X - 62 + scroll, Y - 11)) return C.white;
      if (Y === 19) return X < ((t * 4) % 62) ? C.violet : C.dim;
      return C.tvBot;
    });
    // TV meeting trading (60×22): "XAU PLAN" + grafik
    const xh = (this.xh ??= textBitmap('XAU PLAN'));
    surf('tvMeetT', 60, 22, (X, Y, px) => {
      if (Y < 8) return xh.on(X - 2, Y - 2) ? C.gold : C.chartBg;
      return chartPx(X, Y - 8, 60, 14, t * 0.2, 3);
    });
    // video wall harga emas di bilik trading (180×24): grafik candle berjalan + harga
    const vw = (this.vw ??= textBitmap('XAUUSD'));
    surf('ticker', 180, 24, (X, Y) => {
      if (Y < 7) return vw.on(X - 3, Y - 1) ? C.gold : X > 40 && X < 44 + ((t * 3) % 40) && Y === 3 ? C.green : C.chartBg;
      return chartPx(X, Y - 7, 180, 17, t * 0.5, 1);
    });
    // bioskop (118×28): film saat ada yang nonton, logo saat kosong
    const cz = (this.cz ??= textBitmap('ZATAA CINEMA'));
    surf('cinema', 118, 28, (X, Y) => {
      if (!this.tv.cinema) return cz.on(X - 30, Y - 10) ? C.violet : C.cine;
      const sc = Math.floor(t / 6) % 4, sh = Math.sin(t * 0.7 + X * 0.05);
      const sky = [[0x3a, 0x6f, 0xb0], [0xe0, 0x7a, 0x3c], [0x1b, 0x2a, 0x4a], [0x6a, 0x3c, 0x8f]][sc];
      if (Y > 18 + sh * 2) return pack(30 + sc * 10, 40, 30);
      const hill = Y > 12 + Math.sin(X * 0.11 + sc) * 3;
      const sun = Math.hypot(X - 80 - sc * 6, Y - 7) < 4;
      return sun ? C.amber : hill ? pack(sky[0] * 0.5, sky[1] * 0.6, sky[2] * 0.5) : pack(sky[0], sky[1], sky[2]);
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
    // rak server bot trading: lampu berkedip
    surf('racks', 13, 21, (X, Y) => {
      if (Y % 3 !== 1 || X % 2 !== 1) return C.scrOff;
      const r = hash2(X * 31 + Y, Math.floor(t * 3 + X));
      return r < 0.55 ? C.green : r < 0.7 ? C.amber : C.scrOff;
    });
    // kirim bagian yang berubah ke kanvas lapisan
    const bb = (this._dynBB ??= new Map());
    for (const d of dirty) {
      let r = bb.get(d);
      if (!r) {
        let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
        for (let k = 0; k < d.x.length; k++) { x0 = Math.min(x0, d.x[k]); x1 = Math.max(x1, d.x[k]); y0 = Math.min(y0, d.y[k]); y1 = Math.max(y1, d.y[k]); }
        r = [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
        bb.set(d, r);
      }
      if (r[2] > 0) this.dynCtx.putImageData(this.dynImg, 0, 0, r[0], r[1], r[2], r[3]);
    }
  }
}

// grafik candle mini XAUUSD (deterministik, bergerak pelan)
function series(i, k) { return Math.sin(k * 0.21 + i) * 0.5 + Math.sin(k * 0.057 + i * 2) * 0.8 + Math.sin(k * 0.9 + i * 3) * 0.15; }
function chartPx(X, Y, Wp, Hp, t, step) {
  const k = Math.floor(X / step + t * 4);
  if (Y === Hp - 1 || X % 20 === 0 && Y % 2 === 0) return C.grid;
  const o = series(0, k - 1), c = series(0, k);
  const hi = Math.max(o, c) + 0.08, lo = Math.min(o, c) - 0.08;
  const toY = (v) => Math.round((1 - (v + 1.6) / 3.2) * (Hp - 2));
  const up = c >= o;
  if (step > 1 && X % step === step - 1) return C.chartBg;
  if (Y >= toY(Math.max(o, c)) && Y <= toY(Math.min(o, c))) return up ? C.green : C.red;
  if (step > 1 && X % step === 1 && Y >= toY(hi) && Y <= toY(lo)) return up ? C.green : C.red;
  return C.chartBg;
}
function candle(X, Y, t, i, px) {
  if (Y === 0) return X < 4 ? C.gold : C.chartBg;
  return chartPx(X, Y - 1, 12, 4, t * 0.3 + i, 2);
}

// sprite pixel cadangan diperbesar ke resolusi tampilan
const up4cache = new WeakMap();
function up4(s) {
  if (!s || s.toy) return s;
  let o = up4cache.get(s);
  if (o) return o;
  const w = s.w * DS, h = s.h * DS, d = new Uint32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = s.d[((y / DS) | 0) * s.w + ((x / DS) | 0)]; d[y * w + x] = c ? (c | 0xff000000) >>> 0 : 0; }
  o = { ...s, w, h, ax: s.ax * DS, ay: s.ay * DS, lift: (s.lift ?? 0) * DS, d, key: `px${Math.random()}` };
  up4cache.set(s, o);
  return o;
}
