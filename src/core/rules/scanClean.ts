/**
 * 抓图候选清洗（原 `Yh`，`shared.js:23439-23536`）—— ★ 纯函数，必测（原则 7）
 *
 * ★ **它是什么**：`wp` 收到页面扫描结果之后、取图落盘**之前**的那一轮过滤 ——
 *   ① scope 白名单（默认只留画布）② 尺寸下限 ③ URL 清洗（广告 / 图标 / 非图片 / api）
 *   ④ 按「去掉查询串的规范化 url」**打分择优**（同一张图的多条候选只留最好的那条）。
 *   源有两轮扫描侧清洗：页内脚本 `hp`（`scanScripts.ts` 的 `buildLibraryScanScript`，本仓已落）
 *   ＋ **本文件这一轮**（此前未落 ⇒ panel / feed 的图会跟着入库）。
 *
 * ⚠️ **如实标注：打分少了两项**。源用 `max(w,h,dw,dh)` 与 `from ∈ {img,perf,img-data}`；
 *   本仓 `ScannedImage` 只带**一对** `natW/natH`、没有 `from` ⇒ 打分退化为
 *   「尺寸 ＋ 是图片扩展名 − 疑似缩略图」。**可见后果**：只在**极端并列**
 *   （同一 `origin+pathname` 的两条候选分数相同）时可能择优到不同那张 —— **过滤结果相同**。
 *
 * ⚠️ **本函数只做「选」，不做「改写」**：源 `Yh` 会把命中的 url 换成"剥掉 CDN 处理参数"的版本，
 *   本仓**保留原对象**（`ScannedImage.ref` 是按原 url 落的盘，`url` 只作溯源与命名）——
 *   规范化 url **仅用于择优分组**（源正是这么用 `y` 的）。
 *
 * ⚠️ 本模块**不 import `core/ports`**（那会与「端口 → rules」的方向成环）⇒ 自带输入形状。
 */

// ★ `minSide` 的默认值 = 源的 `aa`（`:22630`，96）—— 与 `Dc`（`isLovartJunk`）**同一个常量**
//   ⇒ 复用既有真源，不再写第二份 96。
import { LOVART_MIN_SIDE } from './lovartGallery';
import { isRecord } from '@/lib/object';
import { normalizeUrl } from '@/lib/url';

/**
 * 清洗的输入形状（**结构性** —— `ScannedImage` 天然满足它）
 * ⚠️ `scope` 故意写 `string`：`ScanScope` 的真源在同层 `scanChain.ts`，此处不引端口的转发类型。
 */
export interface ScannableImage {
  url: string;
  /** 页内脚本打的区域标签（`canvas` / `panel` / `feed` / `site`） */
  scope?: string;
  /** 固有宽高（缺省视作 0 —— 原 `l.w || 0`） */
  natW?: number;
  natH?: number;
}

/** 默认作用域（原 `zs.CANVAS`，`:22631`）—— 只要画布图 */
export const SCAN_CLEAN_DEFAULT_SCOPE = 'canvas';
/** scope 缺省值（原 `zs.SITE`，`:23448`） */
const SCAN_SITE = 'site';

// ── URL 特征正则（原 `Ad` / `YM` / `Id` / `Iy` / `uk`，`:23307-23311`，逐字）────────────

/** 一眼即废的 URL 特征（图标 / 头像 / 占位 / 追踪 / 广告，原 `Ad`） */
const AD_LIKE =
  /(logo|icon|favicon|avatar|sprite|placeholder|loading|spinner|blank|1x1|pixel|emoji|flag|badge|watermark_?tip|qrcode|qr_?code|skeleton|default_?cover|share_?icon|googleads|doubleclick|facebook|bing|yandex|pinterest|analytics|conversion|tag_exp|gtm|adsct|tracking)/i;

/** **非**图片扩展名（原 `YM`） */
const NOT_IMAGE_EXT = /\.(js|mjs|cjs|css|json|html?|xml|txt|map|wasm|woff2?|ttf|otf|eot)($|\?)/i;

