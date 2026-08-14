# 数据模型契约（Data Model）

> **状态：AS-IS**（描述当前代码实际行为）
>
> **Source of Truth**：`lib/schema.ts`。所有数据结构的类型定义、常量均以此文件为准，修改数据结构**必须从此文件开始**。
>
> 本文档描述 Chrome Extension 的核心数据结构、存储位置及关键不变量。

## 1. 存储分层总览

扩展使用两类持久化存储，按数据量与访问模式分工：

| 存储 | 用途 | 访问方式 | 跨上下文同步 |
|------|------|----------|--------------|
| `chrome.storage.local` | 小数据、配置、跨上下文信号 | `lib/storage.ts` 封装 | 原生 `chrome.storage.onChanged` 事件 |
| IndexedDB（Dexie） | 大量记录、需索引查询 | `lib/db.ts` 的 `db` 实例 | 通过 `applicationsRev` 计数器信号 |

### 1.1 chrome.storage.local 键

定义于 `lib/storage.ts`，键名常量未导出，但实际字符串如下：

| 键名 | 类型 | 说明 | 写入函数 |
|------|------|------|----------|
| `profile` | `Profile` | 用户个人资料 | `saveProfile` |
| `settings` | `Settings` | 全局设置 | `saveSettings` |
| `pendingApplications` | `PendingApplication[]` | 待确认申请队列 | `queuePendingApplication` / `removePendingApplication` |
| `dashboardLaunch` | `DashboardLaunch \| undefined` | 仪表盘启动参数 | `setDashboardLaunch` / `clearDashboardLaunch` |
| `applicationsRev` | `number` | Application 表变更计数器 | `bumpApplicationsRev` |
| `dueCount` | `number` | 待跟进数量（用于角标） | `setDueCount` |

### 1.2 IndexedDB（Dexie）

数据库实例定义于 `lib/db.ts`，数据库名为 `jobAutofillTracker`，schema version 1：

| 表名 | 主键 | 索引 | 实体类型 |
|------|------|------|----------|
| `applications` | `++id`（自增） | `dateApplied`, `status`, `company`, `role`, `nextActionDate` | `Application` |
| `answerMemory` | `++id`（自增） | `questionHash`, `lastUsed` | `AnswerMemory` |

## 2. 核心数据结构

> 以下类型定义全部来自 `lib/schema.ts`，字段名与可空性与代码保持一致。

### 2.1 Profile（个人资料）

用户个人资料，存储于 `chrome.storage.local` 的 `profile` 键。

```typescript
type Profile = {
  identity: {
    firstName: string;
    middleName: string;
    lastName: string;
    preferredName: string;
    email: string;
    phone: string;
    phoneCountryCode: string;
    address: { line1: string; line2: string; postalCode: string };
    location: { city: string; state: string; country: string; willingToRelocate: boolean };
    links: { linkedin: string; github: string; portfolio: string; website: string };
  };
  workAuthorization: {
    usAuthorized: boolean;
    requiresSponsorship: boolean;
    visaStatus: string;
    eligibleCountries: string[];
    timezonesComfortable: string[];
    englishProficiency: string;
  };
  experience: Experience[];
  personalProjects: PersonalProject[];
  additionalKnowledge: string;
  skills: Record<string, SkillFact>;
  education: Array<{ degree: string; school: string; year: string }>;
  demographics: { gender: string; race: string; veteran: string; disability: string };
  applicationDefaults: {
    referralSource: string;
    referralDetails: string;
    employeeReferralName: string;
    needsRecruitmentAdjustments: boolean;
    recruitmentAdjustmentsDetails: string;
    previouslyEmployedByFitch: boolean;
    currentEmployer: string;
    currentTitle: string;
    currentSalary: string;
    desiredSalary: string;
    salaryCurrency: string;
    profileVisibility: string;
    jobNotifications: boolean;
  };
  resumeFileRef: string;
  resumeFile?: { name: string; type: string; dataUrl: string };
  coverLetterFile?: { name: string; type: string; dataUrl: string };
};
```

