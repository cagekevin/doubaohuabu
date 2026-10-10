/**
 * 风格预设（★ SSOT：内置 10 条）
 * 依据：docs/07-领域规则.md §二（原 `vp` shared.js:26400-26440，逐条对照）
 *
 * 规则：风格 = **纯前缀拼接**（不是替换）；多选按 styleIds[] 顺序依次拼；
 *      持久化在 `doubao-styles`（LS_STYLES）；缺省即回落到本表。
 */

export interface StylePreset {
  id: string;
  name: string;
  /** 纯前缀，拼接在正文前 */
  prefix: string;
}

export const DEFAULT_STYLE_PRESETS: readonly StylePreset[] = [
  {
    id: 'sty-def-90s-anime',
    name: '90年代日式动画',
    prefix: '90年代日式动画风格，赛璐璐上色，柔和颗粒感，',
  },
  {
    id: 'sty-def-guofeng-2d',
    name: '国风二次元',
    prefix: '国风二次元插画风格，工笔线条，青绿山水配色，',
  },
  {
    id: 'sty-def-flat',
    name: '扁平设计',
    prefix: '扁平矢量插画风格，纯色大平涂，简约几何，',
  },
  {
    id: 'sty-def-urban',
    name: '都市浪漫',
    prefix: '都市浪漫写实风格，夜景霓虹，浅景深，',
  },
  {
    id: 'sty-def-anime-3d',
    name: '3D 二次元渲染',
    prefix: '3D 二次元渲染风格，次世代卡通材质，柔和打光，',
  },
  {
    id: 'sty-def-clay',
    name: '黏土定格',
    prefix: '黏土定格动画风格，真实黏土质感，手作痕迹，',
  },
  {
    id: 'sty-def-cyber-guofeng',
    name: '国风赛博',
    prefix: '国风赛博朋克风格，水墨与霓虹融合，高对比，',
  },
  {
    id: 'sty-def-real-urban',
    name: '写实现代都市',
    prefix: '写实电影感都市风格，自然光，真实材质，',
  },
  {
    id: 'sty-def-fashion',
    name: '写实时尚都市',
    prefix: '写实时尚杂志风格，高级灰调，硬光轮廓，',
  },
  {
    id: 'sty-def-ancient',
    name: '写实古风',
    prefix: '写实古风电影风格，暖调侧光，胶片颗粒，',
  },
];
