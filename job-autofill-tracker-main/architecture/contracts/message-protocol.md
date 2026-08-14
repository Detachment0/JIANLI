# 消息协议契约（Message Protocol）

> **状态：AS-IS**（描述当前代码实际行为）
>
> **Source of Truth**：`lib/schema.ts` 中的 `ExtensionMessage` 联合类型。
>
> 本文档描述 Chrome Extension 内部各上下文（Content Script / Background Service Worker / Popup / Widget 侧面板 / Options 仪表盘）之间通过 `chrome.runtime.sendMessage` 与 `chrome.tabs.sendMessage` 传递的消息协议。任何对消息种类、字段或方向的修改，**必须先修改 `lib/schema.ts` 中的类型定义**，再同步本文档。

## 1. 传输约定

- **运行时消息**（`chrome.runtime.sendMessage`）：所有上下文均可向 Background 发送，Background 在 `entrypoints/background.ts` 的 `chrome.runtime.onMessage.addListener` 中统一处理。
- **标签页消息**（`chrome.tabs.sendMessage`）：Background 向特定标签页的 Content Script 转发消息（如 `AUTOFILL_CURRENT_FORM`、`SHOW_TRACK_CONFIRM`、`TOGGLE_WIDGET`）。
- **响应格式**：所有消息处理函数返回 `Promise<unknown>`，统一通过 `sendResponse` 回传。成功响应形如 `{ ok: true, ...payload }`，失败响应形如 `{ ok: false, error: string }`（由 `entrypoints/background.ts` 的 `handleMessage` catch 块封装）。
- **监听器约定**：Background 的 `onMessage` 监听器始终 `return true` 以保持消息通道开放直到异步 Promise 完成。
- **不可路由消息**：`TOGGLE_WIDGET`、`AUTOFILL_CURRENT_FORM`、`TRACK_CURRENT_APPLICATION` 这三类消息必须发送到页面标签页（Content Script），若误发到 Background，Background 返回 `{ ok: false, error: "... must be sent to a page tab." }`。

## 2. Demo Mode 短路总则

当 `settings.demoMode === true` 时，所有写操作（`db.applications.add/update/delete`、`saveProfile`、`queuePendingApplication`、`removePendingApplication`、`rememberAnswer`）被跳过，读取操作返回演示数据（`DEMO_PROFILE` / `createDemoApplications()` / `createDemoMemories()`）。下文每条消息单独标注短路行为。

## 3. 消息分类清单

### 3.1 填充相关

#### MAP_FIELDS

- **方向**：Content Script → Background（运行时消息）
- **请求字段**：
  - `kind: "MAP_FIELDS"`
  - `fields: FieldDescriptor[]` — 待匹配的页面字段描述数组
  - `jobDescription: string` — 当前页面职位描述文本
  - `page: PageContext` — 页面上下文（url / title / source / company / role）
- **响应格式**：`{ ok: true, fills: FieldFill[] }`，每个 `FieldFill` 含 `{ id, value, source: "profile" | "memory" | "ai" | "skip", confidence }`
- **Demo Mode 短路**：不短路。`getProfile()` 返回 `DEMO_PROFILE`；`memoryValue` 在 `demoMode` 下使用 `createDemoMemories()` 而非查询 Dexie。匹配逻辑仍执行，但数据源为演示数据。
- **处理位置**：`entrypoints/background.ts` 的 `MAP_FIELDS` 分支，调用 `lib/mapping.ts` 的 `deterministicValue` 与 `memoryValue`。

#### AUTOFILL_CURRENT_FORM

- **方向**：Background → Content Script（标签页消息）
- **请求字段**：`{ kind: "AUTOFILL_CURRENT_FORM" }`
- **响应格式**：由 Content Script 的 `fillCurrentForm()` 返回 `{ ok: true, filled: number, resumeOpened: boolean, review: AutofillReviewItem[] }`
- **Demo Mode 短路**：不短路（填充逻辑本身不写持久化）。
- **说明**：此消息**不可直接发给 Background**，Background 收到会返回 `{ ok: false, error: "Autofill must be sent to a page tab." }`。Background 通过 `sendAutofillToTab()` 转发，必要时先注入 content script。

#### AUTOFILL_TAB

- **方向**：Popup/Widget → Background（运行时消息）
- **请求字段**：`{ kind: "AUTOFILL_TAB" }`
- **响应格式**：透传 Content Script 对 `AUTOFILL_CURRENT_FORM` 的响应
- **Demo Mode 短路**：不短路。
- **约束**：必须由页面标签页上下文发起（`sender.tab?.id` 必须存在），否则抛出 `"Autofill must be requested from a page tab."`。

#### AUTOFILL_ACTIVE_TAB

