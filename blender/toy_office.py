# Render ulang gedung kantor (geometri persis dari docs/js/px/scene.js, lewat blender/export_scene.mjs)
# dengan gaya 3D mainan + kamera ortografis yang identik dengan web, opsional dengan karakter toy.
#   blender --background --factory-startup --python blender/toy_office.py -- <scene.json> <out.png> [samples] [scale] [day|night] [chars]
#   chars: "id@x,y,z,yaw;..." (koordinat dunia web; y = tinggi lantai) · border: "x0,y0,x1,y1" piksel layar web (crop)
import bpy, bmesh, sys, os, json, math
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

# ---------------------------------------------------------------- material gaya mainan
WOOD = {'walnut', 'oak', 'workwood', 'tread', 'lightwood', 'slat', 'slatdark', 'slatdarkH', 'furn', 'trunk'}
GRASS = {'grass', 'grassDark'}
FOLIAGE = {'foliage', 'foliageDark', 'foliageLight'}
def node_mat(name, info):
    m = bpy.data.materials.new('o_' + name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']; L = nt.links.new
    col = TL.hexc(info['color'])
    TL.setin(b, 'Base Color', col); TL.setin(b, 'Roughness', 0.55)
    # tepi membulat (kesan mainan) tanpa mengubah geometri
    bev = nt.nodes.new('ShaderNodeBevel'); bev.samples = 6; bev.inputs['Radius'].default_value = 0.035
    L(bev.outputs['Normal'], b.inputs['Normal'])
    if name in WOOD:
        tc = nt.nodes.new('ShaderNodeTexCoord'); br = nt.nodes.new('ShaderNodeTexBrick')
        br.inputs['Color1'].default_value = col; br.inputs['Color2'].default_value = TL.hexc(TL.shade(info['color'], -0.08))
        br.inputs['Mortar'].default_value = TL.hexc(TL.shade(info['color'], -0.3)); br.inputs['Scale'].default_value = 0.9
        br.inputs['Mortar Size'].default_value = 0.012; br.inputs['Brick Width'].default_value = 2.2; br.inputs['Row Height'].default_value = 0.42
        L(tc.outputs['Object'], br.inputs['Vector']); L(br.outputs['Color'], b.inputs['Base Color'])
        TL.setin(b, ['Coat Weight'], 0.15)
    elif name in GRASS:
        nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 0.6
        ramp = nt.nodes.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].color = TL.hexc('#5aa043'); ramp.color_ramp.elements[1].color = TL.hexc('#79bd52')
        L(nz.outputs['Fac'], ramp.inputs['Fac']); L(ramp.outputs['Color'], b.inputs['Base Color']); TL.setin(b, 'Roughness', 0.85)
    elif name in FOLIAGE or info.get('leafy'):
        TL.setin(b, 'Roughness', 0.45); TL.setin(b, ['Subsurface Weight'], 0.15); TL.setin(b, ['Coat Weight'], 0.2)
    if info.get('glass'):
        TL.setin(b, ['Transmission Weight', 'Transmission'], 0.85); TL.setin(b, 'Roughness', 0.05); TL.setin(b, 'IOR', 1.45)
        TL.setin(b, 'Alpha', 0.55)
    if info.get('emissive') or name.startswith(('lamp', 'bulb', 'candle', 'rgb')):
        TL.setin(b, ['Emission Color', 'Emission'], col)
        TL.setin(b, 'Emission Strength', 6.0 if MODE == 'night' else 2.5)
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
    if name.startswith('scr') or name.startswith('tv'):
        TL.setin(b, ['Emission Color', 'Emission'], TL.hexc('#5b3fb8')); TL.setin(b, 'Emission Strength', 1.5)
        TL.setin(b, ['Coat Weight'], 1.0); TL.setin(b, 'Roughness', 0.15)
    return m

MATS = {k: node_mat(k, v) for k, v in D['mats'].items()}

# ---------------------------------------------------------------- geometri: semua poligon per material jadi satu mesh
by = {}
for pr in D['prims']:
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
            c, r = pr[2], pr[3]; o = len(verts)
            verts += [tuple(B((c[0] + x * r[0], c[1] + z * r[1], c[2] - y * r[2]))) for x, y, z in SPH_V]
            faces += [[o + i for i in f] for f in SPH_F]
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.validate()
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = any(pr[0] == 'e' for pr in items[:1])
    ob = bpy.data.objects.new('o_' + name, me); COLL.objects.link(ob); me.materials.append(MATS[name])
    if name in FOLIAGE:
        sub = ob.modifiers.new('sub', 'SUBSURF'); sub.levels = 1; sub.render_levels = 1

