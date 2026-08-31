/**
 * progress store（PLAN.md §4.3）：用户进度 + 节流写（§10.3#6：≤1 次/2s，闪卡/自测结束强制 flush）
 *
 * 完整 API（供 T6/T7/T8 消费）：
 * - recordAttempt(id)      复习一次（快速记录「复习一次」/ 闪卡翻卡）：new→learning，更新 lastSeen
 *                          + SM-2 调度字段（v0.2 §5.6：无 review 补默认，reviewAt=now）
 * - markStatus(id, status) 标记状态（闪卡收敛规则：连续 3 次认识→mastered，1 次不认识→learning）
 * - incrementWrong(id, type?) 错题计数（wrongTimes+1，可选 wrongTypes 累加；mastered 降级 learning）
 * - scheduleReview(id, patch) SM-2 调度字段写入（V2-B 算法消费；interval/ease/due/reviewAt）
 * - getReview(id)          读取调度状态（V2-B 消费）
 * - flush()                强制立即写盘（会话结束时调用）
 *
 * 说明：§10.4 权威 channel 清单未含进度读取 channel（仅 progress:save 写），
 * 本 store 以内存态为会话事实源，写穿 userData；重启后数据仍在 userData/progress.json
 * （读取入口留待后续版本，见 PLAN §10.4）。
 */
import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { ProgressSaveRequest, ProgressStatus, ReviewState, UserProgress } from '@shared/ipc/contracts'

const THROTTLE_MS = 2000

export const useProgressStore = defineStore('progress', () => {
  /** 内存态：id → UserProgress（会话内事实源；启动/自测结束后从 main 全量同步，用户要求 #5） */
  const progress = ref<Record<string, UserProgress>>({})
  const loaded = ref(false)
  const loading = ref(false)

  /** 从 main 拉取持久化进度并合并（userData/progress.json；错题本/进度页/自测结束调用）。
   * 合并语义：main 数据补进内存，但**本地已有的会话写入优先**（节流窗口内尚未落盘的
   * 写入不被 main 旧值覆盖；单实例下本地总是>=main 新鲜度）。 */
  async function load(): Promise<void> {
    if (loading.value) return
    loading.value = true
    try {
      const res = await window.api.progress.list()
      if (res.ok) {
        progress.value = { ...res.data.items, ...progress.value }
        loaded.value = true
      }
    } catch {
      /* 读取失败不阻塞（保持内存态） */
    } finally {
      loading.value = false
    }
  }

  /** 待写合并缓冲（同 id 覆盖式合并） */
  const dirty = new Map<string, ProgressSaveRequest>()
  let timer: ReturnType<typeof setTimeout> | null = null
  let writing = false

  function getProgressItem(id: string): UserProgress | undefined {
    return progress.value[id]
  }

  function ensure(id: string): UserProgress {
    let item = progress.value[id]
    if (!item) {
      item = { id, status: 'new', wrongTimes: 0, wrongTypes: {} }
      progress.value = { ...progress.value, [id]: item }
    }
    return item
  }

  function mutate(id: string, fn: (item: UserProgress) => void): void {
    const item = ensure(id)
    fn(item)
    progress.value = { ...progress.value, [id]: { ...item } }
    markDirty({
      id,
      status: item.status,
      wrongTypes: item.wrongTypes,
      wrongTimes: item.wrongTimes,
      review: item.review ? { ...item.review } : undefined
    })
  }

  /** 复习一次：new→learning，更新 lastSeen；SM-2 调度字段（v0.2）：无 review 补默认、reviewAt=now */
  function recordAttempt(id: string): void {
    const now = new Date()
    const today = now.toISOString().slice(0, 10)
    mutate(id, (item) => {
      if (item.status === 'new') item.status = 'learning'
      item.lastSeen = today
      item.review = {
        ...(item.review ?? { interval: 0, ease: 2.5, due: today }),
        reviewAt: now.toISOString()
      }
    })
  }

  /** 标记状态（闪卡收敛规则：3 次认识→mastered；1 次不认识→learning，见 §3.3） */
  function markStatus(id: string, status: ProgressStatus): void {
    mutate(id, (item) => {
      item.status = status
      item.lastSeen = new Date().toISOString().slice(0, 10)
    })
  }

  /** 错题计数（自测/详情标注）：wrongTimes+1，wrongTypes[type] 累加；mastered 降级 learning（§3.3） */
  function incrementWrong(id: string, wrongType?: string): void {
    mutate(id, (item) => {
      item.wrongTimes += 1
      if (wrongType) {
        item.wrongTypes = { ...item.wrongTypes, [wrongType]: (item.wrongTypes[wrongType] ?? 0) + 1 }
      }
      if (item.status === 'mastered') item.status = 'learning'
    })
  }

  /**
   * SM-2 调度字段写入（v0.2，§5.6）：与现有 review 合并，供 V2-B 算法消费
   * （如 scheduleReview(id, { interval: 3, ease: 2.5, due: '2026-09-03' })）
   */
  function scheduleReview(id: string, patch: Partial<ReviewState>): void {
    mutate(id, (item) => {
      const now = new Date()
      const today = now.toISOString().slice(0, 10)
      item.review = {
        ...(item.review ?? { interval: 0, ease: 2.5, due: today }),
        ...patch
      }
    })
  }

  /** 读取 SM-2 调度状态（V2-B 消费；无记录返回 undefined） */
  function getReview(id: string): ReviewState | undefined {
    return progress.value[id]?.review
  }

  // ---------------------------------------------------------------------------
  // 节流写：≤1 次/2s；同窗口内多次变更合并为每 id 一次 progress:save；flush 强制立即写
  // ---------------------------------------------------------------------------

  function markDirty(payload: ProgressSaveRequest): void {
    const prev = dirty.get(payload.id)
    const mergedReview =
      prev?.review || payload.review ? { ...(prev?.review ?? {}), ...(payload.review ?? {}) } : undefined
    dirty.set(payload.id, {
      ...(prev ?? { id: payload.id }),
      ...payload,
      wrongTypes: { ...(prev?.wrongTypes ?? {}), ...(payload.wrongTypes ?? {}) },
      wrongTimes: payload.wrongTimes ?? prev?.wrongTimes,
      ...(mergedReview ? { review: mergedReview } : {})
    })
    scheduleWrite()
  }

  function scheduleWrite(): void {
    if (timer) return
    timer = setTimeout(() => {
      void flushNow()
    }, THROTTLE_MS)
  }

  async function flushNow(): Promise<void> {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (writing || dirty.size === 0) return
    writing = true
    const batch = Array.from(dirty.values())
    dirty.clear()
    await Promise.all(
      batch.map((p) =>
        window.api.progress.save(p).catch((e) => {
          console.error('[progress store] 写入失败', e)
        })
      )
    )
    writing = false
    if (dirty.size > 0) scheduleWrite() // 写入期间又有变更
  }

  /** 强制写（闪卡/自测会话结束调用，§10.3#6） */
  async function flush(): Promise<void> {
    await flushNow()
  }

  return {
    progress,
    loaded,
    loading,
    load,
    getProgressItem,
    recordAttempt,
    markStatus,
    incrementWrong,
    scheduleReview,
    getReview,
    flush
  }
})
