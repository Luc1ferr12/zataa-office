# Library karakter gaya "3D mainan" (toy / vinyl chibi) kantor Zataa.
# Semua bentuk dibuat dari primitif membulat yang dilebur (voxel remesh + smooth) → kesan dipahat.
# Data tiap pegawai ada di CHARS (rambut, kacamata, baju dalam/luar, bawahan, sepatu, properti, pose).
import bpy, bmesh, math, random, os
from math import radians, sqrt
from mathutils import Vector, Matrix

# gaya: 'toy' (lama, dipakai sprite kantor) | 'chibi' (gaya poster roster: seragam hitam-ungu, mata anime, rambut helaian)
STYLE = os.environ.get('TOY_STYLE', 'toy')
COLL = None
VOX = 1.0    # pengali ukuran voxel fuse (chibi: lebih rapat = lebih halus)
CHIN = 0.0   # chibi: dagu meruncing (0 = kepala bola)
HEAD_NOD = 0.0   # sprite kantor: kamera tinggi → kepala chibi didongakkan biar muka kelihatan (diatur toy_sprites.py)
def setup(collection):
    global COLL
    COLL = collection

# ---------------------------------------------------------------- material
def hexc(h, a=1.0):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [a]

def setin(node, names, val):
    for n in names if isinstance(names, (list, tuple)) else [names]:
        if n in node.inputs: node.inputs[n].default_value = val; return

MATS = {}
def mat(name, color, rough=0.55, sss=0.0, coat=0.0, sheen=0.0, emit=0.0, metal=0.0):
    key = f'{name}|{color}'
    if key in MATS: return MATS[key]
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    setin(b, 'Base Color', hexc(color)); setin(b, 'Roughness', rough); setin(b, 'Metallic', metal)
    if sss: setin(b, ['Subsurface Weight', 'Subsurface'], sss); setin(b, 'Subsurface Radius', (0.9, 0.45, 0.3)); setin(b, 'Subsurface Scale', 0.03)
    if coat: setin(b, ['Coat Weight', 'Clearcoat'], coat); setin(b, ['Coat Roughness', 'Clearcoat Roughness'], 0.25)
    if sheen: setin(b, ['Sheen Weight', 'Sheen'], sheen)
    if emit: setin(b, ['Emission Color', 'Emission'], hexc(color)); setin(b, 'Emission Strength', emit)
    MATS[key] = m
    return m

def pattern_mat(name, kind, c1, c2, scale=60.0, c3=None):
    """kain bermotif di koordinat objek: 'stripe' (garis horizontal) atau 'plaid' (kotak flanel)"""
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']; L = nt.links.new
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); L(tc.outputs['Object'], sep.inputs[0])
    def band(axis, sc, width=0.0):
        mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = sc
        L(sep.outputs[axis], mul.inputs[0])
        sn = nt.nodes.new('ShaderNodeMath'); sn.operation = 'SINE'; L(mul.outputs[0], sn.inputs[0])
        gt = nt.nodes.new('ShaderNodeMath'); gt.operation = 'GREATER_THAN'; gt.inputs[1].default_value = width; L(sn.outputs[0], gt.inputs[0])
        return gt.outputs[0]
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'
    mix.inputs[6].default_value = hexc(c1); mix.inputs[7].default_value = hexc(c2)
    if kind == 'stripe':
        L(band('Z', scale, 0.2), mix.inputs['Factor'])
        L(mix.outputs[2], b.inputs['Base Color'])
    else:
        add = nt.nodes.new('ShaderNodeMath'); add.operation = 'ADD'
        L(band('X', scale, 0.3), add.inputs[0]); L(band('Z', scale, 0.3), add.inputs[1])
        half = nt.nodes.new('ShaderNodeMath'); half.operation = 'MULTIPLY'; half.inputs[1].default_value = 0.5; L(add.outputs[0], half.inputs[0])
        L(half.outputs[0], mix.inputs['Factor'])
        # garis tipis terang (khas flanel)
        mix2 = nt.nodes.new('ShaderNodeMix'); mix2.data_type = 'RGBA'; mix2.inputs[7].default_value = hexc(c3 or '#d9d2c5')
        thin = nt.nodes.new('ShaderNodeMath'); thin.operation = 'MULTIPLY'; thin.inputs[1].default_value = 0.35
        L(band('X', scale * 0.5, 0.97), thin.inputs[0])
        L(mix.outputs[2], mix2.inputs[6]); L(thin.outputs[0], mix2.inputs['Factor'])
        L(mix2.outputs[2], b.inputs['Base Color'])
    setin(b, 'Roughness', 0.8); setin(b, ['Sheen Weight', 'Sheen'], 0.4)
    return m

# ---------------------------------------------------------------- bentuk dasar
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

def frustum(name, loc, r1, r2, h, m, parent=None, bevel=0.015, seg=48, rot=None):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r1, radius2=r2, depth=h)
    edges = [e for e in bm.edges if all(abs(abs(v.co.z) - h / 2) < 1e-5 for v in e.verts) and not e.is_boundary]
    rim = [e for e in edges if len(e.link_faces) == 2 and any(len(f.verts) > 4 for f in e.link_faces)]
    if bevel: bmesh.ops.bevel(bm, geom=rim, offset=bevel, offset_type='OFFSET', segments=4, profile=0.5, affect='EDGES', clamp_overlap=True)
    return finish(name, bm, m, loc, rot, parent, sharp=40)

def torus(name, center, axis, R, r, m, parent=None):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=48, minor_segments=12, location=center)
    t = bpy.context.object; t.name = name
    t.rotation_mode = 'QUATERNION'; t.rotation_quaternion = Vector(axis).normalized().to_track_quat('Z', 'Y')
    t.data.materials.clear(); t.data.materials.append(m); t.parent = parent
    for p in t.data.polygons: p.use_smooth = True
    return t

def boolean_cut(ob, cutter_loc, cutter_size, rot=None, shape='box'):
    c = (rbox('cut', cutter_loc, cutter_size, mat('cut', '#ff00ff'), bevel=0.02) if shape == 'box'
         else ellipsoid('cut', cutter_loc, cutter_size, mat('cut', '#ff00ff'), seg=48))
    if rot: c.rotation_mode = 'XYZ'; c.rotation_euler = rot
    c.parent = ob.parent
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.selected_objects: o.select_set(False)
    ob.select_set(True)
    keep = ob.data.materials[0]
    backup = ob.data.copy(); n0 = len(ob.data.vertices)
    for solver in ('EXACT', 'MANIFOLD', 'FLOAT'):   # kalau hasilnya kosong/rusak, coba solver lain
        mod = ob.modifiers.new('cut', 'BOOLEAN'); mod.operation = 'DIFFERENCE'; mod.object = c
        try: mod.solver = solver
        except Exception: ob.modifiers.remove(mod); continue
        bpy.ops.object.modifier_apply(modifier=mod.name)
        if len(ob.data.vertices) > n0 * 0.3: break
        old = ob.data; ob.data = backup.copy(); bpy.data.meshes.remove(old)
    bpy.data.meshes.remove(backup)
    bpy.data.objects.remove(c, do_unlink=True)
    ob.data.materials.clear(); ob.data.materials.append(keep)   # permukaan potongan ikut warna aslinya
    for p in ob.data.polygons: p.material_index = 0

def fuse(objs, voxel=0.0045, smooth=10):
    """lebur beberapa bentuk jadi satu massa halus (kayak dipahat)"""
    for o in bpy.context.selected_objects: o.select_set(False)
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = objs[0]
    r = ob.modifiers.new('rm', 'REMESH'); r.mode = 'VOXEL'; r.voxel_size = voxel * VOX
    bpy.ops.object.modifier_apply(modifier='rm')
    if smooth:
        sm = ob.modifiers.new('sm', 'SMOOTH'); sm.factor = 0.9; sm.iterations = smooth
        bpy.ops.object.modifier_apply(modifier='sm')
    for p in ob.data.polygons: p.use_smooth = True
    return ob

def flat(ob):
    for p in ob.data.polygons: p.use_smooth = False
    return ob

# ---------------------------------------------------------------- data pegawai
CHARS = {
    'sec': dict(name='Aprista', g='f', skin='#f0c9a8', hair='#6b3e22', brow='#4a2a18', hair_style='wavy_long', clip='#a78bfa',
                top=dict(kind='tee', color='#f4f1ea'), outer=dict(kind='blazer', color='#1f2a4a'),
                bottom=dict(kind='skirt', color='#e6d8bd', length='knee'), shoe=dict(kind='flat', color='#7a4a2e'),
                pose=dict(head=(6, 3, 8), twist=6, lean=-2, el={1: (0.205, 0.03, 0.56)}, wr={1: (0.125, 0.012, 0.47)},
                          foot={-1: (-0.004, -0.02, 12), 1: (0.006, 0.01, 8)})),
    'dir': dict(name='Andre', g='m', skin='#d6a47e', hair='#2a1d16', brow='#1d1410', hair_style='side_part',
                top=dict(kind='shirt', color='#2b4c7e', sleeve='long'), bottom=dict(kind='pants', color='#d9d2c2'),
                shoe=dict(kind='loafer', color='#5a3a26'), props=['watch'],
                pose=dict(head=(2, 2, 3), twist=2, pocket=[1], el={1: (0.16, 0.035, 0.53)}, wr={1: (0.118, 0.01, 0.43)},
                          foot={-1: (-0.012, 0, 12), 1: (0.012, 0, 12)}), scale=1.02),
    'researcher': dict(name='Clariana', g='f', skin='#ecc19c', hair='#5a3a26', brow='#3e2618', hair_style='pony_high', scrunchie='#9caf88',
                       glasses='#3b2a22', top=dict(kind='tee', color='#f4f1ea'), outer=dict(kind='cardigan', color='#9caf88'),
                       bottom=dict(kind='pants', color='#8a8d93'), shoe=dict(kind='slipon', color='#6b4430'), props=['notebook'],
                       pose=dict(head=(-5, 4, -6), twist=-4, el={1: (0.168, -0.012, 0.548)}, wr={1: (0.085, -0.13, 0.565)},
                                 foot={-1: (0, 0, 10), 1: (0, -0.015, 10)})),
    'copywriter': dict(name='Ista', g='f', skin='#e8bc96', hair='#8f3f22', brow='#5e2a16', hair_style='curly',
                       top=dict(kind='sweater', color='#d9a21b'), bottom=dict(kind='pants', color='#24242c'),
                       shoe=dict(kind='sneaker', color='#f4f2ee'),
                       pose=dict(head=(9, 2, 4), twist=3, lean=-2, foot={-1: (0, -0.02, 14), 1: (0, 0.01, 6)})),
    'designer': dict(name='Maria', g='f', skin='#efc6a2', hair='#7c4dbd', brow='#4a2f6e', hair_style='asym_short',
                     top=dict(kind='tee', color='#2b2b30'), outer=dict(kind='bomber', color='#6b7046'),
                     bottom=dict(kind='pants', color='#6f737a'), shoe=dict(kind='sneaker', color='#d4d6da'),
                     pose=dict(head=(-4, 2, 6), twist=-6, lean=2, pocket=[1], el={1: (0.16, 0.035, 0.53)}, wr={1: (0.118, 0.01, 0.43)},
                               foot={-1: (-0.01, 0, 10), 1: (0.012, -0.02, 14)})),
    'video': dict(name='Dimas', g='m', skin='#c99470', hair='#1d1a1a', brow='#141111', hair_style='casual', props=['headphones'],
                  top=dict(kind='tee', color='#f4f1ea'), outer=dict(kind='jacket', color='#8c9099'),
                  bottom=dict(kind='pants', color='#2c3038'), shoe=dict(kind='sneaker', color='#f4f2ee'),
                  pose=dict(head=(3, 3, -5), twist=4, pocket=[-1], el={-1: (-0.16, 0.035, 0.53)}, wr={-1: (-0.118, 0.01, 0.43)},
                            foot={-1: (-0.01, -0.02, 12), 1: (0.01, 0, 10)})),
    'publisher': dict(name='Fikri', g='m', skin='#d9a77f', hair='#1b1919', brow='#141111', hair_style='messy', props=['camera'],
                      top=dict(kind='hoodie', color='#3f4248'), bottom=dict(kind='jeans', color='#3d5a80'),
                      shoe=dict(kind='sneaker', color='#f4f2ee'),
                      pose=dict(head=(-4, 5, 5), twist=-3, el={1: (0.168, -0.012, 0.548)}, wr={1: (0.075, -0.13, 0.56)},
                                foot={-1: (0, 0, 12), 1: (0.01, -0.02, 10)})),
    'ads': dict(name='Fahriah', g='f', skin='#ecc4a0', hair='#c9cbd0', brow='#3a2a22', hair_style='hijab',
                top=dict(kind='tunic', color='#2f5fa8', color2='#f4f2ee'), bottom=dict(kind='pants', color='#22222a'),
                shoe=dict(kind='flat', color='#1d1d22'),
                props=['phone'], pose=dict(head=(5, 6, 4), twist=2, el={1: (0.168, -0.012, 0.548)}, wr={1: (0.085, -0.135, 0.56)},
                          foot={-1: (0, 0, 8), 1: (0, -0.015, 8)})),
    'analyst': dict(name='Raka', g='m', skin='#d4a07a', hair='#5a3a22', brow='#3a2416', hair_style='side_part', glasses='#2563eb',
                    top=dict(kind='tee', color='#f4f1ea'), outer=dict(kind='flannel', color='#b3262d', color2='#1d1b20'),
                    bottom=dict(kind='pants', color='#9a7350'), shoe=dict(kind='sneaker', color='#2b2b30', sole='#d8d8d8'),
                    pose=dict(head=(4, 2, -6), twist=5, lean=-1, foot={-1: (-0.01, 0, 12), 1: (0.01, -0.015, 12)})),
    'price': dict(name='Budi', g='m', skin='#c48f69', hair='#1b1717', brow='#141111', hair_style='short_neat', glasses='#1d1d22',
                  top=dict(kind='shirt', color='#a9cbe8'), bottom=dict(kind='pants', color='#2e3440'),
                  shoe=dict(kind='sneaker', color='#5a5f69', sole='#e8e8e8'),
                  pose=dict(head=(-3, 3, 5), twist=-4, pocket=[1], el={1: (0.16, 0.035, 0.53)}, wr={1: (0.118, 0.01, 0.43)},
                            foot={-1: (0, -0.015, 10), 1: (0.01, 0, 12)})),
    'owner': dict(name='Zamiir', g='m', skin='#cc9e7a', hair='#5a3a24', brow='#3a2416', hair_style='volume',
                  top=dict(kind='tee', color='#8b8f96'), outer=dict(kind='parka', color='#1f2d4d'),
                  bottom=dict(kind='cargo', color='#cdb58c'), shoe=dict(kind='boot', color='#6b4226'),
                  pose=dict(head=(2, 1, 3), twist=2, pocket=[-1, 1], el={-1: (-0.16, 0.035, 0.53), 1: (0.16, 0.035, 0.53)},
                            wr={-1: (-0.118, 0.01, 0.43), 1: (0.118, 0.01, 0.43)}, foot={-1: (-0.015, 0, 14), 1: (0.015, 0, 14)}), scale=1.04),
    'ob': dict(name='Mbak Sari', g='f', skin='#d6a882', hair='#1d1818', brow='#141111', hair_style='pony_low', scrunchie='#1d1818',
               top=dict(kind='polo', color='#1f3a5f'), bottom=dict(kind='pants', color='#22222a'),
               shoe=dict(kind='sneaker', color='#2b2b30', sole='#cfcfcf'), props=['apron', 'duster'],
               pose=dict(head=(6, 2, -4), twist=-3, el={1: (0.17, -0.0, 0.55)}, wr={1: (0.17, -0.085, 0.49)},
                         foot={-1: (0, 0, 10), 1: (0, -0.02, 10)})),
    # ---------------- tim Trading (spesifikasi Owner, 12 Okt 2026)
    'tdir': dict(name='Mahendra', g='m', skin='#c99a76', hair='#141111', brow='#141111', hair_style='side_part',
                 top=dict(kind='shirt', color='#f4f2ee', sleeve='long'), outer=dict(kind='blazer', color='#1f2a4a'),
                 bottom=dict(kind='pants', color='#1f2a4a'), shoe=dict(kind='oxford', color='#111014'), props=['tie'], tie='#7c3aed',
                 pose=dict(head=(2, 2, 3), twist=2, pocket=[1], el={1: (0.16, 0.035, 0.53)}, wr={1: (0.118, 0.01, 0.43)},
                           foot={-1: (-0.012, 0, 12), 1: (0.012, 0, 12)}), scale=1.03),
    'tresearch': dict(name='Davina', g='f', skin='#ecc19c', hair='#3d2416', brow='#2e1a10', hair_style='wavy_long',
                      glasses='#2a2a30', glasses_thin=True, top=dict(kind='shirt', color='#f4f2ee', sleeve='long'), outer=dict(kind='blazer', color='#3b1d5e'),
                      bottom=dict(kind='skirt', color='#17151d', length='knee', cut='pencil'), shoe=dict(kind='pump', color='#111014'),
                      props=['notebook'], pose=dict(head=(-5, 4, -6), twist=-4, el={1: (0.168, -0.012, 0.548)}, wr={1: (0.085, -0.13, 0.565)},
                                                    foot={-1: (0.004, 0, 8), 1: (-0.004, -0.015, 8)})),
    'ttech': dict(name='Keira', g='f', skin='#e8bc96', hair='#141111', brow='#141111', hair_style='pony_high', scrunchie='#141111',
                  top=dict(kind='shirt', color='#f4f2ee', sleeve='long'), outer=dict(kind='vest', color='#1c1b22'),
                  bottom=dict(kind='skirt', color='#17151d', length='knee', cut='aline'), shoe=dict(kind='loafer', color='#111014'),
                  props=['watch'], pose=dict(head=(4, 3, 6), twist=3, lean=-1, foot={-1: (-0.01, 0, 10), 1: (0.01, -0.01, 12)})),
    'teval': dict(name='Jihan', g='f', skin='#efc6a2', hair='#8b7d6b', brow='#5a4c3e', hair_style='bob', glasses='#2a2a30',
                  top=dict(kind='tee', color='#7c3aed'), outer=dict(kind='blazer', color='#1c1b22'),
                  bottom=dict(kind='skirt', color='#3a3a44', length='knee', cut='pencil'), shoe=dict(kind='lowheel', color='#111014'),
                  props=['notebook'], pose=dict(head=(-4, 3, 5), twist=-3, el={1: (0.168, -0.012, 0.548)}, wr={1: (0.085, -0.13, 0.565)},
                                                foot={-1: (0, 0, 8), 1: (0, -0.015, 10)})),
    'treport': dict(name='Selena', g='f', skin='#e6bd99', hair='#141111', brow='#141111', hair_style='halfup_long',
                    top=dict(kind='shirt', color='#f4f2ee', sleeve='long'), outer=dict(kind='cardigan', color='#7c3aed'),
                    bottom=dict(kind='skirt', color='#17151d', length='knee', cut='pleated'), shoe=dict(kind='flat', color='#111014'),
                    props=['phone'], pose=dict(head=(5, 5, 4), twist=2, el={1: (0.168, -0.012, 0.548)}, wr={1: (0.085, -0.135, 0.56)},
                                               foot={-1: (0, 0, 8), 1: (0, -0.015, 8)})),
    'texec': dict(name='Wiratama', g='m', skin='#d4a07a', hair='#4a2c1a', brow='#2e1a10', hair_style='messy',
                  top=dict(kind='tee', color='#1c1b22'), outer=dict(kind='techwear', color='#3b1764'),
                  bottom=dict(kind='pants', color='#1c1b22'), shoe=dict(kind='sneaker', color='#f4f2ee'), props=['watch'],
                  pose=dict(head=(-3, 3, -5), twist=-4, pocket=[1], el={1: (0.16, 0.035, 0.53)}, wr={1: (0.118, 0.01, 0.43)},
                            foot={-1: (-0.012, 0, 12), 1: (0.012, -0.015, 12)})),
    'trisk': dict(name='Aryaputra', g='m', skin='#c48f69', hair='#141111', brow='#141111', hair_style='undercut', glasses='#1d1d22',
                  top=dict(kind='hoodie', color='#1c1b22', accent='#7c3aed'), bottom=dict(kind='cargo', color='#1c1b22'),
                  shoe=dict(kind='sneaker', color='#f4f2ee'),
                  pose=dict(head=(3, 4, 4), twist=3, pocket=[-1, 1], el={-1: (-0.16, 0.035, 0.53), 1: (0.16, 0.035, 0.53)},
                            wr={-1: (-0.118, 0.01, 0.43), 1: (0.118, 0.01, 0.43)}, foot={-1: (-0.01, 0, 12), 1: (0.01, 0, 12)})),
    # ---------------- tim YouTube Shorts (sejarah misteri kuno, Okt 2026)
    'ydir': dict(name='Bagas', g='m', skin='#c99470', hair='#1b1717', brow='#141111', hair_style='short_neat',
                 top=dict(kind='shirt', color='#f4f2ee', sleeve='long'), outer=dict(kind='jacket', color='#991b1b'),
                 bottom=dict(kind='pants', color='#2c3038'), shoe=dict(kind='sneaker', color='#1d1d22', sole='#e8e8e8'), props=['watch'],
                 pose=dict(head=(2, 2, 3), twist=2, pocket=[1], el={1: (0.16, 0.035, 0.53)}, wr={1: (0.118, 0.01, 0.43)},
                           foot={-1: (-0.012, 0, 12), 1: (0.012, 0, 12)}), scale=1.02),
    'yresearch': dict(name='Nadhira', g='f', skin='#e8bc96', hair='#a16207', brow='#3a2416', hair_style='hijab', glasses='#3b2a22',
                      top=dict(kind='tunic', color='#c08a3e', color2='#f4f2ee'), bottom=dict(kind='pants', color='#3a3550'),
                      shoe=dict(kind='flat', color='#5a3a26'), props=['notebook'],
                      pose=dict(head=(-5, 4, -6), twist=-4, el={1: (0.168, -0.012, 0.548)}, wr={1: (0.085, -0.13, 0.565)},
                                foot={-1: (0, 0, 8), 1: (0, -0.015, 8)})),
    'yscript': dict(name='Laras', g='f', skin='#efc6a2', hair='#2b211c', brow='#1f1814', hair_style='bob', glasses='#7c2d12', glasses_thin=True,
                    top=dict(kind='sweater', color='#7c2d12'), bottom=dict(kind='skirt', color='#e6d8bd', length='knee', cut='aline'),
                    shoe=dict(kind='loafer', color='#3a2f2a'), props=['notebook'],
                    pose=dict(head=(-4, 3, 5), twist=-3, el={1: (0.168, -0.012, 0.548)}, wr={1: (0.085, -0.13, 0.565)},
                              foot={-1: (0, 0, 8), 1: (0, -0.015, 10)})),
    'yvisual': dict(name='Galih', g='m', skin='#d4a07a', hair='#262222', brow='#1d1a1a', hair_style='casual', props=['camera'],
                    top=dict(kind='tee', color='#2b2b30'), outer=dict(kind='flannel', color='#4d5d2a', color2='#1d1b20'),
                    bottom=dict(kind='jeans', color='#3d5a80'), shoe=dict(kind='sneaker', color='#f4f2ee'),
                    pose=dict(head=(-4, 5, 5), twist=-3, el={1: (0.168, -0.012, 0.548)}, wr={1: (0.075, -0.13, 0.56)},
                              foot={-1: (0, 0, 12), 1: (0.01, -0.02, 10)})),
    'yvideo': dict(name='Yoga', g='m', skin='#bd8f6b', hair='#141111', brow='#141111', hair_style='messy', props=['headphones'],
                   top=dict(kind='hoodie', color='#1e3a8a', accent='#f87171'), bottom=dict(kind='cargo', color='#22222a'),
                   shoe=dict(kind='sneaker', color='#f4f2ee'),
                   pose=dict(head=(3, 3, -5), twist=4, pocket=[-1], el={-1: (-0.16, 0.035, 0.53)}, wr={-1: (-0.118, 0.01, 0.43)},
                             foot={-1: (-0.01, -0.02, 12), 1: (0.01, 0, 10)})),
    'ypublish': dict(name='Kirana', g='f', skin='#ecc4a0', hair='#5a3d2e', brow='#3e2618', hair_style='pony_high', scrunchie='#be185d',
                     top=dict(kind='shirt', color='#f4f2ee', sleeve='long'), outer=dict(kind='cardigan', color='#be185d'),
                     bottom=dict(kind='skirt', color='#17151d', length='knee', cut='pleated'), shoe=dict(kind='flat', color='#111014'),
                     props=['phone'], pose=dict(head=(5, 5, 4), twist=2, el={1: (0.168, -0.012, 0.548)}, wr={1: (0.085, -0.135, 0.56)},
                                                foot={-1: (0, 0, 8), 1: (0, -0.015, 8)})),
    # ---------------- tim Zataa Story (misteri & horor Nusantara, 25 Okt 2026) — dasar gaya toy, tampilan web dari CHIBI di bawah
    'sdir': dict(name='Raditya', g='m', skin='#cf9a74', hair='#120e0e', brow='#100d0d', hair_style='short_neat',
                 top=dict(kind='tee', color='#1a181e'), outer=dict(kind='jacket', color='#1d1b22'), bottom=dict(kind='cargo', color='#141216'),
                 shoe=dict(kind='sneaker', color='#f4f2ee'), props=['watch'], pose=dict(head=(2, 2, 3), twist=2, pocket=[1], el={1: (0.16, 0.035, 0.53)}, wr={1: (0.118, 0.01, 0.43)}, foot={-1: (-0.012, 0, 12), 1: (0.012, 0, 12)}), scale=1.02),
    'sresearch': dict(name='Sekar', g='f', skin='#ecbf9a', hair='#2a1a14', brow='#22140f', hair_style='wavy_long',
                      top=dict(kind='tee', color='#1a181e'), outer=dict(kind='cardigan', color='#3b1a6b'), bottom=dict(kind='pants', color='#1a181e'),
                      shoe=dict(kind='flat', color='#111014'), props=['notebook'], pose=dict(head=(-5, 4, -6), twist=-4, el={1: (0.168, -0.012, 0.548)}, wr={1: (0.085, -0.13, 0.565)}, foot={-1: (0, 0, 8), 1: (0, -0.015, 8)})),
    'sscript': dict(name='Dinda', g='f', skin='#f0c8a6', hair='#3a2418', brow='#2e1a10', hair_style='bob', glasses='#3b1a6b', glasses_thin=True,
                    top=dict(kind='tee', color='#6d4bb3'), bottom=dict(kind='skirt', color='#17151d', length='knee', cut='aline'),
                    shoe=dict(kind='loafer', color='#111014'), props=['notebook'], pose=dict(head=(-5, 4, -6), twist=-4, el={1: (0.168, -0.012, 0.548)}, wr={1: (0.085, -0.13, 0.565)}, foot={-1: (0, 0, 8), 1: (0, -0.015, 8)})),
    'svisual': dict(name='Arga', g='m', skin='#d29a72', hair='#141010', brow='#120e0e', hair_style='casual', props=['camera'],
                    top=dict(kind='hoodie', color='#1c1a22', accent='#8b5cf6'), bottom=dict(kind='cargo', color='#141216'),
                    shoe=dict(kind='sneaker', color='#f4f2ee'), pose=dict(head=(2, 2, 3), twist=2, pocket=[1], el={1: (0.16, 0.035, 0.53)}, wr={1: (0.118, 0.01, 0.43)}, foot={-1: (-0.012, 0, 12), 1: (0.012, 0, 12)})),
    'svideo': dict(name='Bima', g='m', skin='#c49470', hair='#100d0d', brow='#100d0d', hair_style='messy', props=['headphones'],
                   top=dict(kind='tee', color='#1a181e'), outer=dict(kind='bomber', color='#2a1a48'), bottom=dict(kind='cargo', color='#141216'),
                   shoe=dict(kind='sneaker', color='#f4f2ee'), pose=dict(head=(2, 2, 3), twist=2, pocket=[1], el={1: (0.16, 0.035, 0.53)}, wr={1: (0.118, 0.01, 0.43)}, foot={-1: (-0.012, 0, 12), 1: (0.012, 0, 12)})),
    'spublish': dict(name='Nayla', g='f', skin='#efc4a0', hair='#1d1414', brow='#1a1212', hair_style='pony_high', scrunchie='#c4b5fd',
                     top=dict(kind='tee', color='#6d4bb3'), outer=dict(kind='cardigan', color='#151318'), bottom=dict(kind='pants', color='#efecf4'),
                     shoe=dict(kind='sneaker', color='#f4f2ee'), props=['phone'], pose=dict(head=(-5, 4, -6), twist=-4, el={1: (0.168, -0.012, 0.548)}, wr={1: (0.085, -0.13, 0.565)}, foot={-1: (0, 0, 8), 1: (0, -0.015, 8)})),
}
LOW_SHOES = ('flat', 'slipon', 'pump', 'lowheel', 'loafer', 'oxford')

