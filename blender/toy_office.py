# Render ulang gedung kantor (geometri persis dari docs/js/px/scene.js, lewat blender/export_scene.mjs)
# dengan gaya 3D mainan + kamera ortografis yang identik dengan web, opsional dengan karakter toy.
#   blender --background --factory-startup --python blender/toy_office.py -- <scene.json> <out.png> [samples] [scale] [day|night] [chars]
#   chars: "id@x,y,z,yaw;..." (koordinat dunia web; y = tinggi lantai) · border: "x0,y0,x1,y1" piksel layar web (crop)
import bpy, bmesh, sys, os, json, math, random
from math import radians
from mathutils import Vector, Matrix
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import toy_lib as TL

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = argv[0], argv[1]
SAMPLES = int(argv[2]) if len(argv) > 2 else 64
SCALE = float(argv[3]) if len(argv) > 3 else 1.0
MODE = argv[4] if len(argv) > 4 else 'day'
CHARS = argv[5] if len(argv) > 5 else ''
BORDER = [float(v) for v in argv[6].split(',')] if len(argv) > 6 and argv[6] else None

D = json.load(open(SRC, encoding='utf-8'))
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
scene = bpy.context.scene
COLL = scene.collection
TL.setup(COLL)
B = lambda p: Vector((p[0], -p[2], p[1]))   # dunia web (x, y-atas, z) → Blender

# ---------------------------------------------------------------- palet gaya chibi (samain sama karakter: hitam-ungu-putih Zataa, bahan lembut ala Pixar)
CHIBI = TL.STYLE == 'chibi'
PAL = {
    'plaster': '#ece8f2', 'dark': '#1d1a24', 'slab': '#2b2733', 'ledge': '#6f6878', 'ledgeDark': '#4a4452', 'rubble': '#8a8394', 'stone': '#c9c3d2',
    'slat': '#c0926a', 'tread': '#a87b57', 'deck': '#c29066', 'lightwood': '#d8b28a', 'walnut': '#6b4a37', 'furn': '#6b4a37', 'oak': '#c49a6c',
    'slatdark': '#3a2a24', 'trunk': '#6e4c36', 'palmTrunk': '#94704f',
    'grass': '#63b54a', 'grassDark': '#4f9e3d', 'foliage': '#5cb84a', 'foliageDark': '#3f9440', 'foliageLight': '#82cf5e', 'hedge': '#4a9e42', 'palm': '#6cc04c',
    'glass': '#d9e6ff', 'glassRail': '#e2ecff', 'black': '#141217', 'leather': '#1d1a22', 'steel': '#9a96a6', 'chrome': '#d2d0dc',
    'sofa': '#3d2f70', 'navy': '#1f1c33', 'rug': '#2c2550', 'meetCarpet': '#2f2a48', 'cineCarpet': '#241c38', 'cineWall': '#1e1729',
    'ytCarpet': '#2a2130', 'trdCarpet': '#1f2632', 'workwood': '#4f3f58', 'rack': '#18161e', 'pot': '#2d2934', 'potLight': '#e6e1ee',
    'white': '#f4f2f8', 'marble': '#efebf3', 'fridge': '#e2e0ea', 'poolEdge': '#f3f0f6', 'cushion': '#f4f1f7', 'umbrella': '#f6f3fa',
}
MOOD = os.environ.get('OFFICE_MOOD', 'senja')   # cerah | studio | senja (dipilih Owner 25 Okt: senja)
if CHIBI and MOOD == 'studio':   # studio ungu: dinding & lantai gelap, aksen LED (kayak latar character sheet)
    PAL.update({'plaster': '#2e2938', 'slat': '#5c4a3e', 'tread': '#4f3f35', 'deck': '#6b5444', 'lightwood': '#7a6352', 'ledge': '#3a3444',
                'ledgeDark': '#2a2533', 'white': '#d9d4e2', 'marble': '#cfc9da', 'glass': '#b9a8ff', 'glassRail': '#c8bbff'})
# ---------------------------------------------------------------- tema kantor (blender/office_themes.py; dipilih dari web)
from office_themes import THEMES, NIGHT_SKY
THEME = os.environ.get('OFFICE_THEME', 'vanilla')
TH = THEMES[THEME] if CHIBI else None
if TH:
    MOOD = 'theme'
    lf = TH['leaf']
    PAL.update({'foliage': lf[1], 'foliageLight': lf[2], 'foliageDark': lf[0], 'palm': lf[1]})
    PAL.update(TH['pal'])
