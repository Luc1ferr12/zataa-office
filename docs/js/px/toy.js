// Tampilan 3D mainan: gedung & karakter hasil render Blender (blender/toy_office.py, blender/toy_sprites.py).
// Mesin pixel menghitung kedalaman/layar/cahaya di resolusi dasar (W×H, 16 px/m); yang tampil DS× lebih tajam.
// Latar gedung dipotong jadi tile (512 px) dengan beberapa tingkat detail (LOD) → zoom & geser tetap ringan.
import { W, H } from './engine.js';

export const DS = 4;
export const DW = W * DS, DH = H * DS;
const BASE = 'assets/office/';

async function decode(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  const bmp = await createImageBitmap(await res.blob());
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0);
  const d = g.getImageData(0, 0, bmp.width, bmp.height);
  bmp.close?.();
  return { w: d.width, h: d.height, u32: new Uint32Array(d.data.buffer) };
}

// ---------------------------------------------------------------- tile latar (siang & malam)
// manifest: { w, h, tile, levels: [f…] } — level f = 1/f resolusi tampilan; tile: bg/<mode>/<f>/<col>_<row>.webp
export class Tiles {
  constructor(manifest) {
    this.m = manifest;
    this.cache = new Map();   // key → { bmp, used } | { loading }
    this.max = 220;
    this.frame = 0;
  }
  static async load() {
    const r = await fetch(`${BASE}bg/manifest.json`, { cache: 'no-cache' });
    if (!r.ok) throw new Error('manifest latar belum ada');
    const m = await r.json();
    if (m.w !== DW || m.h !== DH) throw new Error(`ukuran latar ${m.w}×${m.h}, harusnya ${DW}×${DH}`);
    const t = new Tiles(m);
    await t.preload(Math.max(...m.levels));   // level paling kasar selalu ada (cadangan saat tile detail belum datang)
    return t;
  }
  key(mode, f, c, r) { return `${mode}/${f}/${c}_${r}`; }
  get(mode, f, c, r) {
    const k = this.key(mode, f, c, r);
    const e = this.cache.get(k);
    if (e?.bmp) { e.used = this.frame; return e.bmp; }
    if (!e) this.fetch(k);
    return null;
  }
  fetch(k) {
    const e = { loading: true, used: this.frame };
    this.cache.set(k, e);
    return fetch(`${BASE}bg/${k}.webp`).then((r) => (r.ok ? r.blob() : Promise.reject(r.status))).then(createImageBitmap)
      .then((bmp) => { e.bmp = bmp; e.loading = false; this.onLoad?.(); this.evict(); })
      .catch(() => { e.loading = false; e.failed = true; });
  }
  async preload(f) {
    const ts = this.m.tile * f, cols = Math.ceil(this.m.w / ts), rows = Math.ceil(this.m.h / ts);
    const jobs = [];
    for (const mode of ['day', 'night']) for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
      const k = this.key(mode, f, c, r);
      const e = this.cache.get(k);
      if (!e) jobs.push(this.fetch(k));
      this.cache.get(k).pin = true;
    }
    await Promise.all(jobs);
  }
  evict() {
    if (this.cache.size <= this.max) return;
    const list = [...this.cache.entries()].filter(([, e]) => e.bmp && !e.pin).sort((a, b) => a[1].used - b[1].used);
    for (const [k, e] of list.slice(0, this.cache.size - this.max)) { e.bmp.close?.(); this.cache.delete(k); }
  }
  // gambar latar (koordinat tampilan) yang kelihatan; level dipilih dari skala layar
  draw(ctx, mode, scale, vx0, vy0, vx1, vy1, alpha = 1) {
    this.frame++;
    const { tile, levels } = this.m;
    const want = 1 / Math.max(scale, 1e-3);
    let f = levels[0];
    for (const L of levels) if (L <= want * 1.25) f = Math.max(f, L);
    const coarse = Math.max(...levels);
    ctx.globalAlpha = alpha;
    const ts = tile * f;
    const c0 = Math.max(0, Math.floor(vx0 / ts)), c1 = Math.min(Math.ceil(this.m.w / ts) - 1, Math.floor(vx1 / ts));
    const r0 = Math.max(0, Math.floor(vy0 / ts)), r1 = Math.min(Math.ceil(this.m.h / ts) - 1, Math.floor(vy1 / ts));
    for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) {
      const x = c * ts, y = r * ts;
      const bmp = this.get(mode, f, c, r);
      if (bmp) { ctx.drawImage(bmp, x, y, bmp.width * f, bmp.height * f); continue; }
      // belum ada: pakai potongan dari level kasar
      const cs = tile * coarse, cc = Math.floor(x / cs), cr = Math.floor(y / cs);
      const cb = this.get(mode, coarse, cc, cr);
      if (!cb) continue;
      const sx = (x - cc * cs) / coarse, sy = (y - cr * cs) / coarse;
      const sw = Math.min(ts / coarse, cb.width - sx), sh = Math.min(ts / coarse, cb.height - sy);
      if (sw > 0 && sh > 0) ctx.drawImage(cb, sx, sy, sw, sh, x, y, sw * coarse, sh * coarse);
    }
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------- sprite karakter
const atlases = new Map();
export async function loadSprites(ids) {
  await Promise.all(ids.map(async (id) => {
    try {
      const [meta, img] = await Promise.all([fetch(`${BASE}chars/${id}.json`).then((r) => r.json()), decode(`${BASE}chars/${id}.webp`)]);
      atlases.set(id, { meta, img, cache: new Map() });
    } catch (e) { console.warn('sprite 3D belum ada untuk', id); }
  }));
  if (!atlases.size) throw new Error('tidak ada sprite 3D');
}
export const hasSprites = (id) => atlases.has(id);

