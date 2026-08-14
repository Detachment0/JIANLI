# ADR 001：选择 WXT 作为 Chrome Extension 构建框架

- **状态**：Accepted（已接受）
- **日期**：项目初始化时
- **AS-IS**：当前代码实际使用的方案

## 上下文（Context）

本项目是一个 Chrome Extension（MV3），需要支持以下能力：

- 使用 React + TypeScript 编写 UI（Popup、Options 仪表盘、Content Script 侧面板 Widget）
- 支持开发期热重载（HMR），加速迭代
- 生成符合 Manifest V3 规范的产物
- 在 Content Script 中通过 Shadow DOM 渲染隔离的 UI
- 集成 Tailwind CSS

Chrome Extension 的构建与普通 Web 应用不同：需要处理 manifest 生成、多入口（background service worker / content script / popup / options）、content script 的样式隔离、以及 MV3 对 service worker 的限制。手动配置 Webpack/Vite 工作量大且易错。

## 决策驱动因素（Decision Drivers）

1. **开发体验**：是否提供开箱即用的热重载、TypeScript 支持、浏览器自动打开。
2. **React 支持**：是否能无缝集成 React，无需手动配置 `@vitejs/plugin-react`。
3. **MV3 兼容性**：是否原生支持 Manifest V3，自动处理 service worker、权限、host_permissions。
4. **Shadow DOM 支持**：Content Script 的 UI 是否能方便地挂载在 Shadow DOM 中实现 CSS 隔离。
5. **配置简洁性**：是否能在最少的配置文件中完成 manifest 与构建配置。

## 备选方案（Considered Options）

### 选项 A：WXT（https://wxt.dev）

基于 Vite 的 Chrome Extension 框架，提供 `defineBackground` / `defineContentScript` 等全局函数与 `entrypoints/` 目录约定。

### 选项 B：CRXJS（@crxjs/vite-plugin）

Vite 插件，专注于 manifest 处理，不提供框架级约定。

### 选项 C：手动 Webpack 配置

从零配置 Webpack + manifest.json，手动处理多入口与产物结构。

### 选项 D：Plasmo

类似 Next.js 的 Extension 框架，提供约定式路由与 API 层。

## 决策（Decision）

选择 **WXT**（选项 A）。

`wxt.config.ts` 中通过 `modules: ["@wxt-dev/module-react"]` 启用 React 支持，`manifest` 字段直接声明扩展元数据。

## 理由（Why）

1. **内置 React 模块**：`@wxt-dev/module-react` 已内置 React 支持，无需在 `vite.plugins` 中重复添加 `@vitejs/plugin-react`（重复添加会导致 esbuild 变量重复声明崩溃，见 AGENTS.md Global Invariants 第 8 条）。
2. **自动热重载**：`npm run dev` 自动监听文件变化、重新加载扩展、打开浏览器，无需额外配置。
3. **Shadow DOM UI 支持**：`createShadowRootUi` API 让 Content Script 的 Widget 能轻松挂载在 Shadow DOM 中，实现 CSS 隔离（项目 Widget UI 即采用此方式，样式文件为 `entrypoints/content/widget.css`）。
4. **简洁的配置**：`wxt.config.ts` 一个文件同时声明 manifest（name / permissions / host_permissions / commands / action）与 Vite 插件（Tailwind），结构清晰。
5. **约定式入口**：`entrypoints/` 目录约定（background / content / popup / options）自动映射为 manifest 入口，减少手动维护。

## 后果（Consequences）

### 好处

- 开发体验好，热重载与浏览器自动打开开箱即用。
- 自动处理 MV3 复杂性（service worker 注册、content script 注入、manifest 生成）。
- Shadow DOM 隔离简化了 Content Script UI 的样式管理。

### 代价

- 依赖 WXT 的特定约定：
  - 必须使用 `entrypoints/` 目录结构组织入口。
  - 必须使用 `defineBackground` / `defineContentScript` 等全局函数（由 WXT 注入，无需显式 import）。
  - 这些全局函数在 TypeScript 中由 WXT 的类型声明提供，迁移到其他框架需重写。
- 构建产物落在 `.output/` 目录（`chrome-mv3-dev` / `chrome-mv3`），由 WXT 管理。
- 升级 WXT 大版本可能引入 breaking change，需关注迁移指南。

## 相关文件（Related）

- `wxt.config.ts` — WXT 构建配置与 Chrome Manifest 声明
- `.wxt/` 目录 — WXT 生成的类型声明与临时文件（开发期产物）
- `entrypoints/background.ts` — `defineBackground` 使用示例
- `entrypoints/content/` — `defineContentScript` 与 `createShadowRootUi` 使用示例
- `AGENTS.md` — Global Invariants 第 8 条（不要重复添加 React 插件）
