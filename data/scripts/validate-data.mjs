#!/usr/bin/env node
/**
 * 语栈 · pnpm validate:data — 数据一致性校验脚本（T2a，§5.7）
 *
 * 双入口（§5.7 架构决策）：
 *   - data/idioms/   → idiom.full 严格校验（正式库，按首字拼音分区，跳过 tags.json/exams.json）
 *   - data/drafts/   → idiom.draft 宽松校验（AI 初稿，缺字段仅警告标记待补充）
 *
 * 约束覆盖（§5.7 第 1–8 条）：
 *   1  id 全库唯一（跨首字分区合并校验；draft 与正式库 id 冲突亦报错）
 *   2  required 字段齐全（full 由 schema 强制执行；draft 缺字段 → 警告清单）
 *   3  受控枚举：emotion/register/errorTypes/tags/exams/examples.kind/quality/library；
 *      examples.kind=exam 必须带 exam 卷别且引用 exams.json
 *   4  组合约束 library=official ⟹ quality=reviewed
 *   5  frequency∈1–5；near[].diff 非空；near≤5 / examples≤3 / tags≤4（errorTypes≤2 见 §5.2）
 *   6  near/opposite 引用库内词条的存在性（不在库内仅警告）
 *   7  quality=reviewed 必须带 updatedAt 与 verifiedBy
 *   8  id 拼音 slug 与 pinyin 推导一致（多音字例外清单 polyphone-exceptions.json）
 *
 * 另含 §5.3 词表自检：tags.json（≤30、无重复、非空）、exams.json（年份-考试类型-卷类/省 格式、无重复）。
 *
 * 退出码：0 = 零错误（警告不影响退出码）；1 = 存在错误。
 * 校验器：ajv v8（draft-07）。
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import Ajv from 'ajv'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..')
const SCHEMA_DIR = join(REPO_ROOT, 'shared', 'schemas')
const DATA_DIR = join(REPO_ROOT, 'data')
const IDIOMS_DIR = join(DATA_DIR, 'idioms')
const DRAFTS_DIR = join(DATA_DIR, 'drafts')
const EXCEPTIONS_FILE = join(SCRIPT_DIR, 'polyphone-exceptions.json')

/** 词表文件名（data/idioms/ 下的非词条文件，扫描时跳过） */
const VOCAB_SKIP = new Set(['tags.json', 'exams.json'])
/** full 入口 required 全集（§5.7#2 + schemaVersion），draft 完整性警告以此为基准 */
const FULL_REQUIRED = [
  'schemaVersion', 'id', 'word', 'pinyin', 'meaning', 'emotion',
  'register', 'errorTypes', 'frequency', 'quality', 'library'
]
const EXAM_PATTERN = /^\d{4}-[^-]+-[^-]+$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/* ---------------------------------- 工具 ---------------------------------- */

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))

/** 递归收集目录下全部 *.json 文件（跳过 dotfile 与 skip 名单），返回 [{full, rel}]，rel 为 POSIX 相对路径 */
function* walkJsonFiles(dir, skip = new Set()) {
  if (!existsSync(dir)) return
  const stack = [dir]
  while (stack.length > 0) {
    const cur = stack.pop()
    for (const ent of readdirSync(cur, { withFileTypes: true })) {
      if (ent.name.startsWith('.')) continue
      const full = join(cur, ent.name)
      if (ent.isDirectory()) {
        stack.push(full)
      } else if (ent.isFile() && ent.name.endsWith('.json') && !skip.has(ent.name)) {
        yield { full, rel: relative(dir, full).split('\\').join('/') }
      }
    }
  }
}

