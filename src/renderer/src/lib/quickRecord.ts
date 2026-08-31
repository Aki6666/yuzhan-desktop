/**
 * 快速记录（本地版）UI 层纯函数（PLAN.md §10 / F7 / AC-03/04）
 *
 * - 检索复用 shared/lib/search.ts（createSearchIndex/searchDetailed），本文件只做接线与展示派生
 * - 快捷键（FIX-1/FIX-2，附录 B v0.1.2/v0.1.3）：应用内快捷键（窗口聚焦时 window keydown），
 *   默认「+」键（DEFAULT_SHORTCUT='Plus'），可在设置页自定义；main 侧不注册 globalShortcut
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

/** 解析 electron 风格 accelerator 字符串，如 'CommandOrControl+K'；FIX-2：'Plus' 表示「+」键 */
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
    } else if (p === 'Plus') {
      spec.key = '+'
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

/**
 * 「+」键直接触发判定（FIX-1，附录 B v0.1.2）：
 * - 主键盘 '+'（美式布局 Shift+=）→ e.key === '+'
 * - 等号键（无 Shift 布局直接出 '+'）→ e.key === '='
 * - 数字键盘加号 → e.code === 'NumpadAdd'（现代浏览器 e.key 亦为 '+'，旧 keyCode 语义 'Add' 一并兼容）
 */
export function isPlusKey(e: KeyboardEvent): boolean {
  return e.key === '+' || e.key === '=' || e.key === 'Add' || e.code === 'NumpadAdd'
}

/**
 * 默认触发键（FIX-2，附录 B v0.1.3）：「+」键。存储值为 'Plus'（parseAccelerator 兼容格式）。
 * 旧版本默认 'CommandOrControl+K' 不再默认触发（settings store 加载时迁移为 'Plus'）。
 */
export const DEFAULT_SHORTCUT = 'Plus'

/**
 * 按键事件 → accelerator 字符串（FIX-2 自定义按键捕获用，parseAccelerator 兼容格式）。
 * - 修饰键：ctrl→Control / alt→Alt / shift→Shift / meta→Command
 * - 主键：「+」系列 → 'Plus'；字母数字 → 大写；空格/回车/方向键/Esc 有对应 token
 * - 单独修饰键、未知键返回 ''（捕获器忽略，等待下一个有效键）
 */
export function acceleratorFromEvent(e: KeyboardEvent): string {
  if (e.key === 'Escape' || e.key === 'Tab' || e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') {
    return ''
  }
  const mods: string[] = []
  if (e.ctrlKey) mods.push('Control')
  if (e.metaKey) mods.push('Command')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey && !isPlusKey(e)) mods.push('Shift')
  let key = ''
  if (isPlusKey(e)) {
    key = 'Plus'
  } else if (/^[a-zA-Z0-9]$/.test(e.key)) {
    key = e.key.toUpperCase()
  } else if (e.key === ' ') {
    key = 'Space'
  } else if (e.key === 'Enter') {
    key = 'Enter'
  } else if (e.key.startsWith('Arrow')) {
    key = e.key.slice(5)
  } else if (e.key.length === 1) {
    key = e.key.toUpperCase()
  } else {
    return ''
  }
  return [...mods, key].join('+')
}

const MOD_LABELS: Record<string, string> = {
  Control: 'Ctrl',
  Command: '⌘',
  CommandOrControl: 'Ctrl',
  CmdOrCtrl: 'Ctrl',
  Alt: 'Alt',
  Option: 'Alt',
  Shift: 'Shift'
}
const KEY_LABELS: Record<string, string> = {
  Plus: '+',
  Space: '空格',
  Enter: '回车',
  Esc: 'Esc',
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→'
}

/** accelerator → 中文描述（FIX-2 去英文：UI 展示用），如 'Control+K' → 'Ctrl + K'，'Plus' → '+' */
export function describeShortcut(accelerator: string): string {
  const parts = accelerator.split('+').map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) return ''
  const mods = parts.slice(0, -1).map((p) => MOD_LABELS[p] ?? p)
  const key = parts[parts.length - 1]
  return [...mods, KEY_LABELS[key] ?? key].join(' + ')
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
