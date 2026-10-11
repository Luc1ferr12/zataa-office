# Pustaka animasi untuk rig "game_engine" MPFB.
# Pose ditulis sebagai ARAH tulang di ruang armature (Blender: X = kiri karakter, -Y = depan, Z = atas),
# lalu tiap tulang diputar minimal supaya menghadap arah itu. Pinggul dipindah supaya lutut/pantat
# pas di lantai/kursi — dihitung dari ukuran tubuh masing-masing karakter.
import bpy, math
from mathutils import Vector, Matrix

FPS = 24
SEAT_H = 0.47
ORDER = ["pelvis", "spine_01", "spine_02", "spine_03", "neck_01", "head",
         "clavicle_l", "upperarm_l", "lowerarm_l", "hand_l", "clavicle_r", "upperarm_r", "lowerarm_r", "hand_r",
         "thigh_l", "calf_l", "foot_l", "thigh_r", "calf_r", "foot_r"]


def V(x, y, z):
    return Vector((x, y, z)).normalized()


def sym(d):
    """Arah untuk sisi kanan = cermin sisi kiri (X dibalik)."""
    return Vector((-d.x, d.y, d.z))


def upright(lean=0.0, side=0.0):
    s = V(side, -lean, 1)
    return {"spine_01": s, "spine_02": s, "spine_03": s, "neck_01": V(side, -lean * 0.5, 1), "head": V(side, -lean * 0.3, 1)}


def arms_down():
    return {"upperarm_l": V(0.13, 0.02, -1), "lowerarm_l": V(0.06, -0.12, -1), "hand_l": V(0.05, -0.1, -1),
            "upperarm_r": V(-0.13, 0.02, -1), "lowerarm_r": V(-0.06, -0.12, -1), "hand_r": V(-0.05, -0.1, -1)}


def legs_stand():
    return {"thigh_l": V(0.05, 0, -1), "calf_l": V(0.03, 0.02, -1), "thigh_r": V(-0.05, 0, -1), "calf_r": V(-0.03, 0.02, -1)}


def legs_sit(spread=0.12):
    return {"thigh_l": V(spread, -1, 0.02), "calf_l": V(0.02, -0.12, -1), "thigh_r": V(-spread, -1, 0.02), "calf_r": V(-0.02, -0.12, -1)}


def both(name, d_left, pose):
    pose[name + "_l"] = d_left
    pose[name + "_r"] = sym(d_left)


# ---------------------------------------------------------------- pose dasar
def stand(**k):
    p = {}
    p.update(upright(k.get("lean", 0.0), k.get("side", 0.0)))
    p.update(arms_down())
    p.update(legs_stand())
    p["_contact"] = "feet"
    return p


def sit(lean=0.08, back=False):
    p = {}
    p.update(upright(-0.25 if back else lean))
    p.update(arms_down())
    p.update(legs_sit())
    p["_contact"] = "seat"
    return p


def hands_front(p, height=0.0, inward=0.35, reach=1.0):
    """Lengan bawah ke depan (ngetik/pegang HP)."""
    both("upperarm", V(0.18, -0.55 * reach, -0.85), p)
    both("lowerarm", V(-inward, -1, height), p)
    both("hand", V(-inward * 0.6, -1, height - 0.15), p)
    return p


# ---------------------------------------------------------------- aplikasi pose ke rig
def reset(rig):
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
        pb.scale = (1, 1, 1)


def aim(rig, name, d):
    pb = rig.pose.bones.get(name)
    if pb is None:
        return
    bpy.context.view_layer.update()
    M = pb.matrix.copy()
    head = M.translation.copy()
    cur = (M.to_3x3() @ Vector((0, 1, 0))).normalized()
    R = cur.rotation_difference(d).to_matrix().to_4x4()
    pb.matrix = Matrix.Translation(head) @ R @ Matrix.Translation(-head) @ M


def place_pelvis(rig, contact):
    """Geser pinggul sampai titik kontak (kaki/pantat/lutut) menyentuh permukaan."""
    bpy.context.view_layer.update()
    pb = rig.pose.bones["pelvis"]
    pose = lambda n: rig.pose.bones[n]
    if contact == "feet":
        # kaki terendah menyentuh lantai seperti posisi diam
        low = min(pose("foot_l").head.z, pose("foot_r").head.z)
        rest = min(rig.data.bones["foot_l"].head_local.z, rig.data.bones["foot_r"].head_local.z)
        dz = rest - low
    elif contact == "seat":
        dz = (SEAT_H + 0.09) - pose("thigh_l").head.z
    elif contact == "lounger":
        dz = 0.5 - pose("thigh_l").head.z
    elif contact == "beanbag":
        dz = 0.32 - pose("thigh_l").head.z
    elif contact == "knees":
        dz = 0.07 - pose("calf_l").head.z
    elif contact == "water":
        dz = 0.0 - pose("thigh_l").head.z
    else:
        dz = 0.0
    M = pb.matrix.copy()
    M.translation.z += dz
    pb.matrix = M


