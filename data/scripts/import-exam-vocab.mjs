#!/usr/bin/env node
/**
 * 导入脚本：E:\杂项\言语真题 高频选项词汇 → 语栈正式库卡片
 *
 * 阶段一（scan）：遍历题库全部 .txt，仅抽取「选项」行（A、/A./A． 起始），
 *   按空白与中文标点切分为纯汉字词元（2–16 字），统计：
 *   - total：词元在全部选项中的出现次数（同一题 4 个选项重复出现亦计数）
 *   - questions：去重「文件 + 题号」的题目数（判断跨题高频）
 *   - files：去重文件名
 * 阶段二（generate）：读取 data/scripts/import-content.json（AI 释义内容），
 *   用 pinyin-pro 生成带声调拼音与 slug，按 §5.5/§5.7 规范写
 *   data/idioms/<首字母>/<slug>-01.json；已存在词条跳过。
 *
 * 用法：
 *   node data/scripts/import-exam-vocab.mjs scan        # 输出词频报告
 *   node data/scripts/import-exam-vocab.mjs generate    # 生成卡片
 *   node data/scripts/import-exam-vocab.mjs generate --dry-run
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pinyin } from 'pinyin-pro'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(SCRIPT_DIR, '..', '..')
const IDIOMS_DIR = join(REPO_ROOT, 'data', 'idioms')

const EXAM_ROOT = process.env.EXAM_ROOT || 'E:\\杂项\\言语真题'
const CONTENT_FILE = join(SCRIPT_DIR, 'import-content.json')
const REPORT_FILE = join(SCRIPT_DIR, 'import-report.json')

/** 词元切分：空白 + 中文标点；保留纯汉字 2–16 字 */
const SPLIT_RE = /[\s\u3000，,。；;、（）()【】［］「」『』《》〈〉：:？！!…—\-—·"'“”‘’~～/／\\|]+/
const HANZI_RE = /^[\u4e00-\u9fa5]{2,16}$/

function optionMarkerMatch(line) {
  // 选项行/选项内标记：A、 A. A． a：等
  const re = /([A-Da-d])(?:[\.、．。:：])\s*/g
  const out = []
  let m
  while ((m = re.exec(line)) !== null) {
    out.push({ letter: m[1].toUpperCase(), start: m.index + m[0].length })
  }
  return out
}

function isQuestionLine(line) {
  return /^\s*\d{1,3}[、.．]\s*\S/.test(line)
}

/** 抽取一行内的选项文字片段（支持一行多选项） */
function optionFragments(line) {
  const markers = optionMarkerMatch(line)
  if (markers.length === 0) return []
  const frags = []
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].start
    const end = i + 1 < markers.length ? markers[i + 1].start : line.length
    frags.push(line.slice(start, end))
  }
  return frags
}

/** 从选项片段切出词元 */
function tokensFromFragment(frag) {
  return frag
    .split(SPLIT_RE)
    .map((t) => t.trim())
    .filter((t) => HANZI_RE.test(t))
}

export function scanExams(examRoot = EXAM_ROOT) {
  const stats = { files: 0, optionLines: 0, tokens: 0 }
  const counts = new Map() // word -> { total, questions:Set, files:Set }

  function bump(word, fileKey, qKey) {
    let c = counts.get(word)
    if (!c) {
      c = { total: 0, questions: new Set(), files: new Set() }
      counts.set(word, c)
    }
    c.total += 1
    c.questions.add(qKey)
    c.files.add(fileKey)
  }

  function walk(dir) {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, ent.name)
      if (ent.isDirectory()) walk(full)
      else if (ent.isFile() && ent.name.toLowerCase().endsWith('.txt')) processFile(full)
    }
  }

  function processFile(filePath) {
    stats.files += 1
    const fileKey = filePath
    let question = null
    const lines = readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)
    for (const raw of lines) {
      const line = raw.trimEnd()
      if (isQuestionLine(line)) {
        question = line.trim().match(/^\d{1,3}/)[0]
        continue
      }
      const frags = optionFragments(line)
      if (frags.length === 0) continue
      stats.optionLines += 1
      for (const frag of frags) {
        for (const tok of tokensFromFragment(frag)) {
          stats.tokens += 1
          bump(tok, fileKey, `${fileKey}#${question ?? '?'}`)
        }
      }
    }
  }

  if (!existsSync(examRoot)) {
    console.error(`题库目录不存在: ${examRoot}`)
    process.exit(2)
  }
  walk(examRoot)

  const rows = [...counts.entries()]
    .map(([word, c]) => ({
      word,
      total: c.total,
      questions: c.questions.size,
      files: c.files.size
    }))
    .sort((a, b) => b.total - a.total || b.questions - a.questions || a.word.localeCompare(b.word, 'zh'))

  return { stats, rows }
}

function main() {
  const cmd = process.argv[2] ?? 'scan'
  if (cmd === 'scan') {
    const { stats, rows } = scanExams()
    const qualified = rows.filter((r) => r.total >= 2)
    writeFileSync(REPORT_FILE, JSON.stringify({ stats, rows }, null, 2), 'utf8')
    console.log(`题库统计: ${stats.files} 个文件 / ${stats.optionLines} 行选项 / ${stats.tokens} 个词元`)
    console.log(`候选词（出现 ≥2 次）: ${qualified.length} 个`)
    console.log('---- 出现 ≥2 次的词（total 降序，前 400）----')
    for (const r of qualified.slice(0, 400)) {
      console.log(`${String(r.total).padStart(3)} 次 | ${String(r.questions).padStart(3)} 题 | ${String(r.files).padStart(3)} 文件 | ${r.word}`)
    }
    console.log(`\n完整报告: ${REPORT_FILE}`)
    return
  }
  if (cmd === 'generate') {
    generateCards(process.argv.includes('--dry-run'))
    return
  }
  console.error(`未知命令: ${cmd}（可用 scan / generate）`)
  process.exit(1)
}

