# 项目模型分析 — 交付 UI/UX 设计 AI

> 本文档通过逆向分析源码生成，供另一个 UI/UX 设计 AI 在没有源码访问权限的情况下，完整理解本项目并重新设计 UI/UX。

---

## 一、分析方法说明

本文档基于以下源码层分析：

- 全部 TypeScript 类型定义（`lib/schema.ts`）
- 全部页面组件（`entrypoints/popup/main.tsx`、`entrypoints/options/main.tsx`、`entrypoints/content/Widget.tsx`、`entrypoints/content/index.tsx`）
- 全部业务逻辑层（`lib/` 下的 15 个文件）
- 后台消息中枢（`entrypoints/background.ts`）
- 内容脚本引擎（`entrypoints/content/engine.ts`）
- 填充执行层（`lib/fillers.ts`、`lib/mapping.ts`）
- 全部样式文件（`entrypoints/popup/styles.css`、`entrypoints/options/styles.css`、`entrypoints/content/widget.css`）
- 构建配置（`wxt.config.ts`、`package.json`）
- 项目文档（`README.md`、`architecture/` 目录）

**标注说明**：
- 【源码确定】= 可直接从代码中读取的事实
- 【推测】= 无法从代码直接确定，但从上下文推导
- 【无法从源码确定】= 代码中无相关信息

---

## 二、产品为什么存在

### 1. 产品是什么（3-8 句话）

这是一款 **本地优先的 Chrome 浏览器扩展**，面向求职者，核心解决三个问题：

1. **自动填写求职申请表** — 用户将个人信息（姓名、联系方式、工作经历、技能等）存储在本地个人资料中，扩展自动识别招聘网站表单字段并填入对应数据。
2. **草拟开放式筛选问题答案** — 对于表单中的开放式问题（如"为什么你适合这个职位？"），可选使用 OpenAI API 基于用户个人资料和职位描述草拟答案。
3. **跟踪申请进度** — 记录用户投递的每一份申请（公司、职位、状态、跟进日期等），以看板/表格形式管理，支持 CSV 导出。

【源码确定】来源：`README.md` 第 3 行、"功能特性"列表、`lib/schema.ts` 全部类型定义、`entrypoints/background.ts` 消息处理逻辑。

### 2. 解决的核心问题

求职者在找工作时，需要在多个招聘平台（Greenhouse、Lever、LinkedIn、Indeed、Ashby、Upwork 等）反复填写相同的个人信息（姓名、地址、电话、学历、工作经历等），重复性极高。同时，投递多份申请后难以系统化跟踪每份申请的状态（是否已投递、是否进入面试、是否需要跟进）。

【源码确定】来源：`README.md` 第 3 行；`entrypoints/content/engine.ts` 第 11-49 行的 `isAllowedJobPage()` 和 `hasApplicationSurface()` 检测逻辑；`entrypoints/popup/main.tsx` 的 6 个操作按钮。

### 3. 用户角色

【源码确定】只有一个明确的用户角色：**求职者**。所有功能围绕"填写申请表 + 跟踪申请"展开。

【推测】可能存在两类细分用户：
- **国际求职者**（面向 Greenhouse、Lever、LinkedIn 等英文平台）— 使用英文姓/名拆分、美国工作授权等字段
- **中国求职者**（面向中文招聘网站）— 使用中文姓名全称、自我评价等字段

区分依据：`lib/customSynonyms.ts` 同时包含中英文同义词；`entrypoints/content/engine.ts` 第 38-44 行包含中文关键词（"提交申请"、"上传简历"、"投递简历"）。

### 4. 用户进入系统最想完成什么

| 用户场景 | 核心目标 |
|----------|----------|
| 打开一个招聘页面 | 一键填充所有表单字段，无需手动输入 |
| 投递一份申请后 | 自动记录到跟踪列表，避免忘记投了哪家 |
| 管理已投递的申请 | 查看所有申请的状态，知道哪些需要跟进 |
| 编辑个人信息 | 确保自动填充的数据准确 |
| 填写开放式问题 | 快速获得 AI 草拟的答案，避免从零开始写 |

### 5. 如果只能保留三个核心能力

1. **自动填充表单** — 这是产品的核心价值，替代用户手动填写
2. **申请跟踪** — 让用户管理所有投递的申请，避免遗漏跟进
3. **个人资料管理** — 填充的数据来源，没有资料就谈不上填充

【源码确定】理由：`entrypoints/popup/main.tsx` 将"自动填充"和"跟踪仪表盘"作为最突出的两个操作；`entrypoints/content/Widget.tsx` 的 tab 顺序以"匹配"和"自动填表"开头；`entrypoints/background.ts` 的消息处理中，`LOG_APPLICATION`、`AUTOFILL_TAB`、`AUTOFILL_ACTIVE_TAB` 是最核心的消息类型。

### 6. 项目类型

**工具 + 工作流系统**。

依据：
- 核心功能是"工具"（自动填充表单），用户触发一次操作，扩展执行
- 跟踪功能是"工作流系统"（申请从 Saved → Applied → Screen → Interview → Offer → Rejected/Ghosted）
- 不存在管理后台（尽管 Options 页面看起来像管理后台，但它本质上是工具的配置界面）
- 不存在数据展示、内容消费或创作工具的特征

---

## 三、核心业务对象

### 对象 1：Profile（个人资料）

**是什么**：用户个人的全部求职相关信息，包括身份信息、联系方式、地址、工作授权、工作经历、项目经历、技能、教育背景、人口统计信息、求职偏好设置、简历文件等。

**为什么存在**：作为自动填充的"数据源"，扩展从这里读取数据填入表单。

**用户可以做什么**：【源码确定】
- 在仪表盘页面编辑所有字段（`entrypoints/options/main.tsx` 第 108-338 行）
- 通过"注入简历"按钮从预设数据填充（`entrypoints/background.ts` 第 140-143 行）
- 通过"导入简历 PDF"让 AI 解析 PDF 填充（`entrypoints/options/main.tsx` 第 339-350 行）
- 通过"智能添加"手动输入文本让 AI 提取字段（`entrypoints/options/main.tsx` 第 296-313 行）

