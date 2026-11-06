# 用法:
#   blender --background --python clean_asset.py -- <in.glb> <out.glb> [--target 8000] [--prefix hut]
# 作用:
#   导入 Tripo 导出的 glb -> 合并网格 -> 应用变换 -> 法线统一朝外
#   -> 原点移至底部中心(脚底落地面) -> 按面数预算减面 -> 导出 glb + 统计报告
# 说明:
#   减面用 DECIMATE 修改器,导出时自动应用(export_apply=True),不破坏源网格数据。

import bpy
import sys
from mathutils import Vector, Matrix


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if len(argv) < 2:
        print("用法: blender --background --python clean_asset.py -- <in.glb> <out.glb> [--target 8000] [--prefix asset]")
        sys.exit(1)
    src, dst = argv[0], argv[1]
    target, prefix = 8000, "asset"
    i = 2
    while i < len(argv):
        if argv[i] == "--target":
            target = int(argv[i + 1]); i += 2
        elif argv[i] == "--prefix":
            prefix = argv[i + 1]; i += 2
        else:
            print(f"未知参数: {argv[i]}"); i += 1
    return src, dst, target, prefix


def tris_of(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def main():
    src, dst, target, prefix = parse_args()

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)

    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not meshes:
        print("[ERROR] 未找到网格对象")
        sys.exit(2)

    tris_before = sum(tris_of(o) for o in meshes)

    # 1) 应用全部变换(缩放/旋转/位移烘焙进网格)
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # 2) 合并为单网格(多材质保留为多插槽)
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active

    # 3) 法线统一朝外
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")

    # 4) 原点移至包围盒底部中心(放进场景时 z=0 即脚底贴地)
    bb = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    cx = (min(v.x for v in bb) + max(v.x for v in bb)) / 2
    cy = (min(v.y for v in bb) + max(v.y for v in bb)) / 2
    mz = min(v.z for v in bb)
    obj.data.transform(Matrix.Translation(Vector((-cx, -cy, -mz))))

    # 5) 按预算减面
    tris_now = tris_of(obj)
    ratio = min(1.0, target / max(tris_now, 1))
    if ratio < 1.0:
        mod = obj.modifiers.new("decimate", "DECIMATE")
        mod.ratio = ratio
        print(f"[INFO] 减面 {tris_now} -> ~{int(tris_now * ratio)} (ratio={ratio:.3f})")

    # 6) 重命名,便于引擎内按前缀管理
    obj.name = prefix
    for m in obj.data.materials:
        if m:
            m.name = f"{prefix}_{m.name}"

    # 7) 导出 glb(glTF 默认 +Y up;export_apply 自动应用修改器)
    bpy.ops.export_scene.gltf(
        filepath=dst,
        export_format="GLB",
        export_apply=True,
        export_materials="EXPORT",
    )

    # 8) 统计报告
    dims = obj.dimensions
    print("========== clean_asset 报告 ==========")
    print(f"源文件     : {src}")
    print(f"输出       : {dst}")
    print(f"三角面     : {tris_before} -> ~{int(tris_now * ratio)} (预算 {target})")
    print(f"材质数     : {len([m for m in obj.data.materials if m])}")
    print(f"包围盒尺寸 : {dims.x:.2f} x {dims.y:.2f} x {dims.z:.2f} (米)")
    print(f"原点       : 底部中心(脚底 z=0)")


main()
