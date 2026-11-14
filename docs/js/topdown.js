// Kantor virtual Zataa — tampilan pixel art top-down (2D). Pengganti mode 3D yang berat (latar Blender ±43 MB):
// peta digambar prosedural sekali di browser (td/map.js), pegawai = sprite chibi kecil (td/chars.js).
// Jalur jalan (nav.js), jadwal (schedule.js) & tempat duduk (px/scene.js) sama persis dengan versi lama.
// API kelas Office sama dengan pixoffice.js, jadi main.js cukup ganti import.
import { AGENTS } from './schedule.js';
import { makeSpots, DESKS } from './px/scene.js';
import { locationFor, route } from './nav.js';
import { buildMap, MW, MH, X, Y, TD_THEMES, TD_THEME_LIST } from './td/map.js';
import { tdSprite } from './td/chars.js';
import { hash2 } from './px/engine.js';
import { textBitmap } from './px/font.js';

export { TD_THEME_LIST };
export const loadThemes = async () => TD_THEME_LIST;

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const SEAT = new Set(['type', 'talk', 'phone', 'game', 'bench', 'eat', 'beanbag']);
const PRAY = [['qiyam', 6], ['ruku', 3], ['itidal', 2], ['sujud', 3], ['duduk', 2], ['sujud', 3], ['itidal', 1]];
const PRAY_LEN = PRAY.reduce((s, p) => s + p[1], 0);
const MOOD_AT_DESK = { capek: ['up', 22, 3], kesel: ['face', 16, 3], marah: ['shake', 10, 1.6] };
const CODE = ['#a78bfa', '#5eead4', '#f9a8d4', '#fde68a', '#8cc8ff'];

