# PC 桌面端目录结构设计

- 日期：2026-08-08
- 范围：仅 `pc/`（Electron 桌面端）。`backend/`、`mobile/` 不做设计，但见 §16.3——后端已在 P0 关键路径上。
- 状态：已确认，待实施
- 需求来源：[课题：实现一个桌面端提效工具箱](https://bytedance.larkoffice.com/wiki/TapFwjHzmicRIekaf6xcxfY7nuf)
- 产品定位补充：面向全球市场的多语言国际化产品

## 1. 背景

`flow` 是一个桌面端提效工具箱，对标 uTools / Alfred / Raycast，但**面向全球多语言市场**。课题明确要求主要业务逻辑自行实现，三方库只可用于局部功能。

仓库按端划分为 `backend/`、`mobile/`、`pc/`。`pc/` 目前是一份未改动的 Electron Forge + Vite + TypeScript 脚手架：`src/` 下只有 `main.ts`、`preload.ts`、`renderer.ts`、`index.css`，preload 为空，渲染层无框架，Forge 只注册了 `main_window` 一个渲染入口。

### 1.1 产品形态：这是 launcher，不是工作台

课题 P0 第一条是"支持快捷键唤醒应用，**输入指令直达功能**"。产品的基本形态是 launcher——用户按下全局快捷键，唤起输入框，敲几个字符直接跳进某个插件的某个具体功能，而不是"打开应用 → 找插件 → 点进去 → 再操作"。

这要求存在一套全局指令注册与检索系统（§6），而不只是一个插件列表页。

## 2. 竞品调研结论

调研对象：[uTools 开发者文档](https://www.u-tools.cn/docs/developer/information/plugin-json.html)、[Raycast API 文档](https://developers.raycast.com/information/security)。

### 2.1 uTools 的机制

| 机制 | 事实 |
| --- | --- |
| 指令声明 | `plugin.json` 的 `features[].cmds`，分「功能指令」与「匹配指令」 |
| 匹配指令类型 | `regex`、`over`（任意文本）、`img`、`files`、`window`（匹配当前系统窗口的 app / title / class） |
| 动态指令 | `utools.setFeature()` / `removeFeature()` 运行时增删，与静态指令一同进入搜索索引 |
| 动态结果推送 | `feature.mainPush = true` 配合 `onMainPush`，插件可在用户输入时向搜索框推送结果条目 |
| 插件运行环境 | `preload.js` 遵循 CommonJS，可 `require` 任意 Node 模块，可用 Electron 渲染进程 API |
| 安全模型 | **不是隔离，是审查**：要求 preload 不得打包 / 压缩 / 混淆，保证每行代码清晰可读，第三方模块亦须保持源码形式 |
| AI 集成 | `tools` 字段以 JSON Schema 把插件能力暴露给 AI Agent |
| 国际化 | `plugin.json` 中没有任何 i18n 字段 |

### 2.2 三种安全模型对比

|  | uTools | Raycast | flow（本设计） |
| --- | --- | --- | --- |
| 运行环境 | preload 全 Node 权限 | Node 子进程 + 独立 v8 isolate + RPC | L1 沙箱 / L2 受控子进程（§7） |
| 能力边界 | 无技术限制 | 官方称"没有进一步的沙箱隔离"，可访问文件系统与网络 | L1 白名单 API，L2 受控 Node |
| 防恶意手段 | 源码强制可读 + 审查 | 强制开源 + 人工审查 + CI 校验 | L1 技术隔离，L2 隔离 + 审查 |
| 生态规模 | 3000+ 插件，500 万用户 | 大 | — |

**关键结论：两个头部产品都依赖审查而非技术隔离。** 纯沙箱方案在安全性上优于两者，但生态能力天花板显著更低——uTools 现有插件中相当一部分在纯沙箱内无法实现。本设计据此引入双层插件模型（§7）。

### 2.3 国际化是空白区

**Raycast 官方明确不支持本地化，仅支持美式英语**，并建议开发者不要自行引入本地化方案。uTools 是纯中文产品，`plugin.json` 无 i18n 字段。

也就是说：**插件生态的国际化没有成熟参照物**。§9 中每一条都需自行设计，且其中协议层的决定一旦发布便无法回退。

## 3. 需求到架构的映射

| 课题需求 | 优先级 | 承载位置 |
| --- | --- | --- |
| 快捷键唤醒、输入指令直达 | P0 | §6 指令系统 |
| 桌面悬浮球 | P0 | `main/windows/floating-ball.ts` |
| 多语言 | P0 | §9 国际化 |
| 深浅色模式、换肤 | P0 | `packages/ui` 设计 token + `main/services/theme` |
| 应用市场：上传、安装 | P0 | `main/market/` + `main/plugins/installer.ts`，**依赖后端** |
| 用户自行开发安装本地应用 | P0 | `main/plugins/installer.ts` 本地安装路径 |
| 开发者文档 demo | P1 | `packages/plugin-sdk/testing` + `plugins/` 官方工具作参考实现 |
| 市场应用支持更新 | P1 | `main/market/updater.ts`，**依赖后端** |
| 数据安全：防数据窃取、防恶意插件攻击服务器 | P1 ⭐️⭐️⭐️⭐️⭐️ | §7 插件模型 + §11 安全边界 |
| 时间戳转换 | P0 | `plugins/timestamp/`（L1 插件） |
| 数据同步：用户设置、插件设置跨设备 | P0 | §10 数据层与同步，**依赖后端** |
| 剪贴板历史（含跨设备同步） | P1 | 特权内置工具（§8） |
| 局域网共享文件/文本 | P1 | 特权内置工具（§8） |
| 截图：区域选择、贴图、标注 | P1 | 特权内置工具（§8） |

## 4. 已确认的产品与技术约束

| 维度 | 结论 |
| --- | --- |
| 产品形态 | launcher 型工具箱，全局快捷键唤起 + 指令直达 |
| 目标市场 | 全球多语言，首版覆盖 LTR 语言，为 RTL 预留 |
| 插件模型 | 双层：L1 沙箱插件免审即时发布，L2 特权插件强制开源 + 审核 + 签名 |
| 权限模型 | 能力走 manifest 声明 + 用户授权 |
| 渲染框架 | React |
| 数据 | local-first，本地为主；跨设备同步是 P0，不是预留项 |
| 官方工具实现方式 | 沙箱工具走 SDK；需要系统级能力的走特权内置工具（§8） |

### 4.1 一个必须记录的冲突

现有 `pc/forge.config.ts` 的 Fuses 配置为：

```ts
[FuseV1Options.OnlyLoadAppFromAsar]: true,
[FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
[FuseV1Options.RunAsNode]: false,
```

这套基线假设"应用代码只能来自签名过的 asar，外部代码一律不可信"，而第三方插件恰恰装在 asar 之外。

L1 沙箱插件不冲突：插件代码作为 Web 资源加载进沙箱渲染上下文，永不进入主应用上下文，也不以 Node 模块方式被 require。

**L2 特权插件确实触碰这条基线**——它需要在受控子进程中执行外部 JS。处理方式见 §7.3：L2 不放宽 Fuses，而是通过独立 `utilityProcess` 承载，宿主主进程自身的加载路径不变。

## 5. 目录结构

### 5.1 顶层

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
│   ├── core/                 # 领域模型与纯算法，不依赖 Electron
│   ├── ui/                   # 共享组件与设计 token
│   └── i18n/                 # 多语言资源、排序、转写
└── plugins/                  # 官方 L1 插件，基于 plugin-sdk 编写
    └── timestamp/
```

`plugins/` 与 `apps/desktop/` 平级：官方 L1 插件与第三方 L1 插件**同构**——同样基于 SDK、同样跑在沙箱、同样受权限约束。SDK 缺什么能力，我们做第一个官方插件时就会撞到，而不是等第三方提 issue。

选择 workspace 多包而非单包分层，理由是第三方插件作者需要 `npm install` SDK：SDK 必须能独立发版，宿主 API 版本也必须能独立于应用版本演进。

### 5.2 `packages/plugin-protocol`——契约层

零依赖，位于依赖图最底层。宿主与 SDK 共同依赖它，彼此不直接依赖。

```
src/
├── manifest.ts        # 插件 manifest 的 schema 与类型
├── commands.ts        # 指令声明：多 locale 关键词、匹配指令类型（§6）
├── localized.ts       # LocalizedString：多语言文本的表示
├── permissions.ts     # 权限枚举与授权文案 key
├── tier.ts            # L1 / L2 层级声明与各层可用能力集
├── messages/
│   ├── envelope.ts    # 请求/响应/事件信封，错误码
│   ├── host-to-plugin.ts
│   └── plugin-to-host.ts
└── version.ts         # 宿主 API 版本与兼容区间
```

**必须使用运行时 schema（如 zod），不能只写 TypeScript 类型。** manifest 与每条跨边界消息都是不可信输入，TS 类型在运行时不存在，不做真实校验等于没有校验。

**协议中三个决定必须在第一版定死，发布后无法回退**：

1. 所有面向用户的文本字段类型为 `LocalizedString` 而非 `string`
2. 指令关键词按 locale 分组，不是单一字符串数组（§9.1）
3. 每个插件显式声明所属层级（L1 / L2）

### 5.3 `packages/plugin-sdk`

```
src/
├── index.ts       # definePlugin() 等入口
├── client.ts      # 把消息往返封装成 Promise
├── commands.ts    # 静态指令与动态指令的注册
├── live-query.ts  # 动态结果推送（§6.3）
├── api/           # 按能力域拆：storage / notification / clipboard / fs / http
└── testing/       # 给插件作者的 mock 宿主
```

`testing/` 不可省略：第三方开发者必须能在不启动宿主的前提下对插件做单元测试，否则生态难以形成。课题 P1 的"开发者文档 demo"也以此为基础。

### 5.4 `packages/core`

```
src/
├── models/        # 实体与值对象
├── usecases/      # 纯业务逻辑
├── matching/      # 指令匹配与排序算法（§6.5）
└── errors/        # 领域错误类型
```

硬约束：不 import `electron`。保证逻辑可在 Node 环境用 vitest 直接运行。

指令匹配算法放这里而非主进程，一是纯函数便于大量单测，二是课题要求主要业务逻辑自研，匹配排序正属此列。

### 5.5 `packages/ui` 与 `packages/i18n`

`ui` 服务宿主外壳与特权内置工具。L1 插件运行在沙箱中，无法复用宿主的 React 组件实例，因此该包对插件的价值主要是**导出设计 token（CSS 变量）**——宿主把当前主题的变量注入插件沙箱，插件 UI 通过变量继承主题，插件作者不必各自实现深浅色与换肤。

`i18n` 承载宿主语言资源，以及全球化所需的三类能力：locale 感知的排序（`Intl.Collator`）、重音折叠、以及中日文的转写（拼音 / 罗马字）。详见 §9。插件自身的语言资源随插件包分发，不进这个包。

### 5.6 `apps/desktop`

```
apps/desktop/
├── forge.config.ts
├── index.html
├── vite.main.config.ts
├── vite.preload.config.ts
├── vite.renderer.config.ts
├── package.json
├── e2e/                            # Playwright for Electron
└── src/
    ├── main/
    │   ├── index.ts                # 只做装配，不写业务
    │   ├── bootstrap/              # 单实例锁、协议注册、崩溃上报、自动更新
    │   ├── shortcuts/              # 全局快捷键：布局感知默认值、冲突检测
    │   ├── windows/
    │   │   ├── launcher-window.ts  # 快捷键唤起的输入框窗口
    │   │   ├── floating-ball.ts    # 桌面悬浮球
    │   │   ├── main-window.ts      # 设置、插件管理等完整界面
    │   │   ├── plugin-view.ts      # L1 插件沙箱视图的创建与销毁
    │   │   └── window-state.ts     # 位置尺寸持久化
    │   ├── commands/               # 指令系统（§6）
    │   │   ├── registry.ts         # 全局索引：静态 + 动态指令
    │   │   ├── dynamic.ts          # 运行时增删指令的持久化
    │   │   ├── live-query.ts       # 动态结果推送通道
    │   │   ├── matcher.ts          # 接线，算法在 packages/core
    │   │   ├── usage.ts            # 使用频率与最近使用
    │   │   └── payload.ts          # 上下文采集与类型判定
    │   ├── ipc/
    │   │   ├── index.ts
    │   │   ├── router.ts           # 统一入参校验 + 错误包装
    │   │   └── handlers/
    │   ├── plugins/
    │   │   ├── registry.ts         # 已装插件清单
    │   │   ├── installer.ts        # 安装：市场下载 / 本地包，含校验
    │   │   ├── permissions.ts      # 授权状态与用户确认
    │   │   ├── bridge.ts           # protocol 的宿主侧实现，两层共用
    │   │   └── runtime/
    │   │       ├── sandbox.ts      # L1：沙箱渲染上下文
    │   │       ├── privileged.ts   # L2：utilityProcess + RPC
    │   │       └── policy.ts       # CSP、权限位、各层能力白名单
    │   ├── market/
    │   │   ├── client.ts           # 浏览、搜索、下载（locale 感知）
    │   │   └── updater.ts          # 版本检查与更新
    │   ├── features/               # 特权内置工具的主进程侧（§8）
    │   │   ├── index.ts            # 编译期固定白名单
    │   │   ├── screenshot/
    │   │   ├── clipboard-history/
    │   │   └── lan-share/
    │   ├── services/               # 宿主能力实现，被 ipc 与 bridge 共用
    │   ├── account/                # 账号与登录态，同步的前置
    │   ├── data/
    │   │   ├── db.ts
    │   │   ├── migrations/         # 带序号，只增不改
    │   │   └── repositories/
    │   ├── sync/                   # 同步引擎、冲突策略、离线队列（P0）
    │   └── logging/
    ├── preload/
    │   ├── host.ts                 # 宿主渲染层用
    │   └── plugin.ts               # L1 沙箱用，只暴露一个消息通道
    └── renderer/
        ├── main.tsx
        ├── app/                    # 路由、布局、Provider、错误边界
        ├── shell/
        │   ├── launcher/           # 输入框与结果列表，含 IME 组合态处理
        │   ├── settings/
        │   ├── plugin-manager/
        │   └── plugin-host/        # 插件视图容器
        ├── features/               # 特权内置工具的渲染层侧（§8）
        ├── lib/
        ├── stores/
        └── styles/                 # 全部使用 CSS 逻辑属性（§9.6）
```

#### 两个 preload 是 L1 安全模型的关键

- `host.ts`：给宿主渲染层，通过 `contextBridge` 暴露较宽的受控 API
- `plugin.ts`：给 L1 沙箱，**只暴露一个 postMessage 通道，此外什么都没有**。插件任何操作都须发消息给 `bridge.ts`，由其校验权限位后决定放行

#### `services/` 被多个入口共用是有意设计

同一份能力实现，`ipc/handlers`（宿主渲染层）与 `plugins/bridge`（L1、L2 插件）各自鉴权。"宿主能做而插件不能做"、"L2 能做而 L1 不能做"的差异集中在鉴权层，而非退化成多份重复实现。

## 6. 指令系统

launcher 的核心。用户敲入的每个字符都要在全局索引中检索，命中后直达功能。

### 6.1 指令的三个来源

统一进入同一索引，`registry.ts` 不区分出身：

1. 插件在 manifest 的 `commands` 中静态声明
2. 特权内置工具在 `main/features/index.ts` 中静态注册
3. 宿主自身动作（打开设置、切换主题、退出等）

### 6.2 动态指令

插件需要在运行时增删指令——典型场景是用户自定义的网页快捷方式，其数量与内容在开发期无法预知。

`main/commands/dynamic.ts` 负责：运行时注册与注销、**持久化**（重启后仍在索引中）、以及按插件 ID 归属（插件卸载时其动态指令一并回收）。

### 6.3 动态结果推送

插件可在用户输入时直接向结果列表推送条目，用户选中的是**结果本身**而非"进入插件"。例如输入一个单词，词典插件直接把释义作为结果行推出来。

这带来一条容易被忽略的架构要求：**插件在"未被打开"时就要能响应查询**。因此插件有两条独立的生命周期：

- **查询态**：轻量常驻，只响应 live-query，不创建 UI
- **展示态**：完整插件视图，用户真正进入后才创建

`main/commands/live-query.ts` 负责查询态的调度：并发上限、单次查询超时、慢插件降级。**任何单个插件的查询都不能拖慢整个 launcher**——超时即丢弃该插件本轮结果，不阻塞其他结果渲染。

### 6.4 匹配指令与 payload

除关键词外，指令可声明能接收的上下文类型：文本（含正则约束）、图片、文件、以及当前系统前台窗口。用户复制一张图后唤起 launcher，图片类插件自动进入候选。

`main/commands/payload.ts` 采集上下文并判定类型。安全约束：

- 采集**只在 launcher 唤起的瞬间**发生，不常驻监听
- payload 只投递给用户实际选中的那条指令所属的插件，**不广播**
- 前台窗口信息（应用名、标题）属敏感数据，需独立权限声明，且各平台实现不同

### 6.5 匹配算法

模糊匹配、转写匹配、使用频率衰减、最近使用加权，全部是纯函数，位于 `packages/core/matching`。`main/commands/matcher.ts` 只做接线。

国际化对匹配的要求见 §9.1 与 §9.4，它们是算法的一部分，不是事后加的过滤器。

## 7. 插件模型：L1 / L2 双层

### 7.1 为什么分层

纯沙箱在安全上优于 uTools 与 Raycast，但能力天花板过低——截图、文件批处理、本地服务类插件都无法实现，生态会被锁死在"计算器与格式转换"的范围内。

直接照搬 uTools/Raycast 的全 Node 模型则无法满足课题中 ⭐️⭐️⭐️⭐️⭐️ 的"防止应用数据被盗取、防止恶意插件攻击服务器"——那两家把这个问题交给了人工审查，而审查规模化后必然漏。

分层是这两难的解法：**按能力需求分流，让绝大多数插件走无需审查的安全路径，只有少数确实需要系统能力的插件承担审核成本。**

### 7.2 两层的边界

| | L1 沙箱插件 | L2 特权插件 |
| --- | --- | --- |
| 运行环境 | 沙箱渲染上下文，无 Node | 独立 `utilityProcess`，受控 Node |
| 能力 | 宿主白名单 API | 白名单 API + 受限文件系统 + 受控网络 |
| 发布 | 免审核，即时上架 | 强制开源 + 人工审核 + 签名 |
| 适用 | 计算、转换、纯 UI、调用宿主 API 即可完成的功能 | 需本地文件批处理、本地服务、系统级交互 |
| 默认 | 是——未显式声明层级的插件按 L1 处理 | 否 |

层级在 manifest 中显式声明，由 `protocol/tier.ts` 定义各层能力集。**能力集是白名单而非黑名单**：新增能力必须显式加入某层，遗漏时默认不可用，而不是默认可用。

### 7.3 L2 不放宽 Fuses 基线

L2 插件在独立 `utilityProcess` 中运行，通过 RPC 与主进程通信。宿主主进程自身的代码加载路径不变，§4.1 的 Fuses 配置原样保留。

L2 进程的约束：

- 独立进程，崩溃不影响宿主
- 内存与 CPU 上限，超限即终止
- 文件系统访问限于插件自身沙箱目录 + 用户显式授权的路径
- 网络访问仍须经宿主代理（§11），不允许直连

### 7.4 本地安装的插件一律按受限处理

课题同时要求"支持用户自行开发安装本地应用"和"防止恶意插件"，二者本身存在张力：本地安装天然绕过市场审核。

处理方式：本地安装的插件**无论声明何种层级，一律先按 L1 受限模式加载**，敏感权限不予授予。用户需在设置中针对该插件显式解除限制，且解除时明确提示风险。这样既不挡开发者的路，也不让"本地安装"成为绕过审核的通道。

## 8. 官方工具的两种形态

### 8.1 为什么有些工具不能做成插件

课题 P1 中三个工具即便在 L2 下也更适合内置：

| 工具 | 原因 |
| --- | --- |
| 截图 | 需全屏捕获、区域选择的全屏 overlay 窗口、贴图用的无边框置顶窗口。创建窗口的能力不开放给任何插件层级 |
| 局域网共享 | 需监听 TCP/UDP 端口、mDNS 服务发现。监听端口不开放给插件 |
| 剪贴板历史 | Electron 无剪贴板变化事件，只能主进程持续轮询，属常驻后台任务 |

### 8.2 边界与迁移路径

- **L1 插件**：能力不超出白名单 API 的工具，走 `plugins/`。时间戳转换属此类
- **特权内置工具**：主进程侧在 `main/features/`，渲染层侧在 `renderer/features/`

`renderer/features/` 只放特权内置工具的界面，不放任何应该走 SDK 的业务工具。判断标准是 §8.1 的能力边界，不是开发便利。

随着 L2 能力集完善，截图这类工具**可以迁移为官方 L2 插件**。届时只需把实现从 `main/features/` 移出、改用 L2 API，`main/features/index.ts` 移除对应条目，宿主其余部分不受影响。这是分层模型带来的额外收益。

### 8.3 白名单必须是编译期固定的

`main/features/index.ts` 是特权内置工具的**唯一注册入口，且只能在编译期确定**。不提供运行时注册接口，不扫描目录，不接受任何动态扩展。

理由直接：特权内置工具绕过了整套插件权限模型。一旦存在运行时注册路径，第三方插件迟早会伪装成特权工具，课题中 ⭐️⭐️⭐️⭐️⭐️ 的要求即整体失效。宁可每加一个内置工具都要发版。

## 9. 国际化

调研结论（§2.3）：Raycast 明确只支持美式英语，uTools 无 i18n 字段。**插件生态的国际化没有成熟参照物**，以下每条都需自行设计。

### 9.1 搜索关键词不是"翻译"——协议层的决定

中文用户输入「时间戳」、英文用户输入 `timestamp`、日文用户输入「タイムスタンプ」，必须命中同一个插件。

这不是把一个字符串翻译成多语言，而是**每个 locale 拥有一组独立关键词**，数量可以不同：中文额外需要拼音全拼 `shijianchuo` 与首字母 `sjc`，日文需要罗马字 `taimusutanpu`。

因此指令关键词的类型是按 locale 分组的结构，而非 `string[]`：

```
commands: [{
  id: 'timestamp.convert',
  title: LocalizedString,          // 显示名
  keywords: {                       // 检索用，与显示名解耦
    'zh-CN': ['时间戳', '时间戳转换'],
    'en': ['timestamp', 'unix time', 'epoch'],
    'ja': ['タイムスタンプ'],
  },
}]
```

关键词与显示名解耦是有意的：显示名要自然，关键词要覆盖用户可能输入的各种叫法，二者需求不同。

**这条与 `LocalizedString` 一样，必须在协议第一版定死。** 发布后再改会破坏所有已发布插件的 manifest。

### 9.2 输入法组合态

中日韩用户经输入法输入。若搜索框在 composition 未结束时即触发匹配，用户输入 `shijian` 的过程中会拿拼音串去匹配，结果列表剧烈跳动。

`renderer/shell/launcher/` 必须显式处理 `compositionstart` / `compositionupdate` / `compositionend`：组合期间不触发检索，组合结束后以最终文本检索一次。

这一条 Raycast 遇不到（只支持英语），uTools 天然处理（纯中文产品），而面向全球的产品两边都要对。

### 9.3 快捷键需按平台与键盘布局给默认值

- macOS 的 `Cmd+Space` 被 Spotlight 占用，不可作默认
- AZERTY（法）、JIS（日）、德语等布局的物理键位不同，部分组合无法按出
- 需要布局感知的默认值选择，以及注册失败时的冲突提示与备选

`main/shortcuts/` 承担这部分逻辑，不能简单硬编码一组快捷键。

### 9.4 排序、折叠与转写

- 结果排序使用 `Intl.Collator` 而非字符串比较——德语 ä、瑞典语 å、土耳其语 i/İ 的规则各不相同
- 匹配需重音不敏感：输入 `cafe` 应命中 `café`
- 中文需拼音转写、日文需罗马字转写，作为关键词索引的一部分预计算，不在查询时实时转换

以上均位于 `packages/i18n` 与 `packages/core/matching`，是匹配算法的组成部分而非事后过滤。

### 9.5 字体与安装包体积

CJK 与拉丁文字的 fallback 链不同，阿拉伯语、泰语存在字形整形与行高问题。

"打包字体还是依赖系统字体"直接决定安装包体积——一套 CJK 字体即数十 MB。本设计的立场：**默认依赖系统字体，只在缺字回退明显破坏排版时才按需下载补充字体**，不将字体打进主安装包。

### 9.6 为 RTL 预留

首版覆盖 LTR 语言，但**样式层从第一天起全部使用 CSS 逻辑属性**：`margin-inline-start` 而非 `margin-left`，`padding-block` 而非 `padding-top`，`text-align: start` 而非 `left`。

现在这么写几乎零成本，事后补则等于重写整个样式层。`renderer/styles/` 与 `packages/ui` 均受此约束，应通过 lint 规则强制（禁用物理方向属性）。

### 9.7 合规

面向全球意味着 GDPR 适用于欧盟用户。数据同步（§10）需考虑数据存储地与删除权，这影响账号体系与同步服务端设计，不是纯前端问题。该问题的完整方案属于 `backend/` 范围，但 pc 侧的账号与同步接口需预留"账号注销 / 数据导出 / 数据删除"三个入口。

### 9.8 市场审核的语言瓶颈

插件市场需要审核（L2 强制），但审核员无法覆盖所有语言。

处理方式：manifest 的元数据**强制要求英文作为 fallback locale**，其他语言为可选覆盖。审核基于英文版本进行，其他语言的翻译质量由开发者负责。缺失 fallback 的插件不予上架。

## 10. 数据层与同步

local-first，SQLite 作为本地库，读写只发生在主进程，渲染层通过 IPC 访问。

- `data/migrations/` 按序号命名，**只增不改**——已发布的迁移脚本任何情况下不得修改，否则老用户的库无法升级
- `data/repositories/` 隔离 SQL 与业务逻辑，`packages/core` 的用例只依赖 repository 接口，不感知 SQLite
- 插件数据按插件 ID 隔离存储，卸载时可整体回收。隔离由 `plugins/bridge` 在存储 API 入口强制注入插件 ID 实现，插件无法构造出访问他人命名空间的参数

### 10.1 同步是 P0

课题中数据同步是 P0（用户设置 + 插件设置跨设备），P1 的剪贴板历史还要求内容同步。

同步的实现前提有三样，都不在 `pc/` 内部：账号体系、服务端存储、冲突解决约定。因此：

- `main/account/` 与 `main/sync/` 的**接口形状必须在写业务代码之前定下来**，包括同步单元粒度、版本向量或时间戳表示、冲突取舍规则
- 数据表从第一天就带上同步元字段（更新时间、设备 ID、软删除标记）。事后补要写迁移，且历史数据无法回填出正确的同步状态
- 局域网共享（P1）与跨设备同步（P0）是两条独立通路：前者点对点直传，后者经服务端中转，不要试图用一套机制覆盖

## 11. 安全边界

课题把"数据安全，防止应用数据被盗取，防止恶意插件攻击服务器"标为 ⭐️⭐️⭐️⭐️⭐️。双层插件模型（§7）是主体方案，另需四条补充约束：

1. **插件网络请求必须经宿主代理**。L1 与 L2 均不允许直连。宿主在 `services/http` 统一出口，实施域名白名单（manifest 声明 + 用户授权）、速率限制、请求体大小上限。没有这一条，任何插件都能把用户机器变成攻击源——这正是"攻击服务器"的直接对策
2. **插件间数据不可见**。存储、剪贴板、文件访问在 `bridge` 入口按插件 ID 强制隔离
3. **payload 定向投递**。上下文只给用户选中的那条指令，不广播（§6.4）
4. **L2 进程资源上限**。内存与 CPU 超限即终止，防止插件以资源耗尽方式影响宿主

## 12. 依赖方向规则

```
              plugin-protocol          ← 零依赖，依赖图底层
                     ↑
        ┌────────────┴────────────┐
   plugin-sdk                apps/desktop
        ↑                         ↑
   ┌────┴─────┐         core / ui / i18n
plugins/*   第三方插件
（官方 L1）
```

1. `core` 不 import `electron`
2. `packages/*` 与 `plugins/*` 均不依赖 `apps/*`（反向依赖即为错误）
3. 渲染层不直接 import 主进程代码，只通过 preload 暴露的类型
4. `plugins/*` 之间不横向 import，需共享则下沉到 `packages/ui` 或 `packages/core`。官方插件之间互相 import 会让它们脱离"与第三方同构"这一前提，失去验证 SDK 的价值
5. `main/features/*`（特权内置工具）之间不横向 import，且不得被 `main/plugins/*` 引用——插件运行时不应知道特权工具的存在
6. `renderer/styles` 与 `packages/ui` 禁用 CSS 物理方向属性（§9.6）

**这六条必须落成 CI 检查**：前五条用 eslint `import/no-restricted-paths` 或 dependency-cruiser，第六条用 stylelint。纯口头约定在多人长期项目中必然被打破，而边界一旦破坏，事后拆解成本远高于事前拦截。这是本设计中唯一真正决定可维护性的机制，其余部分只是良好的组织形式。

## 13. 错误处理

三道边界，各自不允许错误穿透：

1. **IPC 边界**：`ipc/router.ts` 统一将校验失败、未授权、内部异常映射为协议错误码，原始异常与堆栈不穿透到渲染层
2. **插件边界**：`plugins/bridge.ts` 捕获插件侧异常与协议违规，降级为"禁用该插件 + 通知用户"。L2 额外处理进程崩溃与超限终止
3. **渲染层边界**：error boundary 按工具粒度切分，单个工具崩溃不影响外壳与其他工具

launcher 需额外一条：**指令检索路径上的任何异常都不能让唤起失败**。索引损坏时降级为只显示宿主自身指令；单个插件的 live-query 超时即丢弃其本轮结果。用户按了快捷键没反应，是这类产品最严重的体验故障。

## 14. 测试布局

| 位置 | 类型 | 说明 |
| --- | --- | --- |
| `packages/core` | vitest 单测 | 主战场。`matching/` 需覆盖多语言输入、转写、重音折叠等边界 |
| `packages/i18n` | vitest 单测 | 排序规则、转写正确性 |
| `packages/plugin-protocol` | vitest 单测 | schema 正反例，覆盖恶意与畸形输入 |
| `packages/plugin-sdk` | vitest 单测 | 借助自身 `testing/` mock 宿主 |
| `apps/desktop/src/main` | 单测为主 | `commands/`、`plugins/runtime/`、`sync/` 重点覆盖 |
| `plugins/*` | vitest 单测 | 用 SDK 的 mock 宿主，与第三方插件测试方式一致 |
| `apps/desktop/e2e` | Playwright for Electron | 快捷键唤起 → 检索 → 进入插件的主链路；插件安装流程；IME 输入路径 |

## 15. 迁移路径

1. 在 `pc/` 建立 workspace 根配置（`package.json` workspaces、`tsconfig.base.json`、`eslint.config.mjs`、stylelint）
2. 将现有 `src/`、`forge.config.ts`、`index.html`、三个 vite 配置整体移入 `apps/desktop/`
3. 用 flat config 取代现有 `.eslintrc.json`
4. **立即验证打包链路**：跑通一次完整 `npm run make`（见 §16.1）
5. 建立 `packages/plugin-protocol` 与 `packages/core` 骨架，**先把 §5.2 的三个不可回退决定确定下来**，跑通依赖方向的 CI 检查
6. 引入 React 与渲染层外壳骨架，样式层从第一行起用逻辑属性
7. 打通最小 launcher 链路：全局快捷键 → 唤起窗口 → 检索宿主自身指令 → 执行，含 IME 组合态处理
8. 实现 L1 运行时与 `packages/plugin-sdk`
9. 用 SDK 写时间戳转换插件放入 `plugins/`，反向验证 SDK 与指令贡献机制
10. 实现动态指令与动态结果推送
11. 落地数据层与同步接口形状（含同步元字段）
12. 实现 L2 运行时与特权内置工具

顺序上有三处是刻意的：

- 依赖方向的 CI 检查放在业务代码之前，规则晚于代码引入等于默认接受一批既成违规
- 打包验证提到第 4 步，理由见 §16.1
- 第 7 步先打通"只有宿主指令"的最小 launcher，是为了在引入插件复杂度之前验证唤起链路本身。全局快捷键、窗口显隐、焦点管理、多显示器定位、IME 组合态，坑比看起来多，不适合和插件系统一起调试

## 16. 开放问题

### 16.1 Forge 在 workspace 下的打包验证

local-first 方案大概率引入 better-sqlite3 等原生模块。Electron Forge 在 workspace 结构下对依赖提升与原生模块重建存在已知摩擦，`packagerConfig` 需显式处理。

**本设计未在实际环境中验证过这一点。** 迁移路径第 2 步完成后应立即跑完整 `npm run make`，不要等业务代码堆积后才发现。

### 16.2 L2 审核流程的规模化

L2 强制开源 + 人工审核，这套流程本身需要人力投入。Raycast 承诺"一周内首次响应"，而这是有专职团队的前提下。

需要确定：审核由谁做、SLA 是什么、社区审核如何引入、以及自动化检查能覆盖到什么程度（依赖白名单、危险 API 静态扫描、构建产物比对）。该问题不影响目录结构，但影响 L2 能否真正开放，需在市场上线前定。

### 16.3 后端已在 P0 关键路径上

本设计范围是 `pc/`，但课题 P0 中有两项无法在 pc 内部闭环：

- **应用市场**：上传、审核、分发、更新均需服务端
- **数据同步**：需账号体系与服务端存储

叠加 §9.7 的合规要求（数据存储地、删除权），后端的设计复杂度不低于 pc。pc 侧能做的是先定 `main/market/` 与 `main/sync/` 的接口形状，但**接口形状的确定本身就需与后端设计对齐**，不能单方面拍板。

建议在 pc 进入迁移路径第 11 步之前，单独为 `backend/` 走一次设计流程。
