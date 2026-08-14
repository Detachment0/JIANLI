# Content Script 内部组件

> 状态：**AS-IS**（反映当前代码实际行为，基于 `entrypoints/content/` 目录下 `index.tsx`、`engine.ts`、`Widget.tsx`、`TrackerTab.tsx`、`ProfileTab.tsx`、`ErrorBoundary.tsx`、`cardBadges.ts` 的实际实现）
>
> 这是 C4 模型的第 3 层（Component），聚焦 Content Script 容器内部的组件关系。容器层面的描述见 [containers.md](../containers.md)。

## 1. 概述

Content Script 容器（入口 `entrypoints/content/index.tsx`）在浏览器页面中承担两类职责：

1. **页面交互引擎**（无 UI）：字段提取、表单填充、提交监听——在所有 frame 中运行（`allFrames: true`），但被 `isTopPageWithEmbeddedJobForm()` 排除"仅托管 ATS iframe 的顶层页面"。
2. **侧面板 UI**（Widget，Shadow DOM）：仅在顶层 frame（`window.self === window.top`）挂载一次，提供匹配/自动填表/答案/Upwork/跟踪器/资料 6 个 Tab。

此外，`cardBadges.ts` 在 LinkedIn / Indeed 搜索页面向**宿主页面 DOM**（非 Shadow DOM）注入匹配分数徽章。

## 2. Component Diagram

```mermaid
C4Component
    title Content Script — Component Diagram

    Container_Boundary(cs, "Content Script (entrypoints/content/)")

    Component(index, "index.tsx", "WXT defineContentScript", "入口：注入门控、消息监听、Shadow DOM 挂载、徽章初始化")
    Component(engine, "engine.ts", "TypeScript", "页面解析引擎：字段提取、两遍填充、提交监听、上下文识别、附件上传")
    Component(widget, "Widget.tsx", "React 19", "侧面板主组件：Tab 管理、跟踪表单、提交确认弹窗、FAB")
    Component(tracker, "TrackerTab.tsx", "React 19", "跟踪器 Tab：申请列表视图、手动/AI 添加、状态编辑")
    Component(profile, "ProfileTab.tsx", "React 19", "资料 Tab：精简编辑、AI 智能添加、自动保存")
    Component(errorB, "ErrorBoundary.tsx", "React Class Component", "错误边界：捕获渲染错误防止整体卸载")
    Component(badges, "cardBadges.ts", "TypeScript", "LinkedIn/Indeed 搜索卡片技能匹配徽章注入")

    Container_Boundary(lib, "lib/ (共享库)")
    Component(fillers, "fillers.ts", "TypeScript", "DOM 填充：原生值设置、事件分发、验证")
    Component(affinity, "affinity.ts", "TypeScript", "技能匹配评分：词库匹配 + 别名归一化")
    Component(storage, "storage.ts", "TypeScript", "chrome.storage.local 封装")
    Component(schema, "schema.ts", "TypeScript", "类型与常量定义")

    Rel(index, engine, "调用 isAllowedJobPage / fillCurrentForm / watchSubmit / queueTrackCurrentApplication")
    Rel(index, widget, "在 Shadow DOM 中 render")
    Rel(index, errorB, "包裹 Widget")
    Rel(index, badges, "initCardBadges(profile)")
    Rel(index, storage, "getProfile / getSettings")
    Rel(index, schema, "ExtensionMessage 类型")

    Rel(widget, engine, "buildCurrentApplication / extractJobDescription / getPageContext / extractUpworkProposalDetails / hasJobDescriptionSurface")
    Rel(widget, tracker, "渲染 TrackerTab")
    Rel(widget, profile, "渲染 ProfileTab")
    Rel(widget, affinity, "scoreAffinity(profile, jobDescription)")
    Rel(widget, storage, "getProfile / getSettings / getDueCount / saveProfile")
    Rel(widget, schema, "Application / ExtensionMessage / Profile 等")

    Rel(engine, fillers, "applyFill(target, fill)")
    Rel(engine, storage, "getProfile")
    Rel(engine, schema, "FieldDescriptor / FieldFill / Application / PageContext")

    Rel(tracker, schema, "APPLICATION_STATUSES / Application")
    Rel(profile, storage, "getProfile / saveProfile")
    Rel(profile, schema, "Profile / ExtensionMessage")

    Rel(badges, affinity, "scoreAffinity(profile, cardText)")
    Rel(badges, schema, "Profile")

    UpdateRelStyle(index, engine, $offsetX="0", $offsetY="-15")
    UpdateRelStyle(index, widget, $offsetX="0", $offsetY="15")
    UpdateRelStyle(widget, engine, $offsetX="-20", $offsetY="0")
```

