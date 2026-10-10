# packing/ · 打包专目录

> **为什么单独一个目录**：打包相关的东西（图标资产、平台配置、产物）**全在这里**，
> 根目录不再被产物污染。渲染层代码照常写在 `src/`，互不打扰。
> **win / mac 各占一个子目录** —— 产物格式、图标格式、签名机制都不同，混在一起必然互相覆盖。

## 目录结构

```
packing/
├── README.md                  ← 本文件
├── icon.ps1                   ← 图标流水线（源 PNG → 压缩 PNG + ICO + ICNS）
├── assets/                    ← **两平台共用**的图标（全部是生成物）
│   ├── icon.png               ← 压缩后主图标 512×512（mac 也接受 PNG）
│   ├── icon.ico               ← Windows：16/24/32/48/64/128/256
│   └── icon.icns              ← macOS：ic07~ic14（默认上限 512）
├── win/
│   ├── electron-builder.yml   ← Windows 配置（NSIS 安装包 + 免安装版）
│   └── out/                   ← Windows 产物（**不入库**）
└── mac/
    ├── electron-builder.yml   ← macOS 配置（DMG + ZIP）
    └── out/                   ← macOS 产物（**不入库**）
```

---

## 一、图标

**源图标**：仓库根的 `画布网站图标.png`（1898×1898，**3.77 MB**，24bpp）—— 远超所需，故压缩。

```bash
npm run icon
# 等价于：
# powershell -NoProfile -ExecutionPolicy Bypass -File packing/icon.ps1 -Source "画布网站图标.png"
```

**产出（实测）**：

| 文件 | 内容 | 体积 |
| --- | --- | --- |
| `assets/icon.png` | 512×512，32bpp 带 alpha | 493,912 B |
| `assets/icon.ico` | 7 档：16/24/32/48/64/128/256 | 192,052 B |
| `assets/icon.icns` | 7 档：ic11(32)/ic12(64)/ic07(128)/ic13(256)/ic08(256)/ic14(512)/ic09(512) | 1,298,950 B |

**主 PNG 压缩比**：`3,957,288 → 493,912`（**降 88%**）。

**只用系统自带 `System.Drawing`**（.NET GDI+），**不引任何新依赖** —— 不用 pngquant / sharp / ImageMagick（那几个都要额外二进制）。

### 可调参数

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `-Source` | （必填） | 源 PNG。**中文路径由调用方传入** —— 脚本内不含中文字面量，避免 PowerShell 5.1 把 UTF-8 无 BOM 脚本里的中文解码成乱码 |
| `-PngSize` | `512` | 主 PNG 边长 |
| `-IcoSizes` | `16,24,32,48,64,128,256` | Windows 档位 |
| `-IcnsMaxSize` | `512` | macOS 档位上限。**传 `1024` 会让 icns 涨到 ~3.1 MB**（GDI+ 的 1024 单张就 ~2 MB）；传 `256` 可压到 ~180 KB |
| `-OutDir` | `packing/assets` | 产出目录 |

### ⚠️ 两个字节序坑（改脚本前必读）

| 容器 | 长度字段字节序 | 后果 |
| --- | --- | --- |
| **ICO** | **小端** | 与 `BinaryWriter.Write(UInt32)` 一致 ⇒ 直接写即可 |
| **ICNS** | **大端** | `BinaryWriter` 写的是小端 ⇒ **必须手写 BE32**。踩过：声明总长读成 `114430720`、整表错位 |

另一个坑：**别把 PNG 字节流经 PowerShell 函数返回** —— `byte[]` 会被展开成逐元素流，载荷写坏（实测 `ico` 塌成 125 字节）。一律「落盘 → `ReadAllBytes`」直接用。

---

## 二、打包

### 前置（一次性）

```bash
npm i -D electron-builder     # ✅ 已装（2026-10-10，241 包）
```

### Windows

```bash
npm run pack:win              # → packing/win/out/
```

产物：`豆包画布-<version>-setup.exe`（NSIS 安装包）+ `豆包画布-<version>-portable.exe`（免安装）。
想快速验证配置而不出安装包：`npm run pack:dir`（`--dir`，只出解包目录，快很多）。

### macOS

```bash
npm run pack:mac              # 在 macOS 上执行 → packing/mac/out/
```

产物：`豆包画布-<version>-<arch>.dmg` + `.zip`（x64 / arm64 各一份）。

> 🔴 **硬约束：mac 产物只能在 macOS 上构建** —— 需要 macOS 的 `codesign` / `hdiutil` / `sips`，
> electron-builder **无法在 Windows 上产出 `.app` / `.dmg`**。
> 所以 `packing/mac/` 是**待 mac 机器执行**的配置，不是现在就能跑的东西。
> 当前 `mac.identity: null`（关签名，本地未签名构建）；将来要分发时删掉它并配 Developer ID + 公证。

### 入口链（两平台相同）

```
package.json 的 "main": "electron/main.js"
  → electron/main.js:878  生产环境 loadFile('../dist/index.html')
  ⇒ 打包前必须先 npm run build（产物 dist/）
```

`pack:win` / `pack:mac` 都已内置 `npm run build` 前置。

---

## 三、已实测结果（2026-10-10 · Windows）

链路：`npm i -D electron-builder`（241 包）→ `npx vite build` → `npx electron-builder --win --dir --config packing/win/electron-builder.yml` **✅ 成功**

