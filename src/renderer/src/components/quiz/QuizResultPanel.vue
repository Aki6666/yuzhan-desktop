<script setup lang="ts">
/**
 * 自测结果面板（PLAN.md §3.3：翻完一叠显示小结——答对 X / 答错 Y）
 * 展示错题列表（词条 + 释义考点）与「再来一组」
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
  border: 1px solid #e3e6ea;
  border-radius: 12px;
  padding: 20px 24px;
  background: #fff;
}

.r-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #eef0f3;
}

.r-title {
  margin: 0;
  font-size: 18px;
  color: #1f2d3d;
}

.r-stats {
  display: flex;
  gap: 6px;
}

.r-error {
  margin: 12px 0 0;
  font-size: 12px;
  color: #d03050;
}

.r-wrong {
  margin-top: 14px;
}

.r-sec-title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: #7a8699;
}

.r-wrong-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.r-wrong-item {
  padding: 10px 12px;
  border: 1px solid #f0f1f4;
  border-radius: 8px;
  margin-bottom: 8px;
  background: #fafbfc;
}

.rw-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.rw-word {
  font-size: 15px;
  font-weight: 600;
  color: #2c3e50;
}

.rw-pinyin {
  font-size: 12px;
  color: #9aa4b2;
}

.rw-meaning {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: #444;
}

.r-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}
</style>
