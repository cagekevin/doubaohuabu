// §7 C-1：本文件顶层 `require` 与下面 `app.setPath('userData')` 的**顺序是求值顺序的一部分**
//   （`import` 会被提前求值 ⇒ 顺序变）⇒ 按 §7 C-1「命中时保留原样」：`require` 调用留在原位，
//   只是给它们补上类型（断言在编译期擦除，运行期仍是同一个 `require`）。
//   类型导入单独用 `import type`（编译期擦除，不参与求值）。
import type { BrowserWindow as BrowserWindowType, WebContents } from 'electron';
import type { Dirent, Stats } from 'fs';

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports --
   §7 C-1：本文件顶层 `require` 与 `app.setPath('userData')` 的先后顺序是**求值顺序的一部分**
   （`import` 会被提前求值）⇒ 按 C-1「命中时保留原样」保留 require 形态；§7 C-3 授权局部放行。
   类型由 `as typeof import(...)` 补上（编译期擦除）。 */

const { app, BrowserWindow, dialog, shell, clipboard, nativeImage, webContents, session, protocol, net, Menu, nativeTheme } =
  require('electron') as typeof import('electron');
const path = require('path') as typeof import('path');
const fs = require('fs') as typeof import('fs');
const os = require('os') as typeof import('os');
const crypto = require('crypto') as typeof import('crypto');
const { Readable } = require('stream') as typeof import('stream');
const { pathToFileURL } = require('url') as typeof import('url');
// ⚠️ 源在第 8 行还有 `const { execFileSync } = require('child_process');`，但**全文件零使用**
//    （`git grep` 实算：只有这一行）⇒ 同 `license` 的 `b64urlEncode`：未转过来（保留会踩未使用检查）。
const license = require('./license') as typeof import('./license');
const clipboardImage = require('./clipboard-image') as typeof import('./clipboard-image');
const apiBridge = require('./api/bridge') as typeof import('./api/bridge');
// IPC 注册唯一入口（`handle` = invoke 型 · `on` = send/sendSync 型）见 `electron/ipc.ts`
const { handle, on } = require('./ipc') as typeof import('./ipc');
const { asRecord } = require('./api/shape') as typeof import('./api/shape');

/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports */

// ── userData 目录固定（2026-09-29 历史工程"消失"事故根治）────
// Electron 默认按 package.json 的 name 解析 userData；但旧版 Electron 打包时代
// 曾按 CFBundleName（豆包画布）解析，加上裸 electron 探针落 Application Support/Electron，
// 数据散落三处：{豆包画布, doubao-canvas, Electron}。这里显式固定到 appData/doubao-canvas
//（23GB 账号分区 / images / videos 所在的真实主目录），dev / 打包 / 探针一律同目录，杜绝漂移。
app.setName('doubao-canvas');
app.setPath('userData', path.join(app.getPath('appData'), 'doubao-canvas'));

// ── 项目级分类存储 ───────────────────────────────────────────
// 未配置项目路径时继续使用历史 userData/images、videos、thumbs，确保老项目无缝兼容；
// 配置后，当前项目的工程快照、数据、操作日志、缓存、图片和视频全部进入用户选择的目录。
//
// 2026-09-30 起采用「项目名包裹」结构（layout='new'）：
//   <用户选的路径>/<项目名>/            ← 外层 wrapper（项目工程放在最外面）
//     ├── <项目名>/                    ← 工程文件目录（与项目同名）
//     └── 资源/                        ← 里层文件夹（其他文件统一进这里）
//         ├── 操作记录/、缓存/、图片/、视频/、项目数据/
//         └── 项目存储说明.json
// 旧版结构（layout='legacy'）仍保留兼容：<用户选的路径>/{工程文件,项目数据,操作记录,缓存,图片,视频}/。
const PROJECT_STORAGE_DIRS = Object.freeze({
  engineering: '工程文件',
  data: '项目数据',
  operations: '操作记录',
  cache: '缓存',
  images: '图片',
  videos: '视频',
});
const INNER_FOLDER_NAME = '资源';
const PROJECT_STORAGE_VERSION_LEGACY = 1;
const PROJECT_STORAGE_VERSION_NEW = 2;

/** 项目存储的布局种类（源里是字符串字面量返回值） */
type StorageLayout = 'new-file' | 'new-folder' | 'legacy';

/** 项目存储上下文（源里是就地建的对象字面量） */
interface StorageContext {
  projectId: string;
  projectName: string;
  root: string;
  wrapperPath: string;
  wrapperName: string;
  innerFolderName: string;
  layout: StorageLayout;
  engineeringFileName: string;
  dirs: Record<string, string>;
}

let activeProjectStorage: StorageContext | null = null;
const knownProjectStorageRoots = new Set<string>();

// 把用户输入的项目名清洗成可作为目录名的字符串：剔除 Windows/macOS 不允许字符，
// 避免后续 path.join 时产生非法路径或触发 Finder 显示「该文件夹无法访问」。
function sanitizeFolderName(name: unknown): string {
  if (typeof name !== 'string') return '未命名项目';
  const cleaned = name
    .trim()
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '未命名项目';
  // Windows 保留名兜底（CON/PRN/AUX/NUL/COM1-9/LPT1-9），直接拼下划线避免系统弹错。
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(cleaned)) return `${cleaned}_`;
  return cleaned;
}

// 探测 <root> 下已经是什么布局。返回：
//   'new-file'  — 新结构（最终态）：项目工程直接是 wrapper 下的 <项目名>.json 文件
//   'new-folder' — 旧版新结构：工程包在 wrapper/<项目名>/子目录下，需迁移到 new-file
//   'legacy'    — 旧版结构：root 直挂 工程文件/ 项目数据/ 等子目录
//   默认无歧义可判时返回 'new-file'
//
// 注意：new-folder 的探测必须排在「资源/项目存储说明.json」之前 —— 旧版 new-folder
// 结构下 资源/项目存储说明.json 也存在，如果先命中它就会错判成 new-file，
// 跳过迁移步骤，结果写入会跟旧子目录脱钩。
function detectStorageLayout(root: string, wrapperName: string): StorageLayout {
  const wrapperDir = path.join(root, wrapperName);
  // 1) 最强信号：wrapper/<项目名>.json 已就位 → 最终态
  if (fs.existsSync(path.join(wrapperDir, `${wrapperName}.json`))) return 'new-file';
  // 2) 旧版新结构：工程包在同名子目录里（必须先于 #3 探测，否则会被 #3 吃掉）
  if (fs.existsSync(path.join(wrapperDir, wrapperName, '项目工程.json'))) return 'new-folder';
  // 3) 资源/项目存储说明.json 也是 new-file 的强信号
  if (fs.existsSync(path.join(wrapperDir, INNER_FOLDER_NAME, '项目存储说明.json'))) return 'new-file';
  // 4) 旧版结构：root 下直接挂工程文件/项目存储说明.json
  if (
    fs.existsSync(path.join(root, PROJECT_STORAGE_DIRS.engineering)) ||
    fs.existsSync(path.join(root, '项目存储说明.json'))
  ) {
    return 'legacy';
  }
  return 'new-file';
}

// 把旧版「工程包在 wrapper/<项目名>/子目录」结构迁移成「<项目名>.json 直接放 wrapper 里」。
// 用户最初要求的：项目工程放在最外面，与 资源 同级。直接文件比同名子目录更直观。
function migrateEngineeringToFile(wrapperPath: string, wrapperName: string): boolean {
  const oldDir = path.join(wrapperPath, wrapperName);
  const oldFile = path.join(oldDir, '项目工程.json');
  const newFile = path.join(wrapperPath, `${wrapperName}.json`);
  if (!fs.existsSync(oldFile) || fs.existsSync(newFile)) return true;
  try {
    // 先拷贝再删旧文件，最后尝试移除空目录。两步分离，避免拷贝失败时旧文件被误删。
    fs.copyFileSync(oldFile, newFile);
    // ★ TD-16-37：删旧快照失败**留痕**（残留会在下次迁移时被跳过、不影响功能，但事后要能看出来）
    try {
      fs.unlinkSync(oldFile);
    } catch (e) {
      console.warn('[project-migrate] 旧快照文件删除失败:', e instanceof Error ? e.message : String(e));
    }
    // 仅在目录空的时候移除，留着别的残留文件也不影响功能。
    try {
      fs.rmdirSync(oldDir);
    } catch {
      /* 目录非空，保留 */
    }
    return true;
  } catch {
    return false;
  }
}

function legacyImagesDir(): string {
  return path.join(app.getPath('userData'), 'images');
}
function legacyVideosDir(): string {
  return path.join(app.getPath('userData'), 'videos');
}
function legacyThumbsDir(): string {
  return path.join(app.getPath('userData'), 'thumbs');
}

function atomicWriteFile(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, content, 'utf8');
  try {
    fs.renameSync(tmp, file);
  } catch {
    // Windows 上目标文件存在时 rename 可能不覆盖；删除的是同一份快照文件，可安全重试。
    // ★ TD-16-37：此处**刻意不吞** —— 删不掉也无妨，紧随的 `renameSync` 会抛并原样上报。
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch {
      /* 失败由下一行 renameSync 抛 */
    }
    fs.renameSync(tmp, file);
  }
}

function makeProjectStorage(payload: Record<string, unknown> = {}): StorageContext | null {
  const raw = typeof payload['storagePath'] === 'string' ? payload['storagePath'].trim() : '';
  if (!raw) return null;
  const root = path.resolve(raw);
  const projectId = String(payload['projectId'] || '');
  const projectName = String(payload['projectName'] || '未命名项目').trim() || '未命名项目';
  const wrapperName = sanitizeFolderName(projectName);

  const layout = detectStorageLayout(root, wrapperName);

  let wrapperPath: string;
  let dirs: Record<string, string>;
  let engineeringFileName: string;
  if (layout === 'legacy') {
    // 旧结构：直接以 root 为容器，子目录平铺。工程文件名沿用 项目工程.json。
    wrapperPath = root;
    engineeringFileName = '项目工程.json';
    dirs = {};
    for (const [key, folder] of Object.entries(PROJECT_STORAGE_DIRS)) {
      dirs[key] = path.join(root, folder);
      fs.mkdirSync(dirs[key], { recursive: true });
    }
  } else {
    // 新结构：<root>/<项目名>/<项目名>.json（工程文件，最外层，与 资源 同级）
    //               └── 资源/{项目数据,操作记录,缓存,图片,视频}/（其他全部）
    wrapperPath = path.join(root, wrapperName);
    // 若存在旧版 new-folder 结构（<项目名>/项目工程.json 在子目录里），自动迁移。
    if (layout === 'new-folder') migrateEngineeringToFile(wrapperPath, wrapperName);
    const resourcesDir = path.join(wrapperPath, INNER_FOLDER_NAME);
    dirs = {
      // 工程文件直接放在 wrapper 根下（与 资源 同级），不再有同名子目录
      engineering: wrapperPath,
      data: path.join(resourcesDir, PROJECT_STORAGE_DIRS.data),
      operations: path.join(resourcesDir, PROJECT_STORAGE_DIRS.operations),
      cache: path.join(resourcesDir, PROJECT_STORAGE_DIRS.cache),
      images: path.join(resourcesDir, PROJECT_STORAGE_DIRS.images),
      videos: path.join(resourcesDir, PROJECT_STORAGE_DIRS.videos),
    };
    // wrapper 本身 + 资源子目录都要存在
    fs.mkdirSync(wrapperPath, { recursive: true });
    Object.values(dirs).forEach((d) => fs.mkdirSync(d, { recursive: true }));
    engineeringFileName = `${wrapperName}.json`;
  }

  // 安全白名单 / 资源迁移都按「实际工程目录（wrapper）」为单位登记。
  // 旧结构下 wrapper 即 root，等价行为；新结构下只认 wrapper，避免把同 root 下其他项目
  // 的图片/视频目录当作本工程的数据源（多项目共用同一个外层目录时尤其关键）。
  knownProjectStorageRoots.add(wrapperPath);

  const ctx: StorageContext = {
    projectId,
    projectName,
    root,
    wrapperPath,
    wrapperName: layout === 'legacy' ? '' : wrapperName,
    innerFolderName: layout === 'legacy' ? '' : INNER_FOLDER_NAME,
    layout,
    engineeringFileName,
    dirs,
  };

  // 项目存储说明：旧结构写 root/，新结构写 wrapper/资源/。
  const instructionsDir = layout === 'legacy' ? root : path.join(wrapperPath, INNER_FOLDER_NAME);
  atomicWriteFile(
    path.join(instructionsDir, '项目存储说明.json'),
    JSON.stringify(
      {
        format: 'doubao-canvas-project-storage',
        version: layout === 'legacy' ? PROJECT_STORAGE_VERSION_LEGACY : PROJECT_STORAGE_VERSION_NEW,
        layout,
        projectId: ctx.projectId,
        projectName: ctx.projectName,
        wrapperName: layout === 'legacy' ? undefined : wrapperName,
        innerFolder: layout === 'legacy' ? undefined : INNER_FOLDER_NAME,
        engineeringFileName: engineeringFileName,
        updatedAt: Date.now(),
        folders: PROJECT_STORAGE_DIRS,
      },
      null,
      2,
    ),
  );
  return ctx;
}

// 把渲染端传来的「已知项目」列表逐项解析为实际工程目录（wrapper），加入白名单。
// 兼容两种入参：
//   - 字符串：视为旧结构（wrapper == root），原样登记；
//   - 对象 { path, name }：按项目名算出 wrapper 路径，同时把 root 也登记（旧项目兜底）。
// 新结构下跨项目素材迁移必须按 wrapper 走，否则同 root 下多项目会串味。
function registerKnownProjects(items: unknown): void {
  if (!Array.isArray(items)) return;
  items.forEach((item) => {
    let pathStr = '';
    let nameStr = '';
    if (typeof item === 'string') {
      pathStr = item;
    } else if (item && typeof item === 'object' && typeof asRecord(item)['path'] === 'string') {
      pathStr = String(asRecord(item)['path']);
      const name = asRecord(item)['name'];
      nameStr = typeof name === 'string' ? name : '';
    }
    if (!pathStr.trim()) return;
    try {
      const resolved = path.resolve(pathStr.trim());
      // 旧结构兼容：root 本身就是工程目录
      knownProjectStorageRoots.add(resolved);
      // 新结构：wrapper 在 root/<项目名>/ 下；name 缺失时算不出
      const wrapperName = sanitizeFolderName(nameStr);
      if (wrapperName && wrapperName !== '未命名项目') {
        const wrapperGuess = path.join(resolved, wrapperName);
        knownProjectStorageRoots.add(wrapperGuess);
      }
    } catch {
      /* 忽略坏路径 */
    }
  });
}

function activateProjectStorage(payload: Record<string, unknown> = {}): StorageContext | null {
  registerKnownProjects(payload['knownStoragePaths']);
  activeProjectStorage = makeProjectStorage(payload);
  return activeProjectStorage;
}