**重要属性**：【源码确定，`lib/schema.ts` 第 185-259 行】
```
identity: { firstName, lastName, fullName, email, phone, address, location, links }
workAuthorization: { usAuthorized, requiresSponsorship, visaStatus, englishProficiency }
experience: Array<{ title, company, start, end, highlights, stack }>
personalProjects: Array<{ name, description, role, highlights, stack }>
skills: Record<string, { years, note }>
education: Array<{ degree, school, year }>
demographics: { gender, race, veteran, disability }
applicationDefaults: { referralSource, desiredSalary, currentEmployer, ... }
summary: string
additionalKnowledge: string
resumeFile: { name, type, dataUrl } | undefined
```

**与其他对象的关系**：Profile 是自动填充的**数据来源**，是 Application 跟踪的**上下文**（填写申请时从 Profile 读取数据）。

**关键状态**：【源码确定】
- 未设置（`EMPTY_PROFILE` 状态，所有字段为空或默认值）
- 已设置（用户已填写部分或全部字段）
- 演示模式（`settings.demoMode === true` 时，Profile 可编辑但变更不持久化）

### 对象 2：Application（申请记录）

**是什么**：用户投递的一份求职申请的记录。

**为什么存在**：让用户跟踪所有申请的状态和进度。

**用户可以做什么**：【源码确定】
- 查看申请列表（看板/表格两种视图，`entrypoints/options/main.tsx` 第 370-900 行）
- 添加申请（手动录入或 AI 解析职位文本）
- 修改申请状态（Saved → Applied → Screen → Interview → Offer → Rejected/Ghosted）
- 添加跟进日期
- 删除申请
- 导出 CSV（`entrypoints/options/main.tsx` 第 900-920 行）
- 提交表单后自动弹出确认对话框（`entrypoints/content/engine.ts` 第 834-884 行）

**重要属性**：【源码确定，`lib/schema.ts` 第 153-170 行】
```
company, role, jobUrl, source, dateApplied, status
location?, workMode?, compensation?, jobDescription?
answersUsed: Array<{ question, answer }>
notes, nextActionDate?
upwork?: { status, contractType, proposedAmount, ... }
```

**关键状态**：【源码确定，`lib/schema.ts` 第 104-113 行】
`Saved → Applied → Screen → Interview → Offer → Rejected → Ghosted`

**与其他对象的关系**：
- Application 的填充过程使用 Profile 的数据
- Application 可关联 AnswerMemory（记录填写的问答）
- 多个 Application 组成用户的求职跟踪列表

### 对象 3：AnswerMemory（答案记忆）

**是什么**：用户在申请表单中填写过的问答对的缓存。

**为什么存在**：当用户再次遇到相同问题时，可以直接复用之前填写的答案，减少重复输入。

**用户可以做什么**：【源码确定】
- 查看所有记忆的答案列表（`entrypoints/options/main.tsx` 的 memory tab）
- 标记答案是否为 AI 生成的（`editable` 属性）
- 自动匹配到表单字段（`lib/mapping.ts` 的 `memoryValue()` 函数）

**重要属性**：【源码确定，`lib/schema.ts` 第 95-102 行】
```
questionHash, questionText, answer, lastUsed, editable
```

### 对象 4：PendingApplication（待确认申请）

**是什么**：用户提交表单后尚未确认是否要跟踪的临时申请记录。

**为什么存在**：用户提交表单时扩展自动检测到申请，但不确定用户是否真的想跟踪，所以弹出一个确认对话框让用户选择。

**用户可以做什么**：【源码确定】
- 确认跟踪（保存到 Application 列表）
- 忽略（丢弃）
- 在仪表盘查看待处理的申请列表（`entrypoints/options/main.tsx` 的 tracker tab）

**重要属性**：【源码确定，`lib/schema.ts` 第 172-176 行】
```
id, application, createdAt
```

### 对象 5：CustomSynonymEntry（自定义同义词条目）

**是什么**：表单字段标签到规范字段的映射规则。

**为什么存在**：不同招聘网站对同一个字段使用不同的标签（如"姓名" vs "名字" vs "first name"），需要映射表来匹配。

**用户可以做什么**：【源码确定】
- 添加新映射（选择目标字段 + 输入同义词列表）
- 开启/关闭映射（`enabled` 开关）
- 批量开启/关闭所有映射
- 修改现有映射的字段或同义词

**重要属性**：【源码确定，`lib/schema.ts` 第 406-411 行】
```
id, field (CanonicalField), synonyms (string[]), enabled (boolean)
```

### 对象 6：Settings（设置）

**是什么**：扩展的全局配置。

**为什么存在**：控制扩展的行为和外观。

**重要属性**：【源码确定，`lib/schema.ts` 第 261-275 行】
```
demoMode, provider, apiKey, model, theme, trackingEntryMode, cardBadges, enabledSites
```

### 对象关系图

```
用户
 → 管理 Profile（个人资料）— 数据源
 → 管理 CustomSynonyms（同义词映射）— 匹配规则
 → 配置 Settings（设置）— 行为控制
     ↓
  自动填充引擎（检测表单 → 映射字段 → 填充数据）
     ↓
 → 产生 Application（申请记录）— 跟踪对象
 → 产生 AnswerMemory（答案记忆）— 复用对象
 → 管理 PendingApplication（待确认申请）— 临时对象
```

---

## 四、用户完整工作流

### 流程 1：首次使用 — 设置个人资料

**用户为什么开始**：刚安装扩展，需要填充个人资料才能使用自动填充功能。

**入口**：点击浏览器工具栏的扩展图标 → 弹出 Popup → 点击"跟踪仪表盘" → 打开仪表盘页面（`options.html`）

**步骤**：
1. 用户看到仪表盘页面，默认显示"资料" tab
2. 页面显示一个多 section 的编辑表单，包含：
   - 基本信息（姓名、邮箱、电话）
   - 地址（详细地址、城市、省份、国家）
   - 个人链接（LinkedIn、GitHub、个人网站）
   - 工作授权（美国工作授权、签证担保、英语水平）
   - 工作经历（可添加多条）
   - 项目经历（可添加多条）
   - 技能（键值对，技能名 → 年限+备注）
   - 教育背景
   - 人口统计信息
   - 求职偏好（信息来源、期望薪资、当前公司等）
   - 补充答案知识（自由文本，供 AI 参考）
   - 自我评价（textarea）
