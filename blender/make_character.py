# Bikin karakter Zataa dengan MPFB (aset CC0), tambah hijab/mukena/peci buatan sendiri,
# export ke GLB (Draco) dan render preview.
#   blender --background --python blender/make_character.py -- <out_dir> [id ...]
import bpy, bmesh, sys, os, json, math, mathutils
import numpy as np

from bl_ext.user_default.mpfb.services import HumanService, LocationService

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import anims  # noqa: E402

ARGV = sys.argv[sys.argv.index("--") + 1:]
OUT_DIR = ARGV[0]
HERE = os.path.dirname(os.path.abspath(__file__))
ALL = json.load(open(os.path.join(HERE, "characters.json"), encoding="utf8"))
IDS = ARGV[1:] or list(ALL.keys())
DATA = LocationService.get_user_data()
PREVIEW = os.environ.get("ZATAA_PREVIEW", "1") == "1"


def asset(kind, name, ext=".mhclo"):
    return os.path.join(DATA, kind, name, name + ext)


def hex_rgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)], dtype=np.float32)


# ---------------------------------------------------------------- build
def build(aid, cfg):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    macro = {
        "gender": cfg["gender"], "age": cfg.get("age", 0.42), "muscle": cfg.get("muscle", 0.5),
        "weight": cfg.get("weight", 0.5), "proportions": 0.65, "height": cfg.get("height", 0.5),
        "cupsize": 0.45, "firmness": 0.5,
        "race": {"asian": 0.8, "caucasian": 0.12, "african": 0.08},
    }
    base = HumanService.create_human(macro_detail_dict=macro)
    base.name = aid + ".body"
    HumanService.add_builtin_rig(base, "game_engine")
    proxy = "female_generic" if cfg["gender"] < 0.5 else "male_generic"
    HumanService.add_mhclo_asset(asset("proxymeshes", proxy, ".proxy"), base, asset_type="Proxymeshes", subdiv_levels=0)
    HumanService.add_mhclo_asset(asset("eyes", "low-poly"), base, asset_type="Eyes", subdiv_levels=0, material_type="GAMEENGINE")
    for kind in ("eyebrows", "eyelashes"):
        if cfg.get(kind):
            HumanService.add_mhclo_asset(asset(kind, cfg[kind]), base, asset_type=kind.capitalize(), subdiv_levels=0, material_type="GAMEENGINE")
    if cfg.get("hair"):
        HumanService.add_mhclo_asset(asset("hair", cfg["hair"]), base, asset_type="Hair", subdiv_levels=0, material_type="GAMEENGINE")
    for c in cfg.get("clothes", []):
        HumanService.add_mhclo_asset(asset("clothes", c), base, asset_type="Clothes", subdiv_levels=0, material_type="GAMEENGINE")
    HumanService.set_character_skin(asset("skins", cfg["skin"], ".mhmat"), base, skin_type="GAMEENGINE", material_instances=False)
    return base


# ---------------------------------------------------------------- tekstur
def base_color_images(obj):
    imgs = []
    for slot in obj.material_slots:
        m = slot.material
        if not m or not m.use_nodes:
            continue
        for link in m.node_tree.links:
            if link.to_socket.name == "Base Color":
                stack = [link.from_node]
                while stack:
                    n = stack.pop()
                    if n.type == 'TEX_IMAGE' and n.image:
                        imgs.append(n.image)
                    for inp in n.inputs:
                        for l in inp.links:
                            stack.append(l.from_node)
    return list({i.name: i for i in imgs}.values())


def edit_pixels(img, fn):
    px = np.empty(len(img.pixels), dtype=np.float32)
    img.pixels.foreach_get(px)
    a = px.reshape(-1, 4)
    fn(a)
    np.clip(a, 0, 1, out=a)
    img.pixels.foreach_set(a.ravel())
    img.update()
    img.pack()


def multiply(img, rgb):
    k = np.asarray(rgb, dtype=np.float32)

    def fn(a):
        a[:, :3] *= k
    edit_pixels(img, fn)


def recolor(img, hexcol):
    """Ganti warna kain tapi pertahankan lipatan/tekstur (luminance)."""
    col = hex_rgb(hexcol)

    def fn(a):
        lum = a[:, :3] @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
        mean = float(np.average(lum, weights=a[:, 3] + 1e-4))
        shade = np.clip(1.0 + (lum - mean) * 1.6, 0.35, 1.5)
        a[:, :3] = col[None, :] * shade[:, None]
    edit_pixels(img, fn)


