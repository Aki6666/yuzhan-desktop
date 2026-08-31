/**
 * 进度摘要纯函数单测（F9 三摘要 + V2-E 掌握度仪表盘：掌握度百分比 / 今日到期 / 近 7 日趋势）
 */
import { describe, it, expect } from 'vitest'
import { summarizeProgress } from '../src/renderer/src/lib/progressSummary'
import {
  masteryPercent,
  reviewTrend,
  todayDueCount
} from '../src/renderer/src/components/progress-dashboard/dashboardStats'
import type { UserProgress } from '../shared/ipc/contracts'

function p(id: string, status: UserProgress['status'], wrongTimes = 0): UserProgress {
  return { id, status, wrongTimes, wrongTypes: {} }
}

describe('summarizeProgress', () => {
  it('空进度 → 全零', () => {
    expect(summarizeProgress({})).toEqual({ total: 0, mastered: 0, reviewing: 0, wrong: 0 })
  })

  it('三态混合统计：mastered / learning+new 归待复习 / wrongTimes>0 归错词', () => {
    const summary = summarizeProgress({
      a: p('a', 'mastered', 0),
      b: p('b', 'mastered', 2), // 掌握但曾错 → 同时计入错词
      c: p('c', 'learning', 1),
      d: p('d', 'new', 0)
    })
    expect(summary.total).toBe(4)
    expect(summary.mastered).toBe(2)
    expect(summary.reviewing).toBe(2)
    expect(summary.wrong).toBe(2)
  })

  it('reviewing = new + learning（未掌握）', () => {
    const summary = summarizeProgress({
      a: p('a', 'new', 0),
      b: p('b', 'learning', 0),
      c: p('c', 'mastered', 0)
    })
    expect(summary.reviewing).toBe(2)
    expect(summary.mastered).toBe(1)
  })

  it('wrong 计数按词条（非次数）：同词条多次错只计 1', () => {
    const summary = summarizeProgress({ a: p('a', 'learning', 5) })
    expect(summary.wrong).toBe(1)
  })

  it('不改写入参', () => {
    const input: Record<string, UserProgress> = { a: p('a', 'learning', 1) }
    const snapshot = JSON.stringify(input)
    summarizeProgress(input)
    expect(JSON.stringify(input)).toBe(snapshot)
  })
})

// ---------------------------------------------------------------------------
// V2-E 掌握度仪表盘纯函数
// ---------------------------------------------------------------------------

describe('masteryPercent 掌握度百分比', () => {
  it('总数为 0 → 0', () => {
    expect(masteryPercent(0, 0)).toBe(0)
    expect(masteryPercent(3, 0)).toBe(0)
  })

  it('mastered/总数 百分比，保留 1 位小数', () => {
    expect(masteryPercent(3, 10)).toBe(30)
    expect(masteryPercent(1, 3)).toBe(33.3) // 33.33 → 33.3
    expect(masteryPercent(2, 3)).toBe(66.7) // 66.66 → 66.7
    expect(masteryPercent(10, 10)).toBe(100)
    expect(masteryPercent(0, 10)).toBe(0)
  })

  it('上限 100（分母小于分子时封顶）', () => {
    expect(masteryPercent(5, 4)).toBe(100) // 页面侧分母=正式库规模，异常值封顶
  })
})

describe('todayDueCount 今日到期复习数', () => {
  const base: UserProgress = { id: 'a', status: 'learning', wrongTimes: 0, wrongTypes: {} }

  it('空进度 → 0', () => {
    expect(todayDueCount({}, '2026-09-01')).toBe(0)
  })

  it('due=今天 → 计入（可立即复习）', () => {
    const progress: Record<string, UserProgress> = {
      a: { ...base, id: 'a', review: { interval: 1, ease: 2.5, due: '2026-09-01' } },
      b: { ...base, id: 'b', review: { interval: 3, ease: 2.5, due: '2026-09-05' } } // 未到期
    }
    expect(todayDueCount(progress, '2026-09-01')).toBe(1)
  })

  it('due 早于今天（过期）→ 同样计入', () => {
    const progress: Record<string, UserProgress> = {
      a: { ...base, id: 'a', review: { interval: 2, ease: 2.5, due: '2026-08-30' } }
    }
    expect(todayDueCount(progress, '2026-09-01')).toBe(1)
  })

  it('无 review 记录 → 不计入', () => {
    const progress: Record<string, UserProgress> = {
      a: { ...base, id: 'a' },
      b: { ...base, id: 'b', lastSeen: '2026-09-01' }
    }
    expect(todayDueCount(progress, '2026-09-01')).toBe(0)
  })
})