3. 用户填写表单，每个字段变更后 550ms 自动保存
4. 页面显示"已保存"状态反馈
5. 用户也可以使用"导入简历 PDF"功能，上传 PDF 让 AI 解析后自动填充字段

**关键决策点**：
- 用户可以选择配置 OpenAI API Key 来启用 AI 功能（草拟答案、简历导入、资料富化）
- 如果使用演示模式，所有变更不会持久化

**状态**：
- 正常：表单可编辑，显示"已保存"
- 保存中：显示"正在保存..."
- 错误：显示错误信息
- 演示模式：显示"演示模式变更是临时的"

### 流程 2：每日使用 — 自动填充求职申请

**用户为什么开始**：打开了一个招聘网站（如 Greenhouse、LinkedIn、Indeed 等）的申请页面，需要快速填写。

**入口**：有两种方式

**方式 A：通过 Popup（浏览器扩展图标）**
1. 用户点击浏览器工具栏的扩展图标
2. Popup 弹出，显示 6 个操作按钮
3. 用户点击"自动填充当前页面"
4. 扩展向当前标签页发送填充请求
5. 内容脚本检测页面表单字段，匹配 Profile 数据，填充字段
6. 页面右下角出现浮动通知条，显示填充率（X%）、已填充/跳过/未匹配数量
7. Popup 显示状态摘要（如"5/8 已填充 (62%) · 2 跳过 · 1 未匹配"）

**方式 B：通过侧栏 Widget**
1. 用户在招聘页面右侧看到一个绿色浮动按钮（FAB）
2. 点击 FAB 打开侧栏 Widget
3. Widget 顶部显示 6 个操作按钮（与 Popup 相同）
4. 用户点击"自动填充当前页面"
5. 结果与方式 A 相同（共用同一填充引擎）

**高频操作**：自动填充（每天使用多次）

**容易中断/出错的位置**：
- 页面是 iframe 嵌入式表单（如 Comeet）时，内容脚本需要检测并处理
- 表单字段是自定义组件（combobox、hyperlink）时，扩展无法填充，提示手动操作
- 法律确认字段（同意条款）永远不自动填充
- 依赖字段（如"如果选择是，请说明"）会检查父字段值决定是否跳过

**填充结果状态**：【源码确定，`lib/fillResult.ts` 第 3-10 行】
- `filled`：成功填充
- `partial`：部分填充（多段内容溢出）
- `skipped`：已跳过（法律确认字段）
- `no_match`：未匹配到字典
- `no_data`：Profile 中无此数据
- `fill_error`：写入后页面拒绝
- `custom_component`：自定义组件（引擎不支持）

### 流程 3：投递申请后 — 跟踪确认

**用户为什么开始**：填写完表单并点击"提交申请"按钮后，扩展自动检测到提交事件。

**流程**：
1. 用户填写表单，点击"提交申请"按钮
2. 内容脚本的 `watchSubmit()` 监听点击和表单提交事件
3. 代码检测到提交按钮文本包含 "submit"、"send" 等关键词
4. 扩展自动构建一个 `PendingApplication`（包含当前页面的公司、职位、URL、填写的问答等）
5. 发送消息给 background worker
6. Background worker 将 pending 存储到 chrome.storage.local
7. Background worker 向内容脚本发送 `SHOW_TRACK_CONFIRM` 消息
8. 侧栏 Widget 自动打开，显示确认对话框，让用户选择"跟踪"或"忽略"
9. 用户确认后，Application 写入 IndexedDB（Dexie），状态为 "Applied"

**关键决策点**：
- 提交检测依赖按钮文本匹配，可能漏检或误检
- 用户可以选择忽略，此时 PendingApplication 保留在存储中，可在仪表盘查看

### 流程 4：申请跟踪管理

**用户为什么开始**：想查看所有投递的申请，了解哪些需要跟进。

**入口**：Popup → "跟踪仪表盘" 按钮 → 打开仪表盘页面

**步骤**：
1. 仪表盘页面显示 tracker tab
2. 默认显示看板视图（Kanban），按状态分组（Applied / Interview / Rejected）
3. 用户也可以切换到表格视图
4. 每条申请卡片显示：公司名、职位、投递日期、当前状态、跟进日期（如果有）
5. 用户可以：
   - 点击申请展开详情，查看薪酬、工作模式、填写的问答
   - 修改申请状态（下拉选择）
   - 添加跟进日期（日期选择器）
   - 添加备注
   - 删除申请
   - 搜索/筛选申请
6. 扩展的图标 badge 显示待跟进的申请数量（红色数字）

**状态**：
- 正常：显示申请列表
- 空数据：显示"暂无跟踪记录"提示
- 加载中：数据加载时

### 流程 5：AI 草拟答案

**用户为什么开始**：表单中有一个开放式问题（如"你为什么想加入我们公司？"），需要写一段回答。

**前提**：用户已在设置中配置了 OpenAI API Key。

**流程**：
1. 在侧栏 Widget 中切换到"答案" tab
2. 输入问题文本
3. 点击"AI 草拟答案"按钮
4. 请求发送到 background worker
5. Background worker 调用 OpenAI API，传入问题 + 用户 Profile 数据 + 职位描述（如果有）
6. 返回 AI 生成的答案
7. 用户可以复制答案，或点击"记住答案"存入答案记忆库

**关键决策点**：API Key 未配置时，AI 功能不可用，用户需要自行填写答案。

### 流程 6：Upwork 提案跟踪

**用户为什么开始**：在 Upwork 平台浏览和投递自由职业项目。

**前提**：当前页面是 Upwork 平台。

**流程**：
1. Widget 检测到 Upwork 页面，自动显示 "Upwork" tab
2. 用户点击"抓取当前页面"按钮
3. 扩展读取页面上的职位信息、提案表单字段
4. 自动填充提案金额、Connects 数量等经济指标
5. 用户可以在侧栏中更新提案状态（Submitted → Responded → Interview → ...）
6. 跟踪 Upwork 特有的统计：Connects 使用量、转化率等

