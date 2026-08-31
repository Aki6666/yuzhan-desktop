/**
 * 错题本页纯函数（V2-D，v0.2 错题本 + 误用类型统计）
 *
 * - 数据源：progress store（V2-A 已扩展，wrongTimes/wrongTypes/wrongTypes[type] 计数）
 * - 误用类型 8 类按 §5.2 判定优先级顺序展示（PLAN.md §5.2 判定表）
 * - 纯函数、无 DOM/无 Pinia 依赖，可单测（tests/wrong-book.test.ts）
 */
import type { Idiom, ProgressStatus, UserProgress } from '@shared/ipc/contracts'

/** §5.2 误用类型 8 类（判定优先级自上而下） */
export const WRONG_TYPE_ORDER = [
  '望文生义',
  '形近/音近混淆',
  '语义重复',
  '搭配不当',
  '对象误用',
  '谦敬错位',
  '褒贬误用',
  '轻重失当'
] as const

/** 错题行（wrongTimes>0，按错误次数降序；id 字典序稳定） */
export interface WrongItemRow {
  id: string
  word: string
  pinyin: string
  status: ProgressStatus
  wrongTimes: number
  wrongTypes: { type: string; count: number }[]
  /** 库内词条（可能未收录，此时 word 回退为 id） */
  idiom?: Idiom
}

/** 错题列表：wrongTimes>0 词条，按次数降序（同次按 id 稳定） */
export function wrongItems(
  progress: Record<string, UserProgress>,
  items: Idiom[]
): WrongItemRow[] {
  const byId = new Map(items.map((i) => [i.id, i]))
  return Object.values(progress)
    .filter((p) => p.wrongTimes > 0)
    .map((p) => {
      const idiom = byId.get(p.id)
      return {
        id: p.id,
        word: idiom?.word ?? p.id,
        pinyin: idiom?.pinyin ?? '',
        status: p.status,
        wrongTimes: p.wrongTimes,
        wrongTypes: Object.entries(p.wrongTypes)
          .filter(([, n]) => n > 0)
          .map(([type, count]) => ({ type, count })),
        idiom
      }
    })
    .sort((a, b) => b.wrongTimes - a.wrongTimes || (a.id < b.id ? -1 : 1))
}

export interface WrongTypeStat {
  type: string
  /** 出现总次数（所有错题 wrongTypes 累加） */
  count: number
  /** 占比（0–100，保留 1 位小数） */
  percent: number
}

/**
 * 误用类型聚合：按 §5.2 8 类顺序列出（未出现类 count=0 也列出，占比 0）；
 * 数据中超出词表的类型附加在末尾。
 */
export function aggregateWrongTypes(progress: Record<string, UserProgress>): WrongTypeStat[] {
  const counts = new Map<string, number>()
  for (const p of Object.values(progress)) {
    for (const [type, n] of Object.entries(p.wrongTypes)) {
      if (n > 0) counts.set(type, (counts.get(type) ?? 0) + n)
    }
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0)
  const known: string[] = [...WRONG_TYPE_ORDER]
  const extra = [...counts.keys()].filter((k) => !known.includes(k))
  return [...known, ...extra].map((type) => {
    const count = counts.get(type) ?? 0
    return { type, count, percent: total > 0 ? Math.round((count / total) * 1000) / 10 : 0 }
  })
}

/** 状态中文标签（去英文：mastered/learning/new → 已掌握/学习中/新词） */
export function statusLabel(status: ProgressStatus): string {
  switch (status) {
    case 'mastered':
      return '已掌握'
    case 'learning':
      return '学习中'
    default:
      return '新词'
  }
}

/** 状态标签类型（Naive NTag type，与展示层解耦） */
export function statusTagType(status: ProgressStatus): 'success' | 'warning' | 'default' {
  switch (status) {
    case 'mastered':
      return 'success'
    case 'learning':
      return 'warning'
    default:
      return 'default'
  }
}