# ---------------------------------------------------------------- gaya chibi poster (override CHARS kalau STYLE == 'chibi')
_CH = dict(chibi=True, eyes='pixar', head_scale=0.86, neck_up=0.02, leg=1.0, shoe_scale=1.14)
_J1 = dict(kind='sneaker', jordan=True, color='#f4f2ee', sole='#f4f2ee', accent='#7c3aed', dark='#1d1b22')
_POCKETS = dict(pocket=[-1, 1], el={-1: (-0.168, 0.012, 0.55), 1: (0.168, 0.012, 0.55)},
                wr={-1: (-0.112, -0.05, 0.448), 1: (0.112, -0.05, 0.448)})
_ARMS_CROSS = dict(cross=True, pocket=[-1, 1], el={-1: (-0.158, -0.05, 0.56), 1: (0.158, -0.07, 0.55)},
                   wr={-1: (0.07, -0.13, 0.565), 1: (-0.075, -0.172, 0.585)})
_BLK, _TEE, _PUR, _WHT = '#151318', '#1a181e', '#6d4bb3', '#efecf4'
_HOLD_TAB = dict(pocket=[], el={-1: (-0.15, -0.045, 0.54), 1: (0.155, -0.03, 0.53)}, wr={-1: (-0.055, -0.15, 0.565), 1: (0.07, -0.15, 0.59)})
_PHONE_UP = dict(pocket=[-1], el={-1: (-0.168, 0.012, 0.55), 1: (0.168, -0.012, 0.548)}, wr={-1: (-0.112, -0.05, 0.448), 1: (0.085, -0.135, 0.56)})
_DOWN = dict(pocket=[], el={-1: (-0.147, 0.022, 0.548), 1: (0.147, 0.022, 0.548)}, wr={-1: (-0.15, -0.035, 0.458), 1: (0.15, -0.035, 0.458)})
_ONE_POCKET = dict(pocket=[1], el={-1: (-0.147, 0.022, 0.548), 1: (0.168, 0.012, 0.55)}, wr={-1: (-0.15, -0.035, 0.458), 1: (0.112, -0.05, 0.448)})
def _ch(skin, hair, brow, style, top, outer, bottom, props, pose, **kw):
    return dict(_CH, skin=skin, hair=hair, brow=brow, iris='#3a2418', hair_style=style, top=top, outer=outer, bottom=bottom,
                shoe=kw.pop('shoe', _J1), props=['lanyard'] + props, card='#24212a', pose=pose, **kw)
_OV = lambda c=_BLK: dict(kind='overshirt', color=c, accent='#8b5cf6')
_BO = lambda c='#1f1a28': dict(kind='bomber_open', color=c, accent='#8b5cf6')
_CG = lambda c='#141216': dict(kind='cargo', color=c, baggy=True)
_WD = lambda c=_WHT: dict(kind='wide', color=c, cargo=True)
CHIBI = {
    # ---- Owner & sekretaris (lembar referensi Owner)
    'owner': _ch('#eab48e', '#110c0b', '#191311', 'wavy_crop', dict(kind='tee', color='#0f0e12'), _OV(), _CG(), ['watch'],
                 dict(_POCKETS, head=(1, 2, 0), twist=0, foot={-1: (-0.03, 0, 12), 1: (0.03, 0, 12)}), watch_side=1),
    'sec': _ch('#efbe9c', '#2b1a14', '#2a1b15', 'pony_wavy', dict(kind='tee', color=_TEE), _BO(), _WD(), ['sling'],
               dict(_POCKETS, head=(2, 2, 0), twist=0, foot={-1: (-0.022, 0, 10), 1: (0.022, 0, 10)}), scrunchie='#8b5cf6'),
    'ob': _ch('#d9a27c', '#1d1616', '#1a1414', 'pony_wavy', dict(kind='shirt', color=_WHT, sleeve='rolled'), None, dict(kind='pants', color='#1a181e'),
              ['apron'], dict(_DOWN, el={**_DOWN['el'], 1: (0.15, -0.07, 0.53)}, wr={**_DOWN['wr'], 1: (0.07, -0.17, 0.72)}, hold={1: 'cup'}, head=(4, 2, 0)),
              scrunchie='#8b5cf6', hair_seed=8),
    # ---- Marketing
    'dir': _ch('#e6b08a', '#1a1412', '#171210', 'wavy_crop', dict(kind='tee', color=_PUR), _OV('#1d1b22'), _CG(), [],
               dict(_ARMS_CROSS, head=(-3, 3, -6), twist=-3, foot={-1: (-0.014, 0, 14), 1: (0.014, -0.01, 14)}), hair_seed=5),
    'researcher': _ch('#efc29f', '#3a2418', '#2e1c14', 'long_wavy', dict(kind='tee', color=_TEE), _BO(), _WD('#1a181e'), ['tablet'],
                      dict(_HOLD_TAB, head=(-4, 3, -5)), glasses='#2a2030', hair_seed=12),
    'price': _ch('#d29a72', '#141010', '#120e0e', 'wavy_crop', dict(kind='tee', color=_PUR), _OV(), _CG(), ['phone'],
                 dict(_PHONE_UP, head=(-3, 8, 4)), glasses='#1d1d22', hair_seed=14, hair_vol=0.8),
    'copywriter': _ch('#ecbc98', '#5a2a18', '#4a2214', 'long_wavy', dict(kind='tee', color=_PUR), _BO(), _WD(), ['tablet'],
                      dict(_HOLD_TAB, head=(5, 3, 4)), hair_seed=21),
    'designer': _ch('#f0c6a4', '#4b2f7a', '#3a2460', 'bob_soft', dict(kind='hoodie', color='#5b3fa0', accent='#c4b5fd'), None, _WD('#1a181e'), ['tablet'],
                    dict(_HOLD_TAB, head=(-5, 2, 6)), hair_seed=31),
    'publisher': _ch('#d8a47c', '#151111', '#131010', 'wavy_crop', dict(kind='hoodie', color='#1c1a22', accent='#8b5cf6'), None, _CG(), ['camera'],
                     dict(_DOWN, head=(-4, 4, 5)), hair_seed=9),
    'video': _ch('#cf9a72', '#120f0f', '#110e0e', 'wavy_crop', dict(kind='tee', color=_TEE), _BO(), _CG(), ['headphones', 'phone'],
                 dict(_PHONE_UP, head=(3, 6, -5)), hair_seed=17, hair_vol=1.15),
    'ads': _ch('#efc4a2', '#6d4bb3', '#3a2a22', 'hijab_soft', dict(kind='tee', color=_TEE), _BO(), _WD('#1a181e'), ['phone'],
               dict(_PHONE_UP, head=(5, 6, 4))),
    'analyst': _ch('#d8a47e', '#2a1c14', '#22160f', 'wavy_crop', dict(kind='tee', color=_PUR), _OV(), _CG(), ['tablet'],
                   dict(_HOLD_TAB, head=(4, 4, -6)), glasses='#2563eb', hair_seed=23, hair_vol=0.9),
    # ---- YouTube Shorts
    'ydir': _ch('#cf9a74', '#141010', '#120e0e', 'wavy_crop', dict(kind='tee', color=_TEE), _OV(), _CG(), ['watch'],
                dict(_POCKETS, head=(2, 2, 3)), hair_seed=41, hair_vol=0.85),
    'yresearch': _ch('#ecbf9a', '#3b3566', '#3a2416', 'hijab_soft', dict(kind='tee', color=_TEE), _BO(), _WD(), ['tablet'],
                     dict(_HOLD_TAB, head=(-5, 4, -6)), glasses='#3b2a22'),
    'yscript': _ch('#f0c8a6', '#2b211c', '#1f1814', 'bob_soft', dict(kind='tee', color=_PUR), _BO(), _WD('#1a181e'), ['tablet'],
                   dict(_HOLD_TAB, head=(-4, 3, 5)), glasses='#7c2d12', glasses_thin=True, hair_seed=44),
    'yvisual': _ch('#d4a07a', '#1d1a1a', '#1a1717', 'wavy_crop', dict(kind='tee', color=_TEE), _OV(), _CG(), ['camera'],
                   dict(_DOWN, head=(-4, 5, 5)), hair_seed=47),
    'yvideo': _ch('#c49470', '#100d0d', '#100d0d', 'wavy_crop', dict(kind='hoodie', color='#1c1a22', accent='#8b5cf6'), None, _CG(), ['headphones'],
                  dict(_POCKETS, head=(3, 3, -5)), hair_seed=52, hair_vol=1.1),
    'ypublish': _ch('#efc4a0', '#3e2a20', '#2e1d16', 'pony_wavy', dict(kind='tee', color=_PUR), _BO(), _WD(), ['phone'],
                    dict(_PHONE_UP, head=(5, 5, 4)), scrunchie='#c4b5fd', hair_seed=55),
    # ---- Trading XAUUSD
    'tdir': _ch('#d2a07a', '#0f0c0c', '#0f0c0c', 'wavy_crop', dict(kind='shirt', color=_PUR, sleeve='long'), dict(kind='blazer', color='#151318'),
                dict(kind='pants', color='#151318'), ['tie', 'watch'], dict(_ONE_POCKET, head=(2, 2, 3)), tie='#1d1b22', hair_seed=61, hair_vol=0.8),
    'tresearch': _ch('#efc29e', '#2a1810', '#24140c', 'long_wavy', dict(kind='shirt', color=_WHT, sleeve='long'), dict(kind='blazer', color='#2a1d44'),
                     _WD('#151318'), ['tablet'], dict(_HOLD_TAB, head=(-5, 4, -6)), glasses='#2a2a30', glasses_thin=True, hair_seed=64),
    'ttech': _ch('#ecbe98', '#100d0d', '#100d0d', 'pony_wavy', dict(kind='tee', color=_TEE), _BO(), _WD(), ['tablet'],
                 dict(_HOLD_TAB, head=(4, 3, 6)), scrunchie='#8b5cf6', hair_seed=67),
    'trisk': _ch('#c89270', '#100d0d', '#100d0d', 'wavy_crop', dict(kind='hoodie', color='#151318', accent='#8b5cf6'), None, _CG(), [],
                 dict(_POCKETS, head=(3, 6, 4)), glasses='#1d1d22', hair_seed=71, hair_vol=0.9),
    'texec': _ch('#d4a07a', '#3a2418', '#2e1a10', 'wavy_crop', dict(kind='tee', color=_TEE), _BO('#2a1a48'), _CG(), ['headphones', 'watch'],
                 dict(_POCKETS, head=(-3, 3, -5)), hair_seed=73),
    'teval': _ch('#f0c6a2', '#6e5a48', '#4a3a2c', 'bob_soft', dict(kind='tee', color=_PUR), _OV('#1d1b22'), _WD(), ['tablet'],
                 dict(_HOLD_TAB, head=(-4, 3, 5)), glasses='#2a2a30', hair_seed=76),
    'treport': _ch('#eabb96', '#100d0d', '#100d0d', 'long_wavy', dict(kind='tee', color=_TEE), _BO(), _WD('#1a181e'), ['tablet'],
                   dict(_HOLD_TAB, head=(5, 5, 4)), hair_seed=79, hair_wave=0.008),
    # ---- Zataa Story (hitam-ungu kayak logo; Raditya manajer: tangan bersedekap)
    'sdir': _ch('#cf9a74', '#120e0e', '#100d0d', 'wavy_crop', dict(kind='tee', color=_TEE), _OV('#1d1b22'), _CG(), ['watch'],
                dict(_ARMS_CROSS, head=(2, 3, 4), twist=2, foot={-1: (-0.014, 0, 14), 1: (0.014, -0.01, 14)}), hair_seed=81, hair_vol=0.9),
    'sresearch': _ch('#ecbf9a', '#2a1a14', '#22140f', 'long_wavy', dict(kind='tee', color=_TEE), _BO('#2a1a48'), _WD('#1a181e'), ['tablet'],
                     dict(_HOLD_TAB, head=(-5, 4, -6)), hair_seed=84),
    'sscript': _ch('#f0c8a6', '#3a2418', '#2e1a10', 'bob_soft', dict(kind='tee', color=_PUR), _OV('#1d1b22'), _WD(), ['tablet'],
                   dict(_HOLD_TAB, head=(-4, 3, 5)), glasses='#3b1a6b', glasses_thin=True, hair_seed=87),
    'svisual': _ch('#d29a72', '#141010', '#120e0e', 'wavy_crop', dict(kind='hoodie', color='#1c1a22', accent='#8b5cf6'), None, _CG(), ['camera'],
                   dict(_DOWN, head=(-4, 5, 5)), hair_seed=90),
    'svideo': _ch('#c49470', '#100d0d', '#100d0d', 'wavy_crop', dict(kind='tee', color=_TEE), _BO('#2a1a48'), _CG(), ['headphones'],
                  dict(_POCKETS, head=(3, 3, -5)), hair_seed=93, hair_vol=1.1),
    'spublish': _ch('#efc4a0', '#1d1414', '#1a1212', 'pony_wavy', dict(kind='tee', color=_PUR), _BO(), _WD(), ['phone'],
                    dict(_PHONE_UP, head=(5, 5, 4)), scrunchie='#c4b5fd', hair_seed=96),
}