def apply_pose(rig, pose):
    reset(rig)
    for name in ORDER:
        if name in pose:
            aim(rig, name, pose[name])
    place_pelvis(rig, pose.get("_contact", "feet"))
    bpy.context.view_layer.update()


def key_all(rig, frame):
    for pb in rig.pose.bones:
        pb.keyframe_insert("rotation_quaternion", frame=frame)
    rig.pose.bones["pelvis"].keyframe_insert("location", frame=frame)


def make_action(rig, name, frames):
    """frames: list of (detik, pose). Pose terakhir = pose pertama supaya loop mulus."""
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    rig.animation_data_create()
    rig.animation_data.action = action
    for t, pose in frames:
        apply_pose(rig, pose)
        key_all(rig, 1 + round(t * FPS))
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 1, action)
    rig.animation_data.action = None
    return action


# ---------------------------------------------------------------- definisi klip
def walk_pose(ph):
    a = math.radians(26) * math.sin(ph)
    p = stand()
    for side, s in (("l", 1), ("r", -1)):
        ang = a * s
        # lutut menekuk saat kaki sedang diayun ke depan
        knee = math.radians(50) * max(0.0, -math.sin(ph + (0 if s > 0 else math.pi) + 0.9))
        x = 0.05 if s > 0 else -0.05
        p["thigh_" + side] = V(x, -math.sin(ang), -math.cos(ang))
        p["calf_" + side] = V(x * 0.6, -math.sin(ang - knee), -math.cos(ang - knee))
        arm = -ang * 0.8
        p["upperarm_" + side] = V(0.12 * s, -math.sin(arm), -math.cos(arm))
        p["lowerarm_" + side] = V(0.05 * s, -math.sin(arm) - 0.25, -1)
        p["hand_" + side] = p["lowerarm_" + side]
    p.update(upright(0.06, 0.02 * math.sin(ph)))
    return p


