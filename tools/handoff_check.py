# -*- coding: utf-8 -*-
"""
HANDOFF 体检脚本（HANDOFF.md §六「会话收尾体检」的机械部分）。

用法：仓库根目录下  py -3 tools/handoff_check.py
输出：[OK] / [!!] / [--] 三种行，结尾给结论；有 [!!] 时退出码 1。
判断题（数字对不对、3D 摘要是否与 3d/HANDOFF.md 一致）仍需人工，
本脚本只负责"引用的东西是否真实存在、状态是否失配"。
"""
import subprocess
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent

problems = []


def ok(msg):
    print(f"[OK] {msg}")


def bad(msg):
    print(f"[!!] {msg}")
    problems.append(msg)


def skip(msg):
    print(f"[--] {msg}")


def git(*args):
    r = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    return r.returncode, (r.stdout or "").strip(), (r.stderr or "").strip()


print(f"== HANDOFF 体检 @ {ROOT.name} ==\n")

# 1. 工作区是否干净
code, out, _ = git("status", "--porcelain")
if code != 0:
    bad("git status 执行失败")
elif out:
    bad(f"工作区有未提交变更（{len(out.splitlines())} 项）——先提交再交接")
else:
    ok("工作区干净")

# 2. 本地是否领先远端 / 未推送的 tag
code, out, _ = git("rev-list", "--count", "origin/main..HEAD")
if code != 0:
    skip("无 origin/main（仓库还没推过远端？）")
else:
    n = int(out or 0)
    (ok if n == 0 else bad)(f"本地领先 origin/main {n} 个提交" + ("" if n == 0 else "——HANDOFF 不许领先远端过夜，先 push"))
    code2, tags, _ = git("tag", "--list")
    code3, remote_refs, _ = git("ls-remote", "--tags", "origin")
    if code3 != 0:
        skip("ls-remote 失败（可能离线），跳过 tag 推送比对")
    else:
        remote_tags = {ln.split("refs/tags/")[-1].removesuffix("^{}") for ln in remote_refs.splitlines()}
        local_tags = set(tags.splitlines()) if tags else set()
        unpushed = local_tags - remote_tags
        (ok if not unpushed else bad)(
            f"tag 推送比对：本地 {sorted(local_tags) or '无'}，未推送 {sorted(unpushed) or '无'}")
        print("     ↳ 打新 tag 前先对 PRODUCT.md §7 判据：不达标不进下一版，不达标不打 tag")

# 3. 密钥安全
code, out, _ = git("ls-files")
tracked = set(out.splitlines())
leaks = [f for f in tracked if f in ("key.txt",) or f.startswith("secret") or f.endswith(".key")]
(ok if not leaks else bad)(f"密钥文件未被跟踪（{leaks or '干净'}）")
if (ROOT / "key.txt").exists() and "key.txt" not in tracked:
    ok("key.txt 在磁盘上但已被 .gitignore（正常）")
elif not (ROOT / "key.txt").exists():
    skip("key.txt 不在磁盘（新机器需自行放置，模板 key.example.txt）")

# 4. 文件地图抽查：HANDOFF §五 声称存在的核心文件
key_files = [
    "HANDOFF.md", "PLAN.md", "PRODUCT.md", "README.md",
    "schema.json", "cases.jsonl", "eval.py", "fake_server.py",
    "schema-island-generic.json", "result-teleai.json", "key.example.txt",
    "odyssey-witch/index.html", "odyssey-witch/server.py", "odyssey-witch/启动游戏.bat",
    "odyssey-witch/odyssey-story.md", "odyssey-witch/odyssey-lore.md", "odyssey-witch/odyssey-visual.md",
    "odyssey-witch/concept-art",
    "odyssey-witch/3d/HANDOFF.md", "odyssey-witch/3d/PIPELINE.md",
    "odyssey-witch/3d/tools/clean_asset.py", "odyssey-witch/3d/tools/review_shots.py",
    "odyssey-witch/3d/app/package.json", "odyssey-witch/3d/app/wrangler.toml",
    "tools/rerun_failed.py", "tools/handoff_check.py",
]
missing = [f for f in key_files if not (ROOT / f).exists()]
(ok if not missing else bad)(f"文件地图抽查 {len(key_files)} 项" + (f"，缺失：{missing}" if missing else "，全部存在"))

# 5. HANDOFF 正文引用的 result 文件是否都在（--out 示例是输出名不是引用，剔除）
import re
handoff = "\n".join(ln for ln in (ROOT / "HANDOFF.md").read_text(encoding="utf-8").splitlines()
                    if "--out" not in ln)
cited = set(re.findall(r"result-[\w.-]+\.json", handoff))
gone = [f for f in cited if not (ROOT / f).exists()]
(ok if not gone else bad)(f"HANDOFF 引用的评测结果 {sorted(cited) or '无'}" + (f"，磁盘上没有：{gone}" if gone else "，均在"))

# 6. 根目录散落图片：未被任何 md / index.html 引用 → 该归档 shots/
refs = ""
for pat in ("*.md", "odyssey-witch/*.md", "odyssey-witch/index.html"):
    for p in ROOT.glob(pat):
        try:
            refs += p.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            pass
stray = [p.name for p in list(ROOT.glob("*.png")) + list(ROOT.glob("*.jpg"))
         if p.name not in refs]
if stray:
    print(f"[!!] 根目录有 {len(stray)} 张未引用图片（会话残留）→ git mv 到 shots/ 归档：")
    for s in stray:
        print(f"     - {s}")
    problems.append(f"根目录散落图片 {len(stray)} 张")
else:
    ok("根目录无散落图片")

# 7. 3D 账本 §0 状态摘要（人工比对根 HANDOFF §一.4 是否一致）
p3d = ROOT / "odyssey-witch" / "3d" / "HANDOFF.md"
if p3d.exists():
    rows = [ln for ln in p3d.read_text(encoding="utf-8").splitlines()
            if re.match(r"^\| P[D0-7] ", ln)]
    print("[--] 3d/HANDOFF.md §0 当前状态（根 HANDOFF §一.4 应与此一致）：")
    for r in rows:
        print(f"     {r}")
else:
    bad("odyssey-witch/3d/HANDOFF.md 不存在（3D 线总控丢失）")

print("\n== 结论 ==")
if problems:
    print(f"未通过 {len(problems)} 项，按 [!!] 行处理后重跑。")
    sys.exit(1)
print("全部通过。收尾动作：更新 HANDOFF.md → commit → push（里程碑另见 PRODUCT.md §7 判据）。")
