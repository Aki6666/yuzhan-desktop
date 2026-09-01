<script setup lang="ts">
/**
 * 自测页（路由 /quiz，PLAN.md §3.2 组卷/答题/结果三态同页 / F6 / AC-06）
 * - 组卷规则在 shared/lib/quiz.ts（纯逻辑，只消费不重写）
 * - 即时反馈 + 考点展示（QuizQuestionCard）；错题批量 quiz:record（quiz store）
 * - 题库 <10 → 提示并引导浏览成语库（§3.3 空态）
 *
 * U3 视觉重构：三态卡片化，消费 U1 设计 token；功能与 data-testid 不变
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NEmpty, NSpin } from 'naive-ui'
import { useIdiomsStore } from '@renderer/stores/idioms'
import { useProgressStore } from '@renderer/stores/progress'
import { useQuizStore } from '@renderer/stores/quiz'
import QuizQuestionCard from '@renderer/components/quiz/QuizQuestionCard.vue'
import QuizResultPanel from '@renderer/components/quiz/QuizResultPanel.vue'
import FrequencyTierSelect from '@renderer/components/common/FrequencyTierSelect.vue'
import { countByFrequency } from '@renderer/lib/listFilters'

const router = useRouter()
const idiomsStore = useIdiomsStore()
const progressStore = useProgressStore()
const quizStore = useQuizStore()

/** 难度档位（v0.2.6 迭代：干扰项区分度） */
const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: '简单', desc: '干扰项宽松（同主题随机），适合初次自测' },
  { value: 'standard', label: '标准', desc: '默认：至少 1 个近义/形近干扰项，贴近真题' },
  { value: 'hard', label: '困难', desc: '干扰项全为近义/形近词，高强度辨析' }
] as const

/** 题型（v0.2.6 P1：正向/反向/混合） */
const MODE_OPTIONS = [
  { value: 'word-to-meaning', label: '正向', desc: '给成语选释义（传统题型）' },
  { value: 'meaning-to-word', label: '反向', desc: '给释义选成语（逻辑填空反查）' },
  { value: 'mixed', label: '混合', desc: '默认：正向/反向交替各半' }
] as const

/** 档位选择（空数组 = 全部；用户要求 #6） */
const selectedTiers = ref<number[]>([])

const freqCounts = computed(() => countByFrequency(idiomsStore.items))

/** 自测历史（用户要求 #4） */
const history = ref<import('@shared/ipc/contracts').QuizHistoryItem[]>([])

async function loadHistory(): Promise<void> {
  try {
    const res = await window.api.quiz.history.list()
    if (res.ok) history.value = res.data.items
  } catch {
    /* 历史读取失败不阻塞 */
  }
}

/** 当前档位下的可用题库 */
const pool = computed(() =>
  selectedTiers.value.length === 0
    ? idiomsStore.items
    : idiomsStore.items.filter((i) => selectedTiers.value.includes(i.frequency))
)

onMounted(() => {
  void idiomsStore.load()
  void loadHistory()
  void quizStore.loadPairs() // v0.2.6 迭代：易混对参与干扰项生成
})

