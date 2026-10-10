// ============================================================
// API 接入 · 类型契约（JSDoc，仅文档用途，无运行时逻辑）
// ------------------------------------------------------------
// 设计要点见 docs/API接入功能-实现方案.md：
//   · 所有第三方请求只在主进程发出（无 CORS、可走代理、密钥不过桥）；
//   · 每个服务商一个 ProviderAdapter，全部解析函数是纯函数（body 进 / 结构出），
//     可用 fixture 直接跑 node:test；
//   · job-manager 只认统一输出，不感知任何具体服务商。
// ============================================================

/**
 * 设置页 / 生成面板动态表单的字段描述（schema 驱动，新服务商零 UI 代码）。
 * @typedef {Object} ParamField
 * @property {string} key                       参数键（写入 config.params / 提交 params）
 * @property {string} label                     中文标签
 * @property {('select'|'number'|'text')} type  控件类型
 * @property {{value:string,label:string}[]} [options]  select 的可选项
 * @property {number} [min] / number [max]      number 的范围
 * @property {*} [default]                      默认值
 */

/**
 * 提交阶段参数（渲染层传来，已经过 schema 校验）。
 * @typedef {Object} SubmitInput
 * @property {object} config   provider 配置（含已解密 apiKey）
 * @property {('image'|'video')} kind
 * @property {object} params   paramSchema 对齐的参数
 * @property {string} prompt   提示词正文
 * @property {string[]} refPaths 参考图：本地绝对路径 / img:// 引用 / http(s) 直链
 */

/**
 * 轮询/查询阶段的统一输出。
 * @typedef {Object} PollOutcome
 * @property {('running'|'succeeded'|'failed')} status
 * @property {number} [progress]  0..100（可选）
 * @property {{type:('image'|'video'), url?:string, b64?:string, mime?:string}[]} [results]
 * @property {{kind:string, message:string, advice?:string}} [error]
 */

/**
 * 服务商适配器。注册进 registry 后，引擎 / 设置页 / 生成面板全部自动获得该服务。
 * @typedef {Object} ProviderAdapter
 * @property {string} id
 * @property {string} name
 * @property {('image'|'video')[]} capabilities
 * @property {ParamField[]} paramSchema
 * @property {object} defaults   baseUrl / model 等默认配置（用户未覆盖时使用）
 * @property {({config, kind, params, prompt, refPaths}) => {url:string, headers:object, body:string}} buildSubmit
 * @property {(body:object) => {taskId?:string, results?:{url?:string,b64?:string,mime?:string}[]}} parseSubmit
 * @property {({config, taskId}) => {url:string, headers:object}} [buildPoll]
 * @property {(body:object) => PollOutcome} parsePoll
 * @property {({config}) => Promise<{ok:boolean, message:string}>} [testConnection]
 */

module.exports = {};