# ---------------------------------------------------------------- isi kolam: pelampung donat, bola pantai, pelampung kasur
def pool_props():
    don = TL.mat('donut', '#ff7eb6', 0.25, coat=0.8); don2 = TL.mat('donut2', '#ffffff', 0.25, coat=0.8)
    t = TL.torus('donut', B((10.4, -0.03, 9.6)), (0, 0, 1), 0.42, 0.17, don, None)
    for i in range(6):   # garis putih di donat
        a = i * math.pi / 3
        TL.ellipsoid('stripe', B((10.4 + math.cos(a) * 0.42, 0.0, 9.6 + math.sin(a) * 0.42)), (0.08, 0.08, 0.175), don2, None)
    t2 = TL.torus('ring', B((17.3, -0.03, 10.6)), (0, 0, 1), 0.36, 0.14, TL.mat('ring', '#ffd166', 0.25, coat=0.8), None)
    cols = ['#ef476f', '#ffffff', '#118ab2', '#ffd166', '#ffffff', '#06d6a0']
    for i, c in enumerate(cols):   # bola pantai (6 segmen)
        b_ = TL.ellipsoid('ball', B((15.6, 0.12, 6.6)), (0.26, 0.26, 0.26), TL.mat('ball' + str(i), c, 0.3, coat=0.7), None)
        bpy.context.view_layer.objects.active = b_
        bm = bmesh.new(); bm.from_mesh(b_.data)
        a0, a1 = i * math.pi / 3, (i + 1) * math.pi / 3
        kill = [v for v in bm.verts if not (a0 <= (math.atan2(v.co.y, v.co.x) % (2 * math.pi)) < a1 + 1e-6)]
        bmesh.ops.delete(bm, geom=kill, context='VERTS'); bm.to_mesh(b_.data); bm.free()
    TL.rbox('mat', B((12.6, -0.04, 7.2)), (1.9, 0.75, 0.12), TL.mat('airmat', '#7c3aed', 0.3, coat=0.8), 0.06, rot=Matrix.Rotation(radians(18), 4, 'Z').to_quaternion())
    TL.rbox('matpillow', B((12.6, -0.04, 7.2)) + Matrix.Rotation(radians(18), 4, 'Z') @ Vector((0.75, 0, 0.07)), (0.3, 0.68, 0.1), TL.mat('airmat2', '#a78bfa', 0.3, coat=0.8), 0.05,
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
    bg.inputs['Color'].default_value = TL.hexc('#2b3566'); bg.inputs['Strength'].default_value = 0.7
    for l in D['lights']:
        ld = bpy.data.lights.new('l', 'POINT'); ld.energy = 70 * l.get('i', 1) * (l.get('r', 4) / 4) ** 2; ld.color = l['color']; ld.shadow_soft_size = 0.4
        lo = bpy.data.objects.new('l', ld); COLL.objects.link(lo); lo.location = B(l['p'])
    for z in (5.8, 7.4, 9.0, 10.6):
        ld = bpy.data.lights.new('pool', 'POINT'); ld.energy = 60; ld.color = (0.35, 0.85, 1.0); ld.shadow_soft_size = 0.3
        lo = bpy.data.objects.new('pool', ld); COLL.objects.link(lo); lo.location = B((18.7, -0.9, z))
    moon = bpy.data.lights.new('moon', 'SUN'); moon.energy = 0.9; moon.color = (0.6, 0.7, 1.0); moon.angle = radians(10)
    mo = bpy.data.objects.new('moon', moon); COLL.objects.link(mo); mo.rotation_euler = (radians(40), 0, radians(-30))
else:
    bg.inputs['Color'].default_value = TL.hexc('#dfe9f5'); bg.inputs['Strength'].default_value = 0.75
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3.2; sun.angle = radians(8); sun.color = (1.0, 0.95, 0.86)
    so = bpy.data.objects.new('sun', sun); COLL.objects.link(so)
    so.rotation_euler = (radians(42), radians(-12), radians(-38))

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
    scene.view_settings.view_transform = 'AgX'; scene.view_settings.look = 'AgX - Punchy'
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
