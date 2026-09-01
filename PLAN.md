# 语栈（Yuzhan）— 公务员考试 · 言语理解成语积累桌面应用 — 项目计划

> 状态：头脑风暴定稿 · 待执行
> 计划版本：**v2.0**（四视角深度评审修订）· 修订历史见 §15-B
> 决策记录：桌面应用（Electron）/ 内置种子库 + AI 扩充 / 最小可运行先行 / 开源（MIT）/ 项目名：**语栈**

---

## 0. 文档导览

本文档是「语栈」项目的**唯一事实来源**（single source of truth），覆盖从 v0.1 到 v1.0 的需求、设计、数据规范与执行计划。新对话或协作者据此即可开工，无需重新讨论需求。

**读者地图**（按角色各读所需章节）：

| 角色 | 必读章节 |
|---|---|
| 执行者（新对话 / 开发者） | §4 技术架构、§5 数据模型、§7 MVP、§10 快速输入、§14 执行计划 |
| 数据贡献者 | §5 数据字典、§6 种子库策略、§9 AI 管线、§11.3 数据贡献流程 |
| 维护者 / 审阅者 | 全部，另加 §11 治理、§13 里程碑、§15-B 修订历史 |

**版本历史摘要**：

| 版本 | 说明 |
|---|---|
| v1.0 | 头脑风暴定稿（MVP 边界、技术栈、路线图） |
| v1.1 | 架构评审：修正 schema 重复 key、补持久化铁律 / IPC 清单 / pinyin-pro / 快捷键容错等 17 条 |
| **v2.0** | 四视角深度评审（产品 / 架构 / 数据 / 执行）：重构为完整工程蓝图——新增 §0 导览、§2 用户故事、§3 信息架构、§6 内容策略、§13 里程碑；细化 8 类误用类型判定表、验收用例（AC-01~10）、路由/状态设计、发布检查单、IPC 契约单一权威源（§10.4） |

---

## 1. 项目定位

### 1.1 定位

不是"成语词典"，而是**面向公务员考试言语理解模块的成语训练系统**——知道意思不是终点，**再遇到能选对**才是。

- 只收录考试高频考点成语（目标 300–600 个，MVP 先做 50–100 个精品）
- 独有的考试维度：近义辨析组、误用类型、感情色彩、真题频次
- 独特的输入闭环：刷题遇到错词，一键记录 → AI 联网查询 → 结构化卡片 + 混淆词推荐

### 1.2 目标用户

| 用户 | 特征 | 核心诉求 |
|---|---|---|
| **主力：公考备考者**（应届/在职） | 刷题量大、错词零散、缺系统整理、时间碎片化 | 快速记录错词、碎片复习、考前冲刺自测 |
| 次级：语文教师 / 编辑 | 关注词条准确性 | 校对、贡献词条 |
| 非目标：普通成语爱好者 | 查词为主 | 交给专业词典产品 |

### 1.3 使用场景（驱动功能优先级）

| 场景 | 描述 | 对应功能 |
|---|---|---|
| **S1 刷题间隙（核心）** | 边刷题边遇到不会/选错的成语，立刻记录，不打断节奏 | 快速输入 Ctrl+K → 生词本 →（v0.2）AI 补全 |
| **S2 碎片时间** | 通勤/排队时复习 | 闪卡模式 |
| **S3 考前冲刺** | 集中检测掌握情况、针对性补漏 | 自测 10 题组 + 错题回流复习队列 |

### 1.4 差异化

近义辨析组、误用类型、真题频次三个维度是通用词典不具备的；"记录 → 结构化 → 复习"的输入闭环是 Anki 类工具不具备的（Anki 需手动建卡，语栈零成本生成考试维度卡片）。

### 1.5 产品指标（MVP 轻量，本地统计即可）

| 指标 | 定义 | 目标（v0.1 起观测） |
|---|---|---|
| 激活 | 完成首次启动引导 | ≥90% 新会话 |
| 记录转化 | 快速输入命中/入生词本 → 后续复习过的比例 | ≥40% |
| 复习留存 | 连续 3 天、累计闪卡 ≥30 张的用户比例 | 迭代观测 |
| 学习成效（v0.2+） | 错词复测正确率提升 | v0.2 定基线 |

---

## 2. 用户故事与功能需求

优先级用 MoSCoW：**Must**（v0.1 必须）/ **Should**（v0.2）/ **Could**（v0.3+）/ **Won't**（明确不做）。

| ID | 用户故事 | 优先级 | 版本 |
|---|---|---|---|
| US-01 | 作为备考者，我刷题遇到不会的成语能**立刻记录**（Ctrl+K），不打断节奏 | Must | v0.1 |
| US-02 | 我能搜索并查看成语的完整考点（释义/出处/辨析/误用/真题例句） | Must | v0.1 |
| US-03 | 我能用闪卡复习，标记认识/不认识，进度自动保存 | Must | v0.1 |
| US-04 | 我能做 10 题自测，错题被记录并进入复习队列 | Must | v0.1 |
| US-05 | 我能看到自己的学习进度（掌握数/待复习数/错词数） | Must | v0.1（简版） |
| US-06 | 未收录的成语我能一键交给 AI 查询并生成考试维度卡片（含混淆词推荐） | Must | v0.2 |
| US-07 | 我能配置 AI 服务商与密钥；**无 key/断网时产品仍可完整使用本地功能** | Must | v0.1 起即本地降级 |
| US-08 | 我能把个人确认的优质词条一键贡献进正式库（PR 流程） | Should | v0.2+ |
| US-09 | 我能导入/导出学习数据（Anki/CSV/JSON） | Could | v0.4 |
| US-10 | 我能自定义快捷键与暗色模式 | Could | v0.4（暗色 Naive UI 天然支持，可提前） |

**非功能需求**（贯穿所有版本）：

| 类别 | 要求 |
|---|---|
| 隐私 | 本地优先，学习数据不出本机；无云同步（明确不做） |
| 可靠性 | 崩溃/断电不丢进度（§4.5 持久化铁律） |
| 性能 | 见 §4.7 性能预算 |
| 可用性 | 全流程无网络可用（离线模式）；首启 30 秒内可上手 |
| 可维护 | 数据过 schema 校验；main/renderer 类型共享防漂移 |

---

## 3. 信息架构与交互设计

### 3.1 页面地图

```
┌─────────────────────────────────────────────┐
│ 侧边导航：成语库 · 闪卡 · 自测 · 进度         │
│ 右上：快速记录 (Ctrl+K) · 设置 (齿轮)         │
├─────────────────────────────────────────────┤
│ 成语库: 列表页 ──▶ 详情页 (/idioms/:id)       │
│ 闪卡  : 单卡复习流（认识/不认识）             │
│ 自测  : 组卷 → 答题 → 结果（同页多状态）      │
│ 进度  : 掌握数 / 待复习 / 错词数 摘要         │
│ 快速输入: 全局弹层（任意页面 Ctrl+K 唤起）    │
└─────────────────────────────────────────────┘
```

### 3.2 路由表

| 路径 | 视图 | 进入方式 |
|---|---|---|
| `/` | 仪表盘首页（v0.2.5：欢迎区 + 学习统计 + 功能入口） | 启动 |
| `/idioms` | 成语列表页（多列网格 + 分页，v0.2.2–v0.2.5） | 导航 / 仪表盘入口 |
| `/idioms/:id` | 成语详情页 | 列表点击 / 快速输入命中 |
| `/flashcards` | 闪卡页（v0.2.2：档位选择） | 导航 |
| `/quiz` | 自测页（组卷/答题/结果三态 + 档位选择 + 自测历史，v0.2.2–v0.2.4） | 导航 |
| `/confusable` | 易混淆成语库（§6.4，v0.2.2） | 导航 |
| `/progress` | 进度页（v0.1 简版摘要） | 导航 |
| `/wrongbook` | 错题本（v0.2.4：读取持久化错题） | 导航 |
| `/pending` | 生词本（v0.2.5：使用引导卡） | 导航 |
| `/settings` | 设置页（v0.2.2：AI 快速模式开关） | 齿轮 |

### 3.3 关键交互流与空态设计

| 流程 | 交互要点 | 空态 / 兜底 |
|---|---|---|
| 快速输入 | Ctrl+K 弹层自动聚焦；Esc 关闭；回车检索；**命中已有词 → 展示卡片并提供「复习一次 / 标记掌握」动作（完成记录闭环）；未命中 → 两个动作** | 无结果 →「AI 查询（v0.2）/ 存入生词本」二选一 |
| 闪卡 | 单卡流；「认识/不认识」立即判定并展示释义；**收敛规则：同一词连续 3 次「认识」→ mastered，1 次「不认识」→ 降级 learning**；翻完一叠显示小结 | 无待复习卡 → 引导去成语库浏览 / 自测积累 |
| 自测 | 10 题一组；**出题规则：优先错词与高频词（频次 4–5），避免与上轮重复；干扰项来自同主题/近义辨析组/随机词，正确答案位置随机**；答完立即反馈对错并展示该词考点（强化记忆）；错词经 `quiz:record` 写 main 持久化、renderer 经 `progress:list` 同步 → 立即进错题本（v0.2.4）；选项释义去除括号提示防泄题（v0.2.2）；抽题档位可选（v0.2.2）；每次会话记入自测历史 `quiz:history`（v0.2.4） | 题库 <10 → 提示并引导浏览成语库 |
| 生词本 | 列表 + 手动删除 + 「立即复习」；v0.2 提供「批量 AI 补全」入口；**使用流程（v0.2.5 页面引导卡）：①记——快速记录未命中自动存入；②补——批量 AI 补全生成释义草稿逐条确认；③学——确认入个人库并加入闪卡队列 / 库内词立即复习；④清——已消化可删除** | 空 → 引导语「刷题遇到生词，Ctrl+K 记下来」 |
| 首次启动（v0.1 轻量） | 3 步引导：欢迎 → 载入种子库 → 演示一次快速记录；可跳过 | 全程 ≤30 秒 |

### 3.4 交互规范

