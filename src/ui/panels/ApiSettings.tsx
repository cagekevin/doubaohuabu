/**
 * 「API 服务」面板（原 `_Component46.jsx`，373 行）
 *
 * ★ **它是什么**：第三方图像 / 视频生成服务的配置台 —— ① 通道配置（图片 / 视频 / 兜底 / 并发 + 今日额度）
 *   ② 每个 provider 一张卡（启用开关 · 接口地址 · API 密钥 · Secret · **schema 驱动**的参数字段 · 保存 / 测试连接）。
 *
 * ★ **schema 驱动**（原 `paramSchema`）：卡片里的参数字段**不是硬编码**的 —— 后端 `registry.js` 下发
 *   `ParamField[]`，本组件按表渲染 ⇒ **新增一个服务商零 UI 代码**。
 *
 * ★ **为什么原版是错的**：`_Component46.jsx:100/109/118/149/175` **直调 `window.api.apiConfigSet*` /
 *   `apiConfigTest`** —— 铁律② 违规（视图直调宿主）。本组件改走 `useApiOps()`
 *   （`ui → state/apiOps → core/usecases/apiConfig → ports`）。
 *
 * ⚠️ 原则 1：本组件**不写 store** —— 只调 `useApiOps()` 与 `useStore` 暴露的 action。
 * ⚠️ **草稿是「覆盖层」，不是「副本」**（与源版的一处**结构性**改进）：
 *   源版用一个 effect 把 `configs` 拷进 `c`、并按 `_dirty` 决定是否保留 —— 那是
 *   「setState in effect」（eslint `react-hooks/set-state-in-effect` 拦下，且会级联渲染）。
 *   这里改成**渲染期合并**：`drafts[id]` 只存**用户改过的那一份**，没改过就现算（永远跟最新配置）
 *   ⇒ 语义与源一致（未改过 ⇒ 跟配置；改过 ⇒ 保留），但**没有同步 effect**。
 * ⚠️ 与源版的另两处如实差异（都在结构层，非文案）：
 *   **(a)** 源版弹窗自带 `.api-settings-head`（标题 + 副标题 + ✕）；本工程用 `ui/common/Modal`
 *       （它已是「遮罩 / ✕ / ESC」的唯一落点）⇒ **副标题移进正文首行**（文案不变）。
 *   **(b)** 源版每次渲染都算一次「今天」（`new Date()`）；本仓**渲染期禁 `Date.now()`**（eslint）
 *       ⇒ 收进 `useState(() => …)`（弹窗存活期内不会跨午夜）。
 * ⚠️ 「今日额度」的数字在源版里包在 `<b>` 里 ⇒ 这里按「文案段 + `<b>数字</b>`」拼（文案仍只有 SSOT 一份）。
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Modal } from '@/ui/common/Modal';
import { useApiOps, useStore } from '@/state';
import type { ProviderDraft, ProviderTestResult } from '@/state';
import type { ApiConfigMap, ApiProviderConfig, ApiProviderMeta } from '@/stable/model/gen';
import { API_SETTINGS_TEXT } from '@/constants/text';
import { DEFAULT_API_CONCURRENCY } from '@/constants';
import { formatLocalDate } from '@/lib/time';
import styles from './ApiSettings.module.css';
import shared from '@/ui/common/shared.module.css';

/** 没有配置记录 / 用户没改过时的草稿（原 `c[S.id] || {}` 的等价物） */
function fromConfig(cfg: ApiProviderConfig | undefined): ProviderDraft {
  return {
    baseUrl: cfg?.baseUrl ?? '',
    model: cfg?.model ?? '',
    params: { ...(cfg?.params ?? {}) },
    keyInput: '',
    secretInput: '',
  };
}

/** 一行「标签 + 控件」（原 `.api-row`） */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      {children}
    </div>
  );
}

/** 能力标签（源 295-301：`video` ⇒ 视频，其余 ⇒ 图片） */
const capLabel = (cap: string): string =>
  cap === 'video' ? API_SETTINGS_TEXT.capVideo : API_SETTINGS_TEXT.capImage;

/** 接口地址的占位（源 306：`defaults.baseUrl || 'https://…'`） */
function baseUrlPlaceholderOf(provider: ApiProviderMeta): string {
  const v = provider.defaults?.baseUrl;
  return typeof v === 'string' && v ? v : API_SETTINGS_TEXT.baseUrlPlaceholder;
}

/** 下拉里的一项（源 217-226 / 237-246 / 257-264 —— 三处同构 ⇒ 抽一处，判据 C1） */
function ProviderOption({ provider, configs }: { provider: ApiProviderMeta; configs: ApiConfigMap }) {
  const cfg = configs[provider.id];
  // 源：`E.enabled !== false && E.hasKey`（没有配置记录 ⇒ 视为不可用）
  const usable = cfg?.enabled !== false && cfg?.hasKey === true;
  return (
    <option value={provider.id} disabled={!usable}>
      {provider.name}
      {usable ? '' : API_SETTINGS_TEXT.unavailableOption}
    </option>
  );
}