- **方向**：Popup → Background（运行时消息）
- **请求字段**：`{ kind: "AUTOFILL_ACTIVE_TAB" }`
- **响应格式**：透传 Content Script 对 `AUTOFILL_CURRENT_FORM` 的响应
- **Demo Mode 短路**：不短路。
- **说明**：Background 通过 `chrome.tabs.query({ active: true, currentWindow: true })` 查找活动标签页并转发，若无活动标签页抛出 `"No active page tab was found."`。转发使用 `sendMessageToTabWithInjection`，若 Content Script 未加载会先通过 `chrome.scripting.executeScript` 注入。

### 3.2 跟踪相关

#### LOG_APPLICATION

- **方向**：任何上下文 → Background（运行时消息）
- **请求字段**：
  - `kind: "LOG_APPLICATION"`
  - `application: Application` — 完整申请记录
- **响应格式**：`{ ok: true }`
- **Demo Mode 短路**：是。`demoMode === true` 时直接返回 `{ ok: true }`，不写入 Dexie，不调用 `bumpApplicationsRev()`。
- **处理位置**：`db.applications.add(message.application)` + `bumpApplicationsRev()`。

#### UPDATE_APPLICATION

- **方向**：Widget/Options → Background（运行时消息）
- **请求字段**：
  - `kind: "UPDATE_APPLICATION"`
  - `id: number` — 申请记录主键
  - `patch: Partial<Application>` — 部分更新字段
- **响应格式**：`{ ok: true }`
- **Demo Mode 短路**：是。直接返回 `{ ok: true }`，不更新 Dexie。
- **处理位置**：`db.applications.update(message.id, message.patch)` + `bumpApplicationsRev()`。

#### DELETE_APPLICATION

- **方向**：Widget/Options → Background（运行时消息）
- **请求字段**：
  - `kind: "DELETE_APPLICATION"`
  - `id: number` — 申请记录主键
- **响应格式**：`{ ok: true }`
- **Demo Mode 短路**：是。直接返回 `{ ok: true }`，不删除 Dexie 记录。
- **处理位置**：`db.applications.delete(message.id)` + `bumpApplicationsRev()`。

#### LIST_APPLICATIONS

- **方向**：Widget → Background（运行时消息）
- **请求字段**：`{ kind: "LIST_APPLICATIONS" }`
- **响应格式**：`{ ok: true, applications: Application[] }`，按 `dateApplied` 倒序排列
- **Demo Mode 短路**：是。返回 `{ ok: true, applications: createDemoApplications() }`，不查询 Dexie。
- **处理位置**：`db.applications.orderBy("dateApplied").reverse().toArray()`。

#### GET_TRACKED_JOB

- **方向**：Widget → Background（运行时消息）
- **请求字段**：
  - `kind: "GET_TRACKED_JOB"`
  - `url: string` — 待查询的职位 URL
- **响应格式**：`{ ok: true, tracked: Application | undefined }`
- **Demo Mode 短路**：是。返回 `{ ok: true, tracked: undefined }`。
- **处理位置**：使用 `lib/jobs.ts` 的 `canonicalJobUrl` 规范化 URL 后，在 `db.applications.toArray()` 结果中查找匹配项。

#### APPLICATION_SUBMITTED

- **方向**：Content Script → Background（运行时消息）
- **请求字段**：
  - `kind: "APPLICATION_SUBMITTED"`
  - `pending: PendingApplication` — 待确认的申请数据
- **响应格式**：`{ ok: true }`
- **Demo Mode 短路**：`queuePendingApplication` 内部在 `demoMode` 时直接返回，不入队；但 `SHOW_TRACK_CONFIRM` 转发仍执行。
- **约束**：必须由页面标签页发起（`sender.tab?.id` 必须存在），否则抛出 `"Submission events must come from a page tab."`。
- **处理位置**：调用 `queuePendingApplication(message.pending)`，随后向 `sender.tab.id` 发送 `SHOW_TRACK_CONFIRM` 消息（携带同一 `pending`）。

#### SHOW_TRACK_CONFIRM

- **方向**：Background → Content Script（标签页消息）
- **请求字段**：
  - `kind: "SHOW_TRACK_CONFIRM"`
  - `pending: PendingApplication` — 待确认的申请数据
- **响应格式**：由 Content Script 处理（显示跟踪确认弹窗）
- **Demo Mode 短路**：不短路（始终发送，用于演示跟踪确认 UI）。
- **说明**：由 Background 在处理 `APPLICATION_SUBMITTED` 时主动发出，Content Script 收到后弹出跟踪确认 UI。

#### TRACK_CURRENT_APPLICATION

