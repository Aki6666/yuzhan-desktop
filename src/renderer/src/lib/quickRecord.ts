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
import { pinyin } from 'pinyin-pro'
import type {
  AiDraftResult,
  AiMode,
  Emotion,
  ExampleItem,
  Idiom,
  NearItem,
  Register
} from '@shared/ipc/contracts'

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

// ---------------------------------------------------------------------------
// v0.2 AI 闭环（V2-F，§10.1 ②③）：aiMode 状态 / draft 校验 / 个人库最小实现
// ---------------------------------------------------------------------------

/** AI 模式中文标签（disabled/configured/online/error → 未配置/已配置/在线/异常） */
export function aiModeLabel(mode: AiMode): string {
  switch (mode) {
    case 'configured':
      return '已配置'
    case 'online':
      return '在线'
    case 'error':
      return '异常'
    default:
      return '未配置'
  }
}

/** AI 模式标签类型（Naive NTag） */
export function aiModeTagType(mode: AiMode): 'default' | 'info' | 'success' | 'error' {
  switch (mode) {
    case 'configured':
      return 'info'
    case 'online':
      return 'success'
    case 'error':
      return 'error'
    default:
      return 'default'
  }
}

/** AI 查询可用（§10.2 降级路径：未配置/异常 → 快速输入直接走生词本） */
export function aiEnabled(mode: AiMode): boolean {
  return mode === 'configured' || mode === 'online'
}

/** draft 缺字段标记（§10.1 缺字段明确标记）：返回缺失字段中文名列表 */
export function draftMissingFields(draft: AiDraftResult): string[] {
  const missing: string[] = []
  if (!draft.word?.trim()) missing.push('词形')
  if (!draft.meaning?.trim()) missing.push('释义')
  if (!draft.emotion) missing.push('感情色彩')
  if (!draft.register) missing.push('语域')
  if (!Array.isArray(draft.errorTypes) || draft.errorTypes.length === 0) missing.push('误用类型')
  if (typeof draft.frequency !== 'number' || draft.frequency < 1 || draft.frequency > 5) missing.push('频次')
  return missing
}

/** 词形 → 带声调拼音（pinyin-pro；个人库词条展示与拼音检索用） */
export function derivePinyin(word: string): string {
  const w = word.trim()
  if (!w) return ''
  return pinyin(w, { toneType: 'symbol' }).trim()
}

// ---------------------------------------------------------------------------
// 剪贴板自动填充（v0.2.6 迭代，§16.3 P0-②）：刷题复制成语 → 唤起快速记录零打字
// ---------------------------------------------------------------------------

/**
 * 剪贴板文本 → 快速记录查询词。
 * 仅当内容为纯 2–8 个汉字（成语/生词长度区间）时采用，避免把任意复制文本塞进检索框。
 */
export function clipboardToQuery(text: string): string {
  const t = text.trim()
  if (/^[\u4e00-\u9fa5]{2,8}$/.test(t)) return t
  return ''
}

// ---------------------------------------------------------------------------
// 个人库（v0.2 会话内注册表；v0.2.6 迭代 P0-④：userData/idioms-user.json 落盘，重启可加载）
// 说明：注册表为 renderer 会话内事实源（检索/去重），addPersonalItem 同时经
// user:add IPC 写盘（原子写 + .bak，复用持久化铁律）；启动时由 user store 的
// load() 调 initPersonalLibrary 恢复。写盘失败不阻断会话内登记（下次 add 重试）。
// ---------------------------------------------------------------------------

let personalIdSeq = 0
const personalLibrary: Idiom[] = []

/** 会话内个人库快照 */
export function listPersonalLibrary(): Idiom[] {
  return personalLibrary.slice()
}

/** 启动恢复（v0.2.6 P0-④）：以 user:list 全量替换注册表（幂等，可重复调用） */
export function initPersonalLibrary(items: Idiom[]): void {
  personalLibrary.length = 0
  for (const i of items) {
    if (i && typeof i.word === 'string') personalLibrary.push(i)
  }
}

/** 测试隔离用：清空个人库 */
export function clearPersonalLibrary(): void {
  personalLibrary.length = 0
}

/** 按词形查个人库（已收录词直接命中，避免重复建卡） */
export function findPersonal(word: string): Idiom | undefined {
  const w = word.trim()
  return personalLibrary.find((i) => i.word === w)
}

export interface PersonalIdiomInput {
  word: string
  meaning: string
  origin?: string
  usage?: string
  emotion: Emotion
  register: Register
  errorTypes: string[]
  near?: NearItem[]
  opposite?: string[]
  examples?: ExampleItem[]
  frequency: number
  tags?: string[]
}

/** 构建个人库词条（quality=user / library=user；id = 词形 slug + 序号） */
export function buildPersonalIdiom(input: PersonalIdiomInput): Idiom {
  personalIdSeq += 1
  const slug = input.word.trim().replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '').toLowerCase() || 'user'
  return {
    schemaVersion: 1,
    id: `${slug}-u${personalIdSeq.toString(36)}`,
    word: input.word.trim(),
    pinyin: derivePinyin(input.word),
    meaning: input.meaning.trim(),
    ...(input.origin?.trim() ? { origin: input.origin.trim() } : {}),
    ...(input.usage?.trim() ? { usage: input.usage.trim() } : {}),
    emotion: input.emotion,
    register: input.register,
    ...(input.near && input.near.length > 0 ? { near: input.near } : {}),
    ...(input.opposite && input.opposite.length > 0 ? { opposite: input.opposite } : {}),
    ...(input.examples && input.examples.length > 0 ? { examples: input.examples } : {}),
    errorTypes: input.errorTypes,
    frequency: input.frequency,
    ...(input.tags && input.tags.length > 0 ? { tags: input.tags } : {}),
    quality: 'user',
    library: 'user'
  }
}

/** 登记个人词条（按词形去重；返回是否新增；v0.2.6 P0-④ 同时异步落盘 userData/idioms-user.json） */
export function addPersonalItem(idiom: Idiom): boolean {
  if (personalLibrary.some((i) => i.word === idiom.word)) return false
  personalLibrary.push(idiom)
  void persistPersonalItem(idiom)
  return true
}

/** 异步落盘（user:add；写盘失败静默——会话内登记不受影响，下次 add 会重试全量快照） */
function persistPersonalItem(idiom: Idiom): void {
  try {
    const api = (window as unknown as { api?: { user?: { add: (r: { idiom: Idiom }) => Promise<unknown> } } }).api
    if (api?.user?.add) {
      void api.user.add({ idiom }).catch(() => {
        /* 落盘失败：仅记会话内（测试/离线环境无 user API 属正常） */
      })
    }
  } catch {
    /* 测试环境无 window.api.user：跳过持久化 */
  }
}
