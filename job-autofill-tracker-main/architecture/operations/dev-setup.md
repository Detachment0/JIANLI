# 本地开发环境搭建指南

> AS-IS 状态说明：本文档基于项目当前实际配置编写（`package.json`、`wxt.config.ts`、`tsconfig.json`、`README.md`）。所有命令均来自 `package.json` 的 `scripts` 字段，未做任何臆测。

## 1. 前置要求

- [Node.js](https://nodejs.org/)（推荐 v18 或更高版本）
- [npm](https://www.npmjs.com/)（通常随 Node.js 一同安装）

项目当前实际使用的核心依赖版本（见 `package.json`）：

| 依赖 | 版本 |
| --- | --- |
| typescript | 6.0.3 |
| vite | 7.3.6 |
| react / react-dom | 19.2.7 |
| wxt | 0.20.27 |
| @wxt-dev/module-react | 1.2.2 |
| @vitejs/plugin-react | 5.2.0（已声明，但 `wxt.config.ts` 中未启用，详见故障诊断） |
| tailwindcss / @tailwindcss/vite | 4.3.2 |

## 2. 安装依赖

```powershell
npm install
```

说明：`package.json` 中配置了 `postinstall: wxt prepare`，安装完成后会自动调用 WXT 生成 `.wxt/` 下的类型文件（如 `.wxt/types/imports.d.ts`、`.wxt/wxt.d.ts`）。`tsconfig.json` 通过 `extends: "./.wxt/tsconfig.json"` 依赖这些生成文件，因此首次必须执行 `npm install` 以触发 `wxt prepare`。

## 3. TypeScript 类型检查（静态验证）

```powershell
npm run compile
```

实际命令：`tsc --noEmit`。

> 这是项目唯一的静态验证命令。项目**没有**配置 `lint` 命令，也**没有**配置 `test` 命令（见 `package.json` 的 `scripts` 字段，仅包含 `dev`、`build`、`zip`、`compile`、`postinstall` 五项）。

## 4. 开发模式

```powershell
npm run dev
```

实际命令：`wxt`。

WXT 会启动热重载开发服务器，并自动打开浏览器加载扩展。开发产物输出到 `.output/chrome-mv3-dev/`。

## 5. 生产构建

```powershell
npm run build
```

实际命令：`wxt build`。

WXT 生产构建，产物输出到 `.output/chrome-mv3/`。

## 6. 打包发布

```powershell
npm run zip
```

实际命令：`wxt zip`。

将构建产物打包为 `.zip` 文件，用于发布。

## 7. 在浏览器中加载扩展

### 开发模式

1. 打开 Chrome 或 Edge，访问 `chrome://extensions`（Edge 为 `edge://extensions`）。
2. 开启"开发者模式"。
3. 点击"加载已解压的扩展程序"。
4. 选择项目目录下的 `.output/chrome-mv3-dev/` 文件夹。

### 生产模式

1. 先执行 `npm run build` 生成生产产物。
2. 重复上述步骤，但选择 `.output/chrome-mv3/` 文件夹。

## 8. 验证命令清单

| 用途 | 命令 | 说明 |
| --- | --- | --- |
| 类型检查 | `npm run compile` | 项目唯一的静态验证命令（`tsc --noEmit`） |
| Lint | （无） | 项目未配置 lint 命令 |
| 单元测试 | （无） | 项目未配置 test 命令 |

如 `.wxt/` 类型文件缺失或过期导致类型检查报错，可手动执行以下命令重新生成：

```powershell
npx wxt prepare
```

## 9. 安全检查（可选）

发布前建议执行依赖安全审计（README 中提到的建议，非 `scripts` 内置命令）：

```powershell
npm audit
npm audit --omit=dev
```

`package.json` 的 `overrides` 字段（`shell-quote`、`tmp`、`uuid`、`wxt` 下的 `esbuild`）仅用于修补有安全问题的过渡性依赖。