- **方向**：Background → Content Script（标签页消息，**未在 Background 处理**）
- **请求字段**：`{ kind: "TRACK_CURRENT_APPLICATION" }`
- **响应格式**：由 Content Script 处理
- **Demo Mode 短路**：不适用。
- **说明**：此消息**不可直接发给 Background**，Background 收到会返回 `{ ok: false, error: "Tracking must be sent to a page tab." }`。Content Script 收到后调用 `queueTrackCurrentApplication()` 构造 `PendingApplication` 并触发跟踪流程。

### 3.3 Pending Application

#### QUEUE_PENDING_APPLICATION

- **方向**：Content Script → Background（运行时消息）
- **请求字段**：
  - `kind: "QUEUE_PENDING_APPLICATION"`
  - `pending: PendingApplication` — 待确认的申请数据
- **响应格式**：`{ ok: true }`
- **Demo Mode 短路**：是。`queuePendingApplication` 内部在 `demoMode` 时直接返回，不入队。
- **处理位置**：`lib/storage.ts` 的 `queuePendingApplication`，写入 `chrome.storage.local` 的 `pendingApplications` 键（去重，按 `id` 判定）。

#### REMOVE_PENDING_APPLICATION

- **方向**：Widget/Options → Background（运行时消息）
- **请求字段**：
  - `kind: "REMOVE_PENDING_APPLICATION"`
  - `id: string` — 待删除的 PendingApplication 主键
- **响应格式**：`{ ok: true }`
- **Demo Mode 短路**：是。`removePendingApplication` 内部在 `demoMode` 时直接返回，不修改存储。
- **处理位置**：`lib/storage.ts` 的 `removePendingApplication`，从 `pendingApplications` 键中过滤掉匹配 `id` 的项。

### 3.4 AI 相关

> **全局不变量**：所有 OpenAI API 调用必须通过 Background 路由，Content Script 与 Popup 不能直接调用 `fetch("https://api.openai.com/...")`。API Key 存储在 `chrome.storage.local` 的 `settings` 键中，仅 Background 读取。

#### AI_JOB_FIT

- **方向**：Widget → Background（运行时消息）
- **请求字段**：
  - `kind: "AI_JOB_FIT"`
  - `jobDescription: string` — 职位描述文本
  - `page: PageContext` — 页面上下文
- **响应格式**：`{ ok: true, analysis: <analyzeJobFit 返回类型> }`
- **Demo Mode 短路**：不短路。`getProfile()` 返回 `DEMO_PROFILE`；AI 调用仍执行（但 `settings.apiKey` 为空时会失败）。
- **处理位置**：`lib/ai.ts` 的 `analyzeJobFit(jobDescription, page, profile, settings)`。

#### AI_DRAFT_ANSWER

- **方向**：Widget → Background（运行时消息）
- **请求字段**：
  - `kind: "AI_DRAFT_ANSWER"`
  - `question: string` — 待草拟答案的问题文本
- **响应格式**：`{ ok: true, answer: string }`
- **Demo Mode 短路**：不短路。`getProfile()` 返回 `DEMO_PROFILE`。
- **处理位置**：`lib/ai.ts` 的 `draftSingleAnswer(question, profile, settings)`。

#### AI_DRAFT_APPLICATION

- **方向**：Widget/Options → Background（运行时消息）
- **请求字段**：
  - `kind: "AI_DRAFT_APPLICATION"`
  - `postingText: string` — 职位招聘文本
- **响应格式**：`{ ok: true, draft: <draftApplicationFromJobPosting 返回类型> }`
- **Demo Mode 短路**：不短路。AI 调用仍执行。
- **处理位置**：`lib/ai.ts` 的 `draftApplicationFromJobPosting(postingText, settings)`。

#### AI_ENRICH_PROFILE

- **方向**：Widget/Options → Background（运行时消息）
- **请求字段**：
  - `kind: "AI_ENRICH_PROFILE"`
  - `text: string` — 用于富化资料源文本
- **响应格式**：`{ ok: true, profile: Profile }`（富化后的完整 Profile）
- **Demo Mode 短路**：不短路。`getProfile()` 返回 `DEMO_PROFILE` 作为富化基础。
- **处理位置**：`lib/ai.ts` 的 `enrichProfileFromText(text, profile, settings)`。

#### REMEMBER_ANSWER

- **方向**：Widget → Background（运行时消息）
- **请求字段**：
  - `kind: "REMEMBER_ANSWER"`
  - `question: string` — 问题文本
  - `answer: string` — 答案文本
- **响应格式**：`{ ok: true }`
- **Demo Mode 短路**：是。`rememberAnswer` 内部在 `demoMode` 时直接返回，不写入 Dexie 的 `answerMemory` 表。
- **处理位置**：`lib/mapping.ts` 的 `rememberAnswer(question, answer, demoMode)`，按 `questionHash` 去重 upsert。

### 3.5 导航与 UI

#### OPEN_DASHBOARD

