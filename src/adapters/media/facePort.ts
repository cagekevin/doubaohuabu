/**
 * `MediaPort` 的人脸能力实现（★ **渲染层本地** —— 不经 IPC）
 *
 * ★ **为什么单独一个文件**（判据 C1 三振出局）：`MediaPort` 有**两个**实现
 *   （`adapters/host/electron` 真宿主 · `adapters/host/mock` 开发期），而这两项能力
 *   **与"是否 Electron"无关**（MediaPipe WASM ＋ Canvas 都在渲染层跑）
 *   ⇒ 抽成一份，两处 `...facePortFns` 展开复用，避免抄第二份。
 *
 * ⚠️ 底层 `detectFaces`（`./faceDetect`）与 `applyFaceMask`（`./facemask`）都会**抛**
 *   （WASM 加载 / 解码失败 / 空源 / 非法框 / 尺寸为 0）⇒ 这里统一包成 `Result`
 *   （原则 6：契约声明"会失败"，调用方才被编译器逼着处理；**错误原文照带**，不重写 message）。
 *
 * ⚠️ 端口契约见 `core/ports/host.port.ts` 的 `MediaPort.detectFaces` / `applyFaceMask`
 *   （`TD-16-107`：`ui` 曾**直接 import `adapters/media`**，违反铁律②）。
 */

import { err, ok, toMessage, type Result } from '@/core/model/result';
import type { FaceBox, FaceMaskOpts, FaceMaskResult } from '@/core/rules/facemask';
import type { MediaPort } from '@/core/ports/host.port';
import { detectFaces } from './faceDetect';
import { applyFaceMask } from './facemask';

export const facePortFns: Pick<MediaPort, 'detectFaces' | 'applyFaceMask'> = {
  detectFaces: async (src: string): Promise<Result<FaceBox[]>> => {
    try {
      return ok(await detectFaces(src));
    } catch (e) {
      return err('unknown', toMessage(e), e);
    }
  },
  applyFaceMask: async (
    src: string,
    face: FaceBox,
    opts: FaceMaskOpts,
  ): Promise<Result<FaceMaskResult>> => {
    try {
      return ok(await applyFaceMask(src, face, opts));
    } catch (e) {
      return err('unknown', toMessage(e), e);
    }
  },
};
