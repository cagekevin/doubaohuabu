/**
 * 指纹诊断纯层单测（原 `OP.jsx:59-125` 的 `h(W)`）
 *
 * ⚠️ 断言都对齐**源版逐行**（段标签 / 三目四支 / `|| '?'` 兜底）——
 *    实现一变必红（不是"仅验不崩"）。
 */

import { describe, expect, it } from 'vitest';
import type { Fingerprint } from '@/stable/model/account';
import {
  DIAG_DIRECT,
  DIAG_NET_UNKNOWN,
  DIAG_SEGMENT_LABEL,
  DIAG_UNKNOWN,
  SPOOF_STATE_LABEL,
  buildFingerprintDiagnosis,
  diagnosisSegments,
  probeFromFingerprint,
} from '../fingerprintDiagnosis';

const FP: Fingerprint = {
  ver: 3,
  hostOS: 'windows',
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  appVersion: '5.0 (Windows)',
  platform: 'Win32',
  vendor: 'Google Inc.',
  language: 'zh-CN',
  languages: ['zh-CN', 'zh', 'en'],
  timezone: 'Asia/Shanghai',
  screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, pixelRatio: 1 },
  webgl: { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA GeForce RTX 3060)' },
  hardwareConcurrency: 8,
  deviceMemory: 8,
  maxTouchPoints: 0,
  userAgentData: { brands: [], mobile: false, platform: 'Windows', _fullVersion: '126.0.0.0' },
};

describe('probeFromFingerprint（原 OP.jsx:83-97 的回落配置）', () => {
  it('★ spoofed 恒为 false —— 配置不等于生效', () => {
    expect(probeFromFingerprint(FP).spoofed).toBe(false);
  });

  it('逐字段映射（含 screen 拼宽x高@比、languages 逗号 join）', () => {
    const p = probeFromFingerprint(FP);
    expect(p.ua).toBe(FP.userAgent);
    expect(p.uadPlatform).toBe('Windows');
    expect(p.platform).toBe('Win32');
    expect(p.languages).toBe('zh-CN,zh,en');
    expect(p.screen).toBe('1920x1080@1');
    expect(p.tz).toBe('Asia/Shanghai');
    expect(p.cores).toBe(8);
    expect(p.gl).toBe('ANGLE (NVIDIA GeForce RTX 3060)');
  });

  it('没有 userAgentData ⇒ uadPlatform 回落 platform', () => {
    const { userAgentData: _drop, ...rest } = FP;
    expect(probeFromFingerprint(rest).uadPlatform).toBe('Win32');
  });

  it('缺 languages 数组 ⇒ 回落单值 language', () => {
    const bad = { ...FP, languages: undefined as unknown as string[] };
    expect(probeFromFingerprint(bad).languages).toBe('zh-CN');
  });
});