| 检查项 | 结果 |
| --- | --- |
| 配置被加载 | `loaded configuration file=packing/win/electron-builder.yml` ✅ |
| 产物 | `packing/win/out/win-unpacked/豆包画布.exe`（246,457,344 B）✅ |
| `app.asar` | **70,192,394 → 24,786,177 B（-65%，省 45.4 MB）**；顶层 `node_modules, dist, electron, package.json` ✅ |
| `@mediapipe` 排除 | ✅ 38.68 MB **未进包**（wasm/tflite 走 `public/mediapipe` → `dist/mediapipe`；JS 由 vite 打包；源码 0 处 `require` 它）|
| `electron/node_modules/ws` | ✅ **仍在包内**（排除规则只打根 `node_modules/@mediapipe/**`，不牵连 `electron/**`）|
| `dist/**` 进包 | ✅ |
| `electron/**` 进包 | ✅（`api/` · `main.js` · `preload.js` · `*-preload.js` · `node_modules`）|
| **`ws` 依赖** | ✅ **已解决** —— `electron/node_modules/ws` 在源码树里，asar 里也有（原风险不成立）|
| sourcemap 排除 | ✅ `dist/assets` 19 个文件，`.map` **0 个**（`!**/*.map` 生效）|
| 图标 | 已嵌入 exe 资源（`updating asar integrity executable resource` 成功）|
| author 警告 | 首跑报 `author is missed` → 补 `package.json.author` → 复跑**警告消失** ✅ |

> 本次只跑 `--dir`（快，不出安装包）。`npm run pack:win` 才会出 NSIS / portable 安装包。

### 体积构成（`win-unpacked` 实测 · 2026-10-10）

| 项 | 体积 | 可否再砍 |
| --- | --- | --- |
| `豆包画布.exe` | **235 MB** | ❌ Electron **运行时本体**（内嵌 Chromium/Node/V8），`files` 规则**管不到** |
| `resources\app.asar` | **23.6 MB**（原 66.9） | ⚠️ 还能再砍 ~8 MB（见 §四-3）|
| `locales\*.pak` | **1.1 MB**（原 48.3；**55 → 2** 个） | ✅ 已砍（`electronLanguages: [zh-CN, en-US]`）|
| `*.dll` | 39.6 MB | ⚠️ `dxcompiler.dll` 25.7 MB（WebGPU 用）可试删，**有风险** |
| `LICENSE*` | 19.5 MB | ❌ Chromium 许可文件，**法律上要留** |
| 其他（`icudtl.dat` / snapshot / 根 `*.pak`）| 25.2 MB | ❌ 运行时必需 |
| **合计** | **344.2 MB**（原 **437.9 MB** ⇒ **-93.7 MB / -21%**）| |

> 🔴 **别把 `app.asar` 的 23.6 MB 当成"包有多大"** —— `豆包画布.exe` 本体就 **235 MB**，那是 Electron 的固有成本。
> 换句话说：`files` 白名单只能管到 **23.6 / 344.2 ≈ 7%** 的体积，剩下 93% 是 Electron 运行时 + 语言包 + 许可文件。

## 四、⚠️ 仍未验证 / 已知限制

1. **`npm run build` 当前跑不通** —— 卡在 `typecheck`：3 处 `TS2304: Cannot find name 'GPT_TEXT'`（`src/adapters/site/gpt/scripts.ts:146-148`，**并行在写的代码**，与打包无关）。
   ⇒ `npm run pack:win` 内置 `npm run build` 前置 ⇒ **那段补完前 `pack:win` 会先挂在 typecheck**。
   临时绕过：`npx vite build && npx electron-builder --win --dir --config packing/win/electron-builder.yml`。
2. **mac 侧完全未验** —— electron-builder **无法在 Windows 出 `.app`/`.dmg`**；`.icns` 格式已按 Apple 表校验，但未经 macOS `iconutil`/Finder 实测。`mac.identity: null`（关签名）便于本地跑，分发时再配 Developer ID + 公证。
3. **asar 仍可再瘦（当前 23.6 MB）** —— 已排 `@mediapipe`（-45.4 MB）。**剩余 `node_modules` 全是渲染层依赖**（`@xyflow` · `react` · `react-dom` · `d3-*` · `zustand` · `@types` …），而它们**已被 vite 全量打进 `dist/`** ⇒ 理论上整块根 `node_modules` 都可排。
   之所以先不排：`!node_modules/**` 的通配行为可能牵连 `electron/node_modules/ws`（主进程要 `require` 它），需先验证 glob 只打根目录。要再砍约 8 MB 就走这条。
4. **开发端口不一致（已知缺口，不属本目录）** —— `vite.config.ts:14` 是 **5175**，而 `electron/main.js:883` 开发环境 `loadURL('http://localhost:5123')`。打包走 `loadFile` 不受影响，但**开发联调**对不上（属 `electron/**`，改动须回写 `docs/05-配置契约层.md`）。
5. **`dist/` 不清空** —— `vite.config.ts:19` `emptyOutDir: false`（本机安全护栏拦 `fs.rmSync`）⇒ 旧哈希文件会累积，打包前建议手工清一次 `dist/`。
6. ~~产物入库~~ ✅ **已解决** —— 新增 `packing/.gitignore`（`*/out/` + `assets/_icon-tmp/`），**就近隔离、不动仓库根**。
7. **`dist/` 会被 `emptyOutDir: false` 堆脏** —— 实测曾堆出 **15 个历史 bundle + 15 个 map（~37 MB）**，会原样进包（`.map` 已排除，但旧 JS 会进）。**打包前先清 `dist/assets/`**（本次已手工清过并重建）。
