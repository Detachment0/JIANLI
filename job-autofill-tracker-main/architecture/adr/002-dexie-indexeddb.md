# ADR 002：选择 Dexie（IndexedDB）存储申请记录

- **状态**：Accepted（已接受）
- **日期**：项目初始化时
- **AS-IS**：当前代码实际使用的方案

## 上下文（Context）

扩展需要持久化两类大量数据：

1. **Application（申请记录）**：随求职进度持续增长，可能达到数百至数千条，需要按 `status`、`dateApplied`、`company`、`role`、`nextActionDate` 等字段查询与排序。
2. **AnswerMemory（记忆答案）**：用户已批准的问答对，需要按 `questionHash` 精确查询与 `lastUsed` 排序。

`chrome.storage.local` 虽然简单，但有容量限制（默认约 10MB，需 `unlimitedStorage` 权限解除），且只支持按键读取整个值，无法对值内部字段建立索引查询，不适合大量记录的复杂查询场景。

## 决策驱动因素（Decision Drivers）

1. **查询能力**：能否对记录内部字段建立索引并执行高效查询（按状态筛选、按日期排序、按哈希等值查找）。
2. **容量**：能否承载大量记录而不受 `chrome.storage.local` 配额约束。
3. **IndexedDB 原生支持**：是否直接使用浏览器原生的 IndexedDB（无需额外后端）。
4. **TypeScript 支持**：能否提供类型安全的实体表定义。
5. **API 易用性**：是否提供 Promise 化的 API（原生 IndexedDB 是回调式，使用繁琐）。

## 备选方案（Considered Options）

### 选项 A：chrome.storage.local

将所有 Application 与 AnswerMemory 序列化为数组存于单个键。

### 选项 B：Dexie（IndexedDB 封装库）

基于原生 IndexedDB 的 Promise 化封装，提供 TypeScript 类型安全的实体表与索引查询。

### 选项 C：原生 IndexedDB

直接使用 `indexedDB.open` 与事务 API，不引入第三方库。

## 决策（Decision）

选择 **Dexie**（选项 B）。

`lib/db.ts` 定义 `JobTrackerDb extends Dexie`，数据库名 `jobAutofillTracker`，schema version 1：

```typescript
this.version(1).stores({
  applications: "++id, dateApplied, status, company, role, nextActionDate",
  answerMemory: "++id, questionHash, lastUsed"
});
```

`chrome.storage.local` 保留给小数据：`profile`、`settings`、`pendingApplications`、`dashboardLaunch`、`applicationsRev`、`dueCount`。

## 理由（Why）

1. **Promise API**：Dexie 将原生 IndexedDB 的回调式 API 封装为 Promise，与 `async/await` 配合自然，代码可读性高（如 `db.applications.add()` / `db.applications.orderBy("dateApplied").reverse().toArray()`）。
2. **TypeScript 类型安全**：`EntityTable<Application, "id">` 提供编译期类型检查，避免字段拼写错误。
3. **索引查询**：可在 schema 声明中定义索引（`status`、`dateApplied`、`questionHash`、`lastUsed` 等），支持高效查询；`LIST_APPLICATIONS` 按 `dateApplied` 倒序、`GET_TRACKED_JOB` 全表扫描后 URL 匹配、`rememberAnswer` 按 `questionHash` 等值查找均依赖这些索引。
4. **容量优势**：IndexedDB 配额远大于 `chrome.storage.local`，适合持续增长的申请记录。
5. **职责分离**：`chrome.storage.local` 留给 Profile/Settings 等小数据与跨上下文信号，Dexie 专责大量记录，存储分层清晰。

## 后果（Consequences）

### 好处

- 查询能力强：可按索引字段高效筛选、排序、等值查找。
- 容量大：不受 `chrome.storage.local` 配额约束。
- 代码简洁：Promise API 与 TypeScript 类型安全降低心智负担。

### 代价

- **Dexie 事件不跨上下文**：原生 IndexedDB 的变更事件不会跨 Service Worker / Content Script / Popup 传播，因此 Widget 与 Options 无法直接监听 Application 表变更来刷新 UI。
- **需要 `applicationsRev` 计数器作为跨上下文同步信号**：`lib/storage.ts` 提供 `bumpApplicationsRev()`，每次 Application 表变更（add/update/delete）后必须调用，使 `chrome.storage.local` 的 `applicationsRev` 自增；Widget/Options 通过 `chrome.storage.onChanged` 监听此计数器刷新。忘记调用会导致 UI 不刷新（见 AGENTS.md Global Invariants 第 4 条）。
- **Demo Mode 需要在每个写操作处显式短路**：Dexie 不感知 `demoMode`，需在 `background.ts` 的消息处理分支中手动检查并跳过写入。
- **额外依赖**：引入 `dexie` 库与 `fuse.js`（用于 AnswerMemory 模糊匹配），增加打包体积。

## 相关文件（Related）

- `lib/db.ts` — `JobTrackerDb` 定义与 `db` 实例
- `lib/storage.ts` — `bumpApplicationsRev` 跨上下文同步信号实现
- `lib/schema.ts` — `Application` / `AnswerMemory` 类型定义（Source of Truth）
- `entrypoints/background.ts` — Dexie 读写操作与 `bumpApplicationsRev` 调用点
- `lib/mapping.ts` — `answerMemory` 表的查询（`questionHash` 等值 + Fuse 模糊匹配）
- `architecture/contracts/data-model.md` — 存储分层与不变量详细说明
