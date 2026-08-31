# shared/schemas — 语栈数据模型 JSON Schema（§5）

- `idiom.schema.json` — $defs 母版（属性定义单一事实来源，§5.1）
- `idiom.full.json` — 严格入口（正式库 `data/idioms/` 用，required 字段齐全，§5.7#2）
- `idiom.draft.json` — 宽松入口（AI 初稿 `data/drafts/` 用，仅要求 id/word/pinyin，缺字段标记待补充）

双入口由同一份 `$defs` 组合导出（§5.7 架构决策），required 差异由入口文件控制，避免两处漂移。
校验器：ajv v8（draft-07）。入口文件通过绝对 `$id` 引用母版 `$defs/idiomProperties`，编译前须先 `ajv.addSchema(idiom.schema.json)`（见 `data/scripts/validate-data.mjs`）。

运行校验：`pnpm validate:data`（§5.7 八条约束 + §5.3 词表自检 + 双入口）。