- 搜索输入防抖 200ms，命中词高亮
- 详情页辨析组折叠展开，默认折叠
- 所有 AI 相关操作（v0.2）有 loading 与超时提示文案，禁止无反馈等待
- 数据损坏恢复时（§4.5）弹一次性提示「已从备份恢复最近数据」
- **窗口关闭行为（决策）**：v0.1 关闭窗口即退出应用（无托盘常驻），Ctrl+K 以应用内快捷键为主（窗口聚焦时生效），全局快捷键注册作为增强、失败即静默降级；托盘常驻与后台运行留 v0.2（配合全局快捷键）
- **错别字容错**：快速输入/搜索对常见错别字（如「不落窠臼」误输）做编辑距离 ≤1 的提示建议
- **闪卡会话细节**：翻面动效；一张卡判定后进入下一张，支持撤销上一步（误点）；会话结束显示「本轮认识 X / 不认识 Y」小结

---

## 4. 技术架构

### 4.1 分层架构

```
renderer (Vue 3 + TS + Naive UI + Pinia)
   │  contextBridge 白名单 API（无 nodeIntegration）
preload (shared 类型 + IPC 封装)
   │  ipcMain.handle 统一路由
main (window / store / ai / settings / logger)
   │
   ├─ data/       正式库（只读，打包进 asar）
   └─ userData/   个人数据（进度/生词本/缓存/配置，运行时读写）
shared/  (schema + IPC 契约类型，双端共用)
```

### 4.2 模块职责（main）

| 模块 | 职责 |
|---|---|
| `window.ts` | 窗口生命周期、单实例锁、系统快捷键注册 |
| `ipc.ts` | IPC channel 路由注册、入参 schema 校验 |
| `store.ts` | 正式库读取 + userData 读写（原子写、.bak、启动校验回退） |
| `ai.ts` | AI provider 抽象（OpenAI 兼容 / Ollama / mock），v0.2 |
| `settings.ts` | 配置读写 + safeStorage 密钥加密 |
| `logger.ts` | electron-log 落盘（`userData/logs/`） |

preload 只暴露 `shared/ipc.ts` 中声明的白名单 API，不透传 ipcRenderer 本体。

### 4.3 状态管理（Pinia store 划分）

| Store | 职责 | 持久化 |
|---|---|---|
| `idioms` | 正式库词条 + 内存索引（id/word/pinyin）+ 列表过滤状态 | 只读 |
| `progress` | 用户进度（status/wrongTimes/wrongTypes）+ 写队列 | 节流写 userData |
| `quiz` | 自测组卷与答题状态 | 错题写 progress |
| `pending` | 生词本 | 即时写 userData |
| `settings` | 设置（AI key 掩码、快捷键） | 写 userData/config.json |

> 组卷、检索、SM-2（v0.2）等**纯逻辑抽到 `renderer/lib/` 与 `shared/lib/`**，不依赖 UI，保证可单测。

### 4.4 IPC 契约（权威 channel 清单见 §10.4）

- **类型共享**：`shared/ipc/contracts.ts` 定义 channel 常量与 Request/Response 类型，main 与 renderer 引用同一份，防契约漂移
- **错误约定**：统一 `{ ok: true, data } | { ok: false, error: { code, message } }`，renderer 按 code 展示文案
- **channel 权威清单**：以 §10.4 表格为准（本版起收敛为单一权威来源，避免两处漂移），覆盖 `data:list / data:get / progress:save / pending:list / pending:add / pending:remove / quiz:record / settings:get / settings:set / ai:searchWord / app:log`
- **安全基线**：`contextIsolation: true` + `sandbox: true` + `nodeIntegration: false`；preload 白名单不透传 ipcRenderer；IPC 入参过 schema；路径白名单限定 `data/` 与 `userData/`；apiKey 经 safeStorage 加密（完整落实见 §10.4）

**safeStorage 已知坑**：① 必须在 `app.whenReady()` 之后调用；② Windows DPAPI 绑定用户账户，跨用户/系统迁移后解密失败——解密失败视为"无 key"进入降级态，不崩不丢数据；③ Linux 无密钥环时静默降级 plaintext，需在设置页提示风险。

### 4.5 持久化铁律（userData 写入铁律）

1. 所有写入（进度/生词本/缓存/配置）走**原子写**：写 `*.tmp` → `fs.rename` 替换
2. 每次写入前保留 `.bak`（保留最近一份）
3. 启动时 JSON.parse 校验全部 userData 文件，损坏自动回退 .bak 并记日志、提示用户
4. `app.requestSingleInstanceLock()` 防多开并发写同一文件
5. 进度写入 renderer 侧节流（≤1 次/2s），闪卡/自测结束时强制 flush

### 4.6 错误处理三层兜底

| 层 | 策略 |
|---|---|
| renderer | 统一 toast/空态；AI 类操作 loading + 超时提示；**渲染错误经 `app:log` 转发到 main 日志** |
| IPC | 统一错误码返回（如 `AI_TIMEOUT` / `NO_API_KEY` / `FILE_CORRUPT`） |
| main | 全部写 electron-log；未知异常弹「导出日志」引导 |

### 4.7 性能预算

| 项 | 预算 | 实现要点 |
|---|---|---|
| 启动到可交互 | <2s（含索引构建） | 拼音索引启动时预计算（600 条规模 <50ms） |
| 列表首屏（600 词条） | <300ms | **虚拟滚动**（如 vue-virtual-scroller） |
| 检索响应 | <100ms | 内存索引 + 防抖 200ms |
| 闪卡翻卡 / 自测切题 | <100ms | 无感切换 |

### 4.8 可测试性

**纯函数清单**（必须抽离、必须单测）：检索匹配（`shared/lib/search.ts`）、组卷（`shared/lib/quiz.ts`）、SM-2（v0.2）、schema 校验（ajv）、原子写逻辑（main，mock fs）。

**测试矩阵**：

| 层 | 工具 | 范围 |
|---|---|---|
| 单元 | Vitest | 纯函数、stores、schema 校验 |
| 组件 | Vitest + Vue Test Utils | 列表/卡片/闪卡/快速输入弹层 |
| IPC | Vitest（mock fs/ipcMain） | handler 校验与错误码 |
| E2E | Playwright（v0.2 起） | 主流程闭环「记录→复习→自测」 |

---

## 5. 数据模型与数据字典

### 5.1 成语 Schema

```jsonc
{
  "schemaVersion": 1,                 // 数据模型版本，字段演进靠它迁移（§5.5）
  "id": "ju-gong-jin-cui-01",         // 拼音slug + 两位序号（见 5.5），唯一
  "word": "鞠躬尽瘁",
  "pinyin": "jū gōng jìn cuì",
  "meaning": "……",                   // 考试语境释义（非词典直抄），多义项用「；」分隔主/引申义
  "origin": "《三国志·蜀书·诸葛亮传》",  // 出处（可空）
  "usage": "多用于……语境",            // 适用对象/语境（可空）
  "emotion": "褒",                    // 感情色彩：褒/贬/中性（见 5.3，受控枚举）
  "register": "无",                   // 交际语域：谦辞/敬辞/无（与 emotion 正交拆维，见 5.3）
  "near": [                           // 近义辨析组（考试核心考点）
    { "word": "殚精竭虑", "diff": "……区别" }   // diff 必填，一句话说清
  ],
  "opposite": ["……"],
  "errorTypes": ["褒贬误用"],          // 8 类见 5.2（受控枚举，含判定优先级）
  "examples": [                       // 上限 3 条
    { "text": "……", "exam": "2023-国考-副省级", "kind": "exam" }   // kind: exam=真题（必带 exam 卷别，引用 exams.json）/ made=自造（exam 可空）
  ],
  "frequency": 5,                     // 真题出现频次分档 1–5（见 5.4）
  "exams": ["2023-国考-副省级"],      // 引用 exams.json 词表（见 5.3）
  "tags": ["态度", "奉献"],           // 引用 tags.json 词表（见 5.3），上限 4 个
  "quality": "reviewed",              // reviewed=已人工校验 / draft=AI 初稿 / user=个人确认
  "library": "official",              // official=正式库 / user=个人库（约束：official⟹reviewed）
  "updatedAt": "2026-01-01",          // 最近修订日期（reviewed 词条必填）
  "verifiedBy": "alice"               // 审核人（reviewed 词条必填，开源协作可追溯）
}
```

### 5.2 误用类型操作性定义表 ★（AI 生成与人工标注的唯一判定标准）

**判定优先级**（自上而下依次排除，先命中的类别优先）：语义层面（望文生义 → 形近/音近混淆 → 语义重复 → 搭配不当）→ 对象层面（对象误用）→ 语用层面（谦敬错位 → 褒贬误用）→ 程度层面（轻重失当）。一条词条可标 1–2 类，标注须在 `examples` 或 `usage` 中体现判定依据。

| 误用类型 | 操作性定义 | 误例 → 正例 |
|---|---|---|
| **望文生义** | 按字面意思理解，忽略约定俗成的整体含义 | 误：「不刊之论」=不能刊登的言论 → 正：比喻不能改动或不可磨灭的言论 |
| **形近/音近混淆** | 与字形或读音相近的成语混用 | 误：「不翼而飞」与「不胫而走」混用 → 前者多指物品凭空消失，后者多指消息传播 |
| **语义重复** | 与句中其他成分表意重复 | 误：「忍俊不禁地笑了」→ 「忍俊不禁」已含"笑"意 |
| **搭配不当** | 与搭配对象不合语言习惯 | 误：「提高问题」→ 正：解决问题/提高水平 |
| **对象误用** | 适用对象/主体不符 | 误：「举案齐眉」形容朋友关系 → 正：只用于夫妻相敬 |
| **谦敬错位** | 谦辞/敬辞使用对象颠倒 | 误：说自己「鼎力相助」→ 正：「鼎力相助」是敬辞，用于对方 |
| **褒贬误用** | 感情色彩与语境相反 | 误：「始作俑者」用于褒义 → 正：比喻首开恶例的人（贬） |
| **轻重失当** | 词义程度与语境不符 | 误：把「微不足道」当「微乎其微」的加强版使用 |

> 数据规范：一条词条可标 1–2 个误用类型；标注时必须在 `examples` 或 `usage` 中体现判定依据，保证可复核。

### 5.3 受控词表（独立词表文件，校验脚本引用）

**emotion（感情色彩）** 与 **register（交际语域）正交拆维**——"洗耳恭听"（敬 + 中性）这类词单字段无法表达：

