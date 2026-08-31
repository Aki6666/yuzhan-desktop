<script setup lang="ts">
/**
 * 多列网格 + 固定行高虚拟滚动（用户要求 #3：成语库多列展示）
 * - 按容器宽度自适应列数（列宽下限 CELL_MIN_WIDTH），虚拟化按「行」计：
 *   只渲染可视区 ± overscan 行，其余由占位高度承载。
 * - 同一行内按 items 顺序排列（列表已由 store 按档位+出现次数排序）。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Idiom } from '@shared/ipc/contracts'
import IdiomListItem from './IdiomListItem.vue'

const props = withDefaults(
  defineProps<{
    items: Idiom[]
    /** 当前生效的搜索关键字（防抖后），用于命中高亮 */
    keyword?: string
    /** 分页上限（用户要求 #2：每次只显示前 N 条，触底 @bottom 由父级增大；undefined=不限制） */
    limit?: number
    /** 单元格最小宽度（px）——决定列数 */
    cellMinWidth?: number
    /** 单元格高度（px）——固定行高虚拟滚动的核心参数 */
    cellHeight?: number
    /** 列间距（px） */
    gap?: number
    /** 可视区上下各多渲染的行数 */
    overscan?: number
    /** 容器高度未测量（首帧 / jsdom）时的兜底视口高度 */
    defaultViewportHeight?: number
  }>(),
  { keyword: '', limit: undefined, cellMinWidth: 230, cellHeight: 90, gap: 12, overscan: 3, defaultViewportHeight: 640 }
)

const emit = defineEmits<{ bottom: [] }>()

/** 分页截断后的词条（limit 变化不回顶；items 引用变化（搜索/筛选）才回顶） */
const bounded = computed(() => (props.limit !== undefined ? props.items.slice(0, props.limit) : props.items))

const containerRef = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const viewportHeight = ref(props.defaultViewportHeight)
const containerWidth = ref(0)
let resizeObserver: ResizeObserver | null = null

/** 列数：按容器宽度自适应（至少 1 列） */
const columns = computed(() => {
  const w = containerWidth.value
  if (w <= 0) return 1
  return Math.max(1, Math.floor((w + props.gap) / (props.cellMinWidth + props.gap)))
})

const rowHeight = computed(() => props.cellHeight + props.gap)
const rowCount = computed(() => Math.ceil(bounded.value.length / columns.value))
const totalHeight = computed(() => rowCount.value * rowHeight.value)

const startRow = computed(() =>
  Math.max(0, Math.floor(scrollTop.value / rowHeight.value) - props.overscan)
)
const endRow = computed(() =>
  Math.min(rowCount.value, Math.ceil((scrollTop.value + viewportHeight.value) / rowHeight.value) + props.overscan)
)

/** 可视行（每行至多 columns 个词条） */
const visibleRows = computed(() => {
  const rows: { rowIndex: number; cells: Idiom[] }[] = []
  for (let r = startRow.value; r < endRow.value; r++) {
    const from = r * columns.value
    rows.push({ rowIndex: r, cells: bounded.value.slice(from, from + columns.value) })
  }
  return rows
})

const offsetTop = computed(() => startRow.value * rowHeight.value)

/** 触底（分页加载更多，用户要求 #2）：距底部 < 阈值时通知父级 */
const BOTTOM_THRESHOLD = 240
function onScroll(e: Event): void {
  const el = e.target as HTMLElement
  scrollTop.value = el.scrollTop
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - BOTTOM_THRESHOLD) {
    emit('bottom')
  }
}

// 列表内容变化（搜索/过滤产生新数组）时回到顶部
watch(
  () => props.items,
  () => {
    scrollTop.value = 0
    const el = containerRef.value
    if (el && el.scrollTop !== 0) el.scrollTop = 0
  }
)

function measure(): void {
  const el = containerRef.value
  if (!el) return
  viewportHeight.value = el.clientHeight || props.defaultViewportHeight
  containerWidth.value = el.clientWidth
}

onMounted(() => {
  measure()
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(measure)
    if (containerRef.value) resizeObserver.observe(containerRef.value)
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
        <div
          v-for="row in visibleRows"
          :key="row.rowIndex"
          class="idiom-grid-row"
          :style="{
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            gap: `${gap}px`,
            marginBottom: `${gap}px`
          }"
        >
          <IdiomListItem
            v-for="item in row.cells"
            :key="item.id"
            :idiom="item"
            :keyword="keyword"
          />
        </div>
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
  padding: 12px;
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

.idiom-grid-row {
  display: grid;
  align-items: stretch;
}
</style>
