# Render sprite karakter 3D mainan untuk web: tiap pegawai × pose × 4 arah (S/N/E/W), kamera ortografis sama persis
# dengan web (sudut & skala piksel/meter 2×), lalu disusun jadi satu atlas per pegawai + indeks JSON.
#   blender --background --factory-startup --python blender/toy_sprites.py -- <scene.json> <out_dir> [ids] [samples] [poses]
# hasil: <out_dir>/<id>.webp + <out_dir>/<id>.json   (frame 170×250 px, titik kaki di (85, 185))
import bpy, sys, os, json, math, zlib, struct
from math import radians
from mathutils import Vector, Matrix
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import toy_lib as TL

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = argv[0], argv[1]
IDS = argv[2].split(',') if len(argv) > 2 and argv[2] else list(TL.CHARS)
SAMPLES = int(argv[3]) if len(argv) > 3 else 40
ONLY = argv[4].split(',') if len(argv) > 4 and argv[4] else None
os.makedirs(OUT, exist_ok=True)
if TL.STYLE == 'chibi': TL.HEAD_NOD = -16   # kamera web ±49° dari atas: dongak dikit biar muka nggak ketutup poni
TMP = os.path.join(OUT, '_tmp'); os.makedirs(TMP, exist_ok=True)

FW, FH, AX, AY = 170, 250, 85, 185
DS = 4   # web: tampilan 4× dari koordinat mesin (mesin 16 px/m → sprite ±66 px/m, sama dengan sprite lama)

def poses_for(cid):
    g = TL.CHARS[cid]['g']
    ps = ['stand', 'walk0', 'walk1', 'walk3', 'type0', 'type1', 'type2', 'type3', 'type_up', 'type_face', 'type_sleepy',
          'talk0', 'talk1', 'talk2', 'talk3', 'eat0', 'eat2', 'drink', 'phone', 'game', 'bench', 'beanbag', 'lie',
          'pray_qiyam', 'pray_ruku', 'pray_sujud', 'pray_duduk', 'pray_itidal']
    if g == 'm': ps += ['swim0', 'swim1', 'swim2', 'swim3']
    if cid == 'ob': ps += ['sweep0', 'sweep1', 'sweep2', 'sweep3']
    return [p for p in ps if not ONLY or p in ONLY]

D = json.load(open(SRC, encoding='utf-8'))
cam = D['camera']
B = lambda p: Vector((p[0], -p[2], p[1]))
right, down, view = B(cam['right']), B(cam['down']), B(cam['view']).normalized()
S_D = cam['S'] * DS   # piksel tampilan per meter

# arah hadap: S = ke kamera, N = membelakangi, E = ke kanan layar, W = ke kiri layar (sudut putar karakter di sumbu Z)
hv = Vector((view.x, view.y, 0)).normalized()          # dari karakter ke arah kamera (horizontal)
rv = Vector((right.x, right.y, 0)).normalized()
yaw_of = lambda f: math.atan2(-f.x, f.y) + math.pi       # karakter default menghadap -Y
YAW = {'S': yaw_of(hv), 'N': yaw_of(-hv), 'E': yaw_of(rv), 'W': yaw_of(-rv)}
# tiduran: arah = posisi kepala (S = kepala ke utara/+Y, N = ke selatan, E = ke timur, W = ke barat)
YAW_LIE = {'S': 0.0, 'N': math.pi, 'E': -math.pi / 2, 'W': math.pi / 2}