**关联类型**：

- `Experience = { title, company, start, end, highlights: string[], stack: string[] }`
- `PersonalProject = { name, description, role, start, end, highlights: string[], stack: string[], url, repository }`
- `SkillFact = { years: number, note: string, services?: string[] }`

**读取合并语义**：`getProfile()`（`lib/storage.ts`）以 `EMPTY_PROFILE` 为底，对 `identity` / `workAuthorization` / `demographics` / `applicationDefaults` 及嵌套对象做逐层浅合并，确保新增字段有默认值。

### 2.2 Application（申请记录）

求职申请记录，存储于 Dexie 的 `applications` 表。

```typescript
type Application = {
  id?: number;              // 自增主键，由 Dexie 写入时分配
  company: string;
  role: string;
  jobUrl: string;
  source: string;           // 来源（如 greenhouse / lever / ashby / linkedin）
  dateApplied: string;      // ISO 日期
  status: ApplicationStatus;
  location?: string;
  workMode?: "Remote" | "Hybrid" | "On-site" | "";
  compensation?: Compensation;
  jobDescription?: string;
  resumeVersion?: string;
  answersUsed: Array<{ question: string; answer: string }>;
  notes: string;
  nextActionDate?: string;  // ISO 日期，用于跟进到期判断
  upwork?: UpworkProposalDetails;
};
```

**关联类型**：

- `ApplicationStatus = "Saved" | "Applied" | "Screen" | "Interview" | "Offer" | "Rejected" | "Ghosted"`
- `Compensation = { text, currency: CompensationCurrency, min?: number | null, max?: number | null, period: CompensationPeriod }`
- `CompensationCurrency = "MXN" | "USD" | "EUR" | ""`
- `CompensationPeriod = "year" | "month" | "hour" | "one-time" | ""`
- `UpworkProposalDetails = { status, contractType, proposedAmount?, currency, baseConnects?, boostBid?, boostCharged?, respondedAt?, interviewedAt?, offeredAt?, hiredAt? }`
- `UpworkProposalStatus = "Submitted" | "Responded" | "Interview" | "Offered" | "Hired" | "Declined" | "Withdrawn" | "Archived"`

### 2.3 AnswerMemory（记忆答案）

用户已批准的问答对，存储于 Dexie 的 `answerMemory` 表，用于跨申请复用答案。

```typescript
type AnswerMemory = {
  id?: number;              // 自增主键
  questionHash: string;     // 由 questionHash() 计算的 djb2 十六进制哈希
  questionText: string;     // 原始问题文本
  answer: string;
  lastUsed: string;         // ISO 时间戳，每次命中更新
  editable: boolean;
};
```

**查询方式**（`lib/mapping.ts`）：
- 精确匹配：按 `questionHash` 等值查询（confidence = 1）
- 模糊匹配：`Fuse.js` 对 `questionText` 字段搜索（threshold = 0.28，confidence = 0.82）

### 2.4 Settings（设置）

全局设置，存储于 `chrome.storage.local` 的 `settings` 键。

```typescript
type Settings = {
  demoMode: boolean;        // 全局短路开关
  provider: "openai";
  apiKey: string;
  model: string;            // 默认 "gpt-5.4-mini"
  theme: ThemeMode;         // "light" | "dark"
  trackingEntryMode: TrackingEntryMode;  // "manual" | "ai"
  cardBadges: boolean;
  enabledSites: {
    greenhouse: boolean;
    lever: boolean;
    ashby: boolean;
    linkedin: boolean;
  };
};
```

**读取合并语义**：`getSettings()` 以 `DEFAULT_SETTINGS` 为底做浅合并，`enabledSites` 单独浅合并。

### 2.5 PendingApplication（待确认申请）

用户提交申请后、尚未确认入库的临时记录，存储于 `chrome.storage.local` 的 `pendingApplications` 键。