## 3. 组件详细说明

### 3.1 `index.tsx` — 入口与装配

- **路径**：`entrypoints/content/index.tsx`
- **类型**：WXT `defineContentScript`
- **注入配置**：`matches: ["https://*/*", "http://*/*"]`、`allFrames: true`、`runAt: "document_idle"`、`cssInjectionMode: "ui"`
- **职责**：
  1. 调用 `isAllowedJobPage()` 判断是否在求职页面。
  2. 在求职页面（且非"仅托管 ATS iframe 的顶层页面"）注册 `chrome.runtime.onMessage` 监听器，处理 `AUTOFILL_CURRENT_FORM` 与 `TRACK_CURRENT_APPLICATION`，并调用 `watchSubmit()` 启用提交监听。
  3. 仅在顶层 frame（`window.self !== window.top` 时 return）通过 `createShadowRootUi` 挂载一次 Widget（`name: "jobtracker-widget"`，`position: "overlay"`，`anchor: "body"`），用 `ErrorBoundary` 包裹。
  4. 若 `allowedJobPage && settings.cardBadges`，调用 `initCardBadges(profile)` 注入卡片徽章。
- **关键决策**：FAB 的显隐由 `showFab={allowedJobPage}` 控制——非求职页面 FAB 隐藏，但 Widget 仍可被 Popup 唤起。

### 3.2 `engine.ts` — 页面解析引擎

- **路径**：`entrypoints/content/engine.ts`
- **类型**：纯 TypeScript 模块（无 React）
- **模块级状态**：
  - `fieldRefs: Map<string, FillTarget>`——字段 ID 到 DOM 元素的引用（每次 `extractFields` 清空重建）
  - `loggedSubmissionKeys: Set<string>`——已记录的提交键，防止重复触发
- **导出函数**：

| 函数 | 职责 |
|------|------|
| `isAllowedJobPage()` | 判断是否在已知求职网站（Greenhouse/Lever/Ashby/iCIMS/Comeet/Upwork/LinkedIn/Indeed）或检测到申请表面征（`hasApplicationSurface`）；排除 `hcaptcha.com` |
| `isTopPageWithEmbeddedJobForm()` | 判断顶层页面是否仅托管 ATS iframe（此时引擎在 iframe 内运行，顶层只挂 UI） |
| `fillCurrentForm()` | **两遍填充策略**：①`extractFields()` + `fillPass` ②`wait(200ms)` 后再次 `extractFields`，对新出现的动态字段执行第二遍 `fillPass`；最后扫描未覆盖字段标记 `confirmation`/`filled`；调用 `attachStoredResume` / `attachStoredCoverLetter` 上传附件；返回 `{ ok, filled, resumeOpened, review }` |
| `watchSubmit()` | 注册 capture 阶段的 `click` 与 `submit` 监听；`isFinalSubmitControl()` 识别"最终提交"按钮（排除 Next/Continue/Review/Easy Apply），`formMatchesApplication()` 校验表单特征，命中后调用 `requestTrackCurrentApplication()` |
| `buildCurrentApplication(status)` | 从 `getPageContext()` + `extractJobDescription()` + `extractFields()` + `extractJobLocation()` + `detectWorkMode()` + Upwork 详情构建 `Application` 对象 |
| `queueTrackCurrentApplication()` | 调用 `buildCurrentApplication("Applied")`，生成去重 key，若未记录过则发送 `APPLICATION_SUBMITTED` 消息到 Background；返回 `PendingApplication` |
| `getPageContext()` | 提取页面上下文（url/title/source/company/role）；优先调用 vendor-specific 逻辑（`getVendorPageContext`），否则走通用 `guessCompany`/`guessRole` |
| `extractJobDescription()` | 用 `JOB_DESCRIPTION_SELECTORS` 在 `jobDetailRoot()` 范围内提取职位描述，截断至 12000 字符；LinkedIn 搜索页特殊处理右栏详情容器 |
| `hasJobDescriptionSurface()` | 判断页面是否有可识别的职位描述容器（innerText > 300） |
| `extractUpworkProposalDetails()` | 从 Upwork 页面文本与字段提取提案详情（合同类型、出价、Connects、boost） |