- **方向**：任何上下文 → Background（运行时消息）
- **请求字段**：
  - `kind: "OPEN_DASHBOARD"`
  - `pendingId?: string` — 可选，打开时定位的 PendingApplication id
  - `applicationId?: number` — 可选，打开时定位的 Application id
- **响应格式**：`{ ok: true }`
- **Demo Mode 短路**：不短路。
- **处理位置**：调用 `setDashboardLaunch({ tab: "tracker", pendingId, applicationId, createdAt })` 写入 `chrome.storage.local` 的 `dashboardLaunch` 键，随后 `chrome.tabs.create({ url: chrome.runtime.getURL("options.html"), active: true })` 打开仪表盘。

#### OPEN_WIDGET_ACTIVE_TAB

- **方向**：Popup → Background（运行时消息）
- **请求字段**：`{ kind: "OPEN_WIDGET_ACTIVE_TAB" }`
- **响应格式**：透传 Content Script 对 `TOGGLE_WIDGET` 的响应
- **Demo Mode 短路**：不短路。
- **说明**：Background 查找活动标签页后发送 `TOGGLE_WIDGET`，使用 `sendMessageToTabWithInjection`（必要时注入 content script）。若无活动标签页抛出 `"No active page tab was found."`。

#### TOGGLE_WIDGET

- **方向**：Background → Content Script（标签页消息）或快捷键触发
- **请求字段**：`{ kind: "TOGGLE_WIDGET" }`
- **响应格式**：由 Content Script 处理（切换 Widget 侧面板显隐）
- **Demo Mode 短路**：不短路。
- **说明**：此消息**不可直接发给 Background**，Background 收到会返回 `{ ok: false, error: "Widget toggling must be sent to a page tab." }`。触发途径有二：
  1. 快捷键 `Alt+J`（`wxt.config.ts` 中 `commands["toggle-widget"]`）→ Background 的 `chrome.commands.onCommand` 监听器向活动标签页转发；
  2. `OPEN_WIDGET_ACTIVE_TAB` 消息处理时转发。
  - 仅在职位页面生效，其他页面 Content Script 不存在，转发错误 `"Receiving end does not exist"` 会被静默吞掉。

## 4. 消息总览表

| kind | 方向 | Demo Mode 短路 | 写持久化 |
|------|------|----------------|----------|
| MAP_FIELDS | Content → Background | 否（用演示数据） | 否 |
| AUTOFILL_CURRENT_FORM | Background → Content | 否 | 否 |
| AUTOFILL_TAB | Popup/Widget → Background → Content | 否 | 否 |
| AUTOFILL_ACTIVE_TAB | Popup → Background → Content | 否 | 否 |
| LOG_APPLICATION | Any → Background | 是 | 是（Dexie） |
| UPDATE_APPLICATION | Widget/Options → Background | 是 | 是（Dexie） |
| DELETE_APPLICATION | Widget/Options → Background | 是 | 是（Dexie） |
| LIST_APPLICATIONS | Widget → Background | 是（返回演示数据） | 否 |
| GET_TRACKED_JOB | Widget → Background | 是（返回 undefined） | 否 |
| APPLICATION_SUBMITTED | Content → Background | 部分（不入队，仍转发确认） | 是（storage） |
| SHOW_TRACK_CONFIRM | Background → Content | 否 | 否 |
| TRACK_CURRENT_APPLICATION | Background → Content | 不适用 | 否 |
| QUEUE_PENDING_APPLICATION | Content → Background | 是 | 是（storage） |
| REMOVE_PENDING_APPLICATION | Widget/Options → Background | 是 | 是（storage） |
| AI_JOB_FIT | Widget → Background | 否（用演示 Profile） | 否 |
| AI_DRAFT_ANSWER | Widget → Background | 否（用演示 Profile） | 否 |
| AI_DRAFT_APPLICATION | Widget/Options → Background | 否 | 否 |
| AI_ENRICH_PROFILE | Widget/Options → Background | 否（用演示 Profile） | 否 |
| REMEMBER_ANSWER | Widget → Background | 是 | 是（Dexie） |
| OPEN_DASHBOARD | Any → Background | 否 | 是（storage） |
| OPEN_WIDGET_ACTIVE_TAB | Popup → Background → Content | 否 | 否 |
| TOGGLE_WIDGET | Background → Content / 快捷键 | 否 | 否 |

## 5. 相关文件

- `lib/schema.ts` — 消息类型定义（Source of Truth）
- `entrypoints/background.ts` — 消息路由与处理实现
- `entrypoints/content/engine.ts` — Content Script 端消息接收与填充执行
- `lib/mapping.ts` — `MAP_FIELDS` 的字段匹配实现
- `lib/storage.ts` — PendingApplication / DashboardLaunch 持久化
