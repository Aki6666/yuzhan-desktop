/**
 * SM-2 间隔重复纯算法单测（V2-B，§4.8 纯函数清单 / §5.6）
 * 覆盖：评分边界、ease 公式与下限 1.3、interval 递增（0→1→6→×ease）、失败重置、
 * due 计算（ISO 日期 + N 天）、新卡/学习卡/已掌握卡分支、纯函数无副作用
 */
import { describe, it, expect } from 'vitest'
import {
  SM2_MASTERED_INTERVAL,
  SM2_MIN_EASE,
  addDays,
  applySm2,
  nextInterval,
  parseDateStr,
  sm2Branch,
  toDateStr,
  updateEase
} from '../shared/lib/sm2'
import type { ReviewState } from '../shared/ipc/contracts'

const NOW = new Date('2026-08-31T10:00:00Z')
const TODAY = '2026-08-31'

const review = (interval: number, ease = 2.5, due = TODAY): ReviewState => ({ interval, ease, due })

describe('评分边界与参数校验', () => {
  it('q=0 与 q=5 均合法', () => {
    expect(applySm2(null, 0, NOW).status).toBe('learning')
    expect(applySm2(null, 5, NOW).review.ease).toBeGreaterThan(2.5)
  })

  it('非法评分（6 / -1 / 非整数）→ 抛错', () => {
    expect(() => applySm2(null, 6 as never, NOW)).toThrow('0–5')
    expect(() => applySm2(null, -1 as never, NOW)).toThrow('0–5')
    expect(() => applySm2(null, 2.5 as never, NOW)).toThrow('0–5')
  })
})

describe('ease 更新公式与下限（≥1.3）', () => {
  it('q=5 → +0.1；q=4 → 不变；q=0 → -0.8', () => {
    expect(updateEase(2.5, 5)).toBeCloseTo(2.6, 10)
    expect(updateEase(2.5, 4)).toBeCloseTo(2.5, 10)
    expect(updateEase(2.5, 0)).toBeCloseTo(1.7, 10)
  })

  it('下限 1.3：反复低分不跌破', () => {
    let ease = 2.5
    for (let i = 0; i < 5; i++) ease = updateEase(ease, 0)
    expect(ease).toBe(SM2_MIN_EASE)
    expect(updateEase(1.3, 0)).toBe(SM2_MIN_EASE)
  })
})

describe('interval 递增与失败重置', () => {
  it('新卡 q≥3 → 1；再 q≥3 → 6；再 q≥3 → round(6*ease)', () => {
    expect(nextInterval(null, 2.5, 4)).toBe(1)
    expect(nextInterval(review(1), 2.5, 4)).toBe(6)
    expect(nextInterval(review(6), 2.6, 4)).toBe(Math.round(6 * 2.6))
  })

  it('q<3 失败 → interval 重置 0（立即重学）', () => {
    expect(nextInterval(review(21), 2.5, 2)).toBe(0)
    const r = applySm2(review(21), 2, NOW)
    expect(r.review.interval).toBe(0)
    expect(r.status).toBe('learning') // 已掌握卡失败 → 降级
  })
})

describe('due 计算（ISO 日期 + N 天）', () => {
  it('addDays：跨月/跨年正确', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-08-31', 0)).toBe('2026-08-31')
  })

  it('applySm2 新卡通过 → due = 今天 + 1；失败 → due = 今天（interval 0）', () => {
    const pass = applySm2(null, 4, NOW)
    expect(pass.review.due).toBe('2026-09-01')
    const fail = applySm2(null, 1, NOW)
    expect(fail.review.due).toBe(TODAY)
  })

  it('parseDateStr/toDateStr 往返一致', () => {
    expect(toDateStr(parseDateStr('2026-08-31'))).toBe('2026-08-31')
  })
})

describe('新卡 / 学习卡 / 已掌握卡分支', () => {
  it('sm2Branch：null → new；interval 0 → new；1–6 → learning；≥21 → mastered', () => {
    expect(sm2Branch(null)).toBe('new')
    expect(sm2Branch(review(0))).toBe('new')
    expect(sm2Branch(review(1))).toBe('learning')
    expect(sm2Branch(review(6))).toBe('learning')
    expect(sm2Branch(review(21))).toBe('mastered')
    expect(sm2Branch(review(60))).toBe('mastered')
  })

  it('新卡 q≥3 → status learning + reviewAt 记录', () => {
    const r = applySm2(null, 4, NOW)
    expect(r.status).toBe('learning')
    expect(r.review.reviewAt).toBe(NOW.toISOString())
  })

  it('学习卡连续通过 → 最终 mastered（interval ≥ 21）', () => {
    let cur: ReviewState | null = null
    let result = applySm2(cur, 4, NOW)
    cur = result.review
    for (let i = 0; i < 8; i++) {
      result = applySm2(cur, 4, NOW)
      cur = result.review
    }
    expect(cur.interval).toBeGreaterThanOrEqual(SM2_MASTERED_INTERVAL)
    expect(result.status).toBe('mastered')
  })

  it('已掌握卡（interval≥21）q≥3 → 保持 mastered 且 interval 继续增长', () => {
    const r = applySm2(review(21), 4, NOW)
    expect(r.status).toBe('mastered')
    expect(r.review.interval).toBeGreaterThan(21)
  })
})

describe('纯函数无副作用', () => {
  it('applySm2 不修改入参 ReviewState', () => {
    const prev: ReviewState = { interval: 6, ease: 2.6, due: '2026-08-30', reviewAt: '2026-08-30T00:00:00Z' }
    const snapshot = JSON.stringify(prev)
    applySm2(prev, 4, NOW)
    expect(JSON.stringify(prev)).toBe(snapshot)
  })
})