// nama pose mesin (pose, frame, varian) → nama frame di atlas
function key(pose, f, v) {
  switch (pose) {
    case 'walk': return ['walk0', 'walk1', 'walk0', 'walk3'][f] ?? 'walk0';
    case 'type': return v === 'up' ? 'type_up' : v === 'face' ? 'type_face' : v === 'sleepy' ? 'type_sleepy' : `type${f}`;
    case 'talk': return `talk${f}`;
    case 'eat': return f < 2 ? 'eat0' : 'eat2';
    case 'swim': return `swim${f}`;
    case 'sweep': return `sweep${f}`;
    case 'pray': return `pray_${v || 'qiyam'}`;
    default: return pose;
  }
}

export function toySprite(id, pose, dir, f = 0, v = '') {
  const A = atlases.get(id);
  if (!A) return null;
  let k = key(pose, f, v);
  if (!A.meta.poses[k]) k = pose === 'swim' || pose === 'sweep' ? 'stand' : A.meta.poses[`${pose}`] ? pose : 'stand';
  const ck = `${k}|${dir}`;
  let s = A.cache.get(ck);
  if (s) return s;
  const [fw, fh] = A.meta.frame, [ax, ay] = A.meta.anchor;
  const i = A.meta.poses[k][dir] ?? A.meta.poses[k].S;
  const cx = (i % A.meta.cols) * fw, cy = Math.floor(i / A.meta.cols) * fh;
  // potong frame → buang baris/kolom kosong biar gambar & hit-test cepat
  let x0 = fw, y0 = fh, x1 = -1, y1 = -1;
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
    if (A.img.u32[(cy + y) * A.img.w + cx + x] >>> 24 > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) { x0 = y0 = 0; x1 = y1 = 0; }
  const w = x1 - x0 + 1, h = y1 - y0 + 1, d = new Uint32Array(w * h);
  for (let y = 0; y < h; y++) d.set(A.img.u32.subarray((cy + y0 + y) * A.img.w + cx + x0, (cy + y0 + y) * A.img.w + cx + x0 + w), y * w);
  s = { w, h, ax: ax - x0, ay: ay - y0, d, flat: k === 'lie', lift: 0, toy: true, key: `${id}|${ck}` };
  A.cache.set(ck, s);
  return s;
}
