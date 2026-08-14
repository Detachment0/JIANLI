# 统一同义词字典为 UI 可配置的 customSynonyms

## 变更类型
- [x] 重构
- [x] 功能修改

## 变更内容

### 背景
原来有两个同义词字典文件：
- `lib/synonyms.ts` — 硬编码（编译时确定），同时包含英文和中文同义词
- `lib/customSynonyms.ts` — 可通过仪表盘 UI 修改，只包含中文同义词

两者职责重叠，且 `mapping.ts` 中 `synonyms.ts` 优先级高于 `customSynonyms.ts`，导致用户通过 UI 添加的自定义映射几乎无法生效。

### 改动

1. **删除 `lib/synonyms.ts`**
2. **合并所有英文同义词到 `lib/customSynonyms.ts` 的 `DEFAULT_CUSTOM_SYNONYMS`**
   - 每个字段的 `synonyms` 数组现在同时包含英文和中文同义词
   - 去除重复项，中英文合并
   - 新增 `cs-accommodation-detail` 条目（对应 `applicationDefaults.recruitmentAdjustmentsDetails`，之前遗漏）
3. **简化 `lib/mapping.ts` 中的 `deterministicValue()`**
   - 去掉两层查询（先查 SYNONYMS，再查 customSynonyms）
   - 统一为：从 `loadCustomSynonyms()` 加载字典 → 匹配 → 填充

### 最终架构

```
lib/customSynonyms.ts（唯一字典）
  ├── DEFAULT_CUSTOM_SYNONYMS（38 个字段，中英文合并）
  ├── loadCustomSynonyms()（从 chrome.storage.local 加载）
  └── saveCustomSynonyms()（保存到 chrome.storage.local）
        ↑
  仪表盘设置页面 UI（可增删改）
```

## 验证
- [x] `npm run compile` 通过
- [x] `npm run build` 构建成功

## 影响范围
- `lib/synonyms.ts` → 已删除
- `lib/customSynonyms.ts` → 重写（合并英文同义词）
- `lib/mapping.ts` → 简化字典查询逻辑