# PC 桌面端目录结构设计

- 日期：2026-08-08
- 范围：仅 `pc/`（Electron 桌面端）。`backend/`、`mobile/` 不在本次设计内，仅预留接入点。
- 状态：已确认，待实施

## 1. 背景

`flow` 定位为生产力工具平台，仓库按端划分为 `backend/`、`mobile/`、`pc/`。其中 `pc/` 目前是一份未改动的 Electron Forge + Vite + TypeScript 脚手架：`src/` 下只有 `main.ts`、`preload.ts`、`renderer.ts`、`index.css`，preload 为空，渲染层无框架，Forge 只注册了 `main_window` 一个渲染入口。

在写业务代码之前定结构，成本最低。

## 2. 已确认的产品与技术约束

| 维度 | 结论 |
| --- | --- |
| 平台形态 | 官方内置工具 + 支持第三方上传插件，是真插件平台而非模块化应用 |
| 插件隔离 | 沙箱 UI + 宿主 API。插件 UI 跑在独立沙箱渲染上下文（`sandbox` + `contextIsolation`，无 Node），只能通过消息通道调用宿主显式开放的能力 |
| 权限模型 | 能力走 manifest 声明 + 用户授权 |
| 渲染框架 | React |
| 数据 | local-first，本地为主，结构上预留后端同步层 |
| 官方工具实现方式 | 混合：外壳级功能（设置、插件管理、全局搜索）由宿主内部实现；业务型工具（任务、笔记等）基于插件 SDK 编写 |

### 2.1 一个必须记录的冲突

现有 `pc/forge.config.ts` 的 Fuses 配置为：

```ts
[FuseV1Options.OnlyLoadAppFromAsar]: true,
[FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
[FuseV1Options.RunAsNode]: false,
```

这套基线假设的是"应用代码只能来自签名过的 asar，外部代码一律不可信"，而第三方插件恰恰是装在 asar 之外用户目录里的代码。

本设计选择的沙箱方案化解了这个冲突：**插件代码永远不进入主应用上下文，也不以 Node 模块方式被 require**，而是作为 Web 资源加载进沙箱渲染上下文。因此上述 Fuses 基线原样保留，不放宽。

这条约束是硬的——任何"让插件跑 Node 代码"的后续需求都会推翻它，届时必须重新做安全评审，而不是简单加个开关。

## 3. 目录结构

### 3.1 顶层

```
pc/
├── package.json              # workspace 根，private: true，不发版
├── package-lock.json         # 全仓唯一锁文件
├── tsconfig.base.json        # 公共编译选项，各包 extends
├── eslint.config.mjs         # flat config，统一 lint
├── apps/
│   └── desktop/              # Electron 应用本体（宿主）
├── packages/
│   ├── plugin-protocol/      # 宿主 ↔ 插件契约
│   ├── plugin-sdk/           # 发给第三方开发者
│   ├── core/                 # 领域模型，不依赖 Electron
│   └── ui/                   # 共享组件与设计 token
└── plugins/                  # 官方业务工具，基于 plugin-sdk 编写
    ├── tasks/
    └── notes/
```

`plugins/` 与 `apps/desktop/` 平级而非嵌在其中，是"混合式官方工具"决策的直接结果：官方业务工具与第三方插件**同构**——同样基于 SDK、同样跑在沙箱、同样受权限约束。它们不是宿主的一部分，只是默认随包分发。这样 SDK 缺什么能力，我们做第一个官方工具时就会撞到，而不是等第三方开发者提 issue。

选择 workspace 多包而非单包分层，理由是**第三方插件作者需要 `npm install` SDK**：SDK 必须能独立发版，宿主 API 版本也必须能独立于应用版本演进。单包结构满足不了这一点。

### 3.2 `packages/plugin-protocol`——契约层

零依赖，位于依赖图最底层。宿主与 SDK 共同依赖它，彼此不直接依赖。

```
src/
├── manifest.ts        # 插件 manifest 的 schema 与类型
├── permissions.ts     # 权限枚举与授权文案 key
├── messages/
│   ├── envelope.ts    # 请求/响应/事件信封，错误码
│   ├── host-to-plugin.ts
│   └── plugin-to-host.ts
└── version.ts         # 宿主 API 版本与兼容区间
```

**必须使用运行时 schema（如 zod），不能只写 TypeScript 类型。** 插件 manifest 和每一条跨沙箱消息都是不可信输入，TS 类型在运行时不存在，不做真实校验等于没有校验。