### 流程 7：预览填充

**用户为什么开始**：不确定填充会覆盖哪些字段，想要先看看再决定是否执行。

**流程**：
1. 用户点击"预览填充"按钮
2. 内容脚本执行 dry-run 填充（匹配字段但不实际写入）
3. 页面中央出现预览弹窗，显示：
   - 预计填充率
   - 按模块统计（基本信息、联系方式、地址等）
   - 全部字段详情（每个字段的匹配状态和值）
4. 用户可以选择"确认填充"或"取消"
5. 确认后执行实际填充

---

## 五、页面地图

本扩展有 4 个独立页面/UI 表面，分布在不同的运行时环境中。

### 页面 1：Popup（弹窗）

**入口**：`entrypoints/popup/main.tsx`，渲染为 Popup HTML 页面

**存在目的**：提供快速操作的入口，无需打开完整仪表盘。

**用户来到这里时最想完成**：自动填充当前页面，或快速跳转到仪表盘。

**信息优先级**：
1. 品牌标题（"求职助手 · 自动填表台"）
2. 6 个操作按钮（自动填充、预览填充、打开侧面板、跟踪仪表盘、注入简历、清除简历）
3. 上次填充结果（如果有）
4. 状态文本（操作反馈）

**页面区域**（从上到下）：
- 顶部：标题栏（图标 + "求职助手 / 自动填表台"）
- 中部：6 个操作按钮，每个按钮包含图标 + 标题 + 副标题说明
- 次区域：上次填充结果按钮（条件渲染）
- 底部：状态文本区域

**主要操作**：
- 点击"自动填充当前页面"按钮
- 点击"预览填充"按钮
- 点击"打开侧面板"按钮
- 点击"跟踪仪表盘"按钮
- 点击"注入简历"按钮
- 点击"清除简历"按钮
- 点击"查看上次填充结果"按钮

**页面状态**：
- 正常：显示所有按钮
- 操作中：被点击的按钮显示 disabled，文字变为"正在..."
- 结果反馈：状态文本区域显示操作结果
- 无上次结果：不显示"查看上次填充结果"按钮

**进入方式**：点击浏览器工具栏的扩展图标。

**离开方式**：点击 Popup 外部区域（自动关闭），或点击"打开侧面板"/"跟踪仪表盘"（Popup 关闭，目标页面打开）。

### 页面 2：Options 仪表盘（`options.html`）

**入口**：`entrypoints/options/main.tsx`，渲染为独立页面

**存在目的**：完整的个人资料管理、申请跟踪、答案记忆和设置管理。

**用户来到这里时最想完成**：编辑资料、查看申请进度、管理设置。

**信息优先级**：
1. 顶部导航 tab（资料 | 跟踪器 | 答案 | 设置）
2. 当前 tab 的内容
3. 保存状态

**页面区域**：
- 顶部：导航栏（4 个 tab 按钮 + 标题"求职自动填表 + 跟踪器"）
- 内容区域：根据当前 tab 显示不同内容

**Tab 1：资料（Profile）**
- 存在目的：编辑用户个人资料
- 区域划分（从上到下）：
  - 基本信息 section（firstName、lastName、email、phone、phoneCountryCode）
  - 地址 section（line1、line2、city、state、country、postalCode）
  - 个人链接 section（LinkedIn、GitHub、portfolio、website）
  - 工作授权 section（usAuthorized、requiresSponsorship、visaStatus、englishProficiency）
  - 工作经历 section（可添加多条，每条含 title、company、start、end、highlights、stack）
  - 项目经历 section（可添加多条，每条含 name、description、role、start、end、highlights、stack、url）
  - 技能 section（键值对表格）
  - 教育背景 section（可添加多条，每条含 degree、school、year）
  - 人口统计 section（gender、race、veteran、disability）
  - 求职偏好 section（referralSource、desiredSalary、currentEmployer、currentTitle 等）
  - 补充答案知识 section（textarea）
  - 自我评价 section（textarea）
  - 导入简历按钮 + 智能添加按钮
- 状态：自动保存（550ms 防抖）

**Tab 2：跟踪器（Tracker）**
- 存在目的：查看和管理所有申请记录
- 区域划分：
  - 顶部：操作栏（搜索框、筛选器、视图切换 [看板/表格]、添加申请按钮、导出 CSV 按钮）
  - 主区域：看板视图（按状态分组）或表格视图（表格列：公司、职位、状态、日期、跟进）
  - 待处理申请栏（条件渲染，显示 PendingApplication）
- 状态：正常、空数据（"暂无跟踪记录"）、搜索无结果
- 进入方式：Popup 点击"跟踪仪表盘"、侧栏 Widget 点击"跟踪仪表盘"、自动跳转（从 PendingApplication）

**Tab 3：答案（Memory）**
- 存在目的：查看和管理已记忆的问答对
- 区域划分：列表（每个条目显示问题文本、答案、最后使用时间、编辑/删除按钮）

**Tab 4：设置（Settings）**
- 存在目的：配置扩展行为
- 区域划分：
  - 基本设置：演示模式开关、主题切换（light/dark）、跟踪录入模式（manual/ai）
  - AI 设置：API Key、Model 选择
  - 站点启用开关：Greenhouse、Lever、Ashby、LinkedIn
  - 中文字段映射字典：条目列表（每行：目标字段下拉选择 + 同义词输入框 + 开关 toggle），添加映射按钮，全部开启/全部关闭按钮

### 页面 3：侧栏 Widget（覆盖在页面右上角）

**入口**：`entrypoints/content/Widget.tsx`，通过 Shadow DOM 注入到页面

**存在目的**：在招聘页面内提供完整的自动填充和跟踪工具，无需离开当前页面。

**用户来到这里时最想完成**：在当前页面自动填充、查看匹配度、跟踪申请。

**信息优先级**：
1. 顶部操作按钮（与 Popup 相同的 6 个按钮）
2. 页面上下文信息（来源、公司、职位）
3. Tab 导航（匹配、自动填表、答案、Upwork、跟踪器、资料）
4. Tab 内容