# ---------------------------------------------------------------- material gaya mainan
WOOD = {'walnut', 'oak', 'workwood', 'tread', 'lightwood', 'slat', 'slatdark', 'slatdarkH', 'furn', 'trunk', 'deck'}
GRASS = {'grass', 'grassDark'}
FOLIAGE = {'foliage', 'foliageDark', 'foliageLight'}
def node_mat(name, info):
    if CHIBI and name in PAL: info = {**info, 'color': PAL[name]}
    m = bpy.data.materials.new('o_' + name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']; L = nt.links.new
    col = TL.hexc(info['color'])
    TL.setin(b, 'Base Color', col); TL.setin(b, 'Roughness', 0.55 if not CHIBI else 0.62)
    if CHIBI: TL.setin(b, ['Sheen Weight'], 0.15); TL.setin(b, ['Coat Weight'], 0.08)
    # tepi membulat (kesan mainan) tanpa mengubah geometri
    bev = nt.nodes.new('ShaderNodeBevel'); bev.samples = 8 if CHIBI else 6; bev.inputs['Radius'].default_value = 0.06 if CHIBI else 0.035
    L(bev.outputs['Normal'], b.inputs['Normal'])
    if name in WOOD:
        tc = nt.nodes.new('ShaderNodeTexCoord'); br = nt.nodes.new('ShaderNodeTexBrick')
        br.inputs['Color1'].default_value = col; br.inputs['Color2'].default_value = TL.hexc(TL.shade(info['color'], -0.08))
        br.inputs['Mortar'].default_value = TL.hexc(TL.shade(info['color'], -0.3 if not CHIBI else -0.18)); br.inputs['Scale'].default_value = 0.9
        br.inputs['Mortar Size'].default_value = 0.012; br.inputs['Brick Width'].default_value = 2.2; br.inputs['Row Height'].default_value = 0.42
        L(tc.outputs['Object'], br.inputs['Vector']); L(br.outputs['Color'], b.inputs['Base Color'])
        TL.setin(b, ['Coat Weight'], 0.15)
    elif name in ('rubble', 'ledge', 'ledgeDark') or (TH and name in TH.get('stone', ())):   # dinding batu: blok batu tak rata
        tc = nt.nodes.new('ShaderNodeTexCoord'); br = nt.nodes.new('ShaderNodeTexBrick')
        br.inputs['Color1'].default_value = col; br.inputs['Color2'].default_value = TL.hexc(TL.shade(info['color'], -0.18))
        br.inputs['Mortar'].default_value = TL.hexc(TL.shade(info['color'], -0.45)); br.inputs['Scale'].default_value = 1.6
        br.inputs['Mortar Size'].default_value = 0.025; br.inputs['Brick Width'].default_value = 0.9; br.inputs['Row Height'].default_value = 0.45
        br.inputs['Bias'].default_value = 0.2
        L(tc.outputs['Object'], br.inputs['Vector']); L(br.outputs['Color'], b.inputs['Base Color']); TL.setin(b, 'Roughness', 0.9)
        bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.4; L(br.outputs['Fac'], bump.inputs['Height']); L(bump.outputs['Normal'], b.inputs['Normal'])
    elif name in GRASS:
        nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 0.6 if not CHIBI else 2.2
        ramp = nt.nodes.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].color = TL.hexc('#5aa043' if not CHIBI else TH['grass'][0] if TH else '#5cae45')
        ramp.color_ramp.elements[1].color = TL.hexc('#79bd52' if not CHIBI else TH['grass'][1] if TH else '#86cf5c')
        L(nz.outputs['Fac'], ramp.inputs['Fac']); L(ramp.outputs['Color'], b.inputs['Base Color']); TL.setin(b, 'Roughness', 0.85)
    elif name in FOLIAGE or info.get('leafy'):
        TL.setin(b, 'Roughness', 0.45); TL.setin(b, ['Subsurface Weight'], 0.15); TL.setin(b, ['Coat Weight'], 0.2)
    if TH and name in TH.get('gloss', ()):   # permukaan mengkilap (futuristik)
        TL.setin(b, 'Roughness', 0.12); TL.setin(b, ['Coat Weight'], 0.7); TL.setin(b, ['Coat Roughness'], 0.05)
    if info.get('glass'):
        TL.setin(b, ['Transmission Weight', 'Transmission'], 0.85); TL.setin(b, 'Roughness', 0.05); TL.setin(b, 'IOR', 1.45)
        TL.setin(b, 'Alpha', 0.55)
    if info.get('emissive') or name.startswith(('lamp', 'bulb', 'candle', 'rgb')):
        TL.setin(b, ['Emission Color', 'Emission'], col)
        TL.setin(b, 'Emission Strength', (6.0 if MODE == 'night' or (CHIBI and MOOD == 'studio') else 2.5) * (TH['emit'] if TH else 1))
    if name == 'water':   # air beneran: tembus pandang, riak halus, warna kolam dari dasar mosaik
        for n in list(nt.nodes):
            if n.type == 'BEVEL': nt.nodes.remove(n)
        TL.setin(b, 'Base Color', TL.hexc('#7fd8ee')); TL.setin(b, ['Transmission Weight', 'Transmission'], 1.0)
        TL.setin(b, 'Roughness', 0.02); TL.setin(b, 'IOR', 1.33); TL.setin(b, ['Emission Strength'], 0.0)
        tc = nt.nodes.new('ShaderNodeTexCoord'); wv = nt.nodes.new('ShaderNodeTexNoise'); wv.inputs['Scale'].default_value = 1.6
        wv.inputs['Detail'].default_value = 3; bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.35; bump.inputs['Distance'].default_value = 0.05
        L(tc.outputs['Object'], wv.inputs['Vector']); L(wv.outputs['Fac'], bump.inputs['Height']); L(bump.outputs['Normal'], b.inputs['Normal'])
        return m
    if name == 'mosaic':  # dasar & dinding kolam: ubin biru + pola kilau cahaya (kaustik)
        tc = nt.nodes.new('ShaderNodeTexCoord'); br = nt.nodes.new('ShaderNodeTexBrick')
        br.inputs['Color1'].default_value = TL.hexc('#2b9fc9'); br.inputs['Color2'].default_value = TL.hexc('#38b3d9')
        br.inputs['Mortar'].default_value = TL.hexc('#d8f1f8'); br.inputs['Scale'].default_value = 4.0
        br.inputs['Mortar Size'].default_value = 0.02; br.inputs['Brick Width'].default_value = 0.5; br.inputs['Row Height'].default_value = 0.25; br.offset = 0
        L(tc.outputs['Object'], br.inputs['Vector']); L(br.outputs['Color'], b.inputs['Base Color'])
        vo = nt.nodes.new('ShaderNodeTexVoronoi'); vo.feature = 'DISTANCE_TO_EDGE'; vo.inputs['Scale'].default_value = 1.4
        mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1.0, 1.4, 1.0); L(tc.outputs['Object'], mp.inputs['Vector']); L(mp.outputs['Vector'], vo.inputs['Vector'])
        rp = nt.nodes.new('ShaderNodeValToRGB'); rp.color_ramp.elements[0].position = 0.0; rp.color_ramp.elements[0].color = (1, 1, 1, 1)
        rp.color_ramp.elements[1].position = 0.06; rp.color_ramp.elements[1].color = (0, 0, 0, 1)
        L(vo.outputs['Distance'], rp.inputs['Fac'])
        TL.setin(b, ['Emission Color', 'Emission'], TL.hexc('#e8fbff')); L(rp.outputs['Color'], b.inputs['Emission Strength'] if False else b.inputs['Emission Color'])
        TL.setin(b, 'Emission Strength', 0.9 if MODE != 'night' else 1.4)
        TL.setin(b, 'Roughness', 0.25); TL.setin(b, ['Coat Weight'], 0.5)
        return m
    if name.startswith('scr') or name.startswith('tv') or name in ('ticker', 'cinema', 'racks'):
        TL.setin(b, ['Emission Color', 'Emission'], TL.hexc('#5b3fb8')); TL.setin(b, 'Emission Strength', 1.5)
        TL.setin(b, ['Coat Weight'], 1.0); TL.setin(b, 'Roughness', 0.15)
    return m

