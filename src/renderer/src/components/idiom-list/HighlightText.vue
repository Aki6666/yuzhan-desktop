<script setup lang="ts">
/**
 * 命中高亮文本（§3.4 命中词高亮）
 * - mode=text：在汉字上定位（精确/前缀/子串/编辑距离 ≤1 近似）
 * - mode=pinyin：在带声调拼音上定位（全拼子串）
 */
import { computed } from 'vue'
import { highlightPinyinSpan, highlightSpan, type HighlightSpan } from '../../lib/listFilters'

const props = withDefaults(
  defineProps<{
    text: string
    query: string
    mode?: 'text' | 'pinyin'
  }>(),
  { mode: 'text' }
)

const hitSpan = computed<HighlightSpan | null>(() =>
  props.mode === 'pinyin'
    ? highlightPinyinSpan(props.text, props.query)
    : highlightSpan(props.text, props.query)
)
</script>

<template>
  <span class="hl-text">
    <template v-if="hitSpan">
      <span class="hl-pre">{{ text.slice(0, hitSpan.start) }}</span
      ><mark class="hl-hit">{{ text.slice(hitSpan.start, hitSpan.end) }}</mark
      ><span class="hl-post">{{ text.slice(hitSpan.end) }}</span>
    </template>
    <template v-else>{{ text }}</template>
  </span>
</template>

<style scoped>
.hl-hit {
  background: var(--y-primary-soft);
  color: var(--y-primary);
  border-radius: 3px;
  padding: 0 1px;
}
</style>
