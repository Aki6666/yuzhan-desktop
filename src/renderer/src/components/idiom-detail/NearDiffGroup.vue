<script setup lang="ts">
/**
 * 近义辨析组（PLAN.md §3.4：详情页辨析组折叠展开，默认折叠）
 * - 默认折叠：仅显示「近义辨析（N）」标题行与展开箭头
 * - 展开后逐条展示 near[].word + near[].diff（一句话核心区别，§5.7#5）
 */
import { ref } from 'vue'
import type { NearItem } from '@shared/ipc/contracts'

defineProps<{ near: NearItem[] }>()

const expanded = ref(false)

function toggle(): void {
  expanded.value = !expanded.value
}
</script>

<template>
  <div class="near-group">
    <button
      type="button"
      class="near-toggle"
      :aria-expanded="expanded"
      @click="toggle"
    >
      <span class="near-caret" :class="{ open: expanded }" aria-hidden="true">▸</span>
      <span class="near-title">近义辨析（{{ near.length }}）</span>
    </button>

    <ul v-if="expanded" class="near-list">
      <li v-for="item in near" :key="item.word" class="near-item">
        <span class="near-word">{{ item.word }}</span>
        <span class="near-diff">{{ item.diff }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.near-group {
  border: 1px solid var(--y-border-light);
  border-radius: var(--y-radius-sm);
  background: var(--y-bg-subtle);
  overflow: hidden;
}

.near-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 14px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: var(--y-font-body);
  color: var(--y-text-body);
  text-align: left;
  transition: background-color var(--y-motion-fast) var(--y-motion-ease);
}

.near-toggle:hover {
  background: var(--y-bg-hover);
}

.near-caret {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--y-bg-card);
  border: 1px solid var(--y-border-light);
  font-size: 10px;
  color: var(--y-text-tertiary);
  transition:
    transform var(--y-motion-base) var(--y-motion-ease),
    color var(--y-motion-base) var(--y-motion-ease),
    background-color var(--y-motion-base) var(--y-motion-ease);
}

.near-caret.open {
  transform: rotate(90deg);
  background: var(--y-primary-soft);
  color: var(--y-primary);
}

.near-title {
  font-weight: 600;
  color: var(--y-text-body);
}

.near-list {
  list-style: none;
  margin: 0;
  padding: 4px 14px 12px 40px;
  border-top: 1px solid var(--y-border-light);
}

.near-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 0;
  font-size: 13px;
  line-height: var(--y-line-height-body);
  color: var(--y-text-body);
}

.near-item + .near-item {
  border-top: 1px dashed var(--y-border-light);
}

.near-word {
  font-family: var(--y-font-serif);
  font-weight: 600;
  color: var(--y-text-primary);
  flex: 0 0 auto;
}

.near-diff {
  color: var(--y-text-secondary);
}
</style>