export class Office {
  constructor(container, labelHost, outfit = 'kerja', theme = 'hangat') {
    this.outfit = outfit;
    this.theme = TD_THEMES[theme] ? theme : 'hangat';
    this.mode = 'pixel';
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

    this.labels = document.createElement('div');
    this.labels.className = 'px-labels';
    labelHost.appendChild(this.labels);
    this.buildZoomUI(labelHost);

    this.z = 1; this.tx = 0; this.ty = 0;
    this.bindInput(labelHost);
    new ResizeObserver(() => { this.resize(); this.fit(true); }).observe(labelHost);
    this.resize();

    this.ready = (async () => {
      await new Promise((r) => setTimeout(r, 0));
      this.map = buildMap(this.theme);
      this.buildNight();
      this.buildPeople();
      this.fit();
    })();
    this.last = performance.now();
    this.lastDraw = 0;
    const loop = (now) => { this.frame(now); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  // ---------- tema = palet peta
  async setTheme(theme) {
    await this.ready;
    if (!TD_THEMES[theme]) return false;
    if (theme === this.theme) return true;
    this.theme = theme;
    this.map = buildMap(theme);
    this.buildNight();
    return true;
  }
  async setMode() { await this.ready; return true; }

  // lapisan malam: gelap + lampu ruangan (dibuat sekali per tema)
  buildNight() {
    const c = document.createElement('canvas'); c.width = MW; c.height = MH;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(14,20,48,0.62)'; g.fillRect(0, 0, MW, MH);
    g.globalCompositeOperation = 'destination-out';
    for (const L of this.map.lights) {
      const gr = g.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r);
      gr.addColorStop(0, 'rgba(0,0,0,0.85)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(L.x - L.r, L.y - L.r, L.r * 2, L.r * 2);
    }
    g.globalCompositeOperation = 'source-over';
    this.nightCv = c;
    const w = document.createElement('canvas'); w.width = MW; w.height = MH;
    const wg = w.getContext('2d');
    wg.globalCompositeOperation = 'lighter';
    for (const L of this.map.lights) {
      const gr = wg.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r * 0.8);
      gr.addColorStop(0, L.c.replace(/[\d.]+\)$/, '0.22)')); gr.addColorStop(1, 'rgba(0,0,0,0)');
      wg.fillStyle = gr; wg.fillRect(L.x - L.r, L.y - L.r, L.r * 2, L.r * 2);
    }
    this.glowCv = w;
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

  setTime(minutes) {
    const h = minutes / 60;
    const day = smooth(5.6, 7, h) * (1 - smooth(17.4, 18.8, h));
    this.nightF = 1 - day;
    this.golden = Math.max(1 - smooth(6, 8.5, h), smooth(15.5, 17.8, h)) * day;
    this.dim = h >= 23 || h < 5 ? 0.25 : 0;
  }
  setCampaign(theme, pending) {
    this.tv.theme = theme || 'Belum ada plan';
    this.tv.pending = pending ?? 0;
    this.tv.themeBm = textBitmap(this.tv.theme);
  }
  setOutfitForDay(dow) { this.outfit = dow === 1 ? 'formal' : 'kerja'; }

  focus(id) {
    const c = this.chars.get(id);
    if (!c?.present) return;
    const r = this.host.getBoundingClientRect();
    this.z = Math.max(this.z, Math.min(2.5, this.maxZ ?? 2.5));
    this.tx = r.width / 2 - X(c.pos.x) * this.z;
    this.ty = r.height / 2 - (Y(c.pos.z) - 10) * this.z;
    this.clampView();
  }
  select(id) {
    this.selected = id;
    this.chars.forEach((c, k) => c.label.classList.toggle('is-selected', k === id));
    this.onSelect?.(id);
  }

  // ---------- kanvas & tampilan
  resize() {
    const r = this.host.getBoundingClientRect();
    if (!r.width) return;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cw = r.width; this.ch = r.height;
    this.cv.width = Math.round(r.width * this.dpr); this.cv.height = Math.round(r.height * this.dpr);
    this.cv.style.width = `${r.width}px`; this.cv.style.height = `${r.height}px`;
  }
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
    const all = Math.min(r.width / MW, r.height / MH);
    this.minZ = all * 0.9;
    this.maxZ = 5;
    if (keep && this.fitted) { this.z = clamp(this.z, this.minZ, this.maxZ); this.clampView(); return; }
    // awal: lebar kantor pas layar (halaman bawah bisa digeser)
    this.z = r.width < 700 ? Math.max(all, 0.62) : Math.min(r.width / MW, Math.max(all, r.height / (MH * 0.62)));
    this.tx = r.width / 2 - (MW / 2) * this.z;
    this.ty = r.width < 700 ? -Y(-17) * this.z : 0;
    this.fitted = true;
    this.clampView();
  }
  zoomAt(px, py, f) {
    const z = clamp(this.z * f, this.minZ ?? 0.2, this.maxZ ?? 5);
    this.tx = px - ((px - this.tx) * z) / this.z;
    this.ty = py - ((py - this.ty) * z) / this.z;
    this.z = z;
    this.clampView();
  }
  clampView() {
    const r = this.host.getBoundingClientRect();
    const cw = MW * this.z, ch = MH * this.z;
    this.tx = cw <= r.width ? (r.width - cw) / 2 : clamp(this.tx, r.width - cw, 0);
    this.ty = ch <= r.height ? (r.height - ch) / 2 : clamp(this.ty, r.height - ch, 0);
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
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: this.z }; drag = null; }
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
    const mx = (e.clientX - r.left - this.tx) / this.z, my = (e.clientY - r.top - this.ty) / this.z;
    const tol = Math.max(2, 6 / this.z);
    let best = null;
    for (const a of this.actors ?? []) {
      const b = a.box;
      if (mx < b.x - tol || my < b.y - tol || mx > b.x + b.w + tol || my > b.y + b.h + tol) continue;
      if (!best || a.z > best.z) best = a;
    }
    this.select(best?.c.agent.id ?? null);
  }

  // ---------- label nama (HTML di atas kanvas)
  placeLabels() {
    const placed = [];
    const list = [...this.chars.values()].map((c) => {
      c.label.hidden = !c.present;
      if (!c.present) return null;
      const top = c.pose === 'lie' ? 12 : c.pose === 'swim' ? 12 : SEAT.has(c.pose) ? 18 : 22;
      if (!c.labelW) c.labelW = c.label.offsetWidth;
      return { c, x: this.tx + X(c.pos.x) * this.z, y: this.ty + (Y(c.pos.z) - top) * this.z - 2 };
    }).filter(Boolean).sort((a, b) => b.y - a.y);
    for (const L of list) {
      const w = L.c.label.classList.contains('is-selected') ? L.c.label.offsetWidth : L.c.labelW || 80;
      for (let k = 0; k < 6 && placed.some((p) => Math.abs(p.x - L.x) < (p.w + w) / 2 + 2 && Math.abs(p.y - L.y) < 21); k++) L.y -= 21;
      placed.push({ x: L.x, y: L.y, w });
      L.c.label.style.transform = `translate(${Math.round(L.x)}px, ${Math.round(L.y)}px) translate(-50%, -100%)`;
    }
  }

  // ---------- gerak pegawai (sama dengan versi lama)
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
    if (!this.map || now - this.lastDraw < 40) return;
    this.lastDraw = now;
    const here = (k) => [...this.chars.values()].some((c) => c.present && c.locKey.startsWith(k) && !c.path.length);
    this.tv.game = here('game');
    this.tv.cinema = here('cinema');

    const g = this.ctx, z = this.z, dpr = this.dpr, nf = this.nightF, M = this.map;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = nf > 0.5 ? '#0c1222' : M.C.grassD;
    g.fillRect(0, 0, this.cv.width, this.cv.height);
    g.setTransform(dpr * z, 0, 0, dpr * z, dpr * this.tx, dpr * this.ty);
    g.imageSmoothingEnabled = false;
    const vx0 = -this.tx / z, vy0 = -this.ty / z, vx1 = vx0 + this.cw / z, vy1 = vy0 + this.ch / z;
    g.drawImage(M.cv, 0, 0);
    this.drawDyn(g);

    // perabot tinggi + pegawai, diurut dari belakang (z kecil) ke depan
    this.actors = this.collectActors(this.t);
    const items = [...M.props.map((p) => ({ p, z: p.z })), ...this.actors];
    items.sort((a, b) => a.z - b.z);
    for (const it of items) {
      if (it.p) {
        const p = it.p;
        if (p.x > vx1 || p.y > vy1 || p.x + p.cv.width < vx0 || p.y + p.cv.height < vy0) continue;
        g.drawImage(p.cv, p.x, p.y);
        if (p.scr) for (const sc of p.scr) this.drawScreen(g, sc);
      } else this.drawActor(g, it);
    }
    // malam: gelap + lampu; senja keemasan
    if (nf > 0.01) {
      g.globalAlpha = nf; g.drawImage(this.nightCv, 0, 0);
      g.globalCompositeOperation = 'lighter'; g.drawImage(this.glowCv, 0, 0); g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
    }
    const gold = this.golden * 0.35, dim = this.dim * nf;
    if (gold > 0.01 || dim > 0.01) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = `rgb(${255 * (1 - dim)}, ${(255 - 70 * gold) * (1 - dim)}, ${(255 - 120 * gold) * (1 - dim * 0.6)})`;
      g.fillRect(0, 0, this.cv.width, this.cv.height);
      g.globalCompositeOperation = 'source-over';
    }
    this.placeLabels();
  }

  // layar monitor, TV, bioskop, arcade, LED server, kilau air
  drawDyn(g) {
    for (const s of this.map.screens) this.drawScreen(g, s);
    this.drawWater(g);
  }
  drawScreen(g, s) {
    const t = this.t;
    {
      if (s.kind === 'desk') {
        if (!this.screens[s.key]) return;
        g.fillStyle = '#151331'; g.fillRect(s.x, s.y, s.w, s.h);
        for (let row = 0; row < s.h - 1; row += 2) {
          const len = Math.floor(hash2(s.key * 7 + row, Math.floor(t * 1.5 + row)) * (s.w - 3)) + 2;
          g.fillStyle = CODE[(row + s.key) % CODE.length];
          g.fillRect(s.x + 1 + (row % 4 ? 2 : 0), s.y + 1 + row, Math.min(len, s.w - 3), 1);
        }
      } else if (s.kind === 'tv') {
        const bg = s.key === 'ticker' ? '#0b1220' : this.tv.game && s.key === 'tvLounge' ? '#1f5d3a' : '#3b1592';
        g.fillStyle = bg; g.fillRect(s.x, s.y, s.w, s.h);
        if (s.key === 'ticker') {   // grafik emas
          g.fillStyle = '#f5c451';
          for (let x = 0; x < s.w; x++) { const v = Math.sin((x + t * 6) * 0.25) * 1.8 + Math.sin((x + t * 3) * 0.07) * 1.2; g.fillRect(s.x + x, s.y + s.h / 2 + v | 0, 1, 1); }
        } else if (this.tv.game && s.key === 'tvLounge') {
          g.fillStyle = '#c7b98a'; g.fillRect(s.x + 2, s.y + 3, s.w - 4, 1);
          g.fillStyle = '#ffffff'; g.fillRect(s.x + ((t * 10) % (s.w - 2)) | 0, s.y + 2, 2, 2);
        } else {
          const bm = this.tv.themeBm, off = bm ? Math.floor(t * 8) % (bm.w + s.w) : 0;
          g.fillStyle = '#f8f6ff';
          if (bm) for (let y = 0; y < 5; y++) for (let x = 0; x < s.w; x++) if (bm.on(x - s.w + off, y)) g.fillRect(s.x + x, s.y + 1 + y, 1, 1);
          if (this.tv.pending) { g.fillStyle = '#fbbf24'; g.fillRect(s.x + s.w - 3, s.y, 3, 2); }
        }
      } else if (s.kind === 'cinema') {
        const on = this.tv.cinema;
        g.fillStyle = on ? '#2a3a6a' : '#05040a'; g.fillRect(s.x, s.y, s.w, s.h);
        if (on) for (let x = 0; x < s.w; x += 3) { g.fillStyle = `hsl(${(x * 3 + t * 40) % 360},55%,${45 + 15 * Math.sin(x * 0.2 + t)}%)`; g.fillRect(s.x + x, s.y + 2 + (Math.sin(x * 0.3 + t * 2) * 2 | 0), 3, s.h - 4); }
      } else if (s.kind === 'arcade') {
        g.fillStyle = `hsl(${(s.key * 90 + t * 60) % 360},70%,55%)`; g.fillRect(s.x, s.y, s.w, s.h);
        g.fillStyle = '#fff'; g.fillRect(s.x + ((t * 6 + s.key) % s.w | 0), s.y + 2, 1, 1);
      } else if (s.kind === 'led') {
        g.fillStyle = Math.floor(t * 3 + s.key) % 3 ? '#34d399' : '#f87171'; g.fillRect(s.x, s.y, s.w, s.h);
      }
    }
  }
  drawWater(g) {
    const t = this.t;
    for (const w of this.map.waters) {   // kilau kolam
      g.fillStyle = 'rgba(255,255,255,0.75)';
      for (let k = 0; k < 26; k++) {
        const ph = Math.floor(t * 1.2 + k * 0.37);
        const x = w.x + Math.floor(hash2(k, ph) * (w.w - 6)), y = w.y + 4 + Math.floor(hash2(ph, k + 9) * (w.h - 8));
        g.fillRect(x, y, 3 + (k % 3), 1);
      }
    }
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
      if (pose === 'walk') f = Math.floor(c.walkDist / 0.22) % 4;
      else if (pose === 'swim') f = Math.floor(t * 3 + c.seed) % 4;
      else if (pose === 'type') {
        f = Math.floor(t * 5 + c.seed) % 4;
        if (c.mood === 'ngantuk') v = 'sleepy';
        const m = MOOD_AT_DESK[c.mood];
        if (m && (t + c.seed * 7) % m[1] < m[2] && m[0] === 'shake') jitter = Math.floor(t * 12) % 2 ? 1 : -1;
      } else if (pose === 'eat' || pose === 'drink') f = Math.floor(t * 0.6 + c.seed) % 4;
      else if (pose === 'pray') v = c.info?.phase ?? phase;
      if (pose === 'pray' && v === 'itidal') v = 'qiyam';
      if (pose === 'drink' && f >= 2) pose = 'stand';
      const spr = tdSprite(c.agent.id, this.outfit, pose === 'phone' && c.locKey.startsWith('game') ? 'game' : pose, dir, f, v);
      // duduk menghadap kamera (di balik meja): turun sedikit supaya pangkuan ketutup meja
      const seatDy = SEAT.has(pose) && dir === 'S' ? 5 : 0;
      const fx = X(c.pos.x) + jitter, fy = Y(c.pos.z) + seatDy;
      const box = { x: fx - spr.ax, y: fy - spr.ay, w: spr.w, h: spr.h };
      out.push({ c, spr, fx, fy, box, z: c.pos.z + (seatDy ? -0.02 : 0.01), shadow: !SEAT.has(pose) && pose !== 'swim' && pose !== 'lie', ring: this.selected === c.agent.id });
    });
    return out;
  }
  drawActor(g, a) {
    if (a.ring) {
      g.fillStyle = 'rgba(167,139,250,0.9)';
      for (let y = -3; y <= 3; y++) { const h = Math.round(8 * Math.sqrt(1 - (y / 3.5) ** 2)); g.fillRect(a.fx - h, a.fy + y, h * 2, 1); }
      g.fillStyle = 'rgba(30,20,60,0.5)';
      for (let y = -2; y <= 2; y++) { const h = Math.round(6 * Math.sqrt(1 - (y / 2.5) ** 2)); g.fillRect(a.fx - h, a.fy + y, h * 2, 1); }
    } else if (a.shadow) {
      g.fillStyle = 'rgba(20,14,30,0.25)';
      g.fillRect(a.fx - 5, a.fy - 1, 10, 2); g.fillRect(a.fx - 4, a.fy + 1, 8, 1);
    }
    g.drawImage(a.spr.cv, a.box.x, a.box.y);
  }
}
