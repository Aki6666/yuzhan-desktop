/**
 * 掌握度仪表盘纯函数（V2-E，v0.2 进度页升级，§8 掌握度仪表盘）
 *
 * - 掌握度百分比：mastered / 总词条（正式库规模）
 * - 今日到期复习数：ReviewState.due ≤ 今天（§5.6：due=今天 表示可立即复习；过期也算到期）
 * - 近 7 日复习趋势：按 reviewAt（上次复习时间）落日的复习次数 + 按 lastSeen 落日的
 *   新掌握数（mastered 词条），生成 mini 折线/条形图数据
 *
 * 纯函数、无 DOM / 无 Pinia 依赖，可单测（tests/progress-summary.test.ts）。
 * 误用类型分布复用 V2-D wrongBookStats.aggregateWrongTypes（本文件不再重复实现）。
 */
import type { UserProgress } from '@shared/ipc/contracts'

/** 趋势点：某天的复习次数与新掌握数 */
export interface TrendPoint {
  /** 日期 YYYY-MM-DD */
  date: string
  /** 当天复习次数（按 review.reviewAt 落日的词条数；无 reviewAt 时回退 lastSeen） */
  reviews: number
  /** 当天新掌握数（status=mastered 且 lastSeen=当天的词条数） */
  mastered: number
}

/**
 * 掌握度百分比（mastered / 总词条），保留 1 位小数、上限 100；总数为 0 时返回 0。
 * @param mastered 已掌握词条数
 * @param total 总词条数（正式库规模；v0.1 无读取 channel 时可用 progress 条目数兜底）
 */
export function masteryPercent(mastered: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(100, Math.round((mastered / total) * 1000) / 10)
}

/**
 * 今日到期复习数：ReviewState.due ≤ today 的词条数（§5.6：due=今天 表示可立即复习；
 * 过期（due < today）同样计入，提示需尽快复习）。
 */
export function todayDueCount(progress: Record<string, UserProgress>, today: string): number {
  return Object.values(progress).filter((p) => p.review && p.review.due <= today).length
}

/**
 * 近 N 日复习趋势（默认 7 天，含今天；按日期升序）。
 * - reviews：词条 review.reviewAt 落在该天的计数；无 reviewAt 的记录回退用 lastSeen
 *   （v0.1 旧数据只有 lastSeen，保证趋势不空）
 * - mastered：词条 status=mastered 且 lastSeen=该天的计数（「当天新掌握」近似口径）
 */
export function reviewTrend(
  progress: Record<string, UserProgress>,
  today: string,
  days = 7
): TrendPoint[] {
  const points: TrendPoint[] = []
  const base = new Date(`${today}T00:00:00Z`)
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(base.getTime() - i * 86_400_000)
    points.push({
      date: d.toISOString().slice(0, 10),
      reviews: 0,
      mastered: 0
    })
  }
  const index = new Map(points.map((p) => [p.date, p]))
  for (const item of Object.values(progress)) {
    const reviewDay = item.review?.reviewAt ? item.review.reviewAt.slice(0, 10) : item.lastSeen
    if (reviewDay && index.has(reviewDay)) index.get(reviewDay)!.reviews += 1
    if (item.status === 'mastered' && item.lastSeen && index.has(item.lastSeen)) {
      index.get(item.lastSeen)!.mastered += 1
    }
  }
  return points
}