# ---------------------------------------------------------------- preset pose (digabung ke pose khas tiap karakter)
SIT_DROP = 0.16
_SIT_LEGS = dict(sit=True, drop=SIT_DROP, knee={-1: (-0.062, -0.2, 0.44), 1: (0.062, -0.2, 0.44)},
                 ankle={-1: (-0.066, -0.215, SIT_DROP + 0.085), 1: (0.066, -0.215, SIT_DROP + 0.085)}, foot={-1: (0, -0.215, 6), 1: (0, -0.215, 6)})
POSES = {
    'stand': {},
    'walk1': dict(knee={-1: (-0.06, -0.06, 0.26), 1: (0.058, 0.03, 0.25)}, ankle={-1: (-0.063, -0.1, 0.1), 1: (0.064, 0.095, 0.115)},
                  toe={1: -25}, el={-1: (-0.15, 0.05, 0.55), 1: (0.15, -0.04, 0.55)}, wr={-1: (-0.155, 0.07, 0.46), 1: (0.155, -0.09, 0.47)},
                  pocket=[], twist=-4, head=(0, 2, 0)),
    'walk3': dict(knee={1: (0.06, -0.06, 0.26), -1: (-0.058, 0.03, 0.25)}, ankle={1: (0.063, -0.1, 0.1), -1: (-0.064, 0.095, 0.115)},
                  toe={-1: -25}, el={1: (0.15, 0.05, 0.55), -1: (-0.15, -0.04, 0.55)}, wr={1: (0.155, 0.07, 0.46), -1: (-0.155, -0.09, 0.47)},
                  pocket=[], twist=4, head=(0, 2, 0)),
    'sit': dict(_SIT_LEGS, pocket=[], el={-1: (-0.15, 0.0, 0.55), 1: (0.15, 0.0, 0.55)}, wr={-1: (-0.12, -0.14, 0.47), 1: (0.12, -0.14, 0.47)}),
    'type': dict(_SIT_LEGS, pocket=[], el={-1: (-0.152, -0.03, 0.55), 1: (0.152, -0.03, 0.55)}, wr={-1: (-0.1, -0.21, 0.56), 1: (0.1, -0.21, 0.56)},
                 head=(0, 6, 0), twist=0),
}
_ARMS_DOWN = dict(pocket=[], el={-1: (-0.147, 0.022, 0.548), 1: (0.147, 0.022, 0.548)}, wr={-1: (-0.15, -0.035, 0.458), 1: (0.15, -0.035, 0.458)})
def _with(base, **kw):
    out = dict(POSES[base] if isinstance(base, str) else base)
    for k, v in kw.items():
        out[k] = {**out.get(k, {}), **v} if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out
POSES.update({
    'walk0': dict(_ARMS_DOWN, head=(0, 2, 0)),
    'type0': POSES['type'], 'type2': POSES['type'],
    'type1': _with('type', wr={-1: (-0.1, -0.21, 0.585)}), 'type3': _with('type', wr={1: (0.1, -0.21, 0.585)}),
    'type_up': _with('sit', el={-1: (-0.17, 0.0, 0.76), 1: (0.17, 0.0, 0.76)}, wr={-1: (-0.12, 0.02, 0.9), 1: (0.12, 0.02, 0.9)}, head=(0, -10, 0)),
    'type_face': _with('type', el={1: (0.14, -0.12, 0.52)}, wr={1: (0.1, -0.15, 0.7)}, head=(10, 4, 0)),
    'type_sleepy': _with('type', head=(4, 22, 0)),
    'talk0': POSES['sit'], 'talk1': _with('sit', head=(0, 0, 16)), 'talk3': _with('sit', head=(4, 0, -12)),
    'talk2': _with('sit', el={1: (0.17, -0.06, 0.56)}, wr={1: (0.16, -0.18, 0.65)}, head=(0, 0, 10)),
    'eat0': _with('sit', el={1: (0.15, -0.07, 0.53)}, wr={1: (0.07, -0.17, 0.72)}, hold={1: 'cup'}, head=(0, -4, 0)),
    'eat2': _with('sit', hold={1: 'cup'}),
    'drink': dict(_ARMS_DOWN, el={**_ARMS_DOWN['el'], 1: (0.15, -0.07, 0.53)}, wr={**_ARMS_DOWN['wr'], 1: (0.07, -0.17, 0.72)}, hold={1: 'cup'}, head=(0, -4, 0)),
    'phone': _with('sit', el={-1: (-0.14, -0.06, 0.53), 1: (0.14, -0.06, 0.53)}, wr={-1: (-0.045, -0.17, 0.58), 1: (0.045, -0.17, 0.58)}, hold={0: 'phone'}, head=(0, 14, 0)),
    'game': _with('sit', el={-1: (-0.14, -0.06, 0.53), 1: (0.14, -0.06, 0.53)}, wr={-1: (-0.06, -0.17, 0.56), 1: (0.06, -0.17, 0.56)}, hold={0: 'pad'}, head=(0, 10, 0)),
    'bench': POSES['sit'],
    'lie': dict(_ARMS_DOWN, lie=True, el={-1: (-0.16, 0.02, 0.548), 1: (0.16, 0.02, 0.548)}, wr={-1: (-0.175, -0.01, 0.46), 1: (0.175, -0.01, 0.46)}, head=(0, 0, 0)),
})
POSES['beanbag'] = _with('phone', drop=0.24, pitch=-16, knee={-1: (-0.07, -0.19, 0.5), 1: (0.07, -0.19, 0.5)},
                         ankle={-1: (-0.072, -0.25, 0.325), 1: (0.072, -0.25, 0.325)})
for f, sw in enumerate((0.0, 0.05, 0.0, -0.05)):   # nyapu: sapu digenggam dua tangan, ujungnya goyang
    POSES[f'sweep{f}'] = dict(pocket=[], el={-1: (-0.13, -0.05, 0.55), 1: (0.16, -0.02, 0.54)}, wr={-1: (0.02, -0.15, 0.6), 1: (0.09, -0.16, 0.5)},
                              hold={0: ('broom', sw)}, head=(0, 12, 0), twist=-6)
for f in range(4):   # renang gaya bebas: tangan bergantian
    a, b = (1, -1) if f < 2 else (-1, 1)
    up = (0.13 * a, -0.32, 0.74) if f % 2 == 0 else (0.16 * a, -0.18, 0.86)
    POSES[f'swim{f}'] = dict(pocket=[], el={a: (0.16 * a, -0.12, 0.7), b: (0.17 * b, 0.06, 0.55)}, wr={a: up, b: (0.15 * b, 0.12, 0.47)}, head=(0, -6, 0))
# sholat (lihat build: mukena untuk cewek, peci untuk cowok, tanpa sepatu)
_KNEEL = lambda D, kz, ky, ay: dict(knee={-1: (-0.065, ky, D + kz), 1: (0.065, ky, D + kz)}, ankle={-1: (-0.065, ay, D + 0.045), 1: (0.065, ay, D + 0.045)},
                                    toe={-1: 75, 1: 75}, drop=D)
POSES.update({
    'pray_qiyam': dict(pocket=[], el={-1: (-0.15, -0.04, 0.56), 1: (0.15, -0.04, 0.56)}, wr={-1: (0.035, -0.12, 0.6), 1: (-0.035, -0.13, 0.615)}, head=(0, 8, 0), pray=True),
    'pray_itidal': dict(_ARMS_DOWN, head=(0, 0, 0), pray=True),
    'pray_ruku': dict(pocket=[], pitch=82, wr_world={-1: (-0.09, -0.05, 0.27), 1: (0.09, -0.05, 0.27)}, head=(0, -10, 0), pray=True),
    'pray_sujud': dict(_KNEEL(0.19, 0.04, -0.06, 0.14), pocket=[], pitch=100, wr_world={-1: (-0.16, -0.3, 0.215), 1: (0.16, -0.3, 0.215)}, head=(0, -10, 0), pray=True),
    'pray_duduk': dict(_KNEEL(0.27, 0.05, -0.2, 0.04), pocket=[], pitch=4, wr_world={-1: (-0.085, -0.19, 0.43), 1: (0.085, -0.19, 0.43)}, head=(0, 6, 0), pray=True),
})

def shade(hex_, k):
    """gelap (k<0) / terang (k>0)"""
    h = hex_.lstrip('#'); c = [int(h[i:i + 2], 16) for i in (0, 2, 4)]
    t = 0 if k < 0 else 255
    return '#' + ''.join(f'{int(x + (t - x) * abs(k)):02x}' for x in c)

# ---------------------------------------------------------------- karakter
H = Vector((0, 0, 0.9)); R = (0.185, 0.17, 0.185)
BODY_SCALE = 1.7   # skala karakter di dunia kantor (tinggi ±1,9 m termasuk kepala besar)
def chin_f(z):
    zz = (z - H.z) / R[2]
    return 1.0 if zz >= 0 else 1 - CHIN * min(-zz, 1.0) ** 1.6

def surf(x, z, out=0.0):
    k = 1 - (x / (R[0] * chin_f(z))) ** 2 - ((z - H.z) / R[2]) ** 2
    return Vector((x, -R[1] * (1 - (1 - chin_f(z)) * 0.4) * sqrt(max(k, 0)) - out, z))