- `emotion`: `褒 / 贬 / 中性`
- `register`: `谦辞 / 敬辞 / 无`（谦辞=自称，如「抛砖引玉」；敬辞=称对方，如「高抬贵手」）

**tags.json**（独立文件，`data/idioms/tags.json`）：初始词表 **≤30 个**主题，每词条 **≤4 个**；新增主题走 PR 更新词表本体，而非在词条里裸写。初始 8 主题：`人际交往 / 处事方法 / 学习事业 / 态度奉献 / 自然景物 / 社会现象 / 状态程度 / 言语表达`。

**exams.json**（独立文件，`data/idioms/exams.json`）：卷别受控词表，值格式 `年份-考试类型-卷类/省`（各省独立命题，不能笼统写"省考"）：如 `2023-国考-副省级`、`2024-省考-浙江`、`2025-联考-山东`。词条 `exams` 字段引用本表；表随词条扩充，由校验脚本维护合法值集合。

### 5.4 frequency 口径

- **语料快照版本化**：分档统计基于**固定版本**的真题语料快照（如 `corpus-2025.1`），版本记录在 `data/scripts/corpus-version.json`——避免随时间滑动导致同一词条分档漂移、进度混乱
- 分档：近 5 年快照语料中命中 0 次=1（含教研人工确认收录的备用词）、1–2 次=2、3–5 次=3、6–10 次=4、>10 次=5
- 备用词语义独立：`frequency=1` 仅表示"未检索到真题命中"，人工收录依据（教研经验）记录在词条 `usage` 备注，不混入分位刻度
- v0.1–v0.2 种子库由人工按教研经验定档并记录依据；v0.3 起由管线按快照重算并走 PR 变更

### 5.5 id 规则与数据版本

- **id**：`拼音slug + "-" + 两位序号`（如 `ju-gong-jin-cui-01`）。多音字按教育部《普通话异读词审音表》人工确认拼音后生成 slug；序号保证拼音修正时 id 稳定、用户进度不失联。**检索索引按 pinyin-pro `multiple: true` 全读音索引**（与人工确认拼音不一致时以全读音检索兜底）
- **文件划分（统一按首字拼音分区）**：`data/idioms/j/…`、`data/idioms/g/…` 等，**同一词条只属一个分区**（v1.1 的"主题/首字"双维度划分有歧义，统一为首字）；跨文件 `id` 唯一性与词表引用一致性由 CI 校验（见 §5.7）
- **schemaVersion**：字段演进必须 bump 版本并提供迁移脚本；旧版本词条启动时迁移或标记待迁移。考点字段（`senses` 义项结构化、`confusable` 易混、`examHits` 干扰项真题来源）**预留 v0.3 随内容工程演进**，v0.1–v0.2 以 `meaning` 分号分隔 + `near`/`opposite` 承载
- **孤儿 GC**：正式库删词条时，启动期清理 `userData` 中对应孤儿进度记录

### 5.6 用户数据模型（`userData/`，不进正式库）

```jsonc
{
  "id": "ju-gong-jin-cui-01",
  "status": "learning",              // new / learning / mastered
  "wrongTimes": 3,
  "wrongTypes": { "褒贬误用": 2 },    // key 必须来自 5.2 词表
  "lastSeen": "2026-01-15"
}
```

> v0.1 只存上表字段；`review.interval/ease/due` 等 SM-2 字段随 v0.2 算法落地时再扩展（YAGNI）。

另有 `userData/pending.json` 生词本（未命中词条待补全）、`userData/cache/`（AI 查询缓存，v0.2，带条数上限清理策略）、`userData/config.json`（设置：`aiMode`、快捷键 `quickInputShortcut`（默认「+」= `'Plus'`）、`aiBaseUrl`/`aiModel`（默认 DeepSeek 端点/模型，§10.2）、`aiFastMode`（快速模式，v0.2.2）；apiKey 经 safeStorage 加密存储，不入 config.json 明文）、`userData/quiz-history.json`（自测历史，v0.2.4，保留最近 200 条）。

> **进度读取（v0.2.4）**：v0.1 起 renderer 只写不读进度；v0.2.4 新增 `progress:list` IPC，renderer progress store `load()` 以**合并语义**拉取（main 数据补进内存、本地未落盘写入优先），错题本/进度页/自测结束（`quiz:record` 后）据此同步，错题立即可见且重启不丢。

### 5.7 数据一致性规则（校验脚本 `pnpm validate:data` 的约束清单）

1. `id` 全库唯一（跨文件，按首字分区合并校验）
2. required 字段齐全：id/word/pinyin/meaning/emotion/register/errorTypes/frequency/quality/library
3. 枚举合法：emotion、register、errorTypes、tags、exams、examples.kind、quality、library 均来自受控词表（tags/exams 引用 tags.json/exams.json）；**`examples.kind=exam` 时必须带 `exam` 卷别且引用 exams.json 合法值**
4. **组合约束**：`library=official ⟹ quality=reviewed`（正式库必须人工过审，见 §9 质量底线）
5. `frequency` ∈ 1–5；`near[].diff` 非空；`near ≤ 5`、`examples ≤ 3`、`tags ≤ 4`
6. `near/opposite` 引用库内已有词条时校验存在性（不在库内则仅警告）
7. `quality=reviewed` 必须带 `updatedAt` 与 `verifiedBy`
8. 拼音 slug 与 word 拼音一致（多音字例外清单人工维护）

> **Schema 双入口（架构决策）**：`idiom.full`（全字段必填，正式库/个人确认库用）与 `idiom.draft`（AI 初稿用，允许缺字段）由同一份 JSON Schema 的 `$defs` 组合导出——解决"AI 输出必须过校验"与"缺字段提示待补充"的矛盾：AI 输出先过 `draft` 宽松校验，缺字段明确标记；用户确认补齐后才以 `full` 校验入库。校验器选型：ajv v8（draft-07）。

---

## 6. 种子库内容策略

### 6.1 选词标准

**来源**（优先级递减）：① 近 5 年国考/省考/联考言语真题中出现过的成语（人工从真题语料标注）；② 权威工具书高频条目（《现代汉语词典》第 7 版、《新华成语词典》）；③ 公考教研公认的易错高频词（人工教研经验，标注依据）。

**筛选规则**：真题频次优先 → 易错性（命中 §5.2 误用类型者优先）→ 辨析价值（处于近义辨析组者优先）。

**覆盖矩阵**（首批 50–100 条的验收基线）：

| 维度 | 目标 |
|---|---|
| 误用类型覆盖 | 8 类误用类型各 ≥3 条 |
| 近义辨析组 | ≥20 组（每词条 near 平均 ≥1） |
| 主题覆盖 | 8 个 tags 主题各 ≥5 条 |
| 频次分布 | 各分档（1–5）均有词条 |
| 真题例句 | ≥70% 词条带 `kind=exam` 例句 |

### 6.2 内容质量要求

- 释义用**考试语境释义**（直击考点），非词典直抄；多义项按「；」分隔主/引申义，考试不考的冷僻义不写
- 例句规范：`exam` 例句原文照录（注明卷别，≤50 字截取）；`made` 自造例句必须语境清晰、无歧义；**真题例句只做简短引用，不整卷搬运**
- `near[].diff` 一句话说清核心区别（如「鞠躬尽瘁」重"忠诚付出" vs「殚精竭虑」重"用尽心思」）
- 每条词条标注 `verifiedBy`（reviewed 必填），开源协作可追溯

### 6.3 批量导入记录（用户要求，2026-09-01）

**来源与统计口径**：`E:\杂项\言语真题` 全部 **756 份**（各年国考/省考/联考，网友回忆版）试卷，**仅抽取选项行**（`A、/A./A．` 起始，41672 行选项 / 88902 个词元），按空白与中文标点切分纯汉字词元统计出现次数；出现 ≥2 次的词元共 7538 个（含大量虚词/常用词，如「因为」「影响」，不入库）。

**选词（两批）**：本库定位成语积累——
- **第一批（高频档）**：四字成语且出现 **≥20 次**（464 个，如 独树一帜 109 次、方兴未艾 106 次、无与伦比 104 次）；库内已收录 15 词跳过，实际新增 **447 张**。
- **第二批（全量补齐档，2026-09-01 同批完成）**：四字成语且出现 **2–19 次**（2382 个候选），逐词筛除非成语片段（普通词组如「传承文明/历史悠久/自然景观」、现代口号如「行稳致远/踔厉奋发/守正创新」、错别字与变体如「饮鸠止渴/墨守陈规/故步自封/一孔见天」、口语叠词如「热热闹闹/实实在在」等约 500 词），**实际新增 2093 张**；同音不同形词（如 坚韧不拔/坚忍不拔）按 `slug-02` 序号区分。

两批均由 AI 逐条撰写考试语境释义/用法/感情色彩/语域/误用类型（§5.2 八类）/主题标签（第二批为控制篇幅以紧凑字段为主、无例句）；卡片 `quality=reviewed`、`verifiedBy=AI导入`、拼音 pinyin-pro 生成并核实多音字（如 自怨自艾→yì、曲高和寡→hè）。**正式库累计 2600 张**（含原种子 60 张）。

**frequency 口径（本批替代口径，与 §5.4 快照口径不同）**：按本批语料出现次数分档——≥80 次=5 / 45–79 次=4 / 10–44 次=3 / 5–9 次=2 / 2–4 次=1；后续可切换到 §5.4 快照口径重算。

**工具与可复现**：`data/scripts/import-exam-vocab.mjs`（`scan` 词频扫描 / `generate` 卡片生成，读 `import-content.json` 释义源数据 + `import-report.json` 全量词频报告；已导入全部「出现≥2 次」的四字成语）；`data/scripts/build-search-cache.mjs`（预生成检索索引缓存 `data/search-index.json`，词条变更后需重跑，renderer 启动免 pinyin-pro 全量计算）。校验：`pnpm validate:data` 2600 个词条文件 0 错误。

### 6.4 易混淆成语对（用户要求 #8，2026-09-01）