/** 图片扩展名（原 `Id`） */
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif|bmp|tiff?|heic|heif)(\?|#|$)/i;

/** 缩略图特征（原 `Iy`） */
const THUMB_LIKE = /(thumb|thumbnail|small|mini|preview|lowres|_s\.|_xs\.|_sm\.)/i;

/** CDN 图像处理参数名（原 `uk`） */
const CDN_PROCESS_PARAM =
  /^(x-oss-process|imageMogr2|imageView2|imageView|imgaot|image_process|resize|quality|thumbnail|thumb|w|h|width|height|q)(\/|$)/i;

/** 小尺寸候选：URL 里带 `w=<2~3 位>` 这类"缩略图参数"（原 `Yh` 的内联正则） */
const THUMB_WIDTH_PARAM = /[?&]w=\d{2,3}(&|$)/;
/** `/api/` 路径判定（原 `Yh` 的内联正则） */
const API_PATH = /\/api\//i;

/**
 * 该 URL 是否**只带** CDN 处理参数（原 `XM`，`:23312`）
 * ⚠️ 任一 query key 命中 `uk` 即 true（源就是"存在即真"，不是"全是"）。
 */
function hasCdnProcessParam(url: string): boolean {
  try {
    const u = new URL(url);
    for (const k of u.searchParams.keys()) {
      if (CDN_PROCESS_PARAM.test(k)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** 剥掉 CDN 处理参数（原 `JM`，`:23325`）；**没剥到任何参数 ⇒ 返回 `''`**（源即如此） */
function stripCdnProcessParams(url: string): string {
  try {
    const u = new URL(url);
    let removed = false;
    for (const k of Array.from(u.searchParams.keys())) {
      if (CDN_PROCESS_PARAM.test(k)) {
        u.searchParams.delete(k);
        removed = true;
      }
    }
    return removed ? u.toString() : '';
  } catch {
    return '';
  }
}

/**
 * 清洗扫描候选（原 `Yh`）
 *
 * @returns `items` = 选中的原对象（按分**降序**）· `skipped` = 被滤掉的条数
 *   ⚠️ 源的 `Yh` **不返回计数**（它把"滤掉多少"交给调用方算，只进提示文案）；本仓的
 *   `ScanResult.skipped` 语义正是"扫描阶段跳过"，故在此累加（如实标注这处口径差异）。
 */
export function cleanScannedImages<T extends ScannableImage>(
  items: readonly T[],
  opts: { minSide?: number; allowedScopes?: readonly string[] } = {},
): { items: T[]; skipped: number } {
  const minSide = typeof opts.minSide === 'number' ? opts.minSide : LOVART_MIN_SIDE;
  const allowed =
    Array.isArray(opts.allowedScopes) && opts.allowedScopes.length > 0
      ? new Set<string>(opts.allowedScopes)
      : new Set<string>([SCAN_CLEAN_DEFAULT_SCOPE]);

  /** 规范化键 → 目前最高分的那条（原 `Map s`） */
  const best = new Map<string, { item: T; score: number }>();
  const list = Array.isArray(items) ? items : [];
  let skipped = 0;

  for (const it of list) {
    if (!it || !it.url) {
      skipped += 1;
      continue;
    }
    // 原：`const c = l.scope || zs.SITE; if (!r.has(c)) continue;`
    if (!allowed.has(it.scope || SCAN_SITE)) {
      skipped += 1;
      continue;
    }

    // 原：`const u = l.kind || (blob:/data:/http 推断)`
    const kind = /^blob:/i.test(it.url) ? 'blob' : /^data:/i.test(it.url) ? 'data' : 'http';
    // ⚠️ 源取 `max(w,h,dw,dh)`；本仓只有一对固有尺寸 ⇒ 等价于只取 `max(natW, natH)`
    const side = Math.max(it.natW || 0, it.natH || 0);
    if (minSide > 0 && side > 0 && side < minSide) {
      skipped += 1;
      continue;
    }

    let key: string;
    let suspectThumb = false;
    let scored = it.url;

    if (kind === 'http') {
      let u: URL;
      try {
        u = new URL(it.url);
      } catch {
        skipped += 1;
        continue;
      }
      // 原：非 http(s) ｜ Ad 命中 path/host/search ｜ YM 命中 path ｜ (/api/ 且非图片扩展名且无尺寸)
      if (
        (u.protocol !== 'http:' && u.protocol !== 'https:') ||
        AD_LIKE.test(u.pathname) ||
        AD_LIKE.test(u.hostname) ||
        AD_LIKE.test(u.search) ||
        NOT_IMAGE_EXT.test(u.pathname) ||
        (API_PATH.test(u.pathname) && !IMAGE_EXT.test(u.pathname) && side === 0)
      ) {
        skipped += 1;
        continue;
      }
      suspectThumb =
        THUMB_LIKE.test(u.pathname) || (!IMAGE_EXT.test(u.pathname) && THUMB_WIDTH_PARAM.test(u.search));
      if (hasCdnProcessParam(it.url)) {
        const stripped = stripCdnProcessParams(it.url);
        if (stripped) {
          scored = stripped;
          try {
            u = new URL(stripped);
          } catch {
            // catch-ok: `stripped` 由 `URL.toString()` 产出 ⇒ 必然可解析（此分支不可达）；
            // 与源 `try { C = new URL(S) } catch {}` 同法（换不成就沿用旧的 `C`）。
          }
          suspectThumb = THUMB_LIKE.test(u.pathname);
        }
      }
      // 原：`y = 'http:' + C.origin + C.pathname` —— **砍掉查询串**
      key = `http:${u.origin}${u.pathname}`;
    } else {
      // 原：`y = u + ':' + l.url.slice(-96)`
      key = `${kind}:${it.url.slice(-96)}`;
    }

    // 打分（原 `k`）—— ⚠️ 缺 `from` 两项（本仓 `ScannedImage` 无该字段），见文件头标注
    let score = side;
    if (kind === 'http' && IMAGE_EXT.test(scored)) score += 40;
    if (suspectThumb) score -= 400;
    if (kind !== 'http') score += 120;

    const prev = best.get(key);
    if (!prev || score > prev.score) best.set(key, { item: it, score });
  }

  const picked = [...best.values()].sort((a, b) => b.score - a.score).map((x) => x.item);
  return { items: picked, skipped };
}

/**
 * 已见过滤（原 `wp:32588-32591` 的 `x`）—— **取图落盘之前**滤掉"已在库 / 已取过"的候选
 *
 * 源：`x = b.filter(M => (!n || !n.has(M.url) && !n.has(U)) && (!r || !r.has(M.url) && !r.has(U)))`
 *   —— `U = Si(M.url)`（= `normalizeUrl`）· `n` = `seen`（本会话已取）· `r` = `haveUrls`（画廊已在库）。
 *
 * ⚠️ **它必须在取图之前**：源的顺序是 `Yh` → 本过滤 → `slice(limit)` → **逐张取图**（`Lc`）。
 *   本仓取图在适配器内 ⇒ 由 `adapters/site/shared/materializeScan.ts` 在**落盘之前**调用它
 *   （此前只靠落库方 `addLovartImages` 事后按 `dataUrl`/`sourceUrl` 去重 ⇒ **重复下载照样发生**：
 *   值守每轮、手动每次都会把已在库的图重下一遍）。
 * ⚠️ **形状不合法**（非对象 / 无 `url`）的条目**原样放行** —— 那不是"已见"，交给落盘那一步照旧计数。
 * ⚠️ 两侧都规范化（源往 `seen` 里同时塞 `M.url` 与 `Si(M.url)`，`wp:32595-32599`）——
 *   否则"同一张图带不带查询串"会判成两条。
 */
export function excludeSeenImages<T>(
  items: readonly T[],
  seenUrls?: readonly string[],
): { items: T[]; skipped: number } {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0 || !seenUrls || seenUrls.length === 0) {
    return { items: [...list], skipped: 0 };
  }
  const seen = new Set<string>();
  for (const u of seenUrls) {
    if (typeof u !== 'string' || !u) continue;
    seen.add(u);
    seen.add(normalizeUrl(u));
  }
  let skipped = 0;
  const kept = list.filter((it) => {
    const url = isRecord(it) && typeof it.url === 'string' ? it.url : '';
    if (!url) return true;
    if (!seen.has(url) && !seen.has(normalizeUrl(url))) return true;
    skipped += 1;
    return false;
  });
  return { items: kept, skipped };
}
