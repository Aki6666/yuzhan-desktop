/**
 * 自测组卷纯逻辑（PLAN.md §3.3 / §4.8 / F6 / AC-06）
 *
 * 出题规则（§3.3）：
 * - 10 题一组；优先错词与高频词（frequency 4–5）；避免与上轮重复（可注入 avoidIds）
 * - 题库 <10 → 返回空数组（调用方提示并引导浏览成语库）
 *
 * v0.2.6 迭代（§16.3 P0-⑤「干扰项质量」）：重写干扰项生成——按**混淆度评分**选取
 * 干扰项，让选项"长得像"（真题式近义/形近辨析），修复"同主题随机词差距太明显"问题：
 * - 评分优先级：near 近义对端 / pairs 易混对（S 级，人工标注，score=100）
 *   → 共享 ≥2 汉字 / 同尾字（A 级）→ 同首字 / 共享 1 字（B 级）→ 同 tag（C 级）→ 同频次（D 级）
 * - 难度档位：easy（同主题随机，宽松）/ standard（默认，至少 1 个高相似干扰项）
 *   / hard（优先全高相似干扰项）
 * - 干扰项来自 near/pairs 时附带易混辨析提示（confusableHints：选项 → 「易与 X 混淆：diff」），
 *   答错时展示强化记忆
 * - 性能：createDistractorIndex 一次性构建倒排索引（首字/尾字/tag/频次/word/near/pairs），
 *   每题只对候选集（同首字∪同尾字∪同tag∪近义对端）算分，2603 词规模毫秒级
 *
 * 纯函数、无 DOM / 无 Electron / 无 Pinia 依赖，随机源可注入（测试用种子），
 * 可单测（tests/quiz.test.ts），供 renderer quiz store 消费。
 */
import type { ConfusablePair, Idiom } from '../ipc/contracts'

/** 一组题数（§3.3：10 题一组） */
export const QUIZ_SIZE = 10

/** 每题选项数（1 正确 + 3 干扰项） */
export const OPTION_COUNT = 4

/** 高频档（§3.3：频次 4–5 优先出题） */
export const HIGH_FREQUENCY_TIERS = [4, 5] as const

/** 难度档位（v0.2.6 迭代：干扰项区分度） */
export type QuizDifficulty = 'easy' | 'standard' | 'hard'

/** 易混辨析提示（v0.2.6 迭代：干扰项来自 near/pairs 时生成） */
export interface QuizHint {
  /** 对应选项文本（答错时按所选选项匹配） */
  option: string
  /** 易混词 */
  word: string
  /** 一句话核心区别（near.diff / pairs.diff） */
  diff: string
}

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
  /** 易混辨析提示（v0.2.6 迭代：答错且命中时展示「易与 X 混淆：diff」） */
  confusableHints?: QuizHint[]
}

