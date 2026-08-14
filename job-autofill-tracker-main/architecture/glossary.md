# 术语表

> AS-IS 状态说明：本术语表按字母顺序排列，条目对应的文件路径、存储位置、实现均来自项目当前源码。

## A

- **Affinity Score**
  技能匹配分数（0–100），基于职位描述中的技能词库与个人资料的匹配度计算。实现见 `lib/affinity.ts`。

- **AnswerMemory**
  已记住的问答对，用于自动填充重复的筛选问题。通过 Dexie 存储在 IndexedDB 中。

- **Application**
  一条求职申请记录。存储在 Dexie 的 `applications` 表中（见 `lib/db.ts`）。

- **applicationsRev**
  `chrome.storage.local` 中的计数器（键名 `"applicationsRev"`，定义于 `lib/storage.ts` 的 `APPLICATIONS_REV_KEY`）。Application 表变更时递增，用于跨扩展上下文（Background / Content Script / Options / Popup）触发刷新，弥补 Dexie 事件不跨上下文的限制。

- **Autofill Review**
  自动填充后的审查列表，标记每个字段的状态（`filled` / `missing` / `unsupported` / `confirmation`）。

## B

- **Background (Service Worker)**
  MV3 后台服务工作者，处理消息路由、AI 调用和数据持久化。入口为 `entrypoints/background.ts`。

## C

- **CanonicalField**
  可确定性匹配的标准字段标识符（如 `"identity.firstName"`）。作为字段匹配的标准命名空间。

- **Content Script**
  注入到网页中的脚本，负责 DOM 交互和侧面板（Widget）UI。入口为 `entrypoints/content/index.tsx`。

## D

- **Demo Mode**
  演示模式，所有写操作被短路，使用预设的演示数据，不覆盖真实本地记录。实现见 `lib/demo.ts`。

- **Dexie**
  IndexedDB 的 Promise 封装库（依赖版本 4.4.4）。用于存储 Application 和 AnswerMemory。封装见 `lib/db.ts`。

## F

- **FieldDescriptor**
  从 DOM 提取的字段描述，包含 `id`、`question`、`type`、`options`、`value`、`required` 等属性。

- **FieldFill**
  字段填充值，包含 `id`、`value`、`source`、`confidence` 等属性。

## J

- **JobTracker Widget**
  注入到网页中的侧面板组件，运行在 Shadow DOM 中。主体组件为 `entrypoints/content/Widget.tsx`，样式见 `entrypoints/content/widget.css`。可通过快捷键 `Alt+J`（见 `wxt.config.ts` 的 `commands.toggle-widget`）切换显隐。

## O

- **Options Page**
  仪表盘页面，提供全功能管理界面（个人资料编辑器、看板/表格混合跟踪器、跟进日期、答案记忆视图、设置和 CSV 导出）。入口为 `entrypoints/options/index.html` + `entrypoints/options/main.tsx`。

## P

- **PendingApplication**
  用户提交申请后的待确认记录，存储在 `chrome.storage.local` 中。

- **Popup**
  浏览器工具栏弹出窗口，提供快捷操作。入口为 `entrypoints/popup/index.html` + `entrypoints/popup/main.tsx`。

- **Profile**
  求职者的个人资料，存储在 `chrome.storage.local` 中。

## S

- **Shadow DOM**
  Widget UI 的渲染环境，提供 CSS 隔离，使宿主页面样式不影响 Widget。

- **SYNONYMS**
  `lib/synonyms.ts` 中导出的 `CanonicalField → 同义词列表` 映射（`export const SYNONYMS: Record<CanonicalField, string[]>`），是字段匹配的 Source of Truth。

## W

- **WXT**
  Chrome Extension 构建框架，本项目使用 0.20.27 版本。配置见 `wxt.config.ts`。