/** pinyin → slug：去声调（NFD 去组合附加符）、小写、非字母序列转连字符 */
function toSlug(pinyin) {
  return pinyin
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** id → slug：去掉尾部两位序号 */
function idSlugOf(id) {
  return String(id).replace(/-\d{2}$/, '')
}

function formatAjvError(ve) {
  const at = ve.instancePath || ve.dataPath || ''
  return `${at || '(root)'} ${ve.message || '校验失败'}`
}

/* ------------------------------ 核心校验逻辑 ------------------------------ */

/**
 * 运行完整校验。返回 { errors, warnings, fullFiles, draftFiles, exitCode }。
 * @param {object} opts 覆盖默认路径（供自测注入 fixture 目录）
 */
export function runValidation(opts = {}) {
  const idiomsDir = opts.idiomsDir || IDIOMS_DIR
  const draftsDir = opts.draftsDir || DRAFTS_DIR
  const schemaDir = opts.schemaDir || SCHEMA_DIR
  const exceptionsFile = opts.exceptionsFile || EXCEPTIONS_FILE

  const errors = []
  const warnings = []
  const err = (m) => errors.push(m)
  const warn = (m) => warnings.push(m)

  /* 0) schema 加载 + ajv 编译（全/草双入口） */
  let validateFull = null
  let validateDraft = null
  try {
    const ajv = new Ajv({ allErrors: true, strict: false })
    ajv.addSchema(readJson(join(schemaDir, 'idiom.schema.json')))
    validateFull = ajv.compile(readJson(join(schemaDir, 'idiom.full.json')))
    validateDraft = ajv.compile(readJson(join(schemaDir, 'idiom.draft.json')))
  } catch (e) {
    err(`schema 加载/编译失败（shared/schemas/）：${e.message}`)
    return { errors, warnings, fullFiles: 0, draftFiles: 0, exitCode: 1 }
  }

  /* 1) 受控词表加载（缺失/损坏 → 错误，保证 T2a 交付物在位） */
  let tags = []
  let exams = []
  try {
    const t = readJson(join(idiomsDir, 'tags.json'))
    if (!Array.isArray(t.tags)) throw new Error('缺少 tags 数组字段')
    tags = t.tags
  } catch (e) {
    err(`tags.json 读取失败（${join(idiomsDir, 'tags.json')}）：${e.message}`)
  }
  try {
    const x = readJson(join(idiomsDir, 'exams.json'))
    if (!Array.isArray(x.exams)) throw new Error('缺少 exams 数组字段')
    exams = x.exams
  } catch (e) {
    err(`exams.json 读取失败（${join(idiomsDir, 'exams.json')}）：${e.message}`)
  }
  const tagSet = new Set(tags)
  const examSet = new Set(exams)

  /* 2) 多音字例外清单加载（缺失 → 警告，异常条目 → 错误） */
  let exceptions = []
  if (!existsSync(exceptionsFile)) {
    warn(`polyphone-exceptions.json 缺失（${exceptionsFile}），§5.7#8 例外放行失效`)
  } else {
    try {
      const ex = readJson(exceptionsFile)
      exceptions = Array.isArray(ex.exceptions) ? ex.exceptions : []
    } catch (e) {
      err(`polyphone-exceptions.json 解析失败：${e.message}`)
    }
  }
  exceptions.forEach((e, i) => {
    if (!e || typeof e.word !== 'string' || typeof e.pinyin !== 'string' ||
        typeof e.slug !== 'string' || typeof e.reason !== 'string' || !e.reason) {
      err(`polyphone-exceptions.json[${i}] 需含非空 word/pinyin/slug/reason 四字段`)
    }
  })

  /* 3) 收集词条文件 */
  const fullFiles = [...walkJsonFiles(idiomsDir, VOCAB_SKIP)]
  const draftFiles = [...walkJsonFiles(draftsDir)]
  const fullEntries = fullFiles.map((f) => {
    try { return { ...f, entry: readJson(f.full) } } catch (e) { err(`${f.rel}: JSON 解析失败：${e.message}`); return null }
  }).filter(Boolean)
  const draftEntries = draftFiles.map((f) => {
    try { return { ...f, entry: readJson(f.full) } } catch (e) { err(`${f.rel}: JSON 解析失败：${e.message}`); return null }
  }).filter(Boolean)

  const fullWords = new Set(fullEntries.map((e) => e.entry.word).filter(Boolean))
  const draftWords = new Set(draftEntries.map((e) => e.entry.word).filter(Boolean))

  /* 4) §5.7#1 id 唯一性（full 跨首字分区合并；draft 内部 + 与 full 冲突） */
  const idToFile = new Map()
  for (const f of fullEntries) {
    const id = f.entry.id
    if (typeof id !== 'string') continue
    if (idToFile.has(id)) err(`§5.7#1 id 重复：${id} 出现在 ${idToFile.get(id)} 与 ${f.rel}`)
    idToFile.set(id, f.rel)
  }
  const draftIdSet = new Set()
  for (const f of draftEntries) {
    const id = f.entry.id
    if (typeof id !== 'string') continue
    if (draftIdSet.has(id)) err(`§5.7#1 draft id 重复：${id} 出现在多个 draft 文件`)
    if (idToFile.has(id)) err(`§5.7#1 draft id "${id}" 与正式库 ${idToFile.get(id)} 冲突（晋升时会撞 id）`)
    draftIdSet.add(id)
  }

  /* 5) 逐词条校验（full 严格 / draft 宽松） */
  const nearOppositeWarn = (rel, label, word, pool) => {
    if (word && !pool.has(word)) warn(`${rel}: ${label} "${word}" 不在库内（§5.7#6 仅警告）`)
  }

  for (const f of fullEntries) {
    const { rel, entry } = f
    if (!validateFull(entry)) {
      for (const ve of validateFull.errors) err(`${rel}: ${formatAjvError(ve)}`)
    }
    // 首字分区目录一致性（§5.5 按首字拼音首字母分区；仅文件位于分区子目录时校验）
    const parts = rel.split('/')
    if (parts.length > 1 && typeof entry.id === 'string') {
      const firstLetter = idSlugOf(entry.id)[0]
      if (parts[0] !== firstLetter) err(`${rel}: 分区目录 "${parts[0]}" 与 id 首字母 "${firstLetter}" 不一致（§5.5 按首字拼音分区）`)
    }
    // §5.7#3 词表引用
    for (const t of entry.tags ?? []) if (!tagSet.has(t)) err(`${rel}: tags 含非受控主题 "${t}"（须引用 tags.json，§5.3/§5.7#3）`)
    for (const x of entry.exams ?? []) if (!examSet.has(x)) err(`${rel}: exams 含非受控卷别 "${x}"（须引用 exams.json，§5.3/§5.7#3）`)
    ;(entry.examples ?? []).forEach((ex, i) => {
      if (ex.kind === 'exam') {
        if (!ex.exam) err(`${rel}: examples[${i}] kind=exam 必须带 exam 卷别（§5.7#3）`)
        else if (!examSet.has(ex.exam)) err(`${rel}: examples[${i}].exam "${ex.exam}" 不在 exams.json（§5.7#3）`)
      } else if (ex.exam && !examSet.has(ex.exam)) {
        err(`${rel}: examples[${i}].exam "${ex.exam}" 不在 exams.json（§5.7#3）`)
      }
    })
    // §5.7#4 组合约束
    if (entry.library === 'official' && entry.quality !== 'reviewed') {
      err(`${rel}: library=official 必须 quality=reviewed（§5.7#4，正式库须人工过审）`)
    }
    // §5.7#7 reviewed 必带 updatedAt + verifiedBy
    if (entry.quality === 'reviewed') {
      if (!entry.updatedAt) err(`${rel}: quality=reviewed 必须带 updatedAt（§5.7#7）`)
      else if (!DATE_PATTERN.test(entry.updatedAt)) err(`${rel}: updatedAt 应为 YYYY-MM-DD（§5.7#7）`)
      if (!entry.verifiedBy || !String(entry.verifiedBy).trim()) err(`${rel}: quality=reviewed 必须带 verifiedBy（§5.7#7）`)
    }
    // §5.7#8 拼音 slug 一致性
    if (typeof entry.id === 'string' && typeof entry.pinyin === 'string') {
      const actual = idSlugOf(entry.id)
      const expected = toSlug(entry.pinyin)
      if (actual !== expected) {
        const allowed = exceptions.some((e) => e.word === entry.word && e.slug === actual)
        if (!allowed) {
          err(`${rel}: id slug "${actual}" 与 pinyin 推导 "${expected}" 不一致（§5.7#8；多音字须登记 polyphone-exceptions.json）`)
        }
      }
    }
    // §5.7#6 near/opposite 存在性（仅警告）
    for (const n of entry.near ?? []) nearOppositeWarn(rel, 'near 词', n.word, fullWords)
    for (const o of entry.opposite ?? []) nearOppositeWarn(rel, 'opposite 词', o, fullWords)
  }

  for (const f of draftEntries) {
    const { rel, entry } = f
    if (!validateDraft(entry)) {
      for (const ve of validateDraft.errors) err(`${rel}: ${formatAjvError(ve)}`)
    }
    // 双入口：draft 缺 full-required 字段 → 警告标记待补充
    for (const field of FULL_REQUIRED) {
      if (entry[field] === undefined) warn(`${rel}: draft 缺字段 "${field}"（§5.7 双入口，AI 初稿缺字段须明确标记待补充）`)
    }
    for (const t of entry.tags ?? []) if (!tagSet.has(t)) err(`${rel}: tags 含非受控主题 "${t}"（§5.3/§5.7#3）`)
    for (const x of entry.exams ?? []) if (!examSet.has(x)) err(`${rel}: exams 含非受控卷别 "${x}"（§5.3/§5.7#3）`)
    ;(entry.examples ?? []).forEach((ex, i) => {
      if (ex.kind === 'exam') {
        if (!ex.exam) err(`${rel}: examples[${i}] kind=exam 必须带 exam 卷别（§5.7#3）`)
        else if (!examSet.has(ex.exam)) err(`${rel}: examples[${i}].exam "${ex.exam}" 不在 exams.json（§5.7#3）`)
      } else if (ex.exam && !examSet.has(ex.exam)) {
        err(`${rel}: examples[${i}].exam "${ex.exam}" 不在 exams.json（§5.7#3）`)
      }
    })
    if (entry.library === 'official' && entry.quality !== 'reviewed') {
      err(`${rel}: library=official 必须 quality=reviewed（§5.7#4）`)
    }
    if (entry.quality === 'reviewed') {
      if (!entry.updatedAt) err(`${rel}: quality=reviewed 必须带 updatedAt（§5.7#7）`)
      else if (!DATE_PATTERN.test(entry.updatedAt)) err(`${rel}: updatedAt 应为 YYYY-MM-DD（§5.7#7）`)
      if (!entry.verifiedBy || !String(entry.verifiedBy).trim()) err(`${rel}: quality=reviewed 必须带 verifiedBy（§5.7#7）`)
    }
    if (typeof entry.id === 'string' && typeof entry.pinyin === 'string') {
      const actual = idSlugOf(entry.id)
      const expected = toSlug(entry.pinyin)
      if (actual !== expected) {
        const allowed = exceptions.some((e) => e.word === entry.word && e.slug === actual)
        if (!allowed) err(`${rel}: id slug "${actual}" 与 pinyin 推导 "${expected}" 不一致（§5.7#8；多音字须登记 polyphone-exceptions.json）`)
      }
    }
    for (const n of entry.near ?? []) nearOppositeWarn(rel, 'near 词', n.word, new Set([...fullWords, ...draftWords]))
    for (const o of entry.opposite ?? []) nearOppositeWarn(rel, 'opposite 词', o, new Set([...fullWords, ...draftWords]))
  }

  /* 6) §5.3 词表自检 */
  if (tags.length > 30) err(`tags.json 主题数 ${tags.length} 超过上限 30（§5.3）`)
  const dupTags = tags.filter((t, i) => tags.indexOf(t) !== i)
  if (dupTags.length > 0) err(`tags.json 存在重复主题：${[...new Set(dupTags)].join('、')}（§5.3）`)
  if (tags.some((t) => typeof t !== 'string' || !t.trim())) err('tags.json 含空/非字符串主题（§5.3）')
  for (const x of exams) {
    if (!EXAM_PATTERN.test(x)) err(`exams.json 卷别 "${x}" 不符合「年份-考试类型-卷类/省」格式（§5.3）`)
  }
  const dupExams = exams.filter((x, i) => exams.indexOf(x) !== i)
  if (dupExams.length > 0) err(`exams.json 存在重复卷别：${[...new Set(dupExams)].join('、')}（§5.3）`)

  return {
    errors,
    warnings,
    fullFiles: fullFiles.length,
    draftFiles: draftFiles.length,
    exitCode: errors.length > 0 ? 1 : 0
  }
}

/* ---------------------------------- 入口 ---------------------------------- */

function main() {
  const res = runValidation()
  for (const e of res.errors) console.error(`✗ [error] ${e}`)
  for (const w of res.warnings) console.warn(`△ [warn] ${w}`)
  console.log(
    `\nvalidate:data —— full 入口 ${res.fullFiles} 个文件 / draft 入口 ${res.draftFiles} 个文件：` +
    `${res.errors.length} 错误，${res.warnings.length} 警告 → ${res.exitCode === 0 ? '通过 ✓' : '未通过 ✗'}`
  )
  process.exit(res.exitCode)
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) {
  main()
}
