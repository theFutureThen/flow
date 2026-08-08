# @flow/desktop

Electron 宿主。整体设计见 `../../../docs/superpowers/specs/2026-08-08-pc-directory-structure-design.md`。

## 打包验证

spec §16.1 把「Forge 在 workspace 下的打包」列为最大未验证风险，此处记录实测结果。

- 验证日期：2026-08-08
- 环境：macOS arm64、Node v22.16.0、npm 10.9.2
- 命令：`npm run make`（在 `pc/` 下）
- 结果：**通过**。产物 `out/make/zip/darwin/arm64/flow-darwin-arm64-1.0.0.zip`，并已实际启动 `out/flow-darwin-arm64/flow.app` 确认可运行。

### 关于依赖提升

`electron-squirrel-startup` 这一运行时依赖被 npm 提升到了仓库根 `node_modules`，而非 `apps/desktop/node_modules`。**这不构成问题**：Vite 在构建 main target 时把它打进了 `.vite/build/main.js`，打包产物走 `app.asar`，运行时不再解析 `node_modules`。

因此本项目**不需要** `install-strategy=nested` 之类的规避手段。

需要留意的是后续引入原生模块（如 SQLite）时这个结论会变——原生模块无法被 Vite 打包，必须以真实文件出现在产物里。届时需重新验证。
