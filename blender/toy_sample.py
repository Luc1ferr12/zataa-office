# Contoh gaya "3D mainan" (toy / vinyl chibi): 1 ruangan kecil + 1 karakter cowok + 1 cewek.
# Belum dipakai di web — cuma render PNG buat dicek Owner.
#   blender --background --factory-startup --python blender/toy_sample.py -- <out.png> [samples]
import bpy, bmesh, sys, math
from math import radians, sqrt
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else '//toy_sample.png'
SAMPLES = int(argv[1]) if len(argv) > 1 else 160
CLOSE = len(argv) > 2 and argv[2] == 'close'  # close-up karakter

for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
scene = bpy.context.scene
COLL = scene.collection

# ---------------------------------------------------------------- material
def hexc(h, a=1.0):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [a]

def setin(node, names, val):
    for n in names if isinstance(names, (list, tuple)) else [names]:
        if n in node.inputs: node.inputs[n].default_value = val; return

MATS = {}
def mat(name, color, rough=0.55, sss=0.0, coat=0.0, sheen=0.0, emit=0.0, metal=0.0):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    setin(b, 'Base Color', hexc(color)); setin(b, 'Roughness', rough); setin(b, 'Metallic', metal)
    if sss: setin(b, ['Subsurface Weight', 'Subsurface'], sss); setin(b, 'Subsurface Radius', (0.9, 0.45, 0.3)); setin(b, 'Subsurface Scale', 0.03)
    if coat: setin(b, ['Coat Weight', 'Clearcoat'], coat); setin(b, ['Coat Roughness', 'Clearcoat Roughness'], 0.25)
    if sheen: setin(b, ['Sheen Weight', 'Sheen'], sheen)
    if emit: setin(b, ['Emission Color', 'Emission'], hexc(color)); setin(b, 'Emission Strength', emit)
    MATS[name] = m
    return m

def wood_mat():
    m = bpy.data.materials.new('wood'); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (1.0, 1.0, 1.0)
    br = nt.nodes.new('ShaderNodeTexBrick')
    br.inputs['Color1'].default_value = hexc('#c98d5a'); br.inputs['Color2'].default_value = hexc('#b57a4a')
    br.inputs['Mortar'].default_value = hexc('#7a4c2c'); br.inputs['Scale'].default_value = 2.0
    br.inputs['Mortar Size'].default_value = 0.004; br.inputs['Brick Width'].default_value = 1.4; br.inputs['Row Height'].default_value = 0.26
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 40; mp2 = nt.nodes.new('ShaderNodeMapping'); mp2.inputs['Scale'].default_value = (1, 18, 1)
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 0.25
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.25
    L = nt.links.new
    L(tc.outputs['Object'], mp.inputs['Vector']); L(mp.outputs['Vector'], br.inputs['Vector'])
    L(tc.outputs['Object'], mp2.inputs['Vector']); L(mp2.outputs['Vector'], nz.inputs['Vector'])
    L(br.outputs['Color'], mix.inputs[6]); L(nz.outputs['Color'], mix.inputs[7])
    L(mix.outputs[2], b.inputs['Base Color']); L(br.outputs['Fac'], bump.inputs['Height']); L(bump.outputs['Normal'], b.inputs['Normal'])
    setin(b, 'Roughness', 0.55)
    return m

# ---------------------------------------------------------------- bentuk dasar (semua membulat → kesan mainan)
def finish(name, bm, m, loc=(0, 0, 0), rot=None, parent=None, sharp=None):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    if sharp is not None:
        try: me.set_sharp_from_angle(angle=radians(sharp))
        except Exception: pass
    ob = bpy.data.objects.new(name, me); COLL.objects.link(ob); me.materials.append(m)
    ob.location = loc
    if rot is not None: ob.rotation_mode = 'QUATERNION'; ob.rotation_quaternion = rot
    if parent: ob.parent = parent
    return ob

def ellipsoid(name, loc, r, m, parent=None, rot=None, seg=48):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=seg * 2 // 3, radius=1.0)
    for v in bm.verts: v.co = Vector((v.co.x * r[0], v.co.y * r[1], v.co.z * r[2]))
    return finish(name, bm, m, loc, rot, parent)

def capsule(name, a, b, rad, m, parent=None, r2=None):
    a, b = Vector(a), Vector(b); d = b - a; L = d.length
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=24, radius=1.0)
    r2 = r2 or rad
    for v in bm.verts:
        t = 1 if v.co.z > 0 else 0
        rr = rad + (r2 - rad) * t
        v.co = Vector((v.co.x * rr, v.co.y * rr, v.co.z * rr + (L if t else 0)))
    return finish(name, bm, m, a, d.to_track_quat('Z', 'Y'), parent)

