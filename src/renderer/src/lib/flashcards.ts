/**
 * 闪卡纯逻辑（PLAN.md §3.3 / §3.4 / F5 / AC-05）
 *
 * - 收敛规则：同一词连续 3 次「认识」→ mastered；1 次「不认识」→ 降级 learning（AC-05）
 * - FlashcardTracker：会话内按词 id 维护收敛状态（内存态，随应用运行期保持；
 *   持久化走 T3 progress store 的 markStatus/flush，计数器字段不在 v0.1 数据模型内，重启归零）
 * - 会话小结：认识 X / 不认识 Y 计数（§3.4）
 *
 * 纯逻辑、无 DOM/无 Electron/无 Pinia 依赖，tests/flashcards.test.ts 单测。
 */
import type { ProgressStatus } from '@shared/ipc/contracts'

export type FlashcardJudgment = 'known' | 'unknown'

/** 连续「认识」达 3 次即 mastered（§3.3 收敛规则） */
export const MASTERED_AFTER_KNOWN = 3

/** 收敛状态：当前进度状态 + 连续认识计数 */
export interface FlashcardStatus {
  status: ProgressStatus
  consecutiveKnown: number
}

export const INITIAL_FLASHCARD_STATUS: FlashcardStatus = { status: 'new', consecutiveKnown: 0 }

/**
 * 收敛规则纯函数（AC-05）：
 * - known：连续计数 +1；连续 ≥3 次 → mastered，否则 learning
 * - unknown：降级 learning 且计数清零（含 mastered 降级，§3.3「1 次不认识→降级 learning」）
 */
export function applyJudgment(prev: FlashcardStatus, judgment: FlashcardJudgment): FlashcardStatus {
  if (judgment === 'unknown') {
    return { status: 'learning', consecutiveKnown: 0 }
  }
  const consecutiveKnown = prev.consecutiveKnown + 1
  return {
    status: consecutiveKnown >= MASTERED_AFTER_KNOWN ? 'mastered' : 'learning',
    consecutiveKnown
  }
}

/** 会话小结计数（§3.4：本轮认识 X / 不认识 Y） */
export interface SessionSummary {
  known: number
  unknown: number
}

export function emptySummary(): SessionSummary {
  return { known: 0, unknown: 0 }
}

/** 记录一次判定并返回新小结（不可变） */
export function recordJudgment(summary: SessionSummary, judgment: FlashcardJudgment): SessionSummary {
  if (judgment === 'known') return { known: summary.known + 1, unknown: summary.unknown }
  return { known: summary.known, unknown: summary.unknown + 1 }
}

/** 撤销一次判定（不可变，供「撤销上一步」恢复计数） */
export function unrecordJudgment(summary: SessionSummary, judgment: FlashcardJudgment): SessionSummary {
  if (judgment === 'known') return { known: Math.max(0, summary.known - 1), unknown: summary.unknown }
  return { known: summary.known, unknown: Math.max(0, summary.unknown - 1) }
}

/**
 * 会话内收敛状态跟踪器：按词 id 保存 FlashcardStatus，支持判定/回滚/重置。
 * 页面以模块级单例使用（同一应用运行期内跨闪卡会话保持连续计数，对应
 * 「同一词连续 3 次认识」跨会话累积；应用重启后归零——v0.1 数据模型无该字段）。
 */
export class FlashcardTracker {
  private states = new Map<string, FlashcardStatus>()

  get(id: string): FlashcardStatus {
    return this.states.get(id) ?? { ...INITIAL_FLASHCARD_STATUS }
  }

  /** 应用收敛规则并记录新状态，返回「判定前状态 + 判定后状态」（供撤销回滚） */
  judge(id: string, judgment: FlashcardJudgment): { before: FlashcardStatus; after: FlashcardStatus } {
    const before = this.get(id)
    const after = applyJudgment(before, judgment)
    this.states.set(id, after)
    return { before, after }
  }

  /** 撤销：恢复该词判定前状态（原状态若为初始态则删除记录） */
  revert(id: string, before: FlashcardStatus): void {
    if (before.consecutiveKnown === 0 && before.status === 'new') {
      this.states.delete(id)
    } else {
      this.states.set(id, { ...before })
    }
  }

  reset(): void {
    this.states.clear()
  }
}

/** 页面级共享跟踪器（模块级单例；测试中可 reset） */
export const flashcardTracker = new FlashcardTracker()

/**
 * 牌堆构建：待复习卡 = 非 mastered 词条（§3.3 空态：全部 mastered → 引导浏览/自测），
 * 并做 Fisher–Yates 洗牌随机抽取（FIX-1，附录 B v0.1.2：避免每轮固定顺序）。
 * 随机源可注入（默认 Math.random），测试用种子保证确定性。
 */
export function buildReviewDeck(
  items: { id: string }[],
  isMastered: (id: string) => boolean,
  random: () => number = Math.random
): { id: string }[] {
  const deck = items.filter((i) => !isMastered(i.id))
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}