`data/pairs.json`（86 对）：人工精选经典易混对 57 对（如 不负众望/不孚众望、相得益彰/相辅相成、一蹴而就/一挥而就、望其项背/望尘莫及、处心积虑/殚精竭虑、无微不至/无所不至…）+ 卡片 `near` 字段自动提取 29 对；每对含 `a`/`b`（均为库内词条）+ `diff`（一句话核心区别）。配套新增 IPC `pairs:list`（§10.4 权威清单扩展）与页面 `/confusable`（易混淆库，点词跳详情）。生成脚本 `data/scripts/build-pairs.mjs`（改 CURATED 表后重跑即可）。

---

## 7. MVP 范围（v0.1）

### 7.1 功能清单

| 编号 | 功能 | 优先级 |
|---|---|---|
| F1 | 应用壳：窗口 + 布局 + 路由 + 单实例锁 | Must |
| F2 | 种子库：50–100 词条（AI 初稿 → schema 校验 → **人工过审关卡**） | Must |
| F3 | 成语列表页：搜索（汉字/拼音/首字母/模糊）+ 频次/首字过滤 + 虚拟滚动 | Must |
| F4 | 成语详情卡片：释义/出处/感情色彩/语域/辨析组折叠/真题例句 | Must |
| F5 | 闪卡模式：认识/不认识 + 收敛规则（3 次认识→mastered）+ 撤销 + 会话小结 | Must |
| F6 | 自测模式：10 题组（出题规则见 §3.3）+ 即时反馈 + 错题记录 | Must |
| F7 | 快速记录（本地版）：Ctrl+K + 本地模糊检索 + 命中记录动作 + 生词本入口 | Must |
| F8 | 进度持久化：原子写 + .bak + 启动校验回退 + 节流写 | Must |
| F9 | 进度页（简版）：掌握数 / 待复习 / 错词数 | Must |
| F10 | 设置页（简版）：快捷键说明、数据备份/导出（JSON） | Should（v0.1 末可裁） |
| F11 | 打包：electron-builder NSIS 出 Windows 安装包 | Must |

### 7.2 验收用例（AC 表，T 任务验收即按此执行）

| ID | 场景 | 可测验收标准 |
|---|---|---|
| AC-01 | 全新机器安装运行 | 安装包可在未装 Node/依赖的 Windows 机器安装并启动 |
| AC-02 | 离线/无 key 环境 | 不配置 AI key、断网，F1–F9 全部功能可用（本地模式） |
| AC-03 | 记录闭环 | 刷题遇到"鞠躬尽瘁"→ Ctrl+K 输入拼音 `jgj` → 命中卡片 → 「复习一次」→ 进度写入；重启后进度仍在 |
| AC-04 | 未命中记录 | 输入未收录词 → 存入生词本 → 生词本列表可见 → 可删除 |
| AC-05 | 闪卡收敛 | 同一词连续 3 次「认识」→ 状态变 mastered；1 次「不认识」→ 降级 learning |
| AC-06 | 自测组卷 | 10 题一组，答案随机排序；答错 → 写入 wrongTimes 且下次自测优先出该词 |
| AC-07 | 搜索 | 输入汉字/全拼/首字母/含拼音错误（编辑距离 ≤1）均可命中目标词 |
| AC-08 | 数据健壮性 | 人为破坏 progress.json → 启动自动回退 .bak 并提示，不崩溃 |
| AC-09 | 双开 | 第二个实例启动 → 提示并聚焦已有窗口，不重复写数据 |
| AC-10 | 数据校验 | `pnpm validate:data` 对种子库零错误；人工过审清单（§9.4）逐条勾选存档 |

### 7.3 MVP 明确不做

间隔重复算法（SM-2）、错题统计页（v0.1 仅简版摘要）、AI 联网查询、云同步、托盘常驻/后台运行、导入导出 Anki（v0.1 仅 JSON 备份）。

### 7.4 Definition of Done（v0.1 完成定义）

① 功能 F1–F9 全部实现；② `typecheck` 0 错误；③ Vitest 全绿（§14 T0 基建）；④ `pnpm validate:data` 通过；⑤ AC-01~AC-10 人工走通并留档；⑥ NSIS 安装包可在全新机器安装运行。

---

## 8. 功能路线图

| 版本 | 内容 |
|---|---|
| **v0.1 MVP** | 见 §7，闭环最小集（T0–T9，§14） |
| **v0.2 错词速记 + 学习引擎** | 快速输入 AI 闭环（联网查询 + 混淆词推荐 + 一键入库）、SM-2 间隔重复、错题本 + 误用类型统计、掌握度仪表盘、Playwright E2E 主流程、托盘常驻 + 全局快捷键 |
| **v0.3 内容工程** | AI 批量扩充管线（§9）、正式库扩到 300+、真题例句标注 + 语料快照分档重算、考点字段演进（senses/confusable/examHits） |
| **v0.4 体验升级** | 辨析专项训练、模拟真题模式、导入导出（Anki/CSV/JSON）、暗色模式、键盘效率增强 |
| **v1.0 发布** | 跨平台打包（Win/macOS/Linux）、CI 全绿 + 发布文档、GitHub Releases、SQLite 存储评估 |

---

## 9. AI 数据扩充管线（v0.3 设计，数据 schema 先行）

### 9.1 管线流程

```
LLM 批量生成词条初稿（idiom.draft 宽松校验通过）
   ↓
JSON Schema 校验（draft 入口；失败进入 §9.3 分类修复）
   ↓
人工 Review（GitHub PR，逐条过 §9.4 checklist）   ★ 质量底线，不可跳过
   ↓  quality: draft → reviewed（同时 quality×library 组合约束生效）
合并进 data/idioms/（按首字分区）
   ↓
CI 自动校验（full 入口）+ 统计报表
```

### 9.2 提示词模板大纲（`data/scripts/prompts/`，可审计）

- **角色**：资深公考言语教研员
- **任务**：按 idiom.draft schema 输出 JSON（一次 1 词条，批次 ≤20 条/轮）
- **约束**：① 释义用考试语境、直击考点；② **真题例句必须来自提供的真题语料库，语料无此词则 `examples` 留空，禁止编造**；③ 误用类型按 §5.2 判定表逐条给出判定依据；④ 辨析 diff 一句话说清；⑤ 输出仅 JSON，不得夹杂解释
- **输出溯源**：每条结果附「判定依据/依据来源」字段（draft 阶段即可追踪，AI 幻觉防线前置）

### 9.3 校验失败分类与修复回路

| 失败类型 | 处理 |
|---|---|
| JSON 解析失败 | 自动重试 1 次（温度调低）→ 仍失败则丢弃并记录 |
| 缺字段 / 枚举非法 | 返回原始文本与缺项清单，存 `pending-ai/` 待人工修（**不丢原文**） |
| 引用不存在（near/exams/tags） | 自动修正为合法值或标记待人工 |
| 重复词条 | 与库内 id 比对，跳过并记录 |

### 9.4 人工 Review Checklist（逐条过审存档）

1. 误用类型是否贴切（按 §5.2 判定表复核）
2. 辨析 diff 是否准确、一句话可懂
3. 例句出处是否真实（真题必须来自语料库）
4. 感情色彩 / 语域标注是否正确
5. 频次分档是否符合快照口径（§5.4）
6. 有无与库内词条重复 / 强关联未建组

---

## 10. 快速输入：错词速记（AI 闭环）

**场景**：用户刷题遇到不会/选错的成语 → 立刻记录，不打断刷题节奏。

### 10.1 交互流

```
Ctrl+K 全局唤起快速输入框（任何页面可用）
   ↓
输入成语 / 拼音 / 模糊词 → 回车
   ↓
① 本地库优先检索（汉字/拼音/首字母/模糊，§10.2 算法）
   ├─ 命中 → 展示已有卡片 +「复习一次 / 标记掌握」动作（记录闭环，不重复建卡）
   └─ 未命中 → ② AI 联网查询（v0.2；v0.1 直接入生词本）
   ↓
② AI 查询（主进程发起，aiMode 状态机见 10.2）
   → 结构化返回（过 idiom.draft 校验，缺字段明确标记）
   → 生成 2–4 个「混淆词」候选：库内已有词直接链接 / 新词标候选草稿
   ↓
③ 预览确认面板（v0.2）
   → quality: draft 展示，可编辑修正（AI 幻觉防线）
   → 「混淆词」逐条勾选
   → 确认 → 写个人库（quality: user）→ 加入闪卡队列
   → 可一键发起「贡献进正式库」（PR 流程）
```

### 10.2 技术设计

- **检索算法**：依赖 `pinyin-pro`（`multiple: true` 全读音索引，多音字兜底）。命中优先级：精确（word/pinyin 全等）→ 前缀（首字/拼音首字母）→ 子串 → 编辑距离 ≤1（含错别字提示）；同分取频次高者
- **AI provider 抽象**：`ai.ts` 定义 Provider 接口（OpenAI 兼容 / Ollama / mock 供测试），renderer 不感知具体实现
- **默认端点/模型（用户要求，2026-09-01）**：`shared/ipc/contracts.ts` 常量 `DEFAULT_AI_BASE_URL = 'https://api.deepseek.com'`、`DEFAULT_AI_MODEL = 'deepseek-v4-flash'`（OpenAI 兼容；store 默认值同源引用，设置页占位符同步；用户可改）
- **aiMode 状态机（四态）**：`disabled`（无 key）→ 快速输入直接走生词本；`configured`（有 key 未测）→ 首次查询前可选自检；`online`（可查询）；`error`（超时/限流）→ 提示并降级生词本。状态持久化，UI 显示当前态
- **查询质量**：超时 15s；失败自动重试 1 次；**支持取消**（AbortSignal + request token，防 stale 结果覆盖新查询）；限流：查询按钮 3s 冷却 + 每日配额提示
- **缓存**：落盘 `userData/cache/`（同词不重复调用、离线可看上次结果；**条数上限 200，超限按 LRU 清理**）
- **快捷键**：v0.1 应用内快捷键（窗口聚焦时），globalShortcut 注册成功则升级为全局、失败静默降级；设置页可改键
- **生词本**：`userData/pending.json`，未命中先存、可批量补全（v0.2）

### 10.3 持久化策略（userData 写入铁律）

