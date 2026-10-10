/**
 * 纯规则出口（core/rules）—— ★ 全部是纯函数，全部必测（§6.5 原则 7）
 *
 * 已实现：
 *   failure.ts    —— 失败分类（f3/p3/h3 三表 + `_S` 分类 + `g3` 决策）      [M0]
 *   graph.ts      —— 连线环检测（`r$`）+ referenceOrder 维护                 [M2]
 *   node.ts       —— 8 类节点不变量校验                                      [M2]
 *
 * 待实现：
 *   dedupe.ts     —— 去重（精确哈希 + 感知哈希 ≤8 / 占位图 ≤6）              [M3]
 *   prompt.ts     —— 提示词组装 + 幂等剥离 + 风格拼接                        [M5]
 *   fingerprint.ts—— 跨账号指纹撞车检测（7 维比较 + 分级）                   [M6]
 *   facemask.ts   —— 遮脸 / 马赛克 / 外扩算法                                [M3]
 */

export * from './failure';
export * from './graph';
export * from './node';
export * from './undo';
export * from './dedupe';
export * from './facemask';
export * from './prompt';
export * from './payload';
export * from './accountPool';
export * from './fingerprint';
export * from './scanChain';
export * from './project';
// ── M9 新增（回源抄录的纯规则）──
export * from './replyKind';
export * from './license';
export * from './sendGuard';
export * from './genProgress';
export * from './refs';
export * from './recipe';
export * from './proxy';
export * from './media';
export * from './faceDetect';
export * from './accountPick';
