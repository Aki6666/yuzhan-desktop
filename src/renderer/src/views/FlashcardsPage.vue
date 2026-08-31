<script setup lang="ts">
/**
 * 闪卡页（路由 /flashcards，PLAN.md §3.2 / F5 / §3.3 / §3.4 / AC-05）
 *
 * 单卡复习流：
 * - 牌堆 = 非 mastered 词条（§3.3：全部 mastered → 空态引导去成语库/自测）
 * - 认识/不认识 → 立即判定并翻面展示释义（§3.3）
 * - 收敛规则（AC-05，纯逻辑 src/renderer/src/lib/flashcards.ts）：
 *   同一词连续 3 次认识 → mastered；1 次不认识 → 降级 learning
 * - 撤销上一步（§3.4 误点回退）：可回退最近一次判定（含已翻到下一张后）
 * - 会话结束小结：本轮认识 X / 不认识 Y（§3.4）+ 强制 flush（§10.3#6）
 * - 进度经 T3 progress store（节流 ≤1 次/2s + flush），只消费不重写
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { NButton, NEmpty, NSpin } from 'naive-ui'
import type { Idiom, ProgressStatus } from '@shared/ipc/contracts'
import { useIdiomsStore } from '@renderer/stores/idioms'
import { useProgressStore } from '@renderer/stores/progress'
import {
  buildReviewDeck,
  emptySummary,
  flashcardTracker,
  recordJudgment,
  unrecordJudgment,
  type FlashcardJudgment,
  type FlashcardStatus,
  type SessionSummary
} from '@renderer/lib/flashcards'
import FlashcardCard from '@renderer/components/flashcard/FlashcardCard.vue'
import FlashcardSessionSummary from '@renderer/components/flashcard/FlashcardSessionSummary.vue'

const idioms = useIdiomsStore()
const progress = useProgressStore()

/** 牌堆（构建时刻快照，非 mastered） */
const deck = ref<Idiom[]>([])
/** 当前卡下标 */
const index = ref(0)
/** 当前卡是否已翻面（判定后展示释义） */
const flipped = ref(false)
/** 当前卡判定结果 */
const judgment = ref<FlashcardJudgment | null>(null)
/** 会话小结计数 */
const summary = ref<SessionSummary>(emptySummary())
/** 是否已翻完一叠（显示小结） */
const finished = ref(false)
/** 撤销历史栈 */
const history = ref<
  Array<{ id: string; index: number; judgment: FlashcardJudgment; beforeStatus: ProgressStatus | null; trackerBefore: FlashcardStatus }>
>([])

const current = computed<Idiom | null>(() => deck.value[index.value] ?? null)

const isMastered = (id: string): boolean => progress.getProgressItem(id)?.status === 'mastered'

/** 构建牌堆并重置会话（再来一轮 / 首次进入） */
function startSession(): void {
  deck.value = buildReviewDeck(idioms.items, isMastered) as Idiom[]
  index.value = 0
  flipped.value = false
  judgment.value = null
  summary.value = emptySummary()
  history.value = []
  finished.value = deck.value.length === 0
}

async function ensureLoaded(): Promise<void> {
  if (!idioms.loaded && !idioms.loading) {
    await idioms.load()
  }
}

onMounted(() => {
  void (async () => {
    await ensureLoaded()
    startSession()
  })()
})

/** 判定：认识 / 不认识（立即翻面展示释义，§3.3） */
function judge(kind: FlashcardJudgment): void {
  const card = current.value
  if (!card || flipped.value || finished.value) return

  const trackerBefore = flashcardTracker.get(card.id)
  const { after } = flashcardTracker.judge(card.id, kind)
  const beforeStatus = progress.getProgressItem(card.id)?.status ?? null

  // 复习一次（new→learning + lastSeen）+ 收敛规则状态（§3.3）
  progress.recordAttempt(card.id)
  progress.markStatus(card.id, after.status)

  history.value.push({ id: card.id, index: index.value, judgment: kind, beforeStatus, trackerBefore })
  summary.value = recordJudgment(summary.value, kind)
  judgment.value = kind
  flipped.value = true
}

