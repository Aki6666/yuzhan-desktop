<script setup lang="ts">
/**
 * 自测题目卡（PLAN.md §3.3 / F6）
 * - 展示词条 + 4 个释义选项；作答后立即反馈对/错并展示该词考点（释义/误用类型/主题，强化记忆）
 * - 正确答案位置随机（组卷时由 shared/lib/quiz.ts 决定）
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
      <NTag :type="isCorrect ? 'success' : 'error'" size="small" :bordered="false" data-testid="q-result-tag">
        {{ isCorrect ? '回答正确' : '回答错误' }}
      </NTag>
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
  </article>
</template>

<style scoped>
.quiz-question {
  max-width: 640px;
  border: 1px solid #e3e6ea;
  border-radius: 12px;
  padding: 20px 24px;
  background: #fff;
}

.q-head {
  padding-bottom: 12px;
  border-bottom: 1px solid #eef0f3;
}

.q-progress {
  font-size: 12px;
  color: #7a8699;
}

.q-main {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-top: 6px;
}

.q-word {
  font-size: 26px;
  font-weight: 700;
  color: #1f2d3d;
  letter-spacing: 2px;
}

.q-pinyin {
  font-size: 13px;
  color: #7a8699;
}

.q-prompt {
  margin: 8px 0 0;
  font-size: 13px;
  color: #555;
}

.q-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 14px;
}

.q-option {
  justify-content: flex-start;
  height: auto;
  min-height: 40px;
  padding: 8px 14px;
  white-space: normal;
}

.q-option-label {
  flex: 0 0 auto;
  font-weight: 700;
  margin-right: 8px;
}

.q-option-text {
  text-align: left;
  line-height: 1.6;
}

.q-feedback {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  margin-top: 14px;
  padding: 14px;
  border-radius: 8px;
  background: #f7f9fc;
}

.q-kaodian {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: #333;
}

.kaodian-meaning {
  margin: 0;
  line-height: 1.7;
}

.kaodian-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.kaodian-label {
  color: #7a8699;
  font-size: 12px;
}

.q-next {
  align-self: flex-end;
}
</style>
