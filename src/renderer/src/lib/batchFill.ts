/**
 * V2-H 生词本批量 AI 补全纯逻辑（PLAN.md §3.3 生词本 v0.2「批量 AI 补全」/ §10.1）
 *
 * 流程：遍历 pending 词条 → 逐个调 AI 查询（V2-C ai:searchWord）→ 逐条预览
 * （draft 概览 / 失败原因）→ 用户逐条「确认入库 / 跳过」→ 确认写个人库（V2-F 机制）
 *
 * 依赖注入（本模块不依赖 window.api / Vue，可单测）：
 * - queryWord：逐词 AI 查询接线（V2-C）；seq 为批次内序号，可作 requestId 防 stale（§10.2）
 * - saveDraft：确认后的个人库写入（V2-F「写个人库」机制，quality=user）
 *
 * 取消语义：cancel() 置取消标志，run() 在「开始下一个词条查询前」检查并停止；
 * 正在进行的查询会正常完成并记录结果（不留悬挂状态）。
 */
import type { AiDraftResult } from '@shared/ipc/contracts'

/** AI 查询结果（ok 携带 draft；失败携带原因文案） */
export type QueryOutcome = { ok: true; draft: AiDraftResult } | { ok: false; reason: string }

export interface BatchFillDeps {
  queryWord: (word: string, seq: number) => Promise<QueryOutcome>
  saveDraft: (word: string, draft: AiDraftResult) => Promise<boolean>
  /** 每次状态变更后回调（UI 侧用于触发重渲染；纯逻辑不依赖 Vue，可单测） */
  onChange?: () => void
}

export type BatchItemStatus = 'queued' | 'querying' | 'ready' | 'failed' | 'skipped' | 'saved'

export interface BatchItem {
  word: string
  status: BatchItemStatus
  /** status=ready 时可用（AI draft 概览） */
  draft?: AiDraftResult
  /** status=failed 时的失败原因；save 失败时也会置为「保存失败，可重试」 */
  error?: string
}

export interface BatchFillController {
  items: () => BatchItem[]
  /** 1-based 当前处理序号；0 = 未开始 */
  current: () => number
  total: () => number
  running: () => boolean
  done: () => boolean
  cancelled: () => boolean
  savedCount: () => number
  failedCount: () => number
  skippedCount: () => number
  /** 顺序执行批次：逐词查询；cancel 后停止；已 done 再次 run 会重置重跑 */
  run: () => Promise<void>
  /** 确认入库（仅 status=ready 有效；成功 → saved） */
  confirm: (word: string) => Promise<boolean>
  /** 跳过（仅 status=ready 有效） */
  skip: (word: string) => void
  /** 取消：当前查询完成后停止 */
  cancel: () => void
}

export function createBatchFill(words: string[], deps: BatchFillDeps): BatchFillController {
  const items: BatchItem[] = words.map((word) => ({ word, status: 'queued' as const }))
  let currentIdx = 0
  let running = false
  let done = false
  let cancelled = false
  let saved = 0
  let failed = 0
  let skipped = 0

  function recount(): void {
    saved = items.filter((i) => i.status === 'saved').length
    failed = items.filter((i) => i.status === 'failed').length
    skipped = items.filter((i) => i.status === 'skipped').length
  }

  function itemOf(word: string): BatchItem | undefined {
    return items.find((i) => i.word === word)
  }

  function notify(): void {
    deps.onChange?.()
  }

  async function run(): Promise<void> {
    if (running) return
    if (done) {
      // 重置后重跑
      for (const it of items) {
        it.status = 'queued'
        it.draft = undefined
        it.error = undefined
      }
      currentIdx = 0
      done = false
      recount()
    }
    running = true
    cancelled = false
    notify()
    try {
      for (; currentIdx < items.length; currentIdx++) {
        if (cancelled) break
        const it = items[currentIdx]
        if (it.status === 'saved' || it.status === 'skipped') continue // 重跑时保留已处理项
        it.status = 'querying'
        notify()
        const outcome = await deps.queryWord(it.word, currentIdx)
        if (outcome.ok) {
          it.draft = outcome.draft
          it.status = 'ready'
        } else {
          it.error = outcome.reason
          it.status = 'failed'
        }
        notify()
      }
    } finally {
      running = false
      done = true
      recount()
      notify()
    }
  }

  async function confirm(word: string): Promise<boolean> {
    const it = itemOf(word)
    if (!it || it.status !== 'ready' || !it.draft) return false
    const ok = await deps.saveDraft(it.word, it.draft)
    if (ok) {
      it.status = 'saved'
      recount()
      notify()
      return true
    }
    it.error = '保存失败，请重试'
    notify()
    return false
  }

  function skip(word: string): void {
    const it = itemOf(word)
    if (!it || it.status !== 'ready') return
    it.status = 'skipped'
    recount()
    notify()
  }

  function cancel(): void {
    cancelled = true
  }

  return {
    items: () => items,
    current: () => (currentIdx >= items.length ? items.length : currentIdx + (running ? 1 : 0)),
    total: () => items.length,
    running: () => running,
    done: () => done,
    cancelled: () => cancelled,
    savedCount: () => saved,
    failedCount: () => failed,
    skippedCount: () => skipped,
    run,
    confirm,
    skip,
    cancel
  }
}

/** 便捷聚合：batch 结果摘要（供 UI 小结条使用） */
export function batchSummary(c: BatchFillController): {
  saved: number
  failed: number
  skipped: number
  remaining: number
} {
  return {
    saved: c.savedCount(),
    failed: c.failedCount(),
    skipped: c.skippedCount(),
    remaining: c.total() - c.savedCount() - c.failedCount() - c.skippedCount()
  }
}