**页面区域**：
- 头部：关闭按钮 + 页面信息（来源、角色、公司）
- 操作按钮栏：6 个按钮（与 Popup 一致）
- Tab 导航栏
- 内容区域：根据当前 tab 显示

**Tab 说明**：
- 匹配（Match）：显示技能匹配度评分（仅职位详情页可见）
- 自动填表（Autofill）：提示用户使用上方操作按钮进行填充
- 答案（Answer）：输入问题，AI 草拟或手动输入答案，可保存到记忆库
- Upwork：Upwork 特有的提案跟踪功能（仅 Upwork 页面显示）
- 跟踪器（Tracker）：快速查看和添加申请记录
- 资料（Profile）：快速编辑个人资料字段

**进入方式**：点击页面右侧的绿色浮动按钮（FAB），或键盘快捷键 Alt+J，或 Popup 点击"打开侧面板"。

**离开方式**：点击侧栏关闭按钮、按 Escape 键、点击侧栏外部区域。

### 页面 4：浮动通知组件（注入到页面）

**注入位置**：`entrypoints/content/index.tsx` 的 `injectFillNotification()` 和 `injectPreviewModal()`

**存在目的**：在页面内展示填充结果和预览确认。

**类型 A：填充结果通知条**
- 位置：页面右下角
- 内容：标题、填充率（大号数字）、统计标签（已填充/跳过/未匹配/无数据）、按模块展开详情、全部字段展开详情
- 行为：8 秒后自动淡出消失
- 可手动关闭

**类型 B：预览确认弹窗**
- 位置：页面中央（遮罩层）
- 内容：标题、预计填充率、统计标签、按模块统计、全部字段详情、取消/确认按钮
- 模态：阻止背景操作

### 页面 5：浮动侧边按钮（FAB）

**注入位置**：`entrypoints/content/index.tsx` 的 `injectFloatingFab()`

**存在目的**：提供侧栏 Widget 的快捷入口。

**行为**：
- 位置：页面右侧边缘，默认 top=200px
- 外观：绿色竖条，带文档图标 SVG
- 交互：可上下拖动、点击发送自定义事件打开 Widget、hover 时向右弹出 4px

---

## 六、导航与信息架构

### 全局导航

本扩展**没有传统意义上的全局导航**。它是一个浏览器扩展，由多个独立页面组成，页面之间通过消息传递切换：

1. **Popup** → 6 个按钮，每个按钮触发一个操作，部分操作会打开新页面
2. **Options 仪表盘** → 4 个 tab 导航（资料/跟踪器/答案/设置）
3. **侧栏 Widget** → 6 个操作按钮 + 6 个 tab 导航（匹配/自动填表/答案/Upwork/跟踪器/资料）

### 页面跳转关系

```
Popup
 ├── 自动填充 → 当前页面（不跳转，触发填充）
 ├── 预览填充 → 当前页面（不跳转，触发预览）
 ├── 打开侧面板 → 当前页面（不跳转，触发 Widget 打开）
 ├── 跟踪仪表盘 → Options 页面（新标签页打开）
 ├── 注入简历 → 不跳转，触发存储操作
 └── 清除简历 → 不跳转，触发存储操作

侧栏 Widget
 ├── 自动填充 → 当前页面（不跳转）
 ├── 预览填充 → 当前页面（不跳转）
 ├── 跟踪仪表盘 → Options 页面（新标签页打开）
 ├── 收起侧面板 → 关闭 Widget
 ├── 注入简历 → 不跳转
 └── 清除简历 → 不跳转

Options 页面
 ├── 资料 tab → 编辑 Profile
 ├── 跟踪器 tab → 管理 Applications
 │    └── 点击申请 → 展开详情
 ├── 答案 tab → 管理 AnswerMemory
 └── 设置 tab → 管理 Settings + CustomSynonyms
```

### 信息架构问题

【源码确定】以下问题存在：

1. **功能重复**：Popup 的 6 个操作按钮在侧栏 Widget 中完全重复。两个入口进入后看到的内容不同，但底层功能相同。

2. **导航层级扁平但混乱**：Options 页面有 4 个 tab，侧栏 Widget 有 6 个 tab，但两者有重叠（都有 tracker 和 profile）。Popup 没有 tab，只有按钮。

3. **设置分散**：同义词映射在 Options 的设置 tab 中管理，但字段映射的配置也在 `lib/customSynonyms.ts` 中。用户无法在不打开仪表盘的情况下配置映射。

4. **没有"首页"或"概览"**：用户打开仪表盘时默认看到 Profile 编辑，而不是一个聚合概览（如：有多少待跟进申请、最近填充了多少字段、资料完整度等）。

### 页面树

```
浏览器扩展
├── Popup（弹窗，~320px 宽）
│   └── 6 个操作按钮（自动填充 / 预览填充 / 打开侧面板 / 跟踪仪表盘 / 注入简历 / 清除简历）
│
├── Options 页面（仪表盘，全宽页面）
│   ├── 资料 tab（Profile 编辑器）
│   │   ├── 基本信息 section
│   │   ├── 地址 section
│   │   ├── 个人链接 section
│   │   ├── 工作授权 section
│   │   ├── 工作经历 section（可展开多条）
│   │   ├── 项目经历 section（可展开多条）
│   │   ├── 技能 section
│   │   ├── 教育背景 section
│   │   ├── 人口统计 section
│   │   ├── 求职偏好 section
│   │   ├── 补充知识 section
│   │   ├── 自我评价 section
│   │   └── 导入/智能添加按钮
│   ├── 跟踪器 tab
│   │   ├── 搜索/筛选/视图切换工具栏
│   │   ├── 看板视图（按状态分组）
│   │   ├── 表格视图（列表）
│   │   └── 待处理申请栏
│   ├── 答案 tab
│   │   └── 答案记忆列表
│   └── 设置 tab
│       ├── 基本设置
│       ├── AI 设置
│       ├── 站点启用开关
│       └── 中文字段映射字典（可增删改）
│
├── 侧栏 Widget（Shadow DOM，页面右侧滑出）
│   ├── 头部（页面信息 + 关闭按钮）
│   ├── 6 个操作按钮（与 Popup 相同）
│   ├── Tab 导航（匹配 / 自动填表 / 答案 / Upwork / 跟踪器 / 资料）
│   └── Tab 内容区域
│
├── 浮动通知条（页面右下角）
│   └── 填充结果详情
│
├── 预览弹窗（页面中央，模态）
│   └── 填充预览 + 确认/取消
│
└── 浮动 FAB（页面右侧边缘）
    └── 侧栏 Widget 入口
```