MATS = {k: node_mat(k, v) for k, v in D['mats'].items()}

# ---------------------------------------------------------------- pohon chibi: batang kotak + bola (kayak permen) diganti pohon rimbun
TREES, SKIP = [], set()
if CHIBI:
    cl = []   # kelompokkan sisi-sisi kotak batang per pohon (pusat xz berdekatan)
    for i, pr in enumerate(D['prims']):
        if pr[1] != 'trunk' or pr[0] != 'p': continue
        cx = sum(p[0] for p in pr[2]) / len(pr[2]); cz = sum(p[2] for p in pr[2]) / len(pr[2])
        for g in cl:
            if math.hypot(g['x'] - cx, g['z'] - cz) < 0.36: g['i'].append(i); break
        else: cl.append(dict(x=cx, z=cz, i=[i]))
    fol = [(i, pr) for i, pr in enumerate(D['prims']) if pr[0] == 'e' and pr[1] in FOLIAGE]
    for g in cl:
        pts = [p for i in g['i'] for p in D['prims'][i][2]]
        x = sum(p[0] for p in pts) / len(pts); z = sum(p[2] for p in pts) / len(pts)
        y0, y1 = min(p[1] for p in pts), max(p[1] for p in pts)
        crowns = [(i, pr) for i, pr in fol if math.hypot(pr[2][0] - x, pr[2][2] - z) < 1.3 and y1 - 0.4 < pr[2][1] < y1 + 3]
        if not crowns or len(g['i']) < 4: continue
        SKIP.update(g['i']); SKIP.update(i for i, _ in crowns)
        TREES.append((x, z, y0, y1, [pr for _, pr in crowns]))

PALMS = []   # palem di jalan taman (scene.js: palm() di x -2.2 / 4.0, z 8..26): daun pipih melingkar kayak payung → diganti
if CHIBI:
    for px_ in (-2.2, 4.0):
        for pz_ in (8, 14, 20, 26):
            tr = [i for i, pr in enumerate(D['prims']) if pr[1] == 'palmTrunk' and pr[0] == 'p'
                  and math.hypot(sum(p[0] for p in pr[2]) / len(pr[2]) - (px_ + 0.12), sum(p[2] for p in pr[2]) / len(pr[2]) - pz_) < 0.5]
            if not tr: continue
            y0 = min(p[1] for i in tr for p in D['prims'][i][2]); y1 = max(p[1] for i in tr for p in D['prims'][i][2])
            lv = [i for i, pr in enumerate(D['prims']) if pr[0] == 'e' and pr[1] in ('palm', 'foliageLight')
                  and math.hypot(pr[2][0] - (px_ + 0.3), pr[2][2] - pz_) < 1.6 and pr[2][1] > y1 - 0.6]
            SKIP.update(tr); SKIP.update(lv)
            PALMS.append((px_, pz_, y0, y1))