def rbox(name, loc, size, m, bevel=0.03, parent=None, rot=None, seg=5):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    bmesh.ops.bevel(bm, geom=list(bm.edges) + list(bm.verts), offset=min(bevel, min(size) * 0.49), offset_type='OFFSET',
                    segments=seg, profile=0.5, affect='EDGES', clamp_overlap=True)
    return finish(name, bm, m, loc, rot, parent, sharp=35)

def frustum(name, loc, r1, r2, h, m, parent=None, bevel=0.015, seg=48):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r1, radius2=r2, depth=h)
    edges = [e for e in bm.edges if all(abs(abs(v.co.z) - h / 2) < 1e-5 for v in e.verts) and not e.is_boundary]
    rim = [e for e in edges if len(e.link_faces) == 2 and any(len(f.verts) > 4 for f in e.link_faces)]
    if bevel: bmesh.ops.bevel(bm, geom=rim, offset=bevel, offset_type='OFFSET', segments=4, profile=0.5, affect='EDGES', clamp_overlap=True)
    return finish(name, bm, m, loc, None, parent, sharp=40)

def boolean_cut(ob, cutter_loc, cutter_size, rot=None):
    c = rbox('cut', cutter_loc, cutter_size, mat('cut', '#ff00ff'), bevel=0.02)
    if rot: c.rotation_mode = 'XYZ'; c.rotation_euler = rot
    c.parent = ob.parent
    mod = ob.modifiers.new('cut', 'BOOLEAN'); mod.operation = 'DIFFERENCE'; mod.object = c
    try: mod.solver = 'EXACT'
    except Exception: pass
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.selected_objects: o.select_set(False)
    ob.select_set(True)
    keep = ob.data.materials[0]
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(c, do_unlink=True)
    ob.data.materials.clear(); ob.data.materials.append(keep)   # permukaan potongan ikut warna aslinya
    for p in ob.data.polygons: p.material_index = 0

def fuse(objs, voxel=0.0045, smooth=10):
    # lebur beberapa bentuk jadi satu massa halus (kayak dipahat), dipakai buat rambut
    for o in bpy.context.selected_objects: o.select_set(False)
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = objs[0]
    r = ob.modifiers.new('rm', 'REMESH'); r.mode = 'VOXEL'; r.voxel_size = voxel
    sm = ob.modifiers.new('sm', 'SMOOTH'); sm.factor = 0.9; sm.iterations = smooth
    bpy.ops.object.modifier_apply(modifier='rm'); bpy.ops.object.modifier_apply(modifier='sm')
    for p in ob.data.polygons: p.use_smooth = True
    return ob

