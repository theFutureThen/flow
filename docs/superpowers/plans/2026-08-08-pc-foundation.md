# PC 桌面端地基实施计划（迁移路径 1–7 步）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `pc/` 从单包 Electron 脚手架改造成 workspace 多包结构，定死协议层三个不可回退决定，并打通"全局快捷键 → launcher 窗口 → 检索宿主指令 → 执行"的最小闭环。

**Architecture:** npm workspaces 划分 `apps/desktop` 与 `packages/{plugin-protocol,core,i18n,ui}`。协议层零依赖、用 zod 做运行时校验；匹配算法为纯函数置于 `packages/core`，可脱离 Electron 单测；主进程只做装配与系统能力，渲染层用 React。依赖方向由 eslint 强制，RTL 预留由 stylelint 强制。

**Tech Stack:** Electron 43 + Electron Forge 7 + Vite 5、TypeScript 6.0.3、React 19、zod 4、vitest 4、eslint 10（flat config）+ eslint-plugin-import-x 4、stylelint 17。

**Spec:** `docs/superpowers/specs/2026-08-08-pc-directory-structure-design.md`

**范围说明：** 本计划只覆盖 spec §15 迁移路径的第 1–7 步。第 8–13 步（L1 运行时与 SDK、L0 声明式运行时、动态指令与动态结果推送、数据层与同步、L2 运行时与特权内置工具）每一项都是独立子系统，各自单独出计划。本计划完成后应得到一个可运行、可测试的 launcher 骨架。

---

## 版本选型说明（执行前必读）

**TypeScript 固定为 `~6.0.3`，不要用 7.x。** `typescript@7` 是 Go 重写版，npm 包里没有经典 JS API（根导出只是 `lib/version.cjs`），而 `@typescript-eslint` 至今声明的 peer 是 `>=4.8.4 <6.1.0`，装 TS 7 会直接 ERESOLVE 失败。这一点已实测确认。

**eslint 用 10.x，import 插件用 `eslint-plugin-import-x`**，不要用 `eslint-plugin-import`——后者 peer 只到 eslint 9，装上会有 peer 警告。`import-x` 是同源分支，规则名一致，peer 已支持 eslint 10。

---

## 文件结构

本计划结束时 `pc/` 的形态：

```
pc/
├── package.json                    # workspace 根，private，只放脚本与共享 devDeps
├── package-lock.json               # 全仓唯一锁文件
├── tsconfig.base.json              # 公共编译选项，各包 extends
├── eslint.config.mjs               # flat config，含依赖方向 zones
├── .stylelintrc.mjs                # RTL 逻辑属性强制
├── vitest.config.ts                # workspace 级测试配置
├── apps/desktop/
│   ├── package.json
│   ├── forge.config.ts             # 从 pc/ 移入
│   ├── index.html                  # 从 pc/ 移入
│   ├── vite.main.config.ts         # 从 pc/ 移入
│   ├── vite.preload.config.ts      # 从 pc/ 移入
│   ├── vite.renderer.config.ts     # 从 pc/ 移入，加 React 插件
│   ├── forge.env.d.ts              # 从 pc/ 移入
│   └── src/
│       ├── main/
│       │   ├── index.ts            # 装配入口
│       │   ├── shortcuts/index.ts  # 全局快捷键注册
│       │   ├── windows/launcher-window.ts
│       │   ├── commands/registry.ts # 宿主指令注册表
│       │   └── ipc/router.ts       # IPC 统一入口
│       ├── preload/host.ts
│       └── renderer/
│           ├── main.tsx
│           ├── shell/launcher/LauncherInput.tsx
│           ├── shell/launcher/ResultList.tsx
│           └── styles/global.css
└── packages/
    ├── plugin-protocol/src/{localized.ts,commands.ts,tier.ts,index.ts}
    ├── core/src/matching/{fuzzy.ts,score.ts,index.ts}
    ├── i18n/src/{collator.ts,fold.ts,index.ts}
    └── ui/src/tokens.css
```

职责边界：`plugin-protocol` 只有类型与 schema，零运行时依赖（除 zod）；`core` 只有纯函数，不 import electron；`i18n` 只封装 `Intl` 与字符串归一化；`apps/desktop` 负责所有 Electron 交互与装配。

---

## Task 1: 建立 workspace 骨架并迁移现有应用

**Files:**
- Create: `pc/package.json`（覆盖现有）、`pc/tsconfig.base.json`、`pc/apps/desktop/package.json`
- Move: `pc/{src,forge.config.ts,index.html,vite.*.config.ts,forge.env.d.ts,tsconfig.json}` → `pc/apps/desktop/`
- Delete: `pc/.eslintrc.json`

- [ ] **Step 1: 备份当前依赖状态并清理**

```bash
cd pc
rm -rf node_modules .vite package-lock.json
```

- [ ] **Step 2: 用 git mv 迁移现有文件到 apps/desktop**

用 `git mv` 而非 `mv`，保留文件历史。

```bash
cd pc
mkdir -p apps/desktop packages
git mv src apps/desktop/src
git mv forge.config.ts apps/desktop/forge.config.ts
git mv forge.env.d.ts apps/desktop/forge.env.d.ts
git mv index.html apps/desktop/index.html
git mv vite.main.config.ts apps/desktop/vite.main.config.ts
git mv vite.preload.config.ts apps/desktop/vite.preload.config.ts
git mv vite.renderer.config.ts apps/desktop/vite.renderer.config.ts
git mv tsconfig.json apps/desktop/tsconfig.json
git rm .eslintrc.json
```

- [ ] **Step 3: 写 workspace 根 package.json**

替换 `pc/package.json` 全部内容：

```json
{
  "name": "flow-pc",
  "version": "1.0.0",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "start": "npm run start -w @flow/desktop",
    "make": "npm run make -w @flow/desktop",
    "package": "npm run package -w @flow/desktop",
    "lint": "eslint .",
    "lint:css": "stylelint \"**/*.css\"",
    "typecheck": "tsc --build",
    "test": "vitest run"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "eslint": "^10.8.1",
    "eslint-plugin-import-x": "^4.17.1",
    "globals": "^17.9.0",
    "stylelint": "^17.14.1",
    "typescript": "~6.0.3",
    "typescript-eslint": "^8.66.0",
    "vitest": "^4.1.10"
  }
}
```

- [ ] **Step 4: 写 apps/desktop/package.json**

创建 `pc/apps/desktop/package.json`：

```json
{
  "name": "@flow/desktop",
  "productName": "flow",
  "version": "1.0.0",
  "private": true,
  "main": ".vite/build/main.js",
  "scripts": {
    "start": "electron-forge start",
    "package": "electron-forge package",
    "make": "electron-forge make"
  },
  "devDependencies": {
    "@electron-forge/cli": "^7.11.2",
    "@electron-forge/maker-deb": "^7.11.2",
    "@electron-forge/maker-rpm": "^7.11.2",
    "@electron-forge/maker-squirrel": "^7.11.2",
    "@electron-forge/maker-zip": "^7.11.2",
    "@electron-forge/plugin-auto-unpack-natives": "^7.11.2",
    "@electron-forge/plugin-fuses": "^7.11.2",
    "@electron-forge/plugin-vite": "^7.11.2",
    "@electron/fuses": "^1.8.0",
    "@types/electron-squirrel-startup": "^1.0.2",
    "electron": "43.3.0",
    "vite": "^5.4.21"
  },
  "dependencies": {
    "electron-squirrel-startup": "^1.0.1"
  }
}
```

- [ ] **Step 5: 写 tsconfig.base.json**

创建 `pc/tsconfig.base.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "preserve",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "noEmit": true
  }
}
```

注意 `module: preserve` + `moduleResolution: bundler`：TypeScript 6 已把 `baseUrl` 与 `moduleResolution: node` 标记为弃用并直接报错，必须用这组新值。

- [ ] **Step 6: 更新 apps/desktop/tsconfig.json 继承基座**

替换 `pc/apps/desktop/tsconfig.json` 全部内容：

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": ["vite/client"]
  },
  "include": ["src", "forge.env.d.ts", "*.config.ts"]
}
```

- [ ] **Step 7: 安装依赖**

```bash
cd pc && npm install
```

Expected: 安装成功，无 ERESOLVE 错误。若出现 `@typescript-eslint` 相关 peer 冲突，检查 typescript 是否被误升到 7.x。

- [ ] **Step 8: 验证类型检查通过**

```bash
cd pc && npx tsc --noEmit -p apps/desktop/tsconfig.json
```

Expected: exit 0，无输出。

- [ ] **Step 9: 提交**

```bash
cd pc
git add -A
git commit -m "refactor(pc): migrate to npm workspace layout

现有应用整体移入 apps/desktop，建立 workspace 根配置与
tsconfig 基座。TypeScript 升至 6.0.3，module/moduleResolution
改用 preserve/bundler（TS6 已弃用 baseUrl 与 node 解析）。"
```

---

## Task 2: flat config 与 stylelint 基线

**Files:**
- Create: `pc/eslint.config.mjs`、`pc/.stylelintrc.mjs`

- [ ] **Step 1: 写 eslint flat config（暂不含依赖方向规则）**

创建 `pc/eslint.config.mjs`：

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/.vite/**', '**/out/**', '**/node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
);
```

- [ ] **Step 2: 补装 eslint 官方 js 配置包**

