# =============================================================================
# packing/icon.ps1 —— 图标流水线（源 PNG → 压缩 PNG + Windows ICO + macOS ICNS）
#
# 【为什么不用 pngquant / sharp / ImageMagick】
#   本仓不引新依赖（且那几个都要额外二进制）。只用 Windows 自带
#   `System.Drawing`（.NET GDI+）即可完成：高质量缩放 + PNG 编码 + ICO/ICNS 容器封装。
#
# 【产出】packing/assets/（**两平台共用**）
#   icon.png    —— 压缩后的主图标（默认 512×512，32bpp 带 alpha）
#   icon.ico    —— Windows 多尺寸（默认 16/24/32/48/64/128/256，PNG 压缩条目）
#   icon.icns   —— macOS 多尺寸（ic07/08/09/10/11/12/13/14，PNG 载荷）
#
# 【用法】（⚠️ 源路径含中文，故由调用方传入，脚本内**不含中文字面量** —— 避免
#   PowerShell 5.1 读 UTF-8 无 BOM 脚本时把中文解码成乱码）
#   powershell -NoProfile -ExecutionPolicy Bypass -File packing/icon.ps1 -Source "画布网站图标.png"
#   或：npm run icon
#
# 【容器格式备忘】
#   ICO ：ICONDIR(6) + N×ICONDIRENTRY(16) + N 段载荷；256 的宽高单字节写 0。
#   ICNS：magic 'icns' + 总长(BE) + N×(type(4) + 段长(BE, 含 8 字节头) + PNG 载荷)。
# =============================================================================

