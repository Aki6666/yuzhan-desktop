/**
 * F9 进度摘要纯函数单测（掌握数/待复习/错词数）
 */
import { describe, it, expect } from 'vitest'
import { summarizeProgress } from '../src/renderer/src/lib/progressSummary'
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