# ---------------------------------------------------------------- karakter chibi
SKIN = {'f': '#f0c9a8', 'm': '#d9a77f'}
def character(cfg, loc, yaw):
    root = bpy.data.objects.new(cfg['name'], None); COLL.objects.link(root)
    P = root; g = cfg['g']
    skin = mat('skin_' + g, cfg['skin'], 0.5, sss=0.15)
    skinD = mat('skinD_' + g, cfg['skinD'], 0.5, sss=0.1)
    hair = mat('hair_' + cfg['name'], cfg['hair'], 0.5, coat=0.12)
    top = mat('top_' + cfg['name'], cfg['top'], 0.8, sheen=0.4)
    bot = mat('bot_' + cfg['name'], cfg['bot'], 0.75, sheen=0.3)
    shoe = mat('shoe_' + cfg['name'], cfg['shoe'], 0.35, coat=0.5)
    sole = mat('sole', '#f2efe9', 0.6)
    eye = mat('eye', '#1a1210', 0.12, coat=1.0)
    hl = mat('eyehl', '#ffffff', 0.3, emit=2.0)
    lip = mat('lip_' + g, '#b8525a' if g == 'f' else '#8a4a42', 0.4)
    blush = mat('blush', '#f08c8c', 0.6)
    brow = mat('brow_' + cfg['name'], cfg['brow'], 0.6)

    # ---------- badan: tiap bagian (kulit / baju / celana) dilebur jadi satu massa halus
    def torus(name, center, axis, R, r, m):
        bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=40, minor_segments=12, location=center)
        t = bpy.context.object; t.name = name
        t.rotation_mode = 'QUATERNION'; t.rotation_quaternion = Vector(axis).normalized().to_track_quat('Z', 'Y')
        t.data.materials.append(m); t.parent = P
        for p in t.data.polygons: p.use_smooth = True
        return t

    jacket = cfg.get('jacket'); longs = cfg.get('long_sleeve')
    pose = cfg.get('pose', {})
    SH = {s: Vector((0.118 * s, 0.0, 0.652)) for s in (-1, 1)}      # sendi bahu (agak turun = rileks)
    EL = {s: Vector(pose.get('el', {}).get(s, (0.147 * s, 0.022, 0.548))) for s in (-1, 1)}   # siku
    WR = {s: Vector(pose.get('wr', {}).get(s, (0.15 * s, -0.035, 0.458))) for s in (-1, 1)}  # pergelangan
    POCKET = pose.get('pocket')   # sisi tangan yang masuk saku
    FT = {s: pose.get('foot', {}).get(s, (0.0, 0.0, 0.0)) for s in (-1, 1)}  # geser x, geser y, putar (derajat, + = keluar)
    FX = {s: Vector((0.064 * s + FT[s][0], FT[s][1], 0)) for s in (-1, 1)}

    # kulit: leher + lengan (bahu→siku→pergelangan) + kaki kalau pakai rok
    capsule('neck', (0, 0, 0.64), (0, 0.004, 0.74), 0.04, skin, P)
    for s in (-1, 1):
        arm = [capsule('uarm', SH[s], EL[s], 0.036, skin, P, r2=0.032), capsule('farm', EL[s], WR[s], 0.032, skin, P, r2=0.027)]
        fuse(arm, 0.003, 6)
    if cfg.get('skirt'):
        for s in (-1, 1):
            kn = Vector((0.058 * s, 0, 0.42)).lerp(FX[s] + Vector((0, 0, 0.07)), 0.5) + Vector((0, -0.008, 0))
            fuse([capsule('thigh', (0.058 * s, 0.0, 0.42), kn, 0.05, skin, P, r2=0.042),
                  capsule('shin', kn, FX[s] + Vector((0, 0, 0.07)), 0.04, skin, P, r2=0.032)], 0.003, 6)

    # baju atas: dada + pinggang + bahu bulat + lengan baju
    # badan = satu bentuk utuh (dada lebar → pinggang ramping) biar permukaannya mulus tanpa benjolan
    def blob(name, z0, z1, k, m):
        bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=64, v_segments=40, radius=1.0)
        hz, cz = (z1 - z0) / 2, (z0 + z1) / 2
        def sm(a, b, t): t = min(max((t - a) / (b - a), 0), 1); return t * t * (3 - 2 * t)
        for v in bm.verts:
            zz = v.co.z
            rx = (0.106 + 0.016 * sm(-0.7, 0.35, zz)) * k
            ry = (0.077 + 0.008 * sm(-0.5, 0.3, zz)) * k
            z = cz + (zz * hz if zz >= 0 else -hz * (-zz) ** 0.8)
            v.co = Vector((v.co.x * rx, v.co.y * ry - 0.004 * sm(0, 0.5, zz), z))
        return finish(name, bm, m, (0, 0, 0), None, P)
    parts = [blob('body', 0.37 if jacket else 0.45, 0.71, 1.06 if jacket else 1.0, top)]
    for s in (-1, 1):
        parts.append(ellipsoid('shoulder', SH[s] + Vector((-0.012 * s, 0, -0.004)), (0.046, 0.046, 0.042), top, P))
        if longs:
            parts += [capsule('sl1', SH[s], EL[s], 0.04, top, P, r2=0.037), capsule('sl2', EL[s], WR[s] + (WR[s] - EL[s]) * -0.12, 0.037, top, P, r2=0.034)]
        else:
            parts.append(capsule('sl', SH[s], SH[s].lerp(EL[s], 0.6), 0.046, top, P, r2=0.043))
    torso = fuse(parts, 0.0035, 14)
    if jacket: boolean_cut(torso, (0, 0, 0.33), (0.4, 0.3, 0.1))   # ujung jas lurus
    # lipatan ujung lengan baju (cuff)
    for s in (-1, 1):
        if s == POCKET: continue
        if longs:
            c = WR[s] + (WR[s] - EL[s]) * -0.12
            torus('cuff', c, WR[s] - EL[s], 0.031, 0.006, mat('cuffm_' + cfg['name'], cfg.get('topD', cfg['top']), 0.8))
        else:
            torus('cuff', SH[s].lerp(EL[s], 0.6), EL[s] - SH[s], 0.042, 0.008, top)

    # bawah: celana (pinggul + 2 kaki lebur) atau rok A-line
    if cfg.get('skirt'):
        sk = frustum('skirt', (0, 0, 0.385), 0.182, 0.104, 0.17, bot, P, bevel=0.015, seg=64)
        torus('waistband', (0, 0, 0.468), (0, 0, 1), 0.101, 0.0085, bot)
    else:
        parts = [ellipsoid('hips', (0, 0.0, 0.44), (0.11, 0.08, 0.065), bot, P)]
        for s in (-1, 1):
            kn = Vector((0.057 * s, 0, 0.43)).lerp(FX[s] + Vector((0, 0, 0.085)), 0.5) + Vector((0, -0.006, 0))
            parts.append(capsule('pleg', (0.057 * s, 0, 0.43), kn, 0.052, bot, P, r2=0.047))
            parts.append(capsule('pleg2', kn, FX[s] + Vector((0, 0, 0.085)), 0.047, bot, P, r2=0.044))
        fuse(parts, 0.0035, 8)
        for s in (-1, 1): torus('pcuff', FX[s] + Vector((0, 0, 0.09)), (0, 0, 1), 0.043, 0.006, bot)
        if not jacket:
            torus('belt', (0, 0, 0.485), (0, 0, 1), 0.106, 0.011, mat('belt', '#2a221e', 0.4, coat=0.4))

    # sepatu: ujung bulat + tumit, dilebur, telapak putih
    for s in (-1, 1):
        x = 0.0
        sh_ = fuse([ellipsoid('toe', (x, -0.045, 0.038), (0.047, 0.065, 0.037), shoe, P),
                    ellipsoid('heel', (x, 0.018, 0.04), (0.043, 0.045, 0.04), shoe, P),
                    capsule('ankle', (x, 0.0, 0.04), (x, 0.0, 0.085), 0.04, shoe, P)], 0.003, 6)
        boolean_cut(sh_, (x, -0.02, -0.04), (0.2, 0.3, 0.1))
        so_ = rbox('sole', (x, -0.018, 0.009), (0.096, 0.17, 0.018), sole, 0.008, P)
        R = Matrix.Rotation(radians(FT[s][2] * s), 4, 'Z')
        for o in (sh_, so_): o.matrix_basis = Matrix.Translation(FX[s]) @ R @ o.matrix_basis

    # tangan: telapak + 4 jari agak menekuk + jempol (dibuat sekali, dicerminkan)
    def hand(s):
        fingers = [ellipsoid('palm', (0, 0, -0.03), (0.022, 0.036, 0.038), skin, P)]
        for i, fy in enumerate((-0.021, -0.007, 0.007, 0.021)):
            ln = (0.026, 0.03, 0.029, 0.023)[i]
            a = Vector((0.0, fy, -0.056)); b = Vector((-0.009 * s, fy * 1.02, -0.056 - ln))
            fingers.append(capsule('f', a, b, 0.0095, skin, P, r2=0.0088))
        fingers.append(capsule('thumb', (-0.008 * s, -0.024, -0.02), (-0.016 * s, -0.042, -0.05), 0.011, skin, P, r2=0.0095))
        h = fuse(fingers, 0.002, 4)
        # pasang di pergelangan, ikut arah lengan bawah
        d = (WR[s] - EL[s]).normalized()
        q = Vector((0, 0, -1)).rotation_difference(d)
        h.rotation_mode = 'QUATERNION'; h.rotation_quaternion = q
        h.location = WR[s] + d * 0.004
        return h
    for s in (-1, 1):
        if s != POCKET: hand(s)

    # detail baju
    if jacket:
        inner = mat('inner', '#f4f2ee', 0.7)
        bm = bmesh.new()
        vs = [bm.verts.new(v) for v in [(-0.062, 0, 0.7), (0.062, 0, 0.7), (0, 0, 0.5)]]
        bm.faces.new(vs); bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=0.03)
        sh_ob = finish('shirt', bm, inner, (0, -0.07, 0), None, P)
        for p in sh_ob.data.polygons: p.use_smooth = False
        rbox('tie', (0, -0.092, 0.585), (0.026, 0.01, 0.11), mat('tie', '#7c3aed', 0.5), 0.008, P)
        rbox('knot', (0, -0.095, 0.645), (0.03, 0.012, 0.022), mat('tie', '#7c3aed', 0.5), 0.008, P)
        for s in (-1, 1):
            r = Matrix.Rotation(radians(19 * s), 4, 'Y').to_quaternion()
            rbox('lapel', (0.044 * s, -0.086, 0.6), (0.03, 0.014, 0.17), mat('lapel', '#6b7486', 0.7), 0.007, P, rot=r)
        for z in (0.525, 0.48): ellipsoid('btn', (0.0, -0.086, z), (0.009, 0.005, 0.009), mat('btn', '#1d1d22', 0.3), P)
        rbox('pocket', (0.07, -0.08, 0.63), (0.04, 0.012, 0.008), mat('lapel', '#6b7486', 0.7), 0.003, P)
    else:
        # kerah bulat kaos
        torus('collar', (0, 0.0, 0.69), (0, 0.25, 1), 0.052, 0.009, top)
    if cfg.get('lanyard'):
        lan = mat('lanyard', '#7c3aed', 0.5)
        for s in (-1, 1): capsule('strap', (0.045 * s, -0.062, 0.695), (0.012 * s, -0.09, 0.585), 0.006, lan, P)
        rbox('card', (0, -0.095, 0.56), (0.05, 0.006, 0.065), mat('card', '#f4f2ee', 0.4, coat=0.6), 0.006, P)
        rbox('cardtop', (0, -0.099, 0.578), (0.05, 0.003, 0.018), lan, 0.003, P)

    before_head = set(o.name for o in P.children)
    # kepala
    H = Vector((0, 0, 0.9)); R = (0.185, 0.17, 0.185)
    ellipsoid('head', H, R, skin, P)
    def surf(x, z, out=0.0):
        k = 1 - (x / R[0]) ** 2 - ((z - H.z) / R[2]) ** 2
        return Vector((x, -R[1] * sqrt(max(k, 0)) - out, z))
    for s in (-1, 1):
        ellipsoid('ear', (0.182 * s, 0.01, 0.885), (0.025, 0.02, 0.035), skin, P)
        e = surf(0.062 * s, 0.885, -0.004)
        ellipsoid('eye', e, (0.019, 0.012, 0.028), eye, P)
        ellipsoid('hl', surf(0.068 * s, 0.898, 0.004), (0.006, 0.004, 0.007), hl, P)
        bp = surf(0.064 * s, 0.937, 0.002)
        r = Matrix.Rotation(radians(90), 4, 'Y') @ Matrix.Rotation(radians(-8 * s), 4, 'X')
        capsule('brow', bp + Vector((-0.022 * s, 0, -0.002)), bp + Vector((0.022 * s, 0, 0.003)), 0.0055, brow, P)
        if g == 'f':
            ellipsoid('blush', surf(0.1 * s, 0.85, -0.002), (0.024, 0.006, 0.014), blush, P)
            for k in range(3):  # bulu mata
                capsule('lash', surf((0.074 + k * 0.006) * s, 0.903 + k * 0.002, 0.0), surf((0.082 + k * 0.008) * s, 0.91 + k * 0.004, 0.006), 0.0028, eye, P)
    ellipsoid('nose', surf(0, 0.853, -0.006), (0.016, 0.012, 0.013), skinD, P)
    # senyum: busur kecil
    bm = bmesh.new(); pts = []
    for i in range(9):
        t = (i / 8 - 0.5) * 2
        pts.append(surf(t * 0.026, 0.815 + 0.009 * t * t, 0.001))
    m_ob = None
    for i in range(8):
        capsule('mouth', pts[i], pts[i + 1], 0.0045, lip, P)

    # rambut: beberapa bentuk dilebur jadi satu massa halus
    if g == 'm':
        parts = [ellipsoid('hair', H + Vector((0, 0.012, 0.02)), (R[0] + 0.016, R[1] + 0.018, R[2] + 0.012), hair, P)]
        parts.append(ellipsoid('swoop', (0.025, -0.075, 1.035), (0.17, 0.1, 0.07), hair, P, rot=Matrix.Rotation(radians(-9), 4, 'Y').to_quaternion()))
        parts.append(ellipsoid('swoop2', (-0.09, -0.06, 1.0), (0.08, 0.1, 0.06), hair, P))
        for sx in (-1, 1): parts.append(ellipsoid('side', (0.15 * sx, 0.0, 0.95), (0.06, 0.13, 0.08), hair, P))
        cap = fuse(parts)
        boolean_cut(cap, (0, -0.17, 0.81), (0.44, 0.2, 0.22))          # buka wajah
        boolean_cut(cap, (0, -0.2, 0.9), (0.3, 0.12, 0.09))            # dahi
        boolean_cut(cap, (0, 0.02, 0.74), (0.5, 0.5, 0.14))            # tengkuk
        for sx in (-1, 1): boolean_cut(cap, (0.21 * sx, -0.03, 0.85), (0.07, 0.13, 0.11))  # telinga
        for sx in (-1, 1): ellipsoid('sideburn', (0.172 * sx, -0.04, 0.875), (0.016, 0.028, 0.04), hair, P)
    else:
        parts = [ellipsoid('hair', H + Vector((0, 0.014, 0.018)), (R[0] + 0.018, R[1] + 0.022, R[2] + 0.014), hair, P)]
        parts.append(ellipsoid('bang', (0.03, -0.095, 1.0), (0.165, 0.085, 0.065), hair, P, rot=Matrix.Rotation(radians(14), 4, 'Y').to_quaternion()))
        parts.append(ellipsoid('bang2', (0.14, -0.07, 0.93), (0.06, 0.08, 0.09), hair, P))
        parts.append(rbox('hairback', (0, 0.075, 0.73), (0.38, 0.11, 0.38), hair, 0.05, P))
        parts.append(ellipsoid('hairback2', (0, 0.06, 0.9), (0.2, 0.14, 0.18), hair, P))
        for sx in (-1, 1):
            parts.append(capsule('strand', (0.165 * sx, -0.02, 0.88), (0.17 * sx, -0.045, 0.62), 0.045, hair, P, r2=0.035))
        cap = fuse(parts)
        boolean_cut(cap, (0, -0.19, 0.82), (0.27, 0.2, 0.2))            # wajah
        boolean_cut(cap, (-0.03, -0.2, 0.89), (0.16, 0.12, 0.07))       # dahi kiri (poni ke kanan)
        if cfg.get('clip'): ellipsoid('clip', surf(-0.1, 0.985, 0.03), (0.024, 0.012, 0.011), mat('clip', '#a78bfa', 0.3, coat=0.8), P)

    # ---------- pose: kepala miring/nengok, badan atas sedikit muter & condong
    def rot_about(ob, pivot, R):
        ob.matrix_basis = Matrix.Translation(pivot) @ R @ Matrix.Translation(-Vector(pivot)) @ ob.matrix_basis
    roll, nod, turn = pose.get('head', (0, 0, 0))
    RH = Matrix.Rotation(radians(turn), 4, 'Z') @ Matrix.Rotation(radians(roll), 4, 'Y') @ Matrix.Rotation(radians(nod), 4, 'X')
    head_objs = [o for o in P.children if o.name not in before_head]
    for o in head_objs: rot_about(o, Vector((0, 0, 0.73)), RH)
    LOWER = ('thigh', 'shin', 'pleg', 'pcuff', 'toe', 'sole', 'skirt', 'waistband', 'hips')
    twist, lean = pose.get('twist', 0), pose.get('lean', 0)
    RU = Matrix.Rotation(radians(twist), 4, 'Z') @ Matrix.Rotation(radians(lean), 4, 'Y')
    for o in P.children:
        if not o.name.startswith(LOWER) and not (POCKET and o.name.startswith('farm')): rot_about(o, Vector((0, 0, 0.46)), RU)
    root.location = loc; root.rotation_euler = (0, 0, radians(yaw))
    return root