- **vendor-specific 上下文识别**：`getUpworkPageContext`、`getComeetPageContext`、`getLinkedInPageContext`、`getIndeedPageContext`——各站点使用专属 CSS 选择器提取公司/职位。
- **附件上传**：`attachStoredResume` / `attachStoredCoverLetter`——从 Profile 读取 dataUrl 还原 `File`，通过 `DataTransfer` 设置 `input.files` 并分发 `input`/`change` 事件；支持触发按钮点击后轮询查找文件输入（`openUploadAndFindInput`，最多 20 次 × 50ms）。
- **依赖**：`lib/fillers.ts`（`applyFill`、`FillTarget`）、`lib/jobs.ts`（`canonicalJobUrl`）、`lib/profileValues.ts`（电话格式化）、`lib/storage.ts`（`getProfile`）、`lib/schema.ts`

### 3.3 `Widget.tsx` — 侧面板主组件

- **路径**：`entrypoints/content/Widget.tsx`
- **类型**：React 19 函数组件（默认导出）
- **Props**：`{ showFab?: boolean }`（默认 `true`）
- **状态管理**：useState 管理开/关、profile、settings、url、page、job（匹配状态机）、tracked、trackNotice、saving、trackFormOpen、trackEntryMode、postingText、trackDraft、readingPosting、pendingConfirm、activeTab、dueCount
- **Tab 体系**（`TabId = "match" | "autofill" | "answer" | "upwork" | "tracker" | "profile"`）：
  - Tab 列表动态生成：职位详情页才显示 `match`；Upwork 域名才显示 `upwork`；`autofill`/`answer`/`tracker`/`profile` 始终存在。
  - 进入职位详情页默认激活 `match`，否则 `autofill`。
- **核心子组件**（同文件内定义）：
  - **`MatchTab`**——展示本地 `scoreAffinity` 结果（匹配/缺失技能 chip），缺失技能可点击添加到 Profile；"深度分析（AI）"按钮发送 `AI_JOB_FIT` 获取 `JobFitAnalysis`（分数/优势/差距/推荐角度）。
  - **`AutofillTab`**——发送 `AUTOFILL_TAB` 触发填充，展示填充数与待检查项列表（`confirmation`/`missing`/`unsupported`）。
  - **`AnswerTab`**——粘贴问题→发送 `AI_DRAFT_ANSWER` 草拟→可复制/保存到记忆（`REMEMBER_ANSWER`）。
  - **`UpworkTab`**——展示 `extractUpworkProposalDetails()` 结果，可编辑后 `LOG_APPLICATION` 跟踪；已跟踪时提供状态切换（`UPDATE_APPLICATION`）。
  - **`TrackConfirm`**——提交检测弹窗：手动表单或 AI 粘贴两种模式，保存后 `REMOVE_PENDING_APPLICATION`。
  - **`TrackDraftForm`** / `TrackingModeSwitch` / `NumberField`——辅助表单组件。
- **关键副作用**：
  - 初始化加载 profile/settings/dueCount，监听 `chrome.storage.onChanged`（profile/settings/dueCount）。
  - **URL 轮询**（SPA 导航）：`setInterval` 每 1000ms 检查 `location.href` 变化（LinkedIn/Indeed/Upwork 是 SPA，不触发 reload）。
  - 监听 `chrome.runtime.onMessage` 处理 `SHOW_TRACK_CONFIRM`（打开弹窗）与 `TOGGLE_WIDGET`（切换开关）。
  - 职位详情页：轮询 `hasJobDescriptionSurface()`（500ms 间隔，超时 10s）后计算 `scoreAffinity`。
  - 查询当前 URL 是否已跟踪（`GET_TRACKED_JOB`）。
  - Esc 键关闭面板。