function startQuiz(): void {
  quizStore.start(pool.value, progressStore.progress)
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function goBrowse(): void {
  void router.push('/idioms')
}

function onSelect(optionIndex: number): void {
  quizStore.answer(optionIndex)
}

function onNext(): void {
  quizStore.next()
}

function onRestart(): void {
  quizStore.reset()
  startQuiz()
}

function onBack(): void {
  quizStore.reset()
}

/** 换一组（v0.2.6 需求-9）：放弃当前组，按当前档位/难度重新组卷 */
function swapGroup(): void {
  if (quizStore.phase !== 'active') return
  quizStore.reset()
  quizStore.start(pool.value, progressStore.progress)
}

/** 历史记录展开（v0.2.6 需求-9：详细练习记录） */
const expandedHistory = ref<number | null>(null)
function toggleHistory(i: number): void {
  expandedHistory.value = expandedHistory.value === i ? null : i
}
</script>

<template>
  <section class="view quiz-page">
    <header class="page-header">
      <div class="page-heading">
        <h1 class="page-title">
          <span class="page-eyebrow" aria-hidden="true" />
          自测
        </h1>
        <span class="page-sub">10 题一组 · 优先错词与高频词 · 答完立即反馈</span>
      </div>
    </header>

    <!-- 词库加载中 -->
    <div v-if="idiomsStore.loading && !idiomsStore.loaded" class="state-block state-card" data-testid="quiz-loading">
      <NSpin size="small" />
      <span class="state-text">词库加载中…</span>
    </div>

    <!-- 加载失败 -->
    <div v-else-if="idiomsStore.error && !idiomsStore.loaded" class="state-block state-card" data-testid="quiz-error">
      <p class="state-text">词库加载失败：{{ idiomsStore.error }}</p>
      <NButton size="small" @click="idiomsStore.load()">重试</NButton>
    </div>

    <!-- 组卷入口（idle） -->
    <div v-else-if="quizStore.phase === 'idle'" class="state-block state-card" data-testid="quiz-idle">
      <!-- 档位选择（用户要求 #6：抽哪一档由用户定） -->
      <div class="tier-row" data-testid="quiz-tier-select">
        <span class="tier-label">档位</span>
        <FrequencyTierSelect :model-value="selectedTiers" :counts="freqCounts" @update:model-value="selectedTiers = $event" />
      </div>
      <!-- 难度选择（v0.2.6 迭代：干扰项区分度——标准=含近义干扰，困难=全近义/形近） -->
      <div class="tier-row" data-testid="quiz-difficulty-select">
        <span class="tier-label">难度</span>
        <div class="difficulty-selector" role="group" aria-label="自测难度">
          <button
            v-for="d in DIFFICULTY_OPTIONS"
            :key="d.value"
            type="button"
            class="diff-chip"
            :class="{ active: quizStore.difficulty === d.value }"
            :data-testid="`quiz-difficulty-${d.value}`"
            :title="d.desc"
            @click="quizStore.setDifficulty(d.value)"
          >
            {{ d.label }}
          </button>
        </div>
      </div>
      <!-- 题型选择（v0.2.6 P1：正向=给成语选释义 / 反向=给释义选成语 / 混合） -->
      <div class="tier-row" data-testid="quiz-mode-select">
        <span class="tier-label">题型</span>
        <div class="difficulty-selector" role="group" aria-label="自测题型">
          <button
            v-for="m in MODE_OPTIONS"
            :key="m.value"
            type="button"
            class="diff-chip"
            :class="{ active: quizStore.mode === m.value }"
            :data-testid="`quiz-mode-${m.value}`"
            :title="m.desc"
            @click="quizStore.setMode(m.value)"
          >
            {{ m.label }}
          </button>
        </div>
      </div>
      <!-- 题库不足：提示并引导浏览成语库（§3.3 空态） -->
      <template v-if="!quizStore.canStart(pool.length)">
        <NEmpty :description="`所选档位题库不足 10 题（当前 ${pool.length} 题），换档位或先去成语库补充吧`">
          <template #extra>
            <NButton size="small" type="primary" data-testid="quiz-goto-browse" @click="goBrowse">
              去成语库浏览
            </NButton>
          </template>
        </NEmpty>
      </template>
      <template v-else>
        <p class="state-text">
          当前档位可出 {{ pool.length }} 题 · 错词与高频词优先 · 答错自动进入复习优先队列
        </p>
        <NButton type="primary" data-testid="quiz-start" class="start-btn" @click="startQuiz">开始自测（10 题）</NButton>
      </template>
    </div>

    <!-- 答题态（v0.2.6 需求-9：顶部「换一组」中途换一批新题） -->
    <div v-else-if="quizStore.phase === 'active' && quizStore.current" class="quiz-active-wrap">
      <div class="quiz-active-head">
        <span class="quiz-active-hint">正在作答 · 答完即反馈考点</span>
        <NButton
          size="small"
          quaternary
          data-testid="quiz-swap"
          :disabled="!quizStore.canStart(pool.length)"
          @click="swapGroup"
        >
          换一组
        </NButton>
      </div>
      <QuizQuestionCard
        :question="quizStore.current"
        :selected="quizStore.selectedIndex"
        :index="quizStore.currentIndex"
        :total="quizStore.total"
        @select="onSelect"
        @next="onNext"
      />
    </div>

    <!-- 结果态 -->
    <QuizResultPanel
      v-else-if="quizStore.phase === 'finished'"
      :correct="quizStore.result.correct"
      :wrong="quizStore.result.wrong"
      :total="quizStore.result.total"
      :wrong-questions="quizStore.wrongQuestions"
      :submit-error="quizStore.submitError"
      @restart="onRestart"
      @back="onBack"
    />

    <!-- 自测历史（用户要求 #4）：idle 与结果态下方展示最近记录 -->
    <div v-if="quizStore.phase !== 'active' && history.length > 0" class="history-card" data-testid="quiz-history">
      <div class="history-head">
        <span class="history-title">自测历史</span>
        <span class="history-count">最近 {{ history.length }} 次</span>
      </div>
      <ul class="history-list">
        <li v-for="(h, i) in history.slice(0, 20)" :key="i" class="history-item">
          <button type="button" class="history-main" data-testid="history-expand" @click="toggleHistory(i)">
            <span class="history-time">{{ formatTime(h.time) }}</span>
            <span class="history-score">
              <b class="score-correct">{{ h.correct }}</b>
              <span class="score-sep">/</span>
              <span class="score-total">{{ h.total }}</span>
              <span class="score-rate">{{ Math.round((h.correct / h.total) * 100) }}%</span>
            </span>
          </button>
          <!-- 详细练习记录（v0.2.6 需求-9：每题词条 + 对错） -->
          <div v-if="expandedHistory === i && h.details && h.details.length > 0" class="history-detail" data-testid="history-detail">
            <ul class="detail-list">
              <li v-for="(d, di) in h.details" :key="di" class="detail-row">
                <span class="detail-word">{{ d.word }}</span>
                <span class="detail-result" :class="d.correct ? 'ok' : 'bad'">
                  {{ d.correct ? '对' : '错' }}
                </span>
              </li>
            </ul>
          </div>
          <div v-else-if="expandedHistory === i" class="history-detail" data-testid="history-detail">
            <p class="detail-empty">该组无明细记录</p>
          </div>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
/* FIX-1：答题区/题干/选项/结果面板水平居中，消费 U1 token（v0.2.6 墨韵重构） */
.quiz-page {
  display: flex;
  flex-direction: column;
  gap: var(--y-space-lg);
  max-width: 720px;
  width: 100%;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: baseline;
  gap: var(--y-space-md);
}

.page-heading {
  display: flex;
  align-items: baseline;
  gap: 12px;
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
  font-size: var(--y-font-aux);
  color: var(--y-text-tertiary);
}

.state-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--y-space-md);
  min-height: 240px;
  text-align: center;
}