```bash
cd pc && npm i -D @eslint/js@^10.0.1
```

装到 workspace 根，不加 `-w`——根 package 不是 workspace 成员，加了会报错。

- [ ] **Step 3: 运行 lint 验证配置可用**

```bash
cd pc && npx eslint .
```

Expected: exit 0（脚手架代码本身干净）。若报 `Could not find config file`，确认文件名为 `eslint.config.mjs` 且位于 `pc/` 根。

- [ ] **Step 4: 写 stylelint 配置**

创建 `pc/.stylelintrc.mjs`。这份配置的两条规则分工不同：`property-disallowed-list` 整体禁用物理方向属性；`text-align` / `float` / `clear` 不能整体禁（否则 `text-align: center` 会误伤），只禁 `left` / `right` 两个值。

```js
export default {
  rules: {
    'property-disallowed-list': [
      [
        'margin-left', 'margin-right',
        'padding-left', 'padding-right',
        'border-left', 'border-right',
        'left', 'right',
      ],
      { message: '改用 CSS 逻辑属性（margin-inline-start / inset-inline-start 等），为 RTL 预留' },
    ],
    'declaration-property-value-disallowed-list': [
      {
        'text-align': ['left', 'right'],
        float: ['left', 'right'],
        clear: ['left', 'right'],
      },
      { message: '改用 start / end，为 RTL 预留' },
    ],
  },
};
```

- [ ] **Step 5: 写一个临时用例验证规则真的会拦**

创建 `pc/tmp-rtl-check.css`：

```css
.a { margin-left: 4px; }
.b { margin-inline-start: 4px; }
.c { text-align: left; }
.d { text-align: center; }
.e { text-align: start; }
```

- [ ] **Step 6: 运行 stylelint 确认拦截行为正确**

```bash
cd pc && npx stylelint tmp-rtl-check.css
```

Expected: 报 2 个错误——`.a` 的 `margin-left` 与 `.c` 的 `text-align: left`。`.b`、`.d`、`.e` 必须放行。若 `.d`（`center`）也被报错，说明误用了 `property-disallowed-list` 去禁 `text-align`。

- [ ] **Step 7: 删除临时用例**

```bash
cd pc && rm tmp-rtl-check.css
```

- [ ] **Step 8: 提交**

```bash
cd pc
git add -A
git commit -m "chore(pc): add eslint flat config and stylelint RTL guard

.eslintrc 迁移到 flat config（eslint 10 已移除 eslintrc 支持
与 --ext）。stylelint 强制 CSS 逻辑属性，为 RTL 预留；
text-align/float/clear 用值级规则，避免误伤 center。"
```

---

## Task 3: 打包链路验证（风险前置）

spec §16.1 把这一项列为最大未验证风险：Electron Forge 在 workspace 下对依赖提升的处理存在已知摩擦。**必须在写任何业务代码之前跑通**，否则等代码堆积后再发现，回退成本极高。

**Files:**
- Modify: `pc/apps/desktop/forge.config.ts`（仅在验证失败时）

- [ ] **Step 1: 确认 forge.config.ts 的 fuses 版本可用**

`@electron/fuses` 已从 1.8.0 升到 2.x，确认导入仍有效：

```bash
cd pc && npx tsc --noEmit -p apps/desktop/tsconfig.json
```

Expected: exit 0。若报 `FuseV1Options` 不存在，检查 `@electron/fuses` 是否装成了 2.x 且导出名未变。

- [ ] **Step 2: 先跑 start 验证开发链路**

```bash
cd pc && npm start
```

Expected: Electron 窗口弹出，控制台打印 `👋 This message is being logged by "renderer.ts", included via Vite`。确认后 Ctrl+C 退出。

若报找不到 vite 配置，说明 Forge 的配置路径解析基于 `apps/desktop` 而非仓库根——检查 `forge.config.ts` 里的 `config: 'vite.main.config.ts'` 是否需要改成相对 `apps/desktop` 的路径（正常情况下不需要改，Forge 以 app package.json 所在目录为根）。

- [ ] **Step 3: 跑完整打包**

```bash
cd pc && npm run make
```

Expected: 在 `apps/desktop/out/make/` 下产出安装包（macOS 为 zip）。耗时数分钟。

**若失败，按以下顺序排查，不要跳过：**

1. 报错含 `Cannot find module` 且模块名是 `electron-squirrel-startup` 一类的运行时依赖 → 依赖被提升到了 `pc/node_modules`，而 Forge 只打包 `apps/desktop/node_modules`。在 `pc/package.json` 增加 `"workspaces": { "packages": [...], "nohoist": [...] }` 不适用于 npm；改为在 `pc/.npmrc` 写 `install-strategy=nested` 让依赖装在各自包内。
2. 报错含原生模块重建失败 → 本计划尚未引入原生模块（SQLite 在后续计划），此时不应出现；若出现说明某个传递依赖含原生扩展，记录下来在后续计划处理。

- [ ] **Step 4: 记录验证结果**

在 `pc/apps/desktop/README.md` 追加一节（若文件不存在则创建）：

```markdown
## 打包验证

- 验证日期：<填写实际日期>
- 命令：`npm run make`（在 `pc/` 下）
- 结果：<成功 / 失败及处理方式>
- 产物路径：`apps/desktop/out/make/`
```

- [ ] **Step 5: 提交**

```bash
cd pc
git add -A
git commit -m "chore(pc): verify packaging works under workspace layout

spec §16.1 列为最大未验证风险，在写业务代码前先跑通
npm run make，避免代码堆积后才发现打包链路不可用。"
```

---

## Task 4: 依赖方向的 CI 强制

spec §12 称这是"唯一真正决定可维护性的机制"。**注意：这套规则有两个静默失败点**——配置写错时 eslint 会 exit 0，看起来一切正常但一条都没拦。因此本任务必须先写会触发规则的用例，确认它真的报错。

**Files:**
- Modify: `pc/eslint.config.mjs`
- Create: `pc/packages/core/src/index.ts`（占位，供规则验证）

- [ ] **Step 1: 建立最小包骨架供规则验证**

```bash
cd pc && mkdir -p packages/core/src
```

创建 `pc/packages/core/package.json`：

```json
{
  "name": "@flow/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts"
}
```

创建 `pc/packages/core/src/index.ts`：

```ts
export const PLACEHOLDER = true;
```

创建 `pc/packages/core/tsconfig.json`：

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

- [ ] **Step 2: 加入依赖方向规则**

修改 `pc/eslint.config.mjs`，加入 import-x 插件与 zones。**`basePath` 和 resolver 缺一不可**：没有 `basePath`，zones 的相对路径不解析；没有 resolver，`.ts` 导入解析失败后规则直接放行。两种情况都表现为静默通过。

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import importX from 'eslint-plugin-import-x';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/.vite/**', '**/out/**', '**/node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    plugins: { 'import-x': importX },
    settings: {
      'import-x/resolver-next': [
        importX.createNodeResolver({ extensions: ['.ts', '.tsx', '.js', '.jsx'] }),
      ],
    },
    rules: {
      'import-x/no-restricted-paths': ['error', {
        basePath: import.meta.dirname,
        zones: [
          {
            target: './packages',
            from: './apps',
            message: 'packages/* 不得依赖 apps/*（spec §12 规则 2）',
          },
          {
            target: './plugins',
            from: './apps',
            message: 'plugins/* 不得依赖 apps/*（spec §12 规则 2）',
          },
          {
            target: './packages/core',
            from: './packages/ui',
            message: 'core 不得依赖 ui（spec §12 规则 1 的延伸）',
          },
          {
            target: './apps/desktop/src/renderer',
            from: './apps/desktop/src/main',
            message: '渲染层不得直接 import 主进程代码，只能通过 preload（spec §12 规则 3）',
          },
          {
            target: './apps/desktop/src/main/plugins',
            from: './apps/desktop/src/main/features',
            message: '插件运行时不应知道特权内置工具的存在（spec §12 规则 5）',
          },
        ],
      }],
    },
  },
);
```

- [ ] **Step 3: 写一个必然违规的临时文件**

创建 `pc/packages/core/src/tmp-violation.ts`：

```ts
import { PLACEHOLDER } from '../../../apps/desktop/src/main/index';