describe('buildFingerprintDiagnosis（原 OP.jsx:108-113）', () => {
  it('★ 页面探不到（page 为 null）⇒ 状态「页面未加载」、spoofed false、各段空', () => {
    const d = buildFingerprintDiagnosis(null, null, 'live');
    expect(d.spoofState).toBe('none');
    expect(d.spoofed).toBe(false);
    expect(d.platform).toBe('');
    expect(d.chromeMajor).toBe('');
    expect(d.proxy).toBeNull();
    expect(d.engine).toBe('');
  });

  it('★ 来源 configured ⇒ 状态恒为「配置未生效(页未打开)」（即便 spoofed 为真也不认）', () => {
    const d = buildFingerprintDiagnosis({ spoofed: true }, null, 'configured');
    expect(d.spoofState).toBe('configured');
    // ⚠️ 但 `spoofed` 仍按 page 算（源版 `mt` 与状态串是**两个**表达式）
    expect(d.spoofed).toBe(true);
  });

  it('live + spoofed ⇒ on / spoofed true；live + 非 spoofed ⇒ off', () => {
    expect(buildFingerprintDiagnosis({ spoofed: true }, null, 'live').spoofState).toBe('on');
    expect(buildFingerprintDiagnosis({ spoofed: false }, null, 'live').spoofState).toBe('off');
  });

  it('★ Chrome 主版本从 ua 里抠（抠不到 ⇒ 空串）', () => {
    expect(buildFingerprintDiagnosis({ ua: 'x Chrome/126.0.0.0 y' }, null, 'live').chromeMajor).toBe('126');
    expect(buildFingerprintDiagnosis({ ua: '没有版本号' }, null, 'live').chromeMajor).toBe('');
  });

  it('★ 语言只取**第一个**（源版 split(逗号)[0]）', () => {
    expect(buildFingerprintDiagnosis({ languages: 'zh-CN,zh,en' }, null, 'live').lang).toBe('zh-CN');
    expect(buildFingerprintDiagnosis({ languages: '' }, null, 'live').lang).toBe('');
  });

  it('★ 平台优先 uadPlatform，其次 platform', () => {
    expect(buildFingerprintDiagnosis({ uadPlatform: 'Windows', platform: 'Win32' }, null, 'live').platform).toBe(
      'Windows',
    );
    expect(buildFingerprintDiagnosis({ platform: 'Win32' }, null, 'live').platform).toBe('Win32');
  });

  it('★ 出口三态：未知（无网络结果）/ 未知（ok 为假）/ DIRECT（ok 无代理）/ 代理串', () => {
    expect(buildFingerprintDiagnosis(null, null, 'live').proxy).toBeNull();
    expect(buildFingerprintDiagnosis(null, { ok: false, proxy: 'http://a:1' }, 'live').proxy).toBeNull();
    expect(buildFingerprintDiagnosis(null, { ok: true }, 'live').proxy).toBe(DIAG_DIRECT);
    expect(buildFingerprintDiagnosis(null, { ok: true, proxy: 'http://a:1' }, 'live').proxy).toBe('http://a:1');
  });

  it('引擎取 engineChrome（缺 ⇒ 空串）', () => {
    expect(buildFingerprintDiagnosis(null, { ok: true, engineChrome: '126' }, 'live').engine).toBe('126');
    expect(buildFingerprintDiagnosis(null, { ok: true }, 'live').engine).toBe('');
  });
});

describe('diagnosisSegments（原 OP.jsx:109 的 7 段 $t）', () => {
  it('★ 顺序与标签逐字：伪装 / UA / 屏 / 语言 / 时区 / 出口 / 引擎', () => {
    const d = buildFingerprintDiagnosis(
      {
        spoofed: true,
        uadPlatform: 'Windows',
        ua: 'x Chrome/126.0.0.0 y',
        screen: '1920x1080@1',
        languages: 'zh-CN,zh',
        tz: 'Asia/Shanghai',
      },
      { ok: true, proxy: 'http://127.0.0.1:7890', engineChrome: '126' },
      'live',
    );
    expect(diagnosisSegments(d)).toEqual([
      '伪装 ✓生效',
      'UA Windows Chrome/126',
      '屏 1920x1080@1',
      '语言 zh-CN',
      '时区 Asia/Shanghai',
      '出口 http://127.0.0.1:7890',
      '引擎 126',
    ]);
  });

  it('★ 缺项占位：段值用 `?`，出口未知用「未知」（源版两处字面量不同）', () => {
    const segs = diagnosisSegments(buildFingerprintDiagnosis(null, null, 'live'));
    expect(segs).toEqual([
      `伪装 ${SPOOF_STATE_LABEL.none}`,
      `${DIAG_SEGMENT_LABEL.ua} ${DIAG_UNKNOWN} Chrome/${DIAG_UNKNOWN}`,
      `${DIAG_SEGMENT_LABEL.screen} ${DIAG_UNKNOWN}`,
      `${DIAG_SEGMENT_LABEL.lang} ${DIAG_UNKNOWN}`,
      `${DIAG_SEGMENT_LABEL.tz} ${DIAG_UNKNOWN}`,
      `${DIAG_SEGMENT_LABEL.proxy} ${DIAG_NET_UNKNOWN}`,
      `${DIAG_SEGMENT_LABEL.engine} ${DIAG_UNKNOWN}`,
    ]);
    expect(segs).toHaveLength(7);
  });

  it('出口为 DIRECT 时照实显示（不是「未知」）', () => {
    const segs = diagnosisSegments(buildFingerprintDiagnosis(null, { ok: true }, 'live'));
    expect(segs[5]).toBe(`${DIAG_SEGMENT_LABEL.proxy} ${DIAG_DIRECT}`);
  });
});
