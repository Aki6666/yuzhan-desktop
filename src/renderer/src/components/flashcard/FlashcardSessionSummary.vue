<script setup lang="ts">
/**
 * 闪卡会话小结（PLAN.md §3.4：会话结束显示「本轮认识 X / 不认识 Y」）
 * - 展示本轮统计 + 剩余/总卡数
 * - 操作：再来一轮（重开牌堆）/ 去成语库 / 去自测（空态引导，§3.3）
 */
import { NButton, NTag } from 'naive-ui'
import type { SessionSummary } from '@renderer/lib/flashcards'

defineProps<{
  summary: SessionSummary
  total: number
}>()

const emit = defineEmits<{
  restart: []
}>()
</script>

<template>
  <div class="summary" data-testid="session-summary">
    <h2 class="summary-title">本轮小结</h2>
    <div class="summary-stats">
      <div class="stat">
        <NTag size="large" type="success" :bordered="false" class="stat-tag">认识</NTag>
        <span class="stat-num" data-testid="summary-known">{{ summary.known }}</span>
      </div>
      <div class="stat">
        <NTag size="large" type="error" :bordered="false" class="stat-tag">不认识</NTag>
        <span class="stat-num" data-testid="summary-unknown">{{ summary.unknown }}</span>
      </div>
      <div class="stat">
        <NTag size="large" :bordered="false" class="stat-tag">本轮共</NTag>
        <span class="stat-num" data-testid="summary-total">{{ total }}</span>
      </div>
    </div>

    <div class="summary-actions">
      <NButton type="primary" size="small" data-testid="restart-button" @click="emit('restart')">
        再来一轮
      </NButton>
      <RouterLink to="/idioms">
        <NButton size="small" secondary>去成语库浏览</NButton>
      </RouterLink>
      <RouterLink to="/quiz">
        <NButton size="small" secondary>去自测积累</NButton>
      </RouterLink>
    </div>
  </div>
</template>

<style scoped>
.summary {
  max-width: 560px;
  margin: 0 auto;
  padding: 28px 24px;
  border: 1px solid #e3e6ea;
  border-radius: 12px;
  background: #fff;
  text-align: center;
  box-shadow: 0 2px 8px rgba(31, 45, 61, 0.06);
}

.summary-title {
  margin: 0 0 20px;
  font-size: 20px;
  color: #1f2d3d;
}

.summary-stats {
  display: flex;
  justify-content: center;
  gap: 28px;
  margin-bottom: 24px;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.stat-tag {
  font-size: 13px;
}

.stat-num {
  font-size: 32px;
  font-weight: 700;
  color: #1f2d3d;
}

.summary-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
}
</style>
