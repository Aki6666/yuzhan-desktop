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
 *
 * U3 视觉重构：消费 U1 设计 token（var(--y-*)），功能与 data-testid 不变
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
import FrequencyTierSelect from '@renderer/components/common/FrequencyTierSelect.vue'
import { countByFrequency } from '@renderer/lib/listFilters'

const idioms = useIdiomsStore()
const progress = useProgressStore()

/** 牌堆（构建时刻快照，非 mastered） */
const deck = ref<Idiom[]>([])
/** 档位选择（空数组 = 全部；用户要求 #6） */
const selectedTiers = ref<number[]>([])
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

/** 各档位词条数（供档位选择器展示） */
const freqCounts = computed(() => countByFrequency(idioms.items))

const isMastered = (id: string): boolean => progress.getProgressItem(id)?.status === 'mastered'

/** 构建牌堆并重置会话（再来一轮 / 首次进入；按所选档位过滤，用户要求 #6） */
function startSession(): void {
  const pool =
    selectedTiers.value.length === 0
      ? idioms.items
      : idioms.items.filter((i) => selectedTiers.value.includes(i.frequency))
  deck.value = buildReviewDeck(pool, isMastered) as Idiom[]
  index.value = 0
  flipped.value = false
  judgment.value = null
  summary.value = emptySummary()
  history.value = []
  finished.value = deck.value.length === 0
}

/** 切换档位：立即按新档位重开本轮（闪卡会话短，直接重开最直观） */
function onTierChange(tiers: number[]): void {
  selectedTiers.value = tiers
  if (idioms.loaded) startSession()
}

async function ensureLoaded(): Promise<void> {
  if (!idioms.loaded && !idioms.loading) {
    await idioms.load()
  }
}

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
  window.removeEventListener('keydown', onSessionKeydown)
  if (history.value.length > 0) void progress.flush()
})

/**
 * 闪卡键盘快捷键（v0.2.6 迭代，§16.3 P0-①）：
 * 1 = 认识 / 2 = 不认识 / 空格 = 下一张（翻面后）/ U = 撤销上一步
 * 仅在闪卡会话进行中生效；输入框/文本域/可编辑元素聚焦时跳过（防误触）。
 */
function onSessionKeydown(e: KeyboardEvent): void {
  if (finished.value || !current.value) return
  const t = e.target as HTMLElement | null
  if (t && typeof t.closest === 'function' && (t.closest('input, textarea, select') || t.isContentEditable)) return
  if (e.ctrlKey || e.metaKey || e.altKey) return
  switch (e.key) {
    case '1':
      e.preventDefault()
      judge('known')
      break
    case '2':
      e.preventDefault()
      judge('unknown')
      break
    case ' ':
      e.preventDefault()
      if (flipped.value) next()
      break
    case 'u':
    case 'U':
      e.preventDefault()
      undo()
      break
    default:
      break
  }
}

