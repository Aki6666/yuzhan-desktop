# 语栈（Yuzhan）

公务员考试 · 言语理解成语积累桌面应用（v0.1 MVP）。

> 需求与设计的唯一事实来源：`PLAN.md`（信息架构 §3 / 技术架构 §4 / 数据模型 §5 / MVP §7 / 快速输入 §10 / 执行计划 §14）。

## 技术栈

- Electron + electron-vite（Vue 3 + TypeScript 严格模式）
- Naive UI + Pinia + vue-router
- pinyin-pro（检索）、ajv（schema 校验）、electron-log（日志）
- Vitest（T0 起）+ electron-builder NSIS 打包

## 开发

```bash
pnpm install        # 首次（.npmrc 已配置镜像与 hoisted 布局）
pnpm dev            # 启动开发（HMR）
pnpm typecheck      # 双 tsconfig 类型检查
pnpm build          # typecheck + electron-vite build
pnpm build:win      # NSIS 安装包（T9）
```

## 安全基线（贯穿版本）

- 窗口 `contextIsolation: true` + `sandbox: true` + `nodeIntegration: false`
- preload 只暴露白名单 API，不透传 `ipcRenderer`
- IPC 统一信封 `{ ok, data } | { ok, error }`，契约单一权威源 `shared/ipc/contracts.ts`
- userData 写入铁律：原子写 / `.bak` 回退 / 写队列 / 单实例锁（§4.5 / §10.3）

## 目录结构

```
src/main/      主进程（window / ipc / store / settings / logger）
src/preload/   contextBridge 白名单
src/renderer/  Vue3 应用（views / router / stores）
shared/        双端共用（schema + IPC 契约 + 纯函数，T2a/T3 落地）
data/          正式库（只读，打包进 asar，T2a/T2b 落地）
```

## 隐私

本地优先：学习数据不出本机，无云同步（PLAN.md §2 非功能需求）。