# ---------------------------------------------------------------- geometri: semua poligon per material jadi satu mesh
by = {}
for i, pr in enumerate(D['prims']):
    if i in SKIP: continue
    by.setdefault(pr[1], []).append(pr)
# bola satuan sekali saja, lalu semua bentuk per material digabung lewat from_pydata (cepat, tanpa bmesh raksasa)
_bm = bmesh.new(); bmesh.ops.create_uvsphere(_bm, u_segments=24, v_segments=16, radius=1.0)
SPH_V = [tuple(v.co) for v in _bm.verts]; SPH_F = [[v.index for v in f.verts] for f in _bm.faces]; _bm.free()
for name, items in by.items():
    verts, faces = [], []
    for pr in items:
        if pr[0] == 'p':
            if len(pr[2]) >= 3:
                o = len(verts); verts += [tuple(B(p)) for p in pr[2]]; faces.append(list(range(o, o + len(pr[2]))))
        else:
            c, r = pr[2], pr[3]
            if CHIBI and name == 'hedge': r = [r[0] * 1.35, r[1] * 1.05, r[2] * 1.35]   # pagar tanaman menyatu, bukan deret bola
            parts = [(c, r)]
            if CHIBI and name in ('flower', 'flower2'):   # bunga: gerombolan kuntum kecil, bukan bola permen
                parts = [((c[0] + math.cos(k * 2.1) * r[0] * 0.5, c[1] + r[1] * (0.15 if k % 2 else -0.05), c[2] + math.sin(k * 2.1) * r[2] * 0.5),
                          [v * 0.45 for v in r]) for k in range(5)]
            for c, r in parts:
                o = len(verts)
                verts += [tuple(B((c[0] + x * r[0], c[1] + z * r[1], c[2] - y * r[2]))) for x, y, z in SPH_V]
                faces += [[o + i for i in f] for f in SPH_F]
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.validate()
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = any(pr[0] == 'e' for pr in items[:1])
    ob = bpy.data.objects.new('o_' + name, me); COLL.objects.link(ob); me.materials.append(MATS[name])
    if name in FOLIAGE or (CHIBI and name == 'hedge'):
        sub = ob.modifiers.new('sub', 'SUBSURF'); sub.levels = 1; sub.render_levels = 1
        if CHIBI:   # permukaan daun bergelombang (bukan bola licin)
            tx = bpy.data.textures.new('leafbump', 'CLOUDS'); tx.noise_scale = 0.22; tx.noise_depth = 2
            dm = ob.modifiers.new('leaf', 'DISPLACE'); dm.texture = tx; dm.texture_coords = 'GLOBAL'; dm.strength = 0.045; dm.mid_level = 0.5
    elif CHIBI and items[0][0] == 'p' and name != 'water':   # tepi kotak dibulatkan beneran (figurine), bukan cuma efek shader
        for p in me.polygons: p.use_smooth = True
        try: me.set_sharp_from_angle(angle=radians(40))
        except Exception: pass
        bv = ob.modifiers.new('bev', 'BEVEL'); bv.width = 0.035; bv.segments = 3; bv.profile = 0.6
        bv.limit_method = 'ANGLE'; bv.angle_limit = radians(40); bv.use_clamp_overlap = True; bv.harden_normals = False

def leaf_mat():
    m = bpy.data.materials.new('o_treeleaf'); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']; L = nt.links.new
    tc = nt.nodes.new('ShaderNodeTexCoord'); nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 0.9; nz.inputs['Detail'].default_value = 4
    L(tc.outputs['Object'], nz.inputs['Vector'])
    rp = nt.nodes.new('ShaderNodeValToRGB'); E = rp.color_ramp.elements
    LF = TH['leaf'] if TH else ('#3a8536', '#5aac45', '#86cc5a')
    E[0].position = 0.3; E[0].color = TL.hexc(LF[0]); E[1].position = 0.72; E[1].color = TL.hexc(LF[2])
    mid = E.new(0.5); mid.color = TL.hexc(LF[1])
    ao = nt.nodes.new('ShaderNodeAmbientOcclusion'); ao.inputs['Distance'].default_value = 0.6; ao.samples = 8
    L(nz.outputs['Fac'], rp.inputs['Fac']); L(rp.outputs['Color'], ao.inputs['Color'])
    mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'
    L(ao.outputs['AO'], mx.inputs['Factor']); L(rp.outputs['Color'], mx.inputs[6]); mx.inputs[7].default_value = TL.hexc('#244d22')
    inv = nt.nodes.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1.0; L(ao.outputs['AO'], inv.inputs[1])
    L(inv.outputs[0], mx.inputs['Factor']); L(mx.outputs[2], b.inputs['Base Color'])
    TL.setin(b, 'Roughness', 0.6); TL.setin(b, ['Subsurface Weight'], 0.12); TL.setin(b, ['Sheen Weight'], 0.35)
    return m