`version.ts` 独立存在，使第三方插件可声明兼容的宿主 API 区间，宿主据此决定加载或拒绝。

### 3.3 `packages/plugin-sdk`——第三方开发者接口

```
src/
├── index.ts       # definePlugin() 等入口
├── client.ts      # 把 postMessage 往返封装成 Promise
├── api/           # 按能力域拆：storage / notification / clipboard / fs / http
└── testing/       # 给插件作者的 mock 宿主
```

`testing/` 不可省略：第三方开发者必须能在不启动宿主应用的前提下对插件做单元测试，否则插件生态难以形成。

### 3.4 `packages/core`——领域模型

```
src/
├── models/        # 实体与值对象
├── usecases/      # 纯业务逻辑
└── errors/        # 领域错误类型
```

硬约束：不 import `electron`。保证领域逻辑可在 Node 环境用 vitest 直接运行，无需启动 Electron。

### 3.5 `packages/ui`——共享 UI

服务宿主外壳与官方工具。插件运行在沙箱中，无法复用宿主的 React 组件实例，因此该包对插件的价值主要是**导出设计 token（CSS 变量）**，让插件 UI 通过 CSS 变量继承主题。

### 3.6 `apps/desktop`

```
apps/desktop/
├── forge.config.ts
├── index.html
├── vite.main.config.ts
├── vite.preload.config.ts
├── vite.renderer.config.ts
├── package.json
├── e2e/                        # Playwright for Electron
└── src/
    ├── main/
    │   ├── index.ts            # 只做装配，不写业务
    │   ├── bootstrap/          # 单实例锁、协议注册、崩溃上报、自动更新
    │   ├── windows/
    │   │   ├── main-window.ts
    │   │   ├── plugin-view.ts  # 插件沙箱视图的创建与销毁
    │   │   └── window-state.ts # 位置尺寸持久化
    │   ├── ipc/
    │   │   ├── index.ts        # 集中注册
    │   │   ├── router.ts       # 统一入参校验 + 错误包装
    │   │   └── handlers/       # 按能力域拆
    │   ├── plugins/
    │   │   ├── registry.ts     # 已装插件清单
    │   │   ├── installer.ts    # 下载 / 解压 / 校验
    │   │   ├── loader.ts       # 生命周期 activate / deactivate
    │   │   ├── permissions.ts  # 授权状态与用户确认
    │   │   ├── bridge.ts       # protocol 的宿主侧实现
    │   │   └── sandbox-policy.ts # CSP、权限位、API 白名单
    │   ├── services/           # 宿主能力实现，被 ipc 与 bridge 共用
    │   ├── data/
    │   │   ├── db.ts
    │   │   ├── migrations/     # 带序号，只增不改
    │   │   └── repositories/
    │   ├── sync/               # 预留：同步引擎、冲突策略、离线队列
    │   └── logging/
    ├── preload/
    │   ├── host.ts             # 宿主渲染层用
    │   └── plugin.ts           # 插件沙箱用，只暴露一个消息通道
    └── renderer/
        ├── main.tsx
        ├── app/                # 路由、布局、Provider、错误边界
        ├── shell/              # 外壳：侧边栏、命令面板、设置、插件管理、插件宿主容器
        ├── lib/                # ipc 客户端封装等
        ├── stores/
        └── styles/
```

#### 两个 preload 是安全模型的关键

- `host.ts`：给宿主渲染层，通过 `contextBridge` 暴露较宽的受控 API。
- `plugin.ts`：给插件沙箱，**只暴露一个 postMessage 通道，此外什么都没有**。插件的任何操作都必须发消息给 `bridge.ts`，由其校验权限位后决定是否放行。

#### `services/` 被两个入口共用是有意设计

同一份能力实现，`ipc/handlers`（宿主渲染层入口）与 `plugins/bridge`（插件入口）各自做各自的鉴权。这样"宿主能做而插件不能做"的差异集中在鉴权层，而非退化成两份重复实现。

## 4. 依赖方向规则

```
              plugin-protocol          ← 零依赖，依赖图底层
                     ↑
        ┌────────────┴────────────┐
   plugin-sdk                apps/desktop
        ↑                         ↑
   ┌────┴─────┐              core / ui
plugins/*   第三方插件
（官方工具）
```

1. `core` 不 import `electron`
2. `packages/*` 与 `plugins/*` 均不依赖 `apps/*`（反向依赖即为错误）
3. 渲染层不直接 import 主进程代码，只通过 preload 暴露的类型
4. `plugins/*` 之间不横向 import，需共享则下沉到 `packages/ui` 或 `packages/core`。官方工具之间互相 import 会让它们悄悄脱离"与第三方同构"这一前提，从而失去验证 SDK 的价值