export const bad = PLACEHOLDER;
```

- [ ] **Step 4: 运行 lint，确认规则真的拦住了**

```bash
cd pc && npx eslint packages/core/src/tmp-violation.ts; echo "exit=$?"
```

Expected: exit=1，报错含 `packages/* 不得依赖 apps/*`。

**若 exit=0，规则没生效，按此顺序排查：**
1. `basePath: import.meta.dirname` 是否漏写
2. `settings['import-x/resolver-next']` 是否漏写，或 `extensions` 未含 `.ts`
3. 被导入的目标文件是否真实存在（解析不到时规则放行）

- [ ] **Step 5: 删除临时违规文件，确认干净状态通过**

```bash
cd pc && rm packages/core/src/tmp-violation.ts && npx eslint .; echo "exit=$?"
```

Expected: exit=0。

- [ ] **Step 6: 提交**

```bash
cd pc
git add -A
git commit -m "chore(pc): enforce dependency direction via eslint zones

spec §12 的依赖方向规则落成 CI 检查。注意 basePath 与
resolver 缺一不可，缺任一都会静默放行（配置看起来正确
但一条都不拦），已用违规用例验证规则确实触发。"
```

---

## Task 5: 协议层——LocalizedString

spec §5.2 列出三个"发布后无法回退"的决定，本任务实现第一个。

**Files:**
- Create: `pc/packages/plugin-protocol/package.json`、`tsconfig.json`、`src/localized.ts`、`src/index.ts`
- Test: `pc/packages/plugin-protocol/src/localized.test.ts`

- [ ] **Step 1: 建包骨架并装 zod**

```bash
cd pc && mkdir -p packages/plugin-protocol/src
```

创建 `pc/packages/plugin-protocol/package.json`：

```json
{
  "name": "@flow/plugin-protocol",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "dependencies": {
    "zod": "^4.4.3"
  }
}
```

创建 `pc/packages/plugin-protocol/tsconfig.json`：

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

```bash
cd pc && npm install
```

- [ ] **Step 2: 写失败的测试**

创建 `pc/packages/plugin-protocol/src/localized.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { localizedStringSchema, resolveLocalized } from './localized';

describe('localizedStringSchema', () => {
  it('接受含 en 的多语言对象', () => {
    const result = localizedStringSchema.safeParse({ en: 'Timestamp', 'zh-CN': '时间戳' });
    expect(result.success).toBe(true);
  });

  it('拒绝缺少 en 兜底的对象', () => {
    const result = localizedStringSchema.safeParse({ 'zh-CN': '时间戳' });
    expect(result.success).toBe(false);
  });

  it('拒绝纯字符串', () => {
    const result = localizedStringSchema.safeParse('Timestamp');
    expect(result.success).toBe(false);
  });
});

describe('resolveLocalized', () => {
  const value = { en: 'Timestamp', 'zh-CN': '时间戳', ja: 'タイムスタンプ' };

  it('精确匹配优先', () => {
    expect(resolveLocalized(value, ['zh-CN'])).toBe('时间戳');
  });

  it('按偏好顺序回退到下一个 locale', () => {
    expect(resolveLocalized(value, ['ko', 'ja'])).toBe('タイムスタンプ');
  });

  it('地区变体回退到语言主码', () => {
    expect(resolveLocalized({ en: 'X', zh: '中' }, ['zh-TW'])).toBe('中');
  });

  it('全部未命中时回退到 en', () => {
    expect(resolveLocalized(value, ['de'])).toBe('Timestamp');
  });
});
```

- [ ] **Step 3: 配置 vitest 并运行测试确认失败**

创建 `pc/vitest.config.ts`：

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
    environment: 'node',
  },
});
```

```bash
cd pc && npx vitest run packages/plugin-protocol
```

Expected: FAIL，报错 `Failed to resolve import "./localized"`。

- [ ] **Step 4: 实现 localized.ts**

创建 `pc/packages/plugin-protocol/src/localized.ts`：

```ts
import { z } from 'zod';

/** BCP 47 语言标签，如 'en'、'zh-CN'、'ja' */
export type Locale = string;

/**
 * 面向用户的文本。协议中所有会展示给用户的字段都用这个类型，
 * 而不是 string——插件贡献的指令名会直接出现在 launcher 搜索
 * 结果里，只允许单一字符串会导致中文界面下混入英文指令名。
 *
 * 强制包含 'en' 作为兜底：市场审核员无法覆盖所有语言，英文是
 * 审核基准（spec §9.8）。
 */
export type LocalizedString = Record<Locale, string> & { en: string };

export const localizedStringSchema = z
  .record(z.string(), z.string())
  .refine((value): value is LocalizedString => typeof value.en === 'string' && value.en.length > 0, {
    message: 'LocalizedString 必须包含非空的 en 作为兜底语言',
  });

/**
 * 按偏好顺序解析出要展示的文本。
 * 回退链：精确匹配 → 语言主码（zh-TW → zh）→ en
 */
export function resolveLocalized(
  value: LocalizedString,
  preferred: readonly Locale[],
): string {
  for (const locale of preferred) {
    const exact = value[locale];
    if (exact !== undefined) return exact;

    const primary = locale.split('-')[0];
    if (primary !== undefined && primary !== locale) {
      const fallback = value[primary];
      if (fallback !== undefined) return fallback;
    }
  }
  return value.en;
}
```

创建 `pc/packages/plugin-protocol/src/index.ts`：

```ts
export * from './localized';
```

- [ ] **Step 5: 运行测试确认通过**

```bash
cd pc && npx vitest run packages/plugin-protocol
```

Expected: 7 tests passed。

- [ ] **Step 6: 提交**

```bash
cd pc
git add -A
git commit -m "feat(protocol): add LocalizedString with mandatory en fallback

spec §5.2 三个不可回退决定之一。面向用户的文本一律用
LocalizedString 而非 string，强制 en 兜底作为市场审核基准。
回退链：精确匹配 -> 语言主码 -> en。"
```

---

## Task 6: 协议层——指令声明与多 locale 关键词

三个不可回退决定的第二个。关键点：`keywords` 按 locale 分组，且与显示名解耦——显示名要自然，关键词要覆盖用户可能输入的各种叫法（中文还需拼音全拼与首字母）。

**Files:**
- Create: `pc/packages/plugin-protocol/src/commands.ts`
- Modify: `pc/packages/plugin-protocol/src/index.ts`
- Test: `pc/packages/plugin-protocol/src/commands.test.ts`

- [ ] **Step 1: 写失败的测试**

创建 `pc/packages/plugin-protocol/src/commands.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { commandDeclarationSchema, keywordsForLocale } from './commands';

const valid = {
  id: 'timestamp.convert',
  title: { en: 'Convert Timestamp', 'zh-CN': '时间戳转换' },
  keywords: {
    en: ['timestamp', 'unix time', 'epoch'],
    'zh-CN': ['时间戳', 'shijianchuo', 'sjc'],
  },
};

describe('commandDeclarationSchema', () => {
  it('接受合法声明', () => {
    expect(commandDeclarationSchema.safeParse(valid).success).toBe(true);
  });

  it('拒绝 keywords 为字符串数组的旧形态', () => {
    const result = commandDeclarationSchema.safeParse({
      ...valid,
      keywords: ['timestamp', 'epoch'],
    });
    expect(result.success).toBe(false);
  });

  it('拒绝空 id', () => {
    expect(commandDeclarationSchema.safeParse({ ...valid, id: '' }).success).toBe(false);
  });

  it('拒绝缺少 en 关键词的声明', () => {
    const result = commandDeclarationSchema.safeParse({
      ...valid,
      keywords: { 'zh-CN': ['时间戳'] },
    });
    expect(result.success).toBe(false);
  });
});

