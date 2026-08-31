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
  border: 1px solid #e3e6ea;
  border-radius: 8px;
  background: #fafbfc;
}

.near-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  color: #2c3e50;
  text-align: left;
}

.near-toggle:hover {
  background: #f0f2f5;
}

.near-caret {
  display: inline-block;
  transition: transform 0.15s ease;
  color: #7a8699;
}

.near-caret.open {
  transform: rotate(90deg);
}

.near-title {
  font-weight: 600;
}

.near-list {
  list-style: none;
  margin: 0;
  padding: 4px 12px 10px 30px;
}

.near-item {
  padding: 4px 0;
  font-size: 13px;
  line-height: 1.6;
  color: #444;
}

.near-word {
  font-weight: 600;
  color: #1f2d3d;
  margin-right: 6px;
}

.near-diff {
  color: #555;
}
</style>
