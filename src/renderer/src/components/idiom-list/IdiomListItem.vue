<script setup lang="ts">
/**
 * 列表行（固定行高 56px，与 IdiomVirtualList rowHeight 保持一致）
 * 点击跳转详情 /idioms/:id（§3.2；详情页为 T5 产物，链接先就位）
 */
import { computed } from 'vue'
import { NTag } from 'naive-ui'
import type { Idiom } from '@shared/ipc/contracts'
import HighlightText from './HighlightText.vue'

const props = defineProps<{ idiom: Idiom; keyword: string }>()

function tagType(f: number): 'default' | 'info' | 'success' | 'warning' | 'error' {
  switch (f) {
    case 1:
      return 'default'
    case 2:
      return 'info'
    case 3:
      return 'success'
    case 4:
      return 'warning'
    default:
      return 'error'
  }
}

const freqTag = computed(() => tagType(props.idiom.frequency))
</script>

<template>
  <RouterLink
    :to="`/idioms/${idiom.id}`"
    class="idiom-row"
    data-testid="idiom-row"
    :data-id="idiom.id"
  >
    <div class="idiom-row-main">
      <span class="idiom-word">
        <HighlightText :text="idiom.word" :query="keyword" />
      </span>
      <span class="idiom-pinyin">
        <HighlightText mode="pinyin" :text="idiom.pinyin" :query="keyword" />
      </span>
    </div>
    <div class="idiom-row-meta">
      <NTag size="small" :type="freqTag" round data-testid="freq-tag">频 {{ idiom.frequency }}</NTag>
      <NTag size="small" round bordered>{{ idiom.emotion }}</NTag>
    </div>
  </RouterLink>
</template>

<style scoped>
.idiom-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  height: 56px; /* 与虚拟列表 rowHeight 一致（固定行高） */
  padding: 0 14px;
  border-bottom: 1px solid #f2f2f2;
  text-decoration: none;
  color: inherit;
}

.idiom-row:hover {
  background: #f7f9fc;
}

.idiom-row-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.idiom-word {
  font-size: 17px;
  font-weight: 600;
  color: #2c3e50;
}

.idiom-pinyin {
  font-size: 12px;
  color: #9aa4b2;
}

.idiom-row-meta {
  display: flex;
  gap: 6px;
  flex: 0 0 auto;
}
</style>
