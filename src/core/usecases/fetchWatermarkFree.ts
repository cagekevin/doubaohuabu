/**
 * 无水印视频拉取用例（原 `_Component43.jsx` 的 `xt`/`resolveThreadAndFetch`，`docs/过程.md` §1.6）
 *
 * ★ **它做什么**：指定账号 → 占后台页租约（`withBackendPage`）→ 调 `SitePort.fetchWatermarkFree`
 *   （adapter 内部执行 `mD`/`gD` 页内脚本，走 aispace 三步链拉无水印直链）→ 释放。
 *   结果**只返回**，写 `videoShares` 是 `state` 的活（原则 1）。
 *
 * ⚠️ **脚本封装在 `SitePort` 方法内部**（`adapters/site/doubao/scripts.ts`）—— 本用例只调
 *   `site.fetchWatermarkFree(ctx, vid)`，**不 import `adapters`**（铁律①），与 `analyzePrompt` 同法。
 * ⚠️ **失败原样透传**（原则 6）：`withBackendPage` / `site.fetchWatermarkFree` 的 `Result` 直接转发。
 */

import type { Account } from '@/stable/model/account';
import type { WatermarkVideo } from '@/core/ports/site.port';
import { err, type Result } from '@/core/model/result';
import { SEND_TEXT, SITE_CAP_TEXT } from '@/constants/text';
import { withBackendPage, type SendToSiteDeps } from './sendToSite';

/** 注入（`bootstrap/container.ts` 组装）—— 与 `sendToSite` 同一套（选号 + 占用 + 后台页） */
export type FetchWatermarkFreeDeps = SendToSiteDeps;

/** 指定账号拉取（源 `xt(ee, o)` 的 `o` 是**指定账号**，不走池） */
export interface FetchWatermarkFreeInput {
  account: Account;
  vid: string;
  /** 关联节点（原 `Fi` 的 `nodeId`，缺省 null） */
  nodeId?: string | null;
}

/** 按 `vid` 拉单个视频（原 `xt`，`_Component43.jsx:2126` 附近） */
export async function fetchWatermarkFreeByVid(
  deps: FetchWatermarkFreeDeps,
  input: FetchWatermarkFreeInput,
): Promise<Result<WatermarkVideo>> {
  const { account, vid } = input;

  return withBackendPage(
    deps,
    {
      // 指定账号 ⇒ 单链（原 `yS` 的 `accountHint` 同法：链长 1，不退级）
      accounts: [account],
      sendAccount: account.id,
      chain: [account.type],
      jobId: `watermark-free:${vid}`,
      purpose: 'result-pull',
      nodeId: input.nodeId ?? null,
    },
    async (ctx) => {
      const fetch = ctx.site.fetchWatermarkFree;
      if (!fetch) return err('unknown', SEND_TEXT.noCapability(ctx.site.kind, SITE_CAP_TEXT.fetchWatermarkFree));
      return fetch({ account: ctx.account, webContentsId: ctx.page.webContentsId }, vid);
    },
  );
}
