/**
 * 成语列表页 UI 层纯函数（PLAN.md §4.3 / §4.8 / F3）
 *
 * - 检索本身复用 shared/lib/search.ts（由 idioms store 的 filtered 计算属性调用），
 *   本文件只提供 UI 层派生数据（频次选项与计数）与命中高亮定位，不含检索判定
 * - 全部纯函数、无 DOM / 无 Electron 依赖，可单测（tests/list.test.ts）
 * - FIX-1：首字筛选已移除（附录 B v0.1.2），firstCharOptions/countByFirstChar 已清理
 */
import type { Idiom } from '@shared/ipc/contracts'

/** 频次分档 1–5（§5.4 真题频次分档） */
export const FREQUENCY_OPTIONS = [1, 2, 3, 4, 5] as const
export type Frequency = (typeof FREQUENCY_OPTIONS)[number]

/** 高亮区间：[start, end) 字符下标，作用于原字符串 */
export interface HighlightSpan {
  start: number
  end: number
}

// ---------------------------------------------------------------------------
// 过滤派生数据
// ---------------------------------------------------------------------------

/** 各频次分档词条数（1–5 全键，缺失为 0），供过滤按钮计数展示 */
export function countByFrequency(items: Idiom[]): Record<number, number> {
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (const item of items) {
    if (item.frequency >= 1 && item.frequency <= 5) counts[item.frequency]++
  }
  return counts
}

// ---------------------------------------------------------------------------
// 防抖（§3.4 搜索输入防抖 200ms）
// ---------------------------------------------------------------------------

export interface DebouncedFn<A extends unknown[]> {
  (...args: A): void
  /** 取消尚未执行的调用 */
  cancel(): void
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): DebouncedFn<A> {
  let timer: ReturnType<typeof setTimeout> | null = null
  const debounced = (...args: A): void => {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      fn(...args)
    }, ms)
  }
  debounced.cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }
  return debounced
}

// ---------------------------------------------------------------------------
// 命中高亮（展示层：只负责"命中了哪一段"，命中与否由 search.ts 判定）
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

const HANZI_RE = /[\u3400-\u9fff]/

/**
 * 汉字查询在词条中的高亮区间：
 * - 子串命中：直接定位（精确/前缀/子串三层通用）
 * - 编辑距离 ≤1 近似命中：滑动 q 长度窗口，取汉明距离最小且 ≤1 的窗口
 * - 拼音/首字母查询不在汉字上定位（返回 null，由 pinyin 行高亮承担）
 */
export function highlightSpan(word: string, query: string): HighlightSpan | null {
  const q = query.trim()
  if (!q || !HANZI_RE.test(q)) return null
  const idx = word.indexOf(q)
  if (idx >= 0) return { start: idx, end: idx + q.length }
  // 近似命中：长度差 ≤1 才可能有编辑距离 ≤1 的窗口
  if (Math.abs(word.length - q.length) > 1) return null
  const len = Math.min(word.length, q.length)
  if (len === 0) return null
  let bestStart = -1
  let bestDist = Infinity
  for (let s = 0; s + len <= word.length; s++) {
    let dist = 0
    for (let k = 0; k < len; k++) if (word[s + k] !== q[k]) dist++
    if (dist < bestDist) {
      bestDist = dist
      bestStart = s
    }
  }
  if (bestStart < 0 || bestDist > 1) return null
  // 长度差 1（插入/删除）时把窗口外的那一个字符一并高亮，避免孤字
  const extra = word.length === q.length ? 0 : 1
  return { start: bestStart, end: bestStart + len + extra }
}

/**
 * 拼音查询在带声调 pinyin 文本上的高亮区间：
 * 先把 pinyin 去空格、去声调做子串定位，再把下标映射回原文本（声调字符 1:1 映射，长度不变）。
 */
export function highlightPinyinSpan(pinyin: string, query: string): HighlightSpan | null {
  const q = query.trim().toLowerCase().replace(/\s+/g, '')
  if (!q) return null
  const nonSpaceIdx: number[] = []
  for (let i = 0; i < pinyin.length; i++) if (pinyin[i] !== ' ') nonSpaceIdx.push(i)
  if (nonSpaceIdx.length === 0) return null
  const flat = stripTones(nonSpaceIdx.map((i) => pinyin[i]).join(''))
  const idx = flat.indexOf(q)
  if (idx < 0) return null
  const start = nonSpaceIdx[idx]
  const end = nonSpaceIdx[idx + q.length - 1] + 1
  return { start, end }
}
