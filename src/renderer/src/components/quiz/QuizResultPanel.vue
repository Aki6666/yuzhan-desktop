<script setup lang="ts">
/**
 * 自测结果面板（PLAN.md §3.3：翻完一叠显示小结——答对 X / 答错 Y）
 * 展示错题列表（词条 + 释义考点）与「再来一组」
 *
 * U3 视觉重构：结果面板卡片化，消费 U1 设计 token；功能与 data-testid 不变
 */
import { NButton, NTag } from 'naive-ui'
import type { QuizQuestion } from '@shared/lib/quiz'

defineProps<{
  correct: number
  wrong: number
  total: number
  wrongQuestions: QuizQuestion[]
  submitError: string | null
}>()

const emit = defineEmits<{ restart: []; back: [] }>()
</script>

<template>
  <article class="quiz-result" data-testid="quiz-result">
    <header class="r-head">
      <h2 class="r-title">本轮小结</h2>
      <div class="r-stats" data-testid="quiz-summary">
        <NTag type="success" size="small" :bordered="false">答对 {{ correct }}</NTag>
        <NTag type="error" size="small" :bordered="false">答错 {{ wrong }}</NTag>
        <NTag size="small" :bordered="false">共 {{ total }} 题</NTag>
      </div>
    </header>

    <p v-if="submitError" class="r-error" data-testid="quiz-submit-error">
      错题记录写入失败：{{ submitError }}（下次自测将重新优先出这些词）
    </p>

    <section v-if="wrongQuestions.length > 0" class="r-wrong" data-testid="quiz-wrong-list">
      <h3 class="r-sec-title">错题回顾（已计入复习优先）</h3>
      <ul class="r-wrong-list">
        <li v-for="q in wrongQuestions" :key="q.id" class="r-wrong-item" data-testid="quiz-wrong-item">
          <div class="rw-head">
            <span class="rw-word">{{ q.word }}</span>
            <span class="rw-pinyin">{{ q.pinyin }}</span>
          </div>
          <p class="rw-meaning">{{ q.meaning }}</p>
        </li>
      </ul>
    </section>

    <div class="r-actions">
      <NButton size="small" type="primary" data-testid="quiz-restart" @click="emit('restart')">
        再来一组
      </NButton>
      <NButton size="small" quaternary data-testid="quiz-back" @click="emit('back')">
        返回
      </NButton>
    </div>
  </article>
</template>

<style scoped>
.quiz-result {
  max-width: 640px;
  border: 1px solid var(--y-border-light);
  border-radius: var(--y-radius-lg);
  padding: var(--y-space-xl) var(--y-space-xl);
  background: var(--y-bg-card);
  box-shadow: var(--y-shadow-card);
}

.r-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--y-space-md);
  padding-bottom: var(--y-space-md);
  border-bottom: 1px solid var(--y-border-light);
}

.r-title {
  margin: 0;
  font-family: var(--y-font-serif);
  font-size: var(--y-font-title);
  letter-spacing: 2px;
  color: var(--y-text-primary);
}

.r-stats {
  display: flex;
  gap: var(--y-space-sm);
}

.r-error {
  margin: var(--y-space-md) 0 0;
  font-size: var(--y-font-aux);
  color: var(--y-danger);
}

.r-wrong {
  margin-top: var(--y-space-lg);
}

.r-sec-title {
  margin: 0 0 var(--y-space-sm);
  font-size: var(--y-font-aux);
  font-weight: 600;
  letter-spacing: 1px;
  color: var(--y-text-secondary);
}

.r-wrong-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.r-wrong-item {
  padding: var(--y-space-md) var(--y-space-lg);
  border: 1px solid var(--y-border-light);
  border-left: 3px solid color-mix(in srgb, var(--y-danger) 60%, var(--y-border));
  border-radius: var(--y-radius-md);
  margin-bottom: var(--y-space-sm);
  background: var(--y-bg-subtle);
}

.rw-head {
  display: flex;
  align-items: baseline;
  gap: var(--y-space-sm);
}

.rw-word {
  font-family: var(--y-font-serif);
  font-size: var(--y-font-body);
  font-weight: 600;
  color: var(--y-text-primary);
}

.rw-pinyin {
  font-size: var(--y-font-aux);
  color: var(--y-text-tertiary);
}

.rw-meaning {
  margin: var(--y-space-xs) 0 0;
  font-size: var(--y-font-body);
  line-height: var(--y-line-height-body);
  color: var(--y-text-body);
}

.r-actions {
  display: flex;
  gap: var(--y-space-sm);
  margin-top: var(--y-space-lg);
}
</style>
