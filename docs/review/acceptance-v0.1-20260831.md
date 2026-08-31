# 语栈 v0.1 发布验收报告（T9-verify / t14）

> 验收人：qa（reviewer）· 日期：2026-08-31 · 复核对象：T9（t13）产物 · HEAD：b25c5e7
> 依据：PLAN.md §7.4 DoD / §7.2 AC 表 / §11.4 发布检查单
> 状态：✅ 自动化证据全绿（四命令退出码 0）；⏳ 待真人最终走查（交互项，见 §六清单）

---

## 一、全量重跑校验（§11.4 检查单第 1 项：CI 全绿）

| 命令 | 退出码 | 结果 | 证据 |
|---|---|---|---|
| `pnpm run typecheck` | 0 | ✅ 通过 | tsc（node）+ vue-tsc（web）双配置 0 错误（本验收独立复跑） |
| `pnpm vitest run` | 0 | ✅ 通过 | 船长授权代跑：Test Files 10 passed (10)，Tests 145 passed (145)，0 failed（本会话 EPERM 留证后移交） |
| `pnpm validate:data` | 0 | ✅ 通过 | full 入口 60 文件 0 错误，31 警告均 §5.7#6 near 库外对端词（设计内）（本验收独立复跑） |
| `pnpm build` | 0 | ✅ 通过 | 船长授权代跑：out/main + out/preload + out/renderer 三端产物完整，2780 modules，renderer assets JS 1.45MB / CSS 18KB |

> 本会话直跑记录：`pnpm vitest run` 与 `pnpm build` 均因沙箱 EPERM（esbuild 子进程 spawn，errno -4048，配置加载阶段被拒）退出码 1 —— 非产品缺陷，按团队沙箱策略移交船长以授权模式重跑，回传退出码 0（见上表）。

## 二、Vitest 全绿明细（10 files / 145 tests）

| 测试文件 | it 数 | 覆盖 |
|---|---|---|
| format.test.ts | 9 | T0 首个纯函数 |
| search.test.ts | 14 | AC-07 检索（汉字/全拼/首字母/编辑距离≤1/优先级/频次排序/多音字） |
| store.test.ts | 10 | AC-08 损坏回退 .bak/.corrupt、原子写、写队列、AC-09 双开聚焦 |
| detail.test.ts | 17 | AC-02 详情卡考点字段/辨析折叠/例句标注/页面四态 |
| flashcards.test.ts | 19 | AC-05 收敛规则/撤销/小结/牌堆/页面流 |
| quick-input.test.ts | 18 | AC-03/04 快速记录/生词本 |
| quiz.test.ts | 21 | AC-06 组卷规则/会话/页面 |
| list.test.ts | 29 | AC-07 搜索/过滤/虚拟滚动/高亮/跳转 |
| progress-summary.test.ts | 5 | F9 进度摘要 |
| backup.test.ts | 3 | F10 JSON 备份导出 |
| **合计** | **145** | — |

## 三、AC 证据表（§7.2）

| AC | 场景 | 证据类型 | 证据 |
|---|---|---|---|
| AC-01 | 全新机器安装 | 🟡 待真人 | dist/yuzhan-0.1.0-setup.exe 117.1MB（NSIS，appId com.yuzhan.app，productName 语栈，21:02 产出）+ win-unpacked/yuzhan.exe 233MB；未装 Node 机器安装运行待真人走查（§六） |
| AC-02 | 离线/无 key | ✅ 静态 | 全本地实现，无网络依赖；详情页纯本地渲染（detail.test.ts 17 用例）；AI 仅 aiMode 状态 |
| AC-03 | 记录闭环 | 🟡 代码级 | 快速记录「复习一次/标记掌握」→ progress:save 持久化（quick-input.test.ts 18 用例 + progress store 节流写）；**重启后 UI 读取**为已知限制（v0.2 需新增读取 channel），重启持久化本身由 userData/progress.json 写队列保证 |
| AC-04 | 未命中入生词本 | ✅ 代码级 | pending add/remove + PendingPage（quick-input.test.ts 18 用例） |
| AC-05 | 闪卡收敛 | ✅ 单测 | flashcards.test.ts 19 用例（3 认识→mastered / 1 不认识→learning / 撤销 / 小结） |
| AC-06 | 自测组卷 | ✅ 单测 | quiz.test.ts 21 用例（10 题/答案随机/错词优先/quiz:record） |
| AC-07 | 搜索 | ✅ 单测 | search.test.ts 14 + list.test.ts 29（汉字/全拼/首字母/编辑距离≤1/命中优先级/虚拟滚动） |
| AC-08 | 损坏回退 | ✅ 单测 | store.test.ts：破坏 progress.json → 回退 .bak 不崩溃 + .corrupt 兜底 |
| AC-09 | 双开防护 | ✅ 代码+单测 | src/main/index.ts requestSingleInstanceLock + second-instance 聚焦；store.test.ts 双开聚焦用例；**安装版实测**列入待真人清单 |
| AC-10 | validate:data | ✅ 命令 | 60 词条 full 入口 0 错误 EXIT=0（本验收独立复跑） |

## 四、§7.4 DoD 六项核对