def build_trees():   # kanopi = gerombolan gumpalan daun (mengisi volume bola asli), batang meruncing + akar + cabang
    if not TREES: return
    _b = bmesh.new(); bmesh.ops.create_uvsphere(_b, u_segments=20, v_segments=14, radius=1.0)
    SV = [tuple(v.co) for v in _b.verts]; SF = [[v.index for v in f.verts] for f in _b.faces]; _b.free()
    verts, faces = [], []
    def blob(c, r):
        o = len(verts); verts.extend(tuple(B((c[0] + x * r[0], c[1] + z * r[1], c[2] - y * r[2]))) for x, y, z in SV)
        faces.extend([o + i for i in f] for f in SF)
    bark = TL.mat('bark', '#6e4c36', 0.8, sheen=0.2)
    for x, z, y0, y1, crowns in TREES:
        rnd = random.Random(int(x * 97 + z * 13))
        mc = max(crowns, key=lambda p: p[3][0]); c = Vector(mc[2]); ts = TH.get('tree_scale', 1.0) if TH else 1.0; r, ry = mc[3][0] * ts, mc[3][1] * ts
        for pr in crowns: blob(pr[2], [v * 0.8 for v in pr[3]])   # inti
        for k in range(7):   # gumpalan besar di permukaan (kanopi menggembung lembut)
            a = k / 7 * 2 * math.pi + rnd.uniform(-0.3, 0.3); e = rnd.uniform(-0.25, 0.75)
            d = (math.cos(a) * math.cos(e), math.sin(e), math.sin(a) * math.cos(e))
            br = r * rnd.uniform(0.52, 0.62)
            blob((c.x + d[0] * r * 0.55, c.y + d[1] * ry * 0.5, c.z + d[2] * r * 0.55), (br, br * 0.85, br))
        blob((c.x, c.y + ry * 0.45, c.z), (r * 0.6, ry * 0.55, r * 0.6))
        top = Vector((x + rnd.uniform(-0.08, 0.08), c.y - ry * 0.15, z + rnd.uniform(-0.08, 0.08)))
        TL.capsule('trunk', B((x, y0 - 0.05, z)), B(top), 0.22, bark, None, r2=0.11)
        TL.ellipsoid('root', B((x, y0 + 0.06, z)), (0.36, 0.36, 0.14), bark, None)
        for k in range(2):   # cabang ke dalam kanopi
            a = rnd.uniform(0, 2 * math.pi); s0 = B((x, y0 + (top.y - y0) * 0.6, z))
            TL.capsule('branch', s0, B((x + math.cos(a) * r * 0.45, c.y - ry * 0.05, z + math.sin(a) * r * 0.45)), 0.07, bark, None, r2=0.035)
    me = bpy.data.meshes.new('treeleaf'); me.from_pydata(verts, [], faces); me.validate()
    for p in me.polygons: p.use_smooth = True
    ob = bpy.data.objects.new('o_treeleaf', me); COLL.objects.link(ob); me.materials.append(leaf_mat())
    sub = ob.modifiers.new('sub', 'SUBSURF'); sub.levels = 1; sub.render_levels = 2
    tx = bpy.data.textures.new('leafbump2', 'CLOUDS'); tx.noise_scale = 0.28; tx.noise_depth = 2
    dm = ob.modifiers.new('leaf', 'DISPLACE'); dm.texture = tx; dm.texture_coords = 'GLOBAL'; dm.strength = 0.05; dm.mid_level = 0.5
build_trees()

def build_palms():   # batang melengkung bersegmen + pelepah panjang melengkung terkulai + kelapa
    if not PALMS: return
    bark = TL.mat('palmbark', '#9a7550', 0.75, sheen=0.2); ring = TL.mat('palmring', '#7d5c3e', 0.8)
    fr = bpy.data.materials.new('o_frond'); fr.use_nodes = True; nt = fr.node_tree; b = nt.nodes['Principled BSDF']; L = nt.links.new
    gc = nt.nodes.new('ShaderNodeTexCoord'); gr = nt.nodes.new('ShaderNodeTexGradient'); rp = nt.nodes.new('ShaderNodeValToRGB')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ'); L(gc.outputs['UV'], sep.inputs[0])
    rp.color_ramp.elements[0].color = TL.hexc('#3f8f36'); rp.color_ramp.elements[1].color = TL.hexc('#7cc653')
    TL.setin(b, 'Base Color', TL.hexc(TH['leaf'][1] if TH else '#5cae45')); TL.setin(b, 'Roughness', 0.55); TL.setin(b, ['Subsurface Weight'], 0.15); TL.setin(b, ['Sheen Weight'], 0.3)
    coco = TL.mat('coconut', '#6b4a2e', 0.6, coat=0.2)
    for x, z, y0, y1 in PALMS:
        rnd = random.Random(int(x * 31 + z * 7))
        lean = Vector((0.35, 0, rnd.uniform(-0.12, 0.12)))   # condong (scene.js: tiap segmen geser +0.06 x)
        top = Vector((x + 0.3, y1 + 0.05, z)) + Vector((0, 0, lean.z))
        base = Vector((x, y0, z))
        n = 9; pts = []
        for k in range(n + 1):   # batang melengkung (kurva kuadrat ke arah condong)
            t = k / n
            pts.append(base.lerp(top, t) + Vector((-0.18 * math.sin(math.pi * t), 0, 0)))
        for k in range(n):
            r0 = 0.17 - 0.06 * k / n
            TL.capsule('palmtrunk', B(pts[k]), B(pts[k + 1]), r0, bark, None, r2=r0 - 0.008)
            TL.torus('palmring', B(pts[k + 1]), B(pts[k + 1]) - B(pts[k]), r0 - 0.004, 0.022, ring, None)
        TL.ellipsoid('palmcrown', B(top), (0.2, 0.2, 0.16), bark, None)
        for k in range(3):
            a = k * 2.1 + rnd.uniform(-0.3, 0.3)
            TL.ellipsoid('coconut', B(top + Vector((math.cos(a) * 0.16, -0.12, math.sin(a) * 0.16))), (0.1, 0.1, 0.1), coco, None)
        nf = 12
        for k in range(nf):   # pelepah: naik sedikit lalu melengkung jauh & terkulai
            a = k / nf * 2 * math.pi + rnd.uniform(-0.2, 0.2)
            d = Vector((math.cos(a), 0, math.sin(a))); up = Vector((0, 1, 0))
            ln = rnd.uniform(1.25, 1.55); lift = rnd.uniform(0.1, 0.35)
            fp = [top, top + d * 0.35 * ln + up * (0.18 + lift), top + d * 0.75 * ln + up * (0.12 + lift * 0.6),
                  top + d * 1.05 * ln - up * 0.15, top + d * 1.2 * ln - up * 0.55]
            TL.strand([B(v) for v in fp], 0.27, 0.028, fr, None, center=B(top - up * 1.2), n=28, k=8, root=0.25, wave=0.012, freq=6, phase=a)