/** 撤销上一步（§3.4 误点回退；可回退最近一次判定，含已翻到下一张后） */
function undo(): void {
  const last = history.value.pop()
  if (!last) return

  flashcardTracker.revert(last.id, last.trackerBefore)
  // 恢复进度状态：无历史记录则回置 new（等价未判定）
  progress.markStatus(last.id, last.beforeStatus ?? 'new')
  summary.value = unrecordJudgment(summary.value, last.judgment)

  index.value = last.index
  flipped.value = false
  judgment.value = null
  finished.value = false
}

/** 下一张 */
function next(): void {
  if (finished.value) return
  if (index.value + 1 >= deck.value.length) {
    finished.value = true
    void progress.flush() // 会话结束强制 flush（§10.3#6）
    return
  }
  index.value += 1
  flipped.value = false
  judgment.value = null
}

/** 会话中离开页面：兜底 flush（节流定时器之外立即落盘） */
onBeforeUnmount(() => {
  if (history.value.length > 0) void progress.flush()
})

function retryLoad(): void {
  void (async () => {
    await idioms.load()
    startSession()
  })()
}
</script>

<template>
  <section class="view">
    <div class="flash-head">
      <h1 class="flash-h1">闪卡</h1>
      <NButton
        v-if="!finished && history.length > 0"
        size="small"
        secondary
        data-testid="undo-button"
        @click="undo"
      >
        撤销上一步
      </NButton>
    </div>

    <!-- 加载中 -->
    <div v-if="idioms.loading && !idioms.loaded" class="state-block" data-testid="state-loading">
      <NSpin size="small" />
      <p class="state-text">词库加载中…</p>
    </div>

    <!-- 加载失败 -->
    <div v-else-if="idioms.error && !idioms.loaded" class="state-block" data-testid="state-error">
      <p class="state-text">词库加载失败：{{ idioms.error }}</p>
      <NButton size="small" data-testid="retry-button" @click="retryLoad">重试</NButton>
    </div>

    <!-- 空态：无待复习卡（§3.3 引导去成语库浏览 / 自测积累） -->
    <div v-else-if="finished && deck.length === 0" class="state-block" data-testid="state-empty">
      <NEmpty description="暂无待复习的成语，先去积累吧">
        <template #extra>
          <RouterLink to="/idioms">
            <NButton size="small" type="primary">去成语库浏览</NButton>
          </RouterLink>
          <RouterLink to="/quiz">
            <NButton size="small" secondary>去自测积累</NButton>
          </RouterLink>
        </template>
      </NEmpty>
    </div>

    <!-- 会话小结 -->
    <FlashcardSessionSummary
      v-else-if="finished"
      :summary="summary"
      :total="history.length"
      data-testid="summary-block"
      @restart="startSession"
    />

    <!-- 单卡复习流 -->
    <div v-else-if="current" class="session" data-testid="session">
      <p class="progress-text" data-testid="progress-text">
        第 {{ index + 1 }} / {{ deck.length }} 张
      </p>

      <FlashcardCard :idiom="current" :flipped="flipped" :judgment="judgment" />

      <div class="actions">
        <template v-if="!flipped">
          <NButton type="success" size="large" data-testid="known-button" @click="judge('known')">
            认识
          </NButton>
          <NButton type="error" size="large" data-testid="unknown-button" @click="judge('unknown')">
            不认识
          </NButton>
        </template>
        <NButton v-else size="large" type="primary" data-testid="next-button" @click="next">
          {{ index + 1 >= deck.length ? '完成本轮' : '下一张' }}
        </NButton>
      </div>
    </div>
  </section>
</template>

<style scoped>
.flash-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.flash-h1 {
  margin: 0;
  font-size: 20px;
}

.session {
  max-width: 640px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.progress-text {
  margin: 0;
  font-size: 13px;
  color: #7a8699;
}

.actions {
  display: flex;
  gap: 12px;
}

.state-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 40px 0;
}

.state-text {
  margin: 0;
  color: #7a8699;
  font-size: 14px;
}
</style>
