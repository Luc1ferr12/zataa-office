# Library karakter gaya "3D mainan" (toy / vinyl chibi) kantor Zataa.
# Semua bentuk dibuat dari primitif membulat yang dilebur (voxel remesh + smooth) → kesan dipahat.
# Data tiap pegawai ada di CHARS (rambut, kacamata, baju dalam/luar, bawahan, sepatu, properti, pose).
import bpy, bmesh, math, random
from math import radians, sqrt
from mathutils import Vector, Matrix

COLL = None
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
    r = ob.modifiers.new('rm', 'REMESH'); r.mode = 'VOXEL'; r.voxel_size = voxel
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
    'dir': dict(name='Aprista', g='f', skin='#f0c9a8', hair='#6b3e22', brow='#4a2a18', hair_style='wavy_long', clip='#a78bfa',
                top=dict(kind='tee', color='#f4f1ea'), outer=dict(kind='blazer', color='#1f2a4a'),
                bottom=dict(kind='skirt', color='#e6d8bd', length='knee'), shoe=dict(kind='flat', color='#7a4a2e'),
                pose=dict(head=(6, 3, 8), twist=6, lean=-2, el={1: (0.205, 0.03, 0.56)}, wr={1: (0.125, 0.012, 0.47)},
                          foot={-1: (-0.004, -0.02, 12), 1: (0.006, 0.01, 8)})),
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
}
LOW_SHOES = ('flat', 'slipon', 'pump', 'lowheel', 'loafer', 'oxford')

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
def surf(x, z, out=0.0):
    k = 1 - (x / R[0]) ** 2 - ((z - H.z) / R[2]) ** 2
    return Vector((x, -R[1] * sqrt(max(k, 0)) - out, z))