| # | DoD 项 | 状态 | 证据 |
|---|---|---|---|
| ① | F1–F9 全部实现 | ✅ | F1 应用壳（T1）/ F2 种子库 60 条过审（T2a/b/c）/ F3 列表页（T4）/ F4 详情卡（T5）/ F5 闪卡（T7）/ F6 自测（T8）/ F7 快速记录+生词本（T6）/ F8 持久化铁律（T3）/ F9 进度页（T9）——src/ 与 tests/ 全部对应物实锤 |
| ② | typecheck 0 错误 | ✅ | 本验收独立复跑 EXIT=0 |
| ③ | Vitest 全绿 | ✅ | 船长授权代跑 10 files / 145 tests 全绿（0 failed） |
| ④ | validate:data 通过 | ✅ | 本验收独立复跑 EXIT=0 |
| ⑤ | AC-01~10 走查留档 | 🟡 待真人 | 本报告 §三证据表 + §六待真人走查清单（DoD ⑤「人工走通并留档」收口需真人执行） |
| ⑥ | NSIS 可安装运行 | 🟡 待真人 | 安装包 artifact 已产出；未装 Node 机器安装验证待真人 |

## 五、§11.4 发布检查单状态

| # | 检查项 | 状态 | 备注 |
|---|---|---|---|
| 1 | CI 全绿（typecheck/vitest/validate:data/build） | ✅ | 本验收全量重跑，退出码证据见 §一（CI 配置留 v0.2，无 remote） |
| 2 | AC-01：NSIS 全新机器安装运行 | 🟡 待真人 | 安装说明见 release-checklist-v0.1.md §5；artifact 已验 |
| 3 | 首次启动引导 + userData 可写 | 🟡 待真人 | 开发期 .runtime/ 隔离（main/index.ts）；打包后 %APPDATA%/语栈 真人确认 |
| 4 | AC-08/09 实测 | ✅ 代码级 | 回退单测 + 单实例锁代码实锤；安装版实测待真人 |
| 5 | 卸载干净 | 🟡 待真人 | NSIS 默认卸载器，真人验证 |
| 6 | 数据备份可用 | ✅ 简版 | backup.test.ts 3 用例；**全量备份记 v0.2 必补**（已知限制，需新 channel） |

## 六、待真人走查清单（DoD ⑤ / §11.4 收口）

- [ ] `pnpm dev` 窗口弹出 + HMR 正常（T1 走查项）
- [ ] NSIS 安装包在未装 Node 的 Windows 机器安装并启动（AC-01）
- [ ] 首次启动引导走通，`%APPDATA%\语栈\` userData 可写（§11.4#3）
- [ ] AC-03 记录闭环：刷题遇「鞠躬尽瘁」→ Ctrl+K 输入 `jgj` → 命中卡片 → 「复习一次」→ 进度写入；重启后进度仍在（注：重启后 UI 读取为 v0.2 已知限制，本次验证 userData/progress.json 文件落盘即可）
- [ ] AC-04 未命中记录：输入未收录词 → 生词本可见 → 可删除
- [ ] AC-05 闪卡：同一词连续 3 次认识 → mastered；1 次不认识 → learning；撤销可用
- [ ] AC-06 自测：10 题一组、答案随机、答错写入 wrongTimes 且下次优先
- [ ] AC-07 搜索：汉字/全拼/首字母/错别字（编辑距离≤1）命中
- [ ] AC-08 实测：人为破坏 progress.json → 自动回退 .bak 提示，不崩溃
- [ ] AC-09 实测：安装版双开 → 第二实例聚焦已有窗口，不重复写
- [ ] 设置页 JSON 备份导出可用（下载目录落盘，§11.4#6）
- [ ] 卸载干净性验证（§11.4#5）

## 七、已知限制（记录，非缺陷，均须用户知悉）

1. 进度重启后 UI 读取：§10.4 权威 channel 无进度读取（仅 progress:save 写）；重启后数据仍在 userData/progress.json，UI 读取入口 v0.2（需新增 channel，设计变更须用户同意）
2. F10 全量备份：v0.1 为简版（设置+生词本+会话快照），全量 userData 备份 v0.2 必补
3. corpus-version.json 缺失（F5，T2b-B 真人验收接受现状）：正式库版本兜底 '0.0.0'，v0.2 补齐
4. 无 CI（GitHub Actions）：无 remote，CI 留 v0.2
5. SmartScreen/杀软可能误报（未签名）：安装说明已引导「更多信息→仍要运行」，v1.0 评估代码签名

## 八、验收结论

- 自动化证据：**全部通过**（typecheck / vitest 145 / validate:data / build 四命令退出码 0，船长授权代跑 vitest/build 已回传）
- 安全基线：contextIsolation+sandbox+nodeIntegration:false（window.ts）实锤；preload 白名单不透传 ipcRenderer（preload/index.ts）实锤；IPC 统一信封 + 10 channel 契约共享（contracts.ts）实锤
- 持久化铁律：原子写/.bak/.corrupt/串行写队列/单实例锁（store.ts + index.ts）实锤 + 单测覆盖
- 结论：**技术验收 pass**（自动化项全绿、代码证据齐全）；DoD ⑤ 与 §11.4 第 2/3/5 项及 AC-01/03/04 交互类由真人最终走查后收口（本报告 §六清单）