/** 拼音 → slug（去声调、连字符，与 validate-data.mjs toSlug 一致） */
export function toSlug(py) {
  return py
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** 现有正式库词形集合（去重用） */
export function existingWords() {
  const words = new Set()
  function walk(dir) {
    if (!existsSync(dir)) return
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, ent.name)
      if (ent.isDirectory()) walk(full)
      else if (ent.isFile() && ent.name.endsWith('.json') && ent.name !== 'tags.json' && ent.name !== 'exams.json') {
        try {
          const obj = JSON.parse(readFileSync(full, 'utf8'))
          if (obj && typeof obj.word === 'string') words.add(obj.word)
        } catch {
          /* 跳过坏文件 */
        }
      }
    }
  }
  walk(join(IDIOMS_DIR))
  return words
}

/** 出现次数 → 频次分档 1–5（§5.4；档位按真题出现次数划分） */
function frequencyFromTotal(total) {
  if (total >= 80) return 5
  if (total >= 45) return 4
  if (total >= 10) return 3
  if (total >= 5) return 2
  return 1
}

function generateCards(dryRun) {
  if (!existsSync(CONTENT_FILE)) {
    console.error(`缺少释义内容文件: ${CONTENT_FILE}`)
    process.exit(1)
  }
  const content = JSON.parse(readFileSync(CONTENT_FILE, 'utf8'))
  const entries = Array.isArray(content) ? content : content.entries
  if (!Array.isArray(entries)) {
    console.error('import-content.json 需为数组或含 entries 数组')
    process.exit(1)
  }

  // 出现次数查询（import-report.json；缺失时用内容自带 frequency）
  let report = null
  if (existsSync(REPORT_FILE)) {
    try {
      report = JSON.parse(readFileSync(REPORT_FILE, 'utf8'))
    } catch {
      report = null
    }
  }
  const totalByWord = new Map((report?.rows ?? []).map((r) => [r.word, r.total]))

  const existing = existingWords()
  const usedIds = new Set()
  let created = 0
  let skippedExisting = 0
  let skippedInvalid = 0
  const problems = []

  for (const e of entries) {
    const word = typeof e.word === 'string' ? e.word.trim() : ''
    if (!word || !HANZI_RE.test(word)) {
      skippedInvalid += 1
      problems.push(`[跳过] 非纯汉字/长度非法: ${JSON.stringify(e.word)}`)
      continue
    }
    if (existing.has(word)) {
      skippedExisting += 1
      continue
    }
    const py = pinyin(word, { toneType: 'symbol', type: 'array' }).join(' ')
    const slug = toSlug(py)
    const id = `${slug}-01`
    if (usedIds.has(id)) {
      skippedInvalid += 1
      problems.push(`[跳过] id 冲突: ${id} (${word})`)
      continue
    }
    usedIds.add(id)
    const letter = slug[0]
    const dir = join(IDIOMS_DIR, letter)
    const file = join(dir, `${id}.json`)

    const total = totalByWord.get(word)
    const card = {
      schemaVersion: 1,
      id,
      word,
      pinyin: py,
      meaning: String(e.meaning ?? '').trim(),
      ...(e.origin ? { origin: String(e.origin).trim() } : {}),
      ...(e.usage ? { usage: String(e.usage).trim() } : {}),
      emotion: e.emotion ?? '中性',
      register: e.register ?? '无',
      ...(Array.isArray(e.near) && e.near.length ? { near: e.near } : {}),
      ...(Array.isArray(e.opposite) && e.opposite.length ? { opposite: e.opposite } : {}),
      errorTypes: Array.isArray(e.errorTypes) && e.errorTypes.length ? e.errorTypes : ['望文生义'],
      ...(Array.isArray(e.examples) && e.examples.length ? { examples: e.examples } : {}),
      frequency:
        typeof total === 'number' && total >= 1
          ? frequencyFromTotal(total)
          : Number.isInteger(e.frequency) && e.frequency >= 1 && e.frequency <= 5
            ? e.frequency
            : 3,
      ...(typeof total === 'number' && total >= 1 ? { occurrences: total } : {}),
      ...(Array.isArray(e.tags) && e.tags.length ? { tags: e.tags } : {}),
      quality: 'reviewed',
      library: 'official',
      verifiedBy: 'AI导入',
      updatedAt: new Date().toISOString().slice(0, 10)
    }

    if (dryRun) {
      console.log(`[dry-run] ${id}  ${word}  ->  ${file}`)
      created += 1
      continue
    }
    mkdirSync(dir, { recursive: true })
    writeFileSync(file, JSON.stringify(card, null, 2) + '\n', 'utf8')
    created += 1
    console.log(`[create] ${id}  ${word}`)
  }

  console.log(`\n生成完成: 新建 ${created} 张卡 / 已存在跳过 ${skippedExisting} / 非法跳过 ${skippedInvalid}`)
  if (problems.length) {
    console.log('---- 问题明细 ----')
    for (const p of problems) console.log(p)
  }
}

if (import.meta.url === `file:///${process.argv[1]?.split('\\').join('/')}` || import.meta.url === process.argv[1]?.replace(/\\/g, '/') || process.argv[1]?.endsWith('import-exam-vocab.mjs')) {
  main()
}
