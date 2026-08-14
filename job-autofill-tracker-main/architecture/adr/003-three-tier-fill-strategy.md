# ADR 003：三层填充策略

- **状态**：Accepted（已接受）
- **日期**：项目初始化时
- **AS-IS**：当前代码实际使用的方案

## 上下文（Context）

自动填充求职申请表单是扩展的核心功能。表单字段类型多样（文本、文本域、下拉、单选、复选框、文件、超链接、确认项），且不同 ATS（Greenhouse / Lever / Ashby / LinkedIn）的字段标签各异。填充策略需要在以下目标间取得平衡：

- **准确性**：填入的值必须正确对应字段语义。
- **速度**：填充应即时完成，不应让用户等待。
- **API 成本**：AI 调用按 token 计费，频繁调用成本高且依赖网络。
- **用户控制**：用户应能复用已批准的答案，并对不确定的填充保持控制。

## 决策驱动因素（Decision Drivers）

1. **准确性**：确定性匹配优先，避免 AI 幻觉导致的错误填充。
2. **速度**：本地匹配应毫秒级完成，不阻塞用户。
3. **API 成本**：尽量减少 OpenAI API 调用次数与 token 消耗。
4. **用户控制**：允许用户通过"记忆答案"机制复用已批准的答案，逐步积累个人化答案库。

## 备选方案（Considered Options）

### 选项 A：纯规则匹配

仅使用 `SYNONYMS` 同义词表做确定性匹配，未匹配字段留给用户手动填写。

### 选项 B：纯 AI

所有字段均通过 OpenAI API 由模型决定填入值。

### 选项 C：混合策略（三层）

确定性匹配 → 记忆答案模糊匹配 → AI（最后手段）。

## 决策（Decision）

选择 **三层策略**（选项 C）：`profile` 确定性匹配 → `memory` 模糊匹配 → AI（未来）。

当前代码实现前两层，AI 层作为兜底手段（`FieldFill.source` 已预留 `"ai"` 值，但 `MAP_FIELDS` 处理中尚未调用 AI 填充）。

实现位置：
- `entrypoints/content/engine.ts` 的 `fillCurrentForm()` 中先调用 `directProfileFill(field, profile)` 做本地确定性填充，未命中字段再通过 `MAP_FIELDS` 消息发给 Background。
- `entrypoints/background.ts` 的 `MAP_FIELDS` 分支对每个字段依次调用 `lib/mapping.ts` 的 `deterministicValue(field, profile)` 与 `memoryValue(field, demoMode)`。

## 理由（Why）

1. **确定性匹配最快且零成本**：`deterministicValue()` 仅做字符串归一化与 `SYNONYMS` 包含检查，毫秒级完成，不消耗 API 额度。对于姓名、邮箱、电话、地址等标准字段，准确率极高（confidence = 0.94）。
2. **记忆答案复用已批准的答案**：`memoryValue()` 先按 `questionHash` 精确匹配（confidence = 1），命中则直接复用；未命中再用 `Fuse.js` 模糊匹配（threshold = 0.28，confidence = 0.82）。这层让用户对重复性筛选问题（如"是否需要签证赞助"）只需回答一次，后续自动复用，兼顾准确与个性化。
3. **AI 作为最后手段**：仅当前两层均未命中时才考虑调用 AI，最大限度减少 API 成本与延迟。`FieldFill.source` 类型已预留 `"ai"`，未来扩展无需改动数据契约。
4. **法律确认字段永不自动填充**：`AutofillReviewStatus` 包含 `"confirmation"` 状态，条款确认字段只标记不填充，强制用户手动操作（见 AGENTS.md Global Invariants 第 7 条）。

## 后果（Consequences）

### 好处

- **大部分字段零 API 成本**：标准字段（身份、联系方式、工作授权、人口统计、申请默认值）由确定性匹配覆盖，无需调用 AI。
- **速度快**：本地匹配无网络往返，用户体验流畅。
- **答案库自积累**：用户每次批准的答案通过 `REMEMBER_ANSWER` 入库，后续申请自动复用，越用越准。
- **用户控制强**：未匹配字段返回 `source` 为未填，由用户在 `AutofillReviewItem` 审查界面手动处理。

### 代价

- **同义词表需维护**：`lib/synonyms.ts` 的 `SYNONYMS` 是字段映射的 Source of Truth，新增 `CanonicalField` 必须同步添加同义词，否则该字段无法被确定性匹配（TypeScript 的 `Record<CanonicalField, string[]>` 强制完整性，但同义词内容需人工维护）。
- **未匹配字段需用户手动处理**：对于同义词表未覆盖的字段（如公司特定自定义问题），前两层均未命中时会落入 AI 层或留给用户手动填写，影响自动化程度。
- **记忆答案可能含占位符**：`answerHasPlaceholder()` 检测 `[todo` / `todo:` 占位符并跳过，但依赖答案文本规范，需用户维护答案库质量。
- **AI 层尚未实现**：当前 `MAP_FIELDS` 处理中未调用 AI 填充，未匹配字段直接返回未填，未来需补充 AI 兜底逻辑并处理成本与延迟。

## 相关文件（Related）

- `lib/mapping.ts` — `deterministicValue` / `memoryValue` / `rememberAnswer` 实现
- `lib/synonyms.ts` — `SYNONYMS` 同义词映射（确定性匹配的 Source of Truth）
- `lib/schema.ts` — `CanonicalField` 类型定义、`FieldFill.source` 枚举值
- `entrypoints/content/engine.ts` — `directProfileFill` 本地填充与 `fillCurrentForm` 流程编排
- `entrypoints/background.ts` — `MAP_FIELDS` 消息处理（两层匹配调用点）
- `architecture/contracts/message-protocol.md` — `MAP_FIELDS` / `REMEMBER_ANSWER` 消息契约
