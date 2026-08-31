/**
 * 进度摘要纯函数（F9 进度页，US-05）：掌握数 / 待复习 / 错词数
 * 数据来自 progress store（§4.3，会话内事实源）。
 */
import type { UserProgress } from '@shared/ipc/contracts'

export interface ProgressSummary {
  /** 总词条数（有进度记录） */
  total: number
  /** 掌握：status=mastered */
  mastered: number
  /** 待复习：status=new | learning（未掌握） */
  reviewing: number
  /** 错词数：wrongTimes > 0 */
  wrong: number
}

export function summarizeProgress(progress: Record<string, UserProgress>): ProgressSummary {
  let mastered = 0
  let reviewing = 0
  let wrong = 0
  for (const item of Object.values(progress)) {
    if (item.status === 'mastered') {
      mastered += 1
    } else {
      reviewing += 1
    }
    if (item.wrongTimes > 0) wrong += 1
  }
  return { total: Object.keys(progress).length, mastered, reviewing, wrong }
}