# ---------------------------------------------------------------- ruangan kecil
def room():
    W, D, WH, T = 2.8, 2.4, 1.45, 0.1
    floor = rbox('floor', (0, 0, -0.04), (W, D, 0.08), wood_mat(), 0.02)
    rbox('base', (0, 0, -0.14), (W + 0.04, D + 0.04, 0.14), mat('base', '#6b4a35', 0.6), 0.03)
    wallA = mat('wallA', '#e9e1f3', 0.85)  # lilac lembut (nuansa ungu Zataa)
    wallB = mat('wallB', '#f3ece2', 0.85)
    trim = mat('trim', '#ffffff', 0.5)
    back = rbox('wall_back', (0, D / 2 + T / 2, WH / 2), (W + T * 2, T, WH), wallA, 0.03)
    left = rbox('wall_left', (-W / 2 - T / 2, 0, WH / 2), (T, D, WH), wallB, 0.03)
    rbox('skirting_b', (0, D / 2 - 0.005, 0.04), (W, 0.02, 0.08), trim, 0.008)
    rbox('skirting_l', (-W / 2 + 0.005, 0, 0.04), (0.02, D, 0.08), trim, 0.008)
    # jendela di dinding kiri
    boolean_cut(left, (-W / 2 - T / 2, -0.25, 0.85), (0.3, 0.8, 0.6))
    glass = mat('glass', '#bfe3ff', 0.05, emit=1.4)
    rbox('sky', (-W / 2 - T / 2 - 0.02, -0.25, 0.85), (0.02, 0.8, 0.6), glass, 0.005)
    frame = mat('frame', '#ffffff', 0.4)
    for z in (0.55, 1.15): rbox('wf', (-W / 2 - T / 2 + 0.01, -0.25, z), (T + 0.04, 0.84, 0.04), frame, 0.01)
    for y in (-0.65, 0.15, -0.25): rbox('wf', (-W / 2 - T / 2 + 0.01, y, 0.85), (T + 0.04, 0.035 if y == -0.25 else 0.04, 0.64), frame, 0.01)
    rbox('sill', (-W / 2 + 0.03, -0.25, 0.54), (0.1, 0.9, 0.03), frame, 0.01)

    # meja kerja
    desk = mat('desk', '#e8d5bd', 0.5, coat=0.2)
    leg = mat('deskleg', '#3a3550', 0.4, coat=0.3)
    dx, dy = 0.35, D / 2 - 0.3
    rbox('desktop', (dx, dy, 0.48), (1.1, 0.5, 0.04), desk, 0.015)
    for sx in (-1, 1):
        rbox('dleg', (dx + 0.5 * sx, dy, 0.23), (0.04, 0.42, 0.46), leg, 0.015)
    rbox('drawer', (dx + 0.32, dy, 0.36), (0.35, 0.44, 0.2), desk, 0.02)
    rbox('handle', (dx + 0.32, dy - 0.225, 0.36), (0.12, 0.012, 0.018), leg, 0.006)
    # monitor dengan layar ungu Zataa
    rbox('mon', (dx - 0.05, dy + 0.1, 0.72), (0.5, 0.035, 0.31), mat('monb', '#22202b', 0.3, coat=0.5), 0.02)
    scr = mat('screen', '#7c3aed', 0.2, emit=2.2)
    rbox('scr', (dx - 0.05, dy + 0.08, 0.725), (0.46, 0.006, 0.27), scr, 0.008)
    rbox('scrbar', (dx - 0.05, dy + 0.075, 0.79), (0.32, 0.004, 0.035), mat('scrw', '#f5f3ff', 0.3, emit=1.2), 0.004)
    for i in range(3): rbox('scrcard', (dx - 0.19 + i * 0.14, dy + 0.075, 0.68), (0.11, 0.004, 0.1), mat('scrc', '#c4b5fd', 0.3, emit=1.0), 0.008)
    capsule('monneck', (dx - 0.05, dy + 0.12, 0.5), (dx - 0.05, dy + 0.12, 0.6), 0.02, leg)
    rbox('monfoot', (dx - 0.05, dy + 0.1, 0.505), (0.18, 0.12, 0.012), leg, 0.006)
    rbox('kbd', (dx - 0.05, dy - 0.12, 0.507), (0.32, 0.1, 0.016), mat('kbd', '#f4f2ee', 0.5), 0.006)
    ellipsoid('mouse', (dx + 0.18, dy - 0.12, 0.508), (0.025, 0.04, 0.012), mat('kbd', '#f4f2ee', 0.5))
    frustum('mug', (dx + 0.38, dy - 0.05, 0.545), 0.035, 0.035, 0.09, mat('mug', '#f59e0b', 0.3, coat=0.6), bevel=0.006)
    # kursi
    chair = mat('chair', '#7c3aed', 0.6, sheen=0.3)
    cx, cy = dx - 0.05, dy - 0.5
    rbox('seat', (cx, cy, 0.29), (0.34, 0.32, 0.06), chair, 0.03)
    rbox('backrest', (cx, cy - 0.17, 0.48), (0.34, 0.06, 0.32), chair, 0.03)
    capsule('cpost', (cx, cy, 0.06), (cx, cy, 0.27), 0.022, leg)
    for a in range(5):
        an = radians(a * 72 + 18); p = Vector((cx + math.cos(an) * 0.17, cy + math.sin(an) * 0.17, 0.035))
        capsule('cleg', (cx, cy, 0.05), p, 0.014, leg); ellipsoid('wheel', p - Vector((0, 0, 0.012)), (0.022, 0.022, 0.022), leg)
    # rak di dinding kiri + buku
    sh = mat('shelf', '#e8d5bd', 0.5)
    for z in (0.95, 1.2):
        rbox('shelf', (-W / 2 + 0.12, 0.65, z), (0.22, 0.6, 0.03), sh, 0.01)
        cols = ['#7c3aed', '#f59e0b', '#0d9488', '#e8b4c8', '#475569', '#a78bfa']
        y = 0.4
        for i, c in enumerate(cols[(0 if z < 1 else 2):][:4]):
            h = 0.13 + (i % 2) * 0.03
            rbox('book', (-W / 2 + 0.1, y, z + 0.015 + h / 2), (0.15, 0.04, h), mat('book' + c, c, 0.6), 0.008)
            y += 0.05
        ellipsoid('ball', (-W / 2 + 0.1, 0.85, z + 0.07), (0.05, 0.05, 0.05), mat('ball', '#fbbf24', 0.3, coat=0.8))
    # tanaman di sudut
    frustum('pot', (-W / 2 + 0.25, D / 2 - 0.25, 0.13), 0.12, 0.15, 0.26, mat('pot', '#f4f2ee', 0.35, coat=0.6), bevel=0.02)
    leaf = mat('leaf', '#4caf6a', 0.5, sss=0.1)
    leaf2 = mat('leaf2', '#3a9a5a', 0.5, sss=0.1)
    import random; random.seed(3)
    for i in range(14):
        an = radians(i * 360 / 14 + random.uniform(-10, 10)); el = random.uniform(25, 70)
        base = Vector((-W / 2 + 0.25, D / 2 - 0.25, 0.27))
        dirv = Vector((math.cos(an) * math.cos(radians(el)), math.sin(an) * math.cos(radians(el)), math.sin(radians(el))))
        tip = base + dirv * random.uniform(0.28, 0.42)
        ellipsoid('leaf', (base + tip) / 2, (0.05, 0.2, 0.012), leaf if i % 2 else leaf2, rot=(tip - base).to_track_quat('Y', 'Z'))
    # tulisan ZATAA di dinding belakang
    bpy.ops.object.text_add(location=(dx - 0.05, D / 2 - 0.01, 1.08), rotation=(radians(90), 0, 0))
    tx = bpy.context.object; tx.data.body = 'ZATAA'; tx.data.extrude = 0.018; tx.data.bevel_depth = 0.006; tx.data.size = 0.22
    tx.data.align_x = 'CENTER'; tx.data.align_y = 'CENTER'
    tx.data.materials.append(mat('sign', '#7c3aed', 0.3, coat=0.8, emit=0.3))
    # karpet bulat
    rug = frustum('rug', (-0.15, -0.3, 0.008), 0.62, 0.62, 0.016, mat('rug', '#d9cdf0', 0.95, sheen=0.6), bevel=0.006, seg=96); rug.scale = (1.15, 0.8, 1)
    # lampu gantung kecil
    capsule('cord', (dx - 0.05, dy - 0.1, 1.45), (dx - 0.05, dy - 0.1, 1.25), 0.004, leg)
    ell = ellipsoid('shade', (dx - 0.05, dy - 0.1, 1.22), (0.1, 0.1, 0.06), mat('shade', '#fbbf24', 0.4, coat=0.5))

