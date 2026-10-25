# Render barisan pegawai gaya 3D mainan (cek desain karakter, belum dipakai di web).
#   blender --background --factory-startup --python blender/toy_lineup.py -- <out.png> <samples> <id,id,...>
import bpy, sys, os, math
from math import radians
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import toy_lib as T

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else '//lineup.png'
SAMPLES = int(argv[1]) if len(argv) > 1 else 128
IDS = argv[2].split(',') if len(argv) > 2 else list(T.CHARS)

for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
scene = bpy.context.scene
T.setup(scene.collection)

GAP = 0.44
n = len(IDS)
for i, spec in enumerate(IDS):
    cid, pose = (spec.split(':') + ['stand'])[:2]   # id:pose
    x = (i - (n - 1) / 2) * GAP
    T.build(cid, (x, (i % 2) * 0.05, 0), yaw=-x * 6 + float(os.environ.get('TOY_YAW', 0)), pose_name=pose)
    if pose in ('sit', 'type'):   # kursi bulat sederhana biar kebaca duduk
        T.frustum('stool', (x, (i % 2) * 0.05 + 0.02, 0.2), 0.13, 0.15, 0.4, T.mat('stool', '#7c3aed', 0.5), bevel=0.02)

floor = T.rbox('floor', (0, 0.5, -0.05), (n * GAP + 6, 6, 0.1), T.mat('floor', '#ece4d6', 0.9), 0.01)

tgt = bpy.data.objects.new('target', None); scene.collection.objects.link(tgt); FH = float(os.environ.get('TOY_FRAME_H', 1.3)); tgt.location = (0, 0, FH * 0.43)
cam_d = bpy.data.cameras.new('cam'); cam_d.type = 'ORTHO'; cam_d.ortho_scale = max(n * GAP + 0.25, FH)
cam = bpy.data.objects.new('cam', cam_d); scene.collection.objects.link(cam)
az, el = radians(0), radians(float(os.environ.get('TOY_ELEV', 10)))
cam.location = tgt.location + 12 * Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
c = cam.constraints.new('TRACK_TO'); c.target = tgt; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
scene.camera = cam

sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 2.4; sun.angle = radians(15); sun.color = (1.0, 0.95, 0.88)
so = bpy.data.objects.new('sun', sun); scene.collection.objects.link(so); so.rotation_euler = (radians(50), radians(-5), radians(-30))
fill = bpy.data.lights.new('fill', 'AREA'); fill.energy = 400; fill.size = 6; fill.color = (0.92, 0.94, 1.0)
fo = bpy.data.objects.new('fill', fill); scene.collection.objects.link(fo); fo.location = (2.0, -4.0, 3.0)
fc = fo.constraints.new('TRACK_TO'); fc.target = tgt; fc.track_axis = 'TRACK_NEGATIVE_Z'; fc.up_axis = 'UP_Y'
world = bpy.data.worlds.new('w'); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = T.hexc(os.environ.get('TOY_BG', '#efe8dc')); bg.inputs['Strength'].default_value = 0.9

scene.render.engine = 'CYCLES'
cy = scene.cycles; cy.samples = SAMPLES; cy.use_denoising = True
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'OPTIX'; prefs.get_devices()
    for d in prefs.devices: d.use = d.type == 'OPTIX'
    cy.device = 'GPU'
except Exception as e:
    print('GPU off:', e)
aspect = (n * GAP + 0.25) / FH
scene.render.resolution_x = int(600 * n * float(os.environ.get('TOY_RES', 1)))
scene.render.resolution_y = int(scene.render.resolution_x / aspect)
try:
    scene.view_settings.view_transform = 'AgX'; scene.view_settings.look = 'AgX - Punchy'
except Exception:
    pass
scene.render.filepath = OUT
bpy.ops.render.render(write_still=True)
if os.environ.get('TOY_BLEND'): bpy.ops.wm.save_as_mainfile(filepath=os.environ['TOY_BLEND'])   # buat dibuka & diputar di Blender
print('RENDER OK', OUT)
