# PC 桌面端目录结构设计

- 日期：2026-08-08
- 范围：仅 `pc/`（Electron 桌面端）。`backend/`、`mobile/` 不做设计，但见 §9.1——后端已在 P0 关键路径上。
- 状态：已确认，待实施
- 需求来源：[课题：实现一个桌面端提效工具箱](https://bytedance.larkoffice.com/wiki/TapFwjHzmicRIekaf6xcxfY7nuf)

## 1. 背景

`flow` 是一个桌面端提效工具箱，对标 uTools / Alfred / Raycast。课题明确要求**主要业务逻辑自行实现，三方库只可用于局部功能**。

仓库按端划分为 `backend/`、`mobile/`、`pc/`。`pc/` 目前是一份未改动的 Electron Forge + Vite + TypeScript 脚手架：`src/` 下只有 `main.ts`、`preload.ts`、`renderer.ts`、`index.css`，preload 为空，渲染层无框架，Forge 只注册了 `main_window` 一个渲染入口。

在写业务代码之前定结构，成本最低。

### 1.1 产品形态：这是 launcher，不是工作台

课题 P0 第一条是"支持快捷键唤醒应用，**输入指令直达功能**"。这决定了产品的基本形态是 **launcher**——用户按下全局快捷键，唤起一个输入框，敲几个字符后直接跳进某个插件的某个具体功能，而不是"打开应用 → 找到插件 → 点进去 → 再操作"。

这一条对架构的影响比它看起来大得多：它要求存在一套**全局指令注册与检索系统**（§5），而不只是一个插件列表页。本设计的第一版遗漏了这一点，此版补上。

## 2. 需求到架构的映射

| 课题需求 | 优先级 | 承载位置 |
| --- | --- | --- |
| 快捷键唤醒、输入指令直达 | P0 | §5 指令系统 |
| 桌面悬浮球 | P0 | `main/windows/floating-ball.ts` |
| 多语言 | P0 | `packages/i18n` + manifest 的 `LocalizedString` |
| 深浅色模式、换肤 | P0 | `packages/ui` 设计 token + `main/services/theme` |
| 应用市场：上传、安装 | P0 | `main/market/` + `main/plugins/installer.ts`，**依赖后端** |
| 用户自行开发安装本地应用 | P0 | `main/plugins/installer.ts` 的本地安装路径 |
| 开发者文档 demo | P1 | `packages/plugin-sdk/testing` + `plugins/` 官方工具作参考实现 |
| 市场应用支持更新 | P1 | `main/market/updater.ts`，**依赖后端** |
| 数据安全：防数据窃取、防恶意插件攻击服务器 | P1 ⭐️⭐️⭐️⭐️⭐️ | §8 安全边界 |
| 时间戳转换 | P0 | `plugins/timestamp/`（沙箱工具） |
| 数据同步：用户设置、插件设置跨设备 | P0 | §7 数据层与同步，**依赖后端** |
| 剪贴板历史（含跨设备同步） | P1 | 特权内置工具（§6） |
| 局域网共享文件/文本 | P1 | 特权内置工具（§6） |
| 截图：区域选择、贴图、标注 | P1 | 特权内置工具（§6） |

## 3. 已确认的产品与技术约束

| 维度 | 结论 |
| --- | --- |
| 产品形态 | launcher 型工具箱，全局快捷键唤起 + 指令直达 |
| 平台形态 | 官方内置工具 + 支持第三方上传插件，是真插件平台而非模块化应用 |
| 插件隔离 | 沙箱 UI + 宿主 API。插件 UI 跑在独立沙箱渲染上下文（`sandbox` + `contextIsolation`，无 Node），只能通过消息通道调用宿主显式开放的能力 |
| 权限模型 | 能力走 manifest 声明 + 用户授权 |
| 渲染框架 | React |
| 数据 | local-first，本地为主；跨设备同步是 P0，不是预留项 |
| 官方工具实现方式 | **两类并存**：沙箱工具走 SDK（与第三方同构）；特权内置工具在宿主内实现（见 §6） |

### 3.1 一个必须记录的冲突

现有 `pc/forge.config.ts` 的 Fuses 配置为：

```ts
[FuseV1Options.OnlyLoadAppFromAsar]: true,
[FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
[FuseV1Options.RunAsNode]: false,
```

这套基线假设的是"应用代码只能来自签名过的 asar，外部代码一律不可信"，而第三方插件恰恰是装在 asar 之外用户目录里的代码。

本设计选择的沙箱方案化解了这个冲突：**插件代码永远不进入主应用上下文，也不以 Node 模块方式被 require**，而是作为 Web 资源加载进沙箱渲染上下文。因此上述 Fuses 基线原样保留，不放宽。

这条约束是硬的——任何"让插件跑 Node 代码"的后续需求都会推翻它，届时必须重新做安全评审，而不是简单加个开关。

## 4. 目录结构

### 4.1 顶层

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
│   ├── ui/                   # 共享组件与设计 token
│   └── i18n/                 # 多语言资源与运行时
└── plugins/                  # 官方沙箱工具，基于 plugin-sdk 编写
    └── timestamp/
```

`plugins/` 与 `apps/desktop/` 平级而非嵌在其中：官方**沙箱**工具与第三方插件**同构**——同样基于 SDK、同样跑在沙箱、同样受权限约束。它们不是宿主的一部分，只是默认随包分发。这样 SDK 缺什么能力，我们做第一个官方工具时就会撞到，而不是等第三方开发者提 issue。

选择 workspace 多包而非单包分层，理由是**第三方插件作者需要 `npm install` SDK**：SDK 必须能独立发版，宿主 API 版本也必须能独立于应用版本演进。单包结构满足不了这一点。

### 4.2 `packages/plugin-protocol`——契约层

零依赖，位于依赖图最底层。宿主与 SDK 共同依赖它，彼此不直接依赖。

```
src/
├── manifest.ts        # 插件 manifest 的 schema 与类型
├── contributions.ts   # 指令贡献、payload 类型声明（见 §5）
├── permissions.ts     # 权限枚举与授权文案 key
├── localized.ts       # LocalizedString：多语言字符串的表示
├── messages/
│   ├── envelope.ts    # 请求/响应/事件信封，错误码
│   ├── host-to-plugin.ts
│   └── plugin-to-host.ts
└── version.ts         # 宿主 API 版本与兼容区间
```

**必须使用运行时 schema（如 zod），不能只写 TypeScript 类型。** 插件 manifest 和每一条跨沙箱消息都是不可信输入，TS 类型在运行时不存在，不做真实校验等于没有校验。

`localized.ts` 不是可选项：多语言是 P0，而插件贡献的**指令名与描述会直接出现在 launcher 的搜索结果里**。如果 manifest 只允许纯字符串，中文界面下会混入英文指令名。因此 manifest 中所有面向用户的文本字段类型都是 `LocalizedString` 而非 `string`，这个决定必须在协议第一版就做，之后再改会破坏所有已发布插件。

`version.ts` 独立存在，使第三方插件可声明兼容的宿主 API 区间，宿主据此决定加载或拒绝。

### 4.3 `packages/plugin-sdk`——第三方开发者接口

```
src/
├── index.ts       # definePlugin() 等入口
├── client.ts      # 把 postMessage 往返封装成 Promise
├── commands.ts    # 指令的注册与 payload 接收
├── api/           # 按能力域拆：storage / notification / clipboard / fs / http
└── testing/       # 给插件作者的 mock 宿主
```

`testing/` 不可省略：第三方开发者必须能在不启动宿主应用的前提下对插件做单元测试，否则插件生态难以形成。课题 P1 要求的"开发者文档 demo"也以此为基础。

### 4.4 `packages/core`——领域模型

```
src/
├── models/        # 实体与值对象
├── usecases/      # 纯业务逻辑
└── errors/        # 领域错误类型
```

硬约束：不 import `electron`。保证领域逻辑可在 Node 环境用 vitest 直接运行，无需启动 Electron。

指令匹配算法（§5）属于纯逻辑，放在这里而非主进程，以便大量单测覆盖。

### 4.5 `packages/ui` 与 `packages/i18n`

`ui` 服务宿主外壳与特权内置工具。插件运行在沙箱中，无法复用宿主的 React 组件实例，因此该包对插件的价值主要是**导出设计 token（CSS 变量）**——宿主把当前主题的 CSS 变量注入插件沙箱，插件 UI 通过变量继承主题，插件作者不需要各自实现深浅色与换肤。

`i18n` 存放宿主自身的语言资源与运行时。插件的语言资源随插件包分发，通过 `LocalizedString` 解析，不进这个包。

### 4.6 `apps/desktop`

```
apps/desktop/
├── forge.config.ts
├── index.html
├── vite.main.config.ts
├── vite.preload.config.ts
├── vite.renderer.config.ts
├── package.json
├── e2e/                          # Playwright for Electron
└── src/
    ├── main/
    │   ├── index.ts              # 只做装配，不写业务
    │   ├── bootstrap/            # 单实例锁、协议注册、崩溃上报、自动更新
    │   ├── shortcuts/            # 全局快捷键注册与冲突处理
    │   ├── windows/
    │   │   ├── launcher-window.ts  # 快捷键唤起的输入框窗口
    │   │   ├── floating-ball.ts    # 桌面悬浮球
    │   │   ├── main-window.ts      # 设置、插件管理等完整界面
    │   │   ├── plugin-view.ts      # 插件沙箱视图的创建与销毁
    │   │   └── window-state.ts     # 位置尺寸持久化
    │   ├── commands/             # 指令系统（见 §5）
    │   │   ├── registry.ts       # 全局指令索引
    │   │   ├── matcher.ts        # 匹配与排序（算法在 packages/core）
    │   │   ├── usage.ts          # 使用频率与最近使用
    │   │   └── payload.ts        # 上下文 payload 的采集与类型判定
    │   ├── ipc/
    │   │   ├── index.ts          # 集中注册
    │   │   ├── router.ts         # 统一入参校验 + 错误包装
    │   │   └── handlers/         # 按能力域拆
    │   ├── plugins/
    │   │   ├── registry.ts       # 已装插件清单
    │   │   ├── installer.ts      # 安装：市场下载 / 本地包，含校验
    │   │   ├── loader.ts         # 生命周期 activate / deactivate
    │   │   ├── permissions.ts    # 授权状态与用户确认
    │   │   ├── bridge.ts         # protocol 的宿主侧实现
    │   │   └── sandbox-policy.ts # CSP、权限位、API 白名单
    │   ├── market/               # 应用市场客户端
    │   │   ├── client.ts         # 浏览、搜索、下载
    │   │   └── updater.ts        # 版本检查与更新
    │   ├── features/             # 特权内置工具的主进程侧（见 §6）
    │   │   ├── index.ts          # 编译期固定白名单
    │   │   ├── screenshot/
    │   │   ├── clipboard-history/
    │   │   └── lan-share/
    │   ├── services/             # 宿主能力实现，被 ipc 与 bridge 共用
    │   ├── account/              # 账号与登录态，同步的前置
    │   ├── data/
    │   │   ├── db.ts
    │   │   ├── migrations/       # 带序号，只增不改
    │   │   └── repositories/
    │   ├── sync/                 # 同步引擎、冲突策略、离线队列（P0）
    │   └── logging/
    ├── preload/
    │   ├── host.ts               # 宿主渲染层用
    │   └── plugin.ts             # 插件沙箱用，只暴露一个消息通道
    └── renderer/
        ├── main.tsx
        ├── app/                  # 路由、布局、Provider、错误边界
        ├── shell/                # 外壳
        │   ├── launcher/         # 唤起窗口的输入框与结果列表
        │   ├── settings/
        │   ├── plugin-manager/   # 已装插件与市场
        │   └── plugin-host/      # 插件沙箱视图的容器
        ├── features/             # 特权内置工具的渲染层侧（见 §6）
        ├── lib/                  # ipc 客户端封装等
        ├── stores/
        └── styles/
```

#### 两个 preload 是安全模型的关键

- `host.ts`：给宿主渲染层，通过 `contextBridge` 暴露较宽的受控 API。
- `plugin.ts`：给插件沙箱，**只暴露一个 postMessage 通道，此外什么都没有**。插件的任何操作都必须发消息给 `bridge.ts`，由其校验权限位后决定是否放行。

#### `services/` 被两个入口共用是有意设计

同一份能力实现，`ipc/handlers`（宿主渲染层入口）与 `plugins/bridge`（插件入口）各自做各自的鉴权。这样"宿主能做而插件不能做"的差异集中在鉴权层，而非退化成两份重复实现。

## 5. 指令系统

launcher 的核心。用户敲入的每个字符都要在全局指令索引里检索，命中后直达功能。

### 5.1 指令从哪来

三个来源统一进入同一个索引，`registry.ts` 不区分它们的出身：

1. 沙箱插件在 manifest 的 `contributions` 里声明
2. 特权内置工具在 `main/features/index.ts` 中静态注册
3. 宿主自身的动作（打开设置、退出、切换主题等）

### 5.2 payload 匹配

uTools 类产品的关键体验：唤起 launcher 时，当前上下文会参与匹配。复制了一张图片后唤起，应当直接推荐"图片压缩"而不是让用户再敲关键词。

因此指令声明中除了关键词，还要声明**能接收什么类型的 payload**（文本 / 图片 / 文件路径 / 正则匹配的文本等）。`main/commands/payload.ts` 负责采集当前上下文（剪贴板内容、选中文本、拖入的文件）并判定类型，`matcher.ts` 据此过滤与加权。

payload 采集触及剪贴板与选中内容，属于敏感操作：**采集只发生在宿主主进程，且只在 launcher 唤起的瞬间发生**；payload 只投递给用户实际选中的那一条指令所属的插件，不广播给所有插件。这一条是安全要求，不是性能优化。

### 5.3 匹配算法放在 `packages/core`

匹配与排序（模糊匹配、拼音首字母、使用频率衰减、最近使用加权）是纯函数，放在 `packages/core/usecases` 而非主进程，便于用 vitest 大量覆盖边界。`main/commands/matcher.ts` 只做接线，不含算法。

课题要求主要业务逻辑自研，指令匹配正是"主要业务逻辑"的一部分，不应整体套用现成的模糊搜索库。

## 6. 官方工具的两种形态

第一版设计写的是"官方业务工具一律基于 SDK 编写"。对照课题需求后这条不成立，此处修正。

### 6.1 为什么必须分两类

课题 P1 中有三个工具在沙箱里做不到：

| 工具 | 沙箱做不到的原因 |
| --- | --- |
| 截图 | 需要全屏捕获、区域选择的全屏 overlay 窗口、贴图用的无边框置顶窗口。沙箱插件无法创建窗口 |
| 局域网共享 | 需要监听 TCP/UDP 端口、mDNS 服务发现。沙箱插件无法监听端口 |
| 剪贴板历史 | Electron 没有剪贴板变化事件，只能主进程持续轮询，是常驻后台任务 |

### 6.2 两类的边界

- **沙箱工具**：纯计算与 UI，能力不超出 SDK 开放范围。走 `plugins/`，与第三方同构。时间戳转换属于此类。
- **特权内置工具**：需要窗口创建、端口监听、常驻后台等主进程能力。主进程侧在 `main/features/`，渲染层侧在 `renderer/features/`。

`renderer/features/` 在此版中恢复，但含义与第一版不同且不矛盾：它只放**特权内置工具的界面**，不放任何应该走 SDK 的业务工具。判断标准是 §6.1 的能力边界，不是开发便利。

### 6.3 白名单必须是编译期固定的

`main/features/index.ts` 是特权工具的**唯一注册入口，且只能在编译期确定**。不提供运行时注册接口，不从磁盘扫描目录，不接受任何形式的动态扩展。

这条约束的理由是直接的：特权工具绕过了整套沙箱与权限模型。一旦存在运行时注册路径，第三方插件迟早会找到办法伪装成特权工具，届时课题里 ⭐️⭐️⭐️⭐️⭐️ 的"防止恶意插件"要求就整体失效了。宁可每加一个内置工具都要发版，也不开这个口子。

## 7. 数据层与同步

local-first，SQLite 作为本地库，读写只发生在主进程，渲染层通过 IPC 访问。

- `data/migrations/` 按序号命名，**只增不改**——已发布的迁移脚本任何情况下不得修改，否则老用户的库无法升级。
- `data/repositories/` 隔离 SQL 与业务逻辑，`packages/core` 的用例只依赖 repository 接口，不感知 SQLite。
- 插件数据按插件 ID 隔离存储，卸载插件时可整体回收。隔离由 `plugins/bridge` 在存储 API 入口处强制注入插件 ID 实现，插件无法访问其他插件的命名空间。

### 7.1 同步是 P0，不是预留项

第一版把 `sync/` 写成"首个版本不实现，仅确立接口形状"。课题中数据同步是 **P0**（用户设置 + 插件设置跨设备），P1 的剪贴板历史还要求内容同步。此处修正。

同步的实现前提有三样，都不在 `pc/` 内部：账号体系、服务端存储、冲突解决约定。因此：

- `main/account/` 与 `main/sync/` 在 pc 侧的**接口形状必须在写业务代码之前定下来**，包括同步单元的粒度、版本向量或时间戳的表示、冲突时的取舍规则。
- 数据表从第一天就带上同步所需的元字段（更新时间、设备 ID、软删除标记）。这些字段事后补要写数据迁移，且历史数据无法回填出正确的同步状态。
- 局域网共享（P1）与跨设备同步（P0）是两条独立通路，不要试图用一套机制覆盖：前者是点对点直传，后者经服务端中转。

## 8. 安全边界

课题把"数据安全，防止应用数据被盗取，防止恶意插件攻击服务器"标为 ⭐️⭐️⭐️⭐️⭐️，是全篇最高难度项。本设计的沙箱方案直接服务于此，另需三条补充约束：

1. **插件网络请求必须经宿主代理**。不允许插件沙箱直接发起任意请求。宿主在 `services/http` 统一出口，实施域名白名单（由 manifest 声明、用户授权）、速率限制与请求体大小上限。这一条是"防止恶意插件攻击服务器"的直接对策——没有它，任何一个插件都能把用户机器变成攻击源。
2. **插件间数据不可见**。存储、剪贴板、文件访问等 API 在 `bridge` 入口强制按插件 ID 隔离，插件无法构造出访问他人命名空间的参数。
3. **payload 定向投递**。见 §5.2，上下文内容只给用户选中的那一条指令，不广播。

## 9. 依赖方向规则

```
              plugin-protocol          ← 零依赖，依赖图底层
                     ↑
        ┌────────────┴────────────┐
   plugin-sdk                apps/desktop
        ↑                         ↑
   ┌────┴─────┐          core / ui / i18n
plugins/*   第三方插件
（官方沙箱工具）
```

1. `core` 不 import `electron`
2. `packages/*` 与 `plugins/*` 均不依赖 `apps/*`（反向依赖即为错误）
3. 渲染层不直接 import 主进程代码，只通过 preload 暴露的类型
4. `plugins/*` 之间不横向 import，需共享则下沉到 `packages/ui` 或 `packages/core`。官方沙箱工具之间互相 import 会让它们悄悄脱离"与第三方同构"这一前提，从而失去验证 SDK 的价值
5. `main/features/*`（特权工具）之间不横向 import，且不得被 `main/plugins/*` 引用——插件运行时不应知道特权工具的存在

**这五条必须落成 CI 检查**，用 eslint `import/no-restricted-paths` 或 dependency-cruiser 实现。纯口头约定在多人长期项目中必然被打破，而边界一旦破坏，事后拆解的成本远高于事前拦截。这是本设计中唯一真正决定"可维护性"的机制，其余部分只是良好的组织形式。

## 10. 错误处理

三道边界，各自不允许错误穿透：

1. **IPC 边界**：`ipc/router.ts` 统一将参数校验失败、未授权、内部异常映射为 `plugin-protocol` 中定义的错误码，原始异常与堆栈不穿透到渲染层。
2. **插件边界**：`plugins/bridge.ts` 捕获插件侧的所有异常与协议违规，降级为"禁用该插件 + 通知用户"，不污染宿主状态。
3. **渲染层边界**：error boundary 按工具粒度切分，单个工具崩溃不影响外壳与其他工具。

launcher 窗口需要额外一条：指令检索路径上的任何异常都不能让唤起失败。索引损坏时降级为"只显示宿主自身指令"，而不是唤不出窗口——用户按了快捷键没反应，是这类产品最严重的体验故障。

## 11. 测试布局

按"跑得快的多写"分布：

| 位置 | 类型 | 说明 |
| --- | --- | --- |
| `packages/core` | vitest 单测 | 主战场，纯 Node，无需 Electron。指令匹配算法在此重点覆盖 |
| `packages/plugin-protocol` | vitest 单测 | schema 必须写正反例，覆盖恶意/畸形输入 |
| `packages/plugin-sdk` | vitest 单测 | 借助自身 `testing/` mock 宿主 |
| `apps/desktop/src/main` | 单测为主 | 少量 Electron 集成测试；`commands/`、`sync/` 需重点覆盖 |
| `plugins/*` | vitest 单测 | 用 SDK 的 mock 宿主跑，与第三方插件的测试方式一致 |
| `apps/desktop/e2e` | Playwright for Electron | 覆盖快捷键唤起 → 指令检索 → 进入插件的主链路，以及插件安装流程 |

## 12. 迁移路径

1. 在 `pc/` 建立 workspace 根配置（`package.json` workspaces、`tsconfig.base.json`、`eslint.config.mjs`）
2. 将现有 `src/`、`forge.config.ts`、`index.html`、三个 vite 配置整体移入 `apps/desktop/`
3. 用 flat config 取代现有 `.eslintrc.json`
4. **立即验证打包链路**：跑通一次完整 `npm run make`（见 §13.1）
5. 建立 `packages/plugin-protocol` 与 `packages/core` 空骨架，跑通依赖方向的 CI 检查
6. 引入 React 与渲染层外壳骨架
7. 打通最小 launcher 链路：全局快捷键 → 唤起窗口 → 检索宿主自身指令 → 执行
8. 实现插件运行时（`main/plugins/`）与 `packages/plugin-sdk`
9. 用 SDK 写时间戳转换工具放入 `plugins/`，反向验证 SDK 与指令贡献机制的能力缺口
10. 落地数据层与同步接口形状（含同步元字段），再接入特权内置工具

两处顺序是刻意的：依赖方向的 CI 检查放在业务代码之前，是为了让规则从第一天就生效——规则晚于代码引入，等于默认接受一批既成违规；打包验证提到第 4 步，理由见 §13.1。

第 7 步先打通"只有宿主指令"的最小 launcher，是为了在引入插件复杂度之前先验证唤起链路本身。这条链路涉及全局快捷键、窗口显隐、焦点管理、多显示器定位，坑比看起来多，不适合和插件系统一起调试。

## 13. 开放问题

### 13.1 Forge 在 workspace 下的打包验证

local-first 方案大概率引入 better-sqlite3 等原生模块。Electron Forge 在 workspace 结构下对依赖提升与原生模块重建存在已知摩擦，`packagerConfig` 需显式处理。

**本设计未在实际环境中验证过这一点。** 迁移路径第 2 步完成后应立即跑一次完整 `npm run make` 确认打包链路可用，不要等到业务代码堆积后才发现。

### 13.2 插件包校验强度

`installer.ts` 中的"校验"具体指签名验证还是仅哈希校验，取决于应用市场的形态。

- 有分发平台：应做发布者签名验证，宿主内置公钥
- 本地安装路径：无法验签，必须在 UI 上明确标示来源不可信，并对权限申请做更严格的二次确认

课题同时要求"支持用户自行开发安装本地应用"和"防止恶意插件"，这两条本身存在张力。本地安装是开发者必需的能力，但它天然绕过市场审核。建议的处理是：本地安装的插件默认进入受限模式，敏感权限一律不予授予，需用户在设置里显式解除限制。该策略需在插件运行时开发阶段确认。

### 13.3 后端已在 P0 关键路径上

本设计的范围是 `pc/`，但课题的 P0 里有两项**无法在 pc 内部闭环**：

- **应用市场**：上传、审核、分发、更新都需要服务端
- **数据同步**：需要账号体系与服务端存储

这意味着 `backend/` 不是"以后再说"的事项。pc 侧能做的是把 `main/market/` 与 `main/sync/` 的接口形状先定下来，让后端接入时不必改写数据层；但**接口形状的确定本身就需要与后端设计对齐**，不能单方面拍板。

建议在 pc 进入第 10 步之前，单独为 `backend/` 走一次设计流程。