def build(cid, loc=(0, 0, 0), yaw=0.0, pose_name='stand'):
    cfg = CHARS[cid]
    if STYLE == 'chibi' and cid in CHIBI: cfg = {**cfg, **CHIBI[cid]}
    global VOX, CHIN
    VOX, CHIN = (0.7, 0.15) if cfg.get('chibi') else (1.0, 0.0)
    root =bpy.data.objects.new(cfg['name'], None); COLL.objects.link(root)
    P = root; g = cfg['g']; props = list(cfg.get('props', []))
    base = cfg.get('pose', {})
    over = POSES[pose_name]
    if over:   # pose aktivitas: kaki/lengan diganti, gaya kepala karakter tetap
        base = {k: v for k, v in base.items() if k in ('head', 'twist', 'lean')}
        props = [p for p in props if p not in ('notebook', 'phone', 'duster', 'tablet', 'camera')]   # dasi, jam, lanyard, tas tetap dipakai
        if 'head' in over and 'head' in base:   # gabung miringnya kepala khas karakter dengan pose
            over = {**over, 'head': tuple(a + b * 0.5 for a, b in zip(over['head'], base['head']))}
    pose = {**base, **over}
    if pose.get('pray'):   # sholat: cewek pakai mukena putih, cowok pakai peci; semua tanpa sepatu
        cfg = dict(cfg); props = []
        cfg['shoe'] = dict(kind='barefoot', color=cfg['skin'])
        cfg.pop('glasses', None) if g == 'f' else None
        if g == 'f':
            cfg.update(hair_style='mukena', hair='#f7f5f0', outer=None, top=dict(kind='tunic', color='#f7f5f0', color2='#f7f5f0'),
                       bottom=dict(kind='skirt', color='#f7f5f0', length='ankle'))
        else:
            cfg['peci'] = True; cfg['outer'] = None
            if not cfg.get('chibi'): cfg['hair_style'] = 'short_neat'
    nm = cfg['name']
    skin = mat('skin', cfg['skin'], 0.5, sss=0.15 if not cfg.get('chibi') else 0.3)
    skinD = mat('skinD', shade(cfg['skin'], -0.08), 0.5, sss=0.1)
    hair = mat('hair', cfg['hair'], 0.5, coat=0.12) if not cfg.get('chibi') else mat('hairS', cfg['hair'], 0.42, sheen=0.05, coat=0.1)
    T, O, B, S = cfg['top'], cfg.get('outer'), cfg['bottom'], cfg['shoe']
    SH_ = 0.08 if cfg.get('chibi') else 1.0
    top = (pattern_mat('tunic_' + nm, 'stripe', T['color'], T['color2'], 70) if T['kind'] == 'tunic' and T['color'] != T['color2']
           else mat('top', T['color'], 0.8, sheen=0.4 * SH_))
    bot = mat('bot', B['color'], 0.75, sheen=0.3 * SH_)
    POCKET = pose.get('pocket', [])

    SH = {s: Vector((0.118 * s, 0.0, 0.652)) for s in (-1, 1)}
    EL = {s: Vector(pose.get('el', {}).get(s, (0.147 * s, 0.022, 0.548))) for s in (-1, 1)}
    WR = {s: Vector(pose.get('wr', {}).get(s, (0.15 * s, -0.035, 0.458))) for s in (-1, 1)}
    PIV = Vector((0, 0, 0.46))
    RU = (Matrix.Rotation(radians(pose.get('twist', 0)), 4, 'Z') @ Matrix.Rotation(radians(pose.get('lean', 0)), 4, 'Y')
          @ Matrix.Rotation(radians(pose.get('pitch', 0)), 4, 'X'))
    for s_, w in pose.get('wr_world', {}).items():   # target tangan di dunia → koordinat badan atas (sebelum diputar)
        WR[s_] = (Matrix.Translation(PIV) @ RU.inverted() @ Matrix.Translation(-PIV)) @ Vector(w)
        mid = SH[s_].lerp(WR[s_], 0.5); out = Vector((0.04 * s_, 0.03, 0))
        EL[s_] = mid + out
    FT = {s: pose.get('foot', {}).get(s, (0.0, 0.0, 0.0)) for s in (-1, 1)}
    FX = {s: Vector((0.064 * s + FT[s][0], FT[s][1], 0)) for s in (-1, 1)}

    # ================= BAWAH (kaki, celana/rok, sepatu) — tidak ikut putaran badan atas
    skirt = B['kind'] == 'skirt'
    ankle_h = 0.07 if S['kind'] in LOW_SHOES + ('barefoot',) else 0.085
    SIT = pose.get('sit', False)
    HIP = {s: Vector((0.057 * s, 0, 0.43)) for s in (-1, 1)}
    # pergelangan kaki & lutut: default berdiri, bisa diatur per sendi (duduk / jalan)
    AK = {s: Vector(pose['ankle'][s]) if s in pose.get('ankle', {}) else FX[s] + Vector((0, 0, ankle_h)) for s in (-1, 1)}
    KN = {s: Vector(pose['knee'][s]) if s in pose.get('knee', {}) else HIP[s].lerp(AK[s], 0.5) + Vector((0, -0.007, 0)) for s in (-1, 1)}
    if skirt:
        for s in (-1, 1):
            fuse([capsule('thigh', HIP[s] + Vector((0, 0, -0.01)), KN[s], 0.05, skin, P, r2=0.042),
                  capsule('shin', KN[s], AK[s], 0.04, skin, P, r2=0.032)], 0.003, 6)
        knee = B.get('length') == 'knee'
        if SIT or pose.get('drop'):   # rok ikut menutup paha yang menjulur ke depan / berlutut
            parts = [ellipsoid('lap', (0, 0.0, 0.44), (0.12, 0.09, 0.065), bot, P)]
            ln = 1.0 if B.get('length') == 'ankle' else 0.92 if knee else 0.6
            for s in (-1, 1):
                parts.append(capsule('skthigh', HIP[s], HIP[s].lerp(KN[s], min(ln, 1.0)), 0.066, bot, P, r2=0.06))
                if B.get('length') == 'ankle': parts.append(capsule('skshin', KN[s], AK[s], 0.06, bot, P, r2=0.055))
            fuse(parts, 0.0035, 10)
        else:
            h = 0.43 if B.get('length') == 'ankle' else 0.25 if knee else 0.17
            cut = B.get('cut', 'aline')
            r1 = 0.21 if h > 0.3 else (0.128 if cut == 'pencil' else 0.2 if cut == 'pleated' else 0.19) if knee else 0.182
            sk = frustum('skirt', (0, 0, 0.47 - h / 2), r1, 0.104, h, bot, P, bevel=0.015, seg=64)
            if cut == 'pencil':
                sk.scale = (1, 0.82, 1)
                capsule('slit', (0.0, 0.1, 0.47 - h + 0.004), (0.0, 0.1, 0.47 - h + 0.08), 0.0035, mat('slit', shade(B['color'], -0.25), 0.8), P)
            if cut == 'pleated':   # lipitan: garis tegak mengelilingi rok
                pm = mat('pleat', shade(B['color'], 0.14), 0.75)
                for i in range(18):
                    a = i / 18 * 2 * math.pi
                    top_ = Vector((math.cos(a) * 0.106, math.sin(a) * 0.106, 0.465)); bot_ = Vector((math.cos(a) * (r1 + 0.004), math.sin(a) * (r1 + 0.004), 0.47 - h + 0.012))
                    capsule('pleat', top_, bot_, 0.004, pm, P)
        torus('waistband', (0, 0, 0.468), (0, 0, 1), 0.101, 0.0085, bot, P)
    else:
        parts = [ellipsoid('hips', (0, 0.0, 0.44), (0.11, 0.08, 0.065), bot, P)]
        wide = (0.014 if B.get('baggy') else 0.004) if B['kind'] == 'cargo' else 0.0
        flare = 0.017 if B['kind'] == 'wide' else 0.0   # celana kulot: makin ke bawah makin lebar
        for s in (-1, 1):
            parts.append(capsule('pleg', HIP[s], KN[s], 0.052 + wide + flare * 0.3, bot, P, r2=0.047 + wide + flare * 0.7))
            parts.append(capsule('pleg2', KN[s], AK[s] + Vector((0, 0, -0.012 if flare else 0)), 0.047 + wide + flare * 0.7, bot, P, r2=0.044 + wide + flare))
        fuse(parts, 0.0035, 8)
        if flare:
            for s in (-1, 1): boolean_cut(parts[0], AK[s] + Vector((0, 0, -0.06)), (0.2, 0.2, 0.1))   # ujung rata
        if not cfg.get('chibi'):
            for s in (-1, 1): torus('pcuff', AK[s] + Vector((0, 0, 0.005)), (KN[s] - AK[s]).normalized(), 0.043 + wide, 0.006, bot, P)
        if cfg.get('chibi') and (B['kind'] == 'cargo' or B.get('cargo')):   # saku cargo berpenutup, saku depan, lipatan di mata kaki
            pk = mat('cargo2', shade(B['color'], -0.06), 0.85, sheen=0.3)
            for s in (-1, 1):
                x0 = KN[s].x + (0.046 + wide + flare * 0.6) * s
                rbox('cargopocket', (x0, 0.0, 0.29), (0.026, 0.08, 0.09), pk, 0.012, P)
                rbox('cargoflap', (x0 + 0.004 * s, 0.0, 0.337), (0.032, 0.086, 0.026), pk, 0.009, P)
                capsule('fpocket', (0.068 * s, -0.075, 0.455), (0.1 * s, -0.05, 0.38), 0.003, mat('pseam', shade(B['color'], -0.25), 0.8), P)
                leg_r = 0.044 + wide + flare
                torus('stack', AK[s] + Vector((0, 0, 0.018)), (KN[s] - AK[s]).normalized() + Vector((0.12 * s, 0, 0)), leg_r - 0.002, 0.007 if not flare else 0.011, bot, P)
        elif B['kind'] == 'cargo':  # saku samping
            for s in (-1, 1):
                rbox('cargopocket', (0.105 * s, -0.01, 0.31), (0.022, 0.07, 0.08), mat('cargo2', shade(B['color'], -0.08), 0.8), 0.01, P)
        if B['kind'] == 'jeans':  # jahitan kuning khas jeans
            for s in (-1, 1):
                capsule('seam', HIP[s] + Vector((0.043 * s, -0.01, -0.01)), KN[s] + Vector((0.046 * s, 0, 0)), 0.0022, mat('seam', '#d9a441', 0.6), P)
                capsule('seam', KN[s] + Vector((0.046 * s, 0, 0)), AK[s] + Vector((0.042 * s, 0, 0.015)), 0.0022, mat('seam', '#d9a441', 0.6), P)
    pre_shoe = set(o.name for o in P.children)
    # sepatu
    shoe = mat('shoe', S['color'], 0.4 if S['kind'] != 'sneaker' else 0.6, coat=0.8 if S['kind'] in ('pump', 'oxford', 'lowheel') else 0.5 if S['kind'] != 'sneaker' else 0.1)
    sole = mat('sole', S.get('sole', '#f2efe9' if S['kind'] != 'sneaker' else '#ffffff'), 0.6)
    for s in (-1, 1):
        if S['kind'] == 'barefoot':
            ft = fuse([ellipsoid('toe', (0, -0.04, 0.026), (0.04, 0.06, 0.026), skin, P), ellipsoid('heel', (0, 0.015, 0.03), (0.036, 0.04, 0.03), skin, P),
                       capsule('ankle', (0, 0.0, 0.03), (0, 0.0, 0.085), 0.032, skin, P)], 0.003, 6)
            boolean_cut(ft, (0, -0.02, -0.05), (0.2, 0.3, 0.1))
            Rz = Matrix.Rotation(radians(FT[s][2] * s), 4, 'Z') @ Matrix.Rotation(radians(pose.get('toe', {}).get(s, 0)), 4, 'X')
            ft.matrix_basis = Matrix.Translation(Vector((AK[s].x, AK[s].y, AK[s].z - ankle_h))) @ Rz @ ft.matrix_basis
            continue
        low = S['kind'] in LOW_SHOES
        th = 0.028 if S['kind'] in ('flat', 'pump', 'lowheel') else 0.033 if low else 0.037
        parts = [ellipsoid('toe', (0, -0.045, 0.034), (0.046, 0.066, th), shoe, P),
                 ellipsoid('heel', (0, 0.018, 0.036), (0.043, 0.045, th + 0.003), shoe, P)]
        if not low: parts.append(capsule('ankle', (0, 0.0, 0.04), (0, 0.0, 0.085 if S['kind'] != 'boot' else 0.11), 0.042 if S['kind'] == 'boot' else 0.04, shoe, P))
        sh_ = fuse(parts, 0.003, 6)
        boolean_cut(sh_, (0, -0.02, -0.04), (0.2, 0.3, 0.1))
        if low and S['kind'] in ('flat', 'pump', 'lowheel'):  # bukaan punggung kaki
            boolean_cut(sh_, (0, -0.0, 0.075), (0.07, 0.09, 0.05), shape='ell')
        sh2 = 0.02 if S['kind'] != 'sneaker' else 0.026
        so_ = fuse([ellipsoid('stoe', (0, -0.045, 0.02), (0.05, 0.07, 0.03), sole, P), ellipsoid('sheel', (0, 0.018, 0.02), (0.047, 0.05, 0.03), sole, P)], 0.003, 6)
        boolean_cut(so_, (0, -0.02, sh2 + 0.05), (0.2, 0.3, 0.1)); boolean_cut(so_, (0, -0.02, -0.05), (0.2, 0.3, 0.1))
        objs = [sh_, so_]
        if S['kind'] in ('pump', 'lowheel'):   # hak sepatu
            hh = 0.035 if S['kind'] == 'pump' else 0.022
            objs.append(rbox('heelblk', (0, 0.035, -0.002 - hh / 2 + 0.012), (0.03, 0.03, hh), shoe, 0.006, P))
        if S['kind'] in ('loafer', 'oxford'):   # loafer: strap di punggung kaki · oxford: tali tipis
            if S['kind'] == 'loafer':
                objs.append(rbox('strap', (0, -0.035, 0.066), (0.06, 0.018, 0.008), mat('strapL', shade(S['color'], 0.18), 0.4, coat=0.5), 0.004, P))
            else:
                lace = mat('laceO', '#2a2a2e', 0.5)
                for i in range(3): objs.append(capsule('lace', (-0.014, -0.025 - i * 0.014, 0.068 - i * 0.004), (0.014, -0.025 - i * 0.014, 0.068 - i * 0.004), 0.0028, lace, P))
        if S['kind'] == 'sneaker':
            lace = mat('lace', '#ffffff' if S['color'] != '#f4f2ee' else '#d8d8d8', 0.6)
            for i in range(3):
                objs.append(capsule('lace', (-0.018, -0.03 - i * 0.017, 0.07 - i * 0.006), (0.018, -0.03 - i * 0.017, 0.07 - i * 0.006), 0.004, lace, P))
            objs.append(ellipsoid('toecap', (0, -0.085, 0.03), (0.04, 0.03, 0.022), sole, P))
            if S.get('jordan'):
                pm = mat('j1p', S['accent'], 0.45, coat=0.2); dk = mat('j1d', S.get('dark', '#1d1b22'), 0.45, coat=0.2)
                objs.append(ellipsoid('j1toe', (0, -0.07, 0.038), (0.0488, 0.05, 0.017), pm, P))
                objs.append(ellipsoid('j1heel', (0, 0.034, 0.046), (0.0465, 0.034, 0.042), dk, P))
                objs.append(torus('j1collar', (0, 0.006, 0.112), (0, 0.15, 1), 0.039, 0.009, dk, P))
                for sx in (-1, 1):
                    objs.append(rbox('j1eye', (0.026 * sx, -0.035, 0.066), (0.012, 0.06, 0.012), dk, 0.005, P, rot=Matrix.Rotation(radians(-16), 4, 'X').to_quaternion()))
            if S.get('accent'):
                ac = mat('snkacc', S['accent'], 0.5, coat=0.2)
                for sx in (-1, 1):
                    objs += [capsule('swoosh', (0.046 * sx, -0.07, 0.03), (0.047 * sx, -0.02, 0.042), 0.004, ac, P, r2=0.007),
                             capsule('swoosh', (0.047 * sx, -0.02, 0.042), (0.042 * sx, 0.03, 0.05), 0.007, ac, P, r2=0.003)]
                if not S.get('jordan'): objs.append(ellipsoid('heeltab', (0, 0.06, 0.06), (0.026, 0.012, 0.03), ac, P))
        Rz = Matrix.Rotation(radians(FT[s][2] * s), 4, 'Z') @ Matrix.Rotation(radians(pose.get('toe', {}).get(s, 0)), 4, 'X')
        base = Vector((AK[s].x, AK[s].y, AK[s].z - ankle_h))
        Ssh = Matrix.Scale(cfg.get('shoe_scale', 1.0), 4)
        for o in objs: o.matrix_basis = Matrix.Translation(base) @ Rz @ Ssh @ o.matrix_basis
    lower = set(o.name for o in P.children)
    Ls = cfg.get('leg', 1.0)   # chibi: kaki dipendekkan dari mata kaki ke atas
    if Ls != 1.0:
        Mz = Matrix.Translation((0, 0, 0.075)) @ Matrix.Diagonal((1, 1, Ls, 1)) @ Matrix.Translation((0, 0, -0.075))
        for o in P.children:
            if o.name in pre_shoe: o.matrix_basis = Mz @ o.matrix_basis

    # ================= ATAS
    capsule('neck', (0, 0, 0.64), (0, 0.004, 0.74), 0.04, skin, P)
    for s in (-1, 1):
        fuse([capsule('uarm', SH[s], EL[s], 0.036, skin, P, r2=0.032), capsule('farm', EL[s], WR[s], 0.032, skin, P, r2=0.027)], 0.003, 6)

    def blob(name, z0, z1, k, m, flare=0.0):
        bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=64, v_segments=40, radius=1.0)
        hz, cz = (z1 - z0) / 2, (z0 + z1) / 2
        def sm(a, b, t): t = min(max((t - a) / (b - a), 0), 1); return t * t * (3 - 2 * t)
        for v in bm.verts:
            zz = v.co.z
            rx = (0.106 + 0.016 * sm(-0.7, 0.35, zz) + flare * sm(-0.2, -1.0, zz)) * k
            ry = (0.077 + 0.008 * sm(-0.5, 0.3, zz) + flare * 0.7 * sm(-0.2, -1.0, zz)) * k
            z = cz + (zz * hz if zz >= 0 else -hz * (-zz) ** 0.8)
            v.co = Vector((v.co.x * rx, v.co.y * ry - 0.004 * sm(0, 0.5, zz), z))
        return finish(name, bm, m, (0, 0, 0), None, P)

    def hem(ob, z, m, r=0.012, name='hem'):
        """cincin ujung baju yang pas mengikuti lingkar bawah baju (elips)"""
        vs = [ob.matrix_basis @ v.co for v in ob.data.vertices if abs(v.co.z - z) < 0.006]
        rx = max((abs(v.x) for v in vs), default=0.105); ry = max((abs(v.y) for v in vs), default=0.08)
        t = torus(name, (0, 0, z + 0.004), (0, 0, 1), rx, r, m, P); t.scale = (1, ry / rx, 1)
        return t

    def garment(m, z0, k, sleeve, flare=0.0, sr=0.0):
        """badan baju + bahu + lengan baju, dilebur, ujung bawah dipotong rata. sleeve: none | short | long | rolled"""
        parts = [blob('body', z0, 0.71, k, m, flare)]
        for s in (-1, 1):
            parts.append(ellipsoid('shoulder', SH[s] + Vector((-0.012 * s, 0, -0.004)), (0.046 * k, 0.046 * k, 0.042 * k), m, P))
            if sleeve == 'long' and s not in POCKET:
                parts += [capsule('sl1', SH[s], EL[s], 0.04 + sr, m, P, r2=0.037 + sr), capsule('sl2', EL[s], WR[s] + (WR[s] - EL[s]) * -0.12, 0.037 + sr, m, P, r2=0.034 + sr)]
            elif sleeve == 'long':
                parts += [capsule('sl1', SH[s], EL[s], 0.04 + sr, m, P, r2=0.037 + sr), capsule('sl2', EL[s], WR[s], 0.037 + sr, m, P, r2=0.034 + sr)]
            elif sleeve == 'rolled':
                parts += [capsule('sl1', SH[s], EL[s], 0.04, m, P, r2=0.037), capsule('sl2', EL[s], EL[s].lerp(WR[s], 0.35), 0.037, m, P, r2=0.035)]
            elif sleeve == 'short':
                parts.append(capsule('sl', SH[s], SH[s].lerp(EL[s], 0.6), 0.046, m, P, r2=0.043))
        return fuse(parts, 0.0035, 14)

    def front_opening(ob, m_in, zlo, zhi, wb, wt, edge_m, er):
        """jaket terbuka: kulit permukaan depan jaket disalin jadi panel baju dalam + garis tepi kiri/kanan"""
        w = lambda z: wb + (wt - wb) * max(0.0, min(1.0, (z - zlo) / (zhi - zlo))) ** 1.4
        bm = bmesh.new(); bm.from_mesh(ob.data); bm.normal_update()
        kill = [v for v in bm.verts if not (v.co.y < -0.02 and zlo <= v.co.z <= zhi and abs(v.co.x) <= w(v.co.z))]
        bmesh.ops.delete(bm, geom=kill, context='VERTS')
        for v in bm.verts: v.co += v.normal * 0.0016
        finish('panel', bm, m_in, (0, 0, 0), None, P)
        for s in (-1, 1):
            pts = []
            for i in range(15):
                z = zlo + (zhi - zlo) * i / 14
                ok_, loc, nrm, _ = ob.ray_cast(Vector((s * w(z), -0.4, z)), Vector((0, 1, 0)))
                if ok_: pts.append(loc + nrm * 0.0015)
            for a, b in zip(pts, pts[1:]): capsule('edge', a, b, er, edge_m, P)

    def cuffs(sleeve, m, R_=0.031, r=0.006, sr=0.0):
        for s in (-1, 1):
            if s in POCKET and sleeve == 'long': continue
            if sleeve == 'long':
                torus('cuff', WR[s] + (WR[s] - EL[s]) * -0.12, WR[s] - EL[s], R_ + sr, r, m, P)
            elif sleeve == 'rolled':
                torus('roll', EL[s].lerp(WR[s], 0.33), WR[s] - EL[s], 0.036, 0.011, m, P)
            elif sleeve == 'short':
                torus('cuff', SH[s].lerp(EL[s], 0.6), EL[s] - SH[s], 0.042, 0.008, m, P)

    # ---- baju dalam
    kind = T['kind']
    tuck = skirt
    vest = bool(O) and O['kind'] == 'vest'
    sleeve_in = 'none' if O and not vest else T.get('sleeve') or {'tee': 'short', 'polo': 'short', 'sweater': 'long', 'hoodie': 'long', 'shirt': 'rolled', 'tunic': 'long'}[kind]
    z0 = {'tee': 0.45 if tuck else 0.41, 'polo': 0.41, 'sweater': 0.4, 'hoodie': 0.39, 'shirt': 0.41, 'tunic': 0.33}[kind]
    if O: z0 = max(z0, 0.42)
    inner = garment(top, z0, 1.0, sleeve_in, flare=0.012 if kind == 'tunic' else 0.0)
    rib = mat('rib', T['accent'], 0.6) if T.get('accent') else mat('rib', shade(T['color'], -0.12), 0.85)
    if not O or vest: cuffs(sleeve_in, rib if kind in ('sweater', 'hoodie') else top)
    if kind == 'tee' or kind == 'tunic':
        torus('collar', (0, 0.0, 0.69), (0, 0.25, 1), 0.052, 0.008, top if kind == 'tee' else mat('tcol', T['color'], 0.8), P)
    if kind == 'sweater':
        torus('collar', (0, 0.0, 0.69), (0, 0.25, 1), 0.053, 0.012, rib, P)
    if kind == 'hoodie':
        ellipsoid('hood', (0, 0.07, 0.715), (0.125, 0.07, 0.06), top, P)
        torus('hoodrim', (0, -0.005, 0.7), (0, 0.35, 1), 0.06, 0.016, rib if T.get('accent') else top, P)
        st = mat('string', T.get('accent', '#e8e6e1'), 0.6)
        if T.get('accent'):   # aksen: kantong kanguru + logo kecil
            rbox('kpocket', (0, -0.095, 0.47), (0.12, 0.012, 0.055), mat('kpk', shade(T['color'], 0.06), 0.8), 0.01, P)
            capsule('kline', (-0.06, -0.102, 0.5), (0.06, -0.102, 0.5), 0.003, rib, P)
            ellipsoid('hlogo', (0.05, -0.096, 0.6), (0.014, 0.004, 0.014), rib, P)
        for s in (-1, 1):
            capsule('string', (0.028 * s, -0.075, 0.69), (0.034 * s, -0.098, 0.6), 0.004, st, P)
            ellipsoid('aglet', (0.034 * s, -0.099, 0.597), (0.006, 0.006, 0.01), st, P)
    if kind == 'polo':
        col = mat('polocol', shade(T['color'], 0.08), 0.8)
        for s in (-1, 1):
            rbox('pcollar', (0.035 * s, -0.06, 0.705), (0.055, 0.02, 0.022), col, 0.007, P, rot=Matrix.Rotation(radians(-25 * s), 4, 'Y').to_quaternion())
        rbox('placket', (0, -0.083, 0.655), (0.022, 0.008, 0.06), col, 0.004, P)
        for z in (0.67, 0.64): ellipsoid('pbtn', (0, -0.088, z), (0.005, 0.003, 0.005), mat('btnw', '#f4f2ee', 0.3), P)
        ellipsoid('logo', (-0.055, -0.083, 0.64), (0.011, 0.004, 0.009), mat('logo', '#f59e0b', 0.4), P)  # bordir
    if kind == 'shirt' and O:   # kerah kemeja nongol di atas jas/rompi/kardigan
        col = mat('shirtcol', shade(T['color'], 0.1), 0.75)
        for s_ in (-1, 1):
            rbox('scollarO', (0.04 * s_, -0.07, 0.716), (0.06, 0.024, 0.028), col, 0.007, P, rot=Matrix.Rotation(radians(-30 * s_), 4, 'Y').to_quaternion())
    if kind == 'shirt' and not O:
        col = mat('shirtcol', shade(T['color'], 0.15), 0.75)
        for s in (-1, 1):
            rbox('scollar', (0.036 * s, -0.058, 0.705), (0.058, 0.022, 0.026), col, 0.007, P, rot=Matrix.Rotation(radians(-28 * s), 4, 'Y').to_quaternion())
        for j in range(5): ellipsoid('sbtn', (0, -0.087 + (j * 0.001), 0.66 - j * 0.05), (0.005, 0.003, 0.005), mat('btnw', '#f4f2ee', 0.3), P)
        capsule('splacket', (0, -0.085, 0.69), (0, -0.083, 0.42), 0.003, mat('screase', shade(T['color'], -0.1), 0.8), P)
        rbox('spocket', (0.055, -0.083, 0.6), (0.045, 0.01, 0.05), col, 0.008, P)
    if kind == 'tunic':  # bagian bawah tunik jatuh lurus menutup pinggul
        frustum('tunichem', (0, 0, 0.385), 0.128, 0.112, 0.11, top, P, bevel=0.012, seg=64).scale = (1, 0.78, 1)

    # ---- baju luar (terbuka di depan, kecuali bomber)
    if O:
        ok = O['kind']
        oc = pattern_mat('flannel_' + nm, 'plaid', O['color'], O['color2'], 55) if ok == 'flannel' else mat('outer', O['color'], 0.8, sheen=0.35 * SH_)
        oz0 = {'blazer': 0.38, 'cardigan': 0.36, 'flannel': 0.38, 'parka': 0.33, 'jacket': 0.39, 'bomber': 0.42, 'vest': 0.4, 'techwear': 0.37, 'overshirt': 0.385, 'bomber_open': 0.415}[ok]
        outer = garment(oc, oz0, 1.07, 'none' if ok == 'vest' else 'rolled' if ok == 'overshirt' else 'long', sr=0.004)
        trim = mat('otrim', shade(O['color'], -0.15 if O['color'] != '#1c1b22' else 0.12), 0.8)
        if ok != 'bomber':
            wb, wt = {'blazer': (0.012, 0.056), 'cardigan': (0.02, 0.046), 'flannel': (0.026, 0.046), 'jacket': (0.028, 0.04), 'parka': (0.03, 0.044),
                      'vest': (0.016, 0.06), 'techwear': (0.026, 0.038), 'overshirt': (0.03, 0.05), 'bomber_open': (0.034, 0.048)}[ok]
            edge_m = mat('zip', '#c9c9c9', 0.3, metal=0.7) if ok in ('jacket', 'parka', 'techwear') else trim
            if pose.get('cross'):   # lengan bersilang di depan: bukaan dihitung dari badan saja, bukan lengan
                tmp = garment(oc, oz0, 1.07, 'none', sr=0.004)
                front_opening(tmp, top, oz0 + 0.03, 0.716, wb, wt, edge_m, 0.0042)
                bpy.data.objects.remove(tmp, do_unlink=True)
            else: front_opening(outer, top, oz0 + 0.03, 0.716, wb, wt, edge_m, 0.0042 if ok != 'blazer' else 0.0055)
        if ok == 'overshirt': cuffs('rolled', oc)
        elif ok != 'vest': cuffs('long', trim if ok in ('bomber', 'cardigan', 'techwear', 'bomber_open') else oc, 0.035, 0.0065 if ok != 'bomber' else 0.01, sr=0.004)
        if ok == 'vest':   # rompi: kancing + saku welt
            for j in range(3): ellipsoid('vbtn', (0.026, -0.097, 0.56 - j * 0.05), (0.006, 0.004, 0.006), mat('vbtnc', '#3a3a40', 0.3, coat=0.6), P)
            for s_ in (-1, 1): rbox('vwelt', (0.06 * s_, -0.094, 0.5), (0.04, 0.008, 0.007), trim, 0.003, P)
        if ok == 'techwear':   # jaket techwear: kerah tinggi, strap dada + gesper, kantong lengan, garis reflektif
            zp = mat('zip', '#c9c9c9', 0.3, metal=0.7)
            torus('tcollar', (0, 0.0, 0.705), (0, 0.2, 1), 0.07, 0.02, oc, P)
            strap = mat('tstrap', '#141218', 0.6)
            capsule('tstrap', (-0.1, -0.09, 0.66), (0.1, -0.098, 0.5), 0.008, strap, P)
            rbox('tbuckle', (0.0, -0.104, 0.58), (0.028, 0.01, 0.022), mat('tbk', '#b8bcc4', 0.25, metal=0.8), 0.004, P)
            for s_ in (-1, 1):
                rbox('tpocket', (0.07 * s_, -0.096, 0.47), (0.045, 0.012, 0.05), trim, 0.006, P)
                capsule('trefl', SH[s_].lerp(EL[s_], 0.55) + Vector((0.038 * s_, -0.005, 0)), SH[s_].lerp(EL[s_], 0.55) + Vector((0.034 * s_, -0.03, -0.004)), 0.004, mat('trefl', '#a78bfa', 0.3, emit=0.6), P)
        acc = mat('oacc', O.get('accent', '#8b5cf6'), 0.5, sheen=0.3)
        if ok == 'overshirt':   # hood di punggung, aksen ungu (dalam gulungan lengan, tab ujung), logo Z di dada kiri
            ellipsoid('ohood', (0, 0.082, 0.68), (0.115, 0.04, 0.07), oc, P)
            torus('ohoodrim', (0, 0.012, 0.7), (0, 0.45, 1), 0.066, 0.011, oc, P)
            for s_ in (-1, 1):
                torus('rollp', EL[s_].lerp(WR[s_], 0.4), WR[s_] - EL[s_], 0.033, 0.004, acc, P)
                rbox('hemtab', (0.075 * s_, -0.1, oz0 + 0.022), (0.018, 0.008, 0.012), acc, 0.003, P)
            zmark((0.068, -0.101, 0.64), 0.022, acc, P, normal=(0.25, -1, 0), r=0.0028)
        if ok == 'bomber_open':   # bomber: kerah & ujung rib, garis + logo Z ungu di lengan
            torus('bcollar', (0, 0.0, 0.704), (0, 0.32, 1), 0.066, 0.014, trim, P)
            vs = [outer.matrix_basis @ v.co for v in outer.data.vertices if abs(v.co.z - oz0 - 0.012) < 0.006]
            rx = max((abs(v.x) for v in vs), default=0.12); ry = max((abs(v.y) for v in vs), default=0.09)
            ring = [Vector((math.sin(math.radians(a)) * rx, -math.cos(math.radians(a)) * ry, oz0 + 0.012)) for a in range(24, 337, 12)]
            for a_, b_ in zip(ring, ring[1:]): capsule('bhem', a_, b_, 0.009, trim, P)
            for s_ in (-1, 1):
                for f_ in (0.15, 0.5):
                    a_ = SH[s_].lerp(EL[s_], f_) + Vector((0.044 * s_, -0.006, 0)); b_ = SH[s_].lerp(EL[s_], f_ + 0.38) + Vector((0.042 * s_, -0.006, 0))
                    capsule('bstripe', a_, b_, 0.0065, acc, P)
                zmark(SH[s_].lerp(EL[s_], 0.45) + Vector((0.026 * s_, -0.038, 0)), 0.03, acc, P, normal=(0.6 * s_, -1, 0), r=0.0034)
        if ok == 'blazer' and cfg.get('chibi'):
            lap_ = mat('lapelC', shade(O['color'], 0.12), 0.6, sheen=0.4)
            for s_ in (-1, 1):
                rbox('lapel', (0.046 * s_, -0.095, 0.615), (0.03, 0.007, 0.15), lap_, 0.006, P,
                     rot=(Matrix.Rotation(radians(22 * s_), 4, 'Z') @ Matrix.Rotation(radians(18 * s_), 4, 'Y')).to_quaternion())
        if ok == 'blazer':
            lap = mat('lapel', shade(O['color'], 0.1), 0.7)
            ellipsoid('btn', (0.034, -0.096, 0.47), (0.009, 0.005, 0.009), mat('btnd', '#c8a25a', 0.3, metal=0.6), P)
            rbox('bpocket', (-0.075, -0.088, 0.62), (0.04, 0.01, 0.008), lap, 0.003, P)
        if ok == 'cardigan':
            for j in range(4): ellipsoid('cbtn', (0.032, -0.095, 0.6 - j * 0.055), (0.007, 0.004, 0.007), mat('cbtn', '#f4f1ea', 0.3), P)
        if ok == 'flannel':
            fc = pattern_mat('flannelc_' + nm, 'plaid', O['color'], O['color2'], 55)
            for s in (-1, 1):
                rbox('fcollar', (0.05 * s, -0.07, 0.705), (0.06, 0.022, 0.028), fc, 0.007, P, rot=Matrix.Rotation(radians(-30 * s), 4, 'Y').to_quaternion())
                rbox('fpocket', (0.06 * s, -0.093, 0.61), (0.042, 0.01, 0.045), fc, 0.006, P)
        if ok == 'parka':
            ellipsoid('phood', (0, 0.08, 0.72), (0.12, 0.065, 0.06), oc, P)
            zp = mat('zip', '#c9c9c9', 0.3, metal=0.7)
            for s in (-1, 1):
                capsule('pzip', (0.03 * s, -0.098, 0.65), (0.03 * s, -0.098, 0.35), 0.003, zp, P)
                capsule('ppocket', (0.05 * s, -0.098, 0.5), (0.085 * s, -0.09, 0.44), 0.004, trim, P)
                capsule('pstring', (0.03 * s, -0.09, 0.69), (0.034 * s, -0.1, 0.62), 0.0035, mat('string', '#e8e6e1', 0.6), P)
        if ok == 'jacket':
            zp = mat('zip', '#c9c9c9', 0.3, metal=0.7)
            torus('jcollar', (0, 0.0, 0.7), (0, 0.3, 1), 0.066, 0.014, oc, P)
            for s in (-1, 1): capsule('jzip', (0.027 * s, -0.096, 0.63), (0.027 * s, -0.096, 0.4), 0.0028, zp, P)
            for s in (-1, 1): capsule('jpocketline', (0.06 * s, -0.093, 0.48), (0.08 * s, -0.09, 0.44), 0.003, trim, P)
        if ok == 'bomber':
            torus('bcollar', (0, 0.0, 0.705), (0, 0.25, 1), 0.06, 0.014, trim, P)
            capsule('bzip', (0, -0.098, 0.69), (0, -0.098, 0.43), 0.0035, mat('zip', '#c9c9c9', 0.3, metal=0.7), P)
            rbox('bpatch', (-0.17, -0.02, 0.6), (0.02, 0.03, 0.03), mat('patch', '#f59e0b', 0.5), 0.006, P)

    # ---- properti
    if 'tie' in props and not pose.get('pray'):
        tm = mat('tie', cfg.get('tie', '#7c3aed'), 0.4, sheen=0.4)
        ellipsoid('tieknot', (0, -0.088, 0.688), (0.014, 0.009, 0.013), tm, P)
        rbox('tie1', (0, -0.094, 0.625), (0.026, 0.006, 0.11), tm, 0.004, P)
        rbox('tie2', (0, -0.096, 0.545), (0.034, 0.006, 0.07), tm, 0.006, P)
    if 'lanyard' in props and not pose.get('pray'):   # tali ID ungu + kartu pegawai
        ly = mat('lanyard', '#7c3aed', 0.55, sheen=0.3)
        zc = 0.52
        for s in (-1, 1):
            pts = [Vector((0.062 * s, 0.01, 0.712)), Vector((0.058 * s, -0.07, 0.695)), Vector((0.034 * s, -0.106, 0.62)), Vector((0.008 * s, -0.113, zc + 0.05))]
            for a, b in zip(pts, pts[1:]): capsule('lany', a, b, 0.0045, ly, P)
        rbox('idclip', (0, -0.114, zc + 0.045), (0.014, 0.008, 0.016), mat('idclip', '#b8bcc4', 0.3, metal=0.8), 0.003, P)
        rbox('idcard', (0, -0.116, zc), (0.056, 0.006, 0.076), mat('idcard', cfg.get('card', '#f7f5fb'), 0.4, coat=0.4), 0.006, P)
        if cfg.get('card'):   # kartu gelap + logo Z
            zmark((0, -0.1195, zc - 0.004), 0.026, mat('zlogo', '#a78bfa', 0.4, emit=0.6), P, r=0.0026)
        else:
            rbox('idband', (0, -0.1195, zc + 0.024), (0.056, 0.002, 0.02), ly, 0.002, P)
            rbox('idphoto', (-0.013, -0.1195, zc - 0.008), (0.018, 0.002, 0.024), mat('idphoto', '#c9c3d6', 0.5), 0.002, P)
            for j in range(2): rbox('idline', (0.012, -0.1195, zc - 0.002 - j * 0.012), (0.018, 0.002, 0.004), mat('idline', '#a8a2b8', 0.5), 0.001, P)
    if 'bag' in props and not pose.get('pray'):   # tas selempang ungu di pinggul kanan
        bg_ = mat('bag', '#4c2f8a', 0.45, coat=0.3)
        capsule('bstrap', (-0.1, 0.01, 0.705), (0.18, -0.03, 0.47), 0.006, mat('bstrap', '#1d1b22', 0.6), P)
        rbox('bag', (0.185, -0.03, 0.42), (0.045, 0.11, 0.1), bg_, 0.018, P, rot=Matrix.Rotation(radians(8), 4, 'Y').to_quaternion())
        rbox('bagflap', (0.21, -0.03, 0.445), (0.006, 0.105, 0.06), mat('bagflap', '#5b3fa0', 0.45, coat=0.3), 0.004, P, rot=Matrix.Rotation(radians(8), 4, 'Y').to_quaternion())
        rbox('bagbuckle', (0.215, -0.03, 0.43), (0.006, 0.018, 0.012), mat('idclip', '#b8bcc4', 0.3, metal=0.8), 0.002, P)
    if 'sling' in props and not pose.get('pray'):   # tas selempang hitam: tali dari bahu kiri menyilang ke pinggul kanan
        bk = mat('sling', '#1c1a20', 0.5, coat=0.2)
        for a_, b_ in (((-0.1, 0.0, 0.725), (-0.135, -0.075, 0.64)), ((-0.135, -0.075, 0.64), (-0.165, -0.06, 0.49)),
                       ((-0.1, 0.0, 0.725), (-0.14, 0.08, 0.62)), ((-0.14, 0.08, 0.62), (-0.175, 0.05, 0.49))):
            capsule('sstrap', a_, b_, 0.009, bk, P)
        rbox('slingbag', (-0.175, -0.01, 0.43), (0.05, 0.12, 0.11), bk, 0.022, P, rot=Matrix.Rotation(radians(-8), 4, 'Y').to_quaternion())
        rbox('slingflap', (-0.2, -0.012, 0.455), (0.008, 0.116, 0.065), mat('slingf', '#26232b', 0.45, coat=0.3), 0.006, P, rot=Matrix.Rotation(radians(-8), 4, 'Y').to_quaternion())
        rbox('slingbuckle', (-0.206, -0.012, 0.432), (0.006, 0.016, 0.014), mat('idclip', '#b8bcc4', 0.3, metal=0.8), 0.002, P)
    if 'tablet' in props and not pose.get('pray'):   # tablet hitam dipeluk di depan dada, dipegang dua tangan
        c = (WR[-1] + WR[1]) / 2 + Vector((0, -0.012, 0.045))
        rq = Matrix.Rotation(radians(-14), 4, 'X') @ Matrix.Rotation(radians(-8), 4, 'Y')
        rbox('tablet', c, (0.14, 0.011, 0.19), mat('tablet', '#1a1820', 0.3, coat=0.7), 0.012, P, rot=rq.to_quaternion())
        rbox('tabletlogo', c + rq.to_3x3() @ Vector((0, -0.0065, 0.02)), (0.022, 0.002, 0.022), mat('tablogo', '#7c3aed', 0.3, emit=0.4), 0.004, P, rot=rq.to_quaternion())
    if 'watch' in props and not pose.get('pray'):
        s_ = cfg.get('watch_side', -1)
        if s_ not in POCKET or cfg.get('chibi'):
            d = (WR[s_] - EL[s_]).normalized(); c = WR[s_] - d * 0.03
            torus('wband', c, d, 0.03, 0.0065, mat('wband', '#141218', 0.5), P)
            out_ = Vector((s_ * 0.9, -0.45, 0.2)).normalized()
            ellipsoid('wface', c + out_ * 0.029, (0.016, 0.016, 0.016), mat('wface', '#1d1d22', 0.2, coat=0.9), P, rot=out_.to_track_quat('Z', 'Y'))
            ellipsoid('wscr', c + out_ * 0.036, (0.011, 0.011, 0.004), mat('wscr', '#5eead4', 0.2, emit=1.2), P, rot=out_.to_track_quat('Z', 'Y'))
    if 'notebook' in props:
        s = 1
        d = (WR[s] - EL[s]).normalized()
        rbox('notebook', WR[s] + d * 0.03 + Vector((-0.03, 0.012, 0.0)), (0.11, 0.022, 0.14), mat('nb', '#7c3aed', 0.5, coat=0.3), 0.008, P,
             rot=Matrix.Rotation(radians(-12), 4, 'Z').to_quaternion())
        rbox('nbpages', WR[s] + d * 0.03 + Vector((-0.03, 0.02, 0.0)), (0.104, 0.012, 0.134), mat('paper', '#f7f3ea', 0.7), 0.004, P,
             rot=Matrix.Rotation(radians(-12), 4, 'Z').to_quaternion())
    if 'phone' in props:
        s = 1; d = (WR[s] - EL[s]).normalized(); c = WR[s] + d * 0.035 + Vector((-0.02, -0.01, 0.01))
        rq = Matrix.Rotation(radians(-12), 4, 'Z') @ Matrix.Rotation(radians(-25), 4, 'X')
        rbox('phone', c, (0.055, 0.01, 0.1), mat('phoneb', '#1d1d22', 0.3, coat=0.6), 0.008, P, rot=rq.to_quaternion())
        rbox('screen', c + rq.to_3x3() @ Vector((0, -0.0055, 0)), (0.048, 0.002, 0.09), mat('phonesc', '#a78bfa', 0.2, emit=1.5), 0.004, P, rot=rq.to_quaternion())
    if 'camera' in props:
        blk = mat('cam', '#1d1d22', 0.35, coat=0.4)
        strap = mat('strap', '#7c3aed', 0.6)
        for s in (-1, 1): capsule('cstrap', (0.07 * s, -0.04, 0.7), (0.038 * s, -0.12, 0.575), 0.006, strap, P)
        rbox('cambody', (0, -0.125, 0.56), (0.085, 0.04, 0.055), blk, 0.012, P)
        frustum('lens', (0, -0.155, 0.555), 0.022, 0.02, 0.03, blk, P, bevel=0.004, rot=Vector((0, -1, 0)).to_track_quat('Z', 'Y'))
        ellipsoid('glass', (0, -0.171, 0.555), (0.015, 0.004, 0.015), mat('glassL', '#3b4a6b', 0.05, coat=1.0), P)
        rbox('camtop', (0.022, -0.125, 0.592), (0.02, 0.02, 0.012), blk, 0.004, P)
    if 'headphones' in props:
        hp = mat('hp', '#1d1d22', 0.35, coat=0.3); hpa = mat('hpa', '#7c3aed', 0.4)
        torus('hpband', (0, 0.01, 0.7), (0, 0.45, 1), 0.08, 0.011, hp, P)
        for s in (-1, 1):
            ellipsoid('hpcup', (0.078 * s, -0.04, 0.685), (0.024, 0.034, 0.034), hp, P)
            torus('hpring', (0.078 * s, -0.062, 0.685), (0, -1, 0.2), 0.024, 0.005, hpa, P)
    if 'apron' in props:
        ap = mat('apron', '#2f5d46', 0.8, sheen=0.3); ap2 = mat('apron2', '#3a7357', 0.8)
        rbox('bib', (0, -0.09, 0.6), (0.13, 0.012, 0.12), ap, 0.012, P)
        rbox('apskirt', (0, -0.094, 0.44), (0.21, 0.014, 0.2), ap, 0.014, P)
        torus('aptie', (0, 0, 0.53), (0, 0, 1), 0.113, 0.006, ap, P)
        for s in (-1, 1): capsule('apstrap', (0.058 * s, -0.09, 0.655), (0.04 * s, -0.04, 0.72), 0.005, ap, P)
        rbox('appocket', (0, -0.104, 0.42), (0.16, 0.01, 0.07), ap2, 0.008, P)
        ellipsoid('rag', (-0.045, -0.105, 0.465), (0.03, 0.012, 0.022), mat('rag', '#f2c94c', 0.9, sheen=0.5), P)
        frustum('spray', (0.045, -0.112, 0.47), 0.017, 0.015, 0.075, mat('sprayb', '#e9f2fb', 0.25, coat=0.6), P, bevel=0.004)
        rbox('trigger', (0.045, -0.112, 0.515), (0.026, 0.03, 0.022), mat('sprayh', '#2f80ed', 0.4), 0.006, P)
    if 'duster' in props:
        s = 1
        d = (WR[s] - EL[s]).normalized()
        grip = WR[s] + d * 0.045
        top_ = grip + Vector((0.03, -0.04, 0.24))
        capsule('stick', grip - (top_ - grip).normalized() * 0.03, top_, 0.006, mat('stick', '#8b5a2b', 0.5), P)
        cols = ['#f472b6', '#facc15', '#60a5fa', '#a78bfa', '#34d399']
        random.seed(7)
        for i in range(16):
            v = Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-0.3, 1))).normalized()
            ellipsoid('feather', top_ + v * 0.03, (0.02, 0.02, 0.032), mat('fe', cols[i % 5], 0.8, sheen=0.8), P, rot=v.to_track_quat('Z', 'Y'))

    for s_, item in pose.get('hold', {}).items():
        name, arg = (item, 0) if isinstance(item, str) else item
        if s_ == 0: c = (WR[-1] + WR[1]) / 2 + Vector((0, -0.04, 0.0))
        else: c = WR[s_] + (WR[s_] - EL[s_]).normalized() * 0.05
        if name == 'cup':
            frustum('cup', c + Vector((-0.012 * s_, -0.02, 0.0)), 0.026, 0.03, 0.065, mat('cup', '#f4f2ee', 0.3, coat=0.6), P, bevel=0.005)
        elif name == 'phone':
            rq = Matrix.Rotation(radians(-55), 4, 'X')
            rbox('phone', c + Vector((0, 0, 0.015)), (0.06, 0.01, 0.105), mat('phoneb', '#1d1d22', 0.3, coat=0.6), 0.008, P, rot=rq.to_quaternion())
            rbox('screen', c + Vector((0, 0, 0.015)) + rq.to_3x3() @ Vector((0, -0.0056, 0)), (0.052, 0.002, 0.094), mat('phonesc', '#a78bfa', 0.2, emit=1.5), 0.004, P, rot=rq.to_quaternion())
        elif name == 'pad':
            pm = mat('pad', '#2b2b33', 0.35, coat=0.4)
            fuse([ellipsoid('pad', c, (0.075, 0.035, 0.022), pm, P), ellipsoid('padL', c + Vector((-0.06, 0.012, -0.012)), (0.03, 0.035, 0.03), pm, P),
                  ellipsoid('padR', c + Vector((0.06, 0.012, -0.012)), (0.03, 0.035, 0.03), pm, P)], 0.003, 4)
            for dx, col in ((-0.03, '#7c3aed'), (0.03, '#22c55e')): ellipsoid('btnp', c + Vector((dx, -0.03, 0.012)), (0.008, 0.005, 0.008), mat('pbtn', col, 0.3), P)
        elif name == 'broom':
            top_ = c + Vector((0.0, 0.0, 0.12)); foot_ = Vector((0.16 + arg, -0.3, 0.035))
            capsule('stick', top_, foot_, 0.008, mat('stick', '#8b5a2b', 0.5), P)
            frustum('bristle', foot_ + Vector((0, 0, 0.0)), 0.07, 0.035, 0.07, mat('bristle', '#d4a24c', 0.8), P, bevel=0.006)

    # ---- tangan
    def hand(s):
        parts = [ellipsoid('palm', (0, 0, -0.03), (0.022, 0.036, 0.038), skin, P)]
        for i, fy in enumerate((-0.021, -0.007, 0.007, 0.021)):
            ln = (0.026, 0.03, 0.029, 0.023)[i]
            a = Vector((0.0, fy, -0.056)); b = Vector((-0.009 * s, fy * 1.02, -0.056 - ln))
            parts.append(capsule('f', a, b, 0.0095, skin, P, r2=0.0088))
        parts.append(capsule('thumb', (-0.008 * s, -0.024, -0.02), (-0.016 * s, -0.042, -0.05), 0.011, skin, P, r2=0.0095))
        h = fuse(parts, 0.002, 4)
        d = (WR[s] - EL[s]).normalized()
        h.rotation_mode = 'QUATERNION'; h.rotation_quaternion = Vector((0, 0, -1)).rotation_difference(d)
        h.location = WR[s] + d * 0.004
    for s in (-1, 1):
        if s not in POCKET: hand(s)

    before_head = set(o.name for o in P.children)
    # ================= KEPALA
    eye = mat('eye', '#1a1210', 0.12, coat=1.0); hl = mat('eyehl', '#ffffff', 0.3, emit=2.0)
    lip = mat('lip', '#b8525a' if g == 'f' else '#8a4a42', 0.4); blush = mat('blush', '#f08c8c', 0.6)
    brow = mat('brow', cfg['brow'], 0.6)
    style = cfg['hair_style']
    hd = ellipsoid('head', H, R, skin, P, seg=64)
    if CHIN:
        for v in hd.data.vertices: v.co.x *= chin_f(v.co.z + H.z); v.co.y *= 1 - (1 - chin_f(v.co.z + H.z)) * 0.4
    anime = cfg.get('eyes') in ('anime', 'pixar')
    for s in (-1, 1):
        if not style.startswith('hijab'): ellipsoid('ear', (0.182 * s, 0.01, 0.875), (0.025, 0.02, 0.035) if not cfg.get('chibi') else (0.03, 0.021, 0.042), skin, P)
        if anime: continue

        ellipsoid('eye', surf(0.062 * s, 0.885, -0.004), (0.019, 0.012, 0.028), eye, P)
        ellipsoid('hl', surf(0.068 * s, 0.898, 0.004), (0.006, 0.004, 0.007), hl, P)
        bp = surf(0.064 * s, 0.937, 0.002)
        bw = 0.0065 if g == 'm' else 0.0052
        capsule('brow', bp + Vector((-0.022 * s, 0, -0.002)), bp + Vector((0.022 * s, 0, 0.003)), bw, brow, P)
        if g == 'f':
            ellipsoid('blush', surf(0.1 * s, 0.85, -0.002), (0.024, 0.006, 0.014), blush, P)
            for k in range(3):
                capsule('lash', surf((0.074 + k * 0.006) * s, 0.903 + k * 0.002, 0.0), surf((0.082 + k * 0.008) * s, 0.91 + k * 0.004, 0.006), 0.0028, eye, P)
    if anime: pixar_face(cfg, g, P, skin, skinD) if cfg.get('eyes') == 'pixar' else anime_face(cfg, g, P, skinD)
    else:
        ellipsoid('nose', surf(0, 0.853, -0.006), (0.016, 0.012, 0.013), skinD, P)
        pts = [surf(((i / 8 - 0.5) * 2) * 0.026, 0.815 + 0.009 * ((i / 8 - 0.5) * 2) ** 2, 0.001) for i in range(9)]
        for i in range(8): capsule('mouth', pts[i], pts[i + 1], 0.0045, lip, P)

    if cfg.get('glasses'):
        fr = mat('glassframe', cfg['glasses'], 0.3, coat=0.6)
        thick = 0.0055 if cfg['glasses'] == '#2563eb' else 0.0032 if cfg.get('glasses_thin') else 0.0042
        GX, GZ, GR = (0.068, 0.86, 0.042) if cfg.get('eyes') == 'pixar' else (0.062, 0.888, 0.034)   # chibi: mata lebih besar
        for s in (-1, 1):
            c = surf(GX * s, GZ, 0.018)
            torus('lensring', c, (0.22 * s, -1, 0), GR, thick, fr, P)
            capsule('temple', c + Vector((GR * s, 0.004, 0.004)), Vector((0.178 * s, 0.0, GZ + 0.012)), thick * 0.8, fr, P)
        capsule('bridge', surf(GX - GR + 0.004, GZ + 0.007, 0.022), surf(-(GX - GR + 0.004), GZ + 0.007, 0.022), thick * 0.8, fr, P)

    hair_style(style, cfg, hair, P)
    if cfg.get('peci'):
        pz, pr = (1.075, 0.165) if not cfg.get('chibi') else (1.13, 0.17)
        frustum('peci', (0, 0.012, pz), pr, pr - 0.007, 0.085, mat('peci', '#17151d', 0.6, sheen=0.5), P, bevel=0.012, seg=48)

    hs = cfg.get('head_scale', 1.0)   # chibi: kepala lebih besar (skala dari pangkal leher)
    if hs != 1.0 or cfg.get('neck_up'):
        S_ = Matrix.Translation((0, 0, 0.7 + cfg.get('neck_up', 0))) @ Matrix.Scale(hs, 4) @ Matrix.Translation((0, 0, -0.7))
        for o in [o for o in P.children if o.name not in before_head]: o.matrix_basis = S_ @ o.matrix_basis

    # ================= POSE: kepala miring/nengok, badan atas muter & condong
    def rot_about(ob, pivot, M):
        ob.matrix_basis = Matrix.Translation(pivot) @ M @ Matrix.Translation(-Vector(pivot)) @ ob.matrix_basis
    roll, nod, turn = pose.get('head', (0, 0, 0))
    if cfg.get('chibi') and not pose.get('lie'): nod += HEAD_NOD
    RH = Matrix.Rotation(radians(turn), 4, 'Z') @ Matrix.Rotation(radians(roll), 4, 'Y') @ Matrix.Rotation(radians(nod), 4, 'X')
    for o in [o for o in P.children if o.name not in before_head]: rot_about(o, Vector((0, 0, 0.73)), RH)
    for o in P.children:
        if o.name not in lower: rot_about(o, PIV, RU)
    sc = cfg.get('scale', 1.0)
    if pose.get('lie'):   # tiduran telentang: kepala ke +Y (utara), badan di atas kasur
        for o in P.children: rot_about(o, Vector((0, 0, 0)), Matrix.Rotation(radians(-90), 4, 'X'))
        bpy.context.view_layer.update()
        pts = [o.matrix_basis @ Vector(c) for o in P.children if o.type == 'MESH' for c in o.bound_box]
        zmin = min(p.z for p in pts); ymid = (min(p.y for p in pts) + max(p.y for p in pts)) / 2
        lift = pose.get('lie_z', 0.40) / (cfg.get('scale', 1.0) * BODY_SCALE)
        for o in P.children: o.matrix_basis = Matrix.Translation(Vector((0, -ymid, lift - zmin))) @ o.matrix_basis
    if Ls != 1.0:
        dz = (0.45 - 0.075) * (1 - Ls)
        for o in P.children:
            if o.name not in lower: o.matrix_basis = Matrix.Translation((0, 0, -dz)) @ o.matrix_basis
    root.location = Vector(loc) - Vector((0, 0, pose.get('drop', 0) * sc)); root.rotation_euler = (0, 0, radians(yaw))
    root.scale = (sc, sc, sc)
    return root

