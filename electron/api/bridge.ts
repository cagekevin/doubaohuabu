// ============================================================
// API 接入域 · 装配 + IPC 自注册（本域唯一门面）
// ------------------------------------------------------------
// 为什么住这里：配置存储 / 任务引擎 / 传输双栈 / 事件推送 / 12 个 handler 全是
//   **本域装配细节**，宿主壳不该知情（`TD-13-24` 同族）。
//
// ★ **依赖注入**（域**不反向** require 宿主壳）：
//   · `getMainWindow`  —— 任务事件回推到渲染层（`api-job-event`）
//   · `resolveImageRef` —— `img://` → 本地绝对路径（属存储/媒体域，本域不实现）
//
// ★ 字段面（§5.2 的摊派）：本文件的 12 个 handler 的回执形状**就地**用局部类型写清；
//   频道表的 `ret` 统一在 **B4** 填（那时 bridge ＋ main 的 handler 全在、渲染层面也同批换）
//   —— 免得同一张表被分两趟读两遍。
// ============================================================

import fs from 'fs';
// `safeStorage` 从 electron 模块取（源的写法：`require('electron').safeStorage`）
import { app, net, safeStorage } from 'electron';
import { handle } from '../ipc';
import { createConfigStore, maskKey } from './config-store';
import { createJobManager } from './job-manager';
import * as apiRegistry from './registry';
import { adapter as volcengineArk } from './providers/volcengine-ark';
import { adapter as geeknowRelay } from './providers/geeknow-relay';
import { adapter as vidu } from './providers/vidu';
import { adapter as kling } from './providers/kling';
import { adapter as llmOpenAiCompat } from './providers/llm-openai-compat';
import { asRecord } from './shape';
import type { FetchLike, ProviderAdapter } from './types';


/** 宿主壳注入的两个能力（域不反向依赖它） */
interface ApiBridgeDeps {
  /** 任务事件回推用；窗口可能已被销毁/尚未创建 ⇒ 允许返回 null */
  getMainWindow: () => { isDestroyed(): boolean; webContents: { send(channel: string, payload: unknown): void } } | null;
  /** `img://` 引用 → 本地绝对路径（由宿主壳的存储/媒体域实现） */
  resolveImageRef: (ref: string) => string | null;
}

/** 回执：所有 handler 统一带 `ok`（失败另带 `error`，成功带各自载荷） */
interface OkReply {
  ok: true;
  [k: string]: unknown;
}
interface FailReply {
  ok: false;
  error?: string;
  message?: string;
}

// 新接入一个服务 = 一个 provider 文件 + 这里 registerProvider 一行
// ⚠️ 取具名导出 `.adapter`（5 个 provider 已转 TS，导出形状从「单值 module.exports」改成具名导出）
apiRegistry.registerProvider(volcengineArk);
apiRegistry.registerProvider(geeknowRelay); // 中转聚合（Stage B）
apiRegistry.registerProvider(vidu); // Vidu 官方直连（Stage D · 含首尾帧）
apiRegistry.registerProvider(kling); // 可灵官方直连（Stage E · JWT 自签）
apiRegistry.registerProvider(llmOpenAiCompat); // LLM 通道（Stage F · 与生成隔离）

let _apiConfigStore: ReturnType<typeof createConfigStore> | null = null;
let _apiJobManager: ReturnType<typeof createJobManager> | null = null;

/**
 * ★ **域唯一门面**：宿主壳只说「初始化 API 接入域」。
 * 幂等 —— `whenReady` 可能与窗口重建并发触发一次以上。
 */