```typescript
type PendingApplication = {
  id: string;               // 字符串主键（非自增）
  application: Application; // 嵌套完整申请数据
  createdAt: string;        // ISO 时间戳
};
```

**去重规则**：`queuePendingApplication` 按 `id` 判定，已存在则跳过。

### 2.6 DashboardLaunch（仪表盘启动参数）

打开仪表盘时携带的定位参数，存储于 `chrome.storage.local` 的 `dashboardLaunch` 键，由 `OPEN_DASHBOARD` 消息写入。

```typescript
type DashboardLaunch = {
  tab: "tracker";
  pendingId?: string;
  applicationId?: number;
  createdAt: string;
};
```

### 2.7 填充相关类型

填充引擎使用的字段描述与结果类型：

```typescript
type FieldType = "text" | "textarea" | "select" | "combobox" | "radio" | "checkbox" | "file" | "confirmation" | "hyperlink";

type FieldDescriptor = {
  id: string;
  question: string;
  type: FieldType;
  options?: string[];
  value?: string | boolean;
  required?: boolean;
};

type FieldFill = {
  id: string;
  value: string | boolean;
  source: "profile" | "memory" | "ai" | "skip";
  confidence: number;
};

type AutofillReviewStatus = "filled" | "missing" | "unsupported" | "confirmation";

type AutofillReviewItem = {
  id: string;
  question: string;
  status: AutofillReviewStatus;
  detail: string;
};
```

### 2.8 PageContext（页面上下文）

消息中携带的页面信息，由 `entrypoints/content/engine.ts` 的 `getPageContext()` 构造：

```typescript
type PageContext = {
  url: string;
  title: string;
  source: string;
  company: string;
  role: string;
};
```

## 3. 关键不变量

### 3.1 APPLICATION_STATUSES

`lib/schema.ts` 中导出的常量数组，定义所有合法的 `ApplicationStatus` 值：

```typescript
export const APPLICATION_STATUSES: ApplicationStatus[] =
  ["Saved", "Applied", "Screen", "Interview", "Offer", "Rejected", "Ghosted"];
```

任何写入 `Application.status` 的代码必须使用此数组中的值；UI 下拉选项应以此数组为来源。

### 3.2 EMPTY_PROFILE

`lib/schema.ts` 中导出的 `Profile` 默认值常量。所有字段均提供默认值（字符串默认 `""`，布尔默认 `false`，数组默认 `[]`，`phoneCountryCode` 默认 `"+52"`，`location.state` 默认 `"Tamaulipas"`，`location.country` 默认 `"Mexico"`，`eligibleCountries` 默认 `["Mexico"]`，`timezonesComfortable` 默认 `["EST","CST","PST"]`，`englishProficiency` 默认 `"Professional (C1) - fluent speaking, writing, reading"`）。`getProfile()` 以此为合并基底，保证向后兼容新增字段。

### 3.3 DEFAULT_SETTINGS

`lib/schema.ts` 中导出的 `Settings` 默认值常量。`demoMode` 默认 `false`，`provider` 默认 `"openai"`，`model` 默认 `"gpt-5.4-mini"`，`theme` 默认 `"light"`，`trackingEntryMode` 默认 `"manual"`，`cardBadges` 默认 `true`，`enabledSites` 各站点默认 `true`。`getSettings()` 以此为合并基底。

### 3.4 CanonicalField

`lib/schema.ts` 中定义的字符串字面量联合类型，枚举所有可确定性匹配的字段（共 37 个），按命名空间分组：

- `identity.*`（firstName, middleName, lastName, email, phone, phoneCountryCode, address.line1/line2/postalCode, location.city/state/country, links.linkedin/github/portfolio）
- `workAuthorization.*`（usAuthorized, requiresSponsorship, visaStatus, englishProficiency）
- `applicationDefaults.*`（referralSource, referralDetails, employeeReferralName, needsRecruitmentAdjustments, recruitmentAdjustmentsDetails, previouslyEmployedByFitch, currentEmployer, currentTitle, currentSalary, desiredSalary, salaryCurrency, profileVisibility, jobNotifications）
- `demographics.*`（gender, race, veteran, disability）

