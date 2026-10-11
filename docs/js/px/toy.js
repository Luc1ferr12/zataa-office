// Tampilan 3D mainan: gedung & karakter hasil render Blender (blender/toy_office.py, blender/toy_sprites.py).
// Mesin pixel tetap menghitung kedalaman/kaca/permukaan animasi di resolusi dasar (W×H); yang tampil 2× (DS).
import { W, H } from './engine.js';

export const DS = 2;
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
  return { w: bmp.width, h: bmp.height, u32: new Uint32Array(d.data.buffer) };
}

// gambar latar gedung (siang & malam) untuk varian lantai atas tampil / disembunyikan
export async function loadBackground(upper) {
  const tag = upper ? 'up' : 'down';
  const [day, night] = await Promise.all([decode(`${BASE}${tag}_day.webp`), decode(`${BASE}${tag}_night.webp`)]);
  if (day.w !== DW || day.h !== DH) throw new Error(`ukuran latar ${day.w}×${day.h}, harusnya ${DW}×${DH}`);
  return { day: day.u32, night: night.u32 };
}

// ---------------------------------------------------------------- sprite karakter
const atlases = new Map();
export async function loadSprites(ids) {
  await Promise.all(ids.map(async (id) => {
    const [meta, img] = await Promise.all([fetch(`${BASE}chars/${id}.json`).then((r) => r.json()), decode(`${BASE}chars/${id}.webp`)]);
    atlases.set(id, { meta, img, cache: new Map() });
  }));
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
  s = { w, h, ax: ax - x0, ay: ay - y0, d, flat: k === 'lie', lift: 0, toy: true };
  A.cache.set(ck, s);
  return s;
}