# ---------------------------------------------------------------- wajah chibi (mata besar berkilau ala poster)
def face_pt(x, z, out=0.0):
    """titik di permukaan muka + normalnya"""
    p = surf(x, z)
    n = Vector((p.x / R[0] ** 2, p.y / R[1] ** 2, (p.z - H.z) / R[2] ** 2)).normalized()
    return p + n * out, n

def anime_face(cfg, g, P, skinD):
    white = mat('sclera', '#fbf8f6', 0.3, coat=0.6)
    iris = mat('iris_' + cfg.get('iris', '#5a3423'), cfg.get('iris', '#5a3423'), 0.15, coat=1.0)
    irisL = mat('irisL_' + cfg.get('iris', '#5a3423'), shade(cfg.get('iris', '#5a3423'), 0.35), 0.15, coat=1.0)
    pupil = mat('pupil', '#140c09', 0.1, coat=1.0); hl = mat('eyehl', '#ffffff', 0.3, emit=2.0)
    lid = mat('lid', '#1a1210', 0.4); brow = mat('brow', cfg['brow'], 0.6)
    blush = mat('blushC', '#f2a0a0', 0.6); lip = mat('lipC', '#c0666a' if g == 'f' else '#a8615a', 0.4)
    EX, EZ = 0.066, 0.872
    def put(name, x, z, out, r, m):
        p, n = face_pt(x, z, out)
        return ellipsoid(name, p, r, m, P, rot=n.to_track_quat('Y', 'Z'), seg=40)
    for s in (-1, 1):
        x = EX * s
        put('sclera', x, EZ, -0.002, (0.031, 0.006, 0.04), white)
        put('iris', x - 0.002 * s, EZ - 0.003, 0.0012, (0.026, 0.0065, 0.035), iris)
        put('irisL', x - 0.002 * s, EZ - 0.014, 0.0022, (0.019, 0.006, 0.013), irisL)   # pantulan bawah iris lebih terang
        put('pupil', x - 0.002 * s, EZ + 0.002, 0.0032, (0.012, 0.006, 0.017), pupil)
        put('hl', x + 0.009 * s, EZ + 0.012, 0.006, (0.009, 0.004, 0.011), hl)
        put('hl2', x - 0.011 * s, EZ - 0.015, 0.0055, (0.0045, 0.003, 0.0045), hl)
        # kelopak atas tebal melengkung (+ ekor bulu mata untuk cewek)
        arc = [face_pt(x + t * 0.033 * s, EZ + 0.037 - 0.013 * t * t - (0.004 * t if t > 0 else 0), 0.002)[0] for t in [i / 6 - 1 for i in range(13)]]
        for a, b in zip(arc, arc[1:]): capsule('lid', a, b, 0.0048 if g == 'f' else 0.0038, lid, P)
        if g == 'f':
            tip = face_pt(x + 0.043 * s, EZ + 0.024, 0.004)[0]
            capsule('lash', arc[-1], tip, 0.0035, lid, P, r2=0.0015)
        bp = face_pt(x + 0.002 * s, EZ + 0.072, 0.002)[0]
        capsule('brow', bp + Vector((-0.024 * s, 0, 0.001)), bp + Vector((0.022 * s, 0, -0.003)), 0.0055 if g == 'm' else 0.0042, brow, P, r2=0.0035)
        put('blush', 0.1 * s, 0.825, -0.001, (0.024, 0.004, 0.013), blush)
    put('nose', 0, 0.835, -0.004, (0.009, 0.007, 0.008), skinD)
    pts = [face_pt(t * 0.016, 0.8 + 0.006 * t * t, 0.0)[0] for t in [i / 4 - 1 for i in range(9)]]
    for a, b in zip(pts, pts[1:]): capsule('mouth', a, b, 0.0035, lip, P)

