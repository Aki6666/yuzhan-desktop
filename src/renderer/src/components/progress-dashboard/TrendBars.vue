<script setup lang="ts">
/**
 * 近 7 日复习趋势 mini 条形图（V2-E 掌握度仪表盘，§8）
 * - 每天两根细条：复习次数（主色 --y-primary）/ 新掌握数（成功色 --y-success）
 * - 高度按本窗口最大值归一（≥4px 保证可见）；消费 U1 token，无硬编码颜色
 */
import { computed } from 'vue'
import type { TrendPoint } from './dashboardStats'

const props = defineProps<{ points: TrendPoint[] }>()

const max = computed(() =>
  Math.max(1, ...props.points.map((p) => Math.max(p.reviews, p.mastered)))
)

function barHeight(v: number): string {
  const h = v === 0 ? 4 : Math.max(4, Math.round((v / max.value) * 72))
  return `${h}px`
}

function dayLabel(date: string): string {
  return date.slice(5) // MM-DD
}
</script>

<template>
  <div class="trend" data-testid="trend-chart">
    <div class="trend-bars" data-testid="trend-bars">
      <div v-for="p in points" :key="p.date" class="trend-col" :data-date="p.date">
        <div class="trend-col-bars">
          <span
            class="trend-bar trend-bar-review"
            :style="{ height: barHeight(p.reviews) }"
            :title="`${p.date} 复习 ${p.reviews}`"
            :data-testid="`trend-review-${p.date}`"
          />
          <span
            class="trend-bar trend-bar-mastered"
            :style="{ height: barHeight(p.mastered) }"
            :title="`${p.date} 掌握 ${p.mastered}`"
            :data-testid="`trend-mastered-${p.date}`"
          />
        </div>
        <span class="trend-label">{{ dayLabel(p.date) }}</span>
      </div>
    </div>
    <div class="trend-legend">
      <span class="legend-item"><i class="legend-dot legend-review" />复习</span>
      <span class="legend-item"><i class="legend-dot legend-mastered" />新掌握</span>
    </div>
  </div>
</template>

<style scoped>
.trend {
  display: flex;
  flex-direction: column;
  gap: var(--y-space-md);
}

.trend-bars {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--y-space-sm);
  min-height: 96px;
}

.trend-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--y-space-xs);
}

.trend-col-bars {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 76px;
}

.trend-bar {
  display: block;
  width: 10px;
  border-radius: 3px 3px 0 0;
  transition: height 0.3s ease;
}

.trend-bar-review {
  background: var(--y-primary);
  opacity: 0.85;
}

.trend-bar-mastered {
  background: var(--y-success);
  opacity: 0.9;
}

.trend-label {
  font-size: var(--y-font-aux);
  color: var(--y-text-tertiary);
  font-variant-numeric: tabular-nums;
}

.trend-legend {
  display: flex;
  justify-content: flex-end;
  gap: var(--y-space-lg);
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: var(--y-font-aux);
  color: var(--y-text-secondary);
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
}

.legend-review {
  background: var(--y-primary);
}

.legend-mastered {
  background: var(--y-success);
}
</style>
