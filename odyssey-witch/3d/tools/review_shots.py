# 用法:
#   blender --background --python review_shots.py -- <scene.glb> <outdir> [--size 1024]
#   blender --background scene.blend --python review_shots.py -- <outdir> [--size 1024]
# 作用:
#   对场景渲染 顶视/正视/侧视 + 3/4 透视 共四张图(Workbench,快,失败时回退 Cycles CPU),
#   输出 top.png / front.png / side.png / persp.png,
#   供独立审查 agent 与多视角参考图做盲评对比(生成者/审查者分离)。

import bpy
import os
import sys
import math
from mathutils import Vector


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    src, outdir, size = None, "shots", 1024
    paths = []
    i = 0
    while i < len(argv):
        if argv[i] == "--size":
            size = int(argv[i + 1]); i += 2
        elif argv[i] == "--outdir":
            outdir = argv[i + 1]; i += 2
        else:
            paths.append(argv[i]); i += 1
    if paths:
        src = paths[0]
    if len(paths) > 1:
        outdir = paths[1]
    return src, outdir, size


def scene_bounds():
    mn, mx = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for o in bpy.context.scene.objects:
        if o.type != "MESH":
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            mn = Vector(map(min, mn, w))
            mx = Vector(map(max, mx, w))
    return mn, mx


def add_ortho_camera(name, location, rotation, ortho_scale):
    data = bpy.data.cameras.new(name)
    data.type = "ORTHO"
    data.ortho_scale = ortho_scale
    cam = bpy.data.objects.new(name, data)
    cam.location = location
    cam.rotation_euler = rotation
    bpy.context.scene.collection.objects.link(cam)
    return cam


def render_still(sc):
    try:
        bpy.ops.render.render(write_still=True)
    except RuntimeError:
        # Workbench 不可用时回退 Cycles CPU 低采样
        sc.render.engine = "CYCLES"
        sc.cycles.samples = 16
        bpy.ops.render.render(write_still=True)


def main():
    src, outdir, size = parse_args()

    if src and src.lower().endswith((".glb", ".gltf")):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=src)
    elif src and src.lower().endswith(".blend"):
        bpy.ops.wm.open_mainfile(filepath=src)
    # 其余情况:假定场景已随 `blender -b file.blend -P review_shots.py` 打开

    os.makedirs(outdir, exist_ok=True)

    mn, mx = scene_bounds()
    center = (mn + mx) / 2
    span = max((mx - mn).x, (mx - mn).y, (mx - mn).z)
    ortho = span * 1.15

    # 灰色世界底 + Workbench studio 光,不依赖场景灯光,保证截图稳定可比
    world = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = False
    world.color = (0.85, 0.85, 0.85)

    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.light = "STUDIO"
    sc.display.shading.color_type = "TEXTURE"
    sc.display.shading.background_type = "WORLD"
    sc.display.shading.show_cavity = True
    sc.render.resolution_x = size
    sc.render.resolution_y = size
    sc.render.image_settings.file_format = "PNG"
    sc.render.film_transparent = False

    dist = span * 2
    views = {
        "top":   ((center.x, center.y, mx.z + dist), (0, 0, 0)),
        "front": ((center.x, mn.y - dist, center.z), (math.radians(90), 0, 0)),
        "side":  ((mx.x + dist, center.y, center.z), (math.radians(90), 0, math.radians(90))),
    }
    for name, (loc, rot) in views.items():
        sc.camera = add_ortho_camera(name, loc, rot, ortho)
        sc.render.filepath = os.path.join(outdir, f"{name}.png")
        render_still(sc)
        print(f"[OK] {sc.render.filepath}")

    # 3/4 透视一张:看整体氛围与构图
    d = span * 1.6
    loc = Vector((center.x + d * 0.7, center.y - d * 0.7, center.z + d * 0.5))
    data = bpy.data.cameras.new("persp")
    data.lens = 50
    cam = bpy.data.objects.new("persp", data)
    cam.location = loc
    cam.rotation_euler = (center - loc).to_track_quat("-Z", "Y").to_euler()
    sc.collection.objects.link(cam)
    sc.camera = cam
    sc.render.filepath = os.path.join(outdir, "persp.png")
    render_still(sc)
    print(f"[OK] {sc.render.filepath}")

    print("========== review_shots 完成 ==========")
    print(f"输出目录: {os.path.abspath(outdir)}")
    print("把 top/front/side/persp 四张图 + 多视角参考图一起发给审查 agent 盲评。")


main()