onMounted(() => {
  window.addEventListener('keydown', onSessionKeydown)
  void (async () => {
    await ensureLoaded()
    startSession()
  })()
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
    <header class="page-header">
      <div class="page-heading">
        <h1 class="page-title">
          <span class="page-eyebrow" aria-hidden="true" />
          闪卡
        </h1>
        <p class="page-sub">回想释义再判定 · 连续 3 次认识即掌握</p>
      </div>
      <NButton
        v-if="!finished && history.length > 0"
        size="small"
        quaternary
        data-testid="undo-button"
        class="undo-btn"
        @click="undo"
      >
        ← 撤销上一步
      </NButton>
    </header>

    <!-- 档位选择（用户要求 #6：抽哪一档由用户定；切换即按新档重开本轮） -->
    <div v-if="!finished" class="tier-row" data-testid="flashcard-tier-select">
      <span class="tier-label">档位</span>
      <FrequencyTierSelect :model-value="selectedTiers" :counts="freqCounts" @update:model-value="onTierChange" />
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
    <div v-else-if="finished && deck.length === 0" class="state-block state-card" data-testid="state-empty">
      <NEmpty description="暂无待复习的成语，先去积累吧">
        <template #extra>
          <RouterLink to="/idioms">
            <NButton size="small" type="primary" class="empty-action">去成语库浏览</NButton>
          </RouterLink>
          <RouterLink to="/quiz">
            <NButton size="small" secondary class="empty-action">去自测积累</NButton>
          </RouterLink>
        </template>
      </NEmpty>
    </div>

    <!-- 会话小结（组件根自带 data-testid="session-summary"；勿传同名 fallthrough 覆盖） -->
    <FlashcardSessionSummary
      v-else-if="finished"
      :summary="summary"
      :total="history.length"
      @restart="startSession"
    />

    <!-- 单卡复习流 -->
    <div v-else-if="current" class="session" data-testid="session">
      <p class="progress-text" data-testid="progress-text">
        <span class="progress-dot" aria-hidden="true" />
        第 {{ index + 1 }} / {{ deck.length }} 张
      </p>

      <FlashcardCard :idiom="current" :flipped="flipped" :judgment="judgment" />

      <div class="actions">
        <template v-if="!flipped">
          <NButton type="success" size="large" class="judge-btn known" data-testid="known-button" @click="judge('known')">
            认识
          </NButton>
          <NButton type="error" size="large" class="judge-btn unknown" data-testid="unknown-button" @click="judge('unknown')">
            不认识
          </NButton>
        </template>
        <NButton v-else size="large" type="primary" class="next-btn" data-testid="next-button" @click="next">
          {{ index + 1 >= deck.length ? '完成本轮' : '下一张' }}
        </NButton>
      </div>
    </div>
  </section>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--y-space-xl);
}

.page-heading {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.page-title {
  margin: 0;
  font-family: var(--y-font-serif);
  font-size: var(--y-font-title);
  letter-spacing: 2px;
  color: var(--y-text-primary);
}

.page-eyebrow {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 10px;
  border-radius: 2px;
  background: var(--y-primary);
  transform: translateY(-3px);
}

.page-sub {
  margin: 0;
  font-size: var(--y-font-aux);
  color: var(--y-text-tertiary);
  padding-left: 18px;
}

.undo-btn {
  color: var(--y-text-secondary);
}

.tier-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: var(--y-space-lg);
}

.tier-label {
  flex: 0 0 auto;
  font-size: var(--y-font-aux);
  color: var(--y-text-tertiary);
  letter-spacing: 1px;
}

.session {
  max-width: 640px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--y-space-xl);
  padding: var(--y-space-xl) 0 var(--y-space-xxl);
}

.progress-text {
  display: inline-flex;
  align-items: center;
  gap: var(--y-space-sm);
  margin: 0;
  font-size: var(--y-font-aux);
  color: var(--y-text-secondary);
  padding: 4px 14px;
  border: 1px solid var(--y-border-light);
  border-radius: 999px;
  background: var(--y-bg-card);
  font-variant-numeric: tabular-nums;
}

.progress-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--y-primary);
}

.actions {
  display: flex;
  gap: var(--y-space-md);
}

.judge-btn {
  min-width: 128px;
  font-weight: 600;
}

.judge-btn.known :deep(.n-button__content)::before {
  content: '✓ ';
  font-weight: 700;
}

.judge-btn.unknown :deep(.n-button__content)::before {
  content: '✕ ';
  font-weight: 700;
}

.next-btn {
  min-width: 148px;
  font-weight: 600;
}

.state-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--y-space-md);
  padding: var(--y-space-xxl) 0;
}

.state-card {
  max-width: 480px;
  margin: var(--y-space-xl) auto 0;
  padding: var(--y-space-xxl) var(--y-space-xl);
  border: 1px solid var(--y-border-light);
  border-radius: var(--y-radius-lg);
  background: var(--y-bg-card);
  box-shadow: var(--y-shadow-card);
}

.state-text {
  margin: 0;
  color: var(--y-text-secondary);
  font-size: var(--y-font-body);
  line-height: var(--y-line-height-body);
}

.empty-action {
  margin: 0 var(--y-space-xs);
}
</style>
