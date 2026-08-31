<script setup lang="ts">
/**
 * 自测题目卡（PLAN.md §3.3 / F6）
 * - 展示词条 + 4 个释义选项；作答后立即反馈对/错并展示该词考点（释义/误用类型/主题，强化记忆）
 * - 正确答案位置随机（组卷时由 shared/lib/quiz.ts 决定）
 *
 * U3 视觉重构：选项 hover/选中/对错反馈柔和配色（对绿错红），考点区卡片化，
 * 消费 U1 设计 token；功能与 data-testid 不变
 */
import { computed } from 'vue'
import { NButton, NTag } from 'naive-ui'
import type { QuizQuestion } from '@shared/lib/quiz'

const props = defineProps<{
  question: QuizQuestion
  /** 已选选项下标（null = 未作答） */
  selected: number | null
  index: number
  total: number
}>()

const emit = defineEmits<{ select: [optionIndex: number]; next: [] }>()

const answered = computed(() => props.selected !== null)
const isCorrect = computed(() => props.selected !== null && props.selected === props.question.correctIndex)

function optionType(i: number): 'default' | 'success' | 'error' {
  if (!answered.value) return 'default'
  if (i === props.question.correctIndex) return 'success'
  if (i === props.selected) return 'error'
  return 'default'
}

/** 状态 class：作答后正确答案绿色、误选红色（柔和反馈配色） */
function optionState(i: number): string {
  if (!answered.value) return ''
  if (i === props.question.correctIndex) return 'is-correct'
  if (i === props.selected) return 'is-wrong'
  return 'is-neutral'
}

function onSelect(i: number): void {
  if (!answered.value) emit('select', i)
}
</script>

<template>
  <article class="quiz-question" data-testid="quiz-question">
    <header class="q-head">
      <span class="q-progress" data-testid="q-progress">第 {{ index + 1 }} / {{ total }} 题</span>
      <div class="q-main">
        <span class="q-word" data-testid="q-word">{{ question.word }}</span>
        <span class="q-pinyin">{{ question.pinyin }}</span>
      </div>
      <p class="q-prompt">选出与成语含义相符的选项</p>
    </header>

    <div class="q-options" data-testid="q-options">
      <NButton
        v-for="(opt, i) in question.options"
        :key="i"
        class="q-option"
        :class="optionState(i)"
        :type="optionType(i)"
        :secondary="optionType(i) === 'default'"
        :disabled="answered"
        :data-testid="`q-option-${i}`"
        @click="onSelect(i)"
      >
        <span class="q-option-label">{{ String.fromCharCode(65 + i) }}.</span>
        <span class="q-option-text">{{ opt }}</span>
      </NButton>
    </div>

    <!-- 即时反馈 + 考点（§3.3：答完立即反馈对错并展示该词考点） -->
    <div v-if="answered" class="q-feedback" data-testid="q-feedback">
      <div class="q-feedback-head">
        <NTag :type="isCorrect ? 'success' : 'error'" size="small" :bordered="false" data-testid="q-result-tag">
          {{ isCorrect ? '回答正确' : '回答错误' }}
        </NTag>
        <NButton
          size="small"
          type="primary"
          data-testid="q-next"
          class="q-next"
          @click="emit('next')"
        >
          {{ index + 1 >= total ? '查看结果' : '下一题' }}
        </NButton>
      </div>
      <div class="q-kaodian">
        <p class="kaodian-meaning"><b>释义：</b>{{ question.meaning }}</p>
        <div v-if="question.errorTypes.length > 0" class="kaodian-row">
          <span class="kaodian-label">误用类型：</span>
          <NTag v-for="t in question.errorTypes" :key="t" size="small" type="error" :bordered="false">{{ t }}</NTag>
        </div>
        <div v-if="question.tags.length > 0" class="kaodian-row">
          <span class="kaodian-label">主题：</span>
          <NTag v-for="t in question.tags" :key="t" size="small" :bordered="false">{{ t }}</NTag>
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped>
.quiz-question {
  max-width: 640px;
  border: 1px solid var(--y-border);
  border-radius: var(--y-radius-lg);
  padding: var(--y-space-xl) var(--y-space-xl);
  background: var(--y-bg-card);
  box-shadow: var(--y-shadow-card);
}

.q-head {
  padding-bottom: var(--y-space-md);
  border-bottom: 1px solid var(--y-border-light);
}

.q-progress {
  font-size: var(--y-font-aux);
  color: var(--y-text-tertiary);
}

.q-main {
  display: flex;
  align-items: baseline;
  gap: var(--y-space-md);
  margin-top: var(--y-space-sm);
}

.q-word {
  font-size: 26px;
  font-weight: 700;
  color: var(--y-text-primary);
  letter-spacing: 2px;
}

.q-pinyin {
  font-size: var(--y-font-aux);
  color: var(--y-text-secondary);
}

.q-prompt {
  margin: var(--y-space-sm) 0 0;
  font-size: var(--y-font-aux);
  color: var(--y-text-tertiary);
}

.q-options {
  display: flex;
  flex-direction: column;
  gap: var(--y-space-sm);
  margin-top: var(--y-space-lg);
}

.q-option {
  justify-content: flex-start;
  height: auto;
  min-height: 42px;
  padding: var(--y-space-sm) var(--y-space-lg);
  white-space: normal;
  border-radius: var(--y-radius-md);
}

/* hover 微交互（未作答时） */
.q-option:not(:disabled):hover {
  background: var(--y-bg-hover);
}

/* 柔和对错反馈：正确答案绿色浅底、误选红色浅底（color-mix 由 token 派生，非硬编码） */
.q-option.is-correct {
  background: color-mix(in srgb, var(--y-success) 10%, var(--y-bg-card));
  border-color: color-mix(in srgb, var(--y-success) 40%, var(--y-border));
  color: var(--y-success);
}

.q-option.is-wrong {
  background: color-mix(in srgb, var(--y-danger) 10%, var(--y-bg-card));
  border-color: color-mix(in srgb, var(--y-danger) 40%, var(--y-border));
  color: var(--y-danger);
}

.q-option.is-neutral {
  opacity: 0.72;
}

.q-option-label {
  flex: 0 0 auto;
  font-weight: 700;
  margin-right: var(--y-space-sm);
}

.q-option-text {
  text-align: left;
  line-height: 1.6;
}

.q-feedback {
  display: flex;
  flex-direction: column;
  gap: var(--y-space-md);
  margin-top: var(--y-space-lg);
  padding: var(--y-space-lg);
  border: 1px solid var(--y-border-light);
  border-radius: var(--y-radius-md);
  background: var(--y-bg-subtle);
}

.q-feedback-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--y-space-md);
}

.q-kaodian {
  display: flex;
  flex-direction: column;
  gap: var(--y-space-sm);
  font-size: var(--y-font-body);
  color: var(--y-text-body);
}

.kaodian-meaning {
  margin: 0;
  line-height: var(--y-line-height-body);
}

.kaodian-row {
  display: flex;
  align-items: center;
  gap: var(--y-space-sm);
  flex-wrap: wrap;
}

.kaodian-label {
  color: var(--y-text-secondary);
  font-size: var(--y-font-aux);
}
</style>
