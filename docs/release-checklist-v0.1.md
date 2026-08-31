# 语栈 v0.1 发布检查单与 DoD 收口记录

> 生成：T9（t13）收口 · 日期 2026-08-31 · 仓库本地首提交 e2b8041 起，HEAD 见 git log
> 依据：PLAN.md §7.4 DoD / §11.4 v0.1 发布检查单 / §7.2 AC 表

## 1. DoD（§7.4）核对

| # | DoD 项 | 状态 | 证据 |
|---|---|---|---|
| ① | 功能 F1–F9 全部实现 | ✅ | F1 应用壳（T1）；F2 种子库 60 条过审入库（T2a/b/c）；F3 列表页（T4）；F4 详情卡（T5）；F5 闪卡（T7）；F6 自测（T8）；F7 快速记录+生词本（T6）；F8 进度持久化铁律（T3）；F9 进度页（T9） |
| ② | typecheck 0 错误 | ✅ | `pnpm typecheck` EXIT=0（tsc + vue-tsc 双配置） |
| ③ | Vitest 全绿 | ✅ | `pnpm vitest run` EXIT=0（船长授权代跑），Tests 全数通过（139+，含 format/search/store/list/detail/quick-input/flashcards/quiz/progress-summary/backup） |
| ④ | `pnpm validate:data` 通过 | ✅ | 60 词条 full 入口 0 错误 EXIT=0（AC-10；31 条 §5.7#6 near 库外对端词警告为设计内） |
| ⑤ | AC-01~AC-10 走查留档 | 🟡 待真人 | 见 §3：AC-01/02/03/04/05/06/07/08/09 自动化/代码证据齐；安装包安装与窗口/HMR 走查待真人（§4 待真人清单） |
| ⑥ | NSIS 安装包可安装运行 | 🟡 待真人 | 安装包 artifact 产出（dist/，AC-01 证据），未装 Node 机器安装验证待真人 |

## 2. §11.4 v0.1 发布检查单

| # | 检查项 | 状态 | 备注 |
|---|---|---|---|
| 1 | CI 全绿（typecheck / vitest / validate:data / build） | ✅ | 本地执行，退出码证据见任务 t13 commandsRun；CI（GitHub Actions）配置留 v0.2（无 remote） |
| 2 | AC-01：NSIS 在未装 Node 的全新 Windows 安装运行 | 🟡 待真人 | 安装说明见 §5；产出自检（dist/ 存在、appId/productName 配置）已验 |
| 3 | 首次启动引导走通，userData 可写 | 🟡 待真人 | 开发期 userData 隔离 .runtime/（T1）；打包后写 %APPDATA%/语栈，真人走查确认 |
| 4 | AC-08/09 实测：损坏回退与双开防护 | ✅ 代码级 | AC-08 单测回退 .bak 不崩溃（tests/store.test.ts）；AC-09 单测聚焦逻辑 + 单实例锁代码就位（§6 复测记录） |
| 5 | 卸载干净（不留孤儿文件） | 🟡 待真人 | NSIS 卸载器默认行为，真人安装/卸载验证 |
| 6 | 数据备份（设置页 JSON 导出）可用 | ✅ 简版 | F10 已实现 v0.1 简版（设置+生词本+进度会话快照）；**全量 userData 备份（含重启前完整 progress.json）记录为 v0.2 必补项**（需新增 data:export channel，§10.4 外） |

## 3. AC 表（§7.2）证据映射

| AC | 场景 | 证据 |
|---|---|---|
| AC-01 | 全新机器安装 | dist/ NSIS 安装包产出（T9）；安装运行留待真人 |
| AC-02 | 离线/无 key | 全本地实现，AI 仅 aiMode 状态（settings），无网络依赖（架构设计 + T5 详情纯本地） |
| AC-03 | 记录闭环 | T6 快速记录「复习一次/标记掌握」→ progress:save 持久化；重启数据在 userData/progress.json（写队列单测） |
| AC-04 | 未命中入生词本 | T6 生词本 add/remove + pending store 单测/页面 |
| AC-05 | 闪卡收敛 | T7 flashcards 纯逻辑单测（3 认识→mastered / 1 不认识→learning）19 用例 |
| AC-06 | 自测组卷 | T8 quiz 纯逻辑单测 21 用例（10 题/答案随机/错词优先/quiz:record） |
| AC-07 | 搜索 | T3 search.ts 单测 14 用例（汉字/全拼/首字母/编辑距离≤1/优先级/频次排序）+ T4 列表页 29 用例 |
| AC-08 | 损坏回退 | T3 store.test.ts：破坏 progress.json → 回退 .bak 不崩溃 |
| AC-09 | 双开防护 | T3 store.test.ts 聚焦逻辑 + main 单实例锁；打包产物复测记录 §6 |
| AC-10 | validate:data 零错误 | 60 词条 full 校验 0 错误 EXIT=0 |

## 4. 待真人走查清单（DoD 收口后）

- [ ] `pnpm dev` 窗口弹出 + HMR 正常（T1 AC-01 走查项，out/ 已证构建链路）
- [ ] NSIS 安装包在未装 Node 的 Windows 机器安装运行（AC-01）
- [ ] 首次启动引导/交互走查（§11.4#3），userData 写入确认
- [ ] 设置页 JSON 备份导出可用（浏览器下载目录落盘）
- [ ] 卸载干净性验证（§11.4#5）
- [ ] AC-09 双开实测：安装版运行两个实例，第二实例聚焦已有窗口

## 5. 安装说明（AC-01）

1. 产物：`dist/yuzhan-0.1.0-setup.exe`（NSIS 安装包，appId `com.yuzhan.app`，productName `语栈`）
2. 在未装 Node.js / 未装依赖的 Windows 机器上双击安装（选择安装目录，可选创建桌面快捷方式）
3. 首次启动自动创建用户数据目录 `%APPDATA%\语栈\`（正式库随安装包内置只读，进度/生词本/配置写 userData）
4. 若 SmartScreen 提示，点「更多信息 → 仍要运行」（未签名，v1.0 评估代码签名，§12 风险表）

## 6. AC-09 双开防护复测记录

- 实现：`app.requestSingleInstanceLock()`（src/main/index.ts，T1）+ `second-instance` 事件聚焦已有窗口（index.ts）+ `focusWindow` 辅助（src/main/window.ts，T3，单测覆盖：最小化→restore+focus / 非最小化→仅 focus）
- 单测：tests/store.test.ts「AC-09 双开聚焦」通过
- 打包产物行为：单实例锁在应用主进程入口执行，打包后与开发期同一代码路径（`app.requestSingleInstanceLock` 与打包状态无关）；第二实例启动即退出并触发第一实例聚焦 —— 代码路径确认，**真人安装版实测**列入 §4 待走查清单

## 7. 已知限制（记录，非缺陷）

1. **进度重启后 UI 读取**：§10.4 权威 channel 清单无进度读取 channel（仅 progress:save 写），进度页展示会话内数据；重启后数据仍在 userData/progress.json，UI 读取入口 v0.2（需新增 channel，设计变更须经用户同意并更新 PLAN.md §10.4 附录 B）
2. **F10 全量备份**：v0.1 简版导出设置+生词本+进度会话快照；全量 userData 备份 v0.2 必补（§11.4 检查单 6）
3. **corpus-version.json 缺失**（F5，T2b-B 验收接受现状）：正式库版本号兜底 '0.0.0'，语料快照版本化 v0.2 补齐
4. 无 CI（GitHub Actions）配置：无 remote，CI 留 v0.2
