#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""在 github.com 的 HTTPS 被掐时，用 Git Data API 推送（api.github.com 通常还通）。

症状：`git push origin main` 报
    schannel: server closed abruptly (missing close_notify)
    schannel: failed to receive handshake, SSL/TLS connection failed
而 `curl https://api.github.com` 返回 200 —— 说明只有 github.com 这台主机的 TLS 被阻断。

做法（全部走 GitHub REST API，不需要新凭据、不改账号设置）：
  1. 上传变更文件的 blob（GitHub 算出的 blob sha 与本地完全一致，因为 blob 是内容寻址的）；
  2. 以远端 main 的 tree 为 base 建新 tree（tree sha 也必然一致）；
  3. 建 commit，显式带上 author/committer 的名字/邮箱/日期；
  4. PATCH /git/refs/heads/main 推进远端 ref；
  5. 把本地 main 指到同一个 commit —— 两端 sha 一致，不留「本地领先 1」的假象。

用法：
    py -3 tools/push_via_api.py            # 推送当前 HEAD
    py -3 tools/push_via_api.py --dry-run  # 只比对，不推

依赖：`gh` 已登录（gh auth status 可见账号，且 token 带 repo 权限）。
"""

import argparse
import base64
import json
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = "LiliLIN0324/odyssey-ai-npc"
API = f"https://api.github.com/repos/{REPO}"


def git(*args, binary=False):
    out = subprocess.check_output(["git", "-C", str(ROOT), "-c", "core.quotePath=false", *args])
    return out if binary else out.decode("utf-8", "replace")


def api(method, path, payload=None):
    tok = subprocess.check_output(["gh", "auth", "token"], text=True).strip()
    url = path if path.startswith("http") else API + path
    data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    req.add_header("Authorization", f"Bearer {tok}")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            raw = r.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")[:400]
        raise SystemExit(f"API {method} {path} → HTTP {e.code}\n{body}")


def local_commit_parts(head):
    raw = git("cat-file", "commit", head, binary=True)
    header, body = raw.split(b"\n\n", 1)
    lines = header.decode("utf-8").splitlines()
    tree = next(l.split()[1] for l in lines if l.startswith("tree "))
    parent = next(l.split()[1] for l in lines if l.startswith("parent "))
    stamp = next(l.split()[-2] for l in lines if l.startswith("author "))
    tz = next(l.split()[-1] for l in lines if l.startswith("author "))
    who = " ".join(next(l for l in lines if l.startswith("author ")).split()[1:3])
    date_iso = git("show", "-s", "--format=%aI", head).strip()
    message = git("show", "-s", "--format=%B", head)
    return dict(raw=raw, body=body, tree=tree, parent=parent, stamp=stamp, tz=tz,
                who=who, date_iso=date_iso, message=message)


def upload_blobs(head):
    entries = []
    for line in git("diff", "--name-status", "HEAD^", head).splitlines():
        status, path = line.split("\t", 1)
        if status.startswith("D"):
            entries.append({"path": path, "mode": "100644", "type": "blob", "sha": None})
            print(f"  D {path}")
            continue
        mode, _t, blob = git("ls-tree", head, "--", path).split()[0:3]
        content = git("cat-file", "blob", blob, binary=True)
        r = api("POST", "/git/blobs",
                {"content": base64.b64encode(content).decode("ascii"), "encoding": "base64"})
        if r["sha"] != blob:
            raise SystemExit(f"blob sha 不一致：本地 {blob} vs GitHub {r['sha']}（{path}）")
        entries.append({"path": path, "mode": mode, "type": "blob", "sha": blob})
        print(f"  {status} {path}  blob {blob[:10]} ✓")
    return entries


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    head = git("rev-parse", "HEAD").strip()
    parts = local_commit_parts(head)
    print("本地 HEAD:", head)

    remote_head = api("GET", "/git/ref/heads/main")["object"]["sha"]
    print("远端 main:", remote_head)
    if remote_head == head:
        print("远端已是最新，无需推送。")
        return
    if remote_head != parts["parent"]:
        raise SystemExit(f"远端 main 已前进（{remote_head}）≠ 本地父提交（{parts['parent']}）"
                         f"——先同步本地再推，别硬推。")

    base_tree = api("GET", f"/git/commits/{remote_head}")["tree"]["sha"]
    entries = upload_blobs(head)
    tree = api("POST", "/git/trees", {"base_tree": base_tree, "tree": entries})
    local_tree = git("rev-parse", head + "^{tree}").strip()
    print("树：GitHub %s｜本地 %s → %s" % (
        tree["sha"], local_tree, "一致 ✓" if tree["sha"] == local_tree else "不一致 ✗"))
    if tree["sha"] != local_tree:
        raise SystemExit("树不一致，停止（推上去的内容会和本地不一样）")
    if args.dry_run:
        print("--dry-run：到此为止。")
        return

    commit = api("POST", "/git/commits", {
        "message": parts["message"],
        "tree": tree["sha"],
        "parents": [remote_head],
        "author": {"name": parts["who"].split(" <")[0], "email": parts["who"].split("<")[1].rstrip(">"),
                   "date": parts["date_iso"]},
        "committer": {"name": parts["who"].split(" <")[0], "email": parts["who"].split("<")[1].rstrip(">"),
                      "date": parts["date_iso"]},
    })
    print("GitHub commit:", commit["sha"], "｜本地:", head,
          "→", "一致 ✓" if commit["sha"] == head else "不一致 ✗")

    if commit["sha"] != head:
        # GitHub 可能给 commit 补了换行/归一化时区 → 反推它的原始字节，把本地也对齐
        raw_guess = (
            f"tree {parts['tree']}\nparent {parts['parent']}\n"
            f"author {parts['who']} {parts['stamp']} {parts['tz']}\n"
            f"committer {parts['who']} {parts['stamp']} {parts['tz']}\n\n").encode("utf-8")
        for cand in (parts["body"], parts["body"] + b"\n", parts["body"].rstrip(b"\n"),
                     parts["body"].rstrip(b"\n") + b"\n"):
            p = subprocess.run(["git", "-C", str(ROOT), "hash-object", "-t", "commit", "--stdin"],
                               input=raw_guess + cand, capture_output=True)
            if p.stdout.decode().strip() == commit["sha"]:
                w = subprocess.run(["git", "-C", str(ROOT), "hash-object", "-t", "commit", "-w", "--stdin"],
                                   input=raw_guess + cand, capture_output=True)
                git("update-ref", "refs/heads/main", commit["sha"])
                print("已把本地 main 对齐到同一个 commit 对象 ✓")
                break

    api("PATCH", "/git/refs/heads/main", {"sha": commit["sha"], "force": False})
    git("update-ref", "refs/remotes/origin/main", commit["sha"])
    print("远端 main →", commit["sha"])
    print("本地 HEAD →", git("rev-parse", "HEAD").strip(),
          "｜工作区:", git("status", "--porcelain").strip() or "干净")


if __name__ == "__main__":
    main()
