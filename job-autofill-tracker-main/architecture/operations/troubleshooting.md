# 常见故障诊断

> AS-IS 状态说明：本文档基于项目当前代码实际行为编写，引用的函数名、文件路径、错误信息均来自源码。`wxt.config.ts` 当前配置已是正确状态（仅使用 `@wxt-dev/module-react`），下方第 1 项描述的是误配置后的排查与修复方法。

## 1. 弹出窗口（Popup）闪退 / 空白

- **症状**：点击工具栏图标后弹出窗口空白，或控制台报 React Fast Refresh 相关的重复注入错误（如 `__REACT_DEVTOOLS_GLOBAL_HOOK__`、HMR 边界相关错误）。
- **原因**：`wxt.config.ts` 中同时启用了 `@wxt-dev/module-react`（通过 `modules`）和 `@vitejs/plugin-react`（通过 `vite.plugins`），导致 React Fast Refresh 被重复注入。
- **解决**：移除 `@vitejs/plugin-react`，只保留 `@wxt-dev/module-react`。

  当前正确配置参考 `wxt.config.ts`：

  ```ts
  modules: ["@wxt-dev/module-react"],
  vite: () => ({
    plugins: [tailwindcss()]
  })
  ```

  > 注意：`package.json` 的 `devDependencies` 中仍声明了 `@vitejs/plugin-react`，但只要不在 `vite.plugins` 中引用即不会触发该问题。

## 2. Content Script 未加载

- **症状**：Background 向 Content Script 发送消息时抛出 `"Receiving end does not exist"`。
- **原因**：
  - 当前活动标签页不是已知的求职网站（内容脚本未匹配注入）；或
  - 内容脚本尚未完成注入（页面刚加载、扩展刚安装/刷新）。
- **解决**：Background 的 `sendMessageToTabWithInjection()`（位于 `entrypoints/background.ts`，定义于第 209 行，调用点在第 101、206 行）会捕获该错误，自动通过 `chrome.scripting` 注入 `content.js` 并重试发送，无需手动干预。

  错误识别逻辑位于 `entrypoints/background.ts` 第 25 行与第 214 行：

  ```ts
  if (!detail.includes("Receiving end does not exist")) throw error;
  ```

## 3. AI 功能不工作

- **排查步骤**：
  1. 检查 Settings 中的 OpenAI API Key 是否已设置（存储在 `chrome.storage.local`）。
  2. 检查网络是否能访问 `https://api.openai.com`（`wxt.config.ts` 的 `host_permissions` 中已声明 `https://api.openai.com/*`）。
  3. 确认是否处于 Demo Mode：Demo Mode 下 AI 功能可用，但所有写操作被短路，不持久化到真实存储（见 `lib/demo.ts`）。

## 4. 数据不跨标签页 / 上下文同步

- **症状**：在 Options 页或 Popup 中修改了数据，Content Script 的侧面板未刷新；或反之。
- **原因**：Dexie（IndexedDB）的变更事件不跨扩展上下文（Background / Content Script / Options / Popup 是独立上下文）。
- **解决**：项目通过 `applicationsRev` 计数器实现跨上下文同步。该计数器定义于 `lib/storage.ts`（`APPLICATIONS_REV_KEY = "applicationsRev"`），存储在 `chrome.storage.local`。Application 表每次变更时递增，其他上下文监听 `chrome.storage.onChanged` 后触发刷新。

## 5. Shadow DOM 样式问题

- **说明**：JobTracker Widget 的 UI 渲染在 Shadow DOM 中，宿主页面的 CSS 不会影响 Widget 内部样式，实现 CSS 隔离。
- **样式定义位置**：`entrypoints/content/widget.css`。
- **排查建议**：若 Widget 样式异常，应检查 `entrypoints/content/widget.css`，而非宿主页面样式表。Widget 主体组件为 `entrypoints/content/Widget.tsx`，挂载逻辑在 `entrypoints/content/index.tsx`。

## 6. TypeScript 编译错误

- **排查步骤**：
  1. 运行 `npm run compile`（即 `tsc --noEmit`）查看完整错误。
  2. 如果错误集中在 `.wxt/` 目录下的类型文件（如 `.wxt/types/imports.d.ts`、`.wxt/wxt.d.ts`），通常是 WXT 生成文件缺失或过期。
  3. 执行以下命令重新生成类型文件：

     ```powershell
     npx wxt prepare
     ```

  4. 重新运行 `npm run compile` 确认错误已消除。

- **注意**：`tsconfig.json` 通过 `extends: "./.wxt/tsconfig.json"` 继承 WXT 生成的配置，因此 `.wxt/` 必须存在且与 `entrypoints/`、`wxt.config.ts` 保持同步。