def setup_scene():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for m in list(bpy.data.meshes): bpy.data.meshes.remove(m)
    TL.MATS.clear()
    for m in list(bpy.data.materials): bpy.data.materials.remove(m)
    scene = bpy.context.scene
    TL.setup(scene.collection)
    cd = bpy.data.cameras.new('cam'); cd.type = 'ORTHO'; cd.ortho_scale = max(FW, FH) / S_D; cd.clip_end = 100   # Blender: ortho_scale = sisi terpanjang
    co = bpy.data.objects.new('cam', cd); scene.collection.objects.link(co)
    # titik kaki (0,0,0) jatuh di piksel (AX, AY) frame
    center = right * ((FW / 2 - AX) / S_D) + down * ((FH / 2 - AY) / S_D)
    M3 = Matrix((right, -down, view)).transposed()
    co.matrix_world = Matrix.Translation(center + view * 20) @ M3.to_4x4()
    scene.camera = co
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3.2; sun.angle = radians(8); sun.color = (1.0, 0.95, 0.86)
    so = bpy.data.objects.new('sun', sun); scene.collection.objects.link(so); so.rotation_euler = (radians(42), radians(-12), radians(-38))
    fill = bpy.data.lights.new('fill', 'SUN'); fill.energy = 0.8; fill.angle = radians(40); fill.color = (0.85, 0.9, 1.0)
    fo = bpy.data.objects.new('fill', fill); scene.collection.objects.link(fo); fo.rotation_euler = (radians(60), 0, radians(150))
    world = bpy.data.worlds.get('w') or bpy.data.worlds.new('w'); scene.world = world; world.use_nodes = True
    bg = world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = TL.hexc('#dfe9f5'); bg.inputs['Strength'].default_value = 0.75
    r = scene.render
    r.engine = 'CYCLES'; r.resolution_x, r.resolution_y = FW, FH; r.resolution_percentage = 100; r.film_transparent = True
    r.image_settings.file_format = 'PNG'; r.image_settings.color_mode = 'RGBA'
    scene.cycles.samples = SAMPLES; scene.cycles.use_denoising = True
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'OPTIX'; prefs.get_devices()
        for d in prefs.devices: d.use = d.type == 'OPTIX'
        scene.cycles.device = 'GPU'
    except Exception as e:
        print('GPU off:', e)
    try: scene.view_settings.view_transform = 'AgX'; scene.view_settings.look = 'AgX - Punchy'
    except Exception: pass
    return scene

def holdout_plane(z):
    """renang: semua yang di bawah permukaan air dibuat transparan"""
    m = bpy.data.materials.new('holdout'); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); h = nt.nodes.new('ShaderNodeHoldout'); nt.links.new(h.outputs[0], out.inputs['Surface'])
    pl = TL.rbox('water', (0, 0, z), (3, 3, 0.002), m, 0.0)
    return pl

def write_png(path, arr):
    h, w = arr.shape[:2]
    raw = b''.join(b'\x00' + arr[y].tobytes() for y in range(h))
    chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

def load_png(path):
    im = bpy.data.images.load(path)
    a = np.array(im.pixels[:], dtype=np.float32).reshape(im.size[1], im.size[0], 4)[::-1]
    bpy.data.images.remove(im)
    return (np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)

for cid in IDS:
    poses = poses_for(cid)
    frames, index = [], {}
    for pose in poses:
        scene = setup_scene()
        root = TL.build(cid, (0, 0, 0), 0.0, pose_name=pose)
        sc = TL.CHARS[cid].get('scale', 1.0) * TL.BODY_SCALE
        root.scale = (sc, sc, sc)
        drop = TL.POSES[pose].get('drop', 0)
        z0 = -drop * sc
        if pose.startswith('swim'):   # badan di dalam air: bahu pas di permukaan
            z0 = -1.0; holdout_plane(0.05)
        root.location = (0, 0, z0)
        index[pose] = {}
        for d in ('S', 'N', 'E', 'W'):
            root.rotation_euler = (0, 0, (YAW_LIE if pose == 'lie' else YAW)[d])
            path = os.path.join(TMP, f'{cid}_{pose}_{d}.png')
            scene.render.filepath = path
            bpy.ops.render.render(write_still=True)
            index[pose][d] = len(frames)
            frames.append(path)
        print('POSE', cid, pose, flush=True)
    cols = 16; rows = (len(frames) + cols - 1) // cols
    atlas = np.zeros((rows * FH, cols * FW, 4), np.uint8)
    for i, pth in enumerate(frames):
        r_, c_ = divmod(i, cols)
        atlas[r_ * FH:(r_ + 1) * FH, c_ * FW:(c_ + 1) * FW] = load_png(pth)
    png = os.path.join(OUT, f'{cid}.png'); write_png(png, atlas)
    # webp lebih kecil untuk web
    im = bpy.data.images.load(png); im.colorspace_settings.name = 'sRGB'
    sc_ = bpy.context.scene; sc_.view_settings.view_transform = 'Standard'; sc_.view_settings.look = 'None'
    sc_.render.image_settings.file_format = 'WEBP'; sc_.render.image_settings.quality = 92; sc_.render.image_settings.color_mode = 'RGBA'
    im.save_render(os.path.join(OUT, f'{cid}.webp'), scene=sc_)
    bpy.data.images.remove(im)
    json.dump({'frame': [FW, FH], 'anchor': [AX, AY], 'cols': cols, 'scale': DS, 'poses': index}, open(os.path.join(OUT, f'{cid}.json'), 'w'))
    print('ATLAS OK', cid, len(frames), 'frames', flush=True)