export interface ApiSettingsProps {
  onClose: () => void;
}

export function ApiSettings({ onClose }: ApiSettingsProps) {
  const providers = useStore((s) => s.apiProvidersMeta);
  const configs = useStore((s) => s.apiConfigs);
  const setup = useStore((s) => s.apiSetup);
  const usage = useStore((s) => s.apiUsage);
  const apiOps = useApiOps();

  /** **只存用户改过的那一份**（没改过的现算 —— 见文件头「草稿是覆盖层」） */
  const [drafts, setDrafts] = useState<Record<string, ProviderDraft>>({});
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ProviderTestResult>>({});

  // ⚠️ 渲染期禁 `Date.now()` ⇒ 挂载时取一次「今天」（原 32-38 的等价物）
  const [today] = useState(() => formatLocalDate(Date.now()));
  const todayUsage = usage[today] ?? { image: 0, video: 0 };

  // 挂载拉一次（原 43-45）
  useEffect(() => {
    void apiOps.load();
  }, [apiOps]);

  /** 取**当前生效**的草稿：用户改过 ⇒ 用他的；没改过 ⇒ 从配置现算 */
  const draftOf = useCallback(
    (id: string): ProviderDraft => drafts[id] ?? fromConfig(configs[id]),
    [drafts, configs],
  );

  /** 改顶层草稿字段（原 `b`）—— 以**当前生效的草稿**为底（否则会丢掉配置里的既有值） */
  const patchDraft = useCallback(
    (id: string, patch: Partial<ProviderDraft>) => {
      setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? fromConfig(configs[id])), ...patch } }));
    },
    [configs],
  );

  /** 改一个 param（原 `x`） */
  const patchParam = useCallback(
    (id: string, key: string, value: unknown) => {
      setDrafts((prev) => {
        const base = prev[id] ?? fromConfig(configs[id]);
        return { ...prev, [id]: { ...base, params: { ...base.params, [key]: value } } };
      });
    },
    [configs],
  );

  /** 保存成功 ⇒ **丢掉覆盖层**（下次渲染即从刷新后的配置重建；原 127-137 的等价物） */
  const dropDraft = useCallback((id: string) => {
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  /** 保存（原 `k`） */
  const save = useCallback(
    async (id: string): Promise<void> => {
      setSaving(true);
      try {
        const ok = await apiOps.saveProvider({ providerId: id, ...draftOf(id) });
        // ⚠️ 源版**只在成功路径**清空密钥输入（失败时保留用户输入）⇒ 这里同法
        if (ok) dropDraft(id);
      } finally {
        setSaving(false);
      }
    },
    [apiOps, draftOf, dropDraft],
  );

  /** 测试连接（原 `N`）—— **先保存**（源 146 的 `await k(S)`），再探测 */
  const test = useCallback(
    async (id: string): Promise<void> => {
      await save(id);
      setTestingId(id);
      try {
        const r = await apiOps.test(id);
        setResults((prev) => ({ ...prev, [id]: r }));
      } finally {
        setTestingId(null);
      }
    },
    [apiOps, save],
  );

  const providerOptions = (capability?: string) =>
    providers
      .filter((p) => (capability ? (p.capabilities ?? []).includes(capability) : true))
      .map((p) => <ProviderOption key={p.id} provider={p} configs={configs} />);

  return (
    <Modal open onClose={onClose} title={API_SETTINGS_TEXT.title}>
      <p className={styles.sub}>{API_SETTINGS_TEXT.sub}</p>

      <div className={styles.sectionTitle}>{API_SETTINGS_TEXT.channelSection}</div>

      <Row label={API_SETTINGS_TEXT.imageChannel}>
        <select
          className={styles.input}
          value={setup.imageProviderId ?? ''}
          onChange={(e) => void apiOps.saveSetup({ imageProviderId: e.target.value || null })}
        >
          <option value="">{API_SETTINGS_TEXT.autoOption}</option>
          {providerOptions('image')}
        </select>
      </Row>

      <Row label={API_SETTINGS_TEXT.videoChannel}>
        <select
          className={styles.input}
          value={setup.videoProviderId ?? ''}
          onChange={(e) => void apiOps.saveSetup({ videoProviderId: e.target.value || null })}
        >
          <option value="">{API_SETTINGS_TEXT.autoOption}</option>
          {providerOptions('video')}
        </select>
      </Row>

      <Row label={API_SETTINGS_TEXT.fallbackChannel}>
        <select
          className={styles.input}
          value={setup.fallbackProviderId ?? ''}
          onChange={(e) => void apiOps.saveSetup({ fallbackProviderId: e.target.value || null })}
        >
          <option value="">{API_SETTINGS_TEXT.noFallback}</option>
          {providerOptions()}
        </select>
      </Row>

      <Row label={API_SETTINGS_TEXT.concurrency}>
        <input
          className={styles.input}
          type="number"
          min={1}
          max={20}
          value={setup.concurrency || DEFAULT_API_CONCURRENCY}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) void apiOps.saveSetup({ concurrency: n });
          }}
        />
      </Row>

      <div className={styles.usage}>
        {API_SETTINGS_TEXT.usageLabel} <b>{todayUsage.image || 0}</b> {API_SETTINGS_TEXT.usageMid}{' '}
        <b>{todayUsage.video || 0}</b>
      </div>

      {providers.length === 0 ? (
        <div className={styles.empty}>{API_SETTINGS_TEXT.loadingProviders}</div>
      ) : (
        providers.map((p) => {
          const cfg = configs[p.id];
          const draft = draftOf(p.id);
          const result = results[p.id];
          const enabled = cfg?.enabled !== false;
          return (
            <div className={styles.card} key={p.id}>
              <div className={styles.cardHead}>
                <label className={styles.enable} title={API_SETTINGS_TEXT.enableTitle}>
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={() => void apiOps.toggleEnabled(p.id, !enabled)}
                  />
                  <span className={shared.panelTitle}>{p.name}</span>
                </label>
                <span className={styles.caps}>{(p.capabilities ?? []).map(capLabel).join(' · ')}</span>
              </div>

              <Row label={API_SETTINGS_TEXT.baseUrl}>
                <input
                  className={styles.input}
                  placeholder={baseUrlPlaceholderOf(p)}
                  value={draft.baseUrl}
                  onChange={(e) => patchDraft(p.id, { baseUrl: e.target.value })}
                />
              </Row>

              <Row label={API_SETTINGS_TEXT.apiKey}>
                {cfg?.hasKey ? (
                  <div className={styles.keyRow}>
                    <span className={styles.keyHint}>{cfg.keyHint}</span>
                    <input
                      className={styles.input}
                      type="password"
                      placeholder={API_SETTINGS_TEXT.keyPlaceholderReplace}
                      value={draft.keyInput}
                      onChange={(e) => patchDraft(p.id, { keyInput: e.target.value })}
                    />
                  </div>
                ) : (
                  <input
                    className={styles.input}
                    type="password"
                    placeholder={API_SETTINGS_TEXT.keyPlaceholderNew}
                    value={draft.keyInput}
                    onChange={(e) => patchDraft(p.id, { keyInput: e.target.value })}
                  />
                )}
              </Row>

              <Row label={API_SETTINGS_TEXT.secret}>
                <div className={styles.keyRow}>
                  <input
                    className={styles.input}
                    type="password"
                    placeholder={API_SETTINGS_TEXT.secretPlaceholder}
                    value={draft.secretInput}
                    onChange={(e) => patchDraft(p.id, { secretInput: e.target.value })}
                  />
                  {cfg?.hasSecret && <span className={styles.keyHint}>{API_SETTINGS_TEXT.secretSaved}</span>}
                </div>
              </Row>

              {(p.paramSchema ?? []).map((field) => (
                <Row label={field.label} key={field.key}>
                  {field.type === 'select' ? (
                    <select
                      className={styles.input}
                      value={String(draft.params[field.key] ?? field.default ?? '')}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const num = Number(raw);
                        // 源 343-344：**能当数字就当数字**（`String(Number(raw)) === raw`），否则留字符串
                        patchParam(
                          p.id,
                          field.key,
                          raw !== '' && !Number.isNaN(num) && String(num) === raw ? num : raw,
                        );
                      }}
                    >
                      {(field.options ?? []).map((o) => (
                        <option value={String(o.value)} key={String(o.value)}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className={styles.input}
                      type={field.type === 'number' ? 'number' : 'text'}
                      value={String(draft.params[field.key] ?? field.default ?? '')}
                      onChange={(e) => patchParam(p.id, field.key, e.target.value)}
                    />
                  )}
                </Row>
              ))}

              <div className={styles.cardFoot}>
                <button
                  type="button"
                  className={styles.saveBtn}
                  disabled={saving}
                  onClick={() => void save(p.id)}
                >
                  {API_SETTINGS_TEXT.save}
                </button>
                <button
                  type="button"
                  className={styles.testBtn}
                  disabled={testingId === p.id}
                  title={API_SETTINGS_TEXT.testTitle}
                  onClick={() => void test(p.id)}
                >
                  {testingId === p.id ? API_SETTINGS_TEXT.testing : API_SETTINGS_TEXT.test}
                </button>
                {result && (
                  <span className={result.ok ? styles.testOk : styles.testBad}>{result.message}</span>
                )}
              </div>
            </div>
          );
        })
      )}
    </Modal>
  );
}
