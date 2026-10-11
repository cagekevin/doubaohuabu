/**
 * 把一个 DOM 元素登记进**截图注册表**（原 `Lu.set`/`Lu.delete` 的 React 侧接入）
 *
 * 用法（视频节点）：
 * ```tsx
 * const videoRef = useRef<HTMLVideoElement>(null);
 * useCaptureElement(id, videoRef);
 * ```
 * ⇒ 挂载时登记、卸载时注销（**带元素校验**，见 `unregisterCaptureElement` 的注释）。
 *
 * ⚠️ 判据 C1：这层薄封装存在的理由是"**每个要支持截图的节点都要写一遍四行登记代码**"——
 *   目前只有视频节点一个消费者，故先做成 hook（若第 3 处出现仍复用本 hook，无需再抽）。
 */

import { useEffect, type RefObject } from 'react';
import { registerCaptureElement, unregisterCaptureElement } from '@/lib/captureRegistry';

export function useCaptureElement(nodeId: string, ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    registerCaptureElement(nodeId, el);
    return () => unregisterCaptureElement(nodeId, el);
  }, [nodeId, ref]);
}
