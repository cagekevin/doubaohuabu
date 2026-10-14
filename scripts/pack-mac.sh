#!/usr/bin/env bash
# =============================================================================
# scripts/pack-mac.sh —— macOS 一键打包
#
# 【用法】npm run pack:mac [-- <选项>]
#   （无选项）        本机架构 · 只出 dmg（安装用）
#   --arch=<a>        auto(默认=本机架构) | arm64 | x64 | both
#   --target=<t>      dmg(默认，安装用) | zip(自动更新用) | both | dir(只出 .app)
#   --no-cache        强制重新下载工具包
#   -h, --help        帮助
#
# 【只做构建 + 打包】不跑门禁（typecheck / lint / test）—— 门禁是提交前的事，
#   用 `npm run check` 单独跑，与打包无关。
#
# 【后端依赖】electron/ 是独立的 CommonJS 包（自带 package.json），根 `npm install`
#   **不会**装它的依赖。而 electron/chrome-cdp.js 需要 ws —— 缺了它打包后主进程
#   一启动就 `Cannot find module 'ws'` 崩掉（窗口起不来）。本脚本会自动补装。
#
# 【为什么预置缓存】electron-builder 要从 GitHub 拉两个工具包：Electron 二进制
#   与 dmgbuild。国内直连 GitHub CDN 极慢，而 @electron/get 的 fetch **无超时**
#   ⇒ 打包会永久卡死（进程 CPU 0、无日志）。本脚本先用 npmmirror 镜像把它们预置
#   进缓存并校验 sha256；命中缓存后 electron-builder 完全跳过网络。
#
# 【环境变量】可覆盖镜像地址：
#   ELECTRON_MIRROR                   默认 https://npmmirror.com/mirrors/electron/
#   ELECTRON_BUILDER_BINARIES_MIRROR  默认 https://npmmirror.com/mirrors/electron-builder-binaries/
#
# ⚠️ 变量引用一律用 ${VAR}：bash 会把 `$VAR（` 里的全角括号字节并进变量名，
#    在 set -u 下直接报 unbound variable。
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

MIRROR_ELECTRON="${ELECTRON_MIRROR:-https://npmmirror.com/mirrors/electron/}"
MIRROR_BINARIES="${ELECTRON_BUILDER_BINARIES_MIRROR:-https://npmmirror.com/mirrors/electron-builder-binaries/}"

# ── 输出工具 ──────────────────────────────────────────────────────────────
step() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[1;32m✓\033[0m %s\n' "$*"; }
die()  { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
sha256_of() { shasum -a 256 "$1" | awk '{print $1}'; }

# 阶段计时
PHASE_TS=0
phase()     { PHASE_TS=$(date +%s); step "$*"; }
phase_end() { printf '  \033[1;32m✓\033[0m 用时 %s 秒\n' "$(( $(date +%s) - PHASE_TS ))"; }

usage() { sed -n '/^# 【用法】/,/^#   -h, --help/p' "$0" | sed 's/^# \{0,1\}//'; }

# ── 参数解析 ──────────────────────────────────────────────────────────────
ARCH="auto"; TARGET="dmg"; NO_CACHE=0
for arg in "$@"; do
  case "$arg" in
    --arch=*)   ARCH="${arg#*=}" ;;
    --target=*) TARGET="${arg#*=}" ;;
    --dir)      TARGET="dir" ;;   # 兼容旧写法
    --no-cache) NO_CACHE=1 ;;
    -h|--help)  usage; exit 0 ;;
    *)          echo "✗ 未知参数：${arg}（-h 看用法）" >&2; exit 1 ;;
  esac
done
[ "$ARCH" = "auto" ] && ARCH="$(node -p 'process.arch')"   # 本机架构：Apple Silicon=arm64 / Intel=x64
case "$ARCH"   in arm64|x64|both)   ;; *) echo "✗ --arch 只能是 auto / arm64 / x64 / both（收到：${ARCH}）" >&2; exit 1 ;; esac
case "$TARGET" in dmg|zip|both|dir) ;; *) echo "✗ --target 只能是 dmg / zip / both / dir（收到：${TARGET}）" >&2; exit 1 ;; esac

# 缓存文件存在且 sha256 匹配（命中返回 0；--no-cache 时永远返回 1）
cached_ok() { [ "$NO_CACHE" = 0 ] && [ -s "$1" ] && [ "$(sha256_of "$1")" = "$2" ]; }

# 下载 → 校验 sha256 → 原子落位（.part 临时文件，失败不留半成品）
fetch_verified() { # url dest expected_sha
  local url="$1" dest="$2" expect="$3" tmp="$2.part"
  if ! curl -L --fail --progress-bar -o "$tmp" "$url"; then
    rm -f "$tmp"
    die "下载失败：${url}
  可换镜像后重试：
    export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
    export ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/"
  fi
  local got; got="$(sha256_of "$tmp")"
  if [ "$got" != "$expect" ]; then
    rm -f "$tmp"
    die "sha256 校验失败：$(basename "$dest")
  期望 ${expect}
  实际 ${got}"
  fi
  mv -f "$tmp" "$dest"
  ok "已下载并校验 $(basename "$dest")"
}

START_TS=$(date +%s)
step "配置  arch=${ARCH}  target=${TARGET}"

# ── 1. 后端依赖（electron/ 是独立 CommonJS 包，根 npm install 不装它的依赖）──
phase "1/5  后端依赖（electron/node_modules）"
if [ -d electron/node_modules/ws ]; then
  ok "electron/node_modules/ws 已就位"
