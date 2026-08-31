/**
 * SM-2 间隔重复纯算法（PLAN.md §4.8 纯函数清单 / §5.6，v0.2 学习引擎核心）
 *
 * - 复习评分 q ∈ 0..5 → 更新 ease（下限 1.3）/ interval（递增）/ due（ISO 日期）
 * - 分支：新卡（无 ReviewState 或 interval=0）/ 学习卡（interval 1–6）/ 已掌握卡（interval ≥ 21）
 * - 失败（q<3）：interval 重置 0（立即重学），ease 按公式下调（下限 1.3）
 * - 字段与 V2-A（t21）的 ReviewState 一致（interval 天 / ease 浮点 / due YYYY-MM-DD / reviewAt ISO）
 * - 纯函数、无副作用（输入 ReviewState 不被修改），供闪卡/自测调度消费
 */
import type { ReviewState } from '../ipc/contracts'

/** 复习评分（SM-2 标准 0–5；≥3 通过，<3 失败重学） */
export type ReviewGrade = 0 | 1 | 2 | 3 | 4 | 5

export const SM2_MIN_EASE = 1.3
export const SM2_FIRST_INTERVAL = 1
export const SM2_SECOND_INTERVAL = 6
/** 视为已掌握的最小间隔（天）：interval ≥ 21 判定 mastered 分支 */
export const SM2_MASTERED_INTERVAL = 21

export type Sm2Branch = 'new' | 'learning' | 'mastered'

export interface Sm2Schedule {
  review: ReviewState
  /** 建议的状态迁移（供 progress store markStatus 消费） */
  status: 'new' | 'learning' | 'mastered'
}

/** 卡分支判定（纯函数）：无记录/interval=0 → 新卡；interval≥21 → 已掌握；其余 → 学习卡 */
export function sm2Branch(review: ReviewState | null): Sm2Branch {
  if (!review || review.interval === 0) return 'new'
  if (review.interval >= SM2_MASTERED_INTERVAL) return 'mastered'
  return 'learning'
}

/** 更新 ease：EF' = EF + (0.1 - (5-q)*(0.08+(5-q)*0.02))，下限 1.3（SM-2 标准公式） */
export function updateEase(currentEase: number, q: ReviewGrade): number {
  const next = currentEase + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  return next < SM2_MIN_EASE ? SM2_MIN_EASE : next
}

/** 下一个间隔（天）：q<3 失败重置 0；0→1→6→round(interval*ease) 递增 */
export function nextInterval(prev: ReviewState | null, ease: number, q: ReviewGrade): number {
  if (q < 3) return 0
  const base = prev?.interval ?? 0
  if (base === 0) return SM2_FIRST_INTERVAL
  if (base === 1) return SM2_SECOND_INTERVAL
  return Math.max(SM2_FIRST_INTERVAL, Math.round(base * ease))
}

/** 日期工具：YYYY-MM-DD ↔ UTC Date（与 t21 的 due 口径一致） */
export function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function parseDateStr(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function addDays(dateStr: string, days: number): string {
  const d = parseDateStr(dateStr)
  d.setUTCDate(d.getUTCDate() + days)
  return toDateStr(d)
}

/**
 * SM-2 调度主函数（纯函数）：
 * @param prev 当前调度状态（无/新卡传 null；V2-A 迁移后必有默认 review）
 * @param q    复习评分 0–5（≥3 通过，<3 失败重学）
 * @param now  调度时钟（测试可注入；默认当前时间）
 */
export function applySm2(prev: ReviewState | null, q: ReviewGrade, now: Date = new Date()): Sm2Schedule {
  if (!Number.isInteger(q) || q < 0 || q > 5) {
    throw new Error(`SM-2 评分必须为 0–5 整数，收到: ${String(q)}`)
  }
  const baseEase = prev?.ease ?? 2.5
  const ease = updateEase(baseEase, q)
  const interval = nextInterval(prev, ease, q)
  const due = addDays(toDateStr(now), interval)
  const status = deriveStatus(prev, q, interval)
  return {
    review: { interval, ease, due, reviewAt: now.toISOString() },
    status
  }
}

/** 状态迁移建议：q<3 → learning（重学/降级）；interval 达标 → mastered；其余 learning */
function deriveStatus(prev: ReviewState | null, q: ReviewGrade, interval: number): 'new' | 'learning' | 'mastered' {
  if (q < 3) return 'learning'
  if (interval >= SM2_MASTERED_INTERVAL) return 'mastered'
  // 已掌握卡复习通过（q≥3）保持 mastered
  if (sm2Branch(prev) === 'mastered') return 'mastered'
  return 'learning'
}
