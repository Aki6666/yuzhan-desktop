<script setup lang="ts">
/**
 * 闪卡会话小结（PLAN.md §3.4：会话结束显示「本轮认识 X / 不认识 Y」）
 * - 展示本轮统计 + 剩余/总卡数
 * - 操作：再来一轮（重开牌堆）/ 去成语库 / 去自测（空态引导，§3.3）
 *
 * U3 视觉重构：小结面板卡片化，消费 U1 设计 token；data-testid 不变
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
  margin: var(--y-space-xl) auto 0;
  padding: var(--y-space-xxl) var(--y-space-xl);
  border: 1px solid var(--y-border);
  border-radius: var(--y-radius-lg);
  background: var(--y-bg-card);
  text-align: center;
  box-shadow: var(--y-shadow-card);
}

.summary-title {
  margin: 0 0 var(--y-space-xl);
  font-size: var(--y-font-title);
  color: var(--y-text-primary);
}

.summary-stats {
  display: flex;
  justify-content: center;
  gap: var(--y-space-xxl);
  margin-bottom: var(--y-space-xl);
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--y-space-sm);
}

.stat-tag {
  font-size: var(--y-font-aux);
}

.stat-num {
  font-size: 34px;
  font-weight: 700;
  color: var(--y-text-primary);
  line-height: 1.2;
}

.summary-actions {
  display: flex;
  justify-content: center;
  gap: var(--y-space-md);
  flex-wrap: wrap;
}
</style>
