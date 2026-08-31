/**
 * 快速记录（本地版）UI 层纯函数（PLAN.md §10 / F7 / AC-03/04）
 *
 * - 检索复用 shared/lib/search.ts（createSearchIndex/searchDetailed），本文件只做接线与展示派生
 * - 快捷键解析/匹配：应用内快捷键（窗口聚焦）为主；globalShortcut 升级/降级由 main 侧
 *   src/main/window.ts 承担（注册失败静默降级，§3.4/§10.2）
 * - 全部纯函数、无 DOM 依赖（KeyboardEvent 匹配仅依赖事件字段），可单测（tests/quick-input.test.ts）
 */
import {
  SearchTier,
  createSearchIndex,
  searchDetailed,
  type SearchHit,
  type SearchIndex
} from '@shared/lib/search'
import type { Idiom } from '@shared/ipc/contracts'

/** 搜索输入防抖（§3.4 通用 200ms） */
export const QUICK_INPUT_DEBOUNCE_MS = 200

// ---------------------------------------------------------------------------
// 快捷键（应用内）
// ---------------------------------------------------------------------------

export interface AcceleratorSpec {
  ctrlOrMeta: boolean
  alt: boolean
  shift: boolean
  key: string
}

/** 解析 electron 风格 accelerator 字符串，如 'CommandOrControl+K' */
export function parseAccelerator(accelerator: string): AcceleratorSpec {
  const spec: AcceleratorSpec = { ctrlOrMeta: false, alt: false, shift: false, key: '' }
  for (const part of accelerator.split('+')) {
    const p = part.trim()
    if (!p) continue
    if (p === 'CommandOrControl' || p === 'CmdOrCtrl' || p === 'Control' || p === 'Command' || p === 'Cmd') {
      spec.ctrlOrMeta = true
    } else if (p === 'Alt' || p === 'Option') {
      spec.alt = true
    } else if (p === 'Shift') {
      spec.shift = true
    } else {
      spec.key = p.toLowerCase()
    }
  }
  return spec
}

/** 判断键盘事件是否匹配 accelerator（CommandOrControl = ctrlKey 或 metaKey） */
export function eventMatchesAccelerator(e: KeyboardEvent, accelerator: string): boolean {
  const spec = parseAccelerator(accelerator)
  if (!spec.key) return false
  if (spec.ctrlOrMeta !== (e.ctrlKey || e.metaKey)) return false
  if (spec.alt !== e.altKey) return false
  if (spec.shift !== e.shiftKey) return false
  return e.key.toLowerCase() === spec.key
}

// ---------------------------------------------------------------------------
// 检索接线（复用 shared/lib/search.ts）
// ---------------------------------------------------------------------------

export function createQuickIndex(items: Idiom[]): SearchIndex {
  return createSearchIndex(items)
}

export function searchHits(index: SearchIndex, query: string, limit = 20): SearchHit[] {
  return searchDetailed(index, query, limit)
}

export function firstHit(hits: SearchHit[]): SearchHit | null {
  return hits[0] ?? null
}

/** 命中层级展示文案（精确→前缀→子串→编辑距离，§10.2） */
export function tierLabel(tier: SearchTier): string {
  switch (tier) {
    case SearchTier.Exact:
      return '精确命中'
    case SearchTier.Prefix:
      return '前缀命中'
    case SearchTier.Substring:
      return '包含命中'
    default:
      return '模糊命中'
  }
}

// ---------------------------------------------------------------------------
// 未命中 → 生词本（AC-04）
// ---------------------------------------------------------------------------

export function pendingWordFromQuery(query: string): string {
  return query.trim()
}

export function isRecordableQuery(query: string): boolean {
  return query.trim().length > 0
}

// ---------------------------------------------------------------------------
// 展示辅助
// ---------------------------------------------------------------------------

/** addedAt ISO → YYYY-MM-DD（非法输入原样返回） */
export function formatAddedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toISOString().slice(0, 10)
}
