# Bangun gedung kantor Zataa di Blender lalu export ke docs/models/office.glb.
#   blender --background --python blender/make_office.py -- <out.glb> [preview.png]
# Semua posisi ditulis dalam koordinat three.js (x, y-atas, z) supaya sama persis dengan
# jalur jalan & tempat duduk di docs/js/nav.js / world.js. T() mengubahnya ke koordinat Blender.
import bpy, bmesh, math, os, sys, random
import numpy as np
from mathutils import Vector, Matrix

ARGV = sys.argv[sys.argv.index("--") + 1:]
OUT = ARGV[0]
PREVIEW = ARGV[1] if len(ARGV) > 1 else None
HERE = os.path.dirname(os.path.abspath(__file__))
UP = 3.6
random.seed(7)
rng = np.random.default_rng(7)
bpy.ops.wm.read_factory_settings(use_empty=True)
SCENE = bpy.context.scene


def T(x, y, z):
    return Vector((x, -z, y))


# =====================================================================
# TEKSTUR PROSEDURAL (numpy, mulus saat diulang)
# =====================================================================
def aniso(n, lx, ly):
    """Noise periodik dengan panjang fitur lx (horizontal) & ly (vertikal) piksel, hasil ~[-1,1]."""
    w = rng.standard_normal((n, n))
    fy = np.fft.fftfreq(n)[:, None]
    fx = np.fft.fftfreq(n)[None, :]
    filt = np.exp(-((fx * lx) ** 2 + (fy * ly) ** 2) * 6.0)
    r = np.real(np.fft.ifft2(np.fft.fft2(w) * filt))
    return r / (r.std() + 1e-6) / 2.5


def fbm(n, base=64, octaves=4):
    out = np.zeros((n, n))
    amp, s = 1.0, base
    for _ in range(octaves):
        out += aniso(n, s, s) * amp
        amp *= 0.5
        s /= 2
    return out / 1.8


def hexc(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])


def img_from(name, rgb, alpha=None, color=True):
    n_y, n_x = rgb.shape[:2]
    img = bpy.data.images.new(name, n_x, n_y, alpha=alpha is not None)
    a = np.ones((n_y, n_x)) if alpha is None else alpha
    px = np.dstack([np.clip(rgb, 0, 1), a]).astype(np.float32)
    img.pixels.foreach_set(px.ravel())
    if not color:
        img.colorspace_settings.name = "Non-Color"
    img.pack()
    return img


def normal_img(name, h, strength=2.0):
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength
    gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    nz = np.ones_like(h)
    l = np.sqrt(gx ** 2 + gy ** 2 + nz ** 2)
    rgb = np.dstack([-gx / l, -gy / l, nz / l]) * 0.5 + 0.5
    return img_from(name, rgb, color=False)


def tex_wood(name, base, planks=8, n=1024, stagger=True):
    col, h = np.zeros((n, n, 3)), np.zeros((n, n))
    grain = aniso(n, 160, 2.5)
    fine = aniso(n, 40, 1.2)
    rows = n // planks
    c = hexc(base)
    for i in range(planks):
        sl = slice(i * rows, (i + 1) * rows)
        shift = rng.integers(0, n)
        tone = rng.uniform(-0.09, 0.09)
        g = np.roll(grain[sl], shift, 1) * 0.11 + np.roll(fine[sl], shift, 1) * 0.05
        col[sl] = c * (1 + tone + g)[..., None]
        h[sl] = 0.5 + g
        col[i * rows:i * rows + 2] *= 0.5
        h[i * rows:i * rows + 2] = 0
        if stagger:
            x = int(((i * 0.37) % 1) * n)
            col[sl, x:x + 2] *= 0.55
            h[sl, x:x + 2] = 0
    return img_from(name, col), normal_img(name + "_n", h, 1.6)


def tex_slats(name, base, n=512, count=10):
    col = np.zeros((n, n, 3))
    h = np.ones((n, n))
    c = hexc(base)
    grain = aniso(n, 2, 120)
    w = n // count
    col[:] = c * 0.35
    for i in range(count):
        sl = slice(i * w + 3, (i + 1) * w - 3)
        col[:, sl] = c * (1 + rng.uniform(-0.08, 0.08) + grain[:, sl] * 0.1)[..., None]
    for i in range(count):
        h[:, i * w:i * w + 3] = 0
    return img_from(name, col), normal_img(name + "_n", h, 3.0)


def tex_concrete(name, base, n=1024):
    nz = fbm(n, 90) + aniso(n, 3, 3) * 0.25
    col = hexc(base) * (1 + nz * 0.07)[..., None]
    return img_from(name, col), normal_img(name + "_n", nz * 0.2, 1.0)


def tex_tiles(name, base, count=4, n=1024, grout=4, grout_col=0.55, var=0.06):
    col, h = np.zeros((n, n, 3)), np.ones((n, n))
    s = n // count
    c = hexc(base)
    nz = fbm(n, 60) * 0.05 + aniso(n, 2, 2) * 0.03
    for i in range(count):
        for j in range(count):
            col[j * s:(j + 1) * s, i * s:(i + 1) * s] = c * (1 + rng.uniform(-var, var))
    col *= (1 + nz)[..., None]
    for i in range(count):
        col[:, i * s:i * s + grout] *= grout_col
        col[i * s:i * s + grout, :] *= grout_col
        h[:, i * s:i * s + grout] = 0
        h[i * s:i * s + grout, :] = 0
    return img_from(name, col), normal_img(name + "_n", h, 2.0)


def tex_ledgestone(name, n=1024):
    """Batu alam susun horizontal untuk dinding luar."""
    col, h = np.zeros((n, n, 3)), np.zeros((n, n))
    nz = fbm(n, 40) * 0.08 + aniso(n, 2, 2) * 0.05
    y = 0
    while y < n:
        rh = int(rng.integers(28, 70))
        x = int(rng.integers(0, 60))
        while x < n + 120:
            rw = int(rng.integers(90, 260))
            tone = rng.uniform(0.55, 1.0)
            c = np.array([0.62, 0.58, 0.52]) * tone + rng.uniform(-0.04, 0.04, 3)
            xs = np.arange(x, x + rw) % n
            ys = np.arange(y, min(y + rh, n))
            col[np.ix_(ys, xs)] = c
            h[np.ix_(ys, xs)] = 0.6 + rng.uniform(-0.2, 0.2)
            x += rw + 4
        col[y:y + 4] = 0.18
        h[y:y + 4] = 0
        y += rh + 4
    col *= (1 + nz)[..., None]
    return img_from(name, col), normal_img(name + "_n", h + nz, 2.5)


def tex_leaves(name, n=512, count=520, hue=(0.25, 0.45, 0.18)):
    """Gugus daun di atas latar transparan, untuk kartu daun pohon/semak."""
    col = np.zeros((n, n, 3))
    alpha = np.zeros((n, n))
    yy, xx = np.mgrid[0:n, 0:n]
    cx0 = cy0 = n / 2
    for _ in range(count):
        # sebar daun di dalam lingkaran, makin padat di tengah
        r = n * 0.46 * math.sqrt(random.random())
        a = random.uniform(0, math.pi * 2)
        cx, cy = cx0 + math.cos(a) * r, cy0 + math.sin(a) * r
        L, W = random.uniform(14, 26), random.uniform(6, 10)
        th = random.uniform(0, math.pi)
        x0, x1 = int(max(0, cx - L)), int(min(n, cx + L))
        y0, y1 = int(max(0, cy - L)), int(min(n, cy + L))
        if x1 <= x0 or y1 <= y0:
            continue
        dx, dy = xx[y0:y1, x0:x1] - cx, yy[y0:y1, x0:x1] - cy
        u = dx * math.cos(th) + dy * math.sin(th)
        v = -dx * math.sin(th) + dy * math.cos(th)
        m = (u / L) ** 2 + (v / W) ** 2 < 1
        shade = random.uniform(0.6, 1.25) * (0.75 + 0.35 * (1 - r / (n * 0.46)))
        c = np.array(hue) * shade + np.array([random.uniform(-0.03, 0.03), random.uniform(-0.04, 0.05), 0])
        tone = (1 - 0.25 * np.abs(v / W))[m]
        col[y0:y1, x0:x1][m] = c[None, :] * tone[:, None]
        alpha[y0:y1, x0:x1][m] = 1
    return img_from(name, col, alpha=alpha)


def tex_marble(name, n=512):
    y, x = np.mgrid[0:n, 0:n] / n
    warp = fbm(n, 80) * 3.0
    v = np.abs(np.sin((x + y) * 2 * math.pi * 2 + warp * 2.2)) ** 0.25
    col = np.dstack([0.95 - (1 - v) * 0.22] * 3) * np.array([1.0, 0.99, 0.97])
    return img_from(name, col)


def tex_fabric(name, base, n=512):
    y, x = np.mgrid[0:n, 0:n]
    weave = (np.sin(x * math.pi / 2) * np.sin(y * math.pi / 2)) * 0.04
    nz = aniso(n, 2, 2) * 0.05 + fbm(n, 60) * 0.04
    col = hexc(base) * (1 + weave + nz)[..., None]
    return img_from(name, col), normal_img(name + "_n", weave + nz, 2.0)


def tex_grass(name, n=1024):
    a, b, c = fbm(n, 100), aniso(n, 8, 8), aniso(n, 1.5, 3)
    g = np.dstack([0.30 + a * 0.06 + c * 0.04, 0.50 + a * 0.09 + b * 0.05 + c * 0.06, 0.20 + a * 0.04])
    return img_from(name, g), normal_img(name + "_n", c * 0.5 + b * 0.3, 1.5)


def tex_carpet(name, n=512):
    col = hexc("#1e5a45") * (1 + aniso(n, 2, 2) * 0.06 + fbm(n, 60) * 0.04)[..., None]
    step = n // 4
    for i in range(4):
        col[:, i * step:i * step + 6] = hexc("#c9a94a")
    return img_from(name, col)


