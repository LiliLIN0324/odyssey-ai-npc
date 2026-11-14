const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawn, spawnSync } = require("node:child_process");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "..");
const source = file => fs.readFileSync(path.join(ROOT, file), "utf8");
const python = () => process.env.PYTHON || "py";
const pyArgs = args => process.env.PYTHON ? args : ["-3", ...args];
const sha256 = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

function runPython(args, options={}){
  const result = spawnSync(python(), pyArgs(args), {
    cwd: ROOT, encoding: "utf8", timeout: 120000, ...options,
  });
  assert.equal(result.status, 0, `Python 命令失败：${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
  return result;
}

function walk(dir){
  return fs.readdirSync(dir, {withFileTypes:true}).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function imageSize(file){
  const data = fs.readFileSync(file);
  if (data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){
    return {width:data.readUInt32BE(16), height:data.readUInt32BE(20), colorType:data[25]};
  }
  assert.equal(data.readUInt16BE(0), 0xffd8, `${file} 必须是 PNG 或 JPEG`);
  let offset = 2;
  while (offset < data.length){
    assert.equal(data[offset++], 0xff, `${file} JPEG 标记损坏`);
    const marker = data[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    const length = data.readUInt16BE(offset); offset += 2;
    if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){
      return {height:data.readUInt16BE(offset+1), width:data.readUInt16BE(offset+3), colorType:null};
    }
    offset += length - 2;
  }
  throw new Error(`${file} 缺少 JPEG 尺寸标记`);
}

function buildPackage(t){
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "odyssey-h5-node-"));
  t.after(() => fs.rmSync(temp, {recursive:true, force:true}));
  const out = path.join(temp, "site");
  const zip = path.join(temp, "odyssey-h5.zip");
  runPython(["scripts/build_h5.py", "--out", out, "--zip", zip]);
  return {out, zip};
}

test("独立 H5 包保留全部前端内容，仅把 schema 改为本地资源", t => {
  const {out} = buildPackage(t);
  const manifest = JSON.parse(fs.readFileSync(path.join(out, "build-manifest.json"), "utf8"));
  assert.equal(manifest.format, "odyssey-h5-v1");
  assert.equal(manifest.entry, "index.html");
  for (const required of [
    "index.html", "world3d.js", "island3d.js", "vendor/three.module.min.js",
    "src/ui/theme.css", "src/data/schema.json", "functions/api/chat.js",
  ]) assert.ok(fs.existsSync(path.join(out, required)), `独立包缺少 ${required}`);

  const sourceHtml = source("index.html");
  const expectedHtml = sourceHtml.replace('fetch("/api/schema")', 'fetch("src/data/schema.json")');
  assert.notEqual(expectedHtml, sourceHtml, "构建必须改写唯一 schema 请求");
  assert.equal(fs.readFileSync(path.join(out, "index.html"), "utf8"), expectedHtml,
    "除 schema 路径外，HTML/剧情不得被构建器删改");
  for (const dir of ["src", "concept-art", "vendor", "functions"]){
    for (const file of walk(path.join(ROOT, dir))){
      const rel = path.relative(ROOT, file).replaceAll("\\", "/");
      if (rel === "src/data/schema.json") continue;
      assert.ok(fs.existsSync(path.join(out, rel)), `未打入 ${rel}`);
      assert.equal(sha256(path.join(out, rel)), sha256(file), `${rel} 必须与源文件一致`);
    }
  }
  assert.ok(JSON.parse(fs.readFileSync(path.join(out, "src/data/schema.json"), "utf8")).length > 0,
    "本地意图菜单必须可读");
  assert.equal(fs.existsSync(path.join(out, "key.txt")), false, "密钥不得进入发布包");
  for (const forbidden of ["server.py", "tests", "node_modules", ".wrangler", "3d", "index.backup-before-split.html"]){
    assert.equal(fs.existsSync(path.join(out, forbidden)), false, `发布包不应包含 ${forbidden}`);
  }
});

test("构建清单哈希真实且 ZIP 与目录产物一致", t => {
  const {out, zip} = buildPackage(t);
  const manifestPath = path.join(out, "build-manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const actual = walk(out).filter(file => file !== manifestPath)
    .map(file => path.relative(out, file).replaceAll("\\", "/")).sort();
  assert.deepEqual(manifest.files.map(item => item.path).sort(), actual, "清单必须覆盖每一个发布文件");
  for (const item of manifest.files){
    const full = path.join(out, item.path);
    assert.equal(item.bytes, fs.statSync(full).size, `${item.path} 字节数不匹配`);
    assert.equal(item.sha256, sha256(full), `${item.path} SHA-256 不匹配`);
  }
  const listing = runPython(["-c",
    "import json,sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps(sorted(z.namelist())))",
    zip,
  ]);
  const entries = JSON.parse(listing.stdout.trim());
  assert.deepEqual(entries, [...actual, "build-manifest.json"].sort(), "ZIP 必须与目录产物一致");
  assert.ok(entries.every(name => !name.startsWith("/") && !name.includes("..")), "ZIP 路径必须安全相对");
});

test("静态自测服务提供本地资源与无密钥离线降级，不允许路径穿越", async t => {
  const {out} = buildPackage(t);
  const server = spawn(python(), pyArgs(["scripts/serve_h5.py", "--root", out, "--port", "0"]), {
    cwd: ROOT, stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => server.kill());
  const port = await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error(`静态服务启动超时：${output}`)), 10000);
    server.stdout.on("data", chunk => {
      output += chunk;
      const match = output.match(/ODYSSEY_H5_PORT=(\d+)/);
      if (match){ clearTimeout(timer); resolve(Number(match[1])); }
    });
    server.stderr.on("data", chunk => { output += chunk; });
    server.once("error", reject);
  });
  const request = (method, requestPath, body) => new Promise((resolve, reject) => {
    const req = http.request({host:"127.0.0.1", port, path:requestPath, method,
      headers:body ? {"Content-Type":"application/json"} : {}}, res => {
      let text = ""; res.setEncoding("utf8");
      res.on("data", chunk => { text += chunk; });
      res.on("end", () => resolve({status:res.statusCode, text, type:res.headers["content-type"]}));
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
  const index = await request("GET", "/");
  assert.equal(index.status, 200);
  assert.match(index.type, /text\/html/);
  const schema = await request("GET", "/src/data/schema.json");
  assert.equal(schema.status, 200);
  assert.ok(JSON.parse(schema.text).length > 0);
  const module = await request("GET", "/world3d.js");
  assert.equal(module.status, 200);
  assert.match(module.type, /javascript/);
  const offline = await request("POST", "/api/parse", {prompt:"买一瓶蜂蜜酒"});
  assert.equal(offline.status, 200, "离线降级不应制造浏览器 HTTP 错误");
  assert.equal(JSON.parse(offline.text).error, "offline-static-build");
  const health = await request("GET", "/api/health");
  assert.equal(JSON.parse(health.text).mode, "offline-static");
  const traversal = await request("GET", "/%2e%2e/key.txt");
  assert.equal(traversal.status, 404);
});

test("浏览器回归可指向打包产物，并具备独立离线检查与一键验收入口", () => {
  const regression = source("tests/browser_regression.py");
  assert.match(regression, /ODYSSEY_BASE_URL/, "浏览器回归必须支持产物 URL");
  assert.match(regression, /ODYSSEY_H5_PACKAGE/, "产物回归必须开启网络来源检查");
  for (const script of ["scripts/verify_h5.py", "tests/h5_offline_browser.py", "scripts/capture_taptap.py"]){
    assert.ok(fs.existsSync(path.join(ROOT, script)), `缺少自测链路 ${script}`);
  }
});

test("TapTap 图片物料满足官方尺寸、格式、数量和一致性要求", () => {
  const root = path.join(ROOT, "release", "taptap");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "material-manifest.json"), "utf8"));
  assert.equal(manifest.submission.status, "not_submitted");
  assert.equal(manifest.submission.storeCreated, false);
  assert.equal(manifest.submission.reviewSubmitted, false);
  assert.equal(manifest.submission.published, false);
  const required = new Map([
    ["icon-512.png", [512,512,4*1024*1024]],
    ["logo-1280.png", [1280,320,4*1024*1024]],
    ["cover-460x215.jpg", [460,215,3*1024*1024]],
    ["cover-600x900.jpg", [600,900,3*1024*1024]],
    ["wallpaper-3840x1240.jpg", [3840,1240,10*1024*1024]],
    ["promo-1920x1080.jpg", [1920,1080,4*1024*1024]],
    ["promo-no-logo-1920x1080.jpg", [1920,1080,6*1024*1024]],
    ["promo-no-logo-720x1080.jpg", [720,1080,6*1024*1024]],
  ]);
  for (const [name, [width,height,maxBytes]] of required){
    const file = path.join(root, name);
    assert.ok(fs.existsSync(file), `缺少 TapTap 物料 ${name}`);
    assert.deepEqual(imageSize(file), {width,height,colorType:name.endsWith(".png") ? (name.startsWith("icon") ? 2 : 6) : null},
      `${name} 尺寸或透明通道不合规`);
    assert.ok(fs.statSync(file).size <= maxBytes, `${name} 超过官方大小上限`);
  }
  const screenshots = manifest.assets.filter(asset => asset.kind === "screenshot");
  assert.ok(screenshots.length >= 3, "至少三张实机截图");
  const hashes = new Set();
  let baseline = null;
  for (const [index, asset] of screenshots.entries()){
    const file = path.join(root, asset.path);
    const size = imageSize(file);
    assert.ok(size.width >= 1280 && size.height >= 720, `${asset.path} 低于横版最低尺寸`);
    const ratio = size.width / size.height;
    assert.ok(ratio >= 8/5 - 0.01 && ratio <= 8/3 + 0.01, `${asset.path} 比例不合规`);
    if (baseline) assert.deepEqual(size, baseline, "所有截图方向与宽高比必须一致");
    else baseline = size;
    assert.ok(fs.statSync(file).size <= 4*1024*1024, `${asset.path} 超过 4MB`);
    hashes.add(sha256(file));
    if (index < 3) assert.equal(asset.source, "real-chrome-gameplay", "前三张必须是真实玩法画面");
  }
  assert.equal(hashes.size, screenshots.length, "截图不得重复");
});

test("TapTap 实机录屏与商店文案齐全，且不虚构提审或上架状态", () => {
  const root = path.join(ROOT, "release", "taptap");
  const video = path.join(root, "gameplay.mp4");
  assert.ok(fs.existsSync(video), "开放下载/试玩必需实机录屏");
  assert.ok(fs.statSync(video).size <= 5*1024*1024*1024);
  const probe = spawnSync("ffprobe", ["-v","error","-select_streams","v:0",
    "-show_entries","stream=codec_name,width,height:format=duration","-of","json",video], {encoding:"utf8"});
  assert.equal(probe.status, 0, probe.stderr);
  const info = JSON.parse(probe.stdout);
  assert.ok(["h264","hevc"].includes(info.streams[0].codec_name), "视频编码必须为 H.264/HEVC");
  assert.ok(Math.min(info.streams[0].width, info.streams[0].height) >= 540);
  assert.ok(Number(info.format.duration) >= 15, "实机录屏不得短于 15 秒");
  assert.ok(Number(info.format.duration) <= 30*60);

  const listing = fs.readFileSync(path.join(root, "store-listing.md"), "utf8");
  for (const text of ["奥德赛·地中海", "叙事冒险", "简介", "开发者的话", "更新日志", "未提审", "未上架"]){
    assert.ok(listing.includes(text), `商店文案缺少 ${text}`);
  }
  const privacy = fs.readFileSync(path.join(root, "privacy-policy.md"), "utf8");
  for (const text of ["localStorage", "存档", "导出", "AI", "离线"]){
    assert.ok(privacy.includes(text), `隐私说明缺少 ${text}`);
  }
});