room()

# ---------------------------------------------------------------- 2 karakter: Aprista (cewek) & Fikri (cowok)
character({'name': 'Aprista', 'g': 'f', 'skin': '#f0c9a8', 'skinD': '#e2b08e', 'hair': '#7a4526', 'brow': '#5a3320',
           'top': '#f2efe9', 'bot': '#1c1f2b', 'shoe': '#3a2f2a', 'skirt': True, 'lanyard': True, 'clip': True,
           'pose': {'head': (7, 4, 8), 'twist': 6, 'lean': -2, 'el': {1: (0.168, -0.012, 0.548)}, 'wr': {1: (0.09, -0.135, 0.56)},
                    'foot': {-1: (-0.004, -0.025, 12), 1: (0.006, 0.01, 8)}}}, (-0.5, -0.35, 0.012), 28)
character({'name': 'Fikri', 'g': 'm', 'skin': '#d9a77f', 'skinD': '#c8926a', 'hair': '#3d3430', 'brow': '#2c2420',
           'top': '#5b6475', 'topD': '#4a5263', 'bot': '#2e3440', 'shoe': '#5a3a2a', 'jacket': True, 'long_sleeve': True,
           'pose': {'head': (-4, 3, -6), 'twist': -5, 'lean': 2, 'pocket': 1, 'el': {1: (0.16, 0.035, 0.53), -1: (-0.148, 0.025, 0.55)},
                    'wr': {1: (0.118, 0.01, 0.43), -1: (-0.152, -0.04, 0.46)}, 'foot': {-1: (-0.01, 0.0, 10), 1: (0.012, -0.02, 14)}}}, (0.15, -0.5, 0.012), 18)