def tex_sajadah(name, w=256, h=512):
    col = np.zeros((h, w, 3)) + hexc("#7a1f2b")
    gold, dark = hexc("#d8b25a"), hexc("#5a1420")
    col[10:22, :] = gold; col[-22:-10, :] = gold; col[:, 10:22] = gold; col[:, -22:-10] = gold
    yy, xx = np.mgrid[0:h, 0:w]
    cx = w / 2
    arch = (yy > h * 0.5) & (yy < h * 0.88) & (np.abs(xx - cx) < w * 0.32)
    top = (yy >= h * 0.88 - 0.0) & (((xx - cx) / (w * 0.32)) ** 2 + ((yy - h * 0.88) / (h * 0.1)) ** 2 < 1)
    col[arch | top] = dark
    col *= (1 + aniso(512, 2, 2)[:h, :w] * 0.06)[..., None]
    return img_from(name, col)


def tex_mosaic(name, n=512, count=16):
    i_img, n_img = tex_tiles(name, "#4fb8d4", count, n, grout=2, grout_col=0.85, var=0.12)
    return i_img, n_img


# =====================================================================
# MATERIAL
# =====================================================================
TILE = {}


def lin(c):
    return [float(v) ** 2.2 for v in hexc(c)] + [1.0]


def material(name, color="#ffffff", img=None, nrm=None, rough=0.6, metal=0.0, emit=None, emit_strength=0.0,
             alpha=1.0, double=False, tile=1.0, nrm_strength=0.6):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = lin(color)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if img:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = img
        nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    if nrm:
        tn = nt.nodes.new("ShaderNodeTexImage")
        tn.image = nrm
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = nrm_strength
        nt.links.new(tn.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    if emit:
        b.inputs["Emission Color"].default_value = lin(emit)
        b.inputs["Emission Strength"].default_value = emit_strength
    if alpha < 1.0:
        b.inputs["Alpha"].default_value = alpha
        m.surface_render_method = 'BLENDED'
    m.use_backface_culling = not double
    TILE[name] = tile
    return m


def image_material(name, path, emit_strength=0.0, alpha_cut=False):
    img = bpy.data.images.load(path)
    img.pack()
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = img
    nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(t.outputs["Alpha"], b.inputs["Alpha"])
    if emit_strength:
        nt.links.new(t.outputs["Color"], b.inputs["Emission Color"])
        b.inputs["Emission Strength"].default_value = emit_strength
    m.surface_render_method = 'BLENDED' if not alpha_cut else 'DITHERED'
    TILE[name] = 0
    return m


print("tekstur...")
W = {}
for key, base, pl in (("oak", "#c49a6c", 8), ("walnut", "#6b4a33", 8), ("workwood", "#8a6a4e", 8), ("deck", "#9b6d47", 10), ("tread", "#a77850", 4)):
    W[key] = tex_wood("t_" + key, base, pl)
SL = tex_slats("t_slat", "#7a5536")
SLD = tex_slats("t_slatdark", "#3a2a20")
CON = tex_concrete("t_concrete", "#d8d2c8")
COND = tex_concrete("t_concrete_dark", "#56555a")
STONE = tex_tiles("t_stone", "#d9d3c7")
STONED = tex_tiles("t_stone_dark", "#47474c", 4)
LEDGE = tex_ledgestone("t_ledge")
MOS = tex_mosaic("t_mosaic")
GR = tex_grass("t_grass")
FAB = {k: tex_fabric("t_fab_" + k, c) for k, c in (("sofa", "#6d6a7c"), ("rug", "#8a7f9a"), ("meet", "#4a4d5c"), ("boss", "#2d2340"), ("cushion", "#efe9df"), ("lounge", "#f3ecdf"), ("chair", "#d8d4cc"))}

MAT = {
    "oak": material("oak", img=W["oak"][0], nrm=W["oak"][1], rough=0.45, tile=4.0),
    "walnut": material("walnut", img=W["walnut"][0], nrm=W["walnut"][1], rough=0.4, tile=3.0),
    "workwood": material("workwood", img=W["workwood"][0], nrm=W["workwood"][1], rough=0.35, tile=4.0),
    "deck": material("deck", img=W["deck"][0], nrm=W["deck"][1], rough=0.6, tile=4.0),
    "tread": material("tread", img=W["tread"][0], nrm=W["tread"][1], rough=0.45, tile=1.5),
    "furn_wood": material("furn_wood", img=W["walnut"][0], nrm=W["walnut"][1], rough=0.35, tile=1.2),
    "light_wood": material("light_wood", img=W["oak"][0], nrm=W["oak"][1], rough=0.4, tile=1.2),
    "slat": material("slat", img=SL[0], nrm=SL[1], rough=0.6, tile=1.6, nrm_strength=1.0),
    "slatdark": material("slatdark", img=SLD[0], nrm=SLD[1], rough=0.6, tile=1.6, nrm_strength=1.0),
    "concrete": material("concrete", img=CON[0], nrm=CON[1], rough=0.9, tile=5.0),
    "concrete_dark": material("concrete_dark", img=COND[0], nrm=COND[1], rough=0.85, tile=6.0),
    "stone": material("stone", img=STONE[0], nrm=STONE[1], rough=0.7, tile=3.2),
    "stone_dark": material("stone_dark", img=STONED[0], nrm=STONED[1], rough=0.75, tile=3.2),
    "ledge": material("ledge", img=LEDGE[0], nrm=LEDGE[1], rough=0.85, tile=3.0, nrm_strength=1.0),
    "art1": material("art1", "#c9a25a", rough=0.5), "art2": material("art2", "#2f6b65", rough=0.5), "art3": material("art3", "#b04a5a", rough=0.5),
    "hedge": material("hedge", "#355f33", rough=0.8, double=True),
    "foliage": material("foliage", img=tex_leaves("t_leaves"), rough=0.75, double=True, tile=0),
    "foliage_dark": material("foliage_dark", img=tex_leaves("t_leaves_dark", hue=(0.17, 0.33, 0.14)), rough=0.8, double=True, tile=0),
    "mosaic": material("mosaic", img=MOS[0], nrm=MOS[1], rough=0.2, tile=2.0),
    "grass": material("grass", img=GR[0], nrm=GR[1], rough=1.0, tile=6.0),
    "marble": material("marble", img=tex_marble("t_marble"), rough=0.12, tile=1.5),
    "carpet": material("carpet", img=tex_carpet("t_carpet"), rough=1.0, tile=2.75),
    "sajadah": material("sajadah", img=tex_sajadah("t_sajadah"), rough=0.95, tile=0),
    "plaster": material("plaster", "#eeeae3", rough=0.9),
    "black": material("black", "#121215", rough=0.4),
    "dark": material("dark", "#1d1b22", rough=0.55),
    "steel": material("steel", "#2a2a30", rough=0.3, metal=0.8),
    "chrome": material("chrome", "#d0d3d8", rough=0.12, metal=1.0),
    "brass": material("brass", "#c9a25a", rough=0.28, metal=0.9),
    "white": material("white", "#f2f0ec", rough=0.5),
    "glass": material("glass", "#d5e6ff", rough=0.03, alpha=0.16, double=True),
    "pot": material("pot", "#2a2a2e", rough=0.6),
    "pot_light": material("pot_light", "#d6cfc3", rough=0.75),
    "soil": material("soil", "#3a2a1e", rough=1.0),
    "leaf": material("leaf", "#3e7d46", rough=0.7, double=True),
    "leaf2": material("leaf2", "#5f9b4f", rough=0.7, double=True),
    "leaf_dark": material("leaf_dark", "#2c5a33", rough=0.75, double=True),
    "palm": material("palm", "#3d7434", rough=0.75, double=True),
    "trunk": material("trunk", "#6b5240", rough=0.9),
    "purple": material("purple", "#5b1fd6", rough=0.45),
    "beanbag": material("beanbag", "#6d28d9", rough=0.85),
    "leather": material("leather", "#17171b", rough=0.45),
    "copper": material("copper", "#b7764a", rough=0.5),
    "sofa": material("sofa", img=FAB["sofa"][0], nrm=FAB["sofa"][1], rough=1.0, tile=1.0),
    "rug": material("rug", img=FAB["rug"][0], nrm=FAB["rug"][1], rough=1.0, tile=1.5),
    "meet_carpet": material("meet_carpet", img=FAB["meet"][0], nrm=FAB["meet"][1], rough=1.0, tile=2.0),
    "boss_sofa": material("boss_sofa", img=FAB["boss"][0], nrm=FAB["boss"][1], rough=1.0, tile=1.0),
    "cushion": material("cushion", img=FAB["cushion"][0], nrm=FAB["cushion"][1], rough=1.0, tile=1.0),
    "umbrella": material("umbrella", img=FAB["lounge"][0], rough=0.95, double=True, tile=1.0),
    "chair_fab": material("chair_fab", img=FAB["chair"][0], nrm=FAB["chair"][1], rough=0.95, tile=0.8),
    "pool_floor": material("pool_floor", "#3aa6c8", rough=0.4),
    "pink": material("pink", "#ff7eb6", rough=0.3),
    "bottle1": material("bottle1", "#3b6b4a", rough=0.15), "bottle2": material("bottle2", "#7a3b2b", rough=0.15),
    "bottle3": material("bottle3", "#c9a25a", rough=0.15), "bottle4": material("bottle4", "#2b3b6b", rough=0.15),
    "book1": material("book1", "#5b1fd6"), "book2": material("book2", "#e9e2d6"), "book3": material("book3", "#2a2a30"), "book4": material("book4", "#c79b6d"),
    "quran1": material("quran1", "#1d5e48"), "quran2": material("quran2", "#7a1f2b"),
    "mihrab": material("mihrab", "#173f33", rough=0.6),
    "city_glass": material("city_glass", "#a9c9ef", rough=0.04, metal=0.2, alpha=0.32, double=True),
    "car_paint": material("car_paint", "#141418", rough=0.2, metal=0.7),
    "car_glass": material("car_glass", "#0a0c12", rough=0.05, metal=0.5),
    "pc_case": material("pc_case", "#101014", rough=0.35),
    "keyboard": material("keyboard", "#202026", rough=0.5),
    "screen_off": material("screen_off", "#05050a", rough=0.2),
    "tv_dark": material("tv_dark", "#14082e", rough=0.2),
    "fridge": material("fridge", "#c9ccd2", rough=0.2, metal=0.8),
    "cake": material("cake", "#f3e6cf", rough=0.6),
    "fence": material("fence", "#2b2a2e", rough=0.8),
    "parasol_pole": material("parasol_pole", "#e8e4dc", rough=0.5),
}
# lampu (nama diawali lamp_ / outdoor_ supaya website bisa mengatur terang-redupnya)
LAMP = {
    "warm": material("lamp_warm", "#111111", emit="#ffd9a8", emit_strength=1.4),
    "bulb": material("lamp_bulb", "#ffffff", emit="#ffcf8a", emit_strength=2.2),
    "down": material("lamp_down", "#ffffff", emit="#fff1d6", emit_strength=1.2),
    "purple": material("lamp_purple", "#111111", emit="#8b5cf6", emit_strength=2.4),
    "mihrab": material("lamp_mihrab", "#111111", emit="#ffd28a", emit_strength=1.2),
    "work": material("lamp_work", "#ffffff", emit="#f2f4ff", emit_strength=1.3),
    "candle": material("lamp_candle", "#111111", emit="#ffcf8a", emit_strength=2.0),
}
RGB = ["#8b5cf6", "#22d3ee", "#f472b6", "#a3e635", "#f59e0b", "#60a5fa"]
LAMP_RGB = [material(f"lamp_rgb{i}", "#111111", emit=c, emit_strength=2.2) for i, c in enumerate(RGB)]
OUTDOOR = {
    "bollard": material("outdoor_bollard", "#111111", emit="#ffd9a8", emit_strength=1.6),
    "strip": material("outdoor_strip", "#111111", emit="#ffe7c4", emit_strength=2.2),
    "head": material("outdoor_head", "#111111", emit="#fff6e0", emit_strength=1.5),
    "tail": material("outdoor_tail", "#111111", emit="#ff2a2a", emit_strength=1.2),
}
SIGN = {
    "logo": image_material("sign_logo", os.path.join(HERE, "tex", "logo.png")),
    "cafe": image_material("sign_cafe", os.path.join(HERE, "tex", "sign_cafe.png"), 1.6),
    "zataa": image_material("sign_zataa", os.path.join(HERE, "tex", "sign_zataa.png"), 1.6),
    "musholla": image_material("sign_musholla", os.path.join(HERE, "tex", "sign_musholla.png"), 1.2),
}


# =====================================================================
# GEOMETRI
# =====================================================================
LAYER = "G"   # G = lantai bawah & luar, U = lantai atas (bisa disembunyikan di website)


def set_uv(bm, tile):
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for l in f.loops:
            c = l.vert.co
            if tile <= 0:
                continue
            if ax == 2:
                l[uv].uv = (c.x / tile, c.y / tile)
            elif ax == 0:
                l[uv].uv = (c.y / tile, c.z / tile)
            else:
                l[uv].uv = (c.x / tile, c.z / tile)


def emit(bm, mat, name=None, keep=False, smooth=False, uv_tile=None, layer=None, organic=False):
    bm.normal_update()
    tile = TILE.get(mat.name, 1.0) if uv_tile is None else uv_tile
    if tile:
        set_uv(bm, tile)
    me = bpy.data.meshes.new(name or "p")
    bm.to_mesh(me)
    bm.free()
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
        try:
            if not organic:
                me.set_sharp_from_angle(angle=math.radians(35))  # sudut tajam tetap tegas
        except (AttributeError, TypeError):
            pass
    me.materials.append(mat)
    o = bpy.data.objects.new(name or "p", me)
    SCENE.collection.objects.link(o)
    o["layer"] = layer or LAYER
    o["keep"] = keep
    return o


def place(bm, x, y, z, ry=0.0, rx=0.0, rz=0.0):
    M = Matrix.Translation(T(x, y, z)) @ Matrix.Rotation(ry, 4, 'Z') @ Matrix.Rotation(rx, 4, 'X') @ Matrix.Rotation(-rz, 4, 'Y')
    bmesh.ops.transform(bm, matrix=M, verts=bm.verts)


def box(w, h, d, x, y, z, mat, bevel=0.0, ry=0.0, rx=0.0, name=None, keep=False, segs=2, smooth=False):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(w, d, h), verts=bm.verts)
    big = max(w, h, d)
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=min(bevel, w / 2.2, h / 2.2, d / 2.2), segments=segs, affect='EDGES', profile=0.5, clamp_overlap=True)
    elif big > 2.5 and not mat.name.startswith(("glass", "lamp_", "outdoor_", "city_glass")):
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=min(28, int(big / 0.6)), use_grid_fill=True)
    place(bm, x, y, z, ry, rx)
    return emit(bm, mat, name, keep, smooth or segs > 2)