1. 所有写入（进度/生词本/缓存/配置）走**原子写**：写 `*.tmp` → `fs.rename` 替换
2. 每次写入前保留 `.bak`（保留最近一份）；**`.bak` 也损坏时保留原始文件为 `.corrupt` 并弹窗引导（不静默清空用户数据）**
3. 启动时 JSON.parse 校验全部 userData 文件，损坏自动回退 .bak 并记日志、提示用户
4. `app.requestSingleInstanceLock()` 防多开并发写
5. **写队列（防丢失更新）**：所有写路径收敛到统一 storage 服务，main 内**串行队列 + 同 key 防抖合并**——`ipcMain.handle` 是异步并发，多请求并发读-改-写会互相覆盖，禁止在 handler 里直接读改写
6. renderer 进度写节流（≤1 次/2s），闪卡/自测结束时强制 flush

### 10.4 IPC 与安全基线

- **统一信封**：`{ ok: true, data } | { ok: false, error: { code, message } }`（全 channel 一致，renderer 按 code 展示文案）
- **契约共享**：`shared/ipc/contracts.ts` 定义 channel 常量与 Request/Response 类型，main/preload/renderer 引用同一份
- **data:list 策略**：启动时全量加载（实际约 2600 条；v0.2.3 性能优化：IPC 载荷剥离 `examples/origin`——详情页经 `data:get` 按需拉全量，并附带预生成检索索引缓存 `search-index.json`），**过滤/搜索/排序在 renderer 端内存完成**——避免 IPC 高频往返；IPC 只承担一次性加载与写操作

| channel | 方向 | 参数 | 返回 |
|---|---|---|---|
| `data:list` | main→renderer | —（全量，启动一次） | 词条（剥离例句/出处）+ 版本号 + 检索索引缓存 |
| `data:get` | main→renderer | id | 全量词条 / null |
| `progress:save` | renderer→main | `{ id, status?, wrongTypes? }`（与 §5.6 模型一致） | ok |
| `progress:list` | main→renderer | — | 全量进度（错题本/进度页/自测结束同步，v0.2.4） |
| `pending:list` | renderer→main | — | 生词本数组 |
| `pending:add` / `pending:remove` | renderer→main | word | ok |
| `quiz:record` | renderer→main | `{ answers: [{id, correct}] }`（批量，一次 10 题） | ok |
| `quiz:history:list` / `quiz:history:add` | renderer→main | — / 历史条目 | 自测历史（v0.2.4，userData/quiz-history.json） |
| `pairs:list` | main→renderer | — | 易混淆对全量（§6.4，v0.2.2） |
| `settings:get` | renderer→main | — | 设置（key 掩码、快捷键、aiMode、aiFastMode） |
| `settings:set` | renderer→main | 设置项 | ok |
| `ai:searchWord` | renderer→main | word（v0.2） | draft 词条 / 错误码 |
| `app:log` | renderer→main | `{ level, message }` | ok |

**安全基线**：`contextIsolation: true` + `sandbox: true` + `nodeIntegration: false`；preload 只暴露上表白名单，不透传 ipcRenderer；IPC 入参过 schema 校验；文件路径白名单限定 `data/` 与 `userData/`；apiKey 经 safeStorage 加密存储（坑位见 §4.4）。

---

## 11. 开源治理与协作流程

### 11.1 文档与模板

- **LICENSE**：MIT
- **README**：项目介绍、截图、安装、快速上手、数据贡献入口、本地优先/隐私声明
- **CONTRIBUTING**（代码 + 数据双轨）：代码贡献（分支规范、PR 模板、review 规则）；数据贡献（见 11.3）；issue 模板（bug / 词条勘误 / 功能建议 三套）
- 数据审查制度：所有词条 `quality: reviewed` 才允许进正式库（§5.7 组合约束强制执行）

### 11.2 CI（GitHub Actions）

| Job | 命令 | 备注 |
|---|---|---|
| typecheck | `vue-tsc` + `tsc` | node/web 双 tsconfig |
| unit | `vitest run` | 纯函数 + stores |
| data | `pnpm validate:data` | schema + 词表 + 组合约束 |
| build | `electron-vite build` + `electron-builder --win` | 产出 NSIS 安装包 artifact |

**基建要点**：缓存 electron 二进制与 pnpm store（国内网络下载易失败）；`.npmrc` 设 `node-linker=hoisted`，`package.json` 配 `pnpm.onlyBuiltDependencies: ["electron", "esbuild"]`——否则 pnpm 11 下 electron-builder 打包失败（T9 前必须就位）。

### 11.3 数据贡献流程

```
改数据 JSON（或新增词条）
   ↓ pnpm validate:data 本地全绿
提 PR（模板：改动范围 / 词条清单 / 校验截图 / 逐条过审勾选）
   ↓ 维护者按 §9.4 checklist review
合并 → CI 重新校验
```

**user → reviewed 晋升**：个人库词条（quality: user）经 PR 提交 → 人工过审 → 改 `quality: reviewed` + `library: official` + 补 `verifiedBy`。

### 11.4 v0.1 发布检查单

1. CI 全绿（typecheck / vitest / validate:data / build）
2. AC-01：NSIS 安装包在**未装 Node 的全新 Windows 机器**安装运行
3. 首次启动引导走通，userData 目录可写
4. AC-08/09：损坏回退与双开防护实测
5. 卸载干净（不留孤儿文件）
6. 数据备份（设置页 JSON 导出）可用（F10 若裁，则记录为 v0.2 必补项）

---

## 12. 风险与对策

| 风险 | 对策 |
|---|---|
| 释义准确性 | schema 校验 + 人工 review + 标注权威出处 + `verifiedBy` 可追溯 |
| AI 生成释义有误（幻觉） | draft 必过用户确认 + 可编辑 + 双入口校验；正式库仍走人工过审 |
| API key 与网络依赖 | safeStorage 加密；缓存离线可用；无 key 降级纯本地（aiMode 四态） |
| 真题例句版权 | 简短引用 + 注明卷别，不搬运整卷 |
| 种子库整理耗时 | MVP 只做 50–100 精品（≈5–8h），管线自动化放 v0.3 |
| **AI 生成质量不达标** | v0.3 先试点 20 条全量过审，达标后再批量（§9） |
| **schema 返工** | v0.1 开发期 schema 冻结（§5），演进走 schemaVersion 迁移 |
| Electron 包体大 | MVP 先接受（~100MB），v1.0 评估 Tauri / SQLite |
| **electron 二进制下载失败** | npmmirror 镜像 + CI 缓存 |
| **SmartScreen / 杀软误报** | 安装说明引导「更多信息 → 仍要运行」；v1.0 评估代码签名 |
| 进度数据损坏（崩溃/断电） | 原子写 + .bak 回退 + `.corrupt` 保留 + 单实例锁 + 启动校验 |
| 全局快捷键被占用 | 降级应用内快捷键 + 设置页可改键 |
| 多开并发写冲突 | `requestSingleInstanceLock()` + main 写队列 |
| AI 查询烧钱 | 缓存 + 限流 + 每日配额提示 |
| **bus factor** | 本文档即契约（唯一事实来源）；数据审查制度不依赖单点 |
| **范围蔓延** | §7.3 冻结清单 + §7.4 DoD，新增需求先进路线图 |

---

## 13. 里程碑排期与工作量

### 13.1 里程碑（单人开发，周粒度）

| 里程碑 | 周期 | 交付 | 关键路径 |
|---|---|---|---|
| M1 基座 | 第 1 周 | T0/T1/T2a/T3 + T2b 词条初稿 | **种子库人工过审**（5–8h，需真人，尽早启动） |
| M2 浏览闭环 | 第 2 周 | T4/T5/T6（列表/详情/快速记录） | T3 数据访问先行 |
| M3 复习闭环 | 第 3 周 | T7/T8/T9（闪卡/自测/进度+设置） | 无 |
| **v0.1 发布** | 第 3 周末 | NSIS 包 + AC 走查 + DoD | §11.4 检查单 |
| v0.2 | 第 4–6 周 | AI 闭环 + SM-2 + 错题统计 + E2E | AI provider 抽象 |
| v0.3 | 第 7–10 周 | 内容管线 + 库扩 300+ | 人工过审吞吐 |
| v0.4 | 第 11–13 周 | 专项训练 + 导入导出 + 暗色 | — |
| v1.0 | 第 14–16 周 | 跨平台 + 发布 | 签名/公证 |

### 13.2 工作量估算（人日，单人）

| 任务 | 估算 | 备注 |
|---|---|---|
| T0 测试基建 | 0.5 | |
| T1 脚手架 | 0.5 | 含 pnpm 配置坑 |
| T2a schema + 校验 | 0.5–1 | 双入口 + 词表 |
| T2b 种子库 | 1.5 + 5–8h 真人过审 | 关键路径 |
| T3 数据访问 + IPC | 1–1.5 | 写队列 + contracts |
| T4 列表 / T5 详情 | 各 1 | 可并行 |
| T6 快速记录 | 1.5 | pinyin-pro + 弹层 |
| T7 闪卡 / T8 自测 | 各 0.5–1 | 可并行 |
| T9 进度 + 设置 + 打包 | 1.5 | 打包坑预留 |
| 缓冲 | 2 | |
| **合计** | **≈ 12–15 人日（2–3 周）** | |

---

## 14. 执行计划（给"创建项目"的新对话）

> 本对话只负责规划。把本文档交给新对话，即可按此清单执行，无需重新讨论需求。

### 14.1 环境（已确认）

- Node.js v24.19.0 / pnpm 11.24.0 / Git 2.45.2（本机就绪）
- 未安装 Rust —— 与 Electron 方案无关，无需处理

### 14.2 初始化步骤

1. `git init` + `.gitignore`（`node_modules/ out/ dist/ *.log`；`userData` 不入库）
2. `pnpm create @quick-start/electron` 选 Vue + TypeScript 模板（electron-vite）
3. 安装依赖并**锁定版本**（`pnpm add` 写入 package.json）：`vue-router` `pinia` `naive-ui` `pinyin-pro` `electron-log` `ajv`（deps）；`vitest` `@vue/test-utils` `jsdom` `vue-tsc` `electron-builder`（dev）
4. **pnpm 配置（T9 打包前置）**：`.npmrc` 设 `node-linker=hoisted` + `electron_mirror=https://npmmirror.com/mirrors/electron/`；`package.json` 配 `pnpm.onlyBuiltDependencies: ["electron", "esbuild"]`
5. electron-builder 配置 NSIS（`appId: com.yuzhan.app`，`productName: 语栈`）
6. 项目名 **语栈 yuzhan**，仓库结构按 §4；首提交