---

## 七、当前视觉系统分析

### 颜色

【源码确定，从三个 CSS 文件提取】

**Popup（`entrypoints/popup/styles.css`）**：
- 背景：`#ffffff`（白色）
- 主文字：`#0f172a`（深灰）
- 辅助文字：`#64748b`（中灰）
- 品牌色：`#059669`（绿色）— 按钮 hover 边框、标题栏图标
- 按钮边框：`#e2e8f0`（浅灰）
- 按钮 hover 背景：`#f0fdf4`（浅绿）
- 禁用状态：`#94a3b8`（灰）
- 状态文本：红色（错误）或绿色（成功）

**Options 仪表盘（`entrypoints/options/styles.css`）**：
- 背景：`#f8fafc`（浅灰）— 页面级
- 卡片背景：`#ffffff`（白色）
- 主文字：`#0f172a`
- 辅助文字：`#64748b`
- 品牌色：`#059669`（绿色）— 按钮、选中状态
- 危险色：`#dc2626`（红色）— 删除按钮
- 边框：`#e2e8f0`
- Tab 激活：`#059669` 文字 + `#05966915` 背景
- 输入框：`#f8fafc` 背景（浅灰）
- 输入框 focus：`#059669` 边框
- 表头：`#f1f5f9` 背景 + `#64748b` 文字

**Dark mode**：
- 背景：`#0f172a`
- 卡片：`#1e293b`
- 文字：`#f1f5f9`
- 输入框：`#1e293b` 背景 + `#334155` 边框
- Tab 激活：`#34d399` 文字

**侧栏 Widget（`entrypoints/content/widget.css`）**：
- 背景：`#ffffff`（白色）
- 主文字：`#0f172a`
- Tab 激活：`#059669` 底部边框（2px 实线）
- 操作按钮：`#059669` 背景（实心）
- FAB 按钮：`#059669` 背景 + 白色图标

**字体**：
- Popup：`system-ui, -apple-system, sans-serif`
- Options：`Inter, system-ui, sans-serif`（通过 `@import url('https://fonts.googleapis.com/css2?family=Inter:opsz@14..32&display=swap')` 引入）
- Widget：`system-ui, -apple-system, sans-serif`

### 字号层级

【源码确定，从 CSS 提取】

**Popup**：
- 标题（h1）：`15px` → `font-weight: 700`
- 按钮标题：`13px` → `font-weight: 600`
- 按钮副标题：`11px`
- 状态文本：`12px`

**Options**：
- 页面标题：`24px` → `font-weight: 700`
- Section 标题：`16px` → `font-weight: 600`
- 表单标签：`13px` → `font-weight: 600`
- 输入框文本：`13px`
- 辅助文字/hint：`12px` → `color: #64748b`
- Tab 按钮：`13px`
- 表格表头：`11px`
- 表格单元格：`13px`

**Widget**：
- 头部标题：`15px` → `font-weight: 700`
- 页面信息：`12px`
- 操作按钮：`13px`
- Tab 标签：`12px`
- 内容文本：`13px`

### 间距规律

【源码确定】不存在统一的间距系统。间距值分散：
- 常见的间距值：`4px`, `8px`, `12px`, `16px`, `20px`, `24px`, `32px`
- CSS 中没有使用 CSS 变量或统一间距 token
- 不同组件之间的间距不一致

### 圆角

- Popup：`12px`（容器）、`8px`（按钮）
- Options：`8px`（卡片、输入框、按钮）、`4px`（小元素）
- Widget：`8px`（抽屉头部）、`6px`（按钮）
- 浮动通知条：`12px`
- 预览弹窗：`16px`

### 边框

- 标准边框：`1px solid #e2e8f0`
- 输入框：`1px solid #e2e8f0`
- 按钮：`1px solid #e2e8f0`（或透明）
- 分割线：`<hr>` 默认样式或 `1px solid #e2e8f0`

### 阴影

- 卡片：`box-shadow: 0 1px 3px rgba(0,0,0,0.1)`（选项页）
- 浮动通知条：`0 8px 32px rgba(0,0,0,0.15)`
- 预览弹窗：`0 16px 48px rgba(0,0,0,0.2)`
- 悬浮按钮：`0 2px 8px rgba(0,0,0,0.15)`

### 卡片

Options 页面使用隐式卡片模式：每个 `<Section>` 组件包裹的内容块有独立背景（白色）、圆角（8px）、内边距（20px）和阴影。但 Section 之间没有视觉分隔，依赖 `hr` 分割线。

### 按钮

**类型**：
- 主要操作（Options 页面）：`#059669` 背景 + 白色文字 + 圆角 8px + 内外边距
- 次要操作（Options 页面）：白色背景 + 灰色边框 + 深色文字
- 危险操作（删除）：红色文字 + 透明背景
- 操作按钮（Popup/Widget）：白色背景 + 灰色边框 + 图标+文字组合

**状态**：
- 正常：完整样式
- hover：背景色/边框色变化（变化幅度小）
- disabled：灰色 + 降低不透明度

### 输入框

- 文本输入：`#f8fafc` 背景 + `#e2e8f0` 边框 + 8px 圆角
- 选择框：同上
- 文本区域：同上
- Focus 状态：`#059669` 边框
- 没有统一的 placeholder 样式

### 弹窗/Modal

- 预览弹窗：480px 宽 + 最大高度 90vh + 居中 + 遮罩层 + 16px 圆角 + 大阴影
- 关闭按钮：右上角，无背景，hover 时浅灰背景

### 动画/Transition

- Options 页面：无动画（静态页面）
- Popup：无动画
- Widget：`transition: right 0.2s ease`（FAB hover 弹出）
- 浮动通知条：`animation: jaf-fade-in 0.3s ease` + `opacity 0.5s` 淡出
- 预览弹窗：`animation: jaf-fade-in 0.2s ease`
- 开关 toggle：`transition: background 0.2s` + `transform 0.2s`