function safeRefName(ref: unknown, prefix: string): string {
  if (typeof ref !== 'string' || !ref.startsWith(prefix)) return '';
  return ref.slice(prefix.length).split(/[?#]/)[0]?.replace(/[\\/]/g, '') ?? '';
}

function collectProjectAssetRefs(
  value: unknown,
  refs: { images: Set<string>; videos: Set<string> } = { images: new Set(), videos: new Set() },
  seen: Set<object> = new Set(),
): { images: Set<string>; videos: Set<string> } {
  if (typeof value === 'string') {
    const image = safeRefName(value, 'img://');
    const video = safeRefName(value, 'vid://');
    if (image) refs.images.add(image);
    if (video) refs.videos.add(video);
    return refs;
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return refs;
  seen.add(value);
  if (Array.isArray(value)) value.forEach((item) => collectProjectAssetRefs(item, refs, seen));
  else Object.values(value).forEach((item) => collectProjectAssetRefs(item, refs, seen));
  return refs;
}

function copyFirstExisting(name: string, sourceDirs: (string | null | undefined)[], destDir: string): boolean {
  if (!name) return false;
  const dest = path.join(destDir, name);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return true;
  for (const dir of sourceDirs.filter((d): d is string => !!d)) {
    const src = path.join(dir, name);
    if (!fs.existsSync(src)) continue;
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(src, dest);
    return true;
  }
  return false;
}

function migrateProjectAssets(
  project: unknown,
  target: StorageContext | null,
  previous: StorageContext | null,
): { images: number; videos: number } {
  if (!target || !project) return { images: 0, videos: 0 };
  const refs = collectProjectAssetRefs(project);
  const knownImages = [...knownProjectStorageRoots].map((root) => path.join(root, PROJECT_STORAGE_DIRS.images));
  const knownVideos = [...knownProjectStorageRoots].map((root) => path.join(root, PROJECT_STORAGE_DIRS.videos));
  const imageSources = [previous && previous.dirs['images'], legacyImagesDir(), ...knownImages];
  const videoSources = [previous && previous.dirs['videos'], legacyVideosDir(), ...knownVideos];
  let images = 0;
  let videos = 0;
  refs.images.forEach((name) => {
    if (copyFirstExisting(name, imageSources, target.dirs['images'] ?? '')) images += 1;
  });
  refs.videos.forEach((name) => {
    if (copyFirstExisting(name, videoSources, target.dirs['videos'] ?? '')) videos += 1;
  });
  return { images, videos };
}

function writeProjectSnapshot(project: unknown, ctx: StorageContext | null = activeProjectStorage): boolean {
  if (!ctx || !project || typeof project !== 'object') return false;
  const proj = asRecord(project);
  const normalized: Record<string, unknown> = {
    ...proj,
    storagePath: ctx.root,
    updatedAt: Number(proj['updatedAt']) || Date.now(),
  };
  // 跨项目复制/导入的节点可能仍引用另一个项目目录里的 img:// / vid:// 文件。
  // 每次快照只补齐当前目录缺失的文件，已存在文件按内容哈希命名，不重复复制。
  migrateProjectAssets(normalized, ctx, null);
  atomicWriteFile(
    path.join(ctx.dirs['engineering'] ?? '', ctx.engineeringFileName || '项目工程.json'),
    JSON.stringify({ format: 'doubao-canvas-project', version: 1, ...normalized }, null, 2),
  );
  atomicWriteFile(path.join(ctx.dirs['data'] ?? '', '画布数据.json'), JSON.stringify(normalized['data'] || {}, null, 2));
  const data = asRecord(normalized['data']);
  atomicWriteFile(
    path.join(ctx.dirs['data'] ?? '', '项目索引.json'),
    JSON.stringify(
      {
        projectId: normalized['id'] || ctx.projectId,
        projectName: normalized['name'] || ctx.projectName,
        storagePath: ctx.root,
        updatedAt: normalized['updatedAt'],
        counts: {
          nodes: Array.isArray(data['nodes']) ? data['nodes'].length : 0,
          edges: Array.isArray(data['edges']) ? data['edges'].length : 0,
          library: Array.isArray(data['library']) ? data['library'].length : 0,
          videos: Array.isArray(data['videoShares']) ? data['videoShares'].length : 0,
        },
      },
      null,
      2,
    ),
  );
  atomicWriteFile(
    path.join(ctx.dirs['cache'] ?? '', '缓存索引.json'),
    JSON.stringify({ version: 1, thumbnailDirectory: '缩略图', updatedAt: Date.now() }, null, 2),
  );
  return true;
}

function appendProjectOperation(event: unknown, ctx: StorageContext | null = activeProjectStorage): boolean {
  if (!ctx || !event || typeof event !== 'object') return false;
  const ev = asRecord(event);
  const line = JSON.stringify({
    at: Number(ev['at']) || Date.now(),
    projectId: ev['projectId'] || ctx.projectId,
    type: String(ev['type'] || 'operation'),
    detail: ev['detail'] && typeof ev['detail'] === 'object' ? ev['detail'] : undefined,
  });
  fs.appendFileSync(path.join(ctx.dirs['operations'] ?? '', '用户操作.jsonl'), line + '\n', 'utf8');
  return true;
}

// ── 工程数据磁盘级自动备份 ───────────────────────────────────
// 工程索引只存 localStorage（leveldb），2026-09-29 该库曾被整库清空且无快照可回滚。
// 渲染层每次落盘时同步把同一份 JSON 发到这里，写到 userData/projects-autobackup.json，
// 与 leveldb 物理隔离 —— 即使 Local Storage 再被清掉，也能直接从这份 JSON 恢复。
on('projects-backup', (_e, json) => {
  try {
    if (typeof json !== 'string' || json.length < 2) return;
    const file = path.join(app.getPath('userData'), 'projects-autobackup.json');
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, json);
    fs.renameSync(tmp, file); // 原子替换，避免写一半被读到
  } catch {
    /* 备份失败不影响主流程 */
  }
});

// 项目切换前同步设置存储上下文，确保新画布首次渲染 img:// / vid:// 时已经指向正确目录。
on('project-storage-activate-sync', (e, payload) => {
  // `on` 的监听参数全为 `unknown`（`ipc.ts` 的签名）⇒ 事件对象就地收窄（`asRecord` 对象时是同一引用）
  const ev = asRecord(e);
  try {
    const ctx = activateProjectStorage(asRecord(payload));
    ev['returnValue'] = { ok: true, path: ctx ? ctx.root : '' };
  } catch (err) {
    activeProjectStorage = null;
    ev['returnValue'] = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

handle('project-storage-pick', async (_e, payload) => {
  const p = asRecord(payload);
  if (!mainWindow) return { ok: false, error: 'no_window' };
  const existing = typeof p['storagePath'] === 'string' ? p['storagePath'].trim() : '';
  const res = await dialog.showOpenDialog(mainWindow, {
    title: '选择项目保存路径',
    buttonLabel: '设为项目保存路径',
    defaultPath: existing || app.getPath('documents'),
    properties: ['openDirectory', 'createDirectory', 'promptToCreate'],
  });
  if (res.canceled || !res.filePaths || !res.filePaths[0]) return { ok: false, canceled: true };
  const previous = activeProjectStorage;
  try {
    registerKnownProjects(p['knownStoragePaths']);
    const target = makeProjectStorage({ ...p, storagePath: res.filePaths[0] });
    const migrated = migrateProjectAssets(p['project'], target, previous);
    activeProjectStorage = target;
    if (p['project'] && target) writeProjectSnapshot(p['project'], target);
    if (target) {
      appendProjectOperation(
        {
          type: existing ? 'change-storage-path' : 'set-storage-path',
          detail: { path: target.root, migrated },
        },
        target,
      );
    }
    return { ok: true, path: target ? target.root : '', migrated };
  } catch (err) {
    // 失败即回滚激活状态（守卫不做这件事）⇒ 就地保留；回执转换交注册处
    activeProjectStorage = previous;
    throw err;
  }
});

on('project-snapshot', (_e, project) => {
  try {
    writeProjectSnapshot(project);
  } catch (err) {
    console.warn('[project-storage] 工程快照写入失败:', (err instanceof Error ? err.message : String(err)));
  }
});

on('project-operation', (_e, event) => {
  try {
    appendProjectOperation(event);
  } catch (err) {
    console.warn('[project-storage] 操作记录写入失败:', (err instanceof Error ? err.message : String(err)));
  }
});

handle('project-storage-reveal', async (_e, storagePath) => {
  const raw = String(storagePath || '').trim();
  if (!raw) return { ok: false, error: '项目尚未设置保存路径' };
  const root = path.resolve(raw);
  if (!fs.existsSync(root)) return { ok: false, error: '项目保存路径不存在' };
  // 新结构下「项目保存路径」其实是用户挑的外层目录，实际工程在 wrapper 里；
  // 「打开目录」按钮应当定位到 wrapper（即真的装着工程文件 + 资源 的那一层），
  // 否则用户打开 Finder 看到的只有空的外层目录，不知所云。
  let target = root;
  if (activeProjectStorage && path.resolve(activeProjectStorage.root) === root) {
    target = activeProjectStorage.wrapperPath || root;
  } else if (knownProjectStorageRoots.has(root)) {
    target = root;
  }
  const error = await shell.openPath(target);
  return error ? { ok: false, error } : { ok: true, path: target };
});

// ── 工程占用储存空间统计 ────────────────────────────────────────
// 渲染进程只问「这条路径一共占了多少字节」，由主进程负责递归遍历。
// 用途：顶部栏「工作/测试」按钮在设置保存路径后展示占用大小，而非路径本身。
// 安全边界：仅对当前项目激活过的 storagePath 或 knownProjectStorageRoots 集合内的目录
// 做统计，避免渲染层借此枚举用户整盘文件系统（任意读 ls 既是性能炸弹也是隐私雷）。
handle('project-storage-size', async (_e, storagePath) => {
  const raw = String(storagePath || '').trim();
  if (!raw) return { ok: false, error: 'empty_path' };
  const resolvedInput = path.resolve(raw);
  if (!fs.existsSync(resolvedInput)) return { ok: false, error: '项目保存路径不存在' };
  const stat = fs.statSync(resolvedInput);
  if (!stat.isDirectory()) return { ok: false, error: '不是目录' };

  // 渲染层传的是「用户在文件对话框里挑的 outer root」，新结构下我们真正要扫的是 wrapper；
  // 但渲染层也可能在某些场景直接传 wrapper（兼容旧行为）。两种都接：
  //   - 命中激活项目的 outer root → 翻译为 wrapper
  //   - 直接命中 wrapper 或已注册过的项目根 → 原样走
  let root = resolvedInput;
  if (activeProjectStorage) {
    const activeRoot = path.resolve(activeProjectStorage.root);
    const activeWrapper = path.resolve(activeProjectStorage.wrapperPath);
    if (resolvedInput === activeRoot && activeWrapper !== activeRoot) {
      root = activeWrapper;
    }
  }

  // 安全白名单：当前激活项目的实际工程目录（wrapper）+ 已注册过的项目根
  // pickProjectStorage 时已登记。新结构下 wrapper 与 root 不同，必须以 wrapper 为准。
  const allowed =
    knownProjectStorageRoots.has(root) ||
    (activeProjectStorage && path.resolve(activeProjectStorage.wrapperPath) === root);
  if (!allowed) return { ok: false, error: 'path_not_allowed' };

  // 异步递归求和；遇到软链 / 硬链不递增，避免双计。
  // 设 30s 硬上限：超大工程（GB 级图库）卡死会让顶部栏永远「正在统计…」，
  // 30s 没扫完就返回当前已累计值，宁可少算也不阻塞 UI。
  const startedAt = Date.now();
  const HARD_TIMEOUT_MS = 30000;
  let bytes = 0;
  let files = 0;
  let aborted = false;

  async function walk(dir: string): Promise<void> {
    if (aborted) return;
    if (Date.now() - startedAt > HARD_TIMEOUT_MS) {
      aborted = true;
      return;
    }
    let entries: Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return; // 权限拒绝 / 已删除等异常吞掉，单个目录失败不影响整棵子树
    }
    for (const entry of entries) {
      if (aborted) return;
      if (Date.now() - startedAt > HARD_TIMEOUT_MS) {
        aborted = true;
        return;
      }
      const child = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue; // 跳过软链，避免递归环 + 双计
      if (entry.isDirectory()) {
        await walk(child);
      } else if (entry.isFile()) {
        try {
          const s = await fs.promises.stat(child);
          if (s.isFile()) {
            bytes += s.size;
            files += 1;
          }
        } catch {
          /* 单文件读不到大小，跳过 */
        }
      }
    }
  }
  await walk(root);
  return { ok: true, bytes, files, partial: aborted, elapsedMs: Date.now() - startedAt };
});

// ── 界面主题锁定浅色 ─────────────────────────────────────────
// 应用是纯浅色设计（页面已声明 color-scheme:light），但系统深色模式下
// Electron 的原生下拉（<select> 弹层）/右键菜单/文件对话框仍跟随系统渲染成深色，
// 与白色 UI 不统一。themeSource='light' 强制全部原生部件走浅色。
nativeTheme.themeSource = 'light';

// ── 调试日志落盘 ─────────────────────────────────────────────
// 用户双击 .app 启动看不到主进程控制台，这里把带 [dola-media] 标记的日志额外写入
// 「用户主目录/dola-media-debug.log」，方便用户用文本编辑器直接查看，无需终端/DevTools。
const dmDebugLogPath = path.join(os.homedir(), 'dola-media-debug.log');
function dmCapture(level: string, args: unknown[]): void {
  try {
    const line = args
      .map((a) => {
        const message = asRecord(a)['message'];
        if (typeof message === 'string' && message) return message;
        return typeof a === 'string' ? a : '';
      })
      .join(' ');
    if (line.includes('[dola-media]')) {
      fs.appendFileSync(dmDebugLogPath, `[${new Date().toISOString()}] [${level}] ${line}\n`);
    }
  } catch {
    /* 忽略写入失败 */
  }
}
const _origLog = console.log.bind(console);
const _origWarn = console.warn.bind(console);
console.log = (...args: unknown[]): void => {
  dmCapture('log', args);
  _origLog(...args);
};
console.warn = (...args: unknown[]): void => {
  dmCapture('warn', args);
  _origWarn(...args);
};

// ── 进程级兜底：任何未捕获异常 / 未处理 Promise 拒绝都不让应用直接崩 ──
// 仅记录到调试日志与 console，绝不调用 app.exit / process.exit，避免「闪退」。
process.on('uncaughtException', (err) => {
  try {
    fs.appendFileSync(dmDebugLogPath, `[${new Date().toISOString()}] [FATAL uncaughtException] ${(err && err.stack) || err}\n`);
  } catch {
    /* ★ TD-16-37：写调试日志失败无妨 —— 下一行 _origWarn 仍把原文打到 console，不丢 */
  }
  _origWarn('[FATAL uncaughtException]', err);
});
process.on('unhandledRejection', (reason) => {
  try {
    const r = asRecord(reason);
    fs.appendFileSync(
      dmDebugLogPath,
      `[${new Date().toISOString()}] [WARN unhandledRejection] ${String((r['stack'] as unknown) || reason)}\n`,
    );
  } catch {
    /* ★ TD-16-37：同上 —— console 兜底在下一行 */
  }
  _origWarn('[WARN unhandledRejection]', reason);
});

// ── 反自动化特征开关 ─────────────────────────────────────────
// Chromium 的 AutomationControlled 特性会让 navigator.webdriver 暴露自动化身份，
// Cloudflare Turnstile 等第三方人机校验会据此直接判定为「机器人环境」。
// 关掉该特性后以正常浏览器身份运行（必须在 app ready 之前 append）。
// ⚠️ 同一个开关名只能有一个值（后写覆盖前者），要关多个 Blink 特性必须逗号分隔写在一起。
//    ComputePressure —— 见下方「关闭 Compute Pressure」注释（Tapnow 登录后闪退的根因）。
try {
  app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled,ComputePressure');
} catch {
  /* 忽略 */
}

// 全局 UA 兜底：把 Electron / 应用标识从 UA 里彻底抹掉。
// Cloudflare 的浏览器完整性检查会因 UA 带 `Electron/31.x` 直接判定为「嵌入式自定义浏览器」；
// 设了 fallback 后，即使某个 webview 忘记（或失败于）单独设置 UA，也不会裸奔成 Electron UA。
// 豆包/dola 的 webview 各自通过 useragent 属性指定伪装 UA，优先级高于此 fallback，不受影响。
try {
  const _realChrome = String(process.versions.chrome || '120.0.0.0');
  const _major = parseInt(_realChrome.split('.')[0] ?? '', 10) || 120;
  app.userAgentFallback =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    `(KHTML, like Gecko) Chrome/${_major}.0.0.0 Safari/537.36`;
} catch {
  /* 忽略 */
}

// ── 关闭 Compute Pressure（CPU 压力）───────────────────────
// ⚠️ 这是「添加 Tapnow 账号 → 粘贴邮箱验证链接 → 主界面出现约 1 秒后整个应用闪退」的根因所在。
//
// 崩溃现场（2026-09-11 23:31 / 23:32 / 23:40 / 2026-09-12 00:09 四次崩溃栈完全一致，
// 已用 Electron 31.7.7 官方符号 + 反汇编定位）：
//   主进程主线程 EXC_BREAKPOINT / SIGTRAP，崩溃指令就是 CHECK 失败用的 brk #0：
//     device::CpuProbeManager::OnCpuSampleAvailable() +0x68
//       ldrb w8, [this,#0xf8]      // 读「已启动」标志
//       tbz  w8, #0 → brk #0       // 标志为 0（manager 已停止）却收到 CPU 采样 → 立刻自杀
//   调用链：content::BrowserMainLoop → MessagePump → TaskAnnotator
//          → system_cpu::CpuProbe::OnSampleAvailable → CpuProbeManager::OnCpuSampleAvailable
//
// device::CpuProbeManager 只由 Compute Pressure（window.PressureObserver / observe('cpu')）
// 创建：页面一注册 CPU 压力观察，主进程就起周期性 CPU 采样；当页面被销毁/注销观察而采样
// 仍在飞行时，manager 已置为停止态，采样回调随即 CHECK 失败 → 整个浏览器进程被拖死。
// （Chromium 自身 BUG，Electron 侧无法捕获，只能让这条路径根本不启动。）
//
// 页面侧入口由上面的 disable-blink-features 一并关闭，这里再关掉浏览器侧的
// device::ComputePressure 特性（device service 里的 CpuProbeManager 就归它管）。
// 实测验证：默认 window.PressureObserver === 'function'；加开关后为 'undefined'
// （tests/pressure-probe.js），且反自动化开关（AutomationControlled）仍生效。
try {
  app.commandLine.appendSwitch('disable-features', 'ComputePressure');
} catch {
  /* 忽略 */
}

// ── GPU 进程崩溃上限（保留，但并非本次闪退原因）────────────────
// 曾经误判本机闪退为「GPU 进程连续崩溃 → gpu_data_manager_impl_private.cc 的 LOG(FATAL)
// → 浏览器进程自杀」。实际上那条 FATAL 只在探针被外层沙箱掐死 GPU 进程时出现；
// 线上四次崩溃里 child-process-gone 一条都没有，SIGTRAP 发生在 CPU 采样回调里（见上）。
// 该开关本身无害（关掉后 GPU 进程可无限重启 / 降级软件合成），予以保留。
try {
  app.commandLine.appendSwitch('disable-gpu-process-crash-limit');
} catch {
  /* 忽略 */
}

// ── 关闭 Chromium 沙箱（解决 Intel / Rosetta 环境下 webview 白屏/空白）────
// Electron 的 webview 在 x86_64 包跑在 Intel Mac 或 Apple Silicon 的 Rosetta 上时，
// 渲染子进程的 sandbox 可能因架构/权限不匹配而无法启动，导致中间操作区白屏。
// 关闭 sandbox 与 GPU sandbox 后，Chromium 改用主进程权限启动渲染，可绕过此问题。
// 注意：这会降低渲染进程隔离级别，但对本地桌面自动化工具是可接受的折中。
try {
  app.commandLine.appendSwitch('no-sandbox');
} catch {
  /* 忽略 */
}
try {
  app.commandLine.appendSwitch('disable-setuid-sandbox');
} catch {
  /* 忽略 */
}
try {
  app.commandLine.appendSwitch('disable-gpu-sandbox');
} catch {
  /* 忽略 */
}

// ── Chromium 原生日志落盘 ─────────────────────────────────────
// 双击 .app 启动时 stderr 不可见，一旦再发生 LOG(FATAL)/CHECK 失败就拿不到原文。
// 把 Chromium 的 ERROR/FATAL 日志写进 userData/chromium.log，下次崩溃可直接看原因。
try {
  const _logFile = path.join(app.getPath('userData'), 'chromium.log');
  app.commandLine.appendSwitch('log-file', _logFile);
  app.commandLine.appendSwitch('enable-logging');
  app.commandLine.appendSwitch('log-level', '2'); // 0=INFO 1=WARN 2=ERROR 3=FATAL
} catch {
  /* 忽略 */
}

// ── 子进程崩溃观测 ───────────────────────────────────────────
// 记录 GPU / 渲染进程 / 网络服务等子进程的非正常退出，事后能还原崩溃前的时序。
app.on('child-process-gone', (_event, details) => {
  try {
    fs.appendFileSync(dmDebugLogPath, `[${new Date().toISOString()}] [child-process-gone] ${JSON.stringify(details)}\n`);
  } catch (e) {
    // ★ TD-16-37：此处**无 console 兜底** ⇒ 写日志失败必须自己留痕（否则崩溃时序彻底丢失）
    console.warn('[child-process-gone] 写调试日志失败，事件明细：', (e instanceof Error ? e.message : String(e)), details);
  }
});

let mainWindow: BrowserWindowType | undefined;

// 当前聚焦的 webview guest（用于菜单打开其 DevTools）
let lastFocusedGuest: WebContents | null = null;

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'heic', 'tif', 'tiff'];

// ============================================================
// 图片外置存储：工程数据只存 `img://<sha1>.<ext>` 引用，图片本体落盘到
// userData/images/ 目录。sha1 按内容命名 → 相同图片天然去重，
// localStorage 不再膨胀（此前所有 base64 图都塞进 JSON，是配额超限根因）。
// ============================================================
// 必须在使用前注册特权 scheme（app ready 之前）
protocol.registerSchemesAsPrivileged([
  { scheme: 'img', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
  // vid:// → userData/videos/ 下的视频文件（历史版本视频本地化：出片即落盘）。
  // stream:true 供 <video> 边下边播 + 拖动进度条（配合 handler 的 Range 支持）。
  { scheme: 'vid', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
  // appasset:// → dist/ 下的静态资源（人脸检测的 wasm 运行时 + .tflite 模型）。
  // 生产环境页面由 file:// 加载，而 Chromium 禁止 file:// 页面 fetch/XHR 本地文件，
  // MediaPipe 无法据此加载 wasm 二进制；故注册特权 scheme 由主进程读盘返回，
  // 并给出正确的 application/wasm MIME（流式编译校验 MIME，错了会拒绝编译）。
  {
    scheme: 'appasset',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true, corsEnabled: true },
  },
]);

// 静态资源扩展名 → MIME（appasset:// 用）
const APPASSET_MIME: Record<string, string> = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.wasm': 'application/wasm',
  '.tflite': 'application/octet-stream',
  '.json': 'application/json',
  '.bin': 'application/octet-stream',
  '.data': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.css': 'text/css',
  '.txt': 'text/plain; charset=utf-8',
};

const imagesDir = (): string => (activeProjectStorage ? activeProjectStorage.dirs['images'] ?? '' : legacyImagesDir());

/**
 * 把 `data:image/...` 内联图落盘 → 返回 `img://<hash>.<ext>` 引用。
 *
 * ★ **失败即抛**（**不**降级回内联 base64）—— `§八·五#1`「不得内联 base64」：
 *   返回原 base64 会把它写进工程 JSON（单张 2~20MB）。
 *   三个调用点**都已兜底**：`img-save-sync` → 前端 `adapters/host/electron` 的 catch 转 `err`（原则 6）；
 *   `import-files` → 注册处守卫转 `{ok:false,error}` 回执（不 reject）；`start-file-drag` → 本地 `try/catch` 已就位。
 */
function persistImageDataUrl(dataUrl: unknown): unknown {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return dataUrl;
  const m = dataUrl.match(/^data:(image\/[\w.+-]+);base64,(.+)$/);
  if (!m) return dataUrl;
  const mime = m[1] ?? '';
  const buf = Buffer.from(m[2] ?? '', 'base64');
  if (!buf || buf.length === 0) return dataUrl;
  const ext = (mime.split('/')[1] || 'png').replace('svg+xml', 'svg').replace('jpeg', 'jpg');
  const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16);
  const dir = imagesDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${hash}.${ext}`);
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, buf);
  return `img://${hash}.${ext}`;
}

// 缩略图缓存目录：画布/列表显示用的降采样 JPEG，避免每次挂载都解码 2～20MB 原图
function thumbsDir(): string {
  return activeProjectStorage ? path.join(activeProjectStorage.dirs['cache'] ?? '', '缩略图') : legacyThumbsDir();
}

// 生成缩略图：读原图 → nativeImage 降采样 → JPEG 落盘缓存。
// 只在缓存缺失时执行一次，之后 img://xxx.png?w=480 直接命中磁盘缓存。
function ensureThumb(filePath: string, name: string, width: number): string | null {
  const dir = thumbsDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const base = name.replace(/\.[^.]+$/, '');
  const out = path.join(dir, `${base}_${width}.jpg`);
  const st = fs.existsSync(out) ? fs.statSync(out) : null;
  if (st && st.size > 0) return out;
  const img = nativeImage.createFromPath(filePath);
  if (img.isEmpty()) return null;
  const size = img.getSize();
  // 原图本身比目标宽度还小 → 直接用原图，省一次编码
  if (size.width && size.width <= width) return filePath;
  const scaled = img.resize({ width, quality: 'good' });
  const buf = scaled.toJPEG(82);
  if (!buf || buf.length === 0) return null;
  try {
    fs.writeFileSync(out, buf);
  } catch {
    return null;
  }
  return out;
}

// 把 img:// 引用解析回磁盘文件绝对路径（供剪贴板等需要真实文件的场景）
function resolveImageRef(ref: unknown): string | null {
  try {
    if (typeof ref !== 'string' || !ref.startsWith('img://')) return null;
    const name = ref.slice('img://'.length).replace(/[\\/]/g, ''); // 防路径穿越
    if (!name) return null;
    const projectDirs = [...knownProjectStorageRoots].map((root) => path.join(root, PROJECT_STORAGE_DIRS.images));
    const candidates = [imagesDir(), legacyImagesDir(), ...projectDirs];
    for (const dir of [...new Set(candidates)]) {
      const filePath = path.join(dir, name);
      if (fs.existsSync(filePath)) return filePath;
    }
    return null;
  } catch {
    return null;
  }
}

// ============================================================
// 视频外置存储：与 img:// 同思路 —— 出片结果不再只存远端直链。
// 远端直链可能是带签名的临时地址 / 需要 Referer 防盗链，软件重启后
// 历史版本就会出现「有的能播、有的不能播」。出片到达时把视频本体
// 下载到 userData/videos/，工程数据改存 `vid://<sha1>.<ext>` 引用，
// 播放/拖进度条都走本地文件，与远端签名/防盗链彻底解耦。
// ============================================================
function videosDir(): string {
  return activeProjectStorage ? activeProjectStorage.dirs['videos'] ?? '' : legacyVideosDir();
}

/** 视频本地化的回执（源里是就地 return 的字面量） */
type SaveVideoResult = { ok: true; ref: string; size: number; cached?: boolean } | { ok: false; error: string };

// 下载远端视频 → 落盘 → 返回 vid:// 引用。按 URL sha1 命名 → 同一链接天然去重；
// 已存在直接命中不重复下载。referer 传空串表示不带 Referer 头。
async function saveVideoFromUrl(url: unknown, referer: unknown): Promise<SaveVideoResult> {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    return { ok: false, error: 'bad_url' };
  }
  const dir = videosDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const hash = crypto.createHash('sha1').update(url).digest('hex').slice(0, 16);
  let ext = '.mp4';
  try {
    const m = new URL(url).pathname.match(/\.(mp4|webm|mov|m4v)$/i);
    if (m) ext = '.' + String(m[1]).toLowerCase();
  } catch {
    /* URL 解析失败保持 .mp4 */
  }
  const fileName = `${hash}${ext}`;
  const filePath = path.join(dir, fileName);
  if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
    return { ok: true, ref: `vid://${fileName}`, size: fs.statSync(filePath).size, cached: true };
  }
  const headers: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    Accept: '*/*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
  };
  if (referer) headers['Referer'] = String(referer);
  let buf: Buffer;
  try {
    const resp = await net.fetch(url, { method: 'GET', headers, redirect: 'follow' });
    if (!resp.ok) return { ok: false, error: 'http_' + resp.status };
    buf = Buffer.from(await resp.arrayBuffer());
  } catch (e) {
    // 源写 `(e && (e.message || String(e))) || 'fetch_failed'`：保留"假值即回落"的选取顺序
    return { ok: false, error: (e ? (e instanceof Error ? e.message : String(e)) : '') || 'fetch_failed' };
  }
  // 过小视为异常响应（防盗链错误页 / 空响应），不落盘
  if (buf.length < 1024) return { ok: false, error: 'too_small' };
  try {
    fs.writeFileSync(filePath, buf);
  } catch (e) {
    return { ok: false, error: (e ? (e instanceof Error ? e.message : String(e)) : '') || 'write_failed' };
  }
  return { ok: true, ref: `vid://${fileName}`, size: buf.length };
}