def solid_material(name, hexcol, rough=0.85):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    c = hex_rgb(hexcol) ** 2.2  # Principled pakai warna linear
    bsdf.inputs["Base Color"].default_value = (float(c[0]), float(c[1]), float(c[2]), 1)
    bsdf.inputs["Roughness"].default_value = rough
    return m


# ---------------------------------------------------------------- hijab / mukena / peci
def vg_weight_fn(obj):
    names = {g.index: g.name for g in obj.vertex_groups}

    def w(v, *groups):
        return sum(g.weight for g in v.groups if names.get(g.group) in groups)
    return w


def cover_mesh(aid, rig, body, kind, color):
    """Salin kepala/bahu (hijab) atau badan atas (mukena) dari tubuh, buka bagian wajah,
    lalu kembangkan & haluskan supaya seperti kain. Bobot rig ikut tersalin."""
    me = body.data
    w = vg_weight_fn(body)
    neck = rig.data.bones["neck_01"].head_local
    # patokan wajah: titik tengah kedua mata
    eyes = next(o for o in bpy.data.objects if o.name.endswith("_low-poly"))
    E = sum((v.co for v in eyes.data.vertices), mathutils.Vector()) / len(eyes.data.vertices)
    keep = set()
    for v in me.vertices:
        co = v.co
        wh = w(v, "head", "neck_01")
        upper = w(v, "spine_03", "spine_02", "clavicle_l", "clavicle_r", "upperarm_l", "upperarm_r")
        if kind == "hijab":
            ok = wh > 0.25 or (upper > 0.3 and co.z > neck.z - 0.2 and abs(co.x) < 0.22)
        else:
            arms = w(v, "lowerarm_l", "lowerarm_r")
            ok = wh > 0.2 or upper > 0.25 or arms > 0.3 or w(v, "spine_01") > 0.4
        face = co.y < E.y + 0.03 and (E.z - 0.115) < co.z < (E.z + 0.05) and abs(co.x) < 0.07
        if ok and not face:
            keep.add(v.index)

    bm = bmesh.new()
    bm.from_mesh(me)
    drop = [f for f in bm.faces if not all(v.index in keep for v in f.verts)]
    bmesh.ops.delete(bm, geom=drop, context='FACES_ONLY')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.normal_update()
    # kain makin tebal di bawah leher supaya tidak tertembus baju
    low_extra = 0.012 if kind == "hijab" else 0.03
    for _ in range(3):
        bmesh.ops.smooth_vert(bm, verts=[v for v in bm.verts if not v.is_boundary], factor=0.6, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.normal_update()
    for v in bm.verts:
        below = min(1.0, max(0.0, (neck.z + 0.02 - v.co.z) / 0.12))
        v.co += v.normal * (0.012 + low_extra * below)
    # bagian dada dihaluskan lebih kuat supaya kain jatuh lurus, bukan mengikuti lekuk badan
    low = [v for v in bm.verts if v.co.z < neck.z - 0.05]
    for _ in range(8):
        bmesh.ops.smooth_vert(bm, verts=low, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    for _ in range(2):
        bmesh.ops.smooth_vert(bm, verts=list(bm.verts), factor=0.4, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    new = bpy.data.meshes.new(f"{aid}_{kind}")
    bm.to_mesh(new)
    bm.free()
    for p in new.polygons:
        p.use_smooth = True
    obj = bpy.data.objects.new(f"{aid}_{kind}", new)
    bpy.context.scene.collection.objects.link(obj)
    for g in body.vertex_groups:
        obj.vertex_groups.new(name=g.name)
    obj.parent = rig
    obj.modifiers.new("Armature", 'ARMATURE').object = rig
    sol = obj.modifiers.new("Solidify", 'SOLIDIFY')
    sol.thickness = 0.006
    obj.data.materials.append(solid_material(f"{aid}_{kind}_mat", color, 0.92))
    with bpy.context.temp_override(object=obj, active_object=obj):
        bpy.ops.object.modifier_apply(modifier="Solidify")
    return obj


def peci(aid, rig, body):
    w = vg_weight_fn(body)
    head_vs = [v.co.copy() for v in body.data.vertices if w(v, "head") > 0.6]
    top = max(c.z for c in head_vs)
    band = [c for c in head_vs if top - 0.06 < c.z < top - 0.035]
    cx = sum(c.x for c in band) / len(band)
    cy = sum(c.y for c in band) / len(band)
    r = max(abs(c.x - cx) for c in band) + 0.014
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=r, depth=0.075, location=(cx, cy, top - 0.03))
    obj = bpy.context.active_object
    obj.name = f"{aid}_peci"
    obj.scale.y = 1.12
    bpy.ops.object.transform_apply(scale=True)
    g = obj.vertex_groups.new(name="head")
    g.add(list(range(len(obj.data.vertices))), 1.0, 'REPLACE')
    obj.parent = rig
    obj.modifiers.new("Armature", 'ARMATURE').object = rig
    obj.data.materials.append(solid_material(f"{aid}_peci_mat", "#141414", 0.6))
    return obj


def skirt(aid, rig, body, length, color, name="skirt", flare=0.05, pad=0.0):
    """Rok tabung dari pinggang. length: 0 = pinggul, 1 = lutut, 2 = mata kaki.
    Bobot: atas ikut pinggul, makin ke bawah ikut paha kiri/kanan (supaya rok ikut saat jalan & duduk)."""
    B = rig.data.bones
    hip_z = B["thigh_l"].head_local.z
    knee_z = B["calf_l"].head_local.z
    waist_z = hip_z + 0.15
    hem_z = hip_z - length * (hip_z - knee_z)
    w = vg_weight_fn(body)
    arm_groups = ("upperarm_l", "upperarm_r", "lowerarm_l", "lowerarm_r", "hand_l", "hand_r") + tuple(
        g.name for g in body.vertex_groups if g.name[:-2] in ("index_01", "index_02", "index_03", "middle_01", "middle_02", "middle_03",
                                                             "ring_01", "ring_02", "ring_03", "pinky_01", "pinky_02", "pinky_03",
                                                             "thumb_01", "thumb_02", "thumb_03"))
    # hanya badan & kaki — tangan yang menggantung di samping pinggul jangan ikut diukur
    verts = [v.co.copy() for v in body.data.vertices if w(v, *arm_groups) < 0.05]
    SEG, RINGS = 40, 12
    rings = []
    for r in range(RINGS + 1):
        t = r / RINGS
        z = waist_z + (hem_z - waist_z) * t
        band = [c for c in verts if abs(c.z - z) < 0.025]
        cx = sum(c.x for c in band) / len(band)
        cy = sum(c.y for c in band) / len(band)
        radius = [0.0] * SEG
        for c in band:
            a = math.atan2(c.y - cy, c.x - cx)
            i = int((a + math.pi) / (2 * math.pi) * SEG) % SEG
            radius[i] = max(radius[i], math.hypot(c.x - cx, c.y - cy))
        # isi sudut kosong & haluskan supaya garis rok mulus (tidak membentuk dua kaki)
        for _ in range(SEG):
            for i in range(SEG):
                if radius[i] == 0:
                    radius[i] = max(radius[i - 1], radius[(i + 1) % SEG])
        for _ in range(3):
            radius = [(radius[i - 1] + 2 * radius[i] + radius[(i + 1) % SEG]) / 4 for i in range(SEG)]
        top = max(radius)
        rings.append([(cx, cy, z, max(radius[i], top * 0.8) + 0.014 + pad + flare * t) for i in range(SEG)])
    bm = bmesh.new()
    vs = []
    for ring in rings:
        row = []
        for i, (cx, cy, z, rad) in enumerate(ring):
            a = -math.pi + (i + 0.5) / SEG * 2 * math.pi
            row.append(bm.verts.new((cx + math.cos(a) * rad, cy + math.sin(a) * rad, z)))
        vs.append(row)
    for r in range(RINGS):
        for i in range(SEG):
            bm.faces.new((vs[r][i], vs[r][(i + 1) % SEG], vs[r + 1][(i + 1) % SEG], vs[r + 1][i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(f"{aid}_{name}")
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    obj = bpy.data.objects.new(f"{aid}_{name}", me)
    bpy.context.scene.collection.objects.link(obj)
    gp, gl, gr = (obj.vertex_groups.new(name=n) for n in ("pelvis", "thigh_l", "thigh_r"))
    for v in me.vertices:
        t = (waist_z - v.co.z) / max(1e-4, waist_z - hem_z)
        wt = max(0.0, min(1.0, (t - 0.12) / 0.88)) ** 0.8 * 0.92
        side = max(-1.0, min(1.0, v.co.x / 0.07))
        gp.add([v.index], 1 - wt, 'REPLACE')
        gl.add([v.index], wt * (1 + side) / 2, 'REPLACE')
        gr.add([v.index], wt * (1 - side) / 2, 'REPLACE')
    obj.parent = rig
    obj.modifiers.new("Armature", 'ARMATURE').object = rig
    sol = obj.modifiers.new("Solidify", 'SOLIDIFY')
    sol.thickness = 0.005
    with bpy.context.temp_override(object=obj, active_object=obj):
        bpy.ops.object.modifier_apply(modifier="Solidify")
    obj.data.materials.append(solid_material(f"{aid}_{name}_mat", color, 0.8))
    return obj


# ---------------------------------------------------------------- finalisasi
def finalize(aid, cfg):
    rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    rig.name = aid
    for o in list(bpy.data.objects):
        if o.type == 'MESH' and o.name.endswith(".body"):
            bpy.data.objects.remove(o, do_unlink=True)
    body = None
    originals = [o for o in bpy.data.objects if o.type == 'MESH']
    for o in originals:
        src = o.name.split(".", 1)[-1]
        o["asset"] = src
        if "generic" in src:
            body = o
            o.name = f"{aid}_body"
        elif cfg.get("hair") == src:
            o.name = f"{aid}_hair"
        else:
            o.name = f"{aid}_{src}"

    if os.environ.get("ZATAA_DEBUG") == "mat":
        for o in [o for o in bpy.data.objects if o.type == 'MESH'][:2]:
            for sl in o.material_slots:
                m = sl.material
                print("MAT", o.name, m and m.name)
                if m and m.use_nodes:
                    for n in m.node_tree.nodes:
                        print("   N", n.type, n.name, getattr(n, "image", None) and n.image.name, getattr(n, "node_tree", None) and n.node_tree.name)
                    for l in m.node_tree.links:
                        print("   L", l.from_node.name, l.from_socket.name, "->", l.to_node.name, l.to_socket.name)
        raise SystemExit
    for img in base_color_images(body):
        multiply(img, cfg.get("skinTint", [1, 1, 1]))
    for o in [o for o in bpy.data.objects if o.type == 'MESH']:
        if o.name == f"{aid}_hair" and cfg.get("hairTint"):
            for img in base_color_images(o):
                multiply(img, cfg["hairTint"])
        tint = cfg.get("tint", {}).get(o.get("asset", ""))
        if tint:
            for img in base_color_images(o):
                recolor(img, tint)

    # hijab/mukena disalin dari tubuh utuh, SEBELUM kulit di balik baju dihapus
    if cfg.get("hijab"):
        cover_mesh(aid, rig, body, "hijab", cfg["hijab"])
    if cfg.get("mukena"):
        cover_mesh(aid, rig, body, "mukena", "#f6f3ec")
        skirt(aid, rig, body, 2.0, "#f6f3ec", name="mukena_skirt", flare=0.12, pad=0.035)
    if cfg.get("skirt"):
        skirt(aid, rig, body, cfg["skirt"]["length"], cfg["skirt"]["color"])
    if cfg.get("peci"):
        peci(aid, rig, body)
    for o in originals:
        for m in list(o.modifiers):
            if m.type == 'MASK':
                with bpy.context.temp_override(object=o, active_object=o):
                    bpy.ops.object.modifier_apply(modifier=m.name)

    # tekstur: kulit 1024px, lainnya 512px (cukup untuk tampilan kantor)
    skin_imgs = {i.name for i in base_color_images(body)}
    for img in bpy.data.images:
        limit = 1024 if img.name in skin_imgs else 512
        if img.size[0] > limit:
            img.scale(limit, int(limit * img.size[1] / img.size[0]))
    return rig


def props(aid, rig):
    """HP, gelas, dan stik game di tangan kanan (ditampil/sembunyikan dari website)."""
    hand = rig.pose.bones["hand_r"]
    bpy.context.view_layer.update()
    M = rig.matrix_world @ hand.matrix
    along = (M.to_3x3() @ mathutils.Vector((0, 1, 0))).normalized()
    pos = M.translation + along * 0.09
    out = []
    for name, size, color in (("phone", (0.075, 0.012, 0.15), "#111114"), ("cup", None, "#f4f1ea"), ("pad", (0.16, 0.05, 0.09), "#26262e")):
        if size:
            bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
            o = bpy.context.active_object
            o.scale = size
        else:
            bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.038, depth=0.1, location=pos)
            o = bpy.context.active_object
        bpy.ops.object.transform_apply(scale=True)
        o.name = f"{aid}_prop_{name}"
        g = o.vertex_groups.new(name="hand_r")
        g.add(list(range(len(o.data.vertices))), 1.0, 'REPLACE')
        o.parent = rig
        o.modifiers.new("Armature", 'ARMATURE').object = rig
        o.data.materials.append(solid_material(o.name + "_mat", color, 0.4))
        out.append(o)
    return out


def export(path):
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', export_image_format='WEBP', export_image_quality=82, export_animations=True,
        export_animation_mode='NLA_TRACKS', export_force_sampling=True, export_optimize_animation_size=True,
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
        export_yup=True, export_apply=False,
    )


def render_preview(path, praying):
    sc = bpy.context.scene
    rig = next((o for o in bpy.data.objects if o.type == 'ARMATURE'), None)
    if rig and rig.animation_data:
        rig.animation_data.use_nla = False  # preview dalam pose berdiri, bukan hasil campuran klip
        anims.reset(rig)
        bpy.context.view_layer.update()
    has_mukena = any(o.name.endswith("_mukena") for o in bpy.data.objects)
    for o in bpy.data.objects:
        if "_mukena" in o.name or o.name.endswith("_peci"):
            o.hide_render = not praying
        if o.name.endswith("_hair"):
            o.hide_render = praying and has_mukena
    if not sc.camera:
        sc.render.engine = 'BLENDER_EEVEE'
        sc.view_settings.view_transform = 'Standard'
        sc.render.resolution_x, sc.render.resolution_y = 600, 900
        world = bpy.data.worlds.new("w")
        sc.world = world
        world.use_nodes = True
        bg = world.node_tree.nodes["Background"]
        bg.inputs[0].default_value = (0.08, 0.06, 0.14, 1)
        bg.inputs[1].default_value = 0.6
        for name, loc, energy, size in [("key", (2.2, -3.0, 3.2), 420, 2.5), ("fill", (-3, -2, 2), 140, 3), ("rim", (0, 3, 3), 300, 2)]:
            ld = bpy.data.lights.new(name, 'AREA')
            ld.energy, ld.size = energy, size
            lo = bpy.data.objects.new(name, ld)
            lo.location = loc
            sc.collection.objects.link(lo)
            lo.rotation_euler = (-lo.location).to_track_quat('-Z', 'Y').to_euler()
        cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
        sc.collection.objects.link(cam)
        cam.location = (0.9, -2.6, 1.45)
        cam.data.lens = 50
        cam.rotation_euler = (mathutils.Vector((0, 0, 1.2)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
        sc.camera = cam
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


os.makedirs(OUT_DIR, exist_ok=True)
ONLY = os.environ.get("ZATAA_OUTFIT")  # opsional: build satu set baju saja
for aid in IDS:
    base = ALL[aid]
    # dua set baju: "kerja" (Selasa–Sabtu) → <id>.glb, "formal" (Senin) → <id>_formal.glb
    for outfit, suffix in (("kerja", ""), ("formal", "_formal")):
        if ONLY and ONLY != outfit:
            continue
        cfg = {k: v for k, v in base.items() if k != "outfits"}
        cfg.update(base["outfits"][outfit])
        build(aid, cfg)
        rig = finalize(aid, cfg)
        props(aid, rig)
        anims.build_all(rig)
        export(os.path.join(OUT_DIR, aid + suffix + ".glb"))
        if PREVIEW:
            render_preview(os.path.join(OUT_DIR, f"preview_{aid}{suffix}.png"), False)
            if outfit == "kerja" and (cfg.get("mukena") or cfg.get("peci")):
                render_preview(os.path.join(OUT_DIR, f"preview_{aid}_sholat.png"), True)
        print("DONE", aid, outfit)