### 14.3 任务拆解（WBS，带依赖 / 并行 / 验收）

| # | 任务 | 依赖 | 验收（引用 §7.2 AC） | 并行 |
|---|---|---|---|---|
| T0 | 测试基建：Vitest + 配置 + 首个纯函数用例 | — | `vitest run` 通过 | ∥ T1 |
| T1 | 脚手架：electron-vite + 依赖 + pnpm 配置 | — | 窗口弹出、HMR 正常 | ∥ T0 |
| T2a | 数据层：`shared/schemas`（draft/full 双入口 + tags/exams 词表）+ `validate:data` 脚本 | T1 | AC-10（空库零错误） | ∥ T3 |
| T2b | 种子库：首批 50–100 词条（AI 初稿 → draft 校验 → **人工过审关卡**） | T2a | AC-10 全量 + 过审清单存档；**必须停下等真人验收（§9.4）** | 关键路径 |
| T3 | 数据访问：store.ts（原子写/写队列/.bak 回退/单实例锁）+ `shared/ipc/contracts.ts` + electron-log 接线 | T1 | AC-08、AC-09 | ∥ T2a |
| T4 | 列表页：搜索（汉字/拼音/首字母/模糊）+ 频次/首字过滤 + 虚拟滚动 | T3, T2b | AC-07 | ∥ T5 |
| T5 | 详情卡片：释义/出处/色彩/语域/辨析折叠/真题例句 | T3, T2b | AC-02 | ∥ T4 |
| T6 | 快速记录本地版：Ctrl+K + pinyin-pro 检索 + 命中动作 + 生词本 | T3, T2b | AC-03、AC-04 | 与 T4/T5 并行 |
| T7 | 闪卡：认识/不认识 + 收敛规则 + 撤销 + 会话小结 | T3, T2b | AC-05 | ∥ T8 |
| T8 | 自测：10 题组 + 出题规则 + 即时反馈 + 错题 | T3, T2b | AC-06 | ∥ T7 |
| T9 | 进度页 + 设置页 + NSIS 打包 | T4–T8 | AC-01、AC-09、DoD（§7.4） | — |

### 14.4 给新对话的 briefing 模板

```
实现「语栈」v0.1 MVP：Electron + Vue3 + TS + electron-vite。
完整需求与设计见 PLAN.md（§3 信息架构 / §4 技术架构 / §5 数据模型 / §7 MVP / §10 快速输入 / §14 执行计划）。
按 §14.3 任务表 T0→T9 执行，每步按 AC 验收（§7.2）后再进下一步；
关键人工介入点：T2b 种子库过审必须停下等真人验收（§9.4 checklist 存档），未过审不得标记 reviewed；
环境：Node 24 / pnpm 11（§14.2 配置，含打包前置）；仓库：<git remote>；
阻塞或验收失败时上报并给出证据，不自行修改设计（设计变更须更新 PLAN.md 附录 B）。
```

---

## 15. 附录

### A. 术语表

| 术语 | 定义 |
|---|---|
| quality | 词条质量态：draft（AI 初稿）/ user（个人确认）/ reviewed（人工过审） |
| library | 词条归属：official（正式库）/ user（个人库）；组合约束 official⟹reviewed |
| 误用类型 | 成语在考试中的 8 类典型误用（§5.2，判定表为准） |
| 辨析组（near） | 近义成语组，考试核心考点；diff 一句话说清区别 |
| 生词本（pending） | 未收录词条的暂存队列（userData/pending.json） |
| userData | Electron 用户数据目录（进度/生词本/缓存/配置），运行时读写 |
| safeStorage | Electron 系统级加密存储（Windows DPAPI），apiKey 存这里 |
| schemaVersion | 数据模型版本，字段演进需迁移脚本 |
| aiMode | AI 查询状态机四态：disabled/configured/online/error（§10.2） |
| DoD | Definition of Done，完成定义（§7.4） |
| 语料快照 | 固定版本真题语料，frequency 分档的统计基准（§5.4） |

### B. 修订历史