// 把 vid:// 引用解析回磁盘文件绝对路径（下载 / 定位文件等场景）
function resolveVideoRef(ref: unknown): string | null {
  try {
    if (typeof ref !== 'string' || !ref.startsWith('vid://')) return null;
    const name = ref.slice('vid://'.length).replace(/[\\/]/g, ''); // 防路径穿越
    if (!name) return null;
    const projectDirs = [...knownProjectStorageRoots].map((root) => path.join(root, PROJECT_STORAGE_DIRS.videos));
    const candidates = [videosDir(), legacyVideosDir(), ...projectDirs];
    for (const dir of [...new Set(candidates)]) {
      const filePath = path.join(dir, name);
      if (fs.existsSync(filePath)) return filePath;
    }
    return null;
  } catch {
    return null;
  }
}

// ============================================================
// 指纹伪装：为每个账号 webview 生成独立且稳定的虚拟身份
// ============================================================
// 在 webview 的 preload 中覆盖 DOM 层指纹（navigator / screen / timezone / WebGL），
// 再于主进程按 partition 注入 Accept-Language 请求头，实现「同浏览器多账号指纹隔离」。
// preload 文件按 account.id 隔离存放于 userData/fingerprints/，内容与指纹一同落盘，
// 因此同一账号每次启动命中的是同一份配置（稳定）。
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports --
   §7 C-1：以下 require 同样留在原位（`import` 提前求值 ⇒ 求值顺序变）；§7 C-3 授权局部放行。
   类型由 `as typeof import(...)` 补上（编译期擦除）。 */
const { buildFingerprintPreload } = require('./fingerprint-preload') as typeof import('./fingerprint-preload');
// ★ **零注入**：Lovart 容器不挂载任何自定义 preload —— 自定义 UA preload 会留下 fn.toString() 可探测痕迹。
const dolaMedia = require('./dola-media') as typeof import('./dola-media');
// ★ 站点域名真相（层 1 域名 + 层 2 归属判定）—— 2026-10-14 收口：此前 main.js 自己内联了
//   3 遍域名判定（`includes('dola')` 选源 · `includes(sourceHost)` 精确找 · `includes('doubao.com')` 兜底）
const siteHosts = require('./site-hosts') as typeof import('./site-hosts');
const lovartFetch = require('./lovart-fetch') as typeof import('./lovart-fetch');
const lovartScan = require('./lovart-scan') as typeof import('./lovart-scan');
const firefox = require('./firefox') as typeof import('./firefox');
const chromeCdp = require('./chrome-cdp') as typeof import('./chrome-cdp');

/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports */

// 按 partition 注入 HTTP 层指纹头（Accept-Language + 客户端提示，与伪装的 UA 对齐）
function applyFingerprintHeaders(
  ses: Electron.Session,
  fp: { languages?: unknown; uaClientHints?: Record<string, unknown> },
): void {
  if (!fp || !fp.languages || !(fp.languages as unknown[]).length) return;
  const acceptLang = (fp.languages as string[]).join(',');
  const ch = fp.uaClientHints || {};
  try {
    ses.webRequest.onBeforeSendHeaders((details, callback) => {
      const h = (details.requestHeaders || {}) as unknown as Record<string, string>;
      h['Accept-Language'] = acceptLang;
      // 客户端提示与伪装的 Chrome 版本对齐（best-effort：Chromium 可能仍按真实版本下发，
      // 但即便如此也仍落在「Chromium」范畴内，与伪装 UA 不冲突）
      if (ch['Sec-CH-UA']) h['Sec-CH-UA'] = String(ch['Sec-CH-UA']);
      if (ch['Sec-CH-UA-Mobile']) h['Sec-CH-UA-Mobile'] = String(ch['Sec-CH-UA-Mobile']);
      if (ch['Sec-CH-UA-Platform']) h['Sec-CH-UA-Platform'] = String(ch['Sec-CH-UA-Platform']);
      if (ch['Sec-CH-UA-Full-Version']) h['Sec-CH-UA-Full-Version'] = String(ch['Sec-CH-UA-Full-Version']);
      callback({ requestHeaders: h });
    });
  } catch (e) {
    console.error('[fingerprint] 注入指纹请求头失败:', (e instanceof Error ? e.message : String(e)));
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: '豆包画布',
    backgroundColor: '#f5f6f8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
    },
  });

  /*
   * ★ 加载目标**只有一条路**：`dist/index.html`（与生产同构）。
   *
   * ⚠️ 原先这里还有一条「`dist` 不在 ⇒ `loadURL('http://localhost:5123')`」的推断，已删 —— 三个理由：
   *   ① **判据错位**：拿**文件系统的偶然状态**去猜「开发者想连 dev server」；
   *   ② **端口是错的**（vite 在 `vite.config.ts` 的 5175）⇒ 这条路**不可能成功**，
   *      却把「忘了构建」报成「连不上 dev server」，查错方向从一开始就是歪的；
   *   ③ **Electron 窗口永远是生产同构**：`file://` + `appasset://` 特权 scheme
   *      （`main.js` 的 `registerSchemesAsPrivileged`，注册理由就是"生产由 file:// 加载"），
   *      且 `adapters/media/faceDetect.ts` 按 `location.protocol === 'file:'` 分支选资源基址
   *      ⇒ 连 dev server 是**另一个环境**（`appasset://` 整条不执行），验不过生产要验的东西。
   *   ⇒ 「让改动到达窗口」归**构建流水线**（`npm run build:watch`，窗口内 `Ctrl+R`），
   *      不归主进程推断。
   */
  // ★ 产物落点（D-4）：本文件可能住 `electron/`（源码）或 `electron/dist/`（产物），两者**深度不同**
  //   ⇒ 上**两级**才是 app 根（开发态 ＝ 仓根；打包态 ＝ `app.asar/` 根 —— vite 的 `dist/index.html`
  //   两处都在那一层）。
  //   ⛔ 不用 `app.getAppPath()`：实测它 ＝ **入口所在目录**（`electron <文件>` ⇒ 该文件所在目录；
  //      `electron <目录>` ⇒ 该目录），**不是"仓根"** ⇒ 拿它拼 `dist` 会在某种启动方式下指错。
  const distPath = path.join(__dirname, '../../dist/index.html');
  if (!fs.existsSync(distPath)) {
    // 原则 6：不静默、不落到别的地址 —— 明确报出来并给出修法
    console.error(
      `[main] 找不到 ${distPath}（前端还没构建）——` +
        ' 先跑 `npm run build`（或 `npm run build:watch` 持续重建），再重启本应用。',
    );
  }
  // 源是浮动 promise（未 await / 未 catch）⇒ 闸要求显式忽略；`void` 不改行为
  void mainWindow.loadFile(distPath);

  // ── webview 调试支持 ──────────────────────────────────────
  // 跟踪当前聚焦的 webview guest，便于菜单打开其 DevTools；
  // 同时把 guest 内部 console 转发到调试日志文件，
  // 这样无需打开 DevTools 也能在 ~/dola-media-debug.log 里排查。
  const trackedGuests = new Set<WebContents>();
  function trackGuestConsole(guest: WebContents): void {
    if (!guest || trackedGuests.has(guest) || guest.isDestroyed()) return;
    trackedGuests.add(guest);
    try {
      guest.on('console-message', (_e, level, message) => {
        if (typeof message === 'string' && (message.includes('[dola-media]') || message.includes('[watermarkFree]'))) {
          const tag = level === 1 ? 'warn' : level === 2 ? 'error' : 'log';
          try {
            fs.appendFileSync(dmDebugLogPath, `[${new Date().toISOString()}] [webview] [${tag}] ${message}\n`);
          } catch (e) {
            console.warn('[webview] 写调试日志失败:', (e instanceof Error ? e.message : String(e)));
          }
        }
      });
    } catch {
      /* ★ TD-16-37：接管 guest console 失败 —— 只是少一份调试日志，不影响功能 */
    }
  }

  mainWindow.webContents.on('did-attach-webview', (_event, guest) => {
    if (lastFocusedGuest !== guest) lastFocusedGuest = guest;
    trackGuestConsole(guest);
    try {
      guest.on('focus', () => {
        lastFocusedGuest = guest;
      });
    } catch (e) {
      // ★ TD-16-37：注册失败 = **功能降级**（"打开 DevTools" 会指向非当前 guest）⇒ 必须留痕
      console.warn('[webview] 注册 focus 监听失败:', (e instanceof Error ? e.message : String(e)));
    }
  });
}

// 源是浮动 promise（`whenReady().then(...)` 无 catch）⇒ 闸要求显式忽略；`void` 不改行为
void app.whenReady().then(() => {
  // 调试用金丝雀：应用一启动就往时长日志写一行，用于确认「重启后的新代码确实已加载」。
  // 若重启后该文件立即出现 APP-START，说明新代码生效；若仍无，说明跑的仍是旧进程。
  try {
    fs.appendFileSync(
      path.join(os.homedir(), 'dola-duration-debug.log'),
      `[${new Date().toISOString()}] APP-START pid=${process.pid}\n`,
    );
  } catch {
    /* 忽略 */
  }
  // ── 应用菜单：保留 macOS 标准菜单，追加「调试」项，可打开 webview DevTools ──
  try {
    const template: Electron.MenuItemConstructorOptions[] = [
      { role: 'appMenu' },
      { role: 'fileMenu' },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' },
      {
        label: '调试',
        submenu: [
          {
            label: '打开账号 WebView 开发工具',
            accelerator: 'CmdOrCtrl+Shift+D',
            click: () => {
              const target =
                lastFocusedGuest && !lastFocusedGuest.isDestroyed()
                  ? lastFocusedGuest
                  : mainWindow && mainWindow.webContents;
              if (!target) return;
              if (target.isDevToolsOpened()) target.closeDevTools();
              else target.openDevTools({ mode: 'detach' });
            },
          },
          {
            label: '打开主窗口开发工具',
            accelerator: 'CmdOrCtrl+Shift+I',
            click: () => {
              if (mainWindow) {
                if (mainWindow.webContents.isDevToolsOpened()) mainWindow.webContents.closeDevTools();
                else mainWindow.webContents.openDevTools({ mode: 'detach' });
              }
            },
          },
        ],
      },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  } catch (e) {
    // ★ TD-16-37：菜单构建失败 = **用户可见**（应用菜单整个缺失）⇒ 必须留痕
    console.warn('[menu] 应用菜单构建失败（菜单将缺失）:', (e instanceof Error ? e.message : String(e)));
  }

  // img:// 协议 → userData/images/ 目录下的图片文件（渲染层 <img src="img://xxx.png"> 直接可用）
  // 给响应补 CORS 头。图片编辑器要读像素（涂抹遮脸 / 导出 / 人脸检测），
  // 而 img:// 与页面（file://）不同源，跨源图 drawImage 到 canvas 会污染画布，
  // 之后 getImageData / toDataURL 一律抛 SecurityError。带上 CORS 头后，
  // 渲染层用 <img crossOrigin="anonymous"> 加载即可安全读像素。
  const withCors = (res: Response): Response => {
    try {
      const headers = new Headers(res.headers);
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    } catch {
      return res;
    }
  };

  protocol.handle('img', async (req) => {
    try {
      const url = new URL(req.url);
      // 名称（含扩展名），去掉路径分隔符防穿越
      const name = url.host ? decodeURIComponent(url.host) : url.pathname.replace(/^\/+/, '');
      const safeName = String(name || '').replace(/[\\/]/g, '');
      if (!safeName) return new Response('', { status: 404 });
      const filePath = resolveImageRef(`img://${safeName}`);
      if (!filePath) return new Response('', { status: 404 });
      // ?w=N → 返回降采样缩略图（画布/列表显示用，避免大图反复解码导致卡顿）
      const w = parseInt(url.searchParams.get('w') || '', 10);
      if (w && w > 0 && w < 4000) {
        try {
          const thumb = ensureThumb(filePath, safeName, w);
          if (thumb && fs.existsSync(thumb)) {
            return withCors(await net.fetch(pathToFileURL(thumb).toString()));
          }
        } catch {
          // 缩略图失败不影响使用：降级返回原图
        }
      }
      return withCors(await net.fetch(pathToFileURL(filePath).toString()));
    } catch {
      return new Response('', { status: 500 });
    }
  });

  // vid://<sha1>.<ext> → userData/videos/ 下的视频文件。
  // <video> 播放与拖动进度条会发 Range 请求，这里显式支持 206/Content-Range
  // （不支持 Range 时 Chromium 会整段下载，seek 体验差且大视频内存压力大）。
  protocol.handle('vid', async (req) => {
    try {
      const url = new URL(req.url);
      const name = url.host ? decodeURIComponent(url.host) : url.pathname.replace(/^\/+/, '');
      const safeName = String(name || '').replace(/[\\/]/g, '');
      if (!safeName) return new Response('', { status: 404 });
      const filePath = resolveVideoRef(`vid://${safeName}`);
      if (!filePath) return new Response('', { status: 404 });
      const stat = fs.statSync(filePath);
      const mime = /\.webm$/i.test(safeName) ? 'video/webm' : /\.mov$/i.test(safeName) ? 'video/quicktime' : 'video/mp4';
      const common: Record<string, string> = {
        'Content-Type': mime,
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Cache-Control': 'no-cache',
      };
      const range = req.headers.get('range');
      const m = range ? /bytes=(\d*)-(\d*)/.exec(range) : null;
      if (m) {
        let start = m[1] ? parseInt(m[1], 10) : 0;
        let end = m[2] ? parseInt(m[2], 10) : stat.size - 1;
        if (!Number.isFinite(start) || start < 0) start = 0;
        if (!Number.isFinite(end) || end >= stat.size) end = stat.size - 1;
        if (start > end || start >= stat.size) {
          return new Response('', { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } });
        }
        const stream = fs.createReadStream(filePath, { start, end });
        return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
          status: 206,
          headers: {
            ...common,
            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
            'Content-Length': String(end - start + 1),
          },
        });
      }
      const stream = fs.createReadStream(filePath);
      return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
        status: 200,
        headers: { ...common, 'Content-Length': String(stat.size) },
      });
    } catch (e) {
      console.error('[vid-store] 读取失败:', (e instanceof Error ? e.message : String(e)));
      return new Response('', { status: 500 });
    }
  });
  // appasset://<相对路径> → dist/ 下的静态资源（wasm 运行时、tflite 模型等）
  // 形如 appasset://mediapipe/vision_wasm_internal.wasm → dist/mediapipe/vision_wasm_internal.wasm
  protocol.handle('appasset', async (req) => {
    try {
      const url = new URL(req.url);
      // standard scheme 下 host 是路径首段，其余在 pathname
      const rel = decodeURIComponent(`${url.host || ''}${url.pathname || ''}`);
      // 同 D-4：产物态下 app 根在 `__dirname` 的上两级（静态资源根始终是 vite 的 `dist/`）
      const distRoot = path.resolve(__dirname, '..', '..', 'dist');
      const filePath = path.resolve(distRoot, rel.replace(/^[/\\]+/, ''));
      // 防路径穿越：解析后必须仍在 dist 根内
      if (filePath !== distRoot && !filePath.startsWith(distRoot + path.sep)) {
        return new Response('', { status: 403 });
      }
      let stat: Stats;
      try {
        stat = fs.statSync(filePath);
      } catch {
        console.warn('[appasset] 404:', rel);
        return new Response('', { status: 404 });
      }
      if (!stat.isFile()) return new Response('', { status: 404 });
      const buf = fs.readFileSync(filePath);
      return new Response(buf, {
        status: 200,
        headers: {
          'Content-Type': APPASSET_MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
          'Content-Length': String(buf.length),
          // MediaPipe 用 <script crossOrigin="anonymous"> 注入 wasm glue，
          // 且 wasm 二进制是跨源 fetch —— 必须放行 CORS，否则被拦。
          'Access-Control-Allow-Origin': '*',
          'Cross-Origin-Resource-Policy': 'cross-origin',
          'Cache-Control': 'no-cache',
        },
      });
    } catch (err) {
      console.error('[appasset] 读取失败:', (err instanceof Error ? err.message : String(err)));
      return new Response('', { status: 500 });
    }
  });
  createWindow();
  // 无水印资源捕获：对 dola / 豆包账号的 webview（标签页）做 CDP Fetch 拦截，抽聊天里的无水印图/视频
  dolaMedia.initDolaMedia({ getMainWindow: () => mainWindow });
  // Lovart 图片画廊：渲染端在 Lovart 页面里主动扫描出图片 URL（含历史图片），
  // 再由主进程带该账号 cookie 下载原图 → 推回画廊。取代了旧的 CDP 被动拦截方案：
  // 后者只能拦到挂 debugger 之后新发生的请求，用户在后台早已浏览过的图永远抓不到，
  // 且 urlPattern:'*' 全量拦 Response 会明显拖慢 Lovart 页面。
  lovartFetch.initLovartFetch({ getMainWindow: () => mainWindow });
  // Lovart 页面按 frame 全量扫描：webview.executeJavaScript 只能作用于顶层文档，
  // 编辑器若跑在嵌套/跨域 iframe 里会一图都扫不到；这里用
  // webContents.mainFrame.framesInSubtree 在每个 frame 里执行同一段采集脚本。
  // 同时把扫描/下载的关键事实落盘到 userData/lovart-diag.log，便于定位。
  lovartScan.initLovartScan({ getMainWindow: () => mainWindow });
  // 宿主壳只说意图：各域自注册自己的 IPC（TD-13-24）
  firefox.initFirefox();
  chromeCdp.initChromeCdp();
  license.initLicense();
  // 剪贴板域要一个**不由它实现**的东西：`img://` → 本地路径（存储/媒体域）
  clipboardImage.initClipboardImage({ resolveImageRef });
  // api 域要两个**不由它实现**的东西：窗口（事件回推）· `img://` 解析（存储/媒体域）
  apiBridge.initApi({ getMainWindow: () => mainWindow, resolveImageRef });
  console.log(`[dola-media] 调试日志写入文件：${dmDebugLogPath}（双击 .app 启动时请直接打开此文件查看 [dola-media] 日志）`);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC 注册唯一入口（守卫在注册处统一施加）见 `electron/ipc.ts`

// 导入素材文件：主进程直接读取 → 落盘 → 返回 img:// 引用列表
// （不再把大 base64 送回渲染进程，避免内存与 IPC 膨胀）
handle('import-files', async () => {
  if (!mainWindow) return [];
  const res = await dialog.showOpenDialog(mainWindow, {
    title: '导入素材',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: '图片素材', extensions: IMAGE_EXT }],
  });
  if (res.canceled || !res.filePaths || res.filePaths.length === 0) return [];
  return res.filePaths.map((p) => {
    const buf = fs.readFileSync(p);
    const ext = path.extname(p).slice(1).toLowerCase() || 'png';
    const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    return {
      name: path.basename(p, path.extname(p)),
      fullName: path.basename(p),
      dataUrl: persistImageDataUrl(`data:${mime};base64,${buf.toString('base64')}`),
    };
  });
});

// 同步保存图片：渲染进程持久化时把 dataUrl 批量转成 img:// 引用（sendSync 保证同步返回）
on('img-save-sync', (e, dataUrl) => {
  const ev = asRecord(e);
  ev['returnValue'] = persistImageDataUrl(dataUrl);
});