def cyl(rt, rb, h, x, y, z, mat, seg=24, ry=0.0, rx=0.0, rz=0.0, name=None, keep=False, bevel=0.0, smooth=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=rb, radius2=rt, depth=h)
    if bevel > 0:
        bm.normal_update()
        rim = [e for e in bm.edges if len(e.link_faces) == 2 and (abs(e.link_faces[0].normal.z) > 0.9) != (abs(e.link_faces[1].normal.z) > 0.9)]
        bmesh.ops.bevel(bm, geom=rim, offset=bevel, segments=2, affect='EDGES', clamp_overlap=True)
    place(bm, x, y, z, ry, rx, rz)
    return emit(bm, mat, name, keep, smooth)


def sphere(r, x, y, z, mat, sx=1.0, sy=1.0, sz=1.0, seg=24, ring=16, name=None, keep=False, noise=0.0):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=ring, radius=r)
    if noise:
        for v in bm.verts:
            v.co *= 1 + random.uniform(-noise, noise)
    bmesh.ops.scale(bm, vec=(sx, sz, sy), verts=bm.verts)
    place(bm, x, y, z)
    return emit(bm, mat, name, keep, True, organic=True)


def ico(r, x, y, z, mat, sub=2, noise=0.15, sx=1.0, sy=1.0, sz=1.0):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    for v in bm.verts:
        v.co *= 1 + random.uniform(-noise, noise)
    bmesh.ops.scale(bm, vec=(sx, sz, sy), verts=bm.verts)
    place(bm, x, y, z)
    return emit(bm, mat, None, False, True, uv_tile=0, organic=True)


def quad(w, d, x, y, z, mat, ry=0.0, name=None, keep=False, uv_full=False, vertical=False):
    """Bidang datar (lantai) w×d, atau tegak menghadap +z three bila vertical=True."""
    bm = bmesh.new()
    if vertical:
        vs = [bm.verts.new(v) for v in ((-w / 2, 0, -d / 2), (w / 2, 0, -d / 2), (w / 2, 0, d / 2), (-w / 2, 0, d / 2))]
        bm.faces.new(vs)  # normal menghadap -Y Blender = +z three
    else:
        vs = [bm.verts.new(v) for v in ((-w / 2, -d / 2, 0), (w / 2, -d / 2, 0), (w / 2, d / 2, 0), (-w / 2, d / 2, 0))]
        bm.faces.new(vs)
    bm.normal_update()
    if uv_full:
        uv = bm.loops.layers.uv.verify()
        for f in bm.faces:
            for l, c in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
                l[uv].uv = c
    place(bm, x, y, z, ry)
    return emit(bm, mat, name, keep, uv_tile=0 if uv_full else None)


