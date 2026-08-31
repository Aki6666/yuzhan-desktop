<script setup lang="ts">
/**
 * 固定行高虚拟滚动列表（PLAN.md §4.7：600 词条首屏 <300ms）
 * 只渲染可视区 ± overscan 行，其余由占位高度承载；滚动时平移可视窗口。
 * 不依赖 vue-virtual-scroller，实现等价能力且零新增依赖。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Idiom } from '@shared/ipc/contracts'
import IdiomListItem from './IdiomListItem.vue'

const props = withDefaults(
  defineProps<{
    items: Idiom[]
    /** 当前生效的搜索关键字（防抖后），用于命中高亮 */
    keyword?: string
    /** 行高（px）——固定行高虚拟滚动的核心参数，须与行实际高度一致 */
    rowHeight?: number
    /** 可视区上下各多渲染的行数，避免快速滚动露白 */
    overscan?: number
    /** 容器高度未测量（首帧 / jsdom）时的兜底视口高度 */
    defaultViewportHeight?: number
  }>(),
  { keyword: '', rowHeight: 56, overscan: 4, defaultViewportHeight: 640 }
)

const containerRef = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const viewportHeight = ref(props.defaultViewportHeight)
let resizeObserver: ResizeObserver | null = null

const totalHeight = computed(() => props.items.length * props.rowHeight)

const startIndex = computed(() =>
  Math.max(0, Math.floor(scrollTop.value / props.rowHeight) - props.overscan)
)
const endIndex = computed(() =>
  Math.min(
    props.items.length,
    Math.ceil((scrollTop.value + viewportHeight.value) / props.rowHeight) + props.overscan
  )
)
const visible = computed(() => props.items.slice(startIndex.value, endIndex.value))
const offsetTop = computed(() => startIndex.value * props.rowHeight)

function onScroll(e: Event): void {
  scrollTop.value = (e.target as HTMLElement).scrollTop
}

// 列表内容变化（搜索/过滤产生新数组）时回到顶部，避免停留在越界位置
watch(
  () => props.items,
  () => {
    scrollTop.value = 0
    const el = containerRef.value
    if (el && el.scrollTop !== 0) el.scrollTop = 0
  }
)

onMounted(() => {
  const el = containerRef.value
  if (!el) return
  viewportHeight.value = el.clientHeight || props.defaultViewportHeight
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      viewportHeight.value = el.clientHeight || props.defaultViewportHeight
    })
    resizeObserver.observe(el)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})
</script>

<template>
  <div
    ref="containerRef"
    class="idiom-virtual-list"
    data-testid="virtual-scroll"
    @scroll.passive="onScroll"
  >
    <div class="idiom-virtual-list-spacer" :style="{ height: `${totalHeight}px` }">
      <div class="idiom-virtual-list-window" :style="{ transform: `translateY(${offsetTop}px)` }">
        <IdiomListItem
          v-for="item in visible"
          :key="item.id"
          :idiom="item"
          :keyword="keyword"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.idiom-virtual-list {
  overflow: auto;
  border: 1px solid var(--y-border-light);
  border-radius: var(--y-radius-lg);
  background: var(--y-bg-card);
  box-shadow: var(--y-shadow-card);
}

.idiom-virtual-list-spacer {
  position: relative;
  width: 100%;
}

.idiom-virtual-list-window {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
}
</style>
