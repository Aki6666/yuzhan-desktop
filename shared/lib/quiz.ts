/**
 * 自测组卷纯逻辑（PLAN.md §3.3 / §4.8 / F6 / AC-06）
 *
 * 出题规则（§3.3）：
 * - 10 题一组；优先错词与高频词（frequency 4–5）；避免与上轮重复（可注入 avoidIds）
 * - 干扰项来自同主题（同 tag）→ 近义辨析组（near 对端词）→ 随机词，正确答案位置随机
 * - 题库 <10 → 返回空数组（调用方提示并引导浏览成语库）
 *
 * 纯函数、无 DOM / 无 Electron / 无 Pinia 依赖，随机源可注入（测试用种子），
 * 可单测（tests/quiz.test.ts），供 renderer quiz store 消费。
 */
import type { Idiom } from '../ipc/contracts'

/** 一组题数（§3.3：10 题一组） */
export const QUIZ_SIZE = 10

/** 每题选项数（1 正确 + 3 干扰项） */
export const OPTION_COUNT = 4

/** 高频档（§3.3：频次 4–5 优先出题） */
export const HIGH_FREQUENCY_TIERS = [4, 5] as const

export interface QuizQuestion {
  /** 词条 id（答题 / quiz:record 记录用） */
  id: string
  word: string
  pinyin: string
  /** 4 个释义选项 */
  options: string[]
  /** 正确答案下标（0–3） */
  correctIndex: number
  /** 考点：释义 + 误用类型 + 主题（答题后展示，强化记忆 §3.3） */
  meaning: string
  errorTypes: string[]
  tags: string[]
}

export interface QuizBuildOptions {
  size?: number
  /** 上轮已出词条（避免重复；与 wrongIds 重叠时仍允许——错词需复测） */
  avoidIds?: string[]
  /** 错词（优先出题，AC-06：下次自测优先出该词） */
  wrongIds?: string[]
  /** 高频档（默认 [4,5]） */
  frequencyTiers?: number[]
  /** 随机源（默认 Math.random；测试可注入种子） */
  random?: () => number
}

// ---------------------------------------------------------------------------
// 目标词选择：错词 → 高频（4–5）→ 其余；同档按频次降序、id 字典序稳定
// ---------------------------------------------------------------------------

function targetScore(item: Idiom, wrongSet: Set<string>, freqSet: Set<number>): number {
  if (wrongSet.has(item.id)) return 0
  if (freqSet.has(item.frequency)) return 1
  return 2
}

/** 按出题优先级排序后的目标词（错词 → 高频 → 其余，同档频次降序 + id 稳定） */
export function selectQuizTargets(items: Idiom[], opts: QuizBuildOptions = {}): Idiom[] {
  const wrongSet = new Set(opts.wrongIds ?? [])
  const freqSet = new Set(opts.frequencyTiers ?? HIGH_FREQUENCY_TIERS)
  return [...items].sort((a, b) => {
    const sa = targetScore(a, wrongSet, freqSet)
    const sb = targetScore(b, wrongSet, freqSet)
    if (sa !== sb) return sa - sb
    if (a.frequency !== b.frequency) return b.frequency - a.frequency
    return a.id < b.id ? -1 : 1
  })
}

// ---------------------------------------------------------------------------
// 单题构建：干扰项（同主题 → 近义辨析组 → 随机词）+ 正确答案位置随机
// ---------------------------------------------------------------------------

function shuffle<T>(arr: T[], random: () => number): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * 为 target 构建 4 个释义选项（1 正确 + 3 干扰项）。
 * 干扰项来源优先级：同主题（共享任一 tag）→ 近义辨析组（near[].word 库内对端）→ 其余词条；
 * 释义去重（与正确答案及彼此不同）。返回 null 表示干扰项不足。
 */
export function buildOptionsFor(target: Idiom, all: Idiom[], random: () => number): { options: string[]; correctIndex: number } | null {
  const targetTags = new Set(target.tags ?? [])
  const nearWords = new Set((target.near ?? []).map((n) => n.word))
  const sameTag: Idiom[] = []
  const nearGroup: Idiom[] = []
  const others: Idiom[] = []
  for (const item of all) {
    if (item.id === target.id) continue
    if (item.meaning.trim() === target.meaning.trim()) continue
    if (item.tags?.some((t) => targetTags.has(t))) sameTag.push(item)
    else if (nearWords.has(item.word)) nearGroup.push(item)
    else others.push(item)
  }

  const distractors: string[] = []
  const used = new Set<string>([target.meaning.trim()])
  const draw = (pool: Idiom[]): string | null => {
    const avail = pool.filter((p) => !used.has(p.meaning.trim()))
    if (avail.length === 0) return null
    const pick = avail[Math.floor(random() * avail.length)]
    used.add(pick.meaning.trim())
    return pick.meaning
  }
  for (const pool of [sameTag, nearGroup, others]) {
    while (distractors.length < OPTION_COUNT - 1) {
      const m = draw(pool)
      if (m === null) break
      distractors.push(m)
    }
    if (distractors.length === OPTION_COUNT - 1) break
  }
  if (distractors.length < OPTION_COUNT - 1) return null

  const options = shuffle([target.meaning, ...distractors], random)
  return { options, correctIndex: options.indexOf(target.meaning) }
}

// ---------------------------------------------------------------------------
// 组卷主函数
// ---------------------------------------------------------------------------

/**
 * 组卷：返回 size（默认 10）道题。
 * - 题库（items）不足 size → 返回 []（调用方提示「题库 <10」并引导浏览成语库）
 * - 避免重复：优先从「上轮未出/上轮错词」中选题；上轮词条不足以填充时允许复用（尽力避免）
 * - 单题干扰项不足时跳过该目标词，直到凑满 size（或耗尽）
 */
export function buildQuiz(items: Idiom[], opts: QuizBuildOptions = {}): QuizQuestion[] {
  const size = opts.size ?? QUIZ_SIZE
  const random = opts.random ?? Math.random
  if (items.length < size) return []

  const avoidSet = new Set(opts.avoidIds ?? [])
  const wrongSet = new Set(opts.wrongIds ?? [])
  const ordered = selectQuizTargets(items, opts)
  // 优先：错词（无论是否在上轮——错词需复测，AC-06）+ 未避免词条；
  // 不足时用被避免词条补齐
  const preferred = ordered.filter((i) => !avoidSet.has(i.id) || wrongSet.has(i.id))
  const fallback = ordered.filter((i) => avoidSet.has(i.id) && !wrongSet.has(i.id))
  const targets = [...preferred, ...fallback]

  const questions: QuizQuestion[] = []
  for (const target of targets) {
    if (questions.length >= size) break
    const built = buildOptionsFor(target, items, random)
    if (!built) continue
    questions.push({
      id: target.id,
      word: target.word,
      pinyin: target.pinyin,
      options: built.options,
      correctIndex: built.correctIndex,
      meaning: target.meaning,
      errorTypes: target.errorTypes ?? [],
      tags: target.tags ?? []
    })
  }
  return questions.length >= size ? questions.slice(0, size) : []
}