| 版本 | 变更摘要 |
|---|---|
| v1.0 | 头脑风暴定稿：定位、技术栈、数据模型、MVP、路线图、开源治理 |
| v1.1 | 架构评审（17 条）：修正 schema 重复 key、id 规则、持久化铁律、IPC 清单、pinyin-pro、快捷键容错、受控词表、E2E 提前等 |
| **v2.0** | **四视角深度评审（产品 19 / 架构 18 / 数据 18 / 执行 17）整合：新增 §0 导览、§2 用户故事、§3 信息架构（路由/交互/空态/关窗决策）、§6 内容策略（覆盖矩阵）、§9 管线细节（提示词大纲/失败分类/checklist）、§13 里程碑；细化误用类型判定表（8 类 + 优先级）、emotion/register 正交拆维、tags/exams 独立词表、frequency 快照口径、schema 双入口、IPC 统一信封与写队列、aiMode 状态机、T0 测试基建、T2 拆分人工过审关卡、AC 验收用例表、发布检查单、pnpm/electron-builder 配置坑、风险补 6 类、工作量与里程碑排期** |
| **v0.1.1** | **UI 视觉重构（用户要求，2026-08-31）：参考 OpenAI 官网简洁风格——浅色极简主题、细边框/大留白/卡片化布局、克制的强调色与清晰文字层级、多样化页面布局（浏览类/互动类差异化）；仅视觉与样式层调整，信息架构（§3.1/§3.2）、功能清单（§7.1）、数据模型（§5）、IPC 契约（§10.4）、持久化铁律均不变；data-testid 保持稳定以维持 145 项测试全绿** |
| **v0.1.2** | **五项交互/UI 修复（用户要求，2026-08-31）：① 快速记录快捷键——排查并修复 Ctrl+K 失效，新增「+」键（含 = / 数字键盘 Add）直接触发（§3.3/§10.2 快捷键扩展，renderer 应用内 + main globalShortcut 双通道）；② 闪卡牌堆随机抽取（Fisher-Yates，随机源可注入保证测试确定性，§3.3 单卡流顺序改为随机）；③ 自测模块 UI 水平居中（§3.3 自测交互，仅布局）；④ 成语库删去「首字」筛选（§7.1 F3 过滤收敛为仅频次；listFilters 首字函数移除，搜索与频次过滤保留）；⑤ 用户可见文案去英文——状态标签 mastered/learning/new 改中文（已掌握/学习中/新词），AI 模式四态（disabled/configured/online/error）改中文（未配置/已配置/在线/异常），其余散落英文（loading/retry 等）一并本地化；data-testid/class 与功能逻辑不变，测试同步更新，vitest 保持全绿** |
| **v0.1.3** | **交互调整（用户要求，2026-08-31）：① 快速记录触发键重构——移除 Ctrl+K 硬编码唤起，改为设置页自定义按键（按键捕获器写入 settings.quickInputShortcut，renderer 动态生效），默认「+」键；UI 不再显示英文 accelerator 串「CommandOrControl+K」（顶栏/弹层/设置页改中文或自定义展示）；② 成语库列表频次筛选视觉重设计——不再以「序号+词语数」呈现，改为简洁视觉化表现（点阵/分段条等，计数移入副行或 tooltip），保留频次 1–5 过滤能力；③ 数据模型与 IPC 契约不变** |
| **v0.2 启动** | **v0.2 里程碑启动（用户确认按 §8 全量，2026-08-31）：① SM-2 间隔重复——§5.6 用户进度模型扩展 review.interval/ease/due 字段，userData/progress.json 启动迁移补默认值（due=now、interval=0、ease=2.5），shared/lib/sm2.ts 纯算法落地；② AI 错词闭环——§10 ai.ts Provider 抽象（OpenAI 兼容/Ollama/mock）、aiMode 四态激活、ai:searchWord 落地、API key safeStorage 加密配置、缓存 LRU 200/限流/超时重试取消，快速输入预览确认面板（draft 可编辑/混淆词勾选/写个人库 quality=user→闪卡队列），生词本批量 AI 补全；③ 错题本 + 误用类型统计、掌握度仪表盘（§8）；④ 托盘常驻 + 全局快捷键（§3.4/§10.2）；⑤ Playwright E2E 主流程「记录→复习→自测」（§4.8 v0.2 起）** |
| **v0.2 补充** | **v0.2 实施期补充设计（2026-08-31，实现推进中）：① 个人库落地——§10.1「写个人库 quality=user」的具体存储：userData/idioms-user.json（原子写+.bak 复用持久化铁律），新增 IPC channel `user:list`/`user:add`（§10.4 权威清单扩展，renderer 检索池=正式库+个人库合并）；② aiMode 变更写盘幂等（模式未变化不写盘，防 teardown/竞态未处理拒绝）；③ 设置页 AI 配置扩展（baseURL/模型白名单可配）** |
| **v0.2.1** | **批量导入 + 默认设置调整（用户要求，2026-09-01）：① 设置默认值——AI 端点 `https://api.deepseek.com`、模型 `deepseek-v4-flash`（§10.2 常量 `DEFAULT_AI_BASE_URL`/`DEFAULT_AI_MODEL`，store 默认值/设置页占位符同步）；主进程 config.json 默认快捷键改 `'Plus'`（与 renderer 默认「+」一致）；测试夹具同步更新，typecheck 通过（vitest 因沙箱限制未在本会话运行）。② 高频成语批量导入——新增 §6.3：从 `E:\杂项\言语真题` 756 份试卷**仅选项**统计词频，分两批导入四字成语——高频档（出现≥20 次）447 张 + 全量补齐档（出现 2–19 次、筛除非成语片段约 500 词后）2093 张，**正式库累计 2600 张**（AI 释义、`verifiedBy=AI导入`、frequency 按本批出现次数分档、例句全部 `kind=made`），新增 `data/scripts/import-exam-vocab.mjs` / `import-content.json` / `import-report.json`；`pnpm validate:data` 2600 文件 0 错误。数据模型（§5）与 IPC 契约（§10.4）不变** |
| **v0.2.2** | **体验修复 + 新功能 + 视觉重设计（用户要求，2026-09-01）：① BUG——自测错题 `quiz:record` 传 Vue reactive Proxy 致 IPC「An object could not be cloned」，改传纯对象修复；② 频次分档明确化——档位含义（5档=真题出现80次以上/4档=45–79/3档=10–44/2档=5–9/1档=2–4及教研备用）展示于筛选与行 tooltip（§6.3 口径），替换抽象点阵；③ 成语库多列网格（自适应列数虚拟滚动），同档按真题出现次数排序、可升降序切换，卡片新增 `occurrences` 字段（§5 schema 扩展）；④ AI 快速模式——请求体带 `thinking:disabled` 关闭思考提速，设置页可开关（§10.2）；⑤ 自测选项去除释义括号提示（避免暴露答案，§3.3）；⑥ 闪卡/自测抽题支持频次档位选择（§3.3）；⑦ 易混淆成语库——新增 §6.4 `data/pairs.json` 86 对 + `pairs:list` IPC + `/confusable` 页面；⑧ 视觉重设计——依 anthropics/skills/frontend-design 方法论刷新设计 token（暖中性色板/字体栈/大圆角/分层阴影）、侧边品牌与激活态；⑨ 新增 3 个教研备用词卡片（不可救药/泰然自若/无所不至，frequency=1）支撑易混对。typecheck 通过，`pnpm validate:data` 2603 文件 0 错误（vitest 仍因沙箱限制未在本会话运行）** |
| **v0.2.3** | **性能优化 + 易混淆修复 + 深度 UI（用户要求，2026-09-01）：① 性能——启动卡顿根因是 data:list 全量载荷 + renderer 启动时对 2600+ 词条逐个跑 pinyin-pro 全读音建索引（数秒）；修复：预生成检索索引缓存 `data/search-index.json`（§6.3 工具）随 data:list 下发、renderer `createSearchIndexFromCache` 免实时计算；列表 IPC 载荷剥离 `examples/origin`（详情页改经 `data:get` 按需拉全量），列表/自测/闪卡流畅；② 易混淆页空——旧构建未含新 IPC/数据，重新构建后生效，页面补空态提示；③ 深度 UI——依 frontend-design skill 方法论重做：详情页（渐变顶饰、频次档徽标+出现次数、分区标题主色条）、闪卡正面主色渐变、自测选项圆形字母徽标+hover 浮起、全局选中色/焦点环、品牌渐变徽标等；④ 重新构建 `out/` 产物（typecheck + electron-vite build 通过）。注意：词条变更后需重跑 `build-search-cache.mjs`；`pnpm validate:data` 2603 文件 0 错误** |
| **v0.2.4** | **体验修复 + 功能补齐 + 全局 UI 重构（用户要求，2026-09-01）：① 成语库卡顿根治——items 改 shallowRef（免 2600+ 对象深响应式代理）、主进程 data:list 预排序（频次档→出现次数→id，默认视图零排序成本）；修复卡片元信息（频次/褒贬/出现次数）溢出卡片问题（出现次数移至拼音行）；② 易混淆页——补 word→id 详情跳转、语料预加载、数量展示；③ 自测错题进错题本——新增 `progress:list` IPC + progress store `load()`（启动/自测结束/错题本页从 main 全量同步），错题本/进度页读取持久化数据；④ 自测历史——新增 `quiz:history:list/add` IPC + userData/quiz-history.json（保留最近 200 条），自测页展示最近成绩列表；⑤ 全局 UI 重构——Naive UI 主题全面升级（按钮/输入/卡片/标签圆角与字重、胶囊标签）、body 主色径向渐变光晕、侧栏底部语料统计（语料 N 词）、结果计数胶囊化、筛选条标签强化；⑥ 重新构建 `out/`。typecheck 通过，`pnpm validate:data` 2603 文件 0 错误（vitest 仍因沙箱限制未在本会话运行）** |
| **v0.2.5** | **仪表盘首页 + 成语库分页 + 排序语义修正 + 测试修复 + 反"默认感"UI（用户要求，2026-09-01）：① 仪表盘首页——路由 `/` 由重定向改为 DashboardPage（渐变欢迎区+最近自测正确率、语料/学习中/已掌握/错题/易混对统计卡、6 个功能入口大卡片），侧栏新增「首页」导航；② 成语库分页——每页 100 条、滚动触底/「加载更多」按钮增量加载、搜索/筛选/排序变化自动回第一页、底部「已显示 X/Y」状态条（IdiomVirtualList 新增 `limit` prop 与 `bottom` 触底事件）；③ 排序语义修正——**搜索命中保持 search() 相关度顺序（层级→频次→id）不再按档位重排**；无关键字浏览时按档位+出现次数**稳定排序**（同档同次返回 0，保持加载顺序）；④ 卡片溢出根治——卡片高度 78→90px（`box-sizing`+meta 溢出兜底），虚拟列表 cellHeight 同步 90；⑤ 测试修复——6+4 个失败全绿：detail 频次断言改档位徽标、虚拟滚动断言按新参数（10 行/61200px/14 行 item-051..064）、7 个测试文件 mock 补齐 `pairs.list`/`progress.list`/`quiz.history`、progress store `load()` 改**合并语义**（main 数据补进内存、本地未落盘写入优先）；⑥ 反"默认感" UI（参考 [kesslerio/taste-skill](https://github.com/kesslerio/taste-skill) 与 [pbakaus/impeccable](https://github.com/pbakaus/impeccable)）——暖纸色板（bgPage #FAF9F7）+ 深墨文字（#161617）、侧栏品牌区改主色渐变块（白字）、成语卡片 hover 抬升+主色左指示条；⑦ 生词本页新增「如何使用」引导卡（①记②补③学④清）；⑧ 易混淆页新增**旧版检测**（preload 无 pairs API 时明确提示需重新构建/重装，避免空白）；⑨ 搜索栏/快速记录 placeholder 精简（去长提示语）；⑩ 重新构建 `out/`。typecheck 通过、vitest 全绿（296 通过 / 1 跳过）、`pnpm validate:data` 2603 文件 0 错误** |
| **v0.2.6** | **「墨韵」全局 UI 重构 + 交互迭代 P0（用户要求，2026-09-01）：UI 重构部分——① 设计方向：参考 anthropics/skills/frontend-design、kesslerio/taste-skill、pbakaus/impeccable（Operate 模式）方法论，自旧青绿 OpenAI 风彻底转向**墨韵 · Ink & Paper**：暖宣纸底（#F7F5F0）+ 深墨文字（#1C1B18）+ 朱砂主色（#C0432C）+ 苔绿/赭石/墨蓝支持色；衬线展示字（Noto Serif SC 系统字体，词形/页标题/印章），UI 正文无衬线，数字 tabular-nums；② Token 体系——designTokens.ts 重写（font-serif + motion token），main.ts applyTheme 注册全部 `--y-*`，global.css 重写（宣纸径向墨晕背景、共享工具类 .y-card/.y-page/.y-state/.y-seal/.y-count-pill、路由页过渡 y-page），naiveTheme.ts 对齐新色板；③ 应用壳——App.vue 重构（朱砂印章「语」+ 衬线品牌 + 导航激活态 + 顶栏页名 route.meta.title + RouterView y-page 过渡），router 补 meta.title；④ 各页视觉重建（仪表盘墨晕欢迎区/成语库衬线标题+朱砂筛选/详情页印章+分区眉题/闪卡宣纸正反面/自测/进度/错题本/生词本/易混淆/设置/快速弹层）；⑤ 硬约束——全部 data-testid/关键 class/文案/虚拟滚动几何（cellHeight 90 + gap 12）保持，仅视觉层重建。**交互迭代 P0（§16.3）**——⑥ 闪卡键盘快捷键：1=认识 / 2=不认识 / 空格=下一张 / U=撤销（输入框聚焦防误触，4 项新测试）；⑦ 快速记录剪贴板自动填充：唤起时剪贴板为纯 2–8 汉字自动填入（clipboardToQuery 纯函数 + 组件接线）；⑧ 暗色模式：designTokensDark「暖墨夜」双主题 + applyTheme(theme) 单入口 + Naive UI darkTheme + 设置页「外观」开关（theme-switch）+ IPC 契约 theme 字段 + config.json 持久化（默认 light，非法值清洗），程序化验证 8/8；⑨ 个人库落盘（修复 v0.2 已知限制 #1）：`user:list`/`user:add` IPC + `userData/idioms-user.json` 原子写/.bak 回退/损坏自愈 + user store 响应式快照（检索池=正式库+个人库）+ quickRecord 注册表持久化接线（重启可加载、按词形去重）。**测试与验证**——typecheck 0 错误、vitest 307 通过+1 跳过（+11 项新测试：闪卡快捷键 4 / clipboard 1 / IPC user+theme 3 / store 个人库+主题 3）、`pnpm validate:data` 2603 文件 0 错误、electron-vite build 通过、Playwright E2E 1 passed（修复默认路由改仪表盘后的导航失配：先等语料统计→导航成语库→词条行可见断言）、程序化视觉自检 15/15、暗色模式 8/8、13+1 页截图留证于 `.ui-shots/`（gitignore）；自检脚本 `capture.cjs`/`verify.cjs`/`verify-dark.cjs` 留存。**交互迭代 P0-⑤（用户反馈，§16.4）**——⑩ 自测选项区分度：shared/lib/quiz.ts 重写干扰项生成（createDistractorIndex 倒排索引 + confusableScore 混淆度评分：near/pairs=100 → 共享≥2字=16 → 同尾=8 → 同首=5 → 同tag=2 → 同频=1；near/pairs 对端第二遍映射防顺序依赖）、难度档位 easy/standard(默认,至少1高相似)/hard(实测90%高相似)、QuizHint 易混辨析提示（答错展示「易与 X 混淆：diff」）、QuizPage 难度选择器 + quiz store difficulty/pairs 透传 + QuizQuestionCard q-confusable 面板；真实数据基准：索引 3ms / 组卷 27ms，standard 高相似干扰 46%、示例「大相径庭」干扰项含语义近似"形容差别极大"；新增 10 项测试（引擎 6 / 易混提示 3 / 难度 1），vitest 累计 317 通过+1 跳过**；**v0.2.6 修复批（用户反馈 12 项）**——⑪ 修复 pairs:list IPC 契约漂移（main 返回数组→{pairs}，易混淆页/仪表盘崩溃根因，易混淆页 86 对完整显示）；⑫ 首页入口图标 path 拆分修复（数组化，图标正常渲染）；⑬ 快速记录每次打开清空搜索记录；⑭ 生词本引导卡序号徽标对齐（序号圆徽与文字分离）；⑮ 成语库分页（每页 50/100/200/500 自选 + 页码切换，替换滚动加载）；⑯ 自测 target 分层随机（错词≤ceil(size/3) 复测 + 高频/其余层内洗牌，修复"永远同一批词"，实测换一组题目变化）；⑰ 详情页易混淆词区块（ConfusableWords：near/pairs/形近计算 + 跳转链接 + 辨析说明）；⑱ 自测「换一组」（答题中重新组卷）+ 详细练习记录（quiz-history details 每题词条/对错 + 历史展开）；⑲ 批量 AI 补全无 key 时点击引导去设置页（不再单纯禁用）；⑳ 设置页精简（文案与间距）。交互实测 9/9；vitest 326 通过+1 跳过** |
| **v0.2.7** | **P1 体验迭代（§16.3 P1，2026-09-01）：① 自测反向题型——`meaning-to-word`（给释义选成语，考场逻辑填空反查）：QuizMode 双题型、buildOptionsFor 支持反向构建（选项=易混词形，复用混淆度引擎）、QuizQuestionCard 按题型渲染（释义题干+衬线词形选项+「答案：词——释义」考点）、QuizPage 题型选择器（正向/反向/混合，混合=交替各半、反向避免与正向重复）；② 每日目标——首页「今日 X 张到期复习」横幅（朱砂「今」印 + 直达闪卡按钮，todayDueCount 复用）；③ 完整备份——`backup:export` IPC + `exportUserDataJson`（全量 userData 主 .json，排除 .bak/.tmp/.corrupt）+ 设置页「导出完整备份」按钮。验证：vitest 331 通过+1 跳过（+5 项：反向题型引擎/反向渲染/混合模式/backup ipc/backup store）、typecheck 0、build 通过、E2E 1 passed、P1 交互实测 6/6（反向题示例：「刮目相看」释义题干 + 干扰项「另眼相看」）** |

---

## 16. 头脑风暴与体验迭代计划（2026-09-01）

> 由执行者按「用户/客户视角 → 工程视角」两轮头脑风暴产出，优先级定稿后写入本文档作为 v0.2.6+ 迭代依据。
> 原则：先修已知限制与交互效率（低成本高感知），再延伸功能与内容；每项按 AC 验收、测试全绿。

### 16.1 头脑风暴第一轮：用户视角 + 客户视角（备考者的真实一天）

| # | 洞察 | 机会点 | 评估 |
|---|---|---|---|
| U1 | 刷题在网页/App 里，切到语栈要打字，记录成本高 | 快速记录弹层唤起时**自动填充剪贴板四字词**（零打字）；全局快捷键/托盘已就绪 | ★★★ 低成本高感知 |
| U2 | 闪卡全靠鼠标点按钮，桌面端效率低 | **闪卡键盘快捷键**（1=认识 / 2=不认识 / 空格=下一张 / U=撤销） | ★★★ 低成本高感知 |
| U3 | 自测题型单一（只会"给成语选释义"），考场是"给语境选词" | 扩展**语境选词（逻辑填空式）**与**释义选词（反向）**题型，组卷纯逻辑进 shared/lib | ★★★ 中成本高价值 |
| U4 | 不知道自己弱在哪 | 自测答错时呈现**该词 near 辨析**（"你混淆了 X 与 Y"）+ 误用类型归因 | ★★ 低成本 |
| U5 | 每天该干什么没有指引 | **每日目标**（今日复习 N 张/自测 M 组）+ 首页「今日到期」直达入口 | ★★ 中成本 |
| U6 | 备考几个月的数据怕丢 | 设置页**一键完整备份**（userData 打包）+ 定期自动备份 | ★★ 中成本 |
| U7 | 成语靠故事记得牢 | v0.3 内容工程补「典故」字段；AI 批量生成语境例句补全 2600 词条 | ★★ 内容工程 |
| U8 | 晚间学习刺眼 | **暗色模式**（token 化已就绪，双主题表 + 设置开关 + 持久化） | ★★ 低成本高感知 |

### 16.2 头脑风暴第二轮：工程视角（架构健康度与延伸）

| # | 洞察 | 机会点 | 评估 |
|---|---|---|---|
| E1 | **已知限制（v0.2 记录在案）**：个人库（quality=user）仅会话内注册表、重启不加载 | 补 `user:list`/`user:add` IPC + `userData/idioms-user.json` 原子写落盘（复用持久化铁律），renderer 检索池=正式库+个人库 | ★★★ 必修（欠账） |
| E2 | SM-2 迁移是单点实现 | 抽通用 migrate 管线（progress/personal/config 统一版本迁移） | ★★ 重构 |
| E3 | 主题工程化 | dark token 表 + `color-scheme` 切换，一举覆盖 Naive UI 与全站 var | ★★（并入 U8） |
| E4 | Dashboard/Confusable/Progress 缺组件级测试 | 新功能一律抽纯逻辑进 shared/lib + 组件测试补齐 | ★★ 质量债 |
| E5 | 启动解析体积 | 路由级 lazy import 减少启动解析 | ★ 性能 |
| E6 | 延伸功能（v0.3+/v0.4 路线） | 模拟真题模式（带倒计时）、TTS 朗读、Anki 导出、学习周报、悬浮窗、易混淆专项训练 | ★ 排期 |

### 16.3 定稿迭代计划（P0 本轮实施，P1/P2 入路线图）

| 批次 | 项 | 验收 |
|---|---|---|
| **P0（v0.2.6 后半）✅ 已落地** | ① 闪卡键盘快捷键（1/2/空格/U）✅；② 快速记录剪贴板四字词自动填充 ✅；③ 暗色模式（双主题 + 设置开关 + 持久化）✅；④ 个人库落盘（user:list/add + idioms-user.json）✅；⑤ 自测选项区分度（干扰项混淆度引擎 + 难度档位 + 易混辨析提示，§16.4）✅ | vitest 317 通过+1 跳过、typecheck 0、build 通过、E2E 1 passed、真实数据基准（索引 3ms / 组卷 27ms，standard 高相似干扰 46% / hard 90%） |
| **P1（v0.2.7）✅ 已落地** | ⑥ 自测反向题型（释义选词，给释义选成语；题型选择器 正向/反向/混合，混合=交替各半）✅；⑦ 每日目标（首页"今日 X 张到期复习"横幅 + 直达闪卡）✅；⑧ 完整备份（backup:export 全量 userData JSON 导出，设置页「导出完整备份」）✅ | vitest 331 通过+1 跳过、typecheck 0、build 通过、E2E 1 passed、P1 交互实测 6/6 |
| P2（v0.3） | 典故字段与 AI 例句批量、migrate 管线、路由 lazy、模拟真题、TTS、Anki 导出、语境选词题型（依赖例句数据）、误用类型定向 | 按路线图 |

### 16.4 第二轮迭代：自测选项区分度（用户反馈，2026-09-01）

> 用户反馈：**自测题目选项之间差距太明显，拿不相关词语做辨析太简单**——希望选项像真题一样"长得像"。
> 执行者据此开展多轮头脑风暴（出题人/教研/数据/工程角度）并落地。

**多轮头脑风暴：**

| 轮次 | 角度 | 洞察 | 采纳 |
|---|---|---|---|
| R1 | 考生 | 真题逻辑填空干扰项 = 近义词/形近词辨析；"给成语选释义"同样应给"像的释义" | ★ 核心 |
| R1 | 出题人 | 干扰项混淆度分档：near 对端 / 易混对 / 同尾字 / 同首字 / 同主题，按"长得像"排序 | ★ 核心 |
| R2 | 教研 | 干扰项要带"考点"：选错时讲清"你混淆了 X 与 Y 的区别"（near.diff / pairs.diff） | ★ 采纳 |
| R2 | 数据 | near 覆盖仅 2.3%（60/2603）、pairs 86 对、tags 100% 但太粗（8 主题数百词/主题）→ 不能只靠人工标注，需**计算相似度**兜底 | ★ 采纳 |
| R3 | 工程 | 2603² 两两算分不可行 → **倒排索引**（首字/尾字/tag/词形/near/pairs）+ 候选集打分，毫秒级 | ★ 采纳 |
| R3 | 产品 | 难度档位（简单/标准/困难）让用户自选区分度；答错展示易混辨析提示强化记忆 | ★ 采纳 |
| R4 | 延伸 | 误用类型定向出题、语境选词题型、形近对自动发现回写数据（v0.3 内容工程） | 排期 |

**可行性分析：** 数据上 near/pairs 稀疏但 tags/字形/拼音可用 → 评分引擎兜底可行；性能上索引 O(n) + 每题 O(候选集) 实测 2603 词 3ms/27ms，满足 §4.7 预算；纯函数可单测（随机源注入）。**结论：可行，落地为 P0-⑤。**

**P0-⑤ 落地（shared/lib/quiz.ts 重写干扰项生成）：**
- `createDistractorIndex`：倒排索引（首字/尾字/tag/频次/词形/near/pairs 双向），near/pairs 对端**第二遍映射**（避免顺序依赖漏建）
- `confusableScore`：near/pairs 对端=100（S 级）→ 共享≥2 字=16 → 同尾=8 → 同首=5 → 同 tag=2 → 同频=1
- 难度：easy（同主题宽松）/ **standard（默认：至少 1 个高相似干扰）** / hard（优先全高相似，实测 90%）
- `QuizHint` 易混辨析提示：干扰项来自 near/pairs 时生成「易与 X 混淆：diff」，答错展示（q-confusable）
- QuizPage 难度选择器（quiz-difficulty-*）、quiz store difficulty/pairs 透传、QuizQuestionCard 易混提示面板
- 验证：引擎 6 + 易混提示 3 + 难度 1 共 10 项新测试；真实数据基准 standard 高相似干扰 46%、hard 90%、示例题「大相径庭」干扰项含"形容差别极大"（语义近似）；索引 3ms/组卷 27ms