else
  ok "缺少 ws → npm install --prefix electron"
  npm install --prefix electron
fi
phase_end

# ── 2. Electron 二进制缓存 ────────────────────────────────────────────────
# 缓存路径 = sha256(去掉文件名后的下载 URL)，规则来自 @electron/get 的 Cache。
# 校验值取自镜像的 SHASUMS256.txt，避免下到损坏/被篡改的文件。
ELEC_VER="$(node -p "require('./node_modules/electron/package.json').version")"
ELEC_DIR="$(node -e "const c=require('crypto'),os=require('os');const v=process.argv[1];const h=c.createHash('sha256').update('https://github.com/electron/electron/releases/download/v'+v).digest('hex');console.log(os.homedir()+'/Library/Caches/electron/'+h)" "$ELEC_VER")"
mkdir -p "$ELEC_DIR"
case "$ARCH" in both) ELEC_ARCHS="x64 arm64" ;; *) ELEC_ARCHS="$ARCH" ;; esac

phase "2/5  Electron 二进制缓存（${ELEC_VER}）"
SHASUMS="$(curl -L --fail -sS "${MIRROR_ELECTRON}v${ELEC_VER}/SHASUMS256.txt")" \
  || die "取不到 ${MIRROR_ELECTRON}v${ELEC_VER}/SHASUMS256.txt（检查镜像地址/网络）"
for A in $ELEC_ARCHS; do
  FILE="electron-v${ELEC_VER}-darwin-${A}.zip"
  SHA="$(printf '%s\n' "$SHASUMS" | awk -v f="$FILE" '$2==f || $2=="*"f {print $1; exit}')"
  [ -n "$SHA" ] || die "SHASUMS256.txt 中找不到 ${FILE}"
  if cached_ok "$ELEC_DIR/$FILE" "$SHA"; then
    ok "已缓存 ${FILE}（跳过）"
  else
    fetch_verified "${MIRROR_ELECTRON}v${ELEC_VER}/${FILE}" "$ELEC_DIR/$FILE" "$SHA"
  fi
done
phase_end

# ── 3. dmgbuild 工具包缓存（仅 dmg 目标需要）──────────────────────────────
if [ "$TARGET" = "both" ] || [ "$TARGET" = "dmg" ]; then
  DMG_REL="$(grep -oE 'dmg-builder@[0-9.]+' node_modules/dmg-builder/out/dmgUtil.js | head -1)"
  NODE_ARCH="$(node -p 'process.arch')"   # 用 node 架构，避免 Rosetta 下 uname 误判
  DMG_ARCH="$([ "$NODE_ARCH" = "arm64" ] && echo arm64 || echo x86_64)"
  DMG_FILE="$(grep -oE "dmgbuild-bundle-${DMG_ARCH}-[a-z0-9]+\.tar\.gz" node_modules/dmg-builder/out/dmgUtil.js | head -1)"
  DMG_SHA="$(grep -oE "\"${DMG_FILE}\": \"[a-f0-9]{64}\"" node_modules/dmg-builder/out/dmgUtil.js | grep -oE '[a-f0-9]{64}' | head -1)"
  { [ -n "$DMG_REL" ] && [ -n "$DMG_FILE" ] && [ -n "$DMG_SHA" ]; } || die "从 dmg-builder 源码取不到 dmgbuild 信息（依赖结构可能变了）"
  DMG_DIR="$HOME/Library/Caches/electron-builder/$DMG_REL"
  mkdir -p "$DMG_DIR"
  phase "3/5  dmgbuild 工具包缓存"
  if cached_ok "$DMG_DIR/$DMG_FILE" "$DMG_SHA"; then
    ok "已缓存 ${DMG_FILE}（跳过）"
  else
    fetch_verified "${MIRROR_BINARIES}${DMG_REL}/${DMG_FILE}" "$DMG_DIR/$DMG_FILE" "$DMG_SHA"
  fi
  phase_end
fi

# ── 4. 构建（只 vite build，不跑门禁）─────────────────────────────────────
# 清 dist/：vite 的 emptyOutDir:false ⇒ 旧哈希产物会累积并被打进包。
# 清 out/：electron-builder 不自动清输出目录 ⇒ 上次的架构/格式会残留（如 x64 产物）。
phase "4/5  构建（清 dist + out + vite build）"
rm -rf dist packing/mac/out
npx vite build
phase_end

# ── 5. 打包（CLI 直接指定 target / arch，覆盖 config 默认）───────────────
BUILD_ARGS=(--mac)
case "$TARGET" in dir) BUILD_ARGS+=(dir) ;; dmg) BUILD_ARGS+=(dmg) ;; zip) BUILD_ARGS+=(zip) ;; esac
BUILD_ARGS+=(--config packing/mac/electron-builder.yml)
case "$ARCH" in arm64) BUILD_ARGS+=(--arm64) ;; x64) BUILD_ARGS+=(--x64) ;; both) BUILD_ARGS+=(--x64 --arm64) ;; esac
phase "5/5  electron-builder ${BUILD_ARGS[*]}"
npx electron-builder "${BUILD_ARGS[@]}"
# 调试文件对使用者无用，删掉
rm -f packing/mac/out/builder-debug.yml
phase_end

# ── 汇总 ──────────────────────────────────────────────────────────────────
step "完成 → packing/mac/out/（总耗时 $(( $(date +%s) - START_TS )) 秒）"
ls -lh packing/mac/out/ | grep -vE '^total|^d' || true
