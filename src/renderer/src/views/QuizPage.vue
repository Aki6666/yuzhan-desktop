<script setup lang="ts">
/**
 * 自测页（路由 /quiz，PLAN.md §3.2 组卷/答题/结果三态同页 / F6 / AC-06）
 * - 组卷规则在 shared/lib/quiz.ts（纯逻辑，只消费不重写）
 * - 即时反馈 + 考点展示（QuizQuestionCard）；错题批量 quiz:record（quiz store）
 * - 题库 <10 → 提示并引导浏览成语库（§3.3 空态）
 */
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NEmpty, NSpin } from 'naive-ui'
import { useIdiomsStore } from '@renderer/stores/idioms'
import { useProgressStore } from '@renderer/stores/progress'
import { useQuizStore } from '@renderer/stores/quiz'
import QuizQuestionCard from '@renderer/components/quiz/QuizQuestionCard.vue'
import QuizResultPanel from '@renderer/components/quiz/QuizResultPanel.vue'

const router = useRouter()
const idiomsStore = useIdiomsStore()
const progressStore = useProgressStore()
const quizStore = useQuizStore()

onMounted(() => {
  void idiomsStore.load()
})

function startQuiz(): void {
  quizStore.start(idiomsStore.items, progressStore.progress)
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
</script>

<template>
  <section class="view quiz-page">
    <header class="page-header">
      <h1 class="page-title">自测</h1>
      <span class="page-sub">10 题一组 · 优先错词与高频词 · 答完立即反馈</span>
    </header>

    <!-- 词库加载中 -->
    <div v-if="idiomsStore.loading && !idiomsStore.loaded" class="state-block" data-testid="quiz-loading">
      <NSpin size="small" />
      <span class="state-text">词库加载中…</span>
    </div>

    <!-- 加载失败 -->
    <div v-else-if="idiomsStore.error && !idiomsStore.loaded" class="state-block" data-testid="quiz-error">
      <p class="state-text">词库加载失败：{{ idiomsStore.error }}</p>
      <NButton size="small" @click="idiomsStore.load()">重试</NButton>
    </div>

    <!-- 组卷入口（idle） -->
    <div v-else-if="quizStore.phase === 'idle'" class="state-block" data-testid="quiz-idle">
      <!-- 题库不足：提示并引导浏览成语库（§3.3 空态） -->
      <template v-if="!quizStore.canStart(idiomsStore.items.length)">
        <NEmpty description="题库不足 10 题，先去成语库补充吧">
          <template #extra>
            <NButton size="small" type="primary" data-testid="quiz-goto-browse" @click="goBrowse">
              去成语库浏览
            </NButton>
          </template>
        </NEmpty>
      </template>
      <template v-else>
        <p class="state-text">
          共 {{ idiomsStore.items.length }} 题可出 · 错词与高频词优先 · 答错自动进入复习优先队列
        </p>
        <NButton type="primary" data-testid="quiz-start" @click="startQuiz">开始自测（10 题）</NButton>
      </template>
    </div>

    <!-- 答题态 -->
    <QuizQuestionCard
      v-else-if="quizStore.phase === 'active' && quizStore.current"
      :question="quizStore.current"
      :selected="quizStore.selectedIndex"
      :index="quizStore.currentIndex"
      :total="quizStore.total"
      @select="onSelect"
      @next="onNext"
    />

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
  </section>
</template>

<style scoped>
.quiz-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 720px;
}

.page-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.page-title {
  margin: 0;
  font-size: 20px;
  color: #2c3e50;
}

.page-sub {
  font-size: 12px;
  color: #888;
}

.state-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 240px;
  text-align: center;
}

.state-text {
  margin: 0;
  font-size: 14px;
  color: #7a8699;
  line-height: 1.7;
}
</style>