`lib/mapping.ts` 的 `getProfileValue()` 通过 switch 分支为每个 `CanonicalField` 提供取值逻辑，新增字段必须同时更新此 switch。

### 3.5 SYNONYMS（同义词映射）

`lib/synonyms.ts` 中导出的 `Record<CanonicalField, string[]>` 映射，是字段确定性匹配的 Source of Truth。每个 `CanonicalField` 对应一组同义词短语（小写），`lib/mapping.ts` 的 `deterministicValue()` 将字段问题文本归一化后检查是否包含任一同义词来识别 canonical 字段。

**维护规则**：
- 新增 `CanonicalField` 时**必须**同步在 `SYNONYMS` 中添加对应同义词数组，否则该字段永远无法被确定性匹配。
- 同义词应使用小写，匹配前会经过 `normalizeText()`（转小写、移除非字母数字字符）。
- 该映射不可省略任何 `CanonicalField`（TypeScript 的 `Record<CanonicalField, string[]>` 强制完整性）。

### 3.6 applicationsRev 跨上下文同步信号

Dexie 的变更事件无法到达 Content Script，因此 `lib/storage.ts` 提供 `bumpApplicationsRev()`：每次 `Application` 表变更（add/update/delete）后必须调用，使 `applicationsRev` 计数器自增。Widget 与 Options 通过 `chrome.storage.onChanged` 监听 `applicationsRev` 变化来刷新列表。违反此约定会导致 UI 不刷新。

### 3.7 Demo Mode 全局短路

当 `settings.demoMode === true` 时：
- `getProfile()` 返回 `structuredClone(DEMO_PROFILE)`（来自 `lib/demo.ts`）
- 所有写操作（`saveProfile`、`db.applications.*`、`queuePendingApplication`、`removePendingApplication`、`rememberAnswer`）被跳过
- `LIST_APPLICATIONS` 返回 `createDemoApplications()`
- `memoryValue` 使用 `createDemoMemories()` 而非查询 Dexie
- `saveProfile` 在 demoMode 下抛出 `"Profile changes cannot be saved while demo mode is active."`

## 4. 数据流示意

```
chrome.storage.local                     IndexedDB (Dexie: jobAutofillTracker)
├── profile         (Profile)            ├── applications  (Application[])
├── settings        (Settings)           └── answerMemory  (AnswerMemory[])
├── pendingApplications (PendingApplication[])
├── dashboardLaunch (DashboardLaunch?)
├── applicationsRev (number)  ← 跨上下文同步信号
└── dueCount        (number)

读取路径：
  Profile    → getProfile()  (合并 EMPTY_PROFILE，demoMode 返回 DEMO_PROFILE)
  Settings   → getSettings() (合并 DEFAULT_SETTINGS)
  Application→ LIST_APPLICATIONS / GET_TRACKED_JOB (查询 Dexie，demoMode 返回演示数据)
  AnswerMemory→ memoryValue() (查询 Dexie，demoMode 返回演示数据)
```

## 5. 相关文件

- `lib/schema.ts` — 所有类型定义与常量（Source of Truth）
- `lib/db.ts` — Dexie schema 与 `db` 实例
- `lib/storage.ts` — chrome.storage.local 封装与 `bumpApplicationsRev`
- `lib/synonyms.ts` — `CanonicalField` 同义词映射
- `lib/mapping.ts` — `CanonicalField` 取值与 `questionHash` 实现
- `lib/demo.ts` — `DEMO_PROFILE` / `createDemoApplications()` / `createDemoMemories()`
- `lib/jobs.ts` — `canonicalJobUrl`（URL 规范化，影响 `GET_TRACKED_JOB` 匹配）
