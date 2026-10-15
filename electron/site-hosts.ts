/**
 * 站点域名真相（**electron 侧唯一**）—— 层 1「域名表」+ 层 2「归属判定」
 *
 * ── 为什么存在（2026-10-14 收口）────────────────────────────────────────────
 * 「豆包／dola 系域名」这件事此前在 electron/ 里散成 **5 个中心**：
 *   · `dola-media.js` 的 `SOURCE_HOSTS`（双源定义）
 *   · `dola-media.js` 的 `ATTACH_HOSTS`（**又一串同样的字面量**）
 *   · `dola-media.js` 的 `FALLBACK_API_ROOT_HOSTS`（源主域重抄一遍）
 *   · `main.js` 的 `findWebviewSessionForUrl`（3 遍内联子串判定 + 源主域三目）
 *   · `dola-duration-main.js`（页面脚本，3 处内联 —— **跨世界，够不着**）
 * ⇒ 收成 **一个模块 + 明确分层**：本文件只放「域名是什么」与「某个 host 归哪个源」。
 *
 * ── 分层（**"不能收口"的要有层界，不是继续散着**）──────────────────────────
 *   层 1 · 域名真相      → 本文件的 `SITE_HOSTS`（**唯一**：每个源一个主域）
 *   层 2 · 归属判定      → 本文件的 `normalizeHost` / `hostOfUrl` / `isHostOf` / `sourceOfHost` / `isKnownHost`
 *                          （纯函数，**只由层 1 派生**；子域规则 `host.endsWith('.' + base)` 的唯一实现）
 *   层 3 · 用途策略      → **各自领域**，只引用层 1／2，**不再自己抄域名**：
 *                          · 挂 CDP debugger 的边界 → `dola-media.js` 的 `ATTACH_SOURCES`（**按源声明**）
 *                          · 媒体 URL → 来源推断 → `dola-media.js` 的 `mediaSourceOfUrl`
 *                          · 找可继承 cookie 的 webview → `main.js` 的 `findWebviewSessionForUrl`
 *                          · 允许回源的 fallback api 主机 → `dola-media.js` 的 `FALLBACK_API_ROOT_HOSTS`
 *                            （**额外的 CDN/接口域**，语义独立，但源主域**引用层 1**）
 *   跨世界 · 页面注入脚本 → `dola-duration-main.js` **不写域名**：
 *                          由宿主（`main.js` 的 `inject-dola-duration-main`）把层 1 **当参数注入**
 *                          （注入脚本不能 require ⇒ 传参是唯一"零镜像"的做法）
 *
 * ⚠️ **本模块不是"通用站点表"**：只登记**主进程要判归属**的那两个源（豆包／dola）。
 *    前端站点 URL（`SitePort.chatUrl` / `SITE_LOGIN_URL`）在渲染层，回答的是**别的**问题
 *    （会话页 / 登录页地址），**不要往这里搬**。
 */

/**
 * 层 1 · 每源主域（**唯一** —— 加源只改这一处）。
 * 类型写成 `Readonly<Record<string, string>>`：`isHostOf` 用**变量**当下标查它（`SITE_HOSTS[source]`）。
 */
const SITE_HOSTS: Readonly<Record<string, string>> = Object.freeze({
  dola: 'dola.com',
  doubao: 'doubao.com',
});

/**
 * 层 2 · host 归一化（去 `www.` 前缀 + 去尾点 + 小写）—— **唯一实现**
 *
 * ⚠️ 三个动作都保留自有出处：`www.` 前缀与大小写是三个原调用点各自的写法；
 *    **尾点**（`doubao.com.` 这种合法 FQDN 写法）来自 `dola-media.safeGetHost` 的 `.replace(/\.$/, '')`
 *    —— 少这一条会把带尾点的 host 判成"不认识"（原先判得对、改后判错 = 回归）。
 */
function normalizeHost(raw: unknown): string {
  return String(raw || '')
    .replace(/^www\./i, '')
    .replace(/\.$/, '')
    .toLowerCase();
}

/**
 * 层 2 · 从**任意 URL 字符串**取 host（非法 ⇒ 空串 —— 不抛，调用方按"不认识"处理）
 *
 * ⚠️ 为什么必须有它：`isHostOf` 收的是 **host**，而调用方手上的多是**整条 URL**
 *    （历史实现直接在 URL 上做 `includes('doubao.com')` —— 那会把
 *    `https://evil.test/?u=doubao.com` 也判成豆包）。必须**先取 host 再判**。
 */
function hostOfUrl(rawUrl: unknown): string {
  try {
    return new URL(String(rawUrl)).hostname;
  } catch {
    return '';
  }
}

/** 层 2 · 某个 host 是不是某个源（含子域；`source` 未知 ⇒ 查不到 ⇒ `false`） */
function isHostOf(host: unknown, source: string): boolean {
  const base = SITE_HOSTS[source];
  if (!base) return false;
  const h = normalizeHost(host);
  return h === base || h.endsWith(`.${base}`);
}

/** 层 2 · 某 host 归哪个源（不认识 ⇒ 空串 —— **不编默认值**，由层 3 决定怎么处置） */
function sourceOfHost(host: unknown): string {
  for (const source of Object.keys(SITE_HOSTS)) {
    if (isHostOf(host, source)) return source;
  }
  return '';
}

/** 层 2 · 是不是"我们认识的源域"（不认识 ⇒ `false`） */
function isKnownHost(host: unknown): boolean {
  return sourceOfHost(host) !== '';
}

export { SITE_HOSTS, normalizeHost, hostOfUrl, isHostOf, sourceOfHost, isKnownHost };