# ---------------------------------------------------------------- kamera isometrik + cahaya lembut
tgt = bpy.data.objects.new('target', None); COLL.objects.link(tgt); tgt.location = (-0.2, -0.4, 0.62) if CLOSE else (-0.05, 0.05, 0.42)
cam_d = bpy.data.cameras.new('cam'); cam_d.type = 'ORTHO'; cam_d.ortho_scale = 1.25 if CLOSE else 3.25
cam = bpy.data.objects.new('cam', cam_d); COLL.objects.link(cam)
az, el = (radians(24), radians(14)) if CLOSE else (radians(38), radians(33))
cam.location = tgt.location + 12 * Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
c = cam.constraints.new('TRACK_TO'); c.target = tgt; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
scene.camera = cam

sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 2.6; sun.angle = radians(12); sun.color = (1.0, 0.95, 0.88)
so = bpy.data.objects.new('sun', sun); COLL.objects.link(so); so.rotation_euler = (radians(50), radians(-10), radians(-35))
fill = bpy.data.lights.new('fill', 'AREA'); fill.energy = 260; fill.size = 4; fill.color = (0.92, 0.94, 1.0)
fo = bpy.data.objects.new('fill', fill); COLL.objects.link(fo); fo.location = (2.5, -3.5, 3.5)
fc = fo.constraints.new('TRACK_TO'); fc.target = tgt; fc.track_axis = 'TRACK_NEGATIVE_Z'; fc.up_axis = 'UP_Y'
lamp = bpy.data.lights.new('lamp', 'POINT'); lamp.energy = 25; lamp.color = (1.0, 0.8, 0.5); lamp.shadow_soft_size = 0.1
lo = bpy.data.objects.new('lamp', lamp); COLL.objects.link(lo); lo.location = (0.3, 0.65, 1.12)

world = bpy.data.worlds.new('w'); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = hexc('#efe8dc'); bg.inputs['Strength'].default_value = 0.85

scene.render.engine = 'CYCLES'
cy = scene.cycles; cy.samples = SAMPLES; cy.use_denoising = True
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'OPTIX'; prefs.get_devices()
    for d in prefs.devices: d.use = d.type == 'OPTIX'
    cy.device = 'GPU'
except Exception as e:
    print('GPU off:', e)
scene.render.resolution_x, scene.render.resolution_y = 1600, 1200
scene.render.film_transparent = False
try:
    scene.view_settings.view_transform = 'AgX'; scene.view_settings.look = 'AgX - Punchy'
except Exception:
    pass
scene.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print('RENDER OK', OUT)