**这四条必须落成 CI 检查**，用 eslint `import/no-restricted-paths` 或 dependency-cruiser 实现。纯口头约定在多人长期项目中必然被打破，而边界一旦破坏，事后拆解的成本远高于事前拦截。这是本设计中唯一真正决定"可维护性"的机制，其余部分只是良好的组织形式。

## 5. 数据层

local-first，SQLite 作为本地库，读写只发生在主进程，渲染层通过 IPC 访问。

- `data/migrations/` 按序号命名，**只增不改**——已发布的迁移脚本任何情况下不得修改，否则老用户的库无法升级。
- `data/repositories/` 隔离 SQL 与业务逻辑，`packages/core` 的 usecase 只依赖 repository 接口，不感知 SQLite。
- 插件数据按插件 ID 隔离存储，卸载插件时可整体回收。隔离由 `plugins/bridge` 在存储 API 入口处强制注入插件 ID 实现，插件无法访问其他插件的命名空间。
- `sync/` 目录在首个版本中不实现具体同步逻辑，仅确立位置与接口形状，避免后续接入 `backend/` 时改写数据层。

## 6. 错误处理

三道边界，各自不允许错误穿透：

1. **IPC 边界**：`ipc/router.ts` 统一将参数校验失败、未授权、内部异常映射为 `plugin-protocol` 中定义的错误码，原始异常与堆栈不穿透到渲染层。
2. **插件边界**：`plugins/bridge.ts` 捕获插件侧的所有异常与协议违规，降级为"禁用该插件 + 通知用户"，不污染宿主状态。
3. **渲染层边界**：error boundary 按工具粒度切分，单个工具崩溃不影响外壳与其他工具。

## 7. 测试布局

按"跑得快的多写"分布：

| 位置 | 类型 | 说明 |
| --- | --- | --- |
| `packages/core` | vitest 单测 | 主战场，纯 Node，无需 Electron |
| `packages/plugin-protocol` | vitest 单测 | schema 必须写正反例，覆盖恶意/畸形输入 |
| `packages/plugin-sdk` | vitest 单测 | 借助自身 `testing/` mock 宿主 |
| `apps/desktop/src/main` | 单测为主 | 少量 Electron 集成测试 |
| `plugins/*` | vitest 单测 | 用 SDK 的 mock 宿主跑，与第三方插件的测试方式一致 |
| `apps/desktop/e2e` | Playwright for Electron | 覆盖关键用户路径与插件安装流程 |

## 8. 迁移路径

1. 在 `pc/` 建立 workspace 根配置（`package.json` workspaces、`tsconfig.base.json`、`eslint.config.mjs`）
2. 将现有 `src/`、`forge.config.ts`、`index.html`、三个 vite 配置整体移入 `apps/desktop/`
3. 用 flat config 取代现有 `.eslintrc.json`
4. 建立 `packages/plugin-protocol` 与 `packages/core` 空骨架，先跑通依赖方向的 CI 检查
5. 引入 React 与渲染层外壳骨架
6. 实现插件运行时（`main/plugins/`）与 `packages/plugin-sdk`
7. 用 SDK 写第一个官方工具放入 `plugins/`，以此反向验证 SDK 的能力缺口

顺序上把依赖方向的 CI 检查放在业务代码之前，是为了让规则从第一天就生效——规则晚于代码引入，等于默认接受一批既成违规。

## 9. 开放问题

以下两项本设计不做决定，需在实施阶段解决：

### 9.1 Forge 在 workspace 下的打包验证

local-first 方案大概率引入 better-sqlite3 等原生模块。Electron Forge 在 workspace 结构下对依赖提升与原生模块重建存在已知摩擦，`packagerConfig` 需显式处理。

**本设计未在实际环境中验证过这一点。** 迁移路径第 2 步完成后应立即跑一次完整 `npm run make` 确认打包链路可用，不要等到业务代码堆积后才发现。

### 9.2 插件包校验强度

`installer.ts` 中的"校验"具体指签名验证还是仅哈希校验，取决于是否存在插件分发平台与签名基础设施。

- 若有分发平台：应做发布者签名验证，宿主内置公钥
- 若暂无：至少校验包哈希与 manifest 完整性，并在 UI 上明确标示插件来源不可信

该决策影响 `installer.ts` 与 `registry.ts` 的实现，但不影响目录结构，可在插件运行时开发阶段再定。