.state-card {
  border: 1px solid var(--y-border-light);
  border-radius: var(--y-radius-lg);
  background: var(--y-bg-card);
  box-shadow: var(--y-shadow-card);
  padding: var(--y-space-xxl) var(--y-space-xl);
}

.state-text {
  margin: 0;
  font-size: var(--y-font-body);
  color: var(--y-text-secondary);
  line-height: var(--y-line-height-body);
}

.tier-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.tier-label {
  flex: 0 0 auto;
  font-size: var(--y-font-aux);
  color: var(--y-text-tertiary);
  letter-spacing: 1px;
}

/* 难度选择（v0.2.6 迭代） */
.difficulty-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.diff-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 14px;
  font-size: 12px;
  border: 1px solid var(--y-border-light);
  border-radius: 999px;
  background: var(--y-bg-card);
  color: var(--y-text-secondary);
  cursor: pointer;
  transition:
    border-color var(--y-motion-fast) var(--y-motion-ease),
    background-color var(--y-motion-fast) var(--y-motion-ease),
    color var(--y-motion-fast) var(--y-motion-ease);
}

.diff-chip:hover {
  background: var(--y-bg-hover);
}

.diff-chip.active {
  border-color: color-mix(in srgb, var(--y-primary) 42%, var(--y-border));
  background: var(--y-primary-soft);
  color: var(--y-primary);
  font-weight: 600;
}

/* 自测历史 */
.history-card {
  border: 1px solid var(--y-border-light);
  border-radius: var(--y-radius-lg);
  background: var(--y-bg-card);
  padding: var(--y-space-lg);
  box-shadow: var(--y-shadow-card);
}

.history-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: var(--y-space-sm);
}

.history-title {
  font-size: var(--y-font-aux);
  font-weight: 600;
  letter-spacing: 2px;
  color: var(--y-text-tertiary);
}

.history-count {
  font-size: 11px;
  color: var(--y-text-tertiary);
}

.history-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 260px;
  overflow: auto;
}

.history-item {
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid var(--y-border-light);
  font-size: var(--y-font-body);
}

.history-item:last-child {
  border-bottom: none;
}

.history-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 8px 4px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  color: inherit;
  border-radius: 6px;
  transition: background-color var(--y-motion-fast) var(--y-motion-ease);
}

.history-main:hover {
  background: var(--y-bg-hover);
}

.history-time {
  color: var(--y-text-secondary);
  font-variant-numeric: tabular-nums;
}

.history-score {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
}

.score-correct {
  color: var(--y-success);
  font-size: 15px;
  font-weight: 700;
}

.score-sep {
  color: var(--y-text-tertiary);
}

.score-total {
  color: var(--y-text-secondary);
}

.score-rate {
  margin-left: 6px;
  font-size: var(--y-font-aux);
  color: var(--y-text-tertiary);
  font-variant-numeric: tabular-nums;
}

/* 详细练习记录（v0.2.6 需求-9） */
.history-detail {
  padding: 4px 8px 10px;
}

.detail-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 4px;
}

.detail-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 8px;
  border: 1px solid var(--y-border-light);
  border-radius: 6px;
  background: var(--y-bg-subtle);
  font-size: 12px;
}

.detail-word {
  font-family: var(--y-font-serif);
  color: var(--y-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.detail-result {
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: 700;
  padding: 1px 8px;
  border-radius: 999px;
}

.detail-result.ok {
  color: var(--y-success);
  background: color-mix(in srgb, var(--y-success) 12%, var(--y-bg-card));
}

.detail-result.bad {
  color: var(--y-danger);
  background: color-mix(in srgb, var(--y-danger) 12%, var(--y-bg-card));
}

.detail-empty {
  margin: 0;
  padding: 4px 8px;
  font-size: var(--y-font-aux);
  color: var(--y-text-tertiary);
}

/* 答题态：换一组（v0.2.6 需求-9） */
.quiz-active-wrap {
  display: flex;
  flex-direction: column;
  gap: var(--y-space-md);
}

.quiz-active-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.quiz-active-hint {
  font-size: var(--y-font-aux);
  color: var(--y-text-tertiary);
}

.start-btn {
  min-width: 172px;
  font-weight: 600;
}
</style>