describe('reviewTrend 近 7 日复习趋势', () => {
  const base: UserProgress = { id: 'x', status: 'learning', wrongTimes: 0, wrongTypes: {} }

  it('空进度 → 7 天全零点（含今天，日期升序）', () => {
    const t = reviewTrend({}, '2026-09-07', 7)
    expect(t).toHaveLength(7)
    expect(t[0]).toEqual({ date: '2026-09-01', reviews: 0, mastered: 0 })
    expect(t[6]).toEqual({ date: '2026-09-07', reviews: 0, mastered: 0 })
  })

  it('reviewAt 落日计入复习；同天多条累加', () => {
    const progress: Record<string, UserProgress> = {
      a: {
        ...base,
        id: 'a',
        review: { interval: 1, ease: 2.5, due: '2026-09-02', reviewAt: '2026-09-02T10:00:00.000Z' }
      },
      b: {
        ...base,
        id: 'b',
        review: { interval: 2, ease: 2.5, due: '2026-09-05', reviewAt: '2026-09-02T18:30:00.000Z' }
      },
      c: {
        ...base,
        id: 'c',
        review: { interval: 3, ease: 2.5, due: '2026-09-06', reviewAt: '2026-09-04T08:00:00.000Z' }
      }
    }
    const t = reviewTrend(progress, '2026-09-07', 7)
    const byDate = new Map(t.map((p) => [p.date, p]))
    expect(byDate.get('2026-09-02')?.reviews).toBe(2)
    expect(byDate.get('2026-09-04')?.reviews).toBe(1)
    expect(byDate.get('2026-09-07')?.reviews).toBe(0)
  })

  it('无 reviewAt 回退 lastSeen 计入复习（v0.1 旧数据口径）', () => {
    const progress: Record<string, UserProgress> = {
      a: { ...base, id: 'a', lastSeen: '2026-09-03' }
    }
    const t = reviewTrend(progress, '2026-09-07', 7)
    expect(t.find((p) => p.date === '2026-09-03')?.reviews).toBe(1)
  })

  it('mastered 且 lastSeen=当天 → 新掌握数', () => {
    const progress: Record<string, UserProgress> = {
      a: { ...base, id: 'a', status: 'mastered', lastSeen: '2026-09-02' },
      b: { ...base, id: 'b', status: 'mastered', lastSeen: '2026-09-02' },
      c: { ...base, id: 'c', status: 'learning', lastSeen: '2026-09-02' } // 未掌握不计掌握
    }
    const t = reviewTrend(progress, '2026-09-07', 7)
    expect(t.find((p) => p.date === '2026-09-02')?.mastered).toBe(2)
    expect(t.find((p) => p.date === '2026-09-02')?.reviews).toBe(3) // 复习按 lastSeen 回退口径
  })

  it('窗口外日期不计入', () => {
    const progress: Record<string, UserProgress> = {
      a: { ...base, id: 'a', lastSeen: '2026-08-20' } // 7 天窗口外
    }
    const t = reviewTrend(progress, '2026-09-07', 7)
    expect(t.every((p) => p.reviews === 0 && p.mastered === 0)).toBe(true)
  })

  it('days 参数可调（3 天）', () => {
    const t = reviewTrend({}, '2026-09-07', 3)
    expect(t).toHaveLength(3)
    expect(t[0].date).toBe('2026-09-05')
    expect(t[2].date).toBe('2026-09-07')
  })

  it('不改写入参', () => {
    const progress: Record<string, UserProgress> = {
      a: { ...base, id: 'a', review: { interval: 1, ease: 2.5, due: '2026-09-02', reviewAt: '2026-09-02T10:00:00.000Z' } }
    }
    const snapshot = JSON.stringify(progress)
    reviewTrend(progress, '2026-09-07', 7)
    todayDueCount(progress, '2026-09-07')
    expect(JSON.stringify(progress)).toBe(snapshot)
  })
})
