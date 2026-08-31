/**
 * 检索纯函数（PLAN.md §4.8 / §10.2）
 *
 * - pinyin-pro `multiple: true` 全读音索引（多音字兜底）
 * - 命中优先级：精确 → 前缀 → 子串 → 编辑距离 ≤1（含错别字提示）
 * - 同分取频次高者（§10.2）
 *
 * 纯函数、无 DOM/无 Electron 依赖，可单测（tests/search.test.ts，对应 AC-07 检索核心逻辑）。
 */
import { pinyin } from 'pinyin-pro'
import type { Idiom } from '../ipc/contracts'

/** 命中层级（越大越靠后）；const 对象 + 联合类型（可擦除语法，Node strip-only 亦兼容） */
export const SearchTier = {
  Exact: 0,
  Prefix: 1,
  Substring: 2,
  EditDistance: 3
} as const

export type SearchTier = (typeof SearchTier)[keyof typeof SearchTier]

interface IndexEntry {
  idiom: Idiom
  /** 全拼候选项（含多音字组合），如 ['ju gong jin cui']；多音字产生多个，如 乐不思蜀 → ['le bu si shu','yue bu si shu'] */
  pinyinVariants: string[]
  /** 拼音去空格（子串/编辑距离用），如 'jugongjincui' */
  pinyinFlat: string[]
  /** 首字母（每读音组合一种），如 'jgj' */
  initials: string[]
  word: string
}

export interface SearchIndex {
  entries: IndexEntry[]
}

/** 检索结果（含层级与分数，供上层排序/展示） */
export interface SearchHit {
  idiom: Idiom
  tier: SearchTier
  /** 层内排序分：频次越高越靠前（同分再按 id 字典序稳定） */
  frequency: number
}

// ---------------------------------------------------------------------------
// 拼音工具
// ---------------------------------------------------------------------------

const TONE_MAP: Record<string, string> = {
  ā: 'a', á: 'a', ǎ: 'a', à: 'a',
  ē: 'e', é: 'e', ě: 'e', è: 'e',
  ī: 'i', í: 'i', ǐ: 'i', ì: 'i',
  ō: 'o', ó: 'o', ǒ: 'o', ò: 'o',
  ū: 'u', ú: 'u', ǔ: 'u', ù: 'u',
  ǖ: 'ü', ǘ: 'ü', ǚ: 'ü', ǜ: 'ü'
}

function stripTones(s: string): string {
  return s.replace(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/g, (ch) => TONE_MAP[ch] ?? ch)
}

/**
 * 取每音节全部读音（§10.2 multiple:true 全读音索引，多音字兜底）。
 * pinyin-pro：type:'all' 的逐音节结果带 polyphonic（全部读音，带声调），
 * 比 multiple+type:'array'（多字串只给首读音）更完整。
 */
function syllablesAll(word: string): string[][] {
  const result = pinyin(word, { type: 'all' })
  if (!Array.isArray(result)) return []
  return result.map((item) => {
    if (!item || typeof item !== 'object') return []
    const polyphonic = (item as { polyphonic?: string[] }).polyphonic
    if (Array.isArray(polyphonic) && polyphonic.length > 0) {
      return polyphonic.map((p) => stripTones(p))
    }
    const p = (item as { pinyin?: string }).pinyin
    return p ? [stripTones(p)] : []
  })
}

/** 笛卡尔积组合全拼候选项 */
function combine(syllables: string[][]): string[] {
  let acc: string[] = ['']
  for (const alts of syllables) {
    const next: string[] = []
    for (const prefix of acc) {
      for (const alt of alts) next.push(prefix ? `${prefix} ${alt}` : alt)
    }
    acc = next
  }
  return acc.filter((s) => s.length > 0)
}

/** 编辑距离（Levenshtein）≤1 判断；dist>1 时提前截断 */
export function editDistanceAtMost1(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false
  // 动态规划只算到 ≤1
  const dp = Array.from({ length: a.length + 1 }, (_, i) => i)
  for (let j = 1; j <= b.length; j++) {
    let prev = dp[0]
    dp[0] = j
    let rowMin = dp[0]
    for (let i = 1; i <= a.length; i++) {
      const tmp = dp[i]
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i] = Math.min(dp[i] + 1, dp[i - 1] + 1, prev + cost)
      prev = tmp
      if (dp[i] < rowMin) rowMin = dp[i]
    }
    if (rowMin > 1) return false // 当前行最小距离已 >1，提前退出
  }
  return dp[a.length] <= 1
}

function normalizeQuery(q: string): string {
  return q.trim().toLowerCase()
}

// ---------------------------------------------------------------------------
// 索引构建
// ---------------------------------------------------------------------------