build_palms()

if TH:   # properti khas tema (obor, sulur, neon, lampion, bendera segitiga, menara istana)
    from office_props import add_props
    add_props(THEME, dict(D=D, TL=TL, B=B, COLL=COLL, MODE=MODE, TREES=TREES, PALMS=PALMS, POOL=D.get('pool')))

# ---------------------------------------------------------------- isi kolam: pelampung donat, bola pantai, pelampung kasur
PL = D['pool']; PX = lambda u: PL['x0'] + (PL['x1'] - PL['x0']) * u; PZ = lambda v: PL['z0'] + (PL['z1'] - PL['z0']) * v
def pool_props():
    don = TL.mat('donut', '#ff7eb6', 0.25, coat=0.8); don2 = TL.mat('donut2', '#ffffff', 0.25, coat=0.8)
    dx, dz = PX(0.18), PZ(0.3)
    t = TL.torus('donut', B((dx, -0.03, dz)), (0, 0, 1), 0.42, 0.17, don, None)
    for i in range(6):   # garis putih di donat
        a = i * math.pi / 3
        TL.ellipsoid('stripe', B((dx + math.cos(a) * 0.42, 0.0, dz + math.sin(a) * 0.42)), (0.08, 0.08, 0.175), don2, None)
    t2 = TL.torus('ring', B((PX(0.75), -0.03, PZ(0.55)), ), (0, 0, 1), 0.36, 0.14, TL.mat('ring', '#ffd166', 0.25, coat=0.8), None)
    cols = ['#ef476f', '#ffffff', '#118ab2', '#ffd166', '#ffffff', '#06d6a0']
    for i, c in enumerate(cols):   # bola pantai (6 segmen)
        b_ = TL.ellipsoid('ball', B((PX(0.6), 0.12, PZ(0.2))), (0.26, 0.26, 0.26), TL.mat('ball' + str(i), c, 0.3, coat=0.7), None)
        bpy.context.view_layer.objects.active = b_
        bm = bmesh.new(); bm.from_mesh(b_.data)
        a0, a1 = i * math.pi / 3, (i + 1) * math.pi / 3
        kill = [v for v in bm.verts if not (a0 <= (math.atan2(v.co.y, v.co.x) % (2 * math.pi)) < a1 + 1e-6)]
        bmesh.ops.delete(bm, geom=kill, context='VERTS'); bm.to_mesh(b_.data); bm.free()
    TL.rbox('mat', B((PX(0.4), -0.04, PZ(0.7))), (1.9, 0.75, 0.12), TL.mat('airmat', '#7c3aed', 0.3, coat=0.8), 0.06, rot=Matrix.Rotation(radians(18), 4, 'Z').to_quaternion())
    TL.rbox('matpillow', B((PX(0.4), -0.04, PZ(0.7))) + Matrix.Rotation(radians(18), 4, 'Z') @ Vector((0.75, 0, 0.07)), (0.3, 0.68, 0.1), TL.mat('airmat2', '#a78bfa', 0.3, coat=0.8), 0.05,
            rot=Matrix.Rotation(radians(18), 4, 'Z').to_quaternion())
pool_props()

# ---------------------------------------------------------------- karakter toy (opsional)
for spec in [c for c in CHARS.split(';') if c]:
    cid, pos = spec.split('@'); x, y, z, yaw = [float(v) for v in pos.split(',')]
    root = TL.build(cid, (0, 0, 0), 0)
    s = root.scale[0] * 1.5
    root.scale = (s, s, s)
    root.location = B((x, y, z))
    root.rotation_euler = (0, 0, radians(yaw))

