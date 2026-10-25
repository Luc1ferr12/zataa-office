# Lembar karakter (turnaround) gaya chibi: depan / belakang / kiri / kanan + close-up muka, latar transparan (bayangan ikut).
#   TOY_STYLE=chibi blender --background --factory-startup --python blender/toy_sheet.py -- <out_dir> <samples> <id> [skala_res] [views]
#   views: koma, default front,back,left,right,face,face34l,face34r,faceside,faceback  → <out_dir>/<id>_<view>.png
# Lalu gabung jadi satu lembar: python blender/sheet_compose.py <out_dir> <id> <judul> <out.png>
import bpy, sys, os, math
from math import radians
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import toy_lib as T

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = os.path.abspath(argv[0]); SAMPLES = int(argv[1]); CID = argv[2]
RES = float(argv[3]) if len(argv) > 3 else 1.0
VIEWS = argv[4].split(',') if len(argv) > 4 else ['front', 'back', 'left', 'right', 'face', 'face34l', 'face34r', 'faceside', 'faceback']
os.makedirs(OUT, exist_ok=True)

for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
scene = bpy.context.scene
T.setup(scene.collection)
root = T.build(CID, (0, 0, 0), 0.0, 'stand')
bpy.context.view_layer.update()

def meshes(o):
    for c in o.children:
        if c.type == 'MESH': yield c
        yield from meshes(c)
pts = [m.matrix_world @ Vector(c) for m in meshes(root) for c in m.bound_box]
zmax = max(p.z for p in pts)
head = next(m for m in meshes(root) if m.name.startswith('head'))
hc = sum((head.matrix_world @ Vector(c) for c in head.bound_box), Vector()) / 8
hc.z += 0.02

floor = T.rbox('floor', (0, 0, -0.05), (8, 8, 0.1), T.mat('floor', '#2a2533', 0.8), 0.01)
floor.is_shadow_catcher = True

tgt = bpy.data.objects.new('target', None); scene.collection.objects.link(tgt)
cam_d = bpy.data.cameras.new('cam'); cam_d.type = 'ORTHO'
cam = bpy.data.objects.new('cam', cam_d); scene.collection.objects.link(cam)
c = cam.constraints.new('TRACK_TO'); c.target = tgt; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
scene.camera = cam

def area(name, loc, energy, size, color):
    L = bpy.data.lights.new(name, 'AREA'); L.energy = energy; L.size = size; L.color = color
    o = bpy.data.objects.new(name, L); scene.collection.objects.link(o); o.location = loc
    k = o.constraints.new('TRACK_TO'); k.target = tgt; k.track_axis = 'TRACK_NEGATIVE_Z'; k.up_axis = 'UP_Y'
    return o
# lampu ikut kamera (rig diputar bareng sudut pandang) biar tiap sisi dapat cahaya yang sama
rig = bpy.data.objects.new('rig', None); scene.collection.objects.link(rig)
for o in (area('key', (-2.2, -3.2, 2.6), 650, 2.5, (1.0, 0.93, 0.86)), area('fill', (2.6, -2.6, 1.4), 220, 3, (1.0, 0.96, 0.94)),
          area('rimL', (-2.2, 2.6, 1.8), 380, 1.5, (0.66, 0.5, 1.0)), area('rimR', (2.2, 2.6, 1.8), 380, 1.5, (0.66, 0.5, 1.0)),
          area('top', (0, 0, 3.4), 120, 3, (1, 1, 1))):
    o.parent = rig
world = bpy.data.worlds.new('w'); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = T.hexc('#2a2338'); bg.inputs['Strength'].default_value = 0.25

scene.render.engine = 'CYCLES'
cy = scene.cycles; cy.samples = SAMPLES; cy.use_denoising = True
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'OPTIX'; prefs.get_devices()
    for d in prefs.devices: d.use = d.type == 'OPTIX'
    cy.device = 'GPU'
except Exception as e:
    print('GPU off:', e)
scene.render.film_transparent = True
try:
    scene.view_settings.view_transform = 'AgX'; scene.view_settings.look = 'AgX - Punchy'
except Exception:
    pass

FULL = {'front': 0, 'back': 180, 'left': 90, 'right': -90}   # 'left' = sisi kiri karakter (+x)
FACE = {'face': 0, 'face34l': 32, 'face34r': -32, 'faceside': 90, 'faceback': 180}
for v in VIEWS:
    if v in FULL:
        yaw = FULL[v]; tgt.location = (0, 0, zmax * 0.5); cam_d.ortho_scale = zmax * 1.08; el = radians(3)
        rx, ry = 600, int(600 * 1.9)
    else:
        yaw = FACE[v]; tgt.location = hc; cam_d.ortho_scale = 0.5; el = radians(2)
        rx, ry = 700, 700
    a = radians(yaw)   # kamera muter di sekeliling karakter (karakter menghadap −y)
    cam.location = tgt.location + 12 * Vector((math.sin(a) * math.cos(el), -math.cos(a) * math.cos(el), math.sin(el)))
    rig.rotation_euler = (0, 0, a)
    scene.render.resolution_x, scene.render.resolution_y = int(rx * RES), int(ry * RES)
    scene.render.filepath = os.path.join(OUT, f'{CID}_{v}.png')
    bpy.ops.render.render(write_still=True)
    print('VIEW OK', v)
if os.environ.get('TOY_BLEND'): bpy.ops.wm.save_as_mainfile(filepath=os.environ['TOY_BLEND'])