def pixar_face(cfg, g, P, skin, skinD):
    """mata besar bulat gelap, alis tebal, hidung kecil, senyum tipis (gaya figur 3D Pixar)"""
    ic = cfg.get('iris', '#3a2418')
    white = mat('sclera', '#fbf8f6', 0.3, coat=0.6)
    iris = mat('irisP_' + ic, ic, 0.12, coat=1.0); irisL = mat('irisPL_' + ic, shade(ic, 0.35), 0.15, coat=1.0)
    pupil = mat('pupil', '#0d0807', 0.1, coat=1.0); hl = mat('eyehl', '#ffffff', 0.3, emit=2.0)
    lid = mat('lid', '#17100e', 0.4); brow = mat('browP', cfg['brow'], 0.75, sheen=0.4)
    blush = mat('blushP', '#f0aaa2', 0.7); lip = mat('lipP', '#c47c76' if g == 'f' else '#b47a6e', 0.45)
    EX, EZ = 0.068, 0.858
    def put(name, x, z, out, r, m):
        p, n = face_pt(x, z, out)
        return ellipsoid(name, p, r, m, P, rot=n.to_track_quat('Y', 'Z'), seg=40)
    for s in (-1, 1):
        x = EX * s
        put('sclera', x, EZ, -0.003, (0.034, 0.006, 0.037), white)
        put('iris', x - 0.002 * s, EZ - 0.001, 0.001, (0.0285, 0.0065, 0.033), iris)
        put('irisL', x - 0.002 * s, EZ - 0.015, 0.002, (0.019, 0.006, 0.012), irisL)
        put('pupil', x - 0.002 * s, EZ + 0.001, 0.003, (0.0145, 0.006, 0.0165), pupil)
        put('hl', x + 0.009 * s, EZ + 0.012, 0.0055, (0.009, 0.004, 0.01), hl)
        put('hl2', x - 0.011 * s, EZ - 0.014, 0.005, (0.004, 0.003, 0.004), hl)
        ts = [i / 7 - 1 for i in range(15)]
        arc = [face_pt(x + t * 0.036 * s, EZ + 0.032 - 0.015 * t * t + 0.002 * t, 0.0025)[0] for t in ts]
        for i, (a, b) in enumerate(zip(arc, arc[1:])):
            r_ = 0.0026 + 0.0026 * math.sin(math.pi * min(i / (len(arc) - 2) * 1.15, 1))
            capsule('lid', a, b, r_, lid, P, r2=r_)
        if g == 'f':
            for j in range(3):
                b0 = arc[-1 - j * 2]
                capsule('lash', b0, b0 + Vector((0.008 * s, -0.004, 0.006 + j * 0.002)), 0.0022, lid, P, r2=0.0008)
        bz = EZ + (0.064 if g == 'm' else 0.068)
        bpts = [face_pt(x + t * 0.026 * s, bz + 0.004 * (1 - t * t) + (0.0 if g == 'm' else 0.003 * (1 - t * t)) - 0.003 * t, 0.002)[0] for t in [i / 5 - 1 for i in range(11)]]
        for i, (a, b) in enumerate(zip(bpts, bpts[1:])):
            r_ = (0.0072 if g == 'm' else 0.0042) * (1 - 0.45 * i / 9)
            capsule('brow', a, b, r_, brow, P, r2=r_)
        put('blush', 0.098 * s, 0.82, -0.002, (0.024, 0.004, 0.013), blush)
    put('nose', 0, 0.826, -0.003, (0.012, 0.013, 0.011), skin)
    put('noseS', 0, 0.818, -0.005, (0.011, 0.01, 0.006), skinD)
    pts = [face_pt(t * 0.015, 0.795 + 0.0045 * t * t, 0.0)[0] for t in [i / 4 - 1 for i in range(9)]]
    for a, b in zip(pts, pts[1:]): capsule('mouth', a, b, 0.0026, lip, P)
    put('lowlip', 0, 0.789, -0.003, (0.008, 0.004, 0.004), mat('lowlip', '#e3a89c', 0.5))

def zmark(c, size, m, P, normal=(0, -1, 0), r=None):
    """huruf Z (logo Zataa) menempel di permukaan menghadap normal"""
    q = Vector(normal).normalized().to_track_quat('-Y', 'Z')
    c = Vector(c); h = size / 2; r = r or size * 0.11
    pts = [(-h * 0.9, h), (h, h), (-h, -h), (h * 0.9, -h)]
    for (x0, z0), (x1, z1) in zip(pts, pts[1:]):
        capsule('zlogo', c + q @ Vector((x0, 0, z0)), c + q @ Vector((x1, 0, z1)), r, m, P)

# ---------------------------------------------------------------- gaya rambut
def lock(pts, r0, r1, m, P):
    """seikat rambut: rantai kapsul yang makin ke ujung makin tipis"""
    pts = [Vector(p) for p in pts]; n = len(pts) - 1
    return [capsule('lock', pts[i], pts[i + 1], r0 + (r1 - r0) * i / n, m, P, r2=r0 + (r1 - r0) * (i + 1) / n) for i in range(n)]

def bez(a, b, c, n=5):
    a, b, c = Vector(a), Vector(b), Vector(c)
    return [a * (1 - t) ** 2 + b * 2 * t * (1 - t) + c * t * t for t in [i / (n - 1) for i in range(n)]]

# ---- helai rambut halus (chibi): pita pipih melengkung, ujung lancip, + subdivision
def catmull(pts, n):
    Q = [Vector(p) for p in pts]; Q = [Q[0] * 2 - Q[1]] + Q + [Q[-1] * 2 - Q[-2]]
    segs = len(Q) - 3; out = []
    for i in range(n):
        u = i / (n - 1) * segs; k = min(int(u), segs - 1); t = u - k
        p0, p1, p2, p3 = Q[k:k + 4]
        out.append(0.5 * ((2 * p1) + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t ** 3))
    return out

def _frames(C, center):
    out = []
    for i, p in enumerate(C):
        T = (C[min(i + 1, len(C) - 1)] - C[max(i - 1, 0)]).normalized()
        o = p - center; o -= T * o.dot(T)
        o = o.normalized() if o.length > 1e-6 else Vector((0, 0, 1))
        out.append((T, o, T.cross(o).normalized()))
    return out

def strand(pts, w, th, m, P, center=None, n=30, k=12, root=0.75, sub=2, wave=0.0, freq=2.0, phase=0.0, curl=0.0):
    """seikat rambut sepanjang kurva lewat titik2 pts; penampang elips pipih (lebar w, tebal th) menghadap keluar dari center.
    wave: amplitudo gelombang ke samping; curl > 0: gelombang jadi spiral (ikal)"""
    center = Vector(center) if center is not None else H
    C = catmull(pts, n); verts = []; faces = []
    if wave:
        F = _frames(C, center)
        C = [p + (B * math.sin(2 * math.pi * freq * (i / (n - 1)) + phase) + o * curl * 0.6 * math.cos(2 * math.pi * freq * (i / (n - 1)) + phase))
             * wave * min(i / (n - 1) * 3, 1) for i, (p, (T, o, B)) in enumerate(zip(C, F))]
    for i, p in enumerate(C):
        t = i / (n - 1)
        T = (C[min(i + 1, n - 1)] - C[max(i - 1, 0)]).normalized()
        o = p - center; o -= T * o.dot(T)
        o = o.normalized() if o.length > 1e-6 else Vector((0, 0, 1))
        B = T.cross(o).normalized()
        prof = (root + (1 - root) * min(t * 4, 1)) * (1 - t) ** 0.7
        for j in range(k):
            a = 2 * math.pi * j / k
            ca, sa = math.cos(a), math.sin(a)
            verts.append(p + B * ca * w * prof + o * (sa * th * prof + th * 0.35 * prof * ca * ca))   # sedikit cembung keluar
    tip = len(verts); verts.append(C[-1] + (C[-1] - C[-2]).normalized() * 0.006)
    rt = len(verts); verts.append(C[0] - (C[1] - C[0]).normalized() * 0.004)
    for i in range(n - 1):
        for j in range(k):
            a_, b_ = i * k + j, i * k + (j + 1) % k
            faces.append((a_, b_, b_ + k, a_ + k))
    L = (n - 1) * k
    for j in range(k): faces.append((L + j, L + (j + 1) % k, tip))
    for j in range(k): faces.append(((j + 1) % k, j, rt))
    me = bpy.data.meshes.new('strand'); me.from_pydata([tuple(v) for v in verts], [], faces); me.validate()
    for f in me.polygons: f.use_smooth = True
    ob = bpy.data.objects.new('strand', me); COLL.objects.link(ob); me.materials.append(m); ob.parent = P
    if sub:
        sd = ob.modifiers.new('sd', 'SUBSURF'); sd.levels = 1; sd.render_levels = sub
    return ob