describe('keywordsForLocale', () => {
  it('合并目标 locale 与 en 关键词', () => {
    const result = keywordsForLocale(valid.keywords, 'zh-CN');
    expect(result).toContain('时间戳');
    expect(result).toContain('sjc');
    expect(result).toContain('timestamp');
  });

  it('地区变体回退到语言主码', () => {
    const keywords = { en: ['a'], zh: ['中'] };
    expect(keywordsForLocale(keywords, 'zh-TW')).toContain('中');
  });

  it('结果去重', () => {
    const keywords = { en: ['dup'], fr: ['dup'] };
    expect(keywordsForLocale(keywords, 'fr').filter((k) => k === 'dup')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd pc && npx vitest run packages/plugin-protocol/src/commands.test.ts
```

Expected: FAIL，报错 `Failed to resolve import "./commands"`。

- [ ] **Step 3: 实现 commands.ts**

创建 `pc/packages/plugin-protocol/src/commands.ts`：

```ts
import { z } from 'zod';
import { localizedStringSchema, type Locale, type LocalizedString } from './localized';

/**
 * 指令关键词，按 locale 分组。
 *
 * 这不是"把一个字符串翻译成多语言"——每个 locale 拥有一组独立
 * 关键词，数量可以不同：中文需要拼音全拼与首字母，日文需要罗马字。
 * 关键词与显示名解耦，因为显示名要自然，关键词要覆盖用户可能
 * 输入的各种叫法（spec §9.1）。
 */
export type LocalizedKeywords = Record<Locale, string[]> & { en: string[] };

export const localizedKeywordsSchema = z
  .record(z.string(), z.array(z.string().min(1)))
  .refine((value): value is LocalizedKeywords => Array.isArray(value.en) && value.en.length > 0, {
    message: 'keywords 必须包含非空的 en 关键词组',
  });

export interface CommandDeclaration {
  /** 全局唯一。插件内指令建议用 `<pluginId>.<name>` 形式 */
  id: string;
  title: LocalizedString;
  keywords: LocalizedKeywords;
  /** 相对插件根的图标路径，宿主指令可省略 */
  icon?: string;
}

export const commandDeclarationSchema = z.object({
  id: z.string().min(1),
  title: localizedStringSchema,
  keywords: localizedKeywordsSchema,
  icon: z.string().min(1).optional(),
});

/**
 * 取出某 locale 下参与检索的全部关键词。
 * 始终并入 en 关键词——用户可能用英文搜中文界面下的插件。
 */
export function keywordsForLocale(
  keywords: LocalizedKeywords,
  locale: Locale,
): string[] {
  const collected: string[] = [];

  const exact = keywords[locale];
  if (exact !== undefined) collected.push(...exact);

  const primary = locale.split('-')[0];
  if (primary !== undefined && primary !== locale) {
    const fallback = keywords[primary];
    if (fallback !== undefined) collected.push(...fallback);
  }

  collected.push(...keywords.en);

  return [...new Set(collected)];
}
```

- [ ] **Step 4: 导出并运行测试**

修改 `pc/packages/plugin-protocol/src/index.ts`：

```ts
export * from './localized';
export * from './commands';
```

```bash
cd pc && npx vitest run packages/plugin-protocol
```

Expected: 14 tests passed。

- [ ] **Step 5: 提交**

```bash
cd pc
git add -A
git commit -m "feat(protocol): add command declaration with per-locale keywords

spec §5.2 三个不可回退决定之二、§9.1。keywords 按 locale
分组而非单一字符串数组，与显示名解耦；中文需拼音全拼与
首字母，日文需罗马字。检索时始终并入 en 关键词。"
```

---

## Task 7: 协议层——层级声明

三个不可回退决定的第三个。

**Files:**
- Create: `pc/packages/plugin-protocol/src/tier.ts`
- Modify: `pc/packages/plugin-protocol/src/index.ts`
- Test: `pc/packages/plugin-protocol/src/tier.test.ts`

- [ ] **Step 1: 写失败的测试**

创建 `pc/packages/plugin-protocol/src/tier.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_TIER, capabilitiesForTier, tierSchema } from './tier';

describe('tierSchema', () => {
  it('接受 L0 / L1 / L2', () => {
    expect(tierSchema.safeParse('L0').success).toBe(true);
    expect(tierSchema.safeParse('L1').success).toBe(true);
    expect(tierSchema.safeParse('L2').success).toBe(true);
  });

  it('拒绝未知层级', () => {
    expect(tierSchema.safeParse('L3').success).toBe(false);
  });

  it('默认层级为 L1', () => {
    expect(DEFAULT_TIER).toBe('L1');
  });
});

describe('capabilitiesForTier', () => {
  it('L0 不含任何需要执行代码的能力', () => {
    expect(capabilitiesForTier('L0')).toEqual([]);
  });

  it('L1 含存储与通知，不含文件系统', () => {
    const caps = capabilitiesForTier('L1');
    expect(caps).toContain('storage');
    expect(caps).toContain('notification');
    expect(caps).not.toContain('fs');
  });

  it('L2 在 L1 基础上增加文件系统', () => {
    const caps = capabilitiesForTier('L2');
    expect(caps).toContain('storage');
    expect(caps).toContain('fs');
  });

  it('能力集是白名单——未知能力不会出现在任何层级', () => {
    for (const tier of ['L0', 'L1', 'L2'] as const) {
      expect(capabilitiesForTier(tier)).not.toContain('arbitrary-code');
    }
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd pc && npx vitest run packages/plugin-protocol/src/tier.test.ts
```

Expected: FAIL，报错 `Failed to resolve import "./tier"`。

- [ ] **Step 3: 实现 tier.ts**

创建 `pc/packages/plugin-protocol/src/tier.ts`：

```ts
import { z } from 'zod';

/**
 * 插件层级（spec §7）：
 * - L0 声明式：宿主解释执行，不运行任意代码，结构性免审
 * - L1 沙箱：沙箱渲染上下文，无 Node，白名单 API
 * - L2 特权：独立 utilityProcess，受控 Node，强制开源 + 审核 + 签名
 */
export const TIERS = ['L0', 'L1', 'L2'] as const;
export type Tier = (typeof TIERS)[number];

export const tierSchema = z.enum(TIERS);

/** 未显式声明层级的插件按 L1 处理（spec §7.2） */
export const DEFAULT_TIER: Tier = 'L1';

export const CAPABILITIES = [
  'storage',
  'notification',
  'clipboard',
  'http',
  'fs',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/**
 * 各层能力集。这是白名单而非黑名单——新增能力必须显式加入某层，
 * 遗漏时默认不可用（spec §7.2）。
 *
 * L0 为空数组不是遗漏：它不执行任意代码，能力上限由宿主解释器
 * 决定，不通过能力集授予。
 */
const TIER_CAPABILITIES: Readonly<Record<Tier, readonly Capability[]>> = {
  L0: [],
  L1: ['storage', 'notification', 'clipboard', 'http'],
  L2: ['storage', 'notification', 'clipboard', 'http', 'fs'],
};

export function capabilitiesForTier(tier: Tier): readonly Capability[] {
  return TIER_CAPABILITIES[tier];
}
```

- [ ] **Step 4: 导出并运行测试**

修改 `pc/packages/plugin-protocol/src/index.ts`：

```ts
export * from './localized';
export * from './commands';
export * from './tier';
```

```bash
cd pc && npx vitest run packages/plugin-protocol
```

Expected: 21 tests passed。

- [ ] **Step 5: 提交**

```bash
cd pc
git add -A
git commit -m "feat(protocol): add tier declaration with whitelist capabilities

spec §5.2 三个不可回退决定之三、§7.2。能力集是白名单而非
黑名单，新增能力必须显式加入某层。L0 能力集为空是有意的：
它不执行任意代码，能力上限由宿主解释器决定。"
```

---

## Task 8: i18n——排序与重音折叠

**Files:**
- Create: `pc/packages/i18n/package.json`、`tsconfig.json`、`src/collator.ts`、`src/fold.ts`、`src/index.ts`
- Test: `pc/packages/i18n/src/fold.test.ts`、`pc/packages/i18n/src/collator.test.ts`

- [ ] **Step 1: 建包骨架**

```bash
cd pc && mkdir -p packages/i18n/src
```

创建 `pc/packages/i18n/package.json`：

```json
{
  "name": "@flow/i18n",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts"
}
```

创建 `pc/packages/i18n/tsconfig.json`：

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

- [ ] **Step 2: 写失败的测试**

创建 `pc/packages/i18n/src/fold.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { foldForSearch } from './fold';

describe('foldForSearch', () => {
  it('去除重音', () => {
    expect(foldForSearch('café')).toBe('cafe');
    expect(foldForSearch('naïve')).toBe('naive');
  });

  it('转为小写', () => {
    expect(foldForSearch('TimeStamp')).toBe('timestamp');
  });

  it('去除首尾空白', () => {
    expect(foldForSearch('  epoch  ')).toBe('epoch');
  });

  it('保留 CJK 字符不变', () => {
    expect(foldForSearch('时间戳')).toBe('时间戳');
    expect(foldForSearch('タイムスタンプ')).toBe('タイムスタンプ');
  });

  it('德语变元音折叠为基字母', () => {
    expect(foldForSearch('Grüße')).toBe('gruße');
  });
});
```

创建 `pc/packages/i18n/src/collator.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { createCollator } from './collator';

describe('createCollator', () => {
  it('瑞典语把 å 排在 z 之后', () => {
    const collator = createCollator('sv');
    expect(collator.compare('å', 'z')).toBeGreaterThan(0);
  });

  it('德语把 ä 视为接近 a', () => {
    const collator = createCollator('de');
    expect(collator.compare('ä', 'z')).toBeLessThan(0);
  });

  it('相同字符串比较结果为 0', () => {
    expect(createCollator('en').compare('abc', 'abc')).toBe(0);
  });

  it('未知 locale 不抛异常', () => {
    expect(() => createCollator('xx-YY')).not.toThrow();
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

```bash
cd pc && npx vitest run packages/i18n
```

Expected: FAIL，报错找不到 `./fold` 与 `./collator`。

- [ ] **Step 4: 实现 fold.ts 与 collator.ts**

创建 `pc/packages/i18n/src/fold.ts`：

```ts
/**
 * 把字符串归一化成检索用形态：小写、去重音、去首尾空白。
 *
 * 用 NFD 分解后剔除组合记号（U+0300–U+036F），这样 café 与 cafe
 * 能互相命中。CJK 字符不受影响——它们没有组合记号。
 *
 * 注意德语 ß 不会变成 ss：那属于大小写折叠的特例，会影响其他
 * 语言，不在检索归一化的职责范围内。
 */
export function foldForSearch(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}
```

创建 `pc/packages/i18n/src/collator.ts`：

```ts
const cache = new Map<string, Intl.Collator>();

/**
 * 取得 locale 感知的比较器。结果排序必须用它而非字符串 `<`——
 * 德语 ä、瑞典语 å、土耳其语 i/İ 的排序规则各不相同（spec §9.4）。
 *
 * 实例有构造开销，按 locale 缓存复用。
 */
export function createCollator(locale: string): Intl.Collator {
  const cached = cache.get(locale);
  if (cached !== undefined) return cached;

  const collator = new Intl.Collator(locale, {
    sensitivity: 'base',
    numeric: true,
  });
  cache.set(locale, collator);
  return collator;
}
```

创建 `pc/packages/i18n/src/index.ts`：

```ts
export * from './fold';
export * from './collator';
```

- [ ] **Step 5: 运行测试确认通过**

```bash
cd pc && npx vitest run packages/i18n
```

Expected: 9 tests passed。

- [ ] **Step 6: 提交**

```bash
cd pc
git add -A
git commit -m "feat(i18n): add search folding and locale-aware collator

spec §9.4。检索归一化用 NFD 分解剔除组合记号，使 café 与
cafe 互相命中，CJK 不受影响；排序用 Intl.Collator 而非
字符串比较，按 locale 缓存实例。"
```

---

## Task 9: core——指令匹配算法

课题要求主要业务逻辑自研，匹配排序正属此列，不套用现成模糊搜索库。放在 `packages/core` 而非主进程，以便大量单测覆盖。

**Files:**
- Create: `pc/packages/core/src/matching/fuzzy.ts`、`src/matching/index.ts`
- Modify: `pc/packages/core/package.json`、`pc/packages/core/src/index.ts`
- Test: `pc/packages/core/src/matching/fuzzy.test.ts`

- [ ] **Step 1: 让 core 依赖 i18n**

修改 `pc/packages/core/package.json`：

```json
{
  "name": "@flow/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "dependencies": {
    "@flow/i18n": "*"
  }
}
```

```bash
cd pc && npm install
```

- [ ] **Step 2: 写失败的测试**

创建 `pc/packages/core/src/matching/fuzzy.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { matchCandidates, type MatchCandidate } from './fuzzy';

const candidates: MatchCandidate[] = [
  { id: 'timestamp', title: '时间戳转换', keywords: ['时间戳', 'shijianchuo', 'sjc', 'timestamp', 'epoch'] },
  { id: 'settings', title: '设置', keywords: ['设置', 'shezhi', 'sz', 'settings', 'preferences'] },
  { id: 'theme', title: '切换主题', keywords: ['主题', 'zhuti', 'zt', 'theme', 'dark mode'] },
];

describe('matchCandidates', () => {
  it('空查询返回全部候选', () => {
    expect(matchCandidates('', candidates)).toHaveLength(3);
  });

  it('前缀匹配得分高于子串匹配', () => {
    const results = matchCandidates('time', candidates);
    expect(results[0]?.id).toBe('timestamp');
  });

  it('拼音首字母可命中', () => {
    const results = matchCandidates('sjc', candidates);
    expect(results[0]?.id).toBe('timestamp');
  });

  it('中文可命中', () => {
    const results = matchCandidates('时间', candidates);
    expect(results[0]?.id).toBe('timestamp');
  });

  it('重音不敏感', () => {
    const accented: MatchCandidate[] = [{ id: 'cafe', title: 'Café', keywords: ['café'] }];
    expect(matchCandidates('cafe', accented)).toHaveLength(1);
  });

  it('大小写不敏感', () => {
    const results = matchCandidates('EPOCH', candidates);
    expect(results[0]?.id).toBe('timestamp');
  });

  it('无命中时返回空数组', () => {
    expect(matchCandidates('zzzz', candidates)).toEqual([]);
  });

  it('非连续子序列可命中但得分低于前缀', () => {
    const results = matchCandidates('tsp', candidates);
    const timestamp = results.find((r) => r.id === 'timestamp');
    expect(timestamp).toBeDefined();

    const prefixResults = matchCandidates('times', candidates);
    expect(prefixResults[0]!.score).toBeGreaterThan(timestamp!.score);
  });

  it('结果按得分降序排列', () => {
    const results = matchCandidates('s', candidates);
    for (let i = 1; i < results.length; i += 1) {
      expect(results[i - 1]!.score).toBeGreaterThanOrEqual(results[i]!.score);
    }
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

```bash
cd pc && npx vitest run packages/core
```

Expected: FAIL，报错 `Failed to resolve import "./fuzzy"`。

- [ ] **Step 4: 实现 fuzzy.ts**

创建 `pc/packages/core/src/matching/fuzzy.ts`：

```ts
import { foldForSearch } from '@flow/i18n';

export interface MatchCandidate {
  id: string;
  /** 已按当前 locale 解析出的显示名 */
  title: string;
  /** 已按当前 locale 展开并合并 en 的关键词 */
  keywords: string[];
}

export interface MatchResult {
  id: string;
  score: number;
}

const SCORE_EXACT = 1000;
const SCORE_PREFIX = 500;
const SCORE_SUBSTRING = 200;
const SCORE_SUBSEQUENCE = 50;

/**
 * 判断 query 是否为 target 的子序列（字符顺序一致但可不连续）。
 * 用于 'tsp' 命中 'timestamp' 这类输入。
 */
function isSubsequence(query: string, target: string): boolean {
  let queryIndex = 0;
  for (let i = 0; i < target.length && queryIndex < query.length; i += 1) {
    if (target[i] === query[queryIndex]) queryIndex += 1;
  }
  return queryIndex === query.length;
}

/**
 * 对单个词条打分。返回 0 表示不命中。
 * 命中越靠前、越完整，得分越高；短词条同分时优先。
 */
function scoreTerm(query: string, term: string): number {
  if (term === query) return SCORE_EXACT;
  if (term.startsWith(query)) return SCORE_PREFIX - term.length;
  if (term.includes(query)) return SCORE_SUBSTRING - term.length;
  if (isSubsequence(query, term)) return SCORE_SUBSEQUENCE - term.length;
  return 0;
}

/**
 * 匹配并排序候选指令。
 *
 * 课题要求主要业务逻辑自研，这里不套用现成模糊搜索库。算法是
 * 纯函数，不依赖 Electron，便于大量单测覆盖边界（spec §6.5）。
 */
export function matchCandidates(
  query: string,
  candidates: readonly MatchCandidate[],
): MatchResult[] {
  const folded = foldForSearch(query);

  if (folded === '') {
    return candidates.map((candidate) => ({ id: candidate.id, score: 0 }));
  }

  const results: MatchResult[] = [];

  for (const candidate of candidates) {
    const terms = [candidate.title, ...candidate.keywords];
    let best = 0;

    for (const term of terms) {
      const score = scoreTerm(folded, foldForSearch(term));
      if (score > best) best = score;
    }

    if (best > 0) results.push({ id: candidate.id, score: best });
  }

  return results.sort((a, b) => b.score - a.score);
}
```

创建 `pc/packages/core/src/matching/index.ts`：

```ts
export * from './fuzzy';
```

修改 `pc/packages/core/src/index.ts`：

```ts
export * from './matching';
```

- [ ] **Step 5: 运行测试确认通过**

```bash
cd pc && npx vitest run packages/core
```

Expected: 9 tests passed。

- [ ] **Step 6: 提交**

```bash
cd pc
git add -A
git commit -m "feat(core): add command matching algorithm

spec §6.5。自研模糊匹配：精确 > 前缀 > 子串 > 子序列，
同级按词条长度优先短的。纯函数不依赖 Electron，重音与
大小写不敏感由 i18n 的 foldForSearch 保证。"
```

---

## Task 10: 渲染层引入 React

**Files:**
- Modify: `pc/apps/desktop/package.json`、`pc/apps/desktop/vite.renderer.config.ts`、`pc/apps/desktop/index.html`
- Create: `pc/apps/desktop/src/renderer/main.tsx`、`pc/apps/desktop/src/renderer/styles/global.css`
- Delete: `pc/apps/desktop/src/renderer.ts`、`pc/apps/desktop/src/index.css`

- [ ] **Step 1: 装 React 依赖**

```bash
cd pc && npm i -w @flow/desktop react@^19.2.8 react-dom@^19.2.8
cd pc && npm i -D -w @flow/desktop @types/react@^19.2.18 @types/react-dom@^19.2.4 @vitejs/plugin-react@^6.0.5
```

- [ ] **Step 2: 配置 Vite React 插件**

替换 `pc/apps/desktop/vite.renderer.config.ts` 全部内容：

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
```

- [ ] **Step 3: 写全局样式（使用逻辑属性）**

创建 `pc/apps/desktop/src/renderer/styles/global.css`。**只能用逻辑属性**，Task 2 的 stylelint 会拦截物理方向属性：

```css
:root {
  --flow-bg: #1e1e1e;
  --flow-fg: #f0f0f0;
  --flow-accent: #4a9eff;
  --flow-row-active: #2d2d2d;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: system-ui, sans-serif;
  background: var(--flow-bg);
  color: var(--flow-fg);
}

.launcher {
  display: flex;
  flex-direction: column;
  block-size: 100vh;
}

.launcher__input {
  inline-size: 100%;
  padding-block: 16px;
  padding-inline: 20px;
  border: none;
  border-block-end: 1px solid #3a3a3a;
  background: transparent;
  color: inherit;
  font-size: 20px;
  outline: none;
}

.launcher__results {
  flex: 1;
  overflow-y: auto;
  margin: 0;
  padding: 0;
  list-style: none;
}

.launcher__row {
  padding-block: 10px;
  padding-inline: 20px;
  cursor: default;
}

.launcher__row--active {
  background: var(--flow-row-active);
}

.launcher__empty {
  padding-block: 20px;
  padding-inline: 20px;
  opacity: 0.6;
}
```

- [ ] **Step 4: 写 React 入口**

创建 `pc/apps/desktop/src/renderer/main.tsx`：

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/global.css';

function App() {
  return <div className="launcher">flow</div>;
}

const container = document.getElementById('root');
if (container === null) throw new Error('找不到 #root 挂载点');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 5: 更新 index.html 指向新入口**

替换 `pc/apps/desktop/index.html` 全部内容：

```html
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; style-src 'self' 'unsafe-inline'"
    />
    <title>flow</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/renderer/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: 删除旧的裸 TS 渲染入口**

```bash
cd pc && git rm apps/desktop/src/renderer.ts apps/desktop/src/index.css
```

- [ ] **Step 7: 验证样式规则与应用启动**

```bash
cd pc && npx stylelint "apps/desktop/src/**/*.css"; echo "css exit=$?"
```

Expected: exit=0（全部用了逻辑属性）。

```bash
cd pc && npm start
```

Expected: 窗口显示 "flow" 文字，深色背景。确认后 Ctrl+C 退出。

- [ ] **Step 8: 提交**

```bash
cd pc
git add -A
git commit -m "feat(desktop): introduce React renderer with logical-property styles

渲染层从裸 TS 换成 React 19。全局样式从第一行起只用 CSS
逻辑属性，由 stylelint 强制（spec §9.6），事后补 RTL 等于
重写整个样式层。"
```

---

## Task 11: 宿主指令注册表

先做纯逻辑部分，不涉及窗口与快捷键，保证可单测。

**Files:**
- Create: `pc/apps/desktop/src/main/commands/registry.ts`
- Test: `pc/apps/desktop/src/main/commands/registry.test.ts`

- [ ] **Step 1: 让 desktop 依赖协议与 core**

修改 `pc/apps/desktop/package.json` 的 `dependencies` 段，增加三个 workspace 包：

```json
  "dependencies": {
    "@flow/core": "*",
    "@flow/i18n": "*",
    "@flow/plugin-protocol": "*",
    "electron-squirrel-startup": "^1.0.1"
  }
```

```bash
cd pc && npm install
```

- [ ] **Step 2: 写失败的测试**

创建 `pc/apps/desktop/src/main/commands/registry.test.ts`：

```ts
import { describe, expect, it, vi } from 'vitest';
import { CommandRegistry, type HostCommand } from './registry';

function makeCommand(id: string, overrides: Partial<HostCommand> = {}): HostCommand {
  return {
    id,
    title: { en: id, 'zh-CN': id },
    keywords: { en: [id], 'zh-CN': [id] },
    run: vi.fn(),
    ...overrides,
  };
}

describe('CommandRegistry', () => {
  it('注册后可被检索到', () => {
    const registry = new CommandRegistry();
    registry.register(makeCommand('settings'));
    expect(registry.search('settings', 'en')).toHaveLength(1);
  });

  it('重复 id 注册抛错', () => {
    const registry = new CommandRegistry();
    registry.register(makeCommand('dup'));
    expect(() => registry.register(makeCommand('dup'))).toThrow(/已注册/);
  });

  it('检索结果带解析好的显示名', () => {
    const registry = new CommandRegistry();
    registry.register(
      makeCommand('theme', {
        title: { en: 'Toggle Theme', 'zh-CN': '切换主题' },
        keywords: { en: ['theme'], 'zh-CN': ['zhuti'] },
      }),
    );
    const [hit] = registry.search('theme', 'zh-CN');
    expect(hit?.title).toBe('切换主题');
  });

  it('中文关键词在中文 locale 下可命中', () => {
    const registry = new CommandRegistry();
    registry.register(
      makeCommand('theme', {
        title: { en: 'Toggle Theme', 'zh-CN': '切换主题' },
        keywords: { en: ['theme'], 'zh-CN': ['主题', 'zhuti'] },
      }),
    );
    expect(registry.search('主题', 'zh-CN')).toHaveLength(1);
  });

  it('英文关键词在中文 locale 下也可命中', () => {
    const registry = new CommandRegistry();
    registry.register(
      makeCommand('theme', {
        title: { en: 'Toggle Theme', 'zh-CN': '切换主题' },
        keywords: { en: ['theme'], 'zh-CN': ['主题'] },
      }),
    );
    expect(registry.search('theme', 'zh-CN')).toHaveLength(1);
  });

  it('execute 调用对应指令的 run', async () => {
    const registry = new CommandRegistry();
    const run = vi.fn();
    registry.register(makeCommand('quit', { run }));
    await registry.execute('quit');
    expect(run).toHaveBeenCalledOnce();
  });

  it('execute 未知 id 抛错', async () => {
    const registry = new CommandRegistry();
    await expect(registry.execute('missing')).rejects.toThrow(/未找到/);
  });

  it('单个指令抛错不影响注册表可用性', async () => {
    const registry = new CommandRegistry();
    registry.register(makeCommand('boom', { run: () => { throw new Error('炸了'); } }));
    registry.register(makeCommand('ok'));
    await expect(registry.execute('boom')).rejects.toThrow('炸了');
    expect(registry.search('ok', 'en')).toHaveLength(1);
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

```bash
cd pc && npx vitest run apps/desktop/src/main/commands
```

Expected: FAIL，报错 `Failed to resolve import "./registry"`。

- [ ] **Step 4: 实现 registry.ts**

创建 `pc/apps/desktop/src/main/commands/registry.ts`：

```ts
import { matchCandidates, type MatchCandidate } from '@flow/core';
import {
  keywordsForLocale,
  resolveLocalized,
  type Locale,
  type LocalizedKeywords,
  type LocalizedString,
} from '@flow/plugin-protocol';

export interface HostCommand {
  id: string;
  title: LocalizedString;
  keywords: LocalizedKeywords;
  run: () => void | Promise<void>;
}

export interface SearchHit {
  id: string;
  title: string;
  score: number;
}

/**
 * 全局指令索引。本阶段只承载宿主自身动作；插件贡献的静态指令、
 * 运行时动态指令后续接入同一个注册表，检索时不区分出身
 * （spec §6.1）。
 */
export class CommandRegistry {
  readonly #commands = new Map<string, HostCommand>();

  register(command: HostCommand): void {
    if (this.#commands.has(command.id)) {
      throw new Error(`指令 ${command.id} 已注册`);
    }
    this.#commands.set(command.id, command);
  }

  search(query: string, locale: Locale): SearchHit[] {
    const candidates: MatchCandidate[] = [];
    const titles = new Map<string, string>();

    for (const command of this.#commands.values()) {
      const title = resolveLocalized(command.title, [locale]);
      titles.set(command.id, title);
      candidates.push({
        id: command.id,
        title,
        keywords: keywordsForLocale(command.keywords, locale),
      });
    }

    return matchCandidates(query, candidates).map((result) => ({
      id: result.id,
      title: titles.get(result.id) ?? result.id,
      score: result.score,
    }));
  }

  async execute(id: string): Promise<void> {
    const command = this.#commands.get(id);
    if (command === undefined) {
      throw new Error(`未找到指令 ${id}`);
    }
    await command.run();
  }
}
```

- [ ] **Step 5: 运行测试确认通过**

```bash
cd pc && npx vitest run apps/desktop/src/main/commands
```

Expected: 8 tests passed。

- [ ] **Step 6: 提交**

```bash
cd pc
git add -A
git commit -m "feat(desktop): add host command registry

spec §6.1。注册表不区分指令出身，插件静态指令与动态指令
后续接入同一索引。检索时并入 en 关键词，使中文界面下也能
用英文搜到指令。"
```

---

## Task 12: 全局快捷键与 launcher 窗口

**Files:**
- Create: `pc/apps/desktop/src/main/shortcuts/index.ts`、`pc/apps/desktop/src/main/windows/launcher-window.ts`
- Create: `pc/packages/core/src/shortcuts/default.ts`、`pc/packages/core/src/shortcuts/index.ts`
- Modify: `pc/packages/core/src/index.ts`
- Test: `pc/packages/core/src/shortcuts/default.test.ts`

- [ ] **Step 1: 写快捷键默认值的失败测试**

平台默认值是纯逻辑，放 core 便于单测。

创建 `pc/packages/core/src/shortcuts/default.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { defaultLauncherShortcut } from './default';

describe('defaultLauncherShortcut', () => {
  it('macOS 用 Option+Space，避开 Spotlight 的 Cmd+Space', () => {
    const shortcut = defaultLauncherShortcut('darwin');
    expect(shortcut).toBe('Option+Space');
    expect(shortcut).not.toContain('Command');
  });

  it('Windows 用 Alt+Space', () => {
    expect(defaultLauncherShortcut('win32')).toBe('Alt+Space');
  });

  it('Linux 用 Alt+Space', () => {
    expect(defaultLauncherShortcut('linux')).toBe('Alt+Space');
  });

  it('未知平台回退到 Alt+Space', () => {
    expect(defaultLauncherShortcut('freebsd')).toBe('Alt+Space');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd pc && npx vitest run packages/core/src/shortcuts
```

Expected: FAIL，报错 `Failed to resolve import "./default"`。

- [ ] **Step 3: 实现默认快捷键**

创建 `pc/packages/core/src/shortcuts/default.ts`：

```ts
/**
 * 各平台的 launcher 唤起默认快捷键。
 *
 * macOS 上 Cmd+Space 被 Spotlight 占用，绝不能作默认值。
 *
 * 这里只解决平台差异；键盘布局差异（AZERTY、JIS 等布局下某些
 * 组合按不出来）需要在注册失败时提供备选，属 spec §9.3 范围，
 * 由主进程的注册逻辑处理。
 */
export function defaultLauncherShortcut(platform: string): string {
  return platform === 'darwin' ? 'Option+Space' : 'Alt+Space';
}
```

创建 `pc/packages/core/src/shortcuts/index.ts`：

```ts
export * from './default';
```

修改 `pc/packages/core/src/index.ts`：

```ts
export * from './matching';
export * from './shortcuts';
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd pc && npx vitest run packages/core
```

Expected: 13 tests passed。

- [ ] **Step 5: 实现 launcher 窗口**

创建 `pc/apps/desktop/src/main/windows/launcher-window.ts`：

```ts
import { BrowserWindow, screen } from 'electron';
import path from 'node:path';

const WIDTH = 680;
const HEIGHT = 420;

/**
 * launcher 窗口：无边框、置顶、不进任务栏，失焦即隐藏。
 * 只创建一次，反复显隐而非反复创建——重建会丢输入焦点且有可见延迟。
 */
export class LauncherWindow {
  #window: BrowserWindow | null = null;

  #create(): BrowserWindow {
    const window = new BrowserWindow({
      width: WIDTH,
      height: HEIGHT,
      frame: false,
      resizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false,
      webPreferences: {
        // 输出文件名由 forge.config.ts 的 preload entry 决定：
        // entry 为 src/preload/host.ts 时产物是 host.js，不是 preload.js。
        // 若启动后报 preload 加载失败，先去 .vite/build/ 确认实际文件名。
        preload: path.join(__dirname, 'host.js'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });

    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      void window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    } else {
      void window.loadFile(
        path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
      );
    }

    window.on('blur', () => window.hide());
    window.on('closed', () => {
      this.#window = null;
    });

    return window;
  }

  /** 在鼠标所在显示器居中偏上显示——多显示器下必须跟随当前屏 */
  #positionOnActiveDisplay(window: BrowserWindow): void {
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const { x, y, width, height } = display.workArea;

    window.setPosition(
      Math.round(x + (width - WIDTH) / 2),
      Math.round(y + (height - HEIGHT) / 3),
    );
  }

  toggle(): void {
    this.#window ??= this.#create();

    if (this.#window.isVisible()) {
      this.#window.hide();
      return;
    }

    this.#positionOnActiveDisplay(this.#window);
    this.#window.show();
    this.#window.focus();
  }
}
```

- [ ] **Step 6: 实现快捷键注册（含冲突降级）**

创建 `pc/apps/desktop/src/main/shortcuts/index.ts`：

```ts
import { globalShortcut } from 'electron';
import { defaultLauncherShortcut } from '@flow/core';

const FALLBACKS = ['Alt+Shift+Space', 'Ctrl+Alt+Space', 'Ctrl+Shift+Space'];

/**
 * 注册唤起快捷键。首选失败时依次尝试备选——某些键盘布局下
 * 默认组合按不出来，或已被其他应用占用（spec §9.3）。
 *
 * @returns 实际注册成功的快捷键，全部失败返回 null
 */
export function registerLauncherShortcut(onTrigger: () => void): string | null {
  const candidates = [defaultLauncherShortcut(process.platform), ...FALLBACKS];

  for (const accelerator of candidates) {
    if (globalShortcut.isRegistered(accelerator)) continue;

    if (globalShortcut.register(accelerator, onTrigger)) {
      return accelerator;
    }
  }

  return null;
}
```

- [ ] **Step 7: 改写主进程入口做装配**

替换 `pc/apps/desktop/src/main/index.ts` 全部内容（原 `src/main.ts` 已在 Task 1 迁入 `src/`，此处需先移动到 `src/main/`）：

```bash
cd pc && mkdir -p apps/desktop/src/main && git mv apps/desktop/src/main.ts apps/desktop/src/main/index.ts
```

然后替换 `pc/apps/desktop/src/main/index.ts` 内容：

```ts
import { app, globalShortcut, ipcMain } from 'electron';
import started from 'electron-squirrel-startup';
import { CommandRegistry } from './commands/registry';
import { registerLauncherShortcut } from './shortcuts';
import { LauncherWindow } from './windows/launcher-window';

if (started) app.quit();

const registry = new CommandRegistry();
const launcher = new LauncherWindow();

function registerHostCommands(): void {
  registry.register({
    id: 'host.quit',
    title: { en: 'Quit flow', 'zh-CN': '退出 flow' },
    keywords: { en: ['quit', 'exit'], 'zh-CN': ['退出', 'tuichu', 'tc'] },
    run: () => app.quit(),
  });

  registry.register({
    id: 'host.reload',
    title: { en: 'Reload flow', 'zh-CN': '重新加载' },
    keywords: { en: ['reload', 'restart'], 'zh-CN': ['重新加载', 'chongxin', 'cx'] },
    run: () => {
      app.relaunch();
      app.quit();
    },
  });
}

function registerIpc(): void {
  ipcMain.handle('commands:search', (_event, query: unknown, locale: unknown) => {
    if (typeof query !== 'string' || typeof locale !== 'string') {
      throw new Error('commands:search 参数非法');
    }
    return registry.search(query, locale);
  });

  ipcMain.handle('commands:execute', async (_event, id: unknown) => {
    if (typeof id !== 'string') throw new Error('commands:execute 参数非法');
    await registry.execute(id);
  });
}

void app.whenReady().then(() => {
  registerHostCommands();
  registerIpc();

  const accelerator = registerLauncherShortcut(() => launcher.toggle());
  if (accelerator === null) {
    console.error('[flow] 所有候选快捷键均注册失败，launcher 无法通过快捷键唤起');
  } else {
    console.log(`[flow] launcher 快捷键已注册：${accelerator}`);
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// launcher 型应用关掉窗口不退出，常驻后台等待快捷键唤起
app.on('window-all-closed', () => {
  // 有意为空：与普通应用不同，这里不调用 app.quit()
});
```

- [ ] **Step 8: 更新 preload 暴露受控 API**

替换 `pc/apps/desktop/src/preload.ts`（先移动到 `src/preload/host.ts`）：

```bash
cd pc && mkdir -p apps/desktop/src/preload && git mv apps/desktop/src/preload.ts apps/desktop/src/preload/host.ts
```

替换 `pc/apps/desktop/src/preload/host.ts` 内容：

```ts
import { contextBridge, ipcRenderer } from 'electron';

export interface SearchHit {
  id: string;
  title: string;
  score: number;
}

contextBridge.exposeInMainWorld('flow', {
  searchCommands: (query: string, locale: string): Promise<SearchHit[]> =>
    ipcRenderer.invoke('commands:search', query, locale),
  executeCommand: (id: string): Promise<void> =>
    ipcRenderer.invoke('commands:execute', id),
});
```

- [ ] **Step 9: 更新 forge.config.ts 的入口路径**

修改 `pc/apps/desktop/forge.config.ts` 中 VitePlugin 的 build 段，把两个 entry 指向新路径：

```ts
      build: [
        {
          entry: 'src/main/index.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload/host.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
```

- [ ] **Step 10: 更新 package.json 的 main 字段**

**改 entry 必须同步改 `main`，否则打包会失败。** Vite 产物名跟随 entry 文件名：`src/main/index.ts` 产出 `index.js` 而非 `main.js`。

修改 `pc/apps/desktop/package.json`：

```json
  "main": ".vite/build/index.js",
```

不改的话 `npm run make` 会在打包阶段报 `The main entry point to your app was not found`——注意开发期 `npm start` 不受影响，问题只在打包时暴露。

- [ ] **Step 11: 验证启动与快捷键**

```bash
cd pc && npm start
```

Expected: 控制台打印 `[flow] launcher 快捷键已注册：Option+Space`（macOS）。按该组合应能显隐窗口，点击窗口外应自动隐藏。确认后 Ctrl+C 退出。

- [ ] **Step 12: 提交**

```bash
cd pc
git add -A
git commit -m "feat(desktop): add global shortcut and launcher window

spec §9.3、§15 第 7 步。macOS 默认 Option+Space 避开
Spotlight；首选注册失败时依次降级到备选组合。窗口只创建
一次反复显隐，多显示器下跟随鼠标所在屏定位。"
```

---

## Task 13: launcher UI 与 IME 组合态

**Files:**
- Create: `pc/apps/desktop/src/renderer/shell/launcher/LauncherInput.tsx`、`ResultList.tsx`、`useCommandSearch.ts`
- Modify: `pc/apps/desktop/src/renderer/main.tsx`
- Test: `pc/apps/desktop/src/renderer/shell/launcher/useCommandSearch.test.ts`

- [ ] **Step 1: 写 IME 组合态逻辑的失败测试**

组合态判断是纯逻辑，单独抽出来测。

创建 `pc/apps/desktop/src/renderer/shell/launcher/useCommandSearch.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { shouldSearch } from './useCommandSearch';

describe('shouldSearch', () => {
  it('非组合态时应检索', () => {
    expect(shouldSearch({ composing: false, value: '时间' })).toBe(true);
  });

  it('组合态进行中不应检索', () => {
    expect(shouldSearch({ composing: true, value: 'shijian' })).toBe(false);
  });

  it('组合态结束后应检索', () => {
    expect(shouldSearch({ composing: false, value: '时间' })).toBe(true);
  });

  it('空值非组合态时应检索（用于清空结果）', () => {
    expect(shouldSearch({ composing: false, value: '' })).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd pc && npx vitest run apps/desktop/src/renderer
```

Expected: FAIL，报错 `Failed to resolve import "./useCommandSearch"`。

- [ ] **Step 3: 实现检索 hook**

创建 `pc/apps/desktop/src/renderer/shell/launcher/useCommandSearch.ts`：

```ts
import { useCallback, useEffect, useState } from 'react';

export interface SearchHit {
  id: string;
  title: string;
  score: number;
}

declare global {
  interface Window {
    flow: {
      searchCommands: (query: string, locale: string) => Promise<SearchHit[]>;
      executeCommand: (id: string) => Promise<void>;
    };
  }
}

/**
 * 是否应触发检索。
 *
 * 输入法组合期间必须跳过：中日韩用户经 IME 输入，若在
 * composition 未结束时就拿中间态（如拼音串 shijian）去匹配，
 * 结果列表会剧烈跳动（spec §9.2）。
 */
export function shouldSearch(state: { composing: boolean; value: string }): boolean {
  return !state.composing;
}

export function useCommandSearch(value: string, composing: boolean) {
  const [hits, setHits] = useState<SearchHit[]>([]);

  useEffect(() => {
    if (!shouldSearch({ composing, value })) return;

    let cancelled = false;
    const locale = navigator.language;

    window.flow
      .searchCommands(value, locale)
      .then((results) => {
        if (!cancelled) setHits(results);
      })
      .catch((error: unknown) => {
        // 检索失败不能让 launcher 卡死，降级为空结果（spec §13）
        console.error('[flow] 指令检索失败', error);
        if (!cancelled) setHits([]);
      });

    return () => {
      cancelled = true;
    };
  }, [value, composing]);

  const execute = useCallback(async (id: string) => {
    try {
      await window.flow.executeCommand(id);
    } catch (error: unknown) {
      console.error('[flow] 指令执行失败', error);
    }
  }, []);

  return { hits, execute };
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd pc && npx vitest run apps/desktop/src/renderer
```

Expected: 4 tests passed。

- [ ] **Step 5: 实现结果列表组件**

创建 `pc/apps/desktop/src/renderer/shell/launcher/ResultList.tsx`：

```tsx
import type { SearchHit } from './useCommandSearch';

interface Props {
  hits: SearchHit[];
  activeIndex: number;
  onSelect: (id: string) => void;
}

export function ResultList({ hits, activeIndex, onSelect }: Props) {
  if (hits.length === 0) {
    return <div className="launcher__empty">无匹配指令</div>;
  }

  return (
    <ul className="launcher__results">
      {hits.map((hit, index) => (
        <li
          key={hit.id}
          className={
            index === activeIndex ? 'launcher__row launcher__row--active' : 'launcher__row'
          }
          onMouseDown={() => onSelect(hit.id)}
        >
          {hit.title}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 6: 实现输入框组件**

创建 `pc/apps/desktop/src/renderer/shell/launcher/LauncherInput.tsx`：

```tsx
import { useState } from 'react';
import { ResultList } from './ResultList';
import { useCommandSearch } from './useCommandSearch';

export function LauncherInput() {
  const [value, setValue] = useState('');
  const [composing, setComposing] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const { hits, execute } = useCommandSearch(value, composing);

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    // 组合态期间方向键与回车属于输入法，不能被 launcher 抢走
    if (composing) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, hits.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const hit = hits[activeIndex];
      if (hit !== undefined) void execute(hit.id);
    }
  }

  return (
    <div className="launcher">
      <input
        className="launcher__input"
        autoFocus
        value={value}
        placeholder="输入指令…"
        onChange={(event) => {
          setValue(event.target.value);
          setActiveIndex(0);
        }}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={(event) => {
          setComposing(false);
          setValue(event.currentTarget.value);
        }}
        onKeyDown={handleKeyDown}
      />
      <ResultList hits={hits} activeIndex={activeIndex} onSelect={(id) => void execute(id)} />
    </div>
  );
}
```

- [ ] **Step 7: 接入入口**

替换 `pc/apps/desktop/src/renderer/main.tsx` 全部内容：

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LauncherInput } from './shell/launcher/LauncherInput';
import './styles/global.css';

const container = document.getElementById('root');
if (container === null) throw new Error('找不到 #root 挂载点');

createRoot(container).render(
  <StrictMode>
    <LauncherInput />
  </StrictMode>,
);
```

- [ ] **Step 8: 端到端手工验证**

```bash
cd pc && npm start
```

依次确认：

1. 按 Option+Space（macOS）/ Alt+Space 唤起窗口，输入框自动聚焦
2. 输入 `quit`，结果列表出现"退出 flow"
3. 输入 `退出`，同样命中
4. 中文输入法下输入 `tuichu` 并按空格上屏——**组合过程中结果列表不应跳动**，上屏后才检索
5. 方向键上下移动高亮，回车执行
6. 点击窗口外部，窗口自动隐藏

- [ ] **Step 9: 全量校验**

```bash
cd pc && npm run lint && npm run lint:css && npm test
```

Expected: 三条全部 exit 0。

- [ ] **Step 10: 提交**

```bash
cd pc
git add -A
git commit -m "feat(desktop): add launcher UI with IME composition handling

spec §9.2、§13。输入法组合期间不触发检索，也不抢方向键与
回车——否则中日韩用户敲拼音时结果列表会剧烈跳动。检索与
执行失败均降级不阻断，按快捷键没反应是这类产品最严重的
体验故障。"
```

---

## Task 14: 最终校验与文档

**Files:**
- Modify: `pc/README.md`

- [ ] **Step 1: 写 README**

替换 `pc/README.md` 全部内容：

````markdown
# flow — PC 桌面端

launcher 型效率工具箱。设计文档见 `../docs/superpowers/specs/2026-08-08-pc-directory-structure-design.md`。

## 结构

```
apps/desktop/        Electron 宿主
packages/
  plugin-protocol/   宿主 ↔ 插件契约（零依赖）
  core/              纯算法：指令匹配、快捷键默认值
  i18n/              排序、重音折叠
```

## 常用命令

在 `pc/` 目录下执行：

```bash
npm start          # 启动开发环境
npm test           # 跑全部单测
npm run lint       # eslint，含依赖方向检查
npm run lint:css   # stylelint，含 RTL 逻辑属性检查
npm run typecheck  # 全量类型检查
npm run make       # 打包
```

## 约束

- **TypeScript 固定 `~6.0.3`**。TS 7 是 Go 重写版，无经典 JS API，`@typescript-eslint` 不支持。
- **样式只用 CSS 逻辑属性**（`margin-inline-start` 等），stylelint 会拦截物理方向属性。为 RTL 预留，事后补等于重写样式层。
- **依赖方向由 eslint zones 强制**，规则见 `eslint.config.mjs`。修改时注意 `basePath` 与 resolver 缺一不可，缺任一都会静默放行。
````

- [ ] **Step 2: 跑完整校验**

```bash
cd pc && npm run typecheck && npm run lint && npm run lint:css && npm test
```

Expected: 四条全部 exit 0。

- [ ] **Step 3: 确认打包仍然可用**

```bash
cd pc && npm run make
```

Expected: 产出安装包。这是 Task 3 之后引入 React、workspace 包依赖的回归验证。

- [ ] **Step 4: 提交**

```bash
cd pc
git add -A
git commit -m "docs(pc): add README with structure and constraints

记录三条容易踩的约束：TS 版本上限、CSS 逻辑属性强制、
依赖方向规则的两个静默失败点。"
```

---

## 完成标准

本计划完成后应满足：

- [ ] `npm start` 能启动，按平台默认快捷键可唤起 launcher
- [ ] 输入中文或英文关键词均可检索到宿主指令，回车可执行
- [ ] 中文输入法组合期间结果列表不跳动
- [ ] `npm test` 全绿，覆盖协议层 schema 正反例、匹配算法边界、i18n 排序与折叠
- [ ] `npm run lint` 能拦住 `packages/*` 导入 `apps/*` 的违规
- [ ] `npm run lint:css` 能拦住 `margin-left`，放行 `text-align: center`
- [ ] `npm run make` 产出安装包

## 后续计划

第 8–13 步各自独立出计划：

1. L1 沙箱运行时与 `packages/plugin-sdk`
2. 官方时间戳插件（反向验证 SDK）
3. L0 声明式运行时与创建界面
4. 动态指令与动态结果推送
5. 数据层与同步接口形状
6. L2 特权运行时与特权内置工具

## 自查记录

- **Spec 覆盖**：本计划对应 spec §15 第 1–7 步。§5.2 三个不可回退决定由 Task 5/6/7 实现；§9.1 多 locale 关键词由 Task 6 实现；§9.2 IME 由 Task 13 实现；§9.3 快捷键由 Task 12 实现；§9.4 排序折叠由 Task 8 实现；§9.6 RTL 预留由 Task 2 + Task 10 实现；§12 依赖方向由 Task 4 实现；§16.1 打包验证由 Task 3 前置。
- **未覆盖项（有意）**：§6.2 动态指令、§6.3 动态结果推送、§6.4 payload、§7 各层运行时、§10 数据层、§11 网络代理——均属第 8–13 步，另行出计划。
- **类型一致性**：`LocalizedString` / `LocalizedKeywords` / `Locale` 定义于 Task 5–6，被 Task 11 的 `HostCommand` 复用；`MatchCandidate` / `MatchResult` 定义于 Task 9，被 Task 11 消费；`SearchHit` 在 Task 11（主进程）与 Task 13（渲染层）各定义一次，形状一致——跨进程边界不共享类型是有意的，渲染层不得 import 主进程代码（spec §12 规则 3）。