# ---------------------------------------------------------------- kamera identik dengan web
cam = D['camera']
right, down, view = B(cam['right']), B(cam['down']), B(cam['view'])
up = -down
cd = bpy.data.cameras.new('cam'); cd.type = 'ORTHO'; cd.ortho_scale = cam['orthoW']; cd.clip_end = 400
co = bpy.data.objects.new('cam', cd); COLL.objects.link(co)
M3 = Matrix((right, up, view.normalized())).transposed()
co.matrix_world = Matrix.Translation(B(cam['center']) + view.normalized() * 150) @ M3.to_4x4()
scene.camera = co

# ---------------------------------------------------------------- cahaya
world = bpy.data.worlds.new('w'); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes['Background']
if MODE == 'night':
    bg.inputs['Color'].default_value = TL.hexc('#2b3566' if not CHIBI else NIGHT_SKY[THEME] if TH else '#2c2550'); bg.inputs['Strength'].default_value = 0.7
    for l in D['lights']:
        ld = bpy.data.lights.new('l', 'POINT'); ld.energy = 70 * l.get('i', 1) * (l.get('r', 4) / 4) ** 2; ld.color = l['color']; ld.shadow_soft_size = 0.4
        if TH and TH.get('lamp_color'): ld.color = TL.hexc(TH['lamp_color'])[:3]
        lo = bpy.data.objects.new('l', ld); COLL.objects.link(lo); lo.location = B(l['p'])
    for v in (0.12, 0.37, 0.62, 0.87):
        ld = bpy.data.lights.new('pool', 'POINT'); ld.energy = 60; ld.color = (0.35, 0.85, 1.0); ld.shadow_soft_size = 0.3
        lo = bpy.data.objects.new('pool', ld); COLL.objects.link(lo); lo.location = B((PL['x1'] - 0.3, -0.9, PZ(v)))
    moon = bpy.data.lights.new('moon', 'SUN'); moon.energy = 0.9; moon.color = (0.6, 0.7, 1.0); moon.angle = radians(10)
    mo = bpy.data.objects.new('moon', moon); COLL.objects.link(mo); mo.rotation_euler = (radians(40), 0, radians(-30))
else:
    bg.inputs['Color'].default_value = TL.hexc('#dfe9f5' if not CHIBI else '#e4e0f4'); bg.inputs['Strength'].default_value = 0.75 if not CHIBI else 0.9
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3.2 if not CHIBI else 2.8; sun.angle = radians(8 if not CHIBI else 18); sun.color = (1.0, 0.95, 0.86) if not CHIBI else (1.0, 0.93, 0.84)
    so = bpy.data.objects.new('sun', sun); COLL.objects.link(so)
    so.rotation_euler = (radians(42), radians(-12), radians(-38))
    if CHIBI and MOOD == 'studio':
        sun.energy = 1.2; sun.color = (0.85, 0.8, 1.0); bg.inputs['Color'].default_value = TL.hexc('#3a3152'); bg.inputs['Strength'].default_value = 0.6
        for l in D['lights']:   # lampu ruangan ikut nyala di siang hari
            ld = bpy.data.lights.new('l', 'POINT'); ld.energy = 45 * l.get('i', 1) * (l.get('r', 4) / 4) ** 2; ld.color = l['color']; ld.shadow_soft_size = 0.4
            lo = bpy.data.objects.new('l', ld); COLL.objects.link(lo); lo.location = B(l['p'])
    if CHIBI and MOOD == 'senja':
        sun.energy = 2.6; sun.color = (1.0, 0.78, 0.55); sun.angle = radians(14); so.rotation_euler = (radians(52), radians(-8), radians(-50))
        bg.inputs['Color'].default_value = TL.hexc('#c4b2e2'); bg.inputs['Strength'].default_value = 0.8
        for l in D['lights']:   # lampu ruangan sudah nyala (sore yang hangat), sekaligus nerangin dalam ruangan
            ld = bpy.data.lights.new('l', 'POINT'); ld.energy = 30 * l.get('i', 1) * (l.get('r', 4) / 4) ** 2; ld.color = l['color']; ld.shadow_soft_size = 0.5
            lo = bpy.data.objects.new('l', ld); COLL.objects.link(lo); lo.location = B(l['p'])
    if TH:
        en, sc_, ang, rot = TH['sun']
        sun.energy = en; sun.color = TL.hexc(sc_)[:3]; sun.angle = radians(ang); so.rotation_euler = tuple(radians(v) for v in rot)
        bg.inputs['Color'].default_value = TL.hexc(TH['sky'][0]); bg.inputs['Strength'].default_value = TH['sky'][1]
        if TH.get('lamps'):
            for l in D['lights']:
                ld = bpy.data.lights.new('l', 'POINT'); ld.energy = TH['lamps'] * l.get('i', 1) * (l.get('r', 4) / 4) ** 2; ld.shadow_soft_size = 0.5
                ld.color = TL.hexc(TH['lamp_color'])[:3] if TH.get('lamp_color') else l['color']
                lo = bpy.data.objects.new('l', ld); COLL.objects.link(lo); lo.location = B(l['p'])

