# flow — PC 桌面端

launcher 型效率工具箱。设计文档见 `../docs/superpowers/specs/2026-08-08-pc-directory-structure-design.md`，实施计划见 `../docs/superpowers/plans/2026-08-08-pc-foundation.md`。

## 结构

```
apps/desktop/        Electron 宿主（main / preload / renderer）
packages/
  plugin-protocol/   宿主 ↔ 插件契约，零依赖（除 zod）
  core/              纯算法：指令匹配、快捷键默认值
  i18n/              检索归一化、locale 感知排序
```

## 常用命令

在 `pc/` 目录下执行：

```bash
npm start          # 启动开发环境
npm test           # 跑全部单测
npm run lint       # eslint，含依赖方向检查
npm run lint:css   # stylelint，含 RTL 逻辑属性检查
npm run typecheck  # 类型检查
npm run make       # 打包
```

## 当前进度

已完成设计文档 §15 迁移路径的第 1–7 步：workspace 结构、协议层三个不可回退决定、i18n、匹配算法、React 外壳、最小 launcher 闭环。

第 8–13 步（L1/L0/L2 插件运行时、SDK、动态指令、数据同步）尚未开始，各自另有计划。

## 容易踩的坑

以下每条都是实际踩过并修复的，改动相关代码前请先读。

### TypeScript 固定 `~6.0.3`，不要升 7

`typescript@7` 是 Go 重写版，npm 包里没有经典 JS API（根导出只是 `lib/version.cjs`），而 `@typescript-eslint` 的 peer 至今是 `>=4.8.4 <6.1.0`，升级会直接 ERESOLVE 失败。

### `@electron/fuses` 固定 `^1.8.0`，不要升 2

`@electron-forge/plugin-fuses@7.11.2` 的 peer 是 `^1.0.0`。

### 改 Vite entry 必须同步改 `main` 字段

Vite 产物名跟随 entry 文件名：`src/main/index.ts` 产出 `index.js`，`src/preload/host.ts` 产出 `host.js`。

因此 `apps/desktop/package.json` 的 `main` 是 `.vite/build/index.js`，`launcher-window.ts` 里的 preload 路径是 `host.js`。

**开发期 `npm start` 不受 `main` 字段影响，问题只在 `npm run make` 时暴露**——改完 entry 一定要跑一次打包。

### vite 版本必须全仓统一

vitest 4 依赖 vite 8。若 `apps/desktop` 单独 pin 其他大版本，npm 会嵌套安装出第二份 vite，导致 `@vitejs/plugin-react` 与配置文件解析到不同副本、类型不兼容。

### 样式只用 CSS 逻辑属性

用 `margin-inline-start` 而非 `margin-left`，`text-align: start` 而非 `left`。stylelint 会拦截物理方向属性，这是为 RTL 语言预留（设计文档 §9.6），事后补等于重写整个样式层。

注意 `text-align` / `float` / `clear` 用的是值级规则，只禁 `left` / `right`，`center` 正常可用。

### 依赖方向规则有两个静默失败点

`eslint.config.mjs` 里的 `import-x/no-restricted-paths` 缺 `basePath` 或缺 `.ts` resolver 时，**eslint 会 exit 0**——配置看起来完全正确，但一条违规都不拦。

修改该规则后，务必写一个必然违规的文件确认它真的报错，再删掉。

### 检索归一化结尾必须 `normalize('NFC')`

`packages/i18n` 的 `foldForSearch` 用 NFD 分解剔除拉丁重音记号，但 NFD 也会拆开日文浊音/半浊音符（`プ` → `フ` + U+309A）。这些记号不在剔除范围内，若停留在分解态，字符串看起来正常但码点与用户输入的 NFC 形态不等，**日文会永远匹配不上**。