- **FAB**：关闭时显示悬浮按钮，根据匹配分数着色（≥70 高、≥40 中、<40 低）；`dueCount > 0` 时显示红点。
- **依赖**：`lib/affinity.ts`、`lib/ai.ts`（仅类型 `JobFitAnalysis`/`JobPostingDraft`）、`lib/jobs.ts`、`lib/storage.ts`、`lib/upwork.ts`、`lib/schema.ts`、`./engine`、`./ProfileTab`、`./TrackerTab`

### 3.4 `TrackerTab.tsx` — 跟踪器标签页

- **路径**：`entrypoints/content/TrackerTab.tsx`
- **类型**：React 19 函数组件（默认导出）
- **Props**：`{ demoMode, onOpenDashboard }`
- **职责**：申请列表视图（区别于 Options 的看板视图）：
  - 统计行（今天/昨天/本周申请数）+ 跟进待办横幅（可筛选仅显示到期）。
  - 手动添加表单（公司/职位/链接/来源/状态/薪酬结构化字段）。
  - AI 粘贴创建（`AI_DRAFT_APPLICATION` + `LOG_APPLICATION`）。
  - 搜索 + 状态筛选。
  - `TrackedJob` 子组件：展开查看详情（来源/日期/地点/工作模式/薪酬/职位描述/申请答案/跟进日期/Upwork 详情/备注），状态切换、复制到剪贴板、跳转仪表盘、删除（二次确认）。
- **数据加载**：`LIST_APPLICATIONS` 消息；监听 `chrome.storage.onChanged` 的 `applicationsRev` 刷新。
- **依赖**：`lib/ai.ts`（仅类型）、`lib/compensation.ts`、`lib/jobs.ts`、`lib/upwork.ts`、`lib/schema.ts`

### 3.5 `ProfileTab.tsx` — 个人资料标签页

- **路径**：`entrypoints/content/ProfileTab.tsx`
- **类型**：React 19 函数组件（默认导出）
- **Props**：`{ demoMode, onOpenDashboard }`
- **职责**：精简的个人资料编辑（对比 Options 的全功能编辑）：
  - **自动保存**：550ms 防抖后 `saveProfile`（用 `profileSaveReady` ref 跳过首次挂载，避免覆盖）。
  - **AI 智能添加**：粘贴文本→`AI_ENRICH_PROFILE`→用返回的 Profile 替换本地状态。
  - 折叠分区：补充答案知识 / 身份与联系方式 / 授权与申请默认设置 / 可选人口统计信息。
  - 技能/经验/项目计数展示，跳转仪表盘编辑。
- **设计要点**：自持 Profile 副本（仅挂载时 seed 一次），避免 storage 同步打断输入。
- **依赖**：`lib/storage.ts`、`lib/schema.ts`

### 3.6 `ErrorBoundary.tsx` — 错误边界

- **路径**：`entrypoints/content/ErrorBoundary.tsx`
- **类型**：React Class Component（默认导出）
- **职责**：捕获子树渲染错误，展示 `JobTracker 组件崩溃：{message}`，防止整个 overlay（FAB + 抽屉）静默卸载。
- **实现**：`getDerivedStateFromError` 提取错误消息到 state。

### 3.7 `cardBadges.ts` — 卡片技能匹配徽章

- **路径**：`entrypoints/content/cardBadges.ts`
- **类型**：纯 TypeScript 模块
- **导出**：`initCardBadges(profile: Profile): void`
- **职责**：在 LinkedIn / Indeed 搜索页面的职位卡片上注入匹配分数徽章（Simplify 风格）。
- **关键实现**：
  - **注入到宿主页面 DOM**（非 Shadow DOM），通过单个带前缀的 `<style>` 标签（`STYLE_ID = "jt-card-badge-style"`）避免样式冲突。
  - **卡片选择器**（`CARD_SELECTORS`）：
    - LinkedIn：`li[data-occludable-job-id]:not([data-jt-scored])`
    - Indeed：`#mosaic-provider-jobcards [data-jk]:not([data-jt-scored]), li [data-jk]:not([data-jt-scored])`
  - **去重**：每张卡片标记 `data-jt-scored="1"` 避免重复评分。
  - **评分**：`scoreAffinity(profile, card.innerText.slice(0, 1000))`；`jobTermCount === 0`（无识别技能）时不显示徽章。
  - **着色**：`badgeTier`——≥70 绿（High）、≥40 橙（Mid）、<40 灰（Low）。
  - **动态扫描**：`MutationObserver` 监听 `document.body` 的 `childList` + `subtree`，300ms 防抖后重新扫描；首次无匹配时在搜索页 URL 下 `console.warn` 提示选择器可能过期。
