<script setup lang="ts">
/**
 * 误用类型分布可视化（V2-D，§8 错题本 + 误用类型统计）
 * - 横向条形图：类型 + 计数 + 占比，条形宽度 = 占比（消费 U1 token：--y-primary / 灰阶）
 * - 未出现类型（count=0）也列出，置灰展示
 */
import { NTag } from 'naive-ui'
import type { WrongTypeStat } from './wrongBookStats'

defineProps<{ stats: WrongTypeStat[] }>()
</script>

<template>
  <section class="dist" data-testid="wrong-type-dist">
    <ul class="dist-list">
      <li
        v-for="s in stats"
        :key="s.type"
        class="dist-row"
        :class="{ empty: s.count === 0 }"
        data-testid="wrong-type-row"
        :data-type="s.type"
      >
        <span class="dist-label">{{ s.type }}</span>
        <span class="dist-bar-track">
          <span
            class="dist-bar"
            :class="{ zero: s.count === 0 }"
            :style="{ width: `${Math.min(100, s.percent)}%` }"
            data-testid="wrong-type-bar"
            :data-type="s.type"
          />
        </span>
        <span class="dist-meta">
          <NTag size="small" :bordered="false" class="dist-count-tag">{{ s.count }}</NTag>
          <span class="dist-percent">{{ s.percent }}%</span>
        </span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.dist-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dist-row {
  display: grid;
  grid-template-columns: 96px 1fr 88px;
  align-items: center;
  gap: 12px;
}

.dist-row.empty {
  opacity: 0.45;
}

.dist-label {
  font-size: 13px;
  color: var(--y-text-body);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dist-bar-track {
  display: block;
  height: 8px;
  border-radius: 4px;
  background: var(--y-bg-hover);
  overflow: hidden;
}

.dist-bar {
  display: block;
  height: 100%;
  border-radius: 4px;
  background: linear-gradient(90deg, var(--y-primary) 0%, color-mix(in srgb, var(--y-primary) 65%, var(--y-bg-card)) 100%);
  transition: width var(--y-motion-base) var(--y-motion-ease);
}

.dist-bar.zero {
  width: 0 !important;
  background: transparent;
}

.dist-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: flex-end;
}

.dist-count-tag {
  font-variant-numeric: tabular-nums;
}

.dist-percent {
  font-size: var(--y-font-aux);
  color: var(--y-text-tertiary);
  min-width: 40px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
