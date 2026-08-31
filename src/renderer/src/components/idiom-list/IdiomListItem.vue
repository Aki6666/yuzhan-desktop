<script setup lang="ts">
/**
 * 列表单元格（多列网格，固定高度 90px，与 IdiomVirtualList cellHeight 一致）
 * 点击跳转详情 /idioms/:id
 *
 * v0.2.6 墨韵重构：衬线词形 + 纸感卡片 + 朱砂 hover 指示条；
 * 高度/几何参数不变（cellHeight 90 + gap 12），data-testid/data-id 不变。
 */
import { computed } from 'vue'
import { NTag } from 'naive-ui'
import type { Idiom } from '@shared/ipc/contracts'
import { FREQUENCY_TIER_INFO } from '@renderer/lib/listFilters'
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

/** 档位理由 tooltip，如「5档：真题出现 80 次以上」 */
const freqTitle = computed(() => {
  const f = props.idiom.frequency
  const info = FREQUENCY_TIER_INFO[f as 1 | 2 | 3 | 4 | 5]
  return info ? `${info.label}：${info.desc}` : `频次 ${f} 档`
})

/** 出现次数副行（无 occurrences 时隐藏，如教研备用词） */
const occurrencesText = computed(() =>
  typeof props.idiom.occurrences === 'number' && props.idiom.occurrences > 0
    ? `真题出现 ${props.idiom.occurrences} 次`
    : ''
)
</script>

<template>
  <RouterLink
    :to="`/idioms/${idiom.id}`"
    class="idiom-cell"
    data-testid="idiom-row"
    :data-id="idiom.id"
  >
    <div class="idiom-cell-main">
      <span class="idiom-word">
        <HighlightText :text="idiom.word" :query="keyword" />
      </span>
      <span class="idiom-pinyin">
        <HighlightText mode="pinyin" :text="idiom.pinyin" :query="keyword" />
        <span v-if="occurrencesText" class="idiom-occur" :title="occurrencesText">{{ occurrencesText }}</span>
      </span>
    </div>
    <div class="idiom-cell-meta">
      <NTag size="small" :type="freqTag" round :title="freqTitle" data-testid="freq-tag">
        {{ idiom.frequency }}档
      </NTag>
      <NTag size="small" round bordered class="emotion-tag">{{ idiom.emotion }}</NTag>
    </div>
  </RouterLink>
</template>

<style scoped>
.idiom-cell {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 4px;
  height: 90px; /* 与 IdiomVirtualList cellHeight 一致（几何参数不变） */
  padding: 10px 12px;
  box-sizing: border-box;
  border: 1px solid var(--y-border-light);
  border-radius: var(--y-radius-md);
  background: var(--y-bg-card);
  text-decoration: none;
  color: inherit;
  position: relative;
  overflow: hidden;
  transition:
    border-color var(--y-motion-base) var(--y-motion-ease),
    background-color var(--y-motion-base) var(--y-motion-ease),
    box-shadow var(--y-motion-base) var(--y-motion-ease),
    transform var(--y-motion-base) var(--y-motion-ease);
}

.idiom-cell:hover {
  border-color: color-mix(in srgb, var(--y-primary) 30%, var(--y-border));
  background: var(--y-bg-card);
  box-shadow: var(--y-shadow-pop);
  transform: translateY(-2px);
}

/* hover 左侧朱砂指示条（印章落款感） */
.idiom-cell:hover::before {
  content: '';
  position: absolute;
  left: 0;
  top: 12px;
  bottom: 12px;
  width: 3px;
  border-radius: 999px;
  background: var(--y-primary);
}

.idiom-cell:active {
  background: var(--y-bg-active);
}

.idiom-cell-main {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.idiom-word {
  font-family: var(--y-font-serif);
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 1px;
  color: var(--y-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.idiom-pinyin {
  font-size: var(--y-font-aux);
  color: var(--y-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.idiom-occur {
  flex: 0 0 auto;
  color: var(--y-text-tertiary);
  opacity: 0.85;
  font-variant-numeric: tabular-nums;
}

.idiom-cell-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  min-width: 0;
  overflow: hidden;
}

.emotion-tag {
  color: var(--y-text-secondary);
}
</style>