### 图标

- 使用 `lucide-react` 图标库（`@version 1.22.0`）
- 图标大小：13px、15px、16px、17px（具体值取决于上下文）
- 图标颜色：继承父元素文字颜色或使用 `currentColor`

### 响应式

**不支持响应式**。Options 页面、Popup、Widget 都有固定宽度或未考虑响应式布局。

### 明暗主题

通过 CSS 变量实现（`[data-theme="dark"]` 选择器），覆盖的颜色较少，主要覆盖背景色和边框色。Options 页面和 Popup 支持主题切换，Widget 也支持（通过 `data-theme` 属性）。

### 视觉系统总结

| 维度 | 评价 |
|------|------|
| 一致性 | 中低 — 三个 CSS 文件各自定义，缺乏统一 token |
| 层级 | 低 — 稀疏的间距、接近的灰度、缺乏视觉节奏 |
| 品牌感 | 有 — 绿色（#059669）作为主色调贯穿，但应用不充分 |
| 可访问性 | 未考虑 — 无 focus 样式、颜色对比度未验证 |
| 动效 | 极少 — 仅有 FAB hover 和通知条淡入淡出 |
| 响应式 | 不支持 |
| 主题 | 支持基本的 light/dark 切换 |

---

## 八、交互与动效分析

### 现有动效清单

| 动效 | 触发条件 | 动画内容 | 功能/装饰 | 源码位置 |
|------|----------|----------|-----------|----------|
| FAB 右侧弹出 | hover | `right: 0 → 4px`，`transition: 0.2s` | 功能（让用户知道可点击） | `entrypoints/content/index.tsx` 第 122-123 行 |
| FAB 拖拽 | mousedown/move/up | 跟随鼠标 Y 轴移动 | 功能（用户可调整位置） | 同上，第 125-148 行 |
| 通知条淡入 | 填充完成 | `animation: jaf-fade-in 0.3s` | 功能（平滑出现） | 同上，第 172 行 |
| 通知条淡出 | 8 秒后 | `opacity 1 → 0`，`transition: 0.5s` | 功能（自动消失） | 同上，第 249-254 行 |
| 预览弹窗淡入 | 预览触发 | `animation: jaf-fade-in 0.2s` | 功能（平滑出现） | 同上，第 271 行 |
| 开关 toggle | 点击 | 滑块平移，背景色切换 | 功能（状态切换反馈） | `entrypoints/options/styles.css` 第 1525-1550 行 |
| 按钮 hover | 鼠标悬停 | 背景色/边框色变化 | 功能（可点击提示） | 多个 CSS 文件 |

### 动效分析

**结论**：当前动效极少，且全部承担明确的功能角色（告知状态变化、提供操作反馈）。没有装饰性动效。

**缺失的交互反馈**：
- 填充操作中没有进度指示（只有一个 loading 状态文本）
- 页面切换（tab 切换）无过渡动画
- 列表展开/折叠无动画
- 添加/删除条目无动画
- 弹窗打开/关闭无缩放或滑动动画

---

## 九、技术实现边界

### 框架与版本

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 19.2.7 | UI 框架 |
| TypeScript | 6.0.3 | 开发语言 |
| WXT | 0.20.27 | 浏览器扩展构建框架 |
| Vite | 7.3.6 | 构建工具 |
| Tailwind CSS | 4.3.2 | CSS 工具库（已安装但实际代码中未使用） |
| Dexie | 4.4.4 | IndexedDB 封装 |
| fuse.js | 7.4.2 | 模糊搜索 |
| lucide-react | 1.22.0 | 图标库 |

### 构建工具

WXT + Vite。构建配置在 `wxt.config.ts` 中。

### UI 组件库

**无**。所有 UI 组件均为手写（从零编写），没有使用任何组件库。Alert 使用原生 `<details>/<summary>` HTML 元素。

### CSS 方案

纯 CSS 文件（3 个，分别对应 Popup、Options、Widget），每个约 700-1600 行。Tailwind 已安装但**未在实际代码中使用**（`wxt.config.ts` 第 23 行引入了 tailwindcss 插件，但样式文件中没有使用任何 Tailwind 类）。

### Icon 方案

lucide-react（`@version 1.22.0`）。使用 20+ 个图标：`BriefcaseBusiness`、`Wand2`、`Eye`、`PanelRightOpen`、`LayoutDashboard`、`UserPlus`、`UserX`、`ScrollText`、`Plus`、`Trash2`、`X`、`Save`、`Download`、`Upload`、`Search`、`ListFilter`、`ChevronDown`、`ChevronRight`、`FileText`、`KeyRound`、`CalendarClock`、`MapPin`、`Building2`、`Sparkles`、`UserRound` 等。

### 图表库

无。

### 动画库

无。所有动效使用原生 CSS transition/animation。

### 状态管理

**无状态管理库**。使用 React 的 `useState` + `useEffect` 管理组件级状态。跨组件状态通过 `chrome.storage.onChanged` 事件同步（Options 页面监听 storage 变化重新加载数据）。

### 路由

无路由库。Options 页面通过 `useState` 切换 tab（`"profile" | "tracker" | "memory" | "settings"`）。

### 已有可复用组件

- `Section`（Options 页面）：标题 + 提示文本 + 包裹内容的容器
- `ErrorBoundary`（Widget）：错误边界

### 浏览器/设备限制

- Chrome MV3 扩展（`manifest_version: 3`）
- 内容脚本在 Shadow DOM 中渲染（`cssInjectionMode: "ui"`）
- 所有页面匹配 `https://*/*` 和 `http://*/*`
- 扩展 API 权限：`storage`、`unlimitedStorage`、`activeTab`、`downloads`、`scripting`、`alarms`

### 响应式情况

不支持响应式。

### 改造成本评估