def clips():
    C = {}
    C["idle"] = [(0, stand()), (2, stand(side=0.03)), (4, stand())]
    C["walk"] = [(i / 8, walk_pose(i / 8 * 2 * math.pi)) for i in range(9)]

    t0 = hands_front(sit(0.12), 0.12)
    t1 = hands_front(sit(0.12), 0.16, 0.32)
    t1["head"] = V(0.05, -0.15, 1)
    C["type"] = [(0, t0), (0.5, t1), (1.0, t0), (1.6, t1), (2.0, t0)]

    def talk(g):
        p = sit(0.05)
        both("upperarm", V(0.2, -0.35, -0.9), p)
        both("lowerarm", V(-0.15, -1, 0.15), p)
        p["upperarm_r"] = V(-0.35, -0.6, -0.4 + g)
        p["lowerarm_r"] = V(-0.1, -0.8, 0.6 + g)
        p["head"] = V(0.15 * g, -0.1, 1)
        return p
    C["talk"] = [(0, talk(0)), (1.0, talk(0.4)), (2.0, talk(-0.1)), (3.0, talk(0))]

    def eat(up):
        p = hands_front(sit(0.15), -0.1)
        if up:
            p["upperarm_r"] = V(-0.2, -0.7, -0.5)
            p["lowerarm_r"] = V(0.45, -0.3, 0.85)
            p["hand_r"] = V(0.4, -0.4, 0.8)
            p["head"] = V(0, -0.25, 1)
        return p
    C["eat"] = [(0, eat(False)), (1.0, eat(True)), (1.8, eat(True)), (3.0, eat(False))]

    def phone(head=0.5, back=False):
        p = sit(0.0, back)
        both("upperarm", V(0.12, -0.3, -1), p)
        both("lowerarm", V(-0.45, -0.85, 0.45), p)
        both("hand", V(-0.3, -0.8, 0.6), p)
        p["head"] = V(0, -head, 1)
        p["neck_01"] = V(0, -head * 0.6, 1)
        return p
    C["phone"] = [(0, phone(0.5)), (2, phone(0.42)), (4, phone(0.5))]
    g0, g1 = phone(0.25), phone(0.25)
    g1["spine_03"] = V(0.04, -0.12, 1)
    C["game"] = [(0, g0), (0.6, g1), (1.2, g0)]

    def bench(look):
        p = sit(-0.12)
        both("upperarm", V(0.15, -0.25, -1), p)
        both("lowerarm", V(-0.1, -1, -0.15), p)
        p["head"] = V(look, 0, 1)
        return p
    C["bench"] = [(0, bench(0)), (3, bench(0.35)), (6, bench(-0.3)), (8, bench(0))]

    def stretch(up):
        p = sit(-0.2 if up else 0.08)
        if up:
            both("upperarm", V(0.25, 0.05, 1), p)
            both("lowerarm", V(-0.3, 0.05, 1), p)
            p["head"] = V(0, 0.3, 1)
        else:
            hands_front(p, -0.05)
        return p
    C["stretch"] = [(0, stretch(False)), (0.8, stretch(True)), (2.2, stretch(True)), (3.0, stretch(False))]

    def facepalm(on):
        p = sit(0.35 if on else 0.1)
        if on:
            both("upperarm", V(0.25, -0.75, -0.5), p)
            both("lowerarm", V(-0.35, -0.25, 1), p)
            both("hand", V(-0.2, -0.2, 1), p)
            p["head"] = V(0, -0.55, 1)
        else:
            hands_front(p, -0.05)
        return p
    C["facepalm"] = [(0, facepalm(False)), (0.6, facepalm(True)), (2.4, facepalm(True)), (3.0, facepalm(False))]

    def angry(up):
        p = hands_front(sit(0.2), -0.05)
        p["upperarm_r"] = V(-0.3, -0.6, -0.3 if up else -0.8)
        p["lowerarm_r"] = V(0.1, -0.6, 0.8 if up else -0.3)
        p["head"] = V(0.15 if up else -0.15, -0.1, 1)
        return p
    C["angry"] = [(0, angry(False)), (0.35, angry(True)), (0.6, angry(False)), (0.95, angry(True)), (1.2, angry(False)), (1.5, angry(False))]

    def sleepy(n):
        p = hands_front(sit(0.3), -0.15, 0.4)
        p["head"] = V(0, -0.4 - n, 1 - n)
        p["neck_01"] = V(0, -0.3 - n * 0.5, 1)
        return p
    C["sleepy"] = [(0, sleepy(0)), (1.5, sleepy(0.5)), (2.0, sleepy(0.1)), (3.0, sleepy(0))]

    def beanbag(h):
        p = phone(h)
        p.update(upright(-0.7))
        p["head"] = V(0, -0.2 - h, 1)
        p["thigh_l"], p["thigh_r"] = V(0.18, -1, 0.35), V(-0.18, -1, 0.35)
        p["calf_l"], p["calf_r"] = V(0.05, -0.4, -1), V(-0.05, -0.4, -1)
        p["_contact"] = "beanbag"
        return p
    C["beanbag"] = [(0, beanbag(0.5)), (3, beanbag(0.4)), (6, beanbag(0.5))]

    def lie(breath):
        p = {}
        s = V(0, 0.75, 0.66 + breath)
        p.update({"spine_01": s, "spine_02": s, "spine_03": s, "neck_01": V(0, 0.5, 1), "head": V(0, 0.3, 1)})
        p["thigh_l"], p["thigh_r"] = V(0.08, -1, 0.02), V(-0.08, -1, 0.02)
        p["calf_l"], p["calf_r"] = V(0.05, -1, -0.02), V(-0.05, -1, -0.02)
        p["upperarm_l"], p["lowerarm_l"] = V(0.4, 0.5, 0.8), V(-0.6, 0.3, 0.3)       # tangan kiri di belakang kepala
        p["upperarm_r"], p["lowerarm_r"] = V(-0.35, -0.2, -0.9), V(0.2, -1, 0.05)    # tangan kanan di perut
        p["_contact"] = "lounger"
        return p
    C["lie"] = [(0, lie(0)), (2, lie(0.04)), (4, lie(0))]

    def swim(ph):
        p = {}
        s = V(0, -1, 0.05)
        p.update({"pelvis": V(0, -1, 0.05), "spine_01": s, "spine_02": s, "spine_03": s, "neck_01": V(0, -1, 0.25), "head": V(0.3 * math.sin(ph), -1, 0.35)})
        for side, sg, off in (("l", 1, 0), ("r", -1, math.pi)):
            a = ph + off
            p["upperarm_" + side] = V(0.18 * sg, -math.cos(a), math.sin(a) * 0.9 - 0.1)
            p["lowerarm_" + side] = V(0.1 * sg, -math.cos(a + 0.3), math.sin(a + 0.3) * 0.8 - 0.2)
            kick = 0.18 * math.sin(ph * 2 + off)
            p["thigh_" + side] = V(0.07 * sg, 1, kick)
            p["calf_" + side] = V(0.05 * sg, 1, kick * 1.4 - 0.05)
        p["_contact"] = "water"
        return p
    C["swim"] = [(i / 8 * 1.6, swim(i / 8 * 2 * math.pi)) for i in range(9)]

    def drink(up):
        p = stand()
        if up:
            p["upperarm_r"] = V(-0.15, -0.6, -0.6)
            p["lowerarm_r"] = V(0.45, -0.3, 0.85)
            p["hand_r"] = V(0.4, -0.4, 0.8)
            p["head"] = V(0, 0.15, 1)
        else:
            p["upperarm_r"] = V(-0.15, -0.3, -1)
            p["lowerarm_r"] = V(0.05, -1, 0.1)
        return p
    C["drink"] = [(0, drink(False)), (1.5, drink(True)), (2.5, drink(True)), (4, drink(False))]

    # --- sholat: satu rakaat 16 detik ---
    def qiyam():
        p = stand()
        both("upperarm", V(0.1, -0.25, -1), p)
        both("lowerarm", V(-0.85, -0.45, 0.25), p)
        both("hand", V(-0.9, -0.3, 0.2), p)
        p["head"] = V(0, -0.25, 1)
        return p

    def ruku():
        p = stand()
        p.update({"pelvis": V(0, -0.75, 0.65), "spine_01": V(0, -1, 0.05), "spine_02": V(0, -1, 0.02), "spine_03": V(0, -1, 0),
                  "neck_01": V(0, -1, 0), "head": V(0, -1, -0.05)})
        p["thigh_l"], p["thigh_r"] = V(0.06, 0.12, -1), V(-0.06, 0.12, -1)
        p["calf_l"], p["calf_r"] = V(0.03, 0.05, -1), V(-0.03, 0.05, -1)
        both("upperarm", V(0.08, 0.15, -1), p)
        both("lowerarm", V(0.02, 0.1, -1), p)
        return p

    def sujud():
        p = {}
        p.update({"pelvis": V(0, -0.8, 0.2), "spine_01": V(0, -1, -0.55), "spine_02": V(0, -1, -0.65), "spine_03": V(0, -1, -0.75),
                  "neck_01": V(0, -0.8, -1), "head": V(0, -0.6, -1)})
        p["thigh_l"], p["thigh_r"] = V(0.1, -0.35, -1), V(-0.1, -0.35, -1)
        p["calf_l"], p["calf_r"] = V(0.05, 1, -0.05), V(-0.05, 1, -0.05)
        both("upperarm", V(0.3, -0.55, -0.85), p)
        both("lowerarm", V(0.05, -0.35, -1), p)
        both("hand", V(0.05, -1, -0.2), p)
        p["_contact"] = "knees"
        return p

    def duduk():
        p = {}
        p.update(upright(0.05))
        p["thigh_l"], p["thigh_r"] = V(0.12, -0.9, -0.42), V(-0.12, -0.9, -0.42)
        p["calf_l"], p["calf_r"] = V(0.05, 1, -0.03), V(-0.05, 1, -0.03)
        both("upperarm", V(0.15, -0.45, -1), p)
        both("lowerarm", V(0.02, -1, -0.15), p)
        p["head"] = V(0, -0.3, 1)
        p["_contact"] = "knees"
        return p

    Q, R, S, D = qiyam(), ruku(), sujud(), duduk()
    C["pray"] = [(0, Q), (4.4, Q), (5.0, R), (7.4, R), (8.0, Q), (9.0, Q), (9.8, S), (11.6, S), (12.2, D), (13.2, D), (13.8, S), (15.4, S), (16.0, Q)]
    return C


def build_all(rig):
    bpy.context.scene.render.fps = FPS
    names = []
    for name, frames in clips().items():
        make_action(rig, name, frames)
        names.append(name)
    reset(rig)
    return names