export function createSearchIndex(items: Idiom[]): SearchIndex {
  const entries: IndexEntry[] = items.map((idiom) => {
    const syl = syllablesAll(idiom.word)
    const pinyinVariants = combine(syl)
    const pinyinFlat = pinyinVariants.map((s) => s.replace(/ /g, ''))
    const initials = pinyinVariants.map((s) =>
      s
        .split(' ')
        .map((part) => part[0] ?? '')
        .join('')
    )
    return { idiom, pinyinVariants, pinyinFlat, initials, word: idiom.word }
  })
  return { entries }
}

/** 检索索引缓存的单条结构（data/search-index.json，字段短命名以减小体积） */
export interface SearchCacheWord {
  /** word */
  w: string
  /** 全拼候选项 */
  v: string[]
  /** 去空格全拼（子串/编辑距离） */
  f: string[]
  /** 首字母 */
  i: string[]
}

/**
 * 用预生成缓存快速重建索引（性能优化 #1：避免启动时对全部词条跑 pinyin-pro）。
 * 命中缓存的词条直接取拼音数据；未命中（缓存过期/新增词）回退实时计算，保证不缺词。
 */
export function createSearchIndexFromCache(items: Idiom[], words: SearchCacheWord[]): SearchIndex {
  const byWord = new Map(words.map((x) => [x.w, x]))
  const entries: IndexEntry[] = items.map((idiom) => {
    const hit = byWord.get(idiom.word)
    if (hit && hit.v?.length > 0) {
      return {
        idiom,
        pinyinVariants: hit.v,
        pinyinFlat: hit.f ?? hit.v.map((s) => s.replace(/ /g, '')),
        initials: hit.i ?? hit.v.map((s) => s.split(' ').map((p) => p[0] ?? '').join('')),
        word: idiom.word
      }
    }
    const syl = syllablesAll(idiom.word)
    const pinyinVariants = combine(syl)
    const pinyinFlat = pinyinVariants.map((s) => s.replace(/ /g, ''))
    const initials = pinyinVariants.map((s) => s.split(' ').map((p) => p[0] ?? '').join(''))
    return { idiom, pinyinVariants, pinyinFlat, initials, word: idiom.word }
  })
  return { entries }
}

// ---------------------------------------------------------------------------
// 检索
// ---------------------------------------------------------------------------

/** 单条命中判定：返回最优层级（无命中返回 null） */
function matchEntry(entry: IndexEntry, q: string): SearchTier | null {
  const word = entry.word
  // 精确：word 全等 / 任一全拼候选全等 / 任一 首字母候选全等
  if (word === q || entry.pinyinVariants.includes(q) || entry.initials.includes(q)) {
    return SearchTier.Exact
  }
  // 前缀：word / 全拼 / 首字母
  if (
    word.startsWith(q) ||
    entry.pinyinVariants.some((p) => p.startsWith(q)) ||
    entry.initials.some((p) => p.startsWith(q))
  ) {
    return SearchTier.Prefix
  }
  // 子串：word / 全拼（去空格）/ 首字母
  if (
    word.includes(q) ||
    entry.pinyinFlat.some((p) => p.includes(q.replace(/ /g, ''))) ||
    entry.initials.some((p) => p.includes(q))
  ) {
    return SearchTier.Substring
  }
  // 编辑距离 ≤1：word / 全拼（去空格）/ 首字母
  if (
    editDistanceAtMost1(word, q) ||
    entry.pinyinFlat.some((p) => editDistanceAtMost1(p, q.replace(/ /g, ''))) ||
    entry.initials.some((p) => editDistanceAtMost1(p, q))
  ) {
    return SearchTier.EditDistance
  }
  return null
}

/**
 * 检索：按 精确→前缀→子串→编辑距离 分层，层内按频次降序（同分按 id 字典序稳定）。
 * @param limit 返回条数上限（默认全部）
 */
export function search(index: SearchIndex, query: string, limit?: number): Idiom[] {
  const q = normalizeQuery(query)
  if (!q) return []
  const hits: SearchHit[] = []
  for (const entry of index.entries) {
    const tier = matchEntry(entry, q)
    if (tier !== null) {
      hits.push({ idiom: entry.idiom, tier, frequency: entry.idiom.frequency })
    }
  }
  hits.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier
    if (a.frequency !== b.frequency) return b.frequency - a.frequency
    return a.idiom.id < b.idiom.id ? -1 : 1
  })
  return (limit ? hits.slice(0, limit) : hits).map((h) => h.idiom)
}

/** 带层级/排序的完整结果（供快速输入命中卡片展示「模糊命中」提示等场景） */
export function searchDetailed(index: SearchIndex, query: string, limit?: number): SearchHit[] {
  const q = normalizeQuery(query)
  if (!q) return []
  const hits: SearchHit[] = []
  for (const entry of index.entries) {
    const tier = matchEntry(entry, q)
    if (tier !== null) hits.push({ idiom: entry.idiom, tier, frequency: entry.idiom.frequency })
  }
  hits.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier
    if (a.frequency !== b.frequency) return b.frequency - a.frequency
    return a.idiom.id < b.idiom.id ? -1 : 1
  })
  return limit ? hits.slice(0, limit) : hits
}