- **触发条件**：`index.tsx` 中 `allowedJobPage && settings.cardBadges` 时调用。
- **依赖**：`lib/affinity.ts`、`lib/schema.ts`

## 4. 组件协作的关键链路

### 4.1 自动填充链路

```
Background (AUTOFILL_TAB / AUTOFILL_ACTIVE_TAB)
  → chrome.tabs.sendMessage(AUTOFILL_CURRENT_FORM)
    → index.tsx 监听器
      → engine.fillCurrentForm()
        → engine.extractFields() 填充 fieldRefs
        → engine.fillPass() 第 1 遍
          → engine.directProfileFill() 本地 Profile 确定性匹配
          → chrome.runtime.sendMessage(MAP_FIELDS) → Background 返回 fills
          → mergeFills() 合并
          → lib/fillers.applyFill() 写入 DOM
        → wait(200ms) + extractFields() 第 2 遍动态字段
        → engine.attachStoredResume() / attachStoredCoverLetter()
      → 返回 { filled, resumeOpened, review }
```

### 4.2 提交检测与跟踪链路

```
页面 click/submit 事件
  → engine.watchSubmit() 捕获
    → engine.queueTrackCurrentApplication()
      → engine.buildCurrentApplication("Applied")
      → chrome.runtime.sendMessage(APPLICATION_SUBMITTED)
        → Background: queuePendingApplication + 向 Tab 发 SHOW_TRACK_CONFIRM
          → Widget 监听器 setPendingConfirm → 渲染 TrackConfirm 弹窗
```

### 4.3 SPA 导航与匹配评分链路

```
setInterval(1000ms) 检测 location.href 变化
  → Widget setUrl
    → useEffect[url, profile]:
       若 isJobDetailUrl(url) → setJob("loading")
         → 轮询 hasJobDescriptionSurface()（500ms，超时 10s）
         → scoreAffinity(profile, extractJobDescription()) → setJob("scored")
       否则 → getPageContext() + setJob("idle")
    → useEffect[url]: GET_TRACKED_JOB 查询是否已跟踪
```

## 5. 文件清单（AS-IS）

| 文件 | 行数级别 | 角色 |
|------|----------|------|
| `entrypoints/content/index.tsx` | 小 | 入口与装配 |
| `entrypoints/content/engine.ts` | 大（~1000 行） | 页面解析引擎 |
| `entrypoints/content/Widget.tsx` | 大（~1000 行） | 侧面板主组件 + 多个子组件 |
| `entrypoints/content/TrackerTab.tsx` | 中（~650 行） | 跟踪器列表视图 |
| `entrypoints/content/ProfileTab.tsx` | 中（~200 行） | 精简资料编辑 |
| `entrypoints/content/ErrorBoundary.tsx` | 极小 | 错误边界 |
| `entrypoints/content/cardBadges.ts` | 小（~85 行） | 卡片徽章注入 |
| `entrypoints/content/widget.css` | 样式 | Shadow DOM 内样式 |

## 6. 相关文档

| 主题 | 文档 |
|------|------|
| Content Script 容器层面描述 | [../containers.md](../containers.md#32-content-script) |
| 系统整体上下文 | [../system-context.md](../system-context.md) |
| 自动填充完整链路 | [../flows/autofill.md](../flows/autofill.md) |
| 申请跟踪链路 | [../flows/application-tracking.md](../flows/application-tracking.md) |
| 消息协议 | [../contracts/message-protocol.md](../contracts/message-protocol.md) |
| 术语表 | [../glossary.md](../glossary.md) |
