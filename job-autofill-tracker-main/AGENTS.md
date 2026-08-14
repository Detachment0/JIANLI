# AGENTS.md — AI 仓库入口

> 这是 AI 进入仓库后的第一份文件。保持简短，详细架构见 `architecture/` 目录。

## Repository Map

| 目录/文件 | 职责 |
|-----------|------|
| `entrypoints/background.ts` | Service Worker — 消息中枢、AI 调用、数据持久化、定时任务 |
| `entrypoints/content/` | 内容脚本 — 页面 DOM 交互、自动填充引擎、侧面板 UI（Widget） |
| `entrypoints/popup/` | 浏览器弹出窗口 — 快捷操作入口 |
| `entrypoints/options/` | 仪表盘页面 — 全功能管理界面（个人资料、跟踪、答案库、设置） |
| `lib/schema.ts` | **核心类型定义** — 所有数据结构、消息协议、常量 |
| `lib/storage.ts` | chrome.storage.local 封装 — Profile/Settings/Pending 等 |
| `lib/db.ts` | Dexie (IndexedDB) — Application 和 AnswerMemory 持久化 |
| `lib/ai.ts` | OpenAI API 集成 — 简历导入、答案草拟、职位匹配、资料富化 |
| `lib/mapping.ts` | 字段映射 — 同义词匹配、记忆答案检索 |
| `lib/fillers.ts` | DOM 填充 — 原生值设置、事件分发、验证 |
| `lib/affinity.ts` | 技能匹配评分 — 词库匹配 + 别名归一化 |
| `lib/engine.ts`（在 content/ 下） | 页面解析引擎 — 字段提取、上下文识别、提交监听 |
| `lib/upwork.ts` | Upwork 提案状态机与统计 |
| `lib/jobs.ts` | 职位 URL 规范化、跟进到期判断 |
| `lib/synonyms.ts` | CanonicalField → 同义词列表（字段映射的 Source of Truth） |
| `lib/compensation.ts` | 薪酬币种推断 |
| `lib/profileValues.ts` | 电话号码格式化 |
| `lib/demo.ts` | 演示模式数据 |
| `lib/theme.ts` | 主题切换 |
| `wxt.config.ts` | WXT 构建配置 + Chrome Manifest |
| `变动文件夹/` | 变更日志 — 每次开发操作需在此注册 |

## Architecture Entry Point

| 需要知道什么 | 去哪里看 |
|--------------|----------|
| 系统整体架构 | [architecture/system-context.md](architecture/system-context.md) |
| 运行单元与边界 | [architecture/containers.md](architecture/containers.md) |
| 核心业务链路 | [architecture/flows/](architecture/flows/) |
| 消息协议与数据契约 | [architecture/contracts/](architecture/contracts/) |
| 架构决策记录 | [architecture/adr/](architecture/adr/) |
| 运行与验证命令 | [architecture/operations/](architecture/operations/) |
| 术语表 | [architecture/glossary.md](architecture/glossary.md) |

## Development Commands

以下命令已实际验证通过：

```bash
# 安装依赖
npm install

# TypeScript 类型检查
npm run compile

# 开发模式（热重载 + 自动打开浏览器）
npm run dev

# 生产构建
npm run build

# 打包为 .zip
npm run zip
```

**注意**：项目没有独立的 lint、test 命令。`npm run compile`（`tsc --noEmit`）是唯一的静态验证手段。

**加载扩展**：开发模式输出到 `.output/chrome-mv3-dev/`，生产构建输出到 `.output/chrome-mv3/`。在 Edge/Chrome 的 `edge://extensions` 或 `chrome://extensions` 中加载已解压的扩展。

## Global Invariants

以下约束影响大量代码修改，**修改前必须理解**：

1. **三层填充优先级**：`profile`（确定性匹配）→ `memory`（记忆答案模糊匹配）→ AI（最后手段）。见 `lib/mapping.ts` 和 `entrypoints/background.ts` 的 `MAP_FIELDS` 处理。

2. **AI 调用有两条路径**：Content Script 和 Popup 通过 `chrome.runtime.sendMessage` 路由到 Background 调用 `lib/ai.ts`；Options 仪表盘直接 `import` 并调用 `lib/ai.ts`（如 `importProfileFromCv`、`draftApplicationFromJobPosting`）。两种路径共享相同的 `createOpenAiJson()` 底层封装。API Key 存储在 `chrome.storage.local` 中。

3. **Demo Mode 是全局短路**：当 `settings.demoMode === true` 时，所有写操作（saveProfile、db.applications.add 等）被跳过，`getProfile()` 返回 `DEMO_PROFILE`。修改任何写操作时必须检查 demoMode。

4. **`applicationsRev` 是跨上下文同步信号**：Dexie 的变更事件无法到达 content script，因此每次 Application 表变更后必须调用 `bumpApplicationsRev()`，Widget 和 Options 通过 `chrome.storage.onChanged` 监听此计数器刷新。

5. **Content Script 在 Shadow DOM 中渲染**：Widget UI 通过 `createShadowRootUi` 挂载在 Shadow DOM 中，CSS 隔离。样式文件为 `entrypoints/content/widget.css`。

6. **`lib/schema.ts` 是数据模型的唯一 Source of Truth**：所有类型定义、常量（`APPLICATION_STATUSES`、`EMPTY_PROFILE`、`DEFAULT_SETTINGS`）都在此文件。修改数据结构必须从这里开始。

7. **法律确认字段永远不自动填充**：`isLegalConfirmation()` 检测到的条款确认字段只标记为 `confirmation` 状态，要求用户手动操作。

8. **`@wxt-dev/module-react` 已内置 React 支持**：不要在 `wxt.config.ts` 的 `vite.plugins` 中重复添加 `@vitejs/plugin-react`，否则会导致 esbuild 变量重复声明崩溃。

## Change Protocol

### 修改代码前

1. 阅读本文件（AGENTS.md）
2. 根据任务确定需要阅读哪些架构文档：
   - 修改填充逻辑 → [flows/autofill.md](architecture/flows/autofill.md) + [contracts/message-protocol.md](architecture/contracts/message-protocol.md)
   - 修改数据结构 → [contracts/data-model.md](architecture/contracts/data-model.md) + `lib/schema.ts`
   - 修改 AI 集成 → [flows/ai-integration.md](architecture/flows/ai-integration.md) + `lib/ai.ts`
   - 修改 UI 交互 → 相关 `entrypoints/` 文件
   - 修改构建配置 → `wxt.config.ts` + [operations/dev-setup.md](architecture/operations/dev-setup.md)
3. 验证文档与代码当前是否一致

### 修改代码后

1. 运行 `npm run compile` 验证类型安全
2. 运行 `npm run dev` 或 `npm run build` 验证构建
3. 如果修改影响了以下任一项，**必须**同步更新对应文档：
   - 架构边界 → `architecture/containers.md`
   - 模块职责 → `architecture/components/` 或 AGENTS.md Repository Map
   - 业务链路 → `architecture/flows/`
   - 消息协议 → `architecture/contracts/message-protocol.md`
   - 数据结构 → `architecture/contracts/data-model.md` + `lib/schema.ts`
   - 全局约束 → AGENTS.md Global Invariants
   - 运行方式 → `architecture/operations/`
4. 在 `变动文件夹/` 中创建变更记录，格式见已有文件
5. 如果判断无需更新文档，在变更记录中说明原因