def build(cid, loc=(0, 0, 0), yaw=0.0, pose_name='stand'):
    cfg = CHARS[cid]
    root = bpy.data.objects.new(cfg['name'], None); COLL.objects.link(root)
    P = root; g = cfg['g']; props = list(cfg.get('props', []))
    base = cfg.get('pose', {})
    over = POSES[pose_name]
    if over:   # pose aktivitas: kaki/lengan diganti, gaya kepala karakter tetap
        base = {k: v for k, v in base.items() if k in ('head', 'twist', 'lean')}
        props = [p for p in props if p not in ('notebook', 'phone', 'duster')]   # dasi & jam tangan tetap dipakai
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
            cfg['peci'] = True; cfg['outer'] = None; cfg['hair_style'] = 'short_neat'
    nm = cfg['name']
    skin = mat('skin', cfg['skin'], 0.5, sss=0.15)
    skinD = mat('skinD', shade(cfg['skin'], -0.08), 0.5, sss=0.1)
    hair = mat('hair', cfg['hair'], 0.5, coat=0.12)
    T, O, B, S = cfg['top'], cfg.get('outer'), cfg['bottom'], cfg['shoe']
    top = (pattern_mat('tunic_' + nm, 'stripe', T['color'], T['color2'], 70) if T['kind'] == 'tunic' and T['color'] != T['color2']
           else mat('top', T['color'], 0.8, sheen=0.4))
    bot = mat('bot', B['color'], 0.75, sheen=0.3)
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
        wide = 0.004 if B['kind'] == 'cargo' else 0.0
        for s in (-1, 1):
            parts.append(capsule('pleg', HIP[s], KN[s], 0.052 + wide, bot, P, r2=0.047 + wide))
            parts.append(capsule('pleg2', KN[s], AK[s], 0.047 + wide, bot, P, r2=0.044 + wide))
        fuse(parts, 0.0035, 8)
        for s in (-1, 1): torus('pcuff', AK[s] + Vector((0, 0, 0.005)), (KN[s] - AK[s]).normalized(), 0.043 + wide, 0.006, bot, P)
        if B['kind'] == 'cargo':  # saku samping
            for s in (-1, 1):
                rbox('cargopocket', (0.105 * s, -0.01, 0.31), (0.022, 0.07, 0.08), mat('cargo2', shade(B['color'], -0.08), 0.8), 0.01, P)
        if B['kind'] == 'jeans':  # jahitan kuning khas jeans
            for s in (-1, 1):
                capsule('seam', HIP[s] + Vector((0.043 * s, -0.01, -0.01)), KN[s] + Vector((0.046 * s, 0, 0)), 0.0022, mat('seam', '#d9a441', 0.6), P)
                capsule('seam', KN[s] + Vector((0.046 * s, 0, 0)), AK[s] + Vector((0.042 * s, 0, 0.015)), 0.0022, mat('seam', '#d9a441', 0.6), P)
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
        Rz = Matrix.Rotation(radians(FT[s][2] * s), 4, 'Z') @ Matrix.Rotation(radians(pose.get('toe', {}).get(s, 0)), 4, 'X')
        base = Vector((AK[s].x, AK[s].y, AK[s].z - ankle_h))
        for o in objs: o.matrix_basis = Matrix.Translation(base) @ Rz @ o.matrix_basis
    lower = set(o.name for o in P.children)

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
        oc = pattern_mat('flannel_' + nm, 'plaid', O['color'], O['color2'], 55) if ok == 'flannel' else mat('outer', O['color'], 0.8, sheen=0.35)
        oz0 = {'blazer': 0.38, 'cardigan': 0.36, 'flannel': 0.38, 'parka': 0.33, 'jacket': 0.39, 'bomber': 0.42, 'vest': 0.4, 'techwear': 0.37}[ok]
        outer = garment(oc, oz0, 1.07, 'none' if ok == 'vest' else 'long', sr=0.004)
        trim = mat('otrim', shade(O['color'], -0.15 if O['color'] != '#1c1b22' else 0.12), 0.8)
        if ok != 'bomber':
            wb, wt = {'blazer': (0.012, 0.056), 'cardigan': (0.02, 0.046), 'flannel': (0.026, 0.046), 'jacket': (0.028, 0.04), 'parka': (0.03, 0.044),
                      'vest': (0.016, 0.06), 'techwear': (0.026, 0.038)}[ok]
            edge_m = mat('zip', '#c9c9c9', 0.3, metal=0.7) if ok in ('jacket', 'parka', 'techwear') else trim
            front_opening(outer, top, oz0 + 0.03, 0.716, wb, wt, edge_m, 0.0042 if ok != 'blazer' else 0.0055)
        if ok != 'vest': cuffs('long', trim if ok in ('bomber', 'cardigan', 'techwear') else oc, 0.035, 0.0065 if ok != 'bomber' else 0.01, sr=0.004)
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
    if 'watch' in props and not pose.get('pray'):
        s_ = -1
        if s_ not in POCKET:
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
    ellipsoid('head', H, R, skin, P)
    for s in (-1, 1):
        if style != 'hijab': ellipsoid('ear', (0.182 * s, 0.01, 0.885), (0.025, 0.02, 0.035), skin, P)
        ellipsoid('eye', surf(0.062 * s, 0.885, -0.004), (0.019, 0.012, 0.028), eye, P)
        ellipsoid('hl', surf(0.068 * s, 0.898, 0.004), (0.006, 0.004, 0.007), hl, P)
        bp = surf(0.064 * s, 0.937, 0.002)
        bw = 0.0065 if g == 'm' else 0.0052
        capsule('brow', bp + Vector((-0.022 * s, 0, -0.002)), bp + Vector((0.022 * s, 0, 0.003)), bw, brow, P)
        if g == 'f':
            ellipsoid('blush', surf(0.1 * s, 0.85, -0.002), (0.024, 0.006, 0.014), blush, P)
            for k in range(3):
                capsule('lash', surf((0.074 + k * 0.006) * s, 0.903 + k * 0.002, 0.0), surf((0.082 + k * 0.008) * s, 0.91 + k * 0.004, 0.006), 0.0028, eye, P)
    ellipsoid('nose', surf(0, 0.853, -0.006), (0.016, 0.012, 0.013), skinD, P)
    pts = [surf(((i / 8 - 0.5) * 2) * 0.026, 0.815 + 0.009 * ((i / 8 - 0.5) * 2) ** 2, 0.001) for i in range(9)]
    for i in range(8): capsule('mouth', pts[i], pts[i + 1], 0.0045, lip, P)

    if cfg.get('glasses'):
        fr = mat('glassframe', cfg['glasses'], 0.3, coat=0.6)
        thick = 0.0055 if cfg['glasses'] == '#2563eb' else 0.0032 if cfg.get('glasses_thin') else 0.0042
        for s in (-1, 1):
            c = surf(0.062 * s, 0.888, 0.016)
            torus('lensring', c, (0.22 * s, -1, 0), 0.034, thick, fr, P)
            capsule('temple', c + Vector((0.033 * s, 0.004, 0.004)), Vector((0.178 * s, 0.0, 0.9)), thick * 0.8, fr, P)
        capsule('bridge', surf(0.03, 0.895, 0.02), surf(-0.03, 0.895, 0.02), thick * 0.8, fr, P)

    hair_style(style, cfg, hair, P)
    if cfg.get('peci'):
        frustum('peci', (0, 0.01, 1.075), 0.165, 0.158, 0.08, mat('peci', '#17151d', 0.6, sheen=0.5), P, bevel=0.012, seg=48)

    # ================= POSE: kepala miring/nengok, badan atas muter & condong
    def rot_about(ob, pivot, M):
        ob.matrix_basis = Matrix.Translation(pivot) @ M @ Matrix.Translation(-Vector(pivot)) @ ob.matrix_basis
    roll, nod, turn = pose.get('head', (0, 0, 0))
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
    root.location = Vector(loc) - Vector((0, 0, pose.get('drop', 0) * sc)); root.rotation_euler = (0, 0, radians(yaw))
    root.scale = (sc, sc, sc)
    return root

# ---------------------------------------------------------------- gaya rambut
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