[CmdletBinding()]
param(
  # 源图（必填；相对路径按当前工作目录解析）
  [Parameter(Mandatory = $true)][string]$Source,
  # 产出目录（默认 packing/assets）
  [string]$OutDir,
  # 主 PNG 边长
  [int]$PngSize = 512,
  # ICO 内含的尺寸
  [int[]]$IcoSizes = @(16, 24, 32, 48, 64, 128, 256),
  # ICNS 最大档位（默认 512 —— GDI+ 的 1024 档单张就 ~2MB；
  # 要 Retina 极致清晰可传 -IcnsMaxSize 1024，代价是 icns 涨到 ~3.1MB）
  [int]$IcnsMaxSize = 512
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

if (-not $OutDir) { $OutDir = Join-Path $PSScriptRoot 'assets' }

$srcPath = (Resolve-Path -LiteralPath $Source).Path
$srcInfo = Get-Item -LiteralPath $srcPath
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$tmpDir = Join-Path $OutDir '_icon-tmp'
New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null

$src = [System.Drawing.Image]::FromFile($srcPath)
Write-Host ("源   : {0}  ({1} x {2}, {3} 字节)" -f $srcInfo.Name, $src.Width, $src.Height, $srcInfo.Length)

# ── 高质量缩放并另存为 PNG（32bpp 带 alpha）───────────────────────────────
function Resize-ToPng {
  param([System.Drawing.Image]$Image, [int]$Size, [string]$Path)
  $bmp = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.DrawImage($Image, 0, 0, $Size, $Size)
  $g.Dispose()
  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

# ① 压缩后的主 PNG（macOS 的 electron-builder 也接受 ≥512 的 PNG）
$pngPath = Join-Path $OutDir 'icon.png'
Resize-ToPng -Image $src -Size $PngSize -Path $pngPath

# ② Windows ICO
# ⚠️ 别把这些字节流经 PowerShell 函数返回（byte[] 会被展开成逐元素流 ⇒ 载荷写坏，
#    实测 ico 塌成 125 字节）。一律「落盘 → ReadAllBytes」直接用。
$icoEntries = @()
foreach ($s in $IcoSizes) {
  $p = Join-Path $tmpDir ("ico-{0}.png" -f $s)
  Resize-ToPng -Image $src -Size $s -Path $p
  $icoEntries += [pscustomobject]@{ Size = $s; Bytes = [System.IO.File]::ReadAllBytes($p) }
}

$icoPath = Join-Path $OutDir 'icon.ico'
$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($ms)
$bw.Write([UInt16]0)                 # reserved
$bw.Write([UInt16]1)                 # type = icon
$bw.Write([UInt16]$icoEntries.Count) # count
$offset = 6 + 16 * $icoEntries.Count
foreach ($e in $icoEntries) {
  $dim = if ($e.Size -ge 256) { 0 } else { $e.Size }   # 256 在单字节字段里写 0
  $bw.Write([byte]$dim); $bw.Write([byte]$dim)          # width / height
  $bw.Write([byte]0); $bw.Write([byte]0)                # colorCount / reserved
  $bw.Write([UInt16]1); $bw.Write([UInt16]32)           # planes / bitCount
  $bw.Write([UInt32]$e.Bytes.Length)                    # bytesInRes
  $bw.Write([UInt32]$offset)                            # imageOffset
  $offset += $e.Bytes.Length
}
foreach ($e in $icoEntries) { $bw.Write($e.Bytes) }
$bw.Flush()
[System.IO.File]::WriteAllBytes($icoPath, $ms.ToArray())
$bw.Dispose(); $ms.Dispose()

# ③ macOS ICNS（PNG 载荷；type 与尺寸的对应是 Apple 固定表）
#   ic11=32(16@2x) ic12=64(32@2x) ic07=128 ic13=256(128@2x)
#   ic08=256       ic14=512(256@2x) ic09=512 ic10=1024(512@2x)
$icnsMap = [ordered]@{
  'ic11' = 32; 'ic12' = 64; 'ic07' = 128; 'ic13' = 256
  'ic08' = 256; 'ic14' = 512; 'ic09' = 512; 'ic10' = 1024
}
$icnsChunks = @()
foreach ($t in $icnsMap.Keys) {
  if ($icnsMap[$t] -gt $IcnsMaxSize) { continue }   # 超出上限的档位不生成
  $p = Join-Path $tmpDir ("icns-{0}.png" -f $t)
  Resize-ToPng -Image $src -Size $icnsMap[$t] -Path $p
  $icnsChunks += [pscustomobject]@{ Type = $t; Bytes = [System.IO.File]::ReadAllBytes($p) }
}

$icnsPath = Join-Path $OutDir 'icon.icns'
# ⚠️ ICNS 的长度字段是**大端**（BE），而 BinaryWriter.Write(UInt32) 写的是**小端** ⇒
#    必须手写 BE32；否则容器头是坏的（实测：声明总长读成 114430720，全表错位）。
#    对照：ICO 恰恰是小端 —— 同一份脚本里两种字节序，别抄错。
function Write-BE32 {
  param([System.IO.BinaryWriter]$W, [uint32]$V)
  $W.Write([byte](($V -shr 24) -band 0xFF))
  $W.Write([byte](($V -shr 16) -band 0xFF))
  $W.Write([byte](($V -shr 8) -band 0xFF))
  $W.Write([byte]($V -band 0xFF))
}

$ms2 = New-Object System.IO.MemoryStream
$bw2 = New-Object System.IO.BinaryWriter($ms2)
$bw2.Write([System.Text.Encoding]::ASCII.GetBytes('icns'))
$total = 8
foreach ($c in $icnsChunks) { $total += 8 + $c.Bytes.Length }
Write-BE32 -W $bw2 -V ([uint32]$total)                # 总长（含 8 字节头）
foreach ($c in $icnsChunks) {
  $bw2.Write([System.Text.Encoding]::ASCII.GetBytes($c.Type))
  Write-BE32 -W $bw2 -V ([uint32](8 + $c.Bytes.Length))  # 段长（含 8 字节段头）
  $bw2.Write($c.Bytes)
}
$bw2.Flush()
[System.IO.File]::WriteAllBytes($icnsPath, $ms2.ToArray())
$bw2.Dispose(); $ms2.Dispose()

Remove-Item -Recurse -Force $tmpDir
$src.Dispose()

# ④ 报告（含压缩比）
$before = $srcInfo.Length
foreach ($f in @($pngPath, $icoPath, $icnsPath)) {
  $i = Get-Item -LiteralPath $f
  Write-Host ("产出 : {0}  ({1} 字节)" -f $i.Name, $i.Length)
}
$after = (Get-Item -LiteralPath $pngPath).Length
Write-Host ("主 PNG 压缩比: {0:N0} -> {1:N0} 字节  (降 {2:P0})" -f $before, $after, (1 - $after / $before))