export interface QuizBuildOptions {
  size?: number
  /** 上轮已出词条（避免重复；与 wrongIds 重叠时仍允许——错词需复测） */
  avoidIds?: string[]
  /** 错词（优先出题，AC-06：下次自测优先出该词） */
  wrongIds?: string[]
  /** 高频档（默认 [4,5]） */
  frequencyTiers?: number[]
  /** 难度（v0.2.6 迭代：默认 standard） */
  difficulty?: QuizDifficulty
  /** 易混淆对（v0.2.6 迭代：data/pairs.json，a/b 互为干扰项 + 辨析提示） */
  pairs?: ConfusablePair[]
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
// 选项净化（用户要求 #5：屏蔽释义中的括号提示，避免选项暴露答案）
// ---------------------------------------------------------------------------

/**
 * 题库释义去除括号提示后再作选项展示：
 * - 中文全角（）与英文半角() 内的注音/字义提示整体删除，如
 *   「没有辜负大家的期望（"负"=辜负）。」→「没有辜负大家的期望。」
 * - 仅用于选项文本；复习面板的完整释义（QuizQuestion.meaning）保留原样。
 */
export function sanitizeQuizOption(text: string): string {
  return text
    .replace(/[（(][^（）()]*[）)]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ---------------------------------------------------------------------------
// 干扰项相似度索引（v0.2.6 迭代：倒排索引 + 混淆度评分）
// ---------------------------------------------------------------------------

export interface DistractorIndex {
  items: Idiom[]
  byFirstChar: Map<string, Idiom[]>
  byLastChar: Map<string, Idiom[]>
  byTag: Map<string, Idiom[]>
  byFrequency: Map<number, Idiom[]>
  byWord: Map<string, Idiom>
  /** word → near 辨析项（含 diff） */
  nearByWord: Map<string, { word: string; diff: string }[]>
  /** word → 易混对端（a→b 与 b→a 双向，含 diff） */
  pairByWord: Map<string, { word: string; diff: string }>
}

/** 评分阈值（供难度策略与测试引用） */
export const SCORE_NEAR = 100 // S 级：近义对端 / 易混对端（人工标注）
export const SCORE_SHARED_TWO = 16 // A 级：共享 ≥2 汉字（形近，含同尾）
export const SCORE_SAME_LAST = 8 // B 级：同尾字
export const SCORE_SAME_FIRST = 5 // B 级：同首字
export const SCORE_SAME_TAG = 2 // C 级：同主题
export const SCORE_SAME_FREQ = 1 // D 级：同频次档

/**
 * 一次性构建干扰项倒排索引（2603 词规模毫秒级；组卷时只建一次，每题 O(候选集)）。
 * pairs 按 a/b 双向映射；near 对端仅保留库内已有词（§5.7#6 库外对端仅警告，不参与出题）。
 */
export function createDistractorIndex(items: Idiom[], pairs: ConfusablePair[] = []): DistractorIndex {
  const index: DistractorIndex = {
    items,
    byFirstChar: new Map(),
    byLastChar: new Map(),
    byTag: new Map(),
    byFrequency: new Map(),
    byWord: new Map(),
    nearByWord: new Map(),
    pairByWord: new Map()
  }
  const push = (map: Map<string | number, Idiom[]>, key: string | number, item: Idiom): void => {
    const list = map.get(key)
    if (list) list.push(item)
    else map.set(key, [item])
  }
  for (const item of items) {
    const word = item.word
    if (!word) continue
    index.byWord.set(word, item)
    if (word.length > 0) {
      push(index.byFirstChar, word[0], item)
      push(index.byLastChar, word[word.length - 1], item)
    }
    for (const t of item.tags ?? []) push(index.byTag, t, item)
    push(index.byFrequency, item.frequency, item)
  }
  // 第二遍：near/pairs 对端映射——必须等全部 byWord 建立后再查（对端词可能排在本词之前/之后，
  // 单遍处理会顺序依赖漏建）
  for (const item of items) {
    for (const n of item.near ?? []) {
      if (n.word && n.diff && index.byWord.has(n.word)) {
        const list = index.nearByWord.get(item.word)
        if (list) list.push(n)
        else index.nearByWord.set(item.word, [{ word: n.word, diff: n.diff }])
      }
    }
  }
  for (const p of pairs) {
    if (!p || !p.a || !p.b || !p.diff) continue
    if (!index.byWord.has(p.a) || !index.byWord.has(p.b)) continue // 仅库内对
    index.pairByWord.set(p.a, { word: p.b, diff: p.diff })
    index.pairByWord.set(p.b, { word: p.a, diff: p.diff })
  }
  return index
}

/** 两词共享汉字集合（去重，如 鞠躬尽瘁/心力交瘁 → {瘁}） */
function sharedChars(a: string, b: string): Set<string> {
  const setA = new Set(a.split(''))
  const out = new Set<string>()
  for (const ch of b) if (setA.has(ch)) out.add(ch)
  return out
}

/**
 * 混淆度评分（纯函数，可单测）：候选词与目标词的"长得像"程度。
 * near/pairs 对端 = 100（人工标注最强干扰）→ 共享 ≥2 汉字 = 16 → 同尾字 = 8
 * → 同首字 = 5 → 共享 1 字（含首尾）叠加 → 同 tag = 2 → 同频次 = 1。
 */
export function confusableScore(
  target: Idiom,
  candidate: Idiom,
  index: DistractorIndex
): { score: number; hint?: { word: string; diff: string } } {
  const near = index.nearByWord.get(target.word)?.find((n) => n.word === candidate.word)
  if (near) return { score: SCORE_NEAR, hint: near }
  const pair = index.pairByWord.get(target.word)
  if (pair && pair.word === candidate.word) return { score: SCORE_NEAR, hint: pair }

  let score = 0
  const shared = sharedChars(target.word, candidate.word)
  if (shared.size >= 2) score += SCORE_SHARED_TWO
  if (target.word[0] === candidate.word[0]) score += SCORE_SAME_FIRST
  if (target.word[target.word.length - 1] === candidate.word[candidate.word.length - 1]) score += SCORE_SAME_LAST
  // 共享 1 字但既非同首也非同尾：轻微形近
  if (shared.size === 1 && !(target.word[0] === candidate.word[0]) && !(target.word[target.word.length - 1] === candidate.word[candidate.word.length - 1])) {
    score += 2
  }
  if (target.tags?.some((t) => candidate.tags?.includes(t))) score += SCORE_SAME_TAG
  if (target.frequency === candidate.frequency) score += SCORE_SAME_FREQ
  return { score }
}

/** 候选集合（同首字 ∪ 同尾字 ∪ 同 tag ∪ near/pairs 对端），去重排除自身 */
function candidatePool(target: Idiom, index: DistractorIndex): Idiom[] {
  const seen = new Set<string>([target.id])
  const out: Idiom[] = []
  const add = (list: Idiom[] | undefined): void => {
    if (!list) return
    for (const item of list) {
      if (!seen.has(item.id)) {
        seen.add(item.id)
        out.push(item)
      }
    }
  }
  if (target.word.length > 0) {
    add(index.byFirstChar.get(target.word[0]))
    add(index.byLastChar.get(target.word[target.word.length - 1]))
  }
  for (const t of target.tags ?? []) add(index.byTag.get(t))
  // near/pairs 对端（人工标注的最强干扰源，即使无字形/主题交集也入选）
  for (const n of index.nearByWord.get(target.word) ?? []) {
    add(index.byWord.get(n.word) ? [index.byWord.get(n.word)!] : undefined)
  }
  const pair = index.pairByWord.get(target.word)
  if (pair) {
    const partner = index.byWord.get(pair.word)
    if (partner) add([partner])
  }
  return out
}

/**
 * 为 target 构建 4 个释义选项（1 正确 + 3 干扰项）。
 * 干扰项按混淆度评分降序选取，按难度档位控制区分度；释义去重；
 * near/pairs 干扰项附带易混辨析提示（QuizHint）。
 * 返回 null 表示干扰项不足。
 */
export function buildOptionsFor(
  target: Idiom,
  index: DistractorIndex,
  random: () => number,
  difficulty: QuizDifficulty = 'standard'
): { options: string[]; correctIndex: number; hints: QuizHint[] } | null {
  const correct = sanitizeQuizOption(target.meaning)

  // 候选 + 评分 + 提示
  const scored = candidatePool(target, index)
    .map((item) => {
      const { score, hint } = confusableScore(target, item, index)
      return { item, score, hint }
    })
    .filter((s) => s.score > 0 && sanitizeQuizOption(s.item.meaning) !== correct)
    .sort((a, b) => b.score - a.score) // 高分（更像）在前

  const usedMeanings = new Set<string>([correct])
  const hints: QuizHint[] = []
  const distractors: string[] = []

  /** 按分数段抽取（score ≥ 15 为 A/S 级高相似） */
  const draw = (minScore: number): string | null => {
    // 从剩余候选中取第一个满足阈值且释义未用的（高分优先，同一分随机扰动保持多样性）
    const avail = scored.filter(
      (s) => s.score >= minScore && !usedMeanings.has(sanitizeQuizOption(s.item.meaning))
    )
    if (avail.length === 0) return null
    // 同分时随机挑选（避免每题都取同一组干扰项）
    const pick = avail[Math.floor(random() * avail.length)]
    const meaning = sanitizeQuizOption(pick.item.meaning)
    usedMeanings.add(meaning)
    distractors.push(meaning)
    if (pick.hint) hints.push({ option: meaning, word: pick.hint.word, diff: pick.hint.diff })
    return meaning
  }

  const need = OPTION_COUNT - 1
  if (difficulty === 'hard') {
    // 全高相似优先（≥16 形近/近义），不足降级到 ≥8（同尾），再不足 ≥2（同主题）
    for (const min of [SCORE_SHARED_TWO, SCORE_SAME_LAST, SCORE_SAME_TAG]) {
      while (distractors.length < need) {
        if (draw(min) === null) break
      }
      if (distractors.length === need) break
    }
  } else if (difficulty === 'easy') {
    // 宽松：同主题即可（不强制高相似；优先随机，保持简单）
    for (const min of [SCORE_SAME_TAG, SCORE_SAME_FREQ]) {
      while (distractors.length < need) {
        if (draw(min) === null) break
      }
      if (distractors.length === need) break
    }
  } else {
    // standard（默认）：至少 1 个高相似（≥16），其余按分降序（≥2）
    if (draw(SCORE_SHARED_TWO) !== null) {
      while (distractors.length < need) {
        if (draw(SCORE_SAME_TAG) === null) break
      }
    } else {
      // 无高相似候选（罕见小库）：退化为同主题优先
      for (const min of [SCORE_SAME_TAG, SCORE_SAME_FREQ]) {
        while (distractors.length < need) {
          if (draw(min) === null) break
        }
        if (distractors.length === need) break
      }
    }
  }

  if (distractors.length < need) return null

  const options = shuffle([correct, ...distractors], random)
  return { options, correctIndex: options.indexOf(correct), hints }
}

function shuffle<T>(arr: T[], random: () => number): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// ---------------------------------------------------------------------------
// 组卷主函数
// ---------------------------------------------------------------------------

/**
 * 组卷：返回 size（默认 10）道题。
 * - 题库（items）不足 size → 返回 []（调用方提示「题库 <10」并引导浏览成语库）
 * - 避免重复：优先从「上轮未出/上轮错词」中选题；上轮词条不足以填充时允许复用（尽力避免）
 * - 干扰项：v0.2.6 迭代按混淆度评分 + 难度档位生成（buildOptionsFor）
 * - 单题干扰项不足时跳过该目标词，直到凑满 size（或耗尽）
 */
export function buildQuiz(items: Idiom[], opts: QuizBuildOptions = {}): QuizQuestion[] {
  const size = opts.size ?? QUIZ_SIZE
  const random = opts.random ?? Math.random
  const difficulty = opts.difficulty ?? 'standard'
  if (items.length < size) return []

  const avoidSet = new Set(opts.avoidIds ?? [])
  const wrongSet = new Set(opts.wrongIds ?? [])
  const ordered = selectQuizTargets(items, opts)
  // 优先：错词（无论是否在上轮——错词需复测，AC-06）+ 未避免词条；
  // 不足时用被避免词条补齐
  const preferred = ordered.filter((i) => !avoidSet.has(i.id) || wrongSet.has(i.id))
  const fallback = ordered.filter((i) => avoidSet.has(i.id) && !wrongSet.has(i.id))
  const targets = [...preferred, ...fallback]

  // 干扰项索引只建一次（v0.2.6 迭代）
  const index = createDistractorIndex(items, opts.pairs)

  const questions: QuizQuestion[] = []
  for (const target of targets) {
    if (questions.length >= size) break
    const built = buildOptionsFor(target, index, random, difficulty)
    if (!built) continue
    questions.push({
      id: target.id,
      word: target.word,
      pinyin: target.pinyin,
      options: built.options,
      correctIndex: built.correctIndex,
      meaning: target.meaning,
      errorTypes: target.errorTypes ?? [],
      tags: target.tags ?? [],
      confusableHints: built.hints.length > 0 ? built.hints : undefined
    })
  }
  return questions.length >= size ? questions.slice(0, size) : []
}