# ---------------------------------------------------------------- tema: kabut, shading toon/kartun, outline
if TH and TH.get('fog'):
    vol = world.node_tree.nodes.new('ShaderNodeVolumePrincipled'); vol.inputs['Density'].default_value = TH['fog']
    vol.inputs['Color'].default_value = TL.hexc(TH.get('fog_color', TH['sky'][0]))
    world.node_tree.links.new(vol.outputs[0], world.node_tree.nodes['World Output'].inputs['Volume'])

def toonify(m, bands):
    nt = m.node_tree; b = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if b is None: return
    if b.inputs['Emission Strength'].default_value > 0 or b.inputs.get('Transmission Weight') and b.inputs['Transmission Weight'].default_value > 0.3: return
    L = nt.links.new; bc = b.inputs['Base Color']
    src = bc.links[0].from_socket if bc.is_linked else None
    nrm = b.inputs['Normal'].links[0].from_socket if b.inputs['Normal'].is_linked else None
    diff = nt.nodes.new('ShaderNodeBsdfDiffuse'); s2r = nt.nodes.new('ShaderNodeShaderToRGB'); L(diff.outputs[0], s2r.inputs[0])
    if nrm: L(nrm, diff.inputs['Normal'])
    bw = nt.nodes.new('ShaderNodeRGBToBW'); L(s2r.outputs['Color'], bw.inputs[0])
    rp = nt.nodes.new('ShaderNodeValToRGB'); rp.color_ramp.interpolation = 'CONSTANT'; E = rp.color_ramp.elements
    E[0].position = 0.0; E[0].color = (bands[0],) * 3 + (1,); E[1].position = bands[2]; E[1].color = (1, 1, 1, 1)
    if len(bands) > 3: e = E.new(bands[3]); e.color = (bands[1],) * 3 + (1,)
    L(bw.outputs[0], rp.inputs['Fac'])
    mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs['Factor'].default_value = 1.0
    if src: L(src, mx.inputs[6])
    else: mx.inputs[6].default_value = bc.default_value
    L(rp.outputs['Color'], mx.inputs[7])
    em = nt.nodes.new('ShaderNodeEmission'); L(mx.outputs[2], em.inputs['Color'])
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'); L(em.outputs[0], out.inputs['Surface'])

if TH and TH['shade'] in ('toon', 'cartoon'):
    bands = (0.55, 0.78, 0.5, 0.18) if TH['shade'] == 'toon' else (0.62, 0.62, 0.34)
    for m in list(bpy.data.materials):
        if m.use_nodes: toonify(m, bands)
if TH and TH.get('line'):
    scene.render.use_freestyle = True; scene.render.line_thickness_mode = 'ABSOLUTE'; scene.render.line_thickness = TH['line'] * SCALE
    fs = scene.view_layers[0].freestyle_settings; fs.crease_angle = radians(125)
    ls = fs.linesets[0] if len(fs.linesets) else fs.linesets.new('garis')
    ls.select_by_visibility = True; ls.select_silhouette = True; ls.select_border = True; ls.select_crease = True
    ls.linestyle.color = TL.hexc(TH.get('line_color', '#111018'))[:3]
    nol = bpy.data.collections.new('tanpa_garis'); scene.collection.children.link(nol)   # papan nama/layar menyala: tanpa outline (huruf pixel gak ketutup garis)
    for ob in list(COLL.objects):
        mm = ob.active_material
        if ob.name in ('o_grass', 'o_grassDark', 'o_water', 'o_mosaic') or ob.name.startswith(('bunting', 'crope', 'bstring', 'rope', 'fwire', 'petal')) or (ob.type == 'MESH' and mm and mm.use_nodes and any(n.type == 'BSDF_PRINCIPLED' and n.inputs['Emission Strength'].default_value > 0 for n in mm.node_tree.nodes)):
            nol.objects.link(ob)
    ls.select_by_collection = True; ls.collection = nol; ls.collection_negation = 'EXCLUSIVE'

scene.render.engine = 'CYCLES'
cy = scene.cycles; cy.samples = SAMPLES; cy.use_denoising = True
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'OPTIX'; prefs.get_devices()
    for d in prefs.devices: d.use = d.type == 'OPTIX'
    cy.device = 'GPU'
except Exception as e:
    print('GPU off:', e)
scene.render.resolution_x = int(cam['W'] * SCALE); scene.render.resolution_y = int(cam['H'] * SCALE)
try:
    if TH and TH['shade'] in ('toon', 'cartoon'): scene.view_settings.view_transform = 'Standard'   # warna rata apa adanya
    else: scene.view_settings.view_transform = 'AgX'; scene.view_settings.look = 'AgX - Punchy'
except Exception:
    pass
if BORDER:  # render sebagian layar saja (koordinat piksel web, y dari atas)
    r = scene.render; r.use_border = True; r.use_crop_to_border = True
    r.border_min_x, r.border_max_x = BORDER[0] / cam['W'], BORDER[2] / cam['W']
    r.border_min_y, r.border_max_y = 1 - BORDER[3] / cam['H'], 1 - BORDER[1] / cam['H']
scene.render.filepath = OUT
if OUT.lower().endswith('.webp'):   # langsung buat web
    scene.render.image_settings.file_format = 'WEBP'; scene.render.image_settings.quality = 90; scene.render.image_settings.color_mode = 'RGB'
bpy.ops.render.render(write_still=True)
print('RENDER OK', OUT)
