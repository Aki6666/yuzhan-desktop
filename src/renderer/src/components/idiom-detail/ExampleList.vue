<script setup lang="ts">
/**
 * 真题/例句列表（PLAN.md §5.1 / §6.2）
 * - kind=exam：标注卷别（引用 exams.json，如 2023-国考-副省级）
 * - kind=made：标注「自造」
 */
import { NTag } from 'naive-ui'
import type { ExampleItem } from '@shared/ipc/contracts'
import { exampleBadge } from './detailFormat'

defineProps<{ examples: ExampleItem[] }>()
</script>

<template>
  <ul class="example-list">
    <li v-for="(ex, i) in examples" :key="i" class="example-item">
      <p class="example-text">「{{ ex.text }}」</p>
      <NTag
        size="small"
        :type="ex.kind === 'exam' ? 'info' : 'default'"
        :bordered="false"
        class="example-badge"
      >
        {{ exampleBadge(ex.kind, ex.exam) }}
      </NTag>
    </li>
  </ul>
</template>

<style scoped>
.example-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.example-item {
  padding: 10px 14px;
  border: 1px solid var(--y-border-light);
  border-radius: var(--y-radius-sm);
  background: var(--y-bg-subtle);
}

.example-text {
  margin: 0 0 6px;
  font-size: var(--y-font-body);
  line-height: var(--y-line-height-body);
  color: var(--y-text-body);
}

.example-badge {
  font-size: var(--y-font-aux);
}
</style>