function initApi({ getMainWindow, resolveImageRef }: ApiBridgeDeps): void {
  if (_apiJobManager) return;
  try {
    _apiConfigStore = createConfigStore(app.getPath('userData'), safeStorage);
    const configStore = _apiConfigStore;

    // img:// 引用 → 本地绝对路径；http(s)/data:/绝对路径 透传（buildSubmit 自己再编码）
    const resolveRefPath = (ref: unknown): string => {
      try {
        if (typeof ref !== 'string' || !ref) return '';
        if (ref.startsWith('img://')) return resolveImageRef(ref) || '';
        if (/^https?:\/\//i.test(ref) || ref.startsWith('data:') || fs.existsSync(ref)) return ref;
        return '';
      } catch {
        return '';
      }
    };

    // 传输双栈（引擎 v2）：优先 Chromium 栈 net.fetch（吃系统代理/企业网络环境），
    // 网络层失败自动降级 Node undici 栈 —— 哪条通走哪条。
    const apiTransports: FetchLike[] = [];
    try {
      if (net && typeof net.fetch === 'function') apiTransports.push(net.fetch.bind(net) as FetchLike);
    } catch {
      /* 非 Electron 运行环境忽略 */
    }
    if (typeof globalThis.fetch === 'function') apiTransports.push(globalThis.fetch.bind(globalThis));

    _apiJobManager = createJobManager({
      configStore,
      registry: apiRegistry,
      resolveRefPath,
      transports: apiTransports,
      onEvent: (snap) => {
        try {
          // 成功出片 → 今日额度计数 +1（密钥/引擎均不涉及，纯本地统计）
          const s = asRecord(snap);
          if (s['status'] === 'done') {
            try {
              configStore.incrementUsage(s['kind']);
            } catch {
              /* 计数失败不影响主流程 */
            }
          }
          const win = getMainWindow && getMainWindow();
          if (win && !win.isDestroyed()) {
            win.webContents.send('api-job-event', snap);
          }
        } catch {
          /* 推送失败不影响引擎 */
        }
      },
    });

    // ---- 服务商元信息（无密钥）----
    handle('api-providers:list', async (): Promise<OkReply> => {
      return { ok: true, providers: apiRegistry.listProvidersMeta() };
    });

    // ---- 配置读取（密钥脱敏）----
    handle('api-config:get', async (): Promise<OkReply> => {
      const configs: Record<string, unknown> = {};
      for (const id of apiRegistry.listProviderIds()) {
        // 断言：id 来自 `listProviderIds()`（源是直接传值，未判空）
        const adapter = apiRegistry.getProvider(id) as ProviderAdapter;
        configs[id] = configStore.publicOf(adapter);
      }
      return { ok: true, providers: apiRegistry.listProvidersMeta(), configs };
    });

    // ---- 配置更新（baseUrl/model/params/enabled；不含密钥）----
    handle('api-config:set', async (_e, providerId, patch): Promise<OkReply | FailReply> => {
      const adapter = apiRegistry.getProvider(String(providerId));
      if (!adapter) return { ok: false, error: `未知服务商 ${String(providerId)}` };
      const pub = configStore.updateProviderConfig(adapter, patch);
      return { ok: true, config: pub };
    });

    // ---- 保存密钥（加密落盘）----
    handle('api-config:set-key', async (_e, providerId, key): Promise<OkReply | FailReply> => {
      const adapter = apiRegistry.getProvider(String(providerId));
      if (!adapter) return { ok: false, error: `未知服务商 ${String(providerId)}` };
      const r = configStore.setApiKey(adapter, key);
      if (!r.ok) return r;
      return { ok: true, keyHint: r.keyHint, maskedBy: maskKey(key) };
    });

    // ---- 测试连接（回执用 `message`，与守卫的 `{ok:false,error}` 不同 ⇒ 形状就地保留）----
    handle('api-config:test', async (_e, providerId): Promise<{ ok: boolean; message: string }> => {
      const adapter = apiRegistry.getProvider(String(providerId));
      if (!adapter || typeof adapter.testConnection !== 'function') {
        return { ok: false, message: '该服务商不支持测试连接' };
      }
      // ⚠️ 配置读取（getApiKey/getProviderConfig）**必须在守卫内** ——
      //    原实现把 try 只包在 testConnection 上，配置损坏时这两行会逃出去
      const apiKey = configStore.getApiKey(adapter);
      const cfgRow = configStore.getProviderConfig(adapter);
      try {
        return await adapter.testConnection({
          config: { baseUrl: cfgRow.baseUrl || '', model: cfgRow.model || '', apiKey },
          fetchImpl: null,
        });
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : String(err) };
      }
    });

    // ---- 任务 ----
    handle('api-job:submit', async (_e, payload): Promise<unknown> => {
      return _apiJobManager?.submit(asRecord(payload));
    });
    handle('api-job:cancel', async (_e, jobId): Promise<unknown> => _apiJobManager?.cancel(String(jobId)));
    handle('api-job:list', async (): Promise<OkReply> => ({ ok: true, jobs: _apiJobManager?.list() ?? [] }));
    // 批量出片（Stage F）：同一请求按 matrix 展开成多个变体，复用同一并发队列
    handle('api-job:batch', async (_e, basePayload, matrix): Promise<unknown> => {
      return _apiJobManager?.submitBatch(asRecord(basePayload), matrix);
    });

    // ---- 通道设置（双通道 / 兜底 / 并发）----
    handle('api-setup:get', async (): Promise<OkReply> => {
      return { ok: true, setup: configStore.getSetup(), usage: configStore.getUsage() };
    });
    handle('api-setup:set', async (_e, patch): Promise<OkReply> => {
      const setup = configStore.setSetup(patch);
      // 并发数变化时实时通知引擎（不重建 manager）
      const setupRec = asRecord(setup);
      if (typeof setupRec['concurrency'] === 'number' && _apiJobManager && typeof _apiJobManager.setConcurrency === 'function') {
        _apiJobManager.setConcurrency(setupRec['concurrency']);
      }
      return { ok: true, setup };
    });

    // ---- 保存二次密钥（secretKey，加密落盘）----
    handle('api-config:set-secret', async (_e, providerId, key): Promise<OkReply | FailReply> => {
      const adapter = apiRegistry.getProvider(String(providerId));
      if (!adapter) return { ok: false, error: `未知服务商 ${String(providerId)}` };
      const r = configStore.setSecretKey(adapter, key);
      if (!r.ok) return r;
      return { ok: true, hasSecret: true };
    });

    console.log('[api-bridge] API 接入桥已初始化：providers =', apiRegistry.listProviderIds().join(', '));
  } catch (err) {
    console.error('[api-bridge] 初始化失败:', err instanceof Error ? err.message : err);
  }
}

export { initApi };