def floor(x1, x2, z1, z2, mat, y=0.0, name=None, cell=0.45):
    """Lantai berupa grid rapat (bukan 1 kotak) supaya bayangan AO di bawah furnitur terekam."""
    nx, nz = max(1, round((x2 - x1) / cell)), max(1, round((z2 - z1) / cell))
    bm = bmesh.new()
    grid = [[bm.verts.new(T(x1 + (x2 - x1) * i / nx, y, z1 + (z2 - z1) * k / nz)) for k in range(nz + 1)] for i in range(nx + 1)]
    for i in range(nx):
        for k in range(nz):
            bm.faces.new((grid[i][k], grid[i + 1][k], grid[i + 1][k + 1], grid[i][k + 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        if f.normal.z < 0:
            f.normal_flip()
    return emit(bm, mat, name)


def lathe(profile, x, y, z, mat, seg=28, smooth=True):
    """profile: [(radius, tinggi)] dari bawah ke atas."""
    bm = bmesh.new()
    rings = []
    for i in range(seg):
        a = i / seg * math.pi * 2
        rings.append([bm.verts.new((math.cos(a) * r, math.sin(a) * r, hh)) for r, hh in profile])
    for i in range(seg):
        a, b = rings[i], rings[(i + 1) % seg]
        for k in range(len(profile) - 1):
            bm.faces.new((a[k], b[k], b[k + 1], a[k + 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    place(bm, x, y, z)
    return emit(bm, mat, None, False, smooth)


# ---------------------------------------------------------------- furnitur
def gaming_chair(x, z, ry, i):
    acc = material(f"chair_acc{i}", ["#7c3aed", "#0891b2", "#db2777", "#65a30d", "#d97706", "#2563eb"][i % 6], rough=0.6)
    c, s = math.cos(ry), math.sin(ry)
    loc = lambda lx, ly, lz: (x + lx * c + lz * s, ly, z - lx * s + lz * c)
    box(0.54, 0.11, 0.52, *loc(0, 0.47, 0.02), MAT["leather"], bevel=0.04, ry=ry, segs=3)
    box(0.52, 0.8, 0.1, *loc(0, 0.95, -0.26), MAT["leather"], bevel=0.04, ry=ry, rx=0.12, segs=3)
    box(0.17, 0.62, 0.105, *loc(0, 0.97, -0.255), acc, bevel=0.03, ry=ry, rx=0.12, segs=3)
    box(0.32, 0.15, 0.12, *loc(0, 1.4, -0.31), MAT["leather"], bevel=0.05, ry=ry, rx=0.12, segs=3)
    for sx in (-1, 1):
        box(0.06, 0.04, 0.32, *loc(sx * 0.3, 0.66, 0.0), MAT["leather"], bevel=0.015, ry=ry)
        box(0.04, 0.2, 0.04, *loc(sx * 0.3, 0.55, 0.0), MAT["steel"], ry=ry)
    cyl(0.035, 0.035, 0.38, x, 0.25, z, MAT["chrome"], 12)
    for k in range(5):
        a = k / 5 * math.pi * 2
        box(0.045, 0.04, 0.32, x + math.sin(a) * 0.15, 0.06, z + math.cos(a) * 0.15, MAT["steel"], ry=a, bevel=0.01)
        sphere(0.03, x + math.sin(a) * 0.3, 0.03, z + math.cos(a) * 0.3, MAT["black"], seg=10, ring=6)


def office_chair(x, y, z, ry, fab=None, scale=1.0):
    fab = fab or MAT["chair_fab"]
    c, s = math.cos(ry), math.sin(ry)
    loc = lambda lx, ly, lz: (x + (lx * c + lz * s) * scale, y + ly * scale, z + (-lx * s + lz * c) * scale)
    box(0.5 * scale, 0.09 * scale, 0.48 * scale, *loc(0, 0.46, 0), fab, bevel=0.035, ry=ry, segs=3)
    box(0.48 * scale, 0.52 * scale, 0.07 * scale, *loc(0, 0.8, -0.24), fab, bevel=0.03, ry=ry, rx=0.08, segs=3)
    cyl(0.03 * scale, 0.03 * scale, 0.38 * scale, *loc(0, 0.24, 0), MAT["chrome"], 12)
    for k in range(5):
        a = k / 5 * math.pi * 2
        box(0.04 * scale, 0.035 * scale, 0.28 * scale, *loc(math.sin(a) * 0.13, 0.05, math.cos(a) * 0.13), MAT["steel"], ry=a + ry)


def potted_plant(x, z, h=1.3, y=0.0, light=False):
    lathe([(0.0, 0), (0.22, 0.0), (0.27, 0.05), (0.3, 0.5), (0.31, 0.55), (0.0, 0.55)], x, y, z, MAT["pot_light" if light else "pot"])
    cyl(0.28, 0.28, 0.02, x, y + 0.53, z, MAT["soil"], 20)
    for i in range(16):
        a = i / 16 * math.pi * 2 + random.uniform(-0.2, 0.2)
        L = h * random.uniform(0.55, 0.95)
        tilt = random.uniform(0.25, 0.7)
        bm = bmesh.new()
        # daun memanjang yang melengkung keluar
        pts = []
        for k in range(6):
            t = k / 5
            wdt = math.sin(t * math.pi) * 0.07 * (1 + h * 0.2)
            hy = t * L * math.cos(tilt * t)
            hx = t * L * math.sin(tilt * (0.5 + t))
            pts.append((hx, hy, wdt))
        left = [bm.verts.new((px, -w, py)) for px, py, w in pts]
        right = [bm.verts.new((px, w, py)) for px, py, w in pts]
        for k in range(5):
            bm.faces.new((left[k], right[k], right[k + 1], left[k + 1]))
        place(bm, x, y + 0.5, z, ry=a)
        emit(bm, MAT["leaf" if i % 2 else "leaf2"], smooth=True, uv_tile=0)


def planter(x, z, y=0.0, w=1.4):
    box(w, 0.5, 0.6, x, y + 0.25, z, MAT["pot"], bevel=0.02)
    box(w - 0.08, 0.02, 0.52, x, y + 0.49, z, MAT["soil"])
    for i in range(int(w * 2.5)):
        canopy(x + random.uniform(-w / 2 + 0.25, w / 2 - 0.25), y + 0.75, z, 0.32, 0.22, 0.25, MAT["foliage"], cards=6, size=0.55)


def canopy(cx, cy, cz, rx, ry, rz, mat, cards=28, size=1.0):
    """Tajuk daun dari banyak kartu bertekstur; normal diarahkan keluar supaya cahayanya seperti bola daun."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.verify()
    center = T(cx, cy, cz)
    for _ in range(cards):
        d = Vector((random.gauss(0, 1), random.gauss(0, 1), random.gauss(0, 1))).normalized() * random.uniform(0.35, 1.0)
        p = Vector((center.x + d.x * rx, center.y + d.y * rz, center.z + d.z * ry))
        q = Vector((random.gauss(0, 1), random.gauss(0, 1), random.gauss(0, 1))).normalized()
        e1 = q.orthogonal().normalized()
        e2 = q.cross(e1).normalized()
        s = size * random.uniform(0.8, 1.2)
        vs = [bm.verts.new(p + (e1 * a + e2 * b) * s) for a, b in ((-0.5, -0.5), (0.5, -0.5), (0.5, 0.5), (-0.5, 0.5))]
        f = bm.faces.new(vs)
        for l, c in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
            l[uv].uv = c
    bm.normal_update()
    me = bpy.data.meshes.new("canopy")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    nrm = [((v.co - center) * Vector((1 / max(rx, 0.1), 1 / max(rz, 0.1), 1 / max(ry, 0.1)))).normalized() for v in me.vertices]
    for p in me.polygons:
        p.use_smooth = True
    me.normals_split_custom_set_from_vertices(nrm)
    o = bpy.data.objects.new("canopy", me)
    SCENE.collection.objects.link(o)
    o["layer"] = LAYER
    o["keep"] = False
    return o


def tree(x, z, h):
    cyl(0.1 * h / 4, 0.2 * h / 4, h * 0.6, x, h * 0.3, z, MAT["trunk"], 10)
    for k in range(3):
        a = random.uniform(0, 6.28)
        cyl(0.03 * h / 4, 0.06 * h / 4, h * 0.3, x + math.cos(a) * h * 0.06, h * 0.55, z + math.sin(a) * h * 0.06, MAT["trunk"], 6, rx=math.sin(a) * 0.6, rz=math.cos(a) * 0.6)
    for k in range(4):
        canopy(x + random.uniform(-0.25, 0.25) * h * 0.3, h * random.uniform(0.62, 0.82), z + random.uniform(-0.25, 0.25) * h * 0.3,
               h * 0.24, h * 0.2, h * 0.24, MAT[random.choice(["foliage", "foliage", "foliage_dark"])], cards=20, size=h * 0.32)


def palm(x, z, h):
    lean = random.uniform(-0.25, 0.25)
    top = None
    for i in range(10):
        t = i / 10
        px = x + lean * t * t * 2
        cyl(0.11 - 0.03 * t, 0.13 - 0.03 * t, h / 10 + 0.02, px, (i + 0.5) * h / 10, z, MAT["trunk"], 10)
        top = (px, h, z)
    for i in range(11):
        a = i / 11 * math.pi * 2 + random.uniform(-0.15, 0.15)
        bm = bmesh.new()
        L = random.uniform(1.8, 2.4)
        # tulang daun melengkung + anak daun di kiri-kanan
        for k in range(14):
            t0, t1 = k / 14, (k + 1) / 14
            p0 = (t0 * L, 0.35 * math.sin(t0 * math.pi * 0.9) - 0.9 * t0 * t0, 0)
            p1 = (t1 * L, 0.35 * math.sin(t1 * math.pi * 0.9) - 0.9 * t1 * t1, 0)
            wl = 0.38 * math.sin(max(0.08, t0) * math.pi) + 0.05
            for sgn in (-1, 1):
                v0 = bm.verts.new((p0[0], sgn * 0.02, p0[1]))
                v1 = bm.verts.new((p1[0], sgn * 0.02, p1[1]))
                v2 = bm.verts.new((p1[0] + 0.12, sgn * wl, p1[1] - 0.12))
                bm.faces.new((v0, v1, v2))
        place(bm, top[0], top[1], top[2], ry=a)
        emit(bm, MAT["palm"], smooth=True, uv_tile=0)


def sofa(x, z, w, ry, fab, seats, y=0.0):
    box(w, 0.42, 0.95, x, y + 0.21, z, fab, bevel=0.06, ry=ry, segs=3)
    c, s = math.cos(ry), math.sin(ry)
    back = (x + 0.36 * s, z + 0.36 * c)
    box(w, 0.5, 0.25, back[0], y + 0.62, back[1], fab, bevel=0.08, ry=ry, segs=3)
    for sx in (-1, 1):
        ax, az = x + sx * (w / 2 - 0.12) * c, z - sx * (w / 2 - 0.12) * s
        box(0.24, 0.3, 0.95, ax, y + 0.55, az, fab, bevel=0.08, ry=ry, segs=3)
    for i in range(seats):
        off = -w / 2 + 0.3 + (w - 0.6) * (i + 0.5) / seats
        box((w - 0.6) / seats - 0.04, 0.13, 0.78, x + off * c, y + 0.48, z - off * s, fab, bevel=0.06, ry=ry, segs=3)


def pendant(x, z, top, drop, r=0.16):
    cyl(0.005, 0.005, drop, x, top - drop / 2, z, MAT["black"], 6)
    cyl(0.03, 0.03, 0.06, x, top - drop, z, MAT["brass"], 12)
    sphere(r, x, top - drop - r * 0.9, z, LAMP["bulb"], seg=20, ring=12)


# =====================================================================
# BANGUNAN
# =====================================================================
print("bangunan...")
# tanah & rumput (dengan lubang kolam)
bm = bmesh.new()
outer = [bm.verts.new(T(px, -0.03, pz)) for px, pz in ((-70, -70), (70, -70), (70, 70), (-70, 70))]
inner = [bm.verts.new(T(px, -0.03, pz)) for px, pz in ((7, 5), (19, 5), (19, 12), (7, 12))]
for i in range(4):
    bm.faces.new((outer[i], outer[(i + 1) % 4], inner[(i + 1) % 4], inner[i]))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
for f in bm.faces:
    if f.normal.z < 0:
        f.normal_flip()
emit(bm, MAT["grass"], "ground_grass")

floor(-20, -9, -14, 2, MAT["walnut"])
floor(-9, 5, -14, 2, MAT["oak"])
floor(5, 20, -14, 2, MAT["workwood"])
box(40.3, 0.2, 16.3, 0, -0.1, -6, MAT["concrete_dark"])  # pelat lantai

# dinding luar (objek terpisah supaya bisa transparan saat kamera di belakangnya)
wall_mat = [material(f"wall_{n}", img=LEDGE[0], nrm=LEDGE[1], rough=0.85, tile=3.0, nrm_strength=1.0) for n in ("back", "west", "east")]
box(40.6, 7.8, 0.3, 0, 3.9, -14.15, wall_mat[0], name="wall_back", keep=True)
box(0.3, 7.8, 16.6, -20.15, 3.9, -6, wall_mat[1], name="wall_west", keep=True)
box(0.3, 4.2, 16.6, 20.15, 2.1, -6, wall_mat[2], name="wall_east", keep=True)
# panel kayu vertikal di dinding belakang lantai bawah (terlihat di bawah mezzanine)
box(40, 3.3, 0.04, 0, 1.65, -13.98, MAT["slatdark"])

# fasad kaca depan (z = 2) dengan pintu di cafe, ruang santai, ruang kerja
def facade(x1, x2):
    w, cx = x2 - x1, (x1 + x2) / 2
    box(w, 3.3, 0.04, cx, 1.65, 2, MAT["glass"])
    box(w, 0.1, 0.14, cx, 3.3, 2, MAT["steel"])
    box(w, 0.06, 0.12, cx, 0.03, 2, MAT["steel"])
    n = max(1, round(w / 2.0))
    for i in range(n + 1):
        box(0.07, 3.3, 0.1, x1 + w * i / n, 1.65, 2, MAT["steel"])
for a, b in ((-20, -13), (-11, -4), (-1, 8), (10, 20)):
    facade(a, b)
# kanopi kayu di atas pintu
for cx in (-12, -2.5, 9):
    box(2.6, 0.08, 1.2, cx, 3.25, 2.55, MAT["slatdark"], bevel=0.01)

# pelat lantai atas + fasia + kolom + lampu
box(40.3, 0.3, 8, 0, UP - 0.15, -10, MAT["concrete_dark"])
box(40.3, 0.48, 0.26, 0, UP - 0.2, -6.0, MAT["slatdark"])
box(40.3, 0.035, 0.05, 0, UP - 0.45, -5.88, LAMP["warm"])
for x in (-9, 5.5, 13):
    cyl(0.12, 0.12, UP - 0.3, x, (UP - 0.3) / 2, -6.2, MAT["steel"], 16)
for x in range(-18, 19, 3):
    for z in (-12, -8):
        cyl(0.13, 0.13, 0.02, x, UP - 0.31, z, LAMP["down"], 16)

# ---------- CAFE ----------
box(6.6, 1.05, 0.9, -15.6, 0.52, -7.45, MAT["slatdark"], bevel=0.02)
box(6.8, 0.06, 1.05, -15.6, 1.08, -7.45, MAT["marble"], bevel=0.015)
box(0.6, 0.5, 0.5, -17.8, 1.36, -7.6, MAT["chrome"], bevel=0.04, segs=3)
box(0.12, 0.14, 0.14, -17.8, 1.2, -7.3, MAT["black"], bevel=0.02)
box(0.55, 0.42, 0.45, -16.9, 1.32, -7.6, MAT["purple"], bevel=0.04, segs=3)
for i in range(6):
    lathe([(0, 0), (0.035, 0), (0.045, 0.1), (0.04, 0.11), (0, 0.11)], -15.6 + i * 0.22, 1.11, -7.35, MAT["white"], 14)
box(0.5, 0.3, 0.4, -13.6, 1.26, -7.5, MAT["glass"])
box(0.46, 0.06, 0.36, -13.6, 1.14, -7.5, MAT["cake"], bevel=0.02)
box(7, 2.6, 0.5, -15.6, 1.3, -9.4, MAT["furn_wood"])
for k in range(3):
    box(6.8, 0.04, 0.45, -15.6, 1.2 + k * 0.55, -9.1, MAT["furn_wood"])
    box(6.8, 0.02, 0.02, -15.6, 1.22 + k * 0.55, -8.9, LAMP["warm"])
    for b in range(16):
        hgt = random.uniform(0.22, 0.32)
        lathe([(0, 0), (0.04, 0), (0.042, hgt * 0.6), (0.016, hgt * 0.85), (0.014, hgt), (0, hgt)], -18.8 + b * 0.42, 1.22 + k * 0.55, -9.1, MAT[f"bottle{b % 4 + 1}"], 12)
for i in range(4):
    pendant(-18.2 + i * 1.75, -7.3, UP - 0.3, 1.25)
# meja bundar + kursi bar
for tx, tz in ((-17.5, -3.5), (-13.5, -3.5), (-17.5, 0), (-13.5, 0)):
    cyl(0.6, 0.6, 0.05, tx, 0.75, tz, MAT["marble"], 32, bevel=0.012)
    cyl(0.05, 0.05, 0.72, tx, 0.37, tz, MAT["steel"], 12)
    cyl(0.3, 0.32, 0.03, tx, 0.015, tz, MAT["steel"], 24)
    for side in (-1, 1):
        cx = tx + side * 0.85
        cyl(0.22, 0.22, 0.07, cx, 0.46, tz, MAT["copper"], 24, bevel=0.02)
        cyl(0.025, 0.025, 0.44, cx, 0.22, tz, MAT["steel"], 10)
        cyl(0.17, 0.17, 0.02, cx, 0.01, tz, MAT["steel"], 18)
    lathe([(0, 0), (0.04, 0), (0.05, 0.1), (0, 0.1)], tx + 0.15, 0.775, tz - 0.1, MAT["white"], 14)
    cyl(0.04, 0.045, 0.07, tx - 0.2, 0.81, tz + 0.15, LAMP["candle"], 12)
box(0.8, 1.9, 0.75, -19.2, 0.95, -5.4, MAT["fridge"], bevel=0.03)
quad(2.6, 0.8, -15.5, UP - 0.2, -5.85, SIGN["cafe"], vertical=True, uv_full=True)
potted_plant(-19.3, 1.3, 1.5)
potted_plant(-8.6, 1.3, 1.3, light=True)

# ---------- RUANG SANTAI ----------
box(5.4, 2.8, 0.3, -4.6, 1.4, -5.45, MAT["slatdark"])
box(3.3, 1.9, 0.06, -4.6, 1.55, -5.27, MAT["black"], bevel=0.015)
quad(3.15, 1.77, -4.6, 1.55, -5.235, MAT["tv_dark"], vertical=True)
quad(1.5, 1.5, -4.6, 1.55, -5.23, SIGN["logo"], vertical=True, uv_full=True)
box(5.4, 0.04, 0.04, -4.6, 0.04, -5.27, LAMP["purple"])
box(2.6, 0.4, 0.45, -4.6, 0.2, -5.0, MAT["furn_wood"], bevel=0.015)
box(0.35, 0.07, 0.25, -4.0, 0.44, -5.0, MAT["white"], bevel=0.02)
bm = bmesh.new()
bmesh.ops.create_circle(bm, cap_ends=True, segments=48, radius=2.6)
bmesh.ops.scale(bm, vec=(1.15, 0.8, 1), verts=bm.verts)
place(bm, -4.6, 0.012, -2.6)
emit(bm, MAT["rug"])
sofa(-4.65, -1.2, 4.2, 0, MAT["sofa"], 4)
cyl(0.5, 0.5, 0.06, -4.6, 0.42, -3.1, MAT["furn_wood"], 32, bevel=0.015)
cyl(0.3, 0.36, 0.38, -4.6, 0.19, -3.1, MAT["furn_wood"], 24)
for bx, bz in ((-1.75, -3.7), (-7.75, -3.7)):
    sphere(0.55, bx, 0.3, bz, MAT["beanbag"], sy=0.58, seg=28, ring=18, noise=0.03)
potted_plant(0.9, -4.8, 1.5)

# ---------- TANGGA ----------
steps, run = 16, 7.4
rise = UP / steps
for i in range(steps):
    sz = 1.2 - (i + 0.5) * (run / steps)
    sy = (i + 1) * rise
    box(3, 0.09, run / steps + 0.03, 3, sy - 0.045, sz, MAT["tread"], bevel=0.012)
    box(2.9, 0.022, 0.03, 3, sy - 0.11, sz + run / steps / 2 - 0.02, LAMP["warm"])
for sx in (1.45, 4.55):
    bm = bmesh.new()
    prof = [(1.2, 0), (-6.2, UP), (-6.2, UP - 0.5), (0.2, 0)]
    vs = [bm.verts.new(T(sx, py, pz)) for pz, py in prof]
    f = bm.faces.new(vs)
    bmesh.ops.solidify(bm, geom=[f], thickness=0.1)
    emit(bm, MAT["dark"])
    L = math.hypot(run, UP)
    ang = math.atan2(UP, run)
    box(0.03, 1.0, L, sx, UP / 2 + 0.55, -2.5, MAT["glass"], rx=ang)
    box(0.06, 0.05, L, sx, UP / 2 + 1.05, -2.5, MAT["steel"], rx=ang)

# ---------- RUANG KERJA ----------
box(0.12, 3.2, 7.5, 19.9, 1.8, -2.5, MAT["slatdark"])
quad(1.9, 1.9, 19.82, 2.15, -4.6, SIGN["logo"], ry=-math.pi / 2, vertical=True, uv_full=True)
quad(3.4, 1.0, 19.82, 2.2, -1.9, SIGN["zataa"], ry=-math.pi / 2, vertical=True, uv_full=True)
box(0.05, 0.04, 7.5, 19.8, 0.25, -2.5, LAMP["purple"])
box(0.05, 0.04, 7.5, 19.8, 3.35, -2.5, LAMP["purple"])
for wz in (-8.5, -11.5):
    box(0.06, 2.2, 2.2, 19.95, 1.7, wz, MAT["glass"])
i = 0
for z in (-4.2, -0.8):
    for x in (8.5, 12.5, 16.5):
        box(1.9, 0.05, 0.85, x, 0.75, z, MAT["black"], bevel=0.01)
        for sx in (-0.88, 0.88):
            box(0.06, 0.73, 0.06, x + sx, 0.37, z - 0.32, MAT["steel"])
            box(0.06, 0.73, 0.06, x + sx, 0.37, z + 0.32, MAT["steel"])
            box(0.06, 0.05, 0.7, x + sx, 0.05, z, MAT["steel"])
        box(1.9, 0.018, 0.018, x, 0.73, z + 0.43, LAMP_RGB[i])
        for k, dx in enumerate((-0.43, 0.43)):
            ry = -dx * 0.35
            box(0.84, 0.5, 0.035, x + dx, 1.2, z - 0.25, MAT["black"], bevel=0.008, ry=ry)
            ox, oz = math.sin(ry) * 0.019, math.cos(ry) * 0.019
            quad(0.8, 0.45, x + dx + ox, 1.2, z - 0.25 + oz, material(f"screen_{i}_{k}", "#05050a", emit=["#a78bfa", "#5b8cff"][k], emit_strength=0.05, rough=0.2), ry=ry, name=f"screen_{i}_{k}", keep=True, vertical=True)
        box(0.06, 0.32, 0.06, x, 0.93, z - 0.3, MAT["steel"])
        box(0.32, 0.015, 0.2, x, 0.785, z - 0.3, MAT["steel"], bevel=0.005)
        box(0.46, 0.025, 0.15, x, 0.79, z + 0.12, MAT["keyboard"], bevel=0.006)
        box(0.07, 0.025, 0.11, x + 0.36, 0.79, z + 0.12, MAT["keyboard"], bevel=0.01)
        box(0.25, 0.5, 0.5, x + 1.25, 0.25, z - 0.1, MAT["pc_case"], bevel=0.015)
        box(0.012, 0.42, 0.012, x + 1.12, 0.27, z + 0.15, LAMP_RGB[i])
        lathe([(0, 0), (0.04, 0), (0.045, 0.1), (0, 0.1)], x - 0.65, 0.775, z + 0.05, material(f"mug{i}", RGB[i], rough=0.4), 14)
        gaming_chair(x, z + 0.75, math.pi, i)
        i += 1
for lz in (-4.2, -0.8):
    for lx in (8.5, 12.5, 16.5):
        box(1.6, 0.04, 0.18, lx, 3.05, lz + 0.1, LAMP["work"], bevel=0.01)
        for dx in (-0.6, 0.6):
            cyl(0.004, 0.004, 0.5, lx + dx, 3.32, lz + 0.1, MAT["black"], 4)
potted_plant(5.3, 1.3, 1.2)
potted_plant(19.2, 1.2, 1.4)
potted_plant(5.3, -5.2, 1.3)

# =====================================================================
# LANTAI ATAS
# =====================================================================
LAYER = "U"
floor(-20, 20, -8.5, -6, MAT["oak"], UP + 0.005)
floor(-20, -9, -14, -8.5, MAT["carpet"], UP + 0.005)
floor(-9, 5.5, -14, -8.5, MAT["meet_carpet"], UP + 0.005)
floor(5.5, 20, -14, -8.5, MAT["walnut"], UP + 0.005)
for x1, x2 in ((-20, 1.5), (4.5, 20)):
    box(x2 - x1, 1.0, 0.03, (x1 + x2) / 2, UP + 0.5, -6.05, MAT["glass"])
    box(x2 - x1, 0.05, 0.08, (x1 + x2) / 2, UP + 1.02, -6.05, MAT["steel"], bevel=0.01)
    for px in np.arange(x1, x2 + 0.01, 2.0):
        box(0.04, 1.0, 0.04, px, UP + 0.5, -6.05, MAT["steel"])


def partition(x1, z1, x2, z2, gaps=()):
    horiz = z1 == z2
    length = (x2 - x1) if horiz else (z2 - z1)
    segs = [(0, length)]
    for a, b in gaps:
        nxt = []
        for s0, s1 in segs:
            if b <= s0 or a >= s1:
                nxt.append((s0, s1))
            else:
                nxt += [p for p in ((s0, a), (b, s1)) if p[1] - p[0] > 0.01]
        segs = nxt
    for a, b in segs:
        l, mid = b - a, a + (b - a) / 2
        px, pz = (x1 + mid, z1) if horiz else (x1, z1 + mid)
        w, d = (l, 0.12) if horiz else (0.12, l)
        box(w, 0.9, d, px, UP + 0.45, pz, MAT["slat"])
        box(w if horiz else 0.03, 1.9, 0.03 if horiz else d, px, UP + 1.85, pz, MAT["glass"])
        box(w if horiz else 0.07, 0.06, 0.07 if horiz else d, px, UP + 2.8, pz, MAT["steel"])
        n = max(1, round(l / 1.5))
        for k in range(n + 1):
            q = a + l * k / n
            qx, qz = (x1 + q, z1) if horiz else (x1, z1 + q)
            box(0.05, 1.9, 0.05, qx, UP + 1.85, qz, MAT["steel"])


partition(-20, -8.5, -9, -8.5, [(5.4, 6.6)])
partition(-9, -8.5, 5.5, -8.5, [(6.9, 8.1)])
partition(5.5, -8.5, 20, -8.5, [(6.9, 8.1)])
partition(-9, -14, -9, -8.5)
partition(5.5, -14, 5.5, -8.5)

# ---------- MUSHOLLA ----------
box(0.12, 2.9, 2.4, -19.9, UP + 1.45, -11.25, MAT["mihrab"])
bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=1.2, radius2=1.2, depth=0.12)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y < -1e-4], context='VERTS')
bmesh.ops.scale(bm, vec=(1, 0.5, 1), verts=bm.verts)
place(bm, -19.85, UP + 2.9, -11.25, ry=math.pi / 2, rx=math.pi / 2)
emit(bm, MAT["brass"], smooth=True)
for z in (-12.4, -10.1):
    box(0.12, 2.9, 0.1, -19.83, UP + 1.45, z, MAT["brass"])
for z in (-12.3, -10.2):
    box(0.04, 2.6, 0.04, -19.8, UP + 1.3, z, LAMP["mihrab"])
quad(3.2, 0.9, -14.5, UP + 2.6, -13.94, SIGN["musholla"], vertical=True, uv_full=True)
# dinding belakang lantai atas berlapis kayu (musholla & meeting), seperti referensi
box(25.6, 3.4, 0.04, -7.2, UP + 1.7, -13.975, MAT["slat"])


def sajadah(x, z):
    bm = bmesh.new()
    vs = [bm.verts.new(v) for v in ((-0.35, -0.6, 0), (0.35, -0.6, 0), (0.35, 0.6, 0), (-0.35, 0.6, 0))]
    face = bm.faces.new(vs)
    uv = bm.loops.layers.uv.verify()
    for l, c in zip(face.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        l[uv].uv = c
    place(bm, x, UP + 0.012, z, ry=math.pi / 2)
    emit(bm, MAT["sajadah"], uv_tile=0)


sajadah(-18.7, -11.25)
for z in (-11.7, -10.8):
    sajadah(-17.4, z)
for z in (-12.6, -11.75, -10.9, -10.05):
    sajadah(-15.9, z)
box(0.4, 1.0, 1.6, -9.4, UP + 0.5, -12.8, MAT["furn_wood"], bevel=0.015)
for k in range(6):
    box(0.22, 0.28, 0.06, -9.4, UP + 1.14, -13.4 + k * 0.22, MAT["quran1" if k % 2 else "quran2"], bevel=0.008)
box(1.4, 0.45, 0.35, -16.2, UP + 0.23, -6.6, MAT["light_wood"], bevel=0.015)

# ---------- MEETING ----------
box(6.2, 0.07, 1.7, -1.8, UP + 0.76, -11.6, MAT["furn_wood"], bevel=0.02)
for lx in (-3.8, 0.2):
    lathe([(0, 0), (0.32, 0), (0.3, 0.03), (0.12, 0.08), (0.12, 0.72), (0, 0.72)], lx, UP, -11.6, MAT["steel"])
for x in (-3.8, -1.8, 0.2):
    office_chair(x, UP, -12.85, 0)
    office_chair(x, UP, -10.35, math.pi)
office_chair(1.95, UP, -11.6, -math.pi / 2, MAT["leather"])
box(4, 2.2, 0.1, -1.8, UP + 1.75, -13.92, MAT["black"], bevel=0.02)
quad(3.85, 2.05, -1.8, UP + 1.75, -13.86, material("tv_meeting", "#ffffff", rough=0.3), name="tv_meeting", keep=True, vertical=True, uv_full=True)
box(0.4, 2.6, 2.6, -8.7, UP + 1.3, -11.3, MAT["slatdark"])
potted_plant(4.9, -13.4, 1.4, UP)
for px in (-3.8, -1.8, 0.2):
    pendant(px, -11.6, UP + 3.2, 0.9, 0.12)

# ---------- RUANG BOSS ----------
box(0.06, 3.6, 5.5, 20.0, UP + 1.9, -11.25, MAT["city_glass"])
box(14.5, 3.6, 0.06, 12.75, UP + 1.9, -13.95, MAT["city_glass"])
for x in np.arange(6, 20.1, 2.4):
    box(0.06, 3.6, 0.08, x, UP + 1.9, -13.92, MAT["steel"])
box(2.4, 0.07, 1.0, 14, UP + 0.77, -11.6, MAT["furn_wood"], bevel=0.02)
box(2.3, 0.72, 0.06, 14, UP + 0.38, -11.15, MAT["furn_wood"])
for sx in (-1.12, 1.12):
    box(0.06, 0.72, 0.9, 14 + sx, UP + 0.38, -11.6, MAT["furn_wood"])
box(1.0, 0.56, 0.04, 14, UP + 1.15, -11.9, MAT["black"], bevel=0.01)
quad(0.96, 0.52, 14, UP + 1.15, -11.875, material("owner_screen", "#ffffff", rough=0.3), name="owner_screen", keep=True, vertical=True, uv_full=True)
box(0.06, 0.3, 0.06, 14, UP + 0.95, -11.92, MAT["steel"])
office_chair(14, UP, -12.5, 0, MAT["leather"], 1.18)
box(0.45, 2.6, 3, 19.6, UP + 1.3, -9.9, MAT["furn_wood"])
for k in range(5):
    box(0.42, 0.03, 2.9, 19.58, UP + 0.2 + k * 0.48, -9.9, MAT["furn_wood"])
    for b in range(9):
        hgt = random.uniform(0.25, 0.36)
        box(0.24, hgt, random.uniform(0.06, 0.12), 19.45, UP + 0.22 + k * 0.48 + hgt / 2, -11.2 + b * 0.3, MAT[f"book{(k + b) % 4 + 1}"], bevel=0.005)
sofa(8.6, -12.9, 2.4, 0, MAT["boss_sofa"], 2, y=UP)
cyl(0.5, 0.5, 0.05, 8.6, UP + 0.4, -11.6, MAT["marble"], 32, bevel=0.01)
cyl(0.06, 0.06, 0.38, 8.6, UP + 0.19, -11.6, MAT["brass"], 12)
potted_plant(6.2, -13.4, 1.5, UP)
for px in (-11.5, -5, 8, 17):
    planter(px, -6.55, UP)
LAYER = "G"


# =====================================================================
# LUAR
# =====================================================================
floor(-9, 5, 2, 9.5, MAT["deck"], 0.01)
floor(5, 21.5, 2, 5, MAT["stone"], 0.008)
floor(5, 21.5, 12, 18.5, MAT["stone"], 0.008)
floor(5, 7, 5, 12, MAT["stone"], 0.008)
floor(19, 21.5, 5, 12, MAT["stone"], 0.008)
floor(-26.5, -20, -14.5, 2, MAT["concrete_dark"], 0.006)
floor(20, 21.5, -14.5, 2, MAT["stone"], 0.006)
floor(-26.5, 21.5, -16, -14, MAT["concrete_dark"], 0.004)
floor(-26.5, -9, 2, 18.5, MAT["stone_dark"], 0.006)
floor(-2.6, -1.4, 9.5, 18.5, MAT["stone"], 0.012)
# bangku taman
for bx in (-6, -2, 2.5):
    box(1.9, 0.07, 0.5, bx, 0.45, 7.75, MAT["deck"], bevel=0.01)
    box(1.9, 0.45, 0.06, bx, 0.75, 8.05, MAT["deck"], bevel=0.01, rx=-0.08)
    for dx in (-0.8, 0.8):
        box(0.07, 0.45, 0.45, bx + dx, 0.22, 7.8, MAT["steel"], bevel=0.01)
for px, pz in ((-8.3, 8.8), (4.3, 8.8), (-8.3, 2.7), (-5, 2.7)):
    planter(px, pz)
# kolam
box(12, 0.1, 7, 13, -1.45, 8.5, MAT["pool_floor"])
for args in ((12, 1.45, 0.1, 13, -0.72, 5.0), (12, 1.45, 0.1, 13, -0.72, 12.0), (0.1, 1.45, 7, 7.0, -0.72, 8.5), (0.1, 1.45, 7, 19.0, -0.72, 8.5)):
    box(*args, MAT["mosaic"])
for args in ((12.4, 0.07, 0.32, 13, 0.035, 4.85), (12.4, 0.07, 0.32, 13, 0.035, 12.15), (0.32, 0.07, 7.6, 6.85, 0.035, 8.5), (0.32, 0.07, 7.6, 19.15, 0.035, 8.5)):
    box(*args, MAT["white"], bevel=0.02)
quad(12, 7, 13, -0.1, 8.5, material("pool_water", "#2fa6d0", rough=0.05, alpha=0.85), name="pool_water", keep=True, uv_full=True)
for pz in (8.1, 8.9):
    cyl(0.022, 0.022, 1.3, 7.15, -0.1, pz, MAT["chrome"], 10)
    cyl(0.022, 0.022, 0.35, 7.0, 0.55, pz, MAT["chrome"], 10, rz=math.pi / 2)
# flamingo (objek sendiri, digoyang website)
bm = bmesh.new()
ring_seg, tube_seg, R, r = 32, 14, 0.55, 0.22
verts = []
for a in range(ring_seg):
    th = a / ring_seg * 2 * math.pi
    for b in range(tube_seg):
        ph = b / tube_seg * 2 * math.pi
        verts.append(bm.verts.new(((R + r * math.cos(ph)) * math.cos(th), (R + r * math.cos(ph)) * math.sin(th), r * math.sin(ph))))
for a in range(ring_seg):
    for b in range(tube_seg):
        i0 = a * tube_seg + b
        i1 = ((a + 1) % ring_seg) * tube_seg + b
        i2 = ((a + 1) % ring_seg) * tube_seg + (b + 1) % tube_seg
        i3 = a * tube_seg + (b + 1) % tube_seg
        bm.faces.new((verts[i0], verts[i1], verts[i2], verts[i3]))
# leher & kepala
pts = [(0.55, 0.1), (0.72, 0.5), (0.74, 0.85), (0.6, 1.05), (0.46, 0.98)]
prev = None
for k in range(len(pts) - 1):
    (x0, y0), (x1, y1) = pts[k], pts[k + 1]
    sub = bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=0.08, radius2=0.075, depth=math.hypot(x1 - x0, y1 - y0) + 0.04)
    ang = math.atan2(x1 - x0, y1 - y0)
    M = Matrix.Translation(((x0 + x1) / 2, 0, (y0 + y1) / 2)) @ Matrix.Rotation(ang, 4, 'Y')
    bmesh.ops.transform(bm, matrix=M, verts=sub["verts"])
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
flam = emit(bm, MAT["pink"], "flamingo", keep=True, smooth=True, uv_tile=0)
flam.location = T(15.5, -0.05, 8.6)
flam.rotation_euler = (0, 0, 0)
# kursi berjemur
for lx in (6.6, 9, 11.4, 13.8, 16.2, 18.4):
    for k in range(9):
        box(0.72, 0.03, 0.15, lx, 0.36, 13.7 + k * 0.17, MAT["light_wood"])
    box(0.66, 0.08, 1.15, lx, 0.41, 14.1, MAT["cushion"], bevel=0.035, segs=3)
    box(0.66, 0.08, 0.75, lx, 0.62, 15.3, MAT["cushion"], bevel=0.035, segs=3, rx=0.75)
    for dz in (13.75, 15.35):
        box(0.7, 0.3, 0.04, lx, 0.16, dz, MAT["steel"])
# payung
for ux, uz in ((10.2, 15.6), (15, 15.6)):
    cyl(0.03, 0.03, 2.5, ux, 1.25, uz, MAT["parasol_pole"], 10)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=8, radius1=1.45, radius2=0.04, depth=0.5)
    place(bm, ux, 2.35, uz)
    emit(bm, MAT["umbrella"], smooth=False)
box(16.5, 1.0, 0.03, 13.2, 0.5, 18.4, MAT["glass"])
box(0.03, 1.0, 16.5, 21.5, 0.5, 10.2, MAT["glass"])
for bxp, bzp in ((6, 4), (6, 13), (20.5, 4), (20.5, 13), (-9.4, 4), (-9.4, 17), (5.4, 17), (-26, 4), (-26, 17), (-1.4, 10), (-2.6, 14), (-1.4, 17)):
    cyl(0.07, 0.08, 0.7, bxp, 0.35, bzp, MAT["dark"], 14)
    cyl(0.065, 0.065, 0.06, bxp, 0.72, bzp, OUTDOOR["bollard"], 14)
# pagar kayu-besi
for fz in np.arange(-14.5, 18.4, 0.3):
    box(0.06, 1.6, 0.16, -26.6, 0.8, fz, MAT["fence"])
for fx in np.arange(-26.5, 21.5, 0.3):
    box(0.16, 1.6, 0.06, fx, 0.8, 18.6, MAT["fence"])
# gerbang + papan nama
box(3.4, 2.6, 0.7, -10.2, 1.3, 15.4, MAT["concrete_dark"], bevel=0.02)
quad(2.6, 0.8, -10.2, 1.5, 15.76, SIGN["zataa"], vertical=True, uv_full=True)
box(0.05, 2.3, 0.04, -11.75, 1.3, 15.77, OUTDOOR["strip"])
for px, pz in ((-14.5, 15.5), (-14.5, 12), (-20.5, 15.5), (-20.5, 12)):
    box(0.15, 2.8, 0.15, px, 1.4, pz, MAT["dark"])
for px in np.arange(-20.5, -14.39, 0.4):
    box(0.06, 0.12, 3.8, px, 2.85, 13.75, MAT["slatdark"])
# mobil
def car(cx, cz, ry):
    side = [(-2.3, 0.3), (2.3, 0.3), (2.35, 0.62), (2.2, 0.82), (1.4, 0.9), (0.75, 1.32), (0.1, 1.42), (-0.8, 1.38), (-1.7, 0.95), (-2.3, 0.88), (-2.35, 0.65)]
    bm = bmesh.new()
    vs = [bm.verts.new((px, -0.92, py)) for px, py in side]
    f = bm.faces.new(vs)
    ext = bmesh.ops.extrude_face_region(bm, geom=[f])
    bmesh.ops.translate(bm, vec=(0, 1.84, 0), verts=[e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.bevel(bm, geom=bm.edges[:], offset=0.05, segments=2, affect='EDGES', clamp_overlap=True)
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'Z'), verts=bm.verts)
    place(bm, cx, 0, cz, ry=ry)
    emit(bm, MAT["car_paint"], smooth=False)
    win = [(1.3, 0.95), (0.72, 1.28), (0.1, 1.37), (-0.75, 1.33), (-1.55, 0.97)]
    bm = bmesh.new()
    vs = [bm.verts.new((px, -0.95, py)) for px, py in win]
    f = bm.faces.new(vs)
    ext = bmesh.ops.extrude_face_region(bm, geom=[f])
    bmesh.ops.translate(bm, vec=(0, 1.9, 0), verts=[e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'Z'), verts=bm.verts)
    place(bm, cx, 0, cz, ry=ry)
    emit(bm, MAT["car_glass"])
    c, s = math.cos(ry), math.sin(ry)
    for wx, wz in ((-0.88, 1.45), (0.88, 1.45), (-0.88, -1.45), (0.88, -1.45)):
        px, pz = cx + wx * c + wz * s, cz - wx * s + wz * c
        cyl(0.34, 0.34, 0.26, px, 0.34, pz, MAT["black"], 24, ry=ry, rz=math.pi / 2)
        cyl(0.2, 0.2, 0.27, px, 0.34, pz, MAT["chrome"], 16, ry=ry, rz=math.pi / 2)
    for lx in (-0.6, 0.6):
        box(0.45, 0.07, 0.04, cx + lx * c + 2.38 * s, 0.7, cz - lx * s + 2.38 * c, OUTDOOR["head"], ry=ry)
    box(1.6, 0.06, 0.04, cx - 2.39 * s, 0.78, cz - 2.39 * c, OUTDOOR["tail"], ry=ry)
car(-17.5, 6.8, 0.25)
# pepohonan
for tx, tz in ((-24, 12), (-24, 6), (-6, 17.5), (3, 16.5), (21, 1), (21, 17.5), (-22, -16.5), (-10, -16.5), (4, -16.8), (16, -16.5), (23.5, -10), (-23, -6), (24, -2), (-30, 0), (28, 8), (-14, -20), (10, -20)):
    tree(tx, tz, random.uniform(3.8, 6.0))
for tx, tz in ((6.2, 3.2), (20.3, 3), (-8.6, 9.2), (4.5, 9.3), (-0.5, 2.6)):
    palm(tx, tz, random.uniform(3.4, 4.6))


# =====================================================================
# POLESAN: atap, tanaman, dekorasi, kolam
# =====================================================================
print("polesan...")
# rangka atap kayu di atas dinding
box(40.9, 0.28, 0.7, 0, 7.94, -14.1, MAT["slatdark"], bevel=0.02)
box(0.7, 0.28, 16.9, -20.1, 7.94, -6, MAT["slatdark"], bevel=0.02)
box(0.7, 0.28, 16.9, 20.1, 4.34, -6, MAT["slatdark"], bevel=0.02)
for gx in np.arange(-19.5, 20, 1.5):
    box(0.12, 0.18, 0.9, gx, 7.86, -13.6, MAT["slatdark"])


def hedge(x1, z1, x2, z2, h=0.9, w=0.6):
    L = math.hypot(x2 - x1, z2 - z1)
    ang = math.atan2(x2 - x1, z2 - z1)
    cx, cz = (x1 + x2) / 2, (z1 + z2) / 2
    box(w * 0.8, h * 0.85, L, cx, h * 0.42, cz, MAT["hedge"], ry=ang)
    n = int(L / 0.45)
    for k in range(n + 1):
        t = k / max(1, n)
        px, pz = x1 + (x2 - x1) * t, z1 + (z2 - z1) * t
        canopy(px, h * 0.62, pz, w * 0.55, h * 0.35, w * 0.55, MAT["foliage_dark" if k % 2 else "foliage"], cards=7, size=0.7)


hedge(-8.6, 18.0, -3.0, 18.0)
hedge(0.0, 18.0, 4.6, 18.0)
hedge(-26.0, -13.5, -26.0, 1.5, 1.1)
hedge(21.0, -13.5, 21.0, 1.0, 1.1)
hedge(-8.8, 10.0, -8.8, 17.6, 0.7, 0.5)
hedge(4.8, 10.0, 4.8, 17.6, 0.7, 0.5)

# dek kayu untuk area kursi berjemur + lampu LED tepi kolam
floor(5.4, 21.2, 13.0, 17.2, MAT["deck"], 0.014)
pool_led = material("outdoor_poolled", "#111111", emit="#56e0ff", emit_strength=2.2)
box(12, 0.03, 0.03, 13, -0.05, 5.06, pool_led)
box(12, 0.03, 0.03, 13, -0.05, 11.94, pool_led)
box(0.03, 0.03, 7, 7.06, -0.05, 8.5, pool_led)
box(0.03, 0.03, 7, 18.94, -0.05, 8.5, pool_led)
for sz in np.arange(5.6, 11.6, 1.2):
    cyl(0.06, 0.06, 0.02, 18.93, -0.6, sz, pool_led, 12, rz=math.pi / 2)


def frame(x, y, z, w, h, ry, palette):
    box(w + 0.08, h + 0.08, 0.04, x, y, z, MAT["black"], ry=ry, bevel=0.01)
    c, s = math.cos(ry), math.sin(ry)
    off = 0.022
    bx, bz = x + s * off, z + c * off
    quad(w, h, bx, y, bz, MAT["white"], ry=ry, vertical=True)
    # komposisi abstrak 3 bidang warna
    for k, (u, v, uw, vh) in enumerate(((-0.22, 0.12, 0.45, 0.5), (0.18, -0.05, 0.4, 0.75), (-0.05, -0.28, 0.75, 0.22))):
        px, pz = bx + c * u * w + s * 0.003 * (k + 1), bz - s * u * w + c * 0.003 * (k + 1)
        quad(uw * w, vh * h, px, y + v * h, pz, MAT[palette[k]], ry=ry, vertical=True)


frame(-19.95 + 0.05, 2.0, -1.6, 1.3, 0.95, math.pi / 2, ("art1", "art2", "art3"))
frame(-19.95 + 0.05, 2.0, 0.4, 1.0, 0.95, math.pi / 2, ("art3", "art1", "art2"))
LAYER = "U"
frame(5.68, UP + 1.7, -11.3, 1.4, 1.0, math.pi / 2, ("art2", "art3", "art1"))
frame(-8.78 + 0.25, UP + 1.6, -13.3, 0.9, 0.7, math.pi / 2, ("art1", "art3", "art2"))
quad(3.2, 2.0, 8.6, UP + 0.01, -11.9, MAT["rug"])
box(1.8, 0.75, 0.45, 3.9, UP + 0.37, -9.0, MAT["furn_wood"], bevel=0.015)
potted_plant(4.6, -9.0, 0.8, UP + 0.75)
for px in (-19.4, -9.6):
    potted_plant(px, -8.9, 1.2, UP, light=True)
LAYER = "G"

# hutan di sekitar lahan (memberi kedalaman seperti referensi)
placed = 0
while placed < 55:
    a = random.uniform(0, math.pi * 2)
    r = random.uniform(30, 52)
    tx, tz = math.cos(a) * r, math.sin(a) * r * 0.85
    if -30 < tx < 26 and -20 < tz < 22:
        continue
    h = random.uniform(5, 9)
    cyl(0.15 * h / 4, 0.25 * h / 4, h * 0.5, tx, h * 0.25, tz, MAT["trunk"], 8)
    canopy(tx, h * 0.7, tz, h * 0.3, h * 0.26, h * 0.3, MAT["foliage_dark"], cards=18, size=h * 0.38)
    placed += 1

# =====================================================================
# GABUNG per material + layer (sedikit draw call), lalu export
# =====================================================================
print("gabung...")
groups = {}
for o in list(SCENE.objects):
    if o.type != 'MESH' or o.get("keep"):
        continue
    key = (o.data.materials[0].name, o.get("layer", "G"))
    groups.setdefault(key, []).append(o)
for (mname, layer), objs in groups.items():
    if len(objs) > 1:
        with bpy.context.temp_override(active_object=objs[0], selected_editable_objects=objs, object=objs[0]):
            bpy.ops.object.join()
    objs[0].name = f"{'U_' if layer == 'U' else ''}{mname}"
upper = bpy.data.objects.new("UPPER", None)
SCENE.collection.objects.link(upper)
for o in SCENE.objects:
    if o.type == 'MESH' and o.get("layer") == "U":
        o.parent = upper
print("objek:", len([o for o in SCENE.objects if o.type == 'MESH']), "verts:", sum(len(o.data.vertices) for o in SCENE.objects if o.type == 'MESH'))


# =====================================================================
# PANGGANG BAYANGAN SUDUT (ambient occlusion) ke warna vertex — pakai Cycles
# =====================================================================
print("bake AO...")
SCENE.render.engine = 'CYCLES'
SCENE.cycles.samples = 48
SCENE.cycles.device = 'CPU'
if not SCENE.world:
    SCENE.world = bpy.data.worlds.new("bake")
SCENE.world.light_settings.distance = 1.4
see_through = lambda o: o.data.materials and o.data.materials[0].name.startswith(("glass", "city_glass", "sign_", "pool_water", "screen_", "lamp_", "outdoor_", "tv_meeting", "owner_screen"))
meshes = [o for o in SCENE.objects if o.type == 'MESH']
targets = [o for o in meshes if not see_through(o) and o.data.materials[0].name not in ("grass", "hedge", "leaf", "leaf2", "leaf_dark", "palm", "foliage", "foliage_dark")]
for o in meshes:
    o.hide_render = see_through(o)
for o in targets:
    attr = o.data.color_attributes.new("AO", 'FLOAT_COLOR', 'CORNER')  # linear, tanpa konversi sRGB
    o.data.color_attributes.active_color = attr
    o.data.color_attributes.render_color_index = o.data.color_attributes.active_color_index
bpy.ops.object.select_all(action='DESELECT')
for o in targets:
    o.select_set(True)
bpy.context.view_layer.objects.active = targets[0]
bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
# angkat sedikit supaya sudut gelap natural, bukan hitam pekat
for o in targets:
    attr = o.data.color_attributes["AO"]
    buf = np.empty(len(attr.data) * 4, dtype=np.float32)
    attr.data.foreach_get("color", buf)
    c = buf.reshape(-1, 4)
    c[:, :3] = 0.5 + 0.5 * np.clip(c[:, :3], 0, 1) ** 0.8  # pengali linear 0.5–1.0
    c[:, 3] = 1
    attr.data.foreach_set("color", c.ravel())
for o in meshes:
    o.hide_render = False
bpy.ops.object.select_all(action='DESELECT')

# tekstur maksimal 1024
for img in bpy.data.images:
    if img.size[0] > 1024:
        img.scale(1024, 1024)

bpy.ops.export_scene.gltf(
    filepath=OUT, export_format='GLB', export_image_format='WEBP', export_image_quality=85,
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
    export_yup=True, export_apply=True, export_animations=False, export_extras=False,
    export_vertex_color='ACTIVE',
)
print("EXPORT", OUT)

if PREVIEW:
    sc = SCENE
    sc.render.engine = 'BLENDER_EEVEE'
    sc.view_settings.view_transform = 'AgX'
    sc.render.resolution_x, sc.render.resolution_y = 1600, 1000
    world = bpy.data.worlds.new("w")
    sc.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.55, 0.7, 0.9, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.8
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", 'SUN'))
    sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(50), 0, math.radians(-40))
    sc.collection.objects.link(sun)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    cam.location = T(-6, 30, 42)
    cam.data.lens = 40
    cam.rotation_euler = (T(0, 1.5, -1) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam
    sc.render.filepath = PREVIEW
    bpy.ops.render.render(write_still=True)
    print("PREVIEW", PREVIEW)
