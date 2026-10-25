# Foto profil (wajah) tiap pegawai gaya 3D mainan → dipakai avatar card Tim di dashboard.
#   blender --background --factory-startup --python blender/toy_portraits.py -- <out_dir> [samples] [id,id,...]
# Hasil PNG transparan 256×256 per id; konversi ke docs/assets/office/faces/<id>.webp pakai blender/faces_webp.py.
import bpy, sys, os, math
from math import radians
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import toy_lib as T

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else '//faces'
SAMPLES = int(argv[1]) if len(argv) > 1 else 96
IDS = argv[2].split(',') if len(argv) > 2 else list(T.CHARS)
BUST = os.environ.get('PORTRAIT') == 'bust'   # setengah badan (kartu Tim) — default: wajah saja (avatar chat)
SIZE = 1.0 if BUST else 0.62 if T.STYLE != 'chibi' else 0.56   # lebar bingkai (meter) di sekitar kepala
os.makedirs(bpy.path.abspath(OUT), exist_ok=True)

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
cy = scene.cycles; cy.samples = SAMPLES; cy.use_denoising = True
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'OPTIX'; prefs.get_devices()
    for d in prefs.devices: d.use = d.type == 'OPTIX'
    cy.device = 'GPU'
except Exception as e:
    print('GPU off:', e)
scene.render.resolution_x = scene.render.resolution_y = 256
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
try:
    scene.view_settings.view_transform = 'AgX'; scene.view_settings.look = 'AgX - Punchy'
except Exception:
    pass
world = bpy.data.worlds.new('w'); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = T.hexc('#efe8dc'); bg.inputs['Strength'].default_value = 0.9

def clear():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.curves, bpy.data.lights, bpy.data.cameras):  # material dicache toy_lib, jangan dihapus
        for b in list(coll):
            if b.users == 0: coll.remove(b)

def top_z():
    dg = bpy.context.evaluated_depsgraph_get()
    z = 0.0
    for o in scene.objects:
        if o.type != 'MESH': continue
        e = o.evaluated_get(dg)
        z = max(z, max((e.matrix_world @ Vector(c)).z for c in e.bound_box))
    return z

for cid in IDS:
    clear()
    T.setup(scene.collection)
    T.build(cid, (0, 0, 0), yaw=0.0, pose_name='stand')
    hd = next((o for o in scene.objects if o.type == 'MESH' and o.name.startswith('head')), None)
    if T.STYLE == 'chibi' and hd:   # chibi: rambut/ponytail/hijab bikin puncak kepala nggak bisa jadi patokan → pakai bola kepala
        bpy.context.view_layer.update()
        head = sum((hd.matrix_world @ Vector(c) for c in hd.bound_box), Vector()).z / 8 + (0.03 if not BUST else -0.22)
    else:
        head = top_z() - 0.26   # kira-kira tengah wajah (kepala chibi besar, ±0.45 m)
    tgt = bpy.data.objects.new('target', None); scene.collection.objects.link(tgt); tgt.location = (0, 0, head)
    cam_d = bpy.data.cameras.new('cam'); cam_d.type = 'ORTHO'; cam_d.ortho_scale = SIZE
    cam = bpy.data.objects.new('cam', cam_d); scene.collection.objects.link(cam)
    el = radians(6)
    cam.location = tgt.location + 10 * Vector((0, -math.cos(el), math.sin(el)))
    c = cam.constraints.new('TRACK_TO'); c.target = tgt; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
    scene.camera = cam
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 2.4; sun.angle = radians(15); sun.color = (1.0, 0.95, 0.88)
    so = bpy.data.objects.new('sun', sun); scene.collection.objects.link(so); so.rotation_euler = (radians(50), radians(-5), radians(-30))
    fill = bpy.data.lights.new('fill', 'AREA'); fill.energy = 120; fill.size = 2; fill.color = (0.92, 0.94, 1.0)
    fo = bpy.data.objects.new('fill', fill); scene.collection.objects.link(fo); fo.location = (0.8, -2.0, head + 0.6)
    fc = fo.constraints.new('TRACK_TO'); fc.target = tgt; fc.track_axis = 'TRACK_NEGATIVE_Z'; fc.up_axis = 'UP_Y'
    scene.render.filepath = os.path.join(bpy.path.abspath(OUT), f'{cid}.png')
    bpy.ops.render.render(write_still=True)
    print('PORTRAIT', cid, round(head, 3))