SURF = None   # (pusat, jari2) massa rambut; None = kulit kepala
def on_head(d, off, c=None):
    """titik di atas permukaan kepala / massa rambut (elipsoid) searah d, berjarak off"""
    d = Vector(d).normalized()
    c0, rr = SURF if SURF else (H, R)
    r = 1 / sqrt((d.x / rr[0]) ** 2 + (d.y / rr[1]) ** 2 + (d.z / rr[2]) ** 2)
    return (c or c0) + d * (r + off)

def head_arc(d0, d1, n, off0, off1, puff):
    """jalur nempel kepala dari arah d0 ke d1, mengembang (puff) di tengah"""
    d0, d1 = Vector(d0).normalized(), Vector(d1).normalized(); out = []
    for i in range(n):
        s = i / (n - 1)
        ease = min(s / 0.28, 1.0); ease = ease * ease * (3 - 2 * ease)
        out.append(on_head(d0.lerp(d1, s), off0 + (off1 - off0) * s + puff * math.sin(math.pi * s) ** 0.8 * ease))
    return out

def sph(az, el):
    """arah dari pusat kepala: az 0 = depan (-y), 90 = kanan (+x); el dari ekuator"""
    az, el = math.radians(az), math.radians(el)
    return Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))

def soft_hair(style, cfg, hair, P):
    """rambut chibi halus: batok tipis + puluhan helai pipih berlapis"""
    global SURF
    SURF = None
    random.seed(cfg.get('hair_seed', 3))
    J = lambda a: random.uniform(-a, a)
    # batok dasar (biar kulit kepala gak keliatan di sela helai)
    cap = ellipsoid('hcap', H + Vector((0, 0.008, 0.012)), (R[0] + 0.012, R[1] + 0.014, R[2] + 0.012), hair, P, seg=64)
    if style == 'hijab_soft':   # hijab kain lembut: membungkus kepala, bukaan wajah oval, kain jatuh menutup bahu & dada
        bpy.data.objects.remove(cap, do_unlink=True)
        cloth = mat('hijab_' + cfg['hair'], cfg['hair'], 0.82, sheen=0.6)
        hood = ellipsoid('hjhood', H + Vector((0, 0.012, 0.014)), (R[0] + 0.014, R[1] + 0.016, R[2] + 0.02), cloth, P, seg=64)
        chin = ellipsoid('hjchin', (0, -0.005, 0.745), (0.145, 0.13, 0.065), cloth, P, seg=48)
        drape = frustum('hjdrape', (0, 0.01, 0.645), 0.205, 0.145, 0.17, cloth, P, bevel=0.03, seg=64); drape.scale = (1, 0.72, 1)
        front = ellipsoid('hjfront', (0, -0.07, 0.6), (0.13, 0.04, 0.1), cloth, P, seg=40)
        c = fuse([hood, chin, drape, front], 0.0036, 12)
        boolean_cut(c, (0, -0.2, 0.852), (0.142, 0.14, 0.148), shape='ell')   # bukaan wajah (dahi sampai dagu kelihatan)
        ellipsoid('hjpin', (0.1, -0.118, 0.735), (0.009, 0.006, 0.009), mat('pin', '#f4f2ee', 0.2, coat=1.0), P)
        return
    if style == 'wavy_crop':   # cowok: massa rambut tebal mengembang ke atas, helai bergelombang di permukaannya, poni ikal di dahi
        hv = cfg.get('hair_vol', 1.0)   # <1 lebih tipis/rapi, >1 lebih mengembang
        MC = H + Vector((0, 0.02, 0.052 * hv)); MR = (R[0] + 0.012, R[1] + 0.026 * hv, R[2] + 0.05 * hv)
        bpy.data.objects.remove(cap, do_unlink=True)
        cap = ellipsoid('hmass', MC, MR, hair, P, seg=64)
        boolean_cut(cap, (0, -0.215, 0.885), (0.33, 0.22, 0.27), shape='ell')   # muka (garis rambut tinggi, volume naik ke atas)
        boolean_cut(cap, (0, 0.02, 0.68), (0.5, 0.5, 0.18))                   # tengkuk
        for sx in (-1, 1):   # samping: lengkung halus di sekitar telinga sampai belakang
            boolean_cut(cap, (0.2 * sx, -0.05, 0.79), (0.085, 0.16, 0.1), shape='ell')
            boolean_cut(cap, (0.17 * sx, 0.06, 0.73), (0.1, 0.12, 0.06), shape='ell')
        SURF = (MC, MR)
        for row, el in enumerate((30, 4, -20)):   # belakang: helai bergelombang turun ke tengkuk
            n_ = 11 - row
            for k_ in range(n_):
                az = 180 + (k_ - (n_ - 1) / 2) * (190 / n_) + J(5) + row * 8
                pts = head_arc(sph(az, el + 24), sph(az + J(8), el - 12), 5, 0.006, 0.004, 0.006)
                pts.append(pts[-1] + (pts[-1] - MC).normalized() * 0.005 + Vector((0, 0, -0.012)))
                strand(pts, 0.05, 0.016, hair, P, center=MC, root=0.95, wave=0.009, freq=1.8, phase=J(3), curl=0.6)
        for sx in (-1, 1):   # samping: disisir ke belakang
            for j in range(4):
                el = 40 - j * 11 + J(3)
                pts = head_arc(sph(sx * (40 + j * 5 + J(4)), el + 10), sph(sx * (118 + j * 8), el - 16), 6, 0.004, 0.004, 0.006)
                strand(pts, 0.056, 0.016, hair, P, center=MC, root=0.9, wave=0.006, freq=2, phase=J(3))
        for i in range(18):   # atas: dari garis rambut depan menyapu ke atas-belakang, berlapis
            u = i / 17
            d0 = sph(-64 + u * 128 + J(4), 6 + 12 * (1 - abs(u - 0.5) * 2) + J(3))
            d1 = sph(180 + (u - 0.5) * 110 + 28 + J(10), 30 + J(8))   # disisir miring ke belakang-samping
            pts = head_arc(d0, d1, 8, 0.0, 0.006, 0.018 + J(0.008))
            pts[0] = pts[0] + (pts[0] - MC).normalized() * 0.004 + Vector((0, -0.006, -0.008))
            strand(pts, 0.058 + J(0.008), 0.022, hair, P, center=MC, root=0.95, wave=0.012, freq=2.2, phase=J(3))
        for k_ in range(6):   # helai pendek terangkat di atas biar teksturnya bergelombang
            d0 = sph(-30 + k_ * 12 + J(5), 40 + J(6))
            pts = head_arc(d0, sph(140 + k_ * 12, 62), 5, 0.008, 0.006, 0.012)
            strand(pts, 0.05, 0.02, hair, P, center=MC, root=0.9, wave=0.01, freq=1.5, phase=J(3), curl=0.5)
        SURF = None
        for x, tz in ((-0.085, 0.958), (-0.045, 0.945), (-0.005, 0.958), (0.04, 0.975)):   # poni: beberapa helai jatuh miring ke dahi
            tip = Vector((x - 0.03, surf(x - 0.03, tz).y - 0.012, tz))
            start = MC + Vector((x + 0.02, -0.15, 0.12))
            mid = Vector((x - 0.005, surf(x, 1.0).y - 0.022, 1.0))
            pts = [start, mid, tip, tip + Vector((-0.004, -0.01, -0.012))]
            strand(pts, 0.05, 0.016, hair, P, root=0.9, wave=0.004, freq=1.2, phase=J(3))
    elif style == 'pony_wavy':   # cewek: rambut licin ditarik ke ponytail tinggi, ikal bergelombang sampai pinggang, helai depan wajah
        T0 = Vector((0, 0.168, 1.02)); dT = (T0 - H).normalized()
        bpy.data.objects.remove(cap, do_unlink=True)
        cap = ellipsoid('hcap', H + Vector((0, 0.006, 0.006)), (R[0] + 0.007, R[1] + 0.008, R[2] + 0.007), hair, P, seg=64)
        boolean_cut(cap, (0, -0.2, 0.855), (0.29, 0.2, 0.215), shape='ell')
        boolean_cut(cap, (0, -0.02, 0.69), (0.5, 0.5, 0.14))
        for i in range(24):   # dari garis rambut (belah tengah) ditarik ke ikatan
            u = i / 23; az = -105 + u * 210 + J(3)
            el = 34 - 30 * abs(az) / 105 + J(2) + (5 if abs(az) < 14 else 0)
            pts = head_arc(sph(az, el - 3), dT, 7, -0.002, 0.02, 0.01 + (0.01 if abs(az) < 45 else 0))
            pts.append(T0 + Vector((J(0.01), 0.02, 0)))
            strand(pts, 0.05, 0.015, hair, P, root=1.0)
        for k_ in range(8):   # tengkuk ke ikatan
            pts = head_arc(sph(120 + k_ * 17, -18), dT, 6, 0.006, 0.02, 0.01); pts.append(T0)
            strand(pts, 0.055, 0.016, hair, P, root=0.9)
        torus('scrunchie', T0 + Vector((0, 0.014, 0)), (0, 1, 0.45), 0.033, 0.017, mat('scr', cfg.get('scrunchie', '#8b5cf6'), 0.8, sheen=0.6), P)
        for k_ in range(28):   # ekor kuda: naik sedikit lalu jatuh ikal sampai pinggang, mengembang
            a = k_ / 28 * 2 * math.pi + J(0.1); sx, sy = math.cos(a), math.sin(a)
            sp = 0.075 + 0.05 * random.random()
            pp = [T0 + Vector((sx * 0.012, 0.03 + sy * 0.01, sy * 0.012)), T0 + Vector((sx * 0.04, 0.085, 0.0)),
                  Vector((sx * sp, 0.2 + sy * 0.03, 0.88)), Vector((sx * (sp + 0.03), 0.19 + sy * 0.03, 0.74)),
                  Vector((sx * (sp + 0.02) + J(0.02), 0.17 + sy * 0.03, 0.6)), Vector((sx * sp + J(0.03), 0.16 + sy * 0.03, 0.47 + J(0.03)))]
            strand(pp, 0.05 + J(0.008), 0.022, hair, P, center=Vector((0, 0.13, 0.7)), root=0.7, n=48, wave=0.02, freq=3.2, phase=J(3), curl=1)
        for sx in (-1, 1):   # helai depan wajah: dari belahan, lewat pelipis, ikal sampai dada
            for j in range(2):
                arc = head_arc(sph(sx * (16 + j * 14), 32 - j * 6), sph(sx * (72 + j * 8), -6), 5, 0.012, 0.018, 0.014)
                pts = arc + [Vector((sx * (0.162 + j * 0.016), -0.06 + j * 0.022, 0.76)), Vector((sx * (0.152 + j * 0.012), -0.08 + j * 0.022, 0.66)),
                             Vector((sx * (0.142 + j * 0.01), -0.086 + j * 0.022, 0.58))]
                strand(pts, 0.054, 0.021, hair, P, root=0.85, n=40, wave=0.013, freq=2.4, phase=J(3), curl=1)
    elif style == 'soft_m':
        boolean_cut(cap, (0, -0.2, 0.9), (0.34, 0.2, 0.2), shape='ell')
        boolean_cut(cap, (0, 0.0, 0.7), (0.5, 0.5, 0.2))
        for sx in (-1, 1): boolean_cut(cap, (0.2 * sx, -0.02, 0.83), (0.06, 0.09, 0.07), shape='ell')
        W = sph(180, 72)   # pusaran di ubun-ubun belakang
        # poni: helai dari pusaran lewat atas kepala, jatuh ke dahi, disisir ke satu sisi
        for i in range(8):
            x = -0.15 + i * 0.043 + J(0.008)
            tz = 0.95 + J(0.01) + (0.03 if i in (2, 6) else 0) - (0.015 if i == 4 else 0)
            tx = x - 0.04 - abs(x) * 0.12
            tip = Vector((tx, surf(max(min(tx, 0.17), -0.17), tz).y - 0.016, tz))
            pts = head_arc(W + Vector((J(0.15), J(0.1), 0)), (tip - H).normalized(), 6, 0.022, 0.018, 0.055 + J(0.012))
            pts[-2] += Vector((0.012, -0.006, 0))   # lengkung S: helai nyapu ke samping lalu jatuh
            pts.append(tip + Vector((-0.012, -0.006, -0.014)))
            strand(pts, 0.056 + J(0.008), 0.019, hair, P, root=0.9)
        # samping & belakang: jatuh ke bawah, ujung sedikit mencuat
        for k_ in range(26):
            az = 60 + k_ * (240 / 25) + J(4)
            side = abs(math.sin(math.radians(az)))
            d1 = sph(az, 2 - 22 * (1 - side) + J(4))   # samping: atas telinga · belakang: tengkuk
            pts = head_arc(W + Vector((J(0.12), J(0.12), 0)), d1, 6, 0.024, 0.014, 0.05 + J(0.01))
            out = pts[-1] - H; out.z = 0; out = out.normalized()
            pts.append(pts[-1] + out * 0.014 + Vector((0, 0, -0.022)))
            strand(pts, 0.05 + J(0.008), 0.018, hair, P, root=0.9)
        # lapisan atas: helai pendek mengembang biar bervolume & gak rata
        for k_ in range(14):
            d1 = sph(-55 + k_ * 8.5 + J(4), 26 + J(6))
            pts = head_arc(W + Vector((J(0.1), 0, 0)), d1, 5, 0.05, 0.03, 0.045)
            pts.append(pts[-1] + (pts[-1] - pts[-2]).normalized() * 0.03 + Vector((0, 0, -0.01)))
            strand(pts, 0.045, 0.016, hair, P, root=0.9)
    else:   # soft_f / long_wavy / bob_soft: belah tengah, poni tirai; panjang (lurus/bergelombang) atau bob sedagu
        WV = cfg.get('hair_wave', 0.016 if style == 'long_wavy' else 0.0)
        BOB = style == 'bob_soft'
        boolean_cut(cap, (0, -0.2, 0.86), (0.3, 0.2, 0.22), shape='ell')
        boolean_cut(cap, (0, -0.02, 0.69), (0.5, 0.5, 0.14))
        def part_dir(t): return Vector((0, -0.75 + 1.25 * t, 1.0)).normalized()
        # poni tirai
        for i in range(8):
            sgn = -1 if i < 4 else 1; u = (i % 4) / 3
            x = sgn * (0.045 + u * 0.1)
            tz = 0.965 - u * 0.085 + J(0.008)
            tip = Vector((x, surf(x, tz).y - 0.012, tz))
            d0 = part_dir(0.05 + J(0.04)) + Vector((sgn * 0.08, 0, 0))
            pts = head_arc(d0, (tip - H).normalized(), 6, 0.016, 0.014, 0.035)
            pts.append(tip + Vector((sgn * 0.012, -0.004, -0.014)))
            strand(pts, 0.046 + J(0.005), 0.015, hair, P, root=0.85)
        # rambut belakang panjang: dari belahan -> sisi kepala -> jatuh lurus di punggung
        for k_ in range(24):
            sgn = -1 if k_ % 2 else 1; u = (k_ // 2) / 11
            d0 = part_dir(0.2 + u * 0.7) + Vector((sgn * 0.05, 0, 0))
            arc = head_arc(d0, sph(sgn * (100 + u * 80), -8), 5, 0.016, 0.022, 0.03)
            e = arc[-1]
            hx = e.x * 0.95; hy = max(e.y, 0.08) + 0.02
            if BOB:   # bob: berhenti di dagu, ujung melengkung ke dalam
                pts = arc + [Vector((hx * 1.08, hy + 0.01, 0.8 + J(0.012))), Vector((hx * 0.94, hy - 0.012, 0.75 + J(0.025)))]
            else:
                pts = arc + [Vector((hx * 1.02, hy + 0.012, 0.75)), Vector((hx * 0.96, hy + 0.03, 0.63)), Vector((hx * 0.86 + J(0.01), hy + 0.025, 0.52 + J(0.02)))]
            strand(pts, 0.066 + J(0.008), 0.024, hair, P, root=0.9, n=40, wave=WV, freq=2.6, phase=J(3), curl=1 if WV else 0)
        # helai depan bahu (2 per sisi)
        for sgn in (-1, 1):
            for j in range(2):
                d0 = part_dir(0.12 + j * 0.1) + Vector((sgn * 0.06, 0, 0))
                arc = head_arc(d0, sph(sgn * (78 + j * 10), 2), 5, 0.016, 0.02, 0.03)
                if BOB:
                    pts = arc + [Vector((sgn * (0.185 + j * 0.01), -0.05 + j * 0.03, 0.8)), Vector((sgn * (0.16 + j * 0.01), -0.07 + j * 0.03, 0.755))]
                else:
                    pts = arc + [Vector((sgn * (0.165 + j * 0.012), -0.07 + j * 0.02, 0.76)), Vector((sgn * (0.158 + j * 0.012), -0.088 + j * 0.02, 0.65)),
                                 Vector((sgn * (0.15 + j * 0.01), -0.09 + j * 0.02, 0.56 + j * 0.03))]
                strand(pts, 0.054, 0.02, hair, P, root=0.9, n=40, wave=WV, freq=2.4, phase=J(3), curl=1 if WV else 0)
        # lapisan atas sisi (nutup batok)
        for k_ in range(14):
            sgn = -1 if k_ % 2 else 1; u = (k_ // 2) / 6
            arc = head_arc(part_dir(0.08 + u * 0.84), sph(sgn * (70 + u * 95), -10), 6, 0.012, 0.03, 0.022)
            strand(arc + [arc[-1] + Vector((0, 0.004 * sgn, -0.05))], 0.066, 0.02, hair, P, root=0.95)

def chain(pts, r, m, P, wob=0.0, r2=None):
    """rantai elipsoid (buat helai bergelombang/ikal)"""
    out = []
    n = len(pts)
    for i, p in enumerate(pts):
        rr = r + ((r2 or r) - r) * (i / max(n - 1, 1))
        off = Vector((wob * (1 if i % 2 else -1), 0, 0))
        out.append(ellipsoid('h', Vector(p) + off, (rr, rr * 0.9, rr * 1.15), m, P))
    return out

def lerp_pts(a, b, n):
    a, b = Vector(a), Vector(b)
    return [a.lerp(b, i / (n - 1)) for i in range(n)]

def hair_style(style, cfg, hair, P):
    cap = lambda ex=(0.016, 0.018, 0.012), off=(0, 0.012, 0.02): ellipsoid('hair', H + Vector(off), (R[0] + ex[0], R[1] + ex[1], R[2] + ex[2]), hair, P)
    rotY = lambda d: Matrix.Rotation(radians(d), 4, 'Y').to_quaternion()

    def male_cuts(c, forehead=0.9):
        boolean_cut(c, (0, -0.17, 0.81), (0.44, 0.2, 0.22))
        boolean_cut(c, (0, -0.2, forehead), (0.3, 0.12, 0.09))
        boolean_cut(c, (0, 0.02, 0.74), (0.5, 0.5, 0.14))
        for sx in (-1, 1): boolean_cut(c, (0.21 * sx, -0.03, 0.85), (0.07, 0.13, 0.11))
        for sx in (-1, 1): ellipsoid('sideburn', (0.172 * sx, -0.04, 0.875), (0.016, 0.028, 0.04), hair, P)

    if style in ('soft_m', 'soft_f', 'wavy_crop', 'pony_wavy', 'long_wavy', 'bob_soft', 'hijab_soft'): return soft_hair(style, cfg, hair, P)
    if style == 'side_part':
        parts = [cap(), ellipsoid('swoop', (0.025, -0.075, 1.035), (0.17, 0.1, 0.07), hair, P, rot=rotY(-9)),
                 ellipsoid('swoop2', (-0.09, -0.06, 1.0), (0.08, 0.1, 0.06), hair, P)]
        for sx in (-1, 1): parts.append(ellipsoid('side', (0.15 * sx, 0.0, 0.95), (0.06, 0.13, 0.08), hair, P))
        male_cuts(fuse(parts))
    elif style == 'casual':
        parts = [cap((0.018, 0.02, 0.018)), ellipsoid('top', (0, -0.03, 1.07), (0.16, 0.13, 0.055), hair, P)]
        for x, rz in ((-0.09, 18), (-0.03, 6), (0.03, -6), (0.09, -18)):
            parts.append(ellipsoid('fringe', (x, -0.115, 1.0), (0.05, 0.05, 0.06), hair, P, rot=rotY(rz)))
        male_cuts(fuse(parts, smooth=12), forehead=0.9)
    elif style == 'messy':
        parts = [cap()]
        dirs = [(-0.45, -0.55, 0.75), (0.1, -0.65, 0.75), (0.55, -0.45, 0.7), (-0.75, -0.05, 0.65), (0.75, 0.05, 0.65), (0.0, 0.25, 1.0),
                (-0.35, 0.6, 0.72), (0.4, 0.62, 0.68), (-0.15, -0.8, 0.5), (0.3, -0.78, 0.48), (-0.2, 0.0, 1.0), (0.25, -0.2, 0.95)]
        for d in dirs:
            d = Vector(d).normalized()
            parts.append(ellipsoid('tuft', H + d * 0.185, (0.05, 0.042, 0.068), hair, P, rot=d.to_track_quat('Z', 'Y')))
        male_cuts(fuse(parts, 0.004, 7), forehead=0.915)
    elif style == 'short_neat':
        parts = [cap((0.01, 0.012, 0.008)), ellipsoid('fringe', (0.0, -0.1, 1.0), (0.13, 0.06, 0.045), hair, P, rot=rotY(-6))]
        male_cuts(fuse(parts))
    elif style == 'volume':
        parts = [cap(), ellipsoid('swoop', (0.0, -0.07, 1.06), (0.17, 0.11, 0.085), hair, P, rot=rotY(-6)),
                 ellipsoid('crown', (0, 0.01, 1.09), (0.15, 0.13, 0.06), hair, P)]
        for sx in (-1, 1): parts.append(ellipsoid('side', (0.15 * sx, 0.0, 0.96), (0.06, 0.13, 0.08), hair, P))
        male_cuts(fuse(parts))
    elif style == 'wavy_long':
        parts = [cap((0.018, 0.022, 0.014), (0, 0.014, 0.018)),
                 ellipsoid('bang', (0.03, -0.095, 1.0), (0.165, 0.085, 0.065), hair, P, rot=rotY(14)),
                 ellipsoid('bang2', (0.14, -0.07, 0.93), (0.06, 0.08, 0.09), hair, P),
                 ellipsoid('hairback2', (0, 0.06, 0.9), (0.2, 0.14, 0.18), hair, P)]
        for i, x in enumerate((-0.14, -0.07, 0.0, 0.07, 0.14)):
            parts += chain(lerp_pts((x, 0.075, 0.86), (x * 1.1, 0.085, 0.56), 6), 0.05, hair, P, wob=0.012 * (1 if i % 2 else -1), r2=0.042)
        for sx in (-1, 1):
            parts += chain(lerp_pts((0.165 * sx, -0.02, 0.86), (0.175 * sx, -0.05, 0.58), 6), 0.044, hair, P, wob=0.011, r2=0.034)
        c = fuse(parts, 0.0045, 13)
        boolean_cut(c, (0, -0.19, 0.82), (0.27, 0.2, 0.2))
        boolean_cut(c, (-0.03, -0.2, 0.89), (0.16, 0.12, 0.07))
        if cfg.get('clip'): ellipsoid('clip', surf(-0.1, 0.985, 0.03), (0.024, 0.012, 0.011), mat('clip', cfg['clip'], 0.3, coat=0.8), P)
    elif style == 'pony_high':
        tie = Vector((0, 0.14, 1.02))
        parts = [cap((0.012, 0.016, 0.012), (0, 0.012, 0.018)),
                 ellipsoid('bang', (-0.03, -0.1, 1.0), (0.15, 0.075, 0.06), hair, P, rot=rotY(-12)),
                 ellipsoid('knot', tie, (0.05, 0.05, 0.05), hair, P)]
        parts += chain([tie + Vector((0, 0.04, -0.02)), (0, 0.205, 0.95), (0, 0.225, 0.88), (0, 0.22, 0.81), (0, 0.2, 0.75)], 0.05, hair, P, wob=0.006, r2=0.026)
        for sx in (-1, 1): parts.append(capsule('lock', (0.16 * sx, -0.06, 0.95), (0.165 * sx, -0.07, 0.83), 0.022, hair, P, r2=0.012))
        c = fuse(parts, 0.004, 9)
        boolean_cut(c, (0, -0.19, 0.8), (0.27, 0.2, 0.2))
        boolean_cut(c, (0.03, -0.2, 0.89), (0.16, 0.12, 0.07))
        torus('scrunchie', tie + Vector((0, 0.025, -0.01)), (0, 1, 0.5), 0.042, 0.016, mat('scr', cfg.get('scrunchie', '#9caf88'), 0.8, sheen=0.5), P)
    elif style == 'pony_low':
        tie = Vector((0, 0.165, 0.79))
        parts = [cap((0.012, 0.016, 0.01), (0, 0.012, 0.016))]
        for sx in (-1, 1): parts.append(ellipsoid('bang', (0.06 * sx, -0.105, 0.99), (0.1, 0.065, 0.05), hair, P, rot=rotY(16 * sx)))
        parts.append(ellipsoid('knot', tie, (0.045, 0.04, 0.045), hair, P))
        parts += chain([tie + Vector((0, 0.03, -0.03)), (0, 0.2, 0.7), (0, 0.19, 0.63), (0, 0.17, 0.57)], 0.04, hair, P, wob=0.004, r2=0.022)
        c = fuse(parts, 0.004, 9)
        boolean_cut(c, (0, -0.19, 0.8), (0.27, 0.2, 0.2))
        boolean_cut(c, (0, -0.2, 0.895), (0.05, 0.12, 0.07))  # belahan tengah
        torus('band', tie + Vector((0, 0.022, -0.012)), (0, 1, 0.3), 0.032, 0.009, mat('band', '#3a3a3a', 0.6), P)
    elif style == 'curly':
        random.seed(11)
        parts = [cap((0.02, 0.022, 0.016), (0, 0.014, 0.02))]
        for i in range(95):
            th = random.uniform(0, 2 * math.pi); ph = random.uniform(-0.55, 1.0)
            v = Vector((math.cos(th) * math.cos(ph * 1.2), math.sin(th) * math.cos(ph * 1.2), math.sin(ph * 1.2)))
            p = H + Vector((v.x * (R[0] + 0.03), v.y * (R[1] + 0.03) + 0.01, v.z * (R[2] + 0.025)))
            if p.y < -0.06 and p.z < 1.0: continue          # wajah
            if p.z < 0.78 and p.y < 0.0 and abs(p.x) < 0.17: continue
            parts.append(ellipsoid('curl', p, (0.05, 0.05, 0.05), hair, P, seg=20))
        for i in range(40):   # ikal sampai bahu
            x = random.uniform(-0.2, 0.2); y = random.uniform(-0.02, 0.12); z = random.uniform(0.66, 0.84)
            if abs(x) < 0.15 and y < 0.04: continue
            parts.append(ellipsoid('curl', (x, y, z), (0.048, 0.048, 0.048), hair, P, seg=20))
        for x in (-0.11, -0.05, 0.01, 0.07, 0.12):  # poni ikal
            parts.append(ellipsoid('curlbang', surf(x, 0.985 + random.uniform(-0.01, 0.01), 0.025), (0.035, 0.03, 0.033), hair, P, seg=20))
        c = fuse(parts, 0.0042, 8)
        boolean_cut(c, (0, -0.2, 0.83), (0.27, 0.2, 0.2))
    elif style == 'asym_short':
        parts = [cap((0.018, 0.02, 0.022), (0, 0.012, 0.024)),
                 ellipsoid('bang', (-0.04, -0.1, 0.985), (0.17, 0.08, 0.068), hair, P, rot=rotY(-18)),
                 ellipsoid('bang2', (-0.12, -0.08, 0.93), (0.07, 0.075, 0.08), hair, P),
                 ellipsoid('back', (0, 0.08, 0.87), (0.16, 0.08, 0.1), hair, P),
                 ellipsoid('tuft1', (0.06, -0.03, 1.075), (0.09, 0.08, 0.05), hair, P, rot=rotY(-20)),
                 ellipsoid('tuft2', (-0.03, 0.04, 1.08), (0.1, 0.09, 0.05), hair, P, rot=rotY(12)),
                 ellipsoid('tuft3', (0.12, -0.05, 1.02), (0.06, 0.08, 0.06), hair, P, rot=rotY(-35))]
        parts += chain(lerp_pts((-0.165, -0.035, 0.93), (-0.16, -0.06, 0.76), 4), 0.052, hair, P, r2=0.03)
        c = fuse(parts, 0.004, 12)
        boolean_cut(c, (0.03, -0.2, 0.82), (0.25, 0.2, 0.2))
        boolean_cut(c, (0.21, -0.03, 0.83), (0.08, 0.16, 0.14))           # sisi kanan pendek (telinga keliatan)
        boolean_cut(c, (0.08, 0.04, 0.73), (0.36, 0.4, 0.12))
        ellipsoid('earring', (0.185, -0.005, 0.85), (0.008, 0.008, 0.008), mat('gold', '#d4a63a', 0.25, metal=0.9), P)
    elif style == 'bob':   # bob sebahu, poni samping, ujung rata
        parts = [cap((0.02, 0.022, 0.016), (0, 0.014, 0.02)),
                 ellipsoid('bang', (0.04, -0.096, 1.0), (0.16, 0.08, 0.062), hair, P, rot=rotY(16)),
                 ellipsoid('bback', (0, 0.06, 0.86), (0.2, 0.13, 0.16), hair, P)]
        for sx in (-1, 1):
            parts.append(capsule('bside', (0.158 * sx, -0.02, 0.96), (0.172 * sx, -0.03, 0.775), 0.056, hair, P, r2=0.05))
            parts.append(ellipsoid('bflip', (0.175 * sx, -0.01, 0.775), (0.06, 0.07, 0.035), hair, P))
        c = fuse(parts, 0.0045, 12)
        boolean_cut(c, (0, -0.19, 0.82), (0.27, 0.2, 0.2))
        boolean_cut(c, (-0.03, -0.2, 0.89), (0.16, 0.12, 0.07))
        boolean_cut(c, (0, 0.0, 0.69), (0.5, 0.5, 0.12))
    elif style == 'halfup_long':   # hitam panjang lurus, setengah diikat ke belakang
        parts = [cap((0.016, 0.02, 0.014), (0, 0.014, 0.018)),
                 ellipsoid('bang', (0.0, -0.1, 0.995), (0.16, 0.075, 0.06), hair, P),
                 ellipsoid('hairback2', (0, 0.07, 0.88), (0.19, 0.13, 0.18), hair, P),
                 ellipsoid('knot', (0, 0.17, 0.97), (0.05, 0.04, 0.045), hair, P)]
        for i, x in enumerate((-0.13, -0.065, 0.0, 0.065, 0.13)):
            parts.append(capsule('strand', (x, 0.08, 0.86), (x * 1.05, 0.095, 0.52), 0.05, hair, P, r2=0.038))
        for sx in (-1, 1):
            parts.append(capsule('front', (0.163 * sx, -0.025, 0.9), (0.17 * sx, -0.045, 0.6), 0.04, hair, P, r2=0.03))
        c = fuse(parts, 0.0045, 12)
        boolean_cut(c, (0, -0.19, 0.82), (0.27, 0.2, 0.2))
        boolean_cut(c, (0, -0.2, 0.895), (0.05, 0.12, 0.07))
        torus('htie', (0, 0.2, 0.975), (0, 1, 0.3), 0.03, 0.008, mat('htie', '#7c3aed', 0.5), P)
    elif style == 'undercut':   # atas tebal bertekstur, samping tipis (fade)
        fade = ellipsoid('fade', H + Vector((0, 0.01, 0.012)), (R[0] + 0.005, R[1] + 0.006, R[2] + 0.004), mat('fade', shade(cfg['hair'], 0.18), 0.7), P)
        boolean_cut(fade, (0, -0.17, 0.81), (0.44, 0.2, 0.22))
        boolean_cut(fade, (0, 0.02, 0.74), (0.5, 0.5, 0.14))
        parts = [ellipsoid('utop', (0, -0.01, 1.04), (0.16, 0.16, 0.07), hair, P)]
        dirs = [(-0.3, -0.6, 0.75), (0.15, -0.65, 0.75), (0.45, -0.4, 0.8), (-0.45, -0.1, 0.85), (0.4, 0.1, 0.9), (0.0, 0.3, 0.95), (-0.2, -0.3, 0.95), (0.2, -0.1, 1.0)]
        for d in dirs:
            d = Vector(d).normalized()
            parts.append(ellipsoid('tuft', H + d * 0.175 + Vector((0, 0, 0.02)), (0.055, 0.046, 0.05), hair, P, rot=d.to_track_quat('Z', 'Y')))
        c = fuse(parts, 0.0048, 14)
        boolean_cut(c, (0, -0.2, 0.93), (0.3, 0.12, 0.09))
        boolean_cut(c, (0, 0.0, 0.86), (0.5, 0.5, 0.2))
    elif style == 'fluffy':   # chibi cowok: rambut tebal mengembang, poni berhelai disisir ke samping, ujung mencuat
        random.seed(cfg.get('hair_seed', 3))
        c0 = cap((0.026, 0.028, 0.034), (0, 0.016, 0.036))
        boolean_cut(c0, (0, -0.2, 0.93), (0.32, 0.16, 0.16))   # batok dipotong di dahi → tepi depan dibentuk ujung poni (tidak rata)
        parts = [c0]
        for i in range(7):   # poni: helai tebal dari ubun-ubun, condong ke kiri, ujung tidak rata & sebagian terangkat
            x = -0.14 + i * 0.047; sw = -0.03 + x * 0.25 + random.uniform(-0.012, 0.012)
            tz = 0.955 + (0.03 if i in (1, 5) else 0) + random.uniform(-0.006, 0.008)
            dy = -0.012 * (i % 2)   # helai selang-seling maju/mundur biar berlapis
            parts += lock(bez((x * 0.3 + 0.02, -0.01, 1.13), (x * 1.05 + 0.01, -0.185 + dy, 1.09), (x * 1.1 + sw, -0.2 + dy, tz)), 0.046, 0.009, hair, P)
        for el in (18, 48):   # helai sekeliling kepala, ujung jatuh ke bawah/belakang & sedikit mencuat
            n = 13 if el < 30 else 9
            for k in range(n):
                az = math.radians(k * 360 / n + random.uniform(-10, 10) + el)
                d = Vector((math.sin(az) * math.cos(math.radians(el)), math.cos(az) * math.cos(math.radians(el)), math.sin(math.radians(el))))
                if d.y < -0.3: continue            # depan = poni
                root = H + Vector((0, 0.016, 0.036)) + Vector((d.x * R[0], d.y * R[1], d.z * R[2])) * 0.88
                tip = root + d * (0.06 if el < 30 else 0.075) + Vector((0, 0.03, -0.12 if el < 30 else -0.085)) + Vector((random.uniform(-0.02, 0.02), 0, 0))
                parts += lock(bez(root, root + d * 0.07 + Vector((0, 0, 0.01)), tip, 5), 0.045, 0.008, hair, P)
        for k in range(4):   # jambul di ubun-ubun biar mengembang
            d = Vector((random.uniform(-0.5, 0.5), random.uniform(0.0, 0.6), 1)).normalized()
            root = H + Vector((0, 0.02, 0.2))
            parts += lock(bez(root, root + d * 0.05 + Vector((0, -0.03, 0)), root + d * 0.08 + Vector((0, 0.03, -0.02)), 4), 0.05, 0.016, hair, P)
        c = fuse(parts, 0.0038, 4)
        boolean_cut(c, (0, -0.17, 0.81), (0.44, 0.2, 0.22))     # muka
        boolean_cut(c, (0, -0.2, 0.9), (0.3, 0.12, 0.09))       # dahi (ujung poni di atasnya tetap)
        boolean_cut(c, (0, 0.04, 0.74), (0.5, 0.5, 0.12))       # tengkuk
        for sx in (-1, 1): boolean_cut(c, (0.215 * sx, -0.03, 0.855), (0.07, 0.2, 0.11))   # telinga keliatan
    elif style == 'long_bangs':   # chibi cewek: panjang lurus sampai punggung, poni tirai, helai depan jatuh ke dada
        random.seed(cfg.get('hair_seed', 4))
        c0 = cap((0.02, 0.024, 0.018), (0, 0.014, 0.02))
        boolean_cut(c0, (0, -0.2, 0.93), (0.3, 0.16, 0.16))
        parts = [c0, ellipsoid('hairback2', (0, 0.07, 0.9), (0.2, 0.14, 0.18), hair, P)]
        for i in range(9):   # poni tirai: belah tengah, melengkung ke samping
            t = (i - 4) / 4; x = t * 0.15
            tz = 0.95 - abs(t) * 0.05 + random.uniform(-0.005, 0.005)
            parts += lock(bez((t * 0.03, -0.04, 1.1), (x * 0.9, -0.17, 1.06), (x * 1.08, -0.192 + abs(t) * 0.03, tz)), 0.045, 0.011, hair, P)
        for i in range(11):   # rambut belakang panjang
            x = -0.19 + i * 0.038; y = 0.07 + 0.05 * (1 - abs(x) / 0.19)
            parts += lock(bez((x * 0.85, y - 0.02, 0.96), (x * 1.08, y + 0.04, 0.76), (x * 1.0 + random.uniform(-0.015, 0.015), y + 0.02, 0.52 + random.uniform(-0.02, 0.02)), 6),
                          0.05, 0.016, hair, P)
        for sx in (-1, 1):   # helai depan bahu
            for j in range(2):
                x0 = (0.15 + j * 0.02) * sx
                parts += lock(bez((x0 * 0.9, -0.04 + j * 0.03, 1.02), (x0 * 1.18, -0.07 + j * 0.03, 0.82), (x0 * 1.02, -0.09 + j * 0.03, 0.58 + j * 0.03), 6),
                              0.042, 0.012, hair, P)
        c = fuse(parts, 0.0042, 5)
        boolean_cut(c, (0, -0.2, 0.82), (0.25, 0.2, 0.19))
    elif style == 'mukena':   # mukena: penutup kepala putih yang jatuh lebar menutup bahu sampai pinggang
        parts = [ellipsoid('mk', H + Vector((0, 0.01, 0.006)), (R[0] + 0.02, R[1] + 0.022, R[2] + 0.016), hair, P),
                 ellipsoid('mkwrap', (0, 0.0, 0.73), (0.15, 0.13, 0.08), hair, P),
                 frustum('mkcape', (0, 0.01, 0.56), 0.25, 0.15, 0.3, hair, P, bevel=0.04, seg=48)]
        c = fuse(parts, 0.0045, 12)
        boolean_cut(c, (0, -0.205, 0.868), (0.142, 0.13, 0.122), shape='ell')
    elif style == 'hijab':
        parts = [ellipsoid('hj', H + Vector((0, 0.01, 0.004)), (R[0] + 0.013, R[1] + 0.018, R[2] + 0.012), hair, P),
                 ellipsoid('neckwrap', (0, 0.0, 0.72), (0.13, 0.12, 0.07), hair, P),
                 ellipsoid('shawl', (0, 0.005, 0.665), (0.165, 0.11, 0.06), hair, P),
                 ellipsoid('front', (0, -0.05, 0.61), (0.12, 0.05, 0.085), hair, P)]
        c = fuse(parts, 0.004, 14)
        boolean_cut(c, (0, -0.205, 0.868), (0.142, 0.13, 0.122), shape='ell')
        # dalaman (ciput) tipis di dahi
        ellipsoid('pin', (0.1, -0.135, 0.735), (0.009, 0.006, 0.009), mat('pin', '#f4f2ee', 0.2, coat=1.0), P)