| 改造内容 | 成本 | 说明 |
|----------|------|------|
| 更换颜色/字体 | 低 | 在 3 个 CSS 文件中替换即可 |
| 添加间距系统 | 中 | 需要引入 CSS 变量，逐个组件替换 |
| 添加动效 | 低 | 添加 CSS transition/animation |
| 组件化重构 | 高 | 当前无组件库，所有 UI 手写，需要重新组织结构 |
| 引入组件库 | 高 | 需要替换所有手写组件 |
| 响应式支持 | 高 | 需要重新设计布局 |
| 修复信息架构 | 中 | 统一 Popup 和 Widget 的入口逻辑 |
| 添加 Tailwind 使用 | 中 | 需要将现有 CSS 迁移到 Tailwind 类 |

---

## 十、未知信息

以下问题无法从源码确定，但会影响 UI/UX 重新设计：

1. **目标用户的市场范围**：代码同时支持中英文，但不确定用户主要面向中国市场还是国际市场。这会决定设计语言（中文 vs 英文优先、配色偏好等）。

2. **用户平均使用频率**：无法确定用户是每天使用多次还是偶尔使用。这影响操作路径的快捷性设计。

3. **用户偏好的浏览器**：Chrome/Edge/Brave 等 Chromium 浏览器。但不确定用户主要使用桌面端还是移动端。

4. **用户是否实际使用 AI 功能**：AI 功能需要用户自备 OpenAI API Key，不确定有多少用户实际配置和使用。这影响 AI 相关 UI 的优先级。

5. **用户是否使用 Upwork**：Upwork 功能只对自由职业者有用。不确定用户是否属于这个群体。

6. **用户期望的扩展窗口大小**：Popup 和 Widget 的尺寸目前固定，不确定用户期望的尺寸。

7. **品牌需求**：不确定是否有品牌色、Logo 等品牌资产需要融入设计。

8. **用户期望的"仪表盘"的核心数据**：不确定用户打开仪表盘最想看到什么（待跟进数量？填充统计？申请进度？）。

---

## 十一、交接摘要

> 以下摘要供 UI/UX 设计 AI 快速建立心智模型。

### 产品是什么

**求职自动填表 + 跟踪器**，一个 Chrome 浏览器扩展。

**一句话**：用户在一个地方保存个人资料，扩展自动识别招聘网站表单并填充，投递后自动跟踪申请进度。

### 用户是谁

求职者（中英文市场），需要在多个招聘平台投递申请并管理投递进度。

### 核心目标

1. **一键填充** — 替代手动重复填写表单
2. **申请跟踪** — 管理所有投递的状态和跟进
3. **资料管理** — 维护个人资料作为填充数据源

### 核心对象

| 对象 | 说明 | 用户操作 |
|------|------|----------|
| Profile | 个人资料（50+ 字段） | 编辑、导入、清除 |
| Application | 申请记录（7 种状态） | 查看、添加、修改状态、删除、导出 CSV |
| AnswerMemory | 答案记忆缓存 | 查看、删除、AI 草拟 |
| PendingApplication | 待确认申请 | 确认跟踪、忽略 |
| CustomSynonymEntry | 字段映射规则 | 添加、编辑、开关、批量开关 |
| Settings | 扩展配置 | 修改主题、API Key、模式等 |

### 核心工作流（按优先级）

1. **自动填充**：打开招聘页面 → 点击 Popup/Widget 的"自动填充" → 扩展检测表单 → 匹配字段 → 填充数据 → 显示结果通知条
2. **申请跟踪**：提交申请后 → 扩展自动检测 → 弹出确认对话框 → 用户确认 → 写入跟踪列表
3. **资料管理**：打开仪表盘 → 编辑资料字段 → 自动保存 → 回到招聘页面 → 使用更新的资料填充
4. **预览填充**：点击"预览填充" → 显示匹配预览弹窗 → 确认或取消 → 执行填充或放弃

### 页面结构

```
Popup（~320px 宽弹窗）→ 6 个操作按钮 + 状态文本
Options 页面（全宽仪表盘）→ 4 个 tab: 资料 | 跟踪器 | 答案 | 设置
侧栏 Widget（页面右侧 Shadow DOM）→ 6 个操作按钮 + 6 个 tab
浮动通知条（页面右下角）→ 填充结果（8 秒自动消失）
预览弹窗（页面中央模态）→ 填充预览 + 确认/取消
FAB（页面右侧边缘）→ 绿色可拖动按钮，Widget 入口
```

### 当前视觉特征

- 主色调：绿色 `#059669`（品牌色 + 激活态）
- 背景：白色（卡片）/ 浅灰 `#f8fafc`（页面级）
- 文字：深灰 `#0f172a`（主）/ 中灰 `#64748b`（辅）
- 圆角：8px（标准）/ 12px（弹窗）/ 16px（预览弹窗）
- 字体：Inter（Options）/ system-ui（Popup、Widget）
- 图标：lucide-react
- 主题：支持 light/dark
- 动效：极简（仅 FAB hover、通知条淡入淡出、toggle 开关）
- 响应式：不支持

### 当前主要 UX/UI 问题

1. **信息架构不一致**：Popup 和 Widget 显示不同的功能入口，但底层功能相同
2. **视觉缺乏层次**：间距稀疏、灰度接近、缺乏视觉节奏
3. **无组件库**：所有 UI 手写，3 个 CSS 文件各自独立，缺乏统一 token
4. **无动效反馈**：填充、切换、展开折叠等操作无过渡动画
5. **无响应式**：固定宽度，不考虑不同屏幕尺寸
6. **设置分散**：同义词映射在仪表盘设置中，但用户可能不知道这个功能存在
7. **无概览首页**：仪表盘默认打开 Profile 编辑，而不是一个聚合仪表盘

### 技术边界

- React 19 + TypeScript 6 + WXT 0.20.27（MV3 扩展框架）
- 纯 CSS 手写样式（Tailwind 已安装但未使用）
- 无 UI 组件库、无路由库、无状态管理库
- 数据存储在 `chrome.storage.local` + IndexedDB（Dexie）
- 内容脚本在 Shadow DOM 中渲染
- 不支持响应式
- 改造成本：更换颜色/字体/动效（低），组件化重构（高），引入组件库（高）

### 最大未知信息

- 目标市场（中国 vs 国际），影响设计语言选择
- 用户是否使用 AI 功能 / Upwork 功能
- 用户期望的仪表盘首页核心数据
- 是否有品牌资产需要融入