// 远端图片直链 → dataUrl（文生图后台通道用：CDP 抓到的无水印图是临时签名直链，
// 渲染进程有 CORS 拿不到，统一走主进程下载转 base64；上限 20MB 防滥用）
handle('image-fetch-dataurl', async (_e, url) => {
  if (!/^https?:\/\//i.test(String(url || ''))) return { ok: false, error: 'bad-url' };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30000);
  let res: Response;
  try {
    res = await fetch(String(url), { signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 20 * 1024 * 1024) return { ok: false, error: 'too-large' };
  const ct = String((res.headers && res.headers.get && res.headers.get('content-type')) || 'image/jpeg');
  const mime = ct.startsWith('image/') ? ct.split(';')[0] : 'image/jpeg';
  return { ok: true, mime, dataUrl: `data:${mime};base64,${buf.toString('base64')}` };
});

// 清理浏览器缓存：删除各账号分区与应用级的纯缓存目录（Cache / Code Cache / GPUCache）。
// 这些文件可自动重建，删除后页面首次打开会稍慢一点；登录态存在 Local Storage / Cookies /
// IndexedDB 里，不会受影响，账号不会掉线。用于释放长期积累的十几 GB 磁盘占用。
handle('clear-browser-cache', async () => {
  const targets: string[] = []; // 仅这些名称属于「纯缓存」
  const cacheNames = new Set(['Cache', 'Code Cache', 'CodeCache', 'GPUCache', 'DawnGraphiteCache', 'DawnWebGPUCache']);
  const userData = app.getPath('userData');
  const partitionsDir = path.join(userData, 'Partitions');
  try {
    if (fs.existsSync(partitionsDir)) {
      for (const p of fs.readdirSync(partitionsDir)) {
        const base = path.join(partitionsDir, p);
        if (!fs.statSync(base).isDirectory()) continue;
        for (const name of fs.readdirSync(base)) {
          if (cacheNames.has(name)) targets.push(path.join(base, name));
        }
      }
    }
    for (const name of fs.readdirSync(userData)) {
      if (cacheNames.has(name)) {
        const full = path.join(userData, name);
        if (fs.statSync(full).isDirectory()) targets.push(full);
      }
    }
  } catch (e) {
    // 语境前缀是守卫不做的 ⇒ 就地保留；回执转换交注册处
    throw new Error('扫描缓存目录失败: ' + (e instanceof Error ? e.message : String(e)));
  }
  let freed = 0;
  let failed = 0;
  for (const dir of targets) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      freed += 1;
    } catch {
      failed += 1; // 页面正在占用时可能删不掉，忽略即可（下次启动再清）
    }
  }
  return { ok: true, cleared: freed, failed };
});

// 跨界面拖放：渲染进程在「出新图」面板里长按图片后调用，主进程把图片落盘为真实文件，
// 再调用 webContents.startDrag 启动一次系统级文件拖拽。用户把光标拖到 Lovart / Tapnow 的
// webview 内松手，guest 页面（若自身有图片拖放处理）即收到该文件作为素材。
// 入参 payload：{ dataUrl, path, name } —— 传 dataUrl 时主进程就地落盘并取真实路径；
// 传 path 时直接使用（已是 img:// 落盘文件），优先用 path 避免重复写盘。
// ⚠️ 2026-10-11 更正：此处原写「thumbDataUrl 可选：若提供，会额外落盘一张轻量缩略图…」，
//    **那是假承诺** —— 本 handler 从不读 `thumbDataUrl`（全文件仅注释提到它）。拖拽 icon 一律由
//    下方 `nativeImage.createFromPath(filePath).resize({width:64})` 从**原图**生成
//    （`docs/10` #53「拖拽预览 icon 必须是 64px」）。⇒ 该字段已从渲染层端口删除（幽灵字段）。
// 真正 drop 到页面的文件仍是原图 filePath，保证画质。
on('start-file-drag', (e, payload) => {
  const ev = asRecord(e);
  const p = asRecord(payload);
  const win =
    (BrowserWindow.fromWebContents &&
      BrowserWindow.fromWebContents(ev['sender'] as unknown as WebContents)) ||
    mainWindow;
  if (!win || win.isDestroyed()) return;
  let filePath = (p['path'] as string | null | undefined) || null;
  if (!filePath && p['dataUrl']) {
    try {
      const ref = persistImageDataUrl(p['dataUrl']);
      filePath = resolveImageRef(ref);
    } catch (err) {
      console.warn('[start-file-drag] 原图落盘失败：', err instanceof Error ? err.message : String(err));
    }
  }
  if (!filePath) return;

  // 拖拽预览 icon 必须是小缩略图（用户要求和面板缩略图同尺寸），
  // 因此直接从原图生成 64px NativeImage，避免原图作为 icon 导致拖拽时显示大图。
  let icon: Electron.NativeImage | null | undefined;
  try {
    const raw = nativeImage.createFromPath(filePath);
    if (!raw.isEmpty()) {
      icon = raw.resize({ width: 64, quality: 'good' });
    }
  } catch (err) {
    console.warn('[start-file-drag] 生成拖拽预览 icon 失败：', err instanceof Error ? err.message : String(err));
  }
  if (!icon || (typeof icon.isEmpty === 'function' && icon.isEmpty())) {
    try {
      icon = nativeImage.createEmpty();
    } catch {
      icon = null;
    }
  }
  try {
    // 源写 `icon: icon || undefined`（键恒在、值可能 undefined）；electron 的 `Item.icon` 类型标成必填
    // ⇒ 断言只为过声明类型（编译期擦除，运行期还是同一个值）
    win.webContents.startDrag({ file: filePath, icon: (icon || undefined) as Electron.NativeImage });
  } catch (err) {
    console.warn('[start-file-drag] startDrag 失败：', err instanceof Error ? err.message : String(err));
  }
});

// 保存画布到文件
handle('save-file', async (_e, content) => {
  if (!mainWindow) return false;
  const res = await dialog.showSaveDialog(mainWindow, {
    title: '保存画布',
    defaultPath: 'doubao-canvas.json',
    filters: [{ name: '豆包画布', extensions: ['json'] }],
  });
  if (res.canceled || !res.filePath) return false;
  // `content` 来自渲染层（字符串）⇒ 断言只为过声明类型，不做运行期改写
  fs.writeFileSync(res.filePath, content as string, 'utf-8');
  return true;
});

// 从文件加载画布
handle('load-file', async () => {
  if (!mainWindow) return null;
  const res = await dialog.showOpenDialog(mainWindow, {
    title: '打开画布',
    properties: ['openFile'],
    filters: [{ name: '豆包画布', extensions: ['json'] }],
  });
  if (res.canceled || !res.filePaths || res.filePaths.length === 0) return null;
  // 上一行已保证长度 > 0 ⇒ 断言只为过 `noUncheckedIndexedAccess`，运行期同一个值
  return fs.readFileSync(res.filePaths[0] as string, 'utf-8');
});

// 打开外部链接（豆包账号等）
handle('open-external', async (_e, url) => {
  await shell.openExternal(String(url));
  return true;
});

// ─────────────────────────────────────────────────────────────
// 把参考图作为「真实文件」直接喂给目标 webview 的上传控件（CDP）
// ─────────────────────────────────────────────────────────────
// 为什么不用剪贴板粘贴：
//   ① Electron 44 主进程 clipboard 没有 writeImage（已实测 undefined）；
//   ② 即便把 image/png 成功写进系统剪贴板（navigator.clipboard.write 回读校验通过），
//      豆包的 ProseMirror 编辑器对「剪贴板位图」粘贴不敏感 —— webContents.paste()
//      与真实 Cmd+V 都不会生成附件（已用截图取证确认）。
// 因此改用 Chrome DevTools Protocol 的 DOM.setFileInputFiles：直接把磁盘文件塞进
// 豆包隐藏的 <input type="file">，豆包会自行上传并渲染缩略图附件（实测单张图 →
// 1 个 change 事件 + 52px 缩略图；连续调用两次会「追加」而非覆盖，顺序即数组顺序）。
// ─────────────────────────────────────────────────────────────

// 清理过期的中转图片（避免 tmp 目录无限增长）
function sweepAttachTmp(dir: string, maxAgeMs: number): void {
  try {
    const now = Date.now();
    for (const f of fs.readdirSync(dir)) {
      try {
        const p = path.join(dir, f);
        const st = fs.statSync(p);
        if (now - st.mtimeMs > maxAgeMs) fs.unlinkSync(p);
      } catch {
        /* 单个文件清理失败忽略 */
      }
    }
  } catch {
    /* 目录不存在等忽略 */
  }
}

/** `pickImageFileInput` 的回执 */
interface PickedFileInput {
  nodeId: number;
  accept: string;
  reason?: string;
}

// 在目标页面里挑出「图片型」file input（豆包同时存在文档类与图片类两个 input）
async function pickImageFileInput(dbg: WebContents['debugger']): Promise<PickedFileInput> {
  const doc = (await dbg.sendCommand('DOM.getDocument', { depth: -1, pierce: true })) as {
    root?: { nodeId?: number };
  };
  const rootId = doc && doc.root ? doc.root.nodeId ?? 0 : 0;
  if (!rootId) return { nodeId: 0, accept: '', reason: '拿不到 DOM 根节点' };
  let ids: number[] = [];
  try {
    const q = (await dbg.sendCommand('DOM.querySelectorAll', { nodeId: rootId, selector: 'input[type=file]' })) as {
      nodeIds?: number[];
    };
    ids = (q && q.nodeIds) || [];
  } catch {
    ids = [];
  }
  if (!ids.length) return { nodeId: 0, accept: '', reason: '页面里没有 input[type=file]' };

  let fallback: PickedFileInput | null = null;
  for (const nid of ids) {
    let accept = '';
    try {
      const d = (await dbg.sendCommand('DOM.describeNode', { nodeId: nid })) as {
        node?: { attributes?: string[] };
      };
      const attrs = (d && d.node && d.node.attributes) || [];
      for (let i = 0; i < attrs.length; i += 2) if (attrs[i] === 'accept') accept = String(attrs[i + 1] || '');
    } catch {
      /* 读不到属性就退化为无 accept */
    }
    if (/\.png|\.jpe?g|\.webp|image\//i.test(accept)) return { nodeId: nid, accept };
    if (!fallback) fallback = { nodeId: nid, accept };
  }
  return fallback || { nodeId: 0, accept: '', reason: '未找到可用 file input' };
}

/** `attach-images-to-webview` 的回执（源里是就地建的对象） */
interface AttachImagesOut {
  ok: boolean;
  via: string;
  files: { index: number; label: string; filePath: string; bytes: number; reused: boolean }[];
  errors: string[];
  nodeId?: number;
  accept?: string;
  count?: number;
}

// 容错靠内层 `out.errors` 累积（不抛）⇒ 无外层 catch，注册处守卫仅作兜底
handle('attach-images-to-webview', async (_e, webContentsId, imgs) => {
  // imgs: [{ dataUrl, label }]，数组顺序即参考图顺序
  const out: AttachImagesOut = { ok: false, via: 'cdp-file-input', files: [], errors: [] };
  const wc = webContents.fromId(Number(webContentsId));
  if (!wc) {
    out.errors.push(`找不到目标 webContents: ${String(webContentsId)}`);
    return out;
  }
  const list = Array.isArray(imgs) ? imgs : [];
  if (!list.length) {
    out.errors.push('图片列表为空');
    return out;
  }

  const tmpDir = path.join(os.tmpdir(), 'doubao-canvas', 'attach');
  try {
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  } catch {
    /* 忽略 */
  }
  sweepAttachTmp(tmpDir, 6 * 60 * 60 * 1000); // 清掉 6 小时前的中转文件

  // ① 先把每张参考图落成真实文件（img:// 引用直接复用素材原文件，不复制）
  for (let i = 0; i < list.length; i++) {
    const img = asRecord(list[i]);
    const label = (img['label'] as string | undefined) || `参考图${i + 1}`;
    try {
      const dataUrl = String(img['dataUrl'] || '');
      let filePath: string | null = null;
      let reused = false;
      if (dataUrl.startsWith('img://')) {
        filePath = resolveImageRef(dataUrl);
        if (!filePath) {
          out.errors.push(`[${i}] ${label}: img:// 素材原文件不存在`);
          continue;
        }
        reused = true;
      } else {
        const m = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
        if (!m) {
          out.errors.push(`[${i}] ${label}: dataUrl 格式无效`);
          continue;
        }
        const ext = ((m[1] ?? '').split('/')[1] || 'png').toLowerCase().replace('jpeg', 'jpg');
        const safe = String(label).replace(/[\\/:"*?<>|]/g, '_').slice(0, 40);
        filePath = path.join(tmpDir, `${String(i).padStart(2, '0')}-${safe}-${Date.now()}.${ext}`);
        fs.writeFileSync(filePath, Buffer.from(m[2] ?? '', 'base64'));
      }
      if (!filePath || !fs.existsSync(filePath)) {
        out.errors.push(`[${i}] ${label}: 文件落盘失败`);
        continue;
      }
      const bytes = fs.statSync(filePath).size;
      if (!bytes) {
        out.errors.push(`[${i}] ${label}: 图片数据为空`);
        continue;
      }
      out.files.push({ index: i, label, filePath, bytes, reused });
    } catch (err) {
      out.errors.push(`[${i}] ${label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (!out.files.length) {
    out.errors.push('没有任何可用的图片文件');
    return out;
  }

  // ② 用 CDP 把文件按顺序喂给豆包的上传控件
  const dbg = wc.debugger;
  let attachedHere = false;
  try {
    if (!dbg) throw new Error('该 webContents 不支持 debugger');
    if (!dbg.isAttached()) {
      dbg.attach('1.3');
      attachedHere = true;
    }
    await dbg.sendCommand('DOM.enable');
    const picked = await pickImageFileInput(dbg);
    out.nodeId = picked.nodeId;
    out.accept = picked.accept;
    if (!picked.nodeId) throw new Error(picked.reason || '未找到豆包的 file input');
    await dbg.sendCommand('DOM.setFileInputFiles', {
      files: out.files.map((f) => f.filePath),
      nodeId: picked.nodeId,
    });
    out.ok = true;
    out.count = out.files.length;
  } catch (err) {
    out.errors.push(`CDP 喂文件失败: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    if (attachedHere) {
      try {
        dbg.detach();
      } catch {
        /* 忽略 */
      }
    }
  }

  // ③ 上传已在浏览器侧接管，延迟回收中转文件（不立刻删：Chromium 读取文件是惰性的）
  if (out.ok) {
    const strays = out.files.filter((f) => !f.reused).map((f) => f.filePath);
    if (strays.length) {
      const t = setTimeout(() => {
        strays.forEach((p) => {
          try {
            fs.unlinkSync(p);
          } catch {
            /* 忽略 */
          }
        });
      }, 5 * 60 * 1000);
      if (t && typeof t.unref === 'function') t.unref();
    }
  } else {
    out.files.forEach((f) => {
      if (!f.reused) {
        try {
          fs.unlinkSync(f.filePath);
        } catch {
          /* 忽略 */
        }
      }
    });
  }

  return out;
});

// 复制文本到系统剪贴板（用于真实粘贴发送）
// 【最终安全网】即使渲染进程的 stripHtmlToText 失效，此处也会拦截所有 HTML 标签和实体
// 【关键】必须先 clear() 再 writeText()，防止剪贴板残留 text/html 等富文本格式
//         导致豆包 webview 的 paste 事件读取到含标签的 HTML 而非纯文本
handle('copy-text-to-clipboard', async (_e, text) => {
  let clean = String(text || '');

  // ── Step 1: 反复移除所有 HTML 标签（含自定义标签如 <sc-clipboard>）──
  // 条件：只要包含 <字母 或 <数字 就触发清理（避免误判数学表达式）
  if (/<[a-zA-Z\/!]/.test(clean)) {
    let prev = '';
    let iter = 0;
    while (clean !== prev && iter < 15) {
      prev = clean;
      clean = clean.replace(/<[^>]*>/g, '');
      iter++;
    }
  }

  // ── Step 2: 解码所有 HTML 实体（防止 &quot; &amp; &nbsp; &#NNN; &#xHHH; 残留）──
  clean = clean
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, cp: string) => String.fromCharCode(parseInt(cp, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, cp: string) => String.fromCharCode(parseInt(cp, 16)));

  // ── Step 3: 清理空白 ──
  clean = clean.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

  // ── Step 4: 清空剪贴板所有格式后再写入纯文本 ──
  // （防止残留 text/html 格式导致豆包 webview paste 读到富文本）
  // ⚠ Electron 44：clear()/writeText() 返回 Promise，必须 await，
  //   否则「清空」和「写入」竞争，可能写完就被清空，paste 拿到空文本。
  await clipboard.clear();
  await clipboard.writeText(clean);

  return { ok: true, cleanedLen: clean.length };
});

// 在指定 webview 的 webContents 中触发真实粘贴（等同用户按 Cmd+V）
// 豆包原生 paste 处理器会把系统剪贴板内容写入 React state，规避合成事件无效的问题
handle('paste-to-webview', async (_e, webContentsId) => {
  const wc = webContents.fromId(Number(webContentsId));
  if (!wc) return { ok: false, error: '找不到 webContents: ' + String(webContentsId) };
  wc.paste();
  return { ok: true };
});

// ============================================================
// 账号导入导出 —— cookie 级别会话数据
// ============================================================

/** cookie 的 sameSite 取值（electron 的 `CookiesSetDetails['sameSite']` 含 undefined ⇒ 单列一个） */
type SameSite = 'unspecified' | 'no_restriction' | 'lax' | 'strict';

/** 账号导出里的一条 cookie（源里就地 map 出的形状；两个字段都可能缺席 ⇒ 显式 `| undefined`） */
interface AccountCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  expirationDate?: number | undefined;
  sameSite?: SameSite | undefined;
}

// 读取指定 partition 持久化会话的全部 cookie
handle('export-account-cookies', async (_e, partition) => {
  const ses = session.fromPartition(String(partition));
  const cookies = await ses.cookies.get({});
  // 序列化：移除 hostOnly/sameSite 等无法直接 set 的只读字段，保留核心字段
  const clean: AccountCookie[] = cookies.map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain as string,
    path: c.path || '/',
    secure: c.secure || false,
    httpOnly: c.httpOnly || false,
    expirationDate: c.expirationDate,
    sameSite: (c.sameSite || 'unspecified') as SameSite,
  }));
  return { ok: true, cookies: clean, count: clean.length };
});

// 将一组 cookie 写入指定 partition 的持久化会话
handle('import-account-cookies', async (_e, partition, cookies) => {
  const ses = session.fromPartition(String(partition));
  let okCount = 0;
  const list = Array.isArray(cookies) ? cookies : [];
  for (const raw of list) {
    const c = asRecord(raw);
    try {
      const domain = String(c['domain'] || '');
      const url = `${c['secure'] ? 'https' : 'http'}://${domain.replace(/^\./, '')}${String(c['path'] || '/')}`;
      await ses.cookies.set({
        url,
        name: String(c['name'] || ''),
        value: String(c['value'] || ''),
        domain,
        path: String(c['path'] || '/'),
        secure: Boolean(c['secure']),
        httpOnly: Boolean(c['httpOnly']),
        ...(typeof c['expirationDate'] === 'number' ? { expirationDate: c['expirationDate'] } : {}),
        sameSite: String(c['sameSite'] || 'unspecified') as SameSite,
      });
      okCount++;
    } catch {
      /* 单个 cookie 失败不中断 */
    }
  }
  return { ok: true, restored: okCount, total: list.length };
});

// 保存账号导出文件
handle('save-accounts-file', async (_e, content) => {
  if (!mainWindow) return { ok: false, error: '窗口未就绪' };
  const res = await dialog.showSaveDialog(mainWindow, {
    title: '导出豆包账号',
    defaultPath: `doubao-accounts-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: '豆包账号备份', extensions: ['json'] }],
  });
  if (res.canceled || !res.filePath) return { ok: false, error: '已取消' };
  fs.writeFileSync(res.filePath, content as string, 'utf-8');
  return { ok: true, path: res.filePath };
});

// 打开账号导入文件
handle('load-accounts-file', async () => {
  if (!mainWindow) return null;
  const res = await dialog.showOpenDialog(mainWindow, {
    title: '导入豆包账号',
    properties: ['openFile'],
    filters: [{ name: '豆包账号备份', extensions: ['json'] }],
  });
  if (res.canceled || !res.filePaths || res.filePaths.length === 0) return null;
  // 上一行已保证长度 > 0 ⇒ 断言只为过 `noUncheckedIndexedAccess`，运行期同一个值
  return fs.readFileSync(res.filePaths[0] as string, 'utf-8');
});

// 选择下载目录
handle('select-folder', async () => {
  if (!mainWindow) return null;
  const res = await dialog.showOpenDialog(mainWindow, {
    title: '选择下载目录',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (res.canceled || !res.filePaths || res.filePaths.length === 0) return null;
  return res.filePaths[0];
});

/** 下载回执（源里是就地 return 的字面量） */
type DownloadResult = { ok: true; path: string; size: number } | { ok: false; error: string };

// 下载文件到指定路径（支持重定向跟随）
function downloadUrl(url: string, filePath: string): Promise<DownloadResult> {
  /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports --
     §7 C-3：**函数内惰性 require 保留原样**（源如此）；§7 C-3 授权局部放行。 */
  const { net } = require('electron') as typeof import('electron');
  /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports */
  return new Promise((resolve) => {
    try {
      const request = net.request({ url, method: 'GET' });
      const chunks: Buffer[] = [];
      request.on('response', (response) => {
        const location = response.headers['location'];
        if (response.statusCode >= 300 && response.statusCode < 400 && typeof location === 'string') {
          resolve(downloadUrl(location, filePath));
          return;
        }
        if (response.statusCode !== 200) {
          resolve({ ok: false, error: 'http_' + response.statusCode });
          return;
        }
        response.on('data', (d: Buffer) => chunks.push(d));
        response.on('end', () => {
          try {
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(filePath, Buffer.concat(chunks));
            resolve({ ok: true, path: filePath, size: Buffer.concat(chunks).length });
          } catch (writeErr) {
            resolve({ ok: false, error: writeErr instanceof Error ? writeErr.message : String(writeErr) });
          }
        });
        response.on('error', (err: Error) => resolve({ ok: false, error: err.message || String(err) }));
      });
      request.on('error', (err: Error) => resolve({ ok: false, error: err.message || String(err) }));
      request.end();
    } catch (ex) {
      resolve({ ok: false, error: ex instanceof Error ? ex.message : String(ex) });
    }
  });
}

handle('download-file', async (_e, url, filePath) => {
  if (!url || !filePath) return { ok: false, error: 'missing_args' };
  const target = String(filePath);
  // vid:// 引用：文件已在本地，直接复制（不走网络）
  if (typeof url === 'string' && url.startsWith('vid://')) {
    const src = resolveVideoRef(url);
    if (!src) return { ok: false, error: '视频文件不存在（vid:// 引用失效）' };
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(src, target);
      return { ok: true, path: target, size: fs.statSync(src).size };
    } catch (e) {
      return { ok: false, error: (e && (e instanceof Error ? e.message : String(e))) || String(e) };
    }
  }
  // img:// 引用：图片本体已在本地，直接复制（不走网络）—— 与 download-file-as 同口径
  if (typeof url === 'string' && url.startsWith('img://')) {
    const src = resolveImageRef(url);
    if (!src) return { ok: false, error: '图片文件不存在（img:// 引用失效）' };
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(src, target);
      return { ok: true, path: target, size: fs.statSync(src).size };
    } catch (e) {
      return { ok: false, error: (e && (e instanceof Error ? e.message : String(e))) || String(e) };
    }
  }
  // data: URL：内联 base64，直接解码落盘
  const dm = typeof url === 'string' ? url.match(/^data:([^;,]+);base64,(.+)$/) : null;
  if (dm) {
    try {
      const buf = Buffer.from(dm[2] ?? '', 'base64');
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, buf);
      return { ok: true, path: target, size: buf.length };
    } catch (e) {
      return { ok: false, error: (e && (e instanceof Error ? e.message : String(e))) || String(e) };
    }
  }
  return downloadUrl(String(url), target);
});

// 视频本地化：把远端视频直链下载进 userData/videos/，返回 vid:// 引用。
// 先带豆包 Referer（多数 CDN 防盗链要求）下载；失败再不带 Referer 试一次。
// 下载失败不影响原直链继续使用（渲染层保留原 URL，行为同旧版）。
handle('save-video-from-url', async (_e, p) => {
  const pp = asRecord(p);
  const url = pp['url'];
  if (!url) return { ok: false, error: 'missing_args' };
  const r = await saveVideoFromUrl(url, pp['referer'] || 'https://www.doubao.com/');
  if (r.ok) return r;
  const r2 = await saveVideoFromUrl(url, '');
  return r2.ok ? r2 : r;
});

// 下载并「另存为」：先弹原生保存对话框让用户选路径（默认落在「下载」目录），确认后才下载。
// 之所以要有这条：download-file 只传文件名时会被解析成**相对路径**，结果静默落在应用工作目录里，
// 用户既不知道存到哪、也无从设置路径。这里把「选路径」做进流程，并把最终绝对路径回传给渲染层展示。
handle('download-file-as', async (_e, url, defaultName, filters) => {
  if (!url) return { ok: false, error: 'missing_args' };
  if (!mainWindow) return { ok: false, error: 'no_window' };
  // 文件名做一次清洗：macOS/Windows 都不允许 / \ : * ? " < > | 出现在文件名里
  const safeName = String(defaultName || 'download').replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
  let defaultDir = app.getPath('downloads');
  try {
    if (!fs.existsSync(defaultDir)) defaultDir = app.getPath('home');
  } catch {
    defaultDir = app.getPath('home');
  }
  const res = await dialog.showSaveDialog(mainWindow, {
    title: '保存到…',
    defaultPath: path.join(defaultDir, safeName),
    // `filters` 来自渲染层（原生对话框过滤器）⇒ 断言只为过声明类型
    filters:
      Array.isArray(filters) && filters.length ? (filters as Electron.FileFilter[]) : [{ name: '所有文件', extensions: ['*'] }],
  });
  if (!res || res.canceled || !res.filePath) return { ok: false, canceled: true };
  // 收成局部变量：下面几处在闭包（try/catch）里用 ⇒ TS 不保留属性收窄，源用的就是同一个值
  const outPath = res.filePath;
  // vid:// 引用：文件已在本地，直接复制到用户选的路径（不走网络）
  if (typeof url === 'string' && url.startsWith('vid://')) {
    const src = resolveVideoRef(url);
    if (!src) return { ok: false, canceled: false, error: '视频文件不存在（vid:// 引用失效）' };
    try {
      fs.copyFileSync(src, outPath);
      return { ok: true, canceled: false, path: outPath, size: fs.statSync(src).size };
    } catch (e) {
      return { ok: false, canceled: false, error: (e && (e instanceof Error ? e.message : String(e))) || String(e) };
    }
  }
  // img:// 引用：图片本体已在本地（userData/images/），同样直接复制（不走网络）。
  // ⚠ 不补这条的话 img:// 会落到 downloadUrl → net 只吃 http/https，
  //   文生图卡片「另存为」必然报 ClientRequest 协议错误（实测踩坑）。
  if (typeof url === 'string' && url.startsWith('img://')) {
    const src = resolveImageRef(url);
    if (!src) return { ok: false, canceled: false, error: '图片文件不存在（img:// 引用失效）' };
    try {
      fs.copyFileSync(src, outPath);
      return { ok: true, canceled: false, path: outPath, size: fs.statSync(src).size };
    } catch (e) {
      return { ok: false, canceled: false, error: (e && (e instanceof Error ? e.message : String(e))) || String(e) };
    }
  }
  // data: URL：内联 base64，直接解码落盘（不走网络）
  const dm = typeof url === 'string' ? url.match(/^data:([^;,]+);base64,(.+)$/) : null;
  if (dm) {
    try {
      const buf = Buffer.from(dm[2] ?? '', 'base64');
      fs.writeFileSync(outPath, buf);
      return { ok: true, canceled: false, path: outPath, size: buf.length };
    } catch (e) {
      return { ok: false, canceled: false, error: (e && (e instanceof Error ? e.message : String(e))) || String(e) };
    }
  }
  const r = await downloadUrl(String(url), outPath);
  // 源写 `(r && r.path) || res.filePath`：失败分支没有 `path` 键 ⇒ 断言只为过声明类型（擦除）
  return { ...r, canceled: false, path: (r as { path?: string }).path || outPath };
});

// 在 Finder / 资源管理器中定位文件：
//   · 下载完成后的「在文件夹中显示」传的是**真实路径**；
//   · 素材节点右键「打开文件所在位置」传的是 **`img://` 引用**。
// ⇒ 一个入口收两种输入，由本 handler 自己判别并解析 —— 调用方**没有**「该调哪个方法」的选择余地。
handle('reveal-path', async (_e, p) => {
  if (!p) return { ok: false, error: 'missing_args' };
  // `p` 是 IPC 形参（`unknown`）⇒ 断言只为过声明类型（源直接把 `p` 交给 openPath，运行期就是字符串）
  const target = String(p).startsWith('img://') ? resolveImageRef(p) : (p as string);
  if (!target) return { ok: false, error: '未找到对应的本地文件（素材可能还没有落盘）' };
  shell.showItemInFolder(target);
  return { ok: true, path: target };
});

// ============================================================
// 授权激活
// ============================================================

// ============================================================
// 视频截图：捕获画布中指定屏幕区域的画面（绕过跨域 canvas 污染问题）
//   rect：渲染进程传入的「CSS 像素 × devicePixelRatio」矩形（相对 webContents 视口左上角）
//   返回裁剪后的 PNG dataUrl；区域超出视口时自动夹紧，完全不可见则返回错误
// ============================================================
handle('capture-rect', async (_e, rect) => {
  if (!mainWindow) return { ok: false, error: '窗口未就绪' };
  const img = await mainWindow.webContents.capturePage();
  if (!rect) return { ok: true, dataUrl: img.toDataURL() };
  const rc = asRecord(rect);
  const size = img.getSize();
  const x = Math.max(0, Math.min(Math.round(Number(rc['x'])), size.width));
  const y = Math.max(0, Math.min(Math.round(Number(rc['y'])), size.height));
  const w = Math.max(0, Math.min(Math.round(Number(rc['width'])), size.width - x));
  const h = Math.max(0, Math.min(Math.round(Number(rc['height'])), size.height - y));
  if (w <= 0 || h <= 0) {
    return { ok: false, error: 'capture-rect-out-of-bounds' };
  }
  const cropped = img.crop({ x, y, width: w, height: h });
  return { ok: true, dataUrl: cropped.toDataURL() };
});

// ============================================================
// 检测视频（方案 v2：webview 内部 fetch）
// 原理：通过主进程 wc.executeJavaScript() 在 webview 内执行 fetch，
//       自动携带浏览器完整 Cookie/认证头/TLS 指纹，避免 Node.js https
//       被服务端识别为非浏览器请求导致 empty_response
// ============================================================
handle('detect-videos', async (_e, webContentsId, seenKeys) => {
  const wc = webContents.fromId(Number(webContentsId));
  if (!wc || wc.isDestroyed()) return { ok: false, error: 'webview已销毁' };

  const wcUrl = wc.getURL();
  console.log('[detect-videos] webContentsId:', webContentsId, 'URL:', wcUrl);

  if (!wcUrl || wcUrl === 'about:blank') {
    return { ok: false, error: '页面未加载 url=' + wcUrl };
  }
  if (wc.isLoading()) {
    return { ok: false, error: '页面加载中' };
  }

  // ── 阶段0：验证 webview 可执行脚本（区分「注入失败」vs「脚本内报错」）──
  let injectOk: unknown = false;
  try {
    injectOk = await wc.executeJavaScript('({injectTest:true})');
  } catch (injectErr) {
    return {
      ok: false,
      error: 'inject_failed',
      _diag: {
        step: 'inject_test',
        detail: injectErr instanceof Error ? injectErr.message : String(injectErr),
        url: wcUrl,
      },
    };
  }
  if (!injectOk || !asRecord(injectOk)['injectTest']) {
    return { ok: false, error: 'inject_verify_failed', _diag: { step: 'inject_test', result: injectOk, url: wcUrl } };
  }

  // ── 阶段1：在 webview 内部执行的检测脚本（细粒度错误捕获）──
  // 使用同步返回 + 内部分步 try/catch，确保任何一步失败都能报告具体原因
  const DETECT_JS = `
(async function(){
  var BASE = '/samantha/aispace/';
  var PARAMS = 'aid=497858&device_platform=web&samantha_web=1&use-olympus-account=1&version_code=20800&pkg_type=release_version';
  var _keys = ${JSON.stringify(seenKeys || [])};
  var _diag = { pageUrl: (typeof location !== 'undefined' && location.href) || 'n/a', steps: [] };

  // 统一 fetch 请求，带诊断
  async function fetchApi(path, body, method) {
    var url = BASE + path + '?' + PARAMS;
    var opts = {
      method: method || 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    };
    if (opts.method === 'POST') opts.body = JSON.stringify(body || {});
    try {
      var resp = await fetch(url, opts);
      var text = await resp.text();
      _diag.steps.push(path + ':' + resp.status + ':' + text.length);
      if (!resp.ok) return { _httpError: 'HTTP_' + resp.status, status: resp.status, text: text.slice(0, 200) };
      if (!text || text.length === 0) return { _empty: true, status: resp.status };
      try { return JSON.parse(text); } catch(pe) { return { _parseError: pe.message, raw: text.slice(0, 200), rawLen: text.length }; }
    } catch(e) {
      _diag.steps.push(path + ':fetch_err:' + (e.name||'') + ':' + (e.message||''));
      return { _fetchError: (e.name||'') + ':' + (e.message||''), _type: e.name || 'Error' };
    }
  }

  // XHR 同步回退（fetch 失败时尝试）
  function xhrPost(path, body) {
    var x = new XMLHttpRequest();
    x.open('POST', BASE + path + '?' + PARAMS, false);
    x.setRequestHeader('Content-Type', 'application/json');
    try { x.send(JSON.stringify(body || {})); } catch(e) { return { _xhrError: e.message || String(e) }; }
    if (x.status !== 200) return { _httpError: 'HTTP_' + x.status, status: x.status };
    var t = x.responseText;
    if (!t || t.length === 0) return { _empty: true, status: x.status, headers: x.getAllResponseHeaders() || '' };
    try { return JSON.parse(t); } catch(pe) { return { _parseError: pe.message, rawLen: t.length }; }
  }

  try {
    // Step 1: 获取首页（fetch POST）
    var home = await fetchApi('homepage', {});
    if (home._fetchError) {
      // fetch 失败，尝试 XHR 回退
      var homeXhr = xhrPost('homepage', {});
      if (!homeXhr._xhrError && !homeXhr._httpError && !homeXhr._empty && !homeXhr._parseError) {
        home = homeXhr;
        _diag.steps.push('homepage:xhr_fallback_ok');
      } else {
        return { ok:false, error:'homepage_fetch_failed', detail: home._fetchError, xhrFallback: (homeXhr._xhrError||homeXhr._httpError||homeXhr._empty||homeXhr._parseError||'xhr_ok'), _diag: _diag };
      }
    }
    if (home._httpError) return { ok:false, error:'http_homepage', detail: home._httpError, _diag: _diag };
    if (home._empty) {
      // POST 空，尝试 GET
      var homeGet = await fetchApi('homepage', null, 'GET');
      if (!homeGet._fetchError && !homeGet._httpError && !homeGet._empty && !homeGet._parseError) {
        home = homeGet;
        _diag.steps.push('homepage:get_fallback_ok');
      } else {
        return { ok:false, error:'homepage_empty_response', detail: 'POST empty; GET fallback:' + (homeGet._fetchError||homeGet._httpError||homeGet._empty||homeGet._parseError||'?'), _diag: _diag };
      }
    }
    if (home._parseError) return { ok:false, error:'homepage_parse_error', detail: home._parseError, raw: home.raw || '', _diag: _diag };

    var children = (home.data && home.data.children) || [];
    var creationId = null;
    for (var ci = 0; ci < children.length; ci++) { if (children[ci].name === '我的创作') { creationId = children[ci].id; break; } }
    if (!creationId) {
      for (var cj = 0; cj < children.length; cj++) { if (children[cj].name && children[cj].name.indexOf('创作') !== -1) { creationId = children[cj].id; break; } }
    }
    if (!creationId) return { ok:false, error:'no_creation_folder', folderCount: children.length, folderNames: children.slice(0,5).map(function(c){return c.name}), _diag: _diag };

    // Step 2: 获取文件夹内容
    var nodeInfo = await fetchApi('node_info', {
      node_id: creationId, need_full_path: true, size: 50,
      sort_param: { need_sort_config: true, sort_order: 1, sort_type: 0 }
    });
    if (nodeInfo._fetchError) return { ok:false, error:'fetch_node_info', detail: nodeInfo._fetchError, _diag: _diag };
    if (nodeInfo._httpError) return { ok:false, error:'http_node_info', detail: nodeInfo._httpError, _diag: _diag };
    if (nodeInfo._empty) return { ok:false, error:'node_info_empty', _diag: _diag };
    if (nodeInfo._parseError) return { ok:false, error:'node_info_parse_error', detail: nodeInfo._parseError, _diag: _diag };

    var items = (nodeInfo.data && nodeInfo.data.children) || [];

    // Step 3: 遍历视频（所有视频都查下载链接，保证 ready 状态每次轮询都准确）
    var seenSet = {};
    for (var ki = 0; ki < _keys.length; ki++) seenSet[_keys[ki]] = 1;

    var videos = [];
    for (var idx = 0; idx < items.length; idx++) {
      var it = items[idx];
      if (!it.key || !/^v0/.test(it.key)) continue;
      if ((it.ext && /\\.(png|jpe?g|webp|gif|bmp)$/i.test(it.ext)) ||
          (it.file_type && /image/i.test(it.file_type))) continue;

      var entry = {
        key: it.key, id: it.id, name: it.name || '',
        created_at: it.created_at || it.updated_at || 0,
        ready: false, url: null, width: null, height: null, duration: null, poster: null
      };

      // 所有视频都查询下载链接（不再跳过已见视频）
      try {
        var dl = await fetchApi('get_download_info', { requests: [{ node_id: it.id }] });
        if (!dl._fetchError && !dl._httpError && !dl._empty && !dl._parseError && dl.data) {
          var di = dl.data.download_infos;
          var mu = di && di[0] && di[0].main_url;
          if (mu) {
            var dm = di && di[0] ? (di[0].meta || di[0]) : null;
            entry.ready = true; entry.url = mu;
            entry.width = dm ? (dm.width || null) : null;
            entry.height = dm ? (dm.height || null) : null;
            entry.duration = dm ? (dm.duration || null) : null;
            entry.poster = dm ? (dm.poster || null) : null;
          }
        }
      } catch(e_dl) { /* 单个视频下载信息获取失败不中断 */ }
      videos.push(entry);
    }

    videos.sort(function(a,b){ return (b.created_at||0) - (a.created_at||0); });
    return { ok:true, videos: videos, _diag: _diag };

  } catch(outerE) {
    return { ok:false, error:'unexpected', detail: (outerE&&outerE.message)||String(outerE), _diag: _diag };
  }
})()
`;

  // `executeJavaScript` 的返回类型是 `any` ⇒ 收成 `unknown` 再判（避免 any 泄漏）
  const rawResult: unknown = await wc.executeJavaScript(DETECT_JS).catch((execErr: unknown) => ({
    ok: false,
    error: 'exec:' + (execErr instanceof Error ? execErr.message : String(execErr)),
    _diag: { method: 'webview-fetch', url: wcUrl },
  }));

  if (!rawResult || typeof rawResult !== 'object') {
    return { ok: false, error: 'invalid_result_type:' + typeof rawResult };
  }
  return rawResult;
});

// 通过主进程在 webview 上执行错误检测脚本
// 回执含 `errors:[]`（与守卫的 `{ok:false,error}` 形状不同）⇒ 外层 try/catch 就地保留
handle('detect-errors', async (_e, webContentsId) => {
  try {
    const wc = webContents.fromId(Number(webContentsId));
    if (!wc || wc.isDestroyed()) return { ok: false, errors: [] };
    if (wc.isLoading() || wc.getURL() === 'about:blank') return { ok: false, errors: [] };

    const ERROR_JS = `
(function(){
  try {
    var errors = [];
    var allElements = document.querySelectorAll('div, span, p, [role="alert"], [class*="error"], [class*="toast"], [class*="notice"]');
    for (var i = 0; i < allElements.length; i++) {
      var el = allElements[i];
      var rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (window.getComputedStyle(el).display === 'none') continue;
      if (window.getComputedStyle(el).visibility === 'hidden') continue;
      var txt = (el.textContent || '').trim();
      if (!txt || txt.length < 4 || txt.length > 500) continue;
      var isError = false, type = 'other';
      var lower = txt.toLowerCase();
      if (/版权|copyright|侵权|违规|下架/.test(txt)) { isError = true; type = 'copyright'; }
      else if (/额度|配额|quota|用完|耗尽|超额|次数|每日/.test(lower)) { isError = true; type = 'quota'; }
      else if (/失败|生成失败|出错|error|无法|异常|失败/.test(lower)) { isError = true; type = 'generation_failed'; }
      else if (/网络|network|超时|timeout|连接|connection/.test(lower)) { isError = true; type = 'network'; }
      else if (/登录|login|认证|auth|授权|token|过期/.test(lower)) { isError = true; type = 'auth'; }
      if (isError) errors.push({ type:type, message:txt.slice(0,200) });
    }
    return { ok:true, errors:errors };
  } catch(e){ return { ok:false, errors:[], error:e.message||String(e)};}
})
`;
    const rawResult: unknown = await wc.executeJavaScript(`(${ERROR_JS})()`).catch((execErr: unknown) => ({
      ok: false,
      errors: [],
      error: 'exec:' + (execErr instanceof Error ? execErr.message : String(execErr)),
    }));
    if (!rawResult || typeof rawResult !== 'object') return { ok: false, errors: [] };
    return rawResult;
  } catch (err) {
    return { ok: false, errors: [], error: err instanceof Error ? err.message : String(err) };
  }
});

// 在 dola webview 主世界注入「30s/音频参考」脚本（移植自插件 duration-main.js）
// 该脚本不依赖 chrome.* 扩展 API，纯主世界注入即可生效；仅在 dola 账号 webContents 上调用。

// 由主进程直接对 webview 执行 JS，把真实时长下拉 DOM 拉回主进程写盘（绕过不可靠的 webview→主进程回传通道）。
// 这样只要脚本被注入、且 dola 页面加载过，~/dola-duration-debug.log 就一定会有真实结构数据，便于精准修复。
/* eslint-disable @typescript-eslint/no-require-imports --
   §7 C-1：`require` 保留原样（本文件顶层 require 与 `app.setPath` 的先后是求值顺序的一部分）；
   §7 C-3 授权局部放行。形状就地写成 `{ DUMP_EXPR: string }` —— 该模块是**不进编译面的 .js**
   （`electron/dola-duration-dump.js`，与 `dola-duration-main.js` 同族：文本即注入文本）⇒ 没有可导入的类型。 */
const { DUMP_EXPR } = require('./dola-duration-dump') as { DUMP_EXPR: string };
/* eslint-enable @typescript-eslint/no-require-imports */

handle('inject-dola-duration-main', async (_e, webContentsId) => {
  // 保底：本 handler 一旦被调用，立刻写这一行，证明触发（写在 wc 校验之前，避免 id 无效时连日志都没有）
  const logPath = path.join(os.homedir(), 'dola-duration-debug.log');
  const writeLog = (line: string): void => {
    try {
      fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${line}\n`);
    } catch {
      /* 忽略 */
    }
  };
  writeLog(`INJECT-START wcId=${String(webContentsId)}`);
  const wc = webContents.fromId(Number(webContentsId));
  if (!wc || wc.isDestroyed()) {
    writeLog(`INJECT-SKIP wcId=${String(webContentsId)} reason=webview已销毁或id无效`);
    return { ok: false, error: 'webview 已销毁或 id 无效' };
  }
  try {
    // 先打开 30s 开关（脚本以 localStorage 该键 === '1' 判断是否启用）
    // ★ TD-16-37：内层 `catch(e){}` 是**注入到页面的串** ⇒ 页内，刻意静默（豁免）；
    //   外层 `.catch` 是**主进程**的 ⇒ 必须留痕（否则"开关没打开"永远查不出来）
    await wc
      .executeJavaScript("try{localStorage.setItem('intl_doubao_enable_30s_v1','1')}catch(e){}")
      .catch((e: unknown) =>
        console.warn('[dola-30s] 打开 30s 开关失败（注入页面前置步骤）:', e instanceof Error ? e.message : String(e)),
      );
    const script = fs.readFileSync(path.join(__dirname, 'dola-duration-main.js'), 'utf8');
    writeLog(`INJECT-SCRIPT scriptLen=${script.length}`);
    // ★ **站点域名由宿主传参**（2026-10-14 收口）：`dola-duration-main.js` 是**函数表达式**，
    //   这里补上调用并把层 1 的唯一真源喂进去（`SITE_HOSTS` 来自 `electron/site-hosts.js`）。
    //   ⚠️ 为什么是传参而不是"脚本里写一份镜像 + 两侧对账"：注入脚本跑在 guest 主世界、
    //      **不能 require**；传参让**域名的值**只有一处（对账只是给两份加护栏）。
    //      ⚠️ **归属判定不在此列**：guest 侧另有一份同口径的判定形状（跨世界不可消 ⇒
    //         登记为残留，见 `docs/判据登记表.md` §4「站点域名」行）。
    //   ⚠️ 改这里必须同步改 `dola-duration-main.js`（它已去掉自调用，单独跑不会再自执行）。
    await wc.executeJavaScript(`(${script})(${JSON.stringify({ SITE_HOSTS: siteHosts.SITE_HOSTS })})`);
    writeLog(`INJECT-DONE wcId=${String(webContentsId)}`);

    // 主进程主动拉取真实时长 DOM（每 3s，DOM 变化时写盘），绕过 webview→主进程的不可靠回传通道
    let lastSig = '';
    // 源就是 `setInterval(async () => …)`（fire-and-forget 轮询）⇒ 闸要求显式说明：
    // 回调里的 promise 由内部 try/catch 兜住，不向外抛（改成外层 void 包一层会动定时逻辑）
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    const dumpTimer = setInterval(async () => {
      if (!wc || wc.isDestroyed()) {
        clearInterval(dumpTimer);
        return;
      }
      try {
        const res: unknown = await wc.executeJavaScript(DUMP_EXPR);
        const sig = String(res).slice(0, 400);
        if (sig !== lastSig) {
          lastSig = sig;
          writeLog(`DUMP ${String(res)}`);
        }
      } catch {
        /* 忽略单次拉取失败 */
      }
    }, 3000);
    wc.once('destroyed', () => clearInterval(dumpTimer));

    return { ok: true };
  } catch (err) {
    // 写诊断日志是守卫不做的（守卫只把异常转回执）⇒ 就地保留；回执转换交注册处
    writeLog(`INJECT-ERROR ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
});

// 30s 时长诊断日志：主世界注入脚本通过 window.api.dolaDurationDiag 回传诊断行，
// 落盘到 ~/dola-duration-debug.log，便于排查「30s 失效」时真实的生成接口路径与 model 取值。
handle('dola-duration-diag', async (_e, message) => {
  const logPath = path.join(os.homedir(), 'dola-duration-debug.log');
  const line = `[${new Date().toISOString()}] ${String(message || '')}\n`;
  fs.appendFileSync(logPath, line);
  return { ok: true, path: logPath };
});

// 导出机器码为文本文件
handle('export-machine-code', async (_e, machineCode) => {
  if (!mainWindow) return { ok: false, error: '窗口未就绪' };
  const res = await dialog.showSaveDialog(mainWindow, {
    title: '导出机器码',
    defaultPath: `machine-code-${new Date().toISOString().slice(0, 10)}.txt`,
    filters: [{ name: '文本文件', extensions: ['txt'] }],
  });
  if (res.canceled || !res.filePath) return { ok: false, error: '已取消' };
  fs.writeFileSync(res.filePath, String(machineCode || ''), 'utf-8');
  return { ok: true, path: res.filePath };
});

// ============================================================
// 指纹伪装：渲染进程为每个账号请求生成本账号专属的 webview preload 文件
// acc = { id, partition, fingerprint }
// 返回 { ok, preloadUrl }，渲染进程将其作为 <webview preload> 属性挂载
// ============================================================
handle('ensure-fingerprint', async (_e, acc) => {
  const ac = asRecord(acc);
  const dir = path.join(app.getPath('userData'), 'fingerprints');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  // 仅保留安全文件名字符，防止目录穿越
  const id = String(ac['id'] || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
  const jsonPath = path.join(dir, `${id}.json`);
  const jsPath = path.join(dir, `${id}.js`);
  const fp = ac['fingerprint'] || {};
  fs.writeFileSync(jsonPath, JSON.stringify(fp));
  fs.writeFileSync(jsPath, buildFingerprintPreload(fp));
  // HTTP 层：注入 Accept-Language（DOM 层在 preload 内覆盖）
  // ★ 2026-10-12（TD-04-11）：**分区由前端按账号类型算好**（真源 core/rules/partition.defaultPartitionOf），
  //   后端不再猜站点；且内层失败**如实上报**（探债段解法第二条）——
  //   此前这里是「**无兜底** + 只 console.error + **仍回 ok:true**」⇒ 建号（partition:null）时
  //   头注入静默跳过，而调用方拿到的是"成功"（探债段症状①）。
  if (!ac['partition']) throw new Error('ensure-fingerprint: 缺少 partition（应由前端按账号类型提供）');
  try {
    const ses = session.fromPartition(String(ac['partition']));
    applyFingerprintHeaders(ses, fp as { languages?: unknown; uaClientHints?: Record<string, unknown> });
  } catch (e) {
    throw new Error(`[fingerprint] 设置请求头失败: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { ok: true, preloadUrl: pathToFileURL(jsPath).href };
});

// 指纹诊断（2026-09-28 Windows 502|4502 排查）：返回该账号会话的真实出口链路（系统代理会
// 被 Chromium 默认接管，resolveProxy 能直接看出流量是否走了 PROXY）与真实引擎版本。
handle('fp-net-diag', async (_e, p) => {
  // 源是 `{ partition } = {}` 解构（形参是 `unknown` ⇒ 用 asRecord 取同一件事）
  const partition = asRecord(p)['partition'];
  // ★ 2026-10-12（TD-04-11）：**不再猜站点** —— 此前无分区就探 `persist:doubao`
  //   ⇒ 非豆包号拿到的诊断报告是**别的会话**的出口（探债段症状②）。前端有账号类型时
  //   会用真源算好分区（core/rules/partition.defaultPartitionOf）；这里没有 ⇒ 明确失败。
  if (!partition) throw new Error('fp-net-diag: 缺少 partition（应由前端按账号类型提供）');
  const ses = session.fromPartition(String(partition));
  let proxy = '';
  try {
    proxy = await ses.resolveProxy('https://www.doubao.com');
  } catch {
    proxy = '';
  }
  return {
    ok: true,
    proxy: String(proxy || '').trim(), // 'DIRECT' 或 'PROXY host:port ...'
    engineChrome: process.versions.chrome || '',
    hostPlatform: process.platform,
  };
});

// ============================================================
// 纯净会话（无 JS 指纹篡改）
// ------------------------------------------------------------
// 适用场景：站点使用 Cloudflare Turnstile / 人机校验（如 Lovart）。
// Turnstile 会主动探测 Intl.DateTimeFormat / canvas / WebGL / Date.getTimezoneOffset
// 是否被改写；而「指纹伪装 preload」恰好会改写这几处 —— 于是被判为环境异常 → 验证失败。
// 因此这类站点改用「原生 Chromium + 只对齐浏览器身份」策略：
//   · UA 去掉 Electron / 应用标识，但声明的版本必须与真实引擎版本一致（见 CHROME_COMPAT_MAJOR）；
//     绝不能为了「看起来新」而声明更高版本——Cloudflare Turnstile 会拿它和 TLS/HTTP2 网络指纹
//     交叉校验，版本不符即判伪造、人机验证失败。
//   · 不做任何 JS 注入（无 preload、不改 navigator.userAgentData / window.chrome / languages）；canvas / WebGL / Intl / Date 一律保持原生
//   · Sec-CH-UA 系列请求头由引擎按 setUserAgent 后的 UA 原生下发，不再用 webRequest 覆写（覆写会留痕迹）
// 账号隔离仍由 partition 保证（每个账号独立 cookie / storage），不受影响。
//
// 2026-09-12 隔离补强（Lovart 风控「同环境多账号」应对）：
//   · 说明：纯本地指纹无法隔离出口 IP，多账号同网仍可能被关联 → 用「Lovart 出口代理池」
//     给每个账号分配不同出口 IP（见 ensure-lovart-container / set-account-proxy）。
// 2026-09-20 实测修正（用真实 Electron 会话抓实际下发的请求头验证）：
//   · 原「Accept-Language 按账号差异化」已被证伪并移除 —— setUserAgent 的第二参只改请求头，
//     不改 navigator.languages（JS 侧仍读系统语言），差异化会制造「请求头 vs JS 语言不一致」；
//     真实浏览器两者必然一致，故不一致本身就是更强的自动化信号。
//   · 同时修正了参数格式：第二参必须传「纯语言列表」，否则实际下发的 Accept-Language 畸形。
// ============================================================

// Accept-Language 的正确构造方式（2026-09-20 实测确定）。
// Electron 的 setUserAgent(ua, acceptLanguages) 第二参必须是「纯语言列表」，
// 例如 'zh-CN,zh,en-US,en' —— Chromium 会自行补 q 值，实际下发
// 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7'（与真实 Chrome 一致）。
// 若把已带 q 值的字符串当参数传入，实际下发会变成 q 值重复的畸形头：
//   'zh-CN,zh;q=0.9;q=0.9,en-US;q=0.8;q=0.8,en;q=0.7;q=0.7'
// 真实 Chrome 永不发出这种头，属「非真实浏览器」的显式痕迹，故必须用纯列表。
// 语言统一取「系统语言 + 其主语言」，与 JS 侧 navigator.languages 首项保持一致。
function buildPlainAcceptLanguages(): string {
  let loc = '';
  try {
    loc = String(app.getLocale() || '');
  } catch {
    loc = '';
  }
  if (!loc) loc = 'en-US';
  const base = loc.split('-')[0] ?? '';
  return base && base !== loc ? `${loc},${base}` : loc;
}

// ── 声明版本对齐（2026-09-20 起；2026-09-20 升级 Electron 31→44 根治版本偏旧）──
// 关键约束：**声明的版本必须与「真实引擎版本」严格相等**。
//   · 本项目已升级到 Electron 44.4.3，内置 Chromium 152（2026 年当前代引擎，见 process.versions.chrome）。
//   · UA 字符串、navigator.userAgentData.brands、Sec-CH-UA 请求头都由 JS 层伪造，但
//     TLS ClientHello / HTTP/2 SETTINGS 指纹由底层 Chromium 引擎写死，JS 层改不了。
//   · 因此这里直接取真实引擎主版本，保证 UA / UA-CH / JS brands 与网络栈「三处完全一致」，
//     既不会触发 Cloudflare 的「声明≠真实」校验，版本本身也足够新（不再被 Lovart 按版本年龄拦截）。
//   · 历史：曾把本常量硬编码成 153（高于引擎 126）→ Cloudflare 判伪造失败；改回 126 后
//     Cloudflare 通过，但 126 偏旧仍被 Lovart 风控 → 最终通过升级 Electron 到 44 根治。
//   · 本常量随引擎自动取值，引擎升级后无需手工维护。
const CHROME_COMPAT_MAJOR = (() => {
  const m = parseInt(String(process.versions.chrome).split('.')[0] ?? '', 10);
  return m || 126;
})();

// Chrome 110+ 的 UA 与客户端提示都冻结为 major.0.0.0，只暴露主版本。
function buildCleanChromeUA(): string {
  return (
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    `(KHTML, like Gecko) Chrome/${CHROME_COMPAT_MAJOR}.0.0.0 Safari/537.36`
  );
}

// 2026-09-21 停用 applyLovartClientHints：原实现用 webRequest.onBeforeSendHeaders 覆写
// Sec-CH-UA* 请求头，会留下「请求头被改写」的可探测痕迹，且与 JS 侧 navigator.userAgentData
// 一旦不一致即被判为伪造环境。Chromium 在 setUserAgent 后会自行按 UA 派生出与引擎完全一致的
// 客户端提示，无需、也不应手动覆写。仅保留 setUserAgent（去 Electron 标识）。

// ★ **零注入**：Lovart 容器不挂载任何自定义 preload —— 自定义 UA preload 通过 Object.defineProperty
// 改写 navigator.userAgentData / window.chrome / navigator.languages，会留下 fn.toString() 的
// 可探测痕迹，设备信任 SDK 据此判为「环境被篡改」。改为完全依赖引擎原生指纹（零注入）。

handle('ensure-plain-session', async (_e, acc) => {
  try {
    const ac = asRecord(acc);
    // ★ 2026-10-12（TD-04-11）：不再猜 `persist:lovart` —— 前端按账号类型算好分区；
    //   拿不到就明确失败（静默落到别的 session 比报错更难查）。
    const partition = String(ac['partition'] || '');
    if (!partition) throw new Error('缺少 partition（应由前端按账号类型提供）');
    const ses = session.fromPartition(partition);
    const ua = buildCleanChromeUA();
    const lang = buildPlainAcceptLanguages();
    // 会话级 UA 覆写（只改 UA 字符串，去掉 Electron 标识；Sec-CH-UA 由引擎按 UA 原生下发，不再 webRequest 覆写）
    ses.setUserAgent(ua, lang);
    console.log('[plain-session] UA:', ua, '| Accept-Language:', lang, '| partition:', partition);
    return { ok: true, userAgent: ua, acceptLanguage: lang };
  } catch (err) {
    // 留痕是守卫不做的（守卫只把异常转回执）⇒ 就地保留；回执转换交注册处
    console.error('[plain-session] 应用失败:', err instanceof Error ? err.message : String(err));
    throw err;
  }
});

// 规范化代理串：允许「host:port」「http://host:port」「socks5://host:port」「socks5h://host:port」，
// 空串 = 直连（恢复默认网络栈）。这与 Firefox Multi-Account Containers + Mozilla VPN 的
// 「每个容器独立出口 IP」思路一致，是 Lovart 区分多账号的关键（存储隔离 + IP 隔离）。
function normalizeProxy(p: unknown): string {
  const s = String(p || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s) || /^socks[45]h?:\/\//i.test(s)) return s;
  if (/^[\w.-]+:\d+$/.test(s)) return `http://${s}`;
  return s; // 交给 Chromium 报错，不静默吞
}

function applySessionProxy(ses: Electron.Session, proxy: unknown): Promise<void> {
  const server = normalizeProxy(proxy);
  // 断言只为过声明类型（三元表达式里的 `mode` 字面量没被上下文收窄）
  return ses.setProxy((server ? { mode: 'fixed_servers', server } : { mode: 'direct' }) as Electron.ProxyConfig);
}

// 运行中修改某账号会话的代理（账号行 / 设置页调用）；proxy 为空 = 恢复直连
handle('set-account-proxy', async (_e, p) => {
  const pp = asRecord(p);
  const partition = pp['partition'] || '';
  if (!partition) return { ok: false, error: '缺少 partition' };
  const ses = session.fromPartition(String(partition));
  await applySessionProxy(ses, pp['proxy']);
  return { ok: true, applied: normalizeProxy(pp['proxy']) || 'direct' };
});

// ============================================================
// Lovart 容器隔离：参考 Firefox Multi-Account Containers 思路
// ------------------------------------------------------------
// 关键事实（用户验证）：在 Firefox Multi-Account Containers 中同时登录 8 个
// Lovart 账号不会触发异常。这说明 Lovart 的「多账号检测」不依赖 IP / 机器指纹
// / WebGL / 时区，而是依赖存储隔离。Firefox 容器只隔离 cookie/storage，不改
// 任何指纹，所以能过。
//
// 因此 Electron 端的正确做法不是「主动伪装指纹」，而是：
//   1. 每个 Lovart 账号独立 session（partition），严格隔离 cookies / storage /
//      cache / service worker / indexdb / localstorage。
//   2. 只把 UA 里的 Electron/应用标识去掉，其余保持原生 Chromium 指纹（客户端提示
//      随真实 Chromium 自然下发，保证自洽）。
//   3. 锁死 webview 的 Electron 特征泄漏（nodeIntegration/contextIsolation 等）。
//   4. 默认关闭 Lovart 自动抓取，避免每 3 秒执行一次页面脚本被判定为机器人。
// ============================================================

async function prepareLovartContainer(ses: Electron.Session, partition: string, proxy: unknown): Promise<{ ua: string }> {
  const ua = buildCleanChromeUA();
  // Accept-Language：所有 Lovart 容器统一为「系统语言 + 其主语言」，与 Firefox 多账号容器一致
  // （Firefox 容器从不修改语言、各容器共享同一份系统语言）。必须传「纯语言列表」而非带 q 值的
  // 字符串，否则实际下发畸形头（见 buildPlainAcceptLanguages 注释），属显式的非真实浏览器痕迹。
  // 各账号完全相同、不做差异化——差异化只改请求头、不改 navigator.languages，
  // 会制造「请求头 vs JS 语言不一致」，反而是更强的自动化信号。
  const AL = buildPlainAcceptLanguages();
  ses.setUserAgent(ua, AL);

  // 客户端提示（Sec-CH-UA*）：不再用 webRequest 覆写。实测 Chromium 在 setUserAgent 后会
  // 自行按 UA 派生出与引擎完全一致的客户端提示；额外的 webRequest 覆写会留下「请求头被改写」的
  // 可探测痕迹，且与 JS 侧 navigator.userAgentData 一旦不一致即被判为伪造环境。直接依赖引擎原生下发，
  // 反而比手动对齐更自洽、更贴近多开器「零注入」的做法。

  // 出口 IP 隔离：账号配了代理才绑定到该会话；未配时不调用 setProxy，避免任何副作用。
  // 对应 Firefox 容器 + Mozilla VPN 的「每个容器独立出口 IP」思路。
  if (proxy !== undefined && String(proxy).trim() !== '') {
    try {
      await applySessionProxy(ses, proxy);
    } catch (e) {
      console.error('[lovart-container] 设置代理失败:', e instanceof Error ? e.message : String(e));
    }
  }

  // 权限策略：拒绝会泄露设备/系统信息的敏感权限；通知保持允许（不影响站点正常交互）
  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    if (['geolocation', 'midi', 'midiSysex', 'mediaKeySystem', 'microphone', 'camera'].includes(permission)) {
      callback(false);
    } else {
      callback(true);
    }
  });

  // 新容器清理：partition 里没有 Lovart cookie 时，说明是首次使用，
  // 清空可能从同一 profile 残留过来的 indexdb/localstorage/websql/service worker。
  try {
    const cookies = await ses.cookies.get({});
    if (!cookies || cookies.length === 0) {
      console.log('[lovart-container] 新容器，清理残留存储:', partition);
      await ses.clearStorageData({
        // 按源传值（含 `quotas`；当前 electron.d.ts 已删该字段、storages 的 union 也窄于运行期）⇒ 整体断言
        storages: ['appcache', 'filesystem', 'indexdb', 'localstorage', 'shadercache', 'websql', 'serviceworkers'],
        quotas: ['temporary', 'syncable'],
      } as Electron.ClearStorageDataOptions);
    }
  } catch (e) {
    console.error('[lovart-container] 清理存储失败:', e instanceof Error ? e.message : String(e));
  }
  return { ua };
}

handle('ensure-lovart-container', async (_e, acc) => {
  try {
    const ac = asRecord(acc);
    // ★ 2026-10-12（TD-04-11）：不再猜 `persist:lovart` —— 前端按账号类型算好分区；
    //   拿不到就明确失败（静默落到别的 session 比报错更难查）。
    const partition = String(ac['partition'] || '');
    if (!partition) throw new Error('缺少 partition（应由前端按账号类型提供）');
    const proxy = ac['proxy'] || '';
    const ses = session.fromPartition(partition);
    const { ua } = await prepareLovartContainer(ses, partition, proxy);
    // ★ **零注入**：不挂载任何自定义 preload —— 自定义 UA preload 通过 Object.defineProperty
    // 改写 navigator.userAgentData / window.chrome / navigator.languages，会留下 fn.toString() 的可探测痕迹；
    // 设备信任 SDK 据此判为「环境被篡改」→ 账号异常。改为完全依赖引擎原生指纹（与多开器零注入的做法一致）。
    const preloadUrl = null;
    console.log('[lovart-container] ready | UA:', ua, '| proxy:', proxy || 'direct', '| partition:', partition, '| preload: none');
    return { ok: true, userAgent: ua, preloadUrl, proxy: normalizeProxy(proxy) || 'direct' };
  } catch (err) {
    // 留痕是守卫不做的（守卫只把异常转回执）⇒ 就地保留；回执转换交注册处
    console.error('[lovart-container] 失败:', err instanceof Error ? err.message : String(err));
    throw err;
  }
});

// 移除账号时清理该账号容器的全部数据（cookie/storage/cache/service worker）
handle('clear-account-session', async (_e, p) => {
  // 源是 `{ partition } = {}` 解构（形参是 `unknown` ⇒ 用 asRecord 取同一件事）
  const partition = asRecord(p)['partition'];
  if (!partition) return { ok: false, error: '缺少 partition' };
  const ses = session.fromPartition(String(partition));
  await ses.clearStorageData({
    // 同上：按源传值（`cookies` 在内的这几个名字）
    storages: ['cookies', 'appcache', 'filesystem', 'indexdb', 'localstorage', 'shadercache', 'websql', 'serviceworkers'],
    quotas: ['temporary', 'syncable'],
  } as Electron.ClearStorageDataOptions);
  await ses.clearCache();
  return { ok: true };
});
