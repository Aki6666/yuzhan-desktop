<script setup lang="ts">
/**
 * 成语列表页（PLAN.md §14.3 T4 / F3 / §3.3 / §3.4 / §4.7 / AC-07）
 * - 搜索：汉字/全拼/首字母/模糊（复用 shared/lib/search.ts，由 idioms store 的 filtered 承担），防抖 200ms
 * - 频次（1–5）/首字过滤：直接写 store 过滤状态（§4.3「列表过滤状态」在 idioms store）
 * - 虚拟滚动：600 词条首屏 <300ms（IdiomVirtualList，固定行高）
 * - 点击行跳转 /idioms/:id（详情页为 T5 产物，链接先就位）
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NButton, NEmpty, NInput, NSpin } from 'naive-ui'
import { useIdiomsStore } from '@renderer/stores/idioms'
import IdiomVirtualList from '@renderer/components/idiom-list/IdiomVirtualList.vue'
import {
  FREQUENCY_OPTIONS,
  countByFirstChar,
  countByFrequency,
  debounce,
  firstCharOptions
} from '@renderer/lib/listFilters'

const store = useIdiomsStore()

// 搜索：输入防抖 200ms（§3.4）后写入 store.keyword，命中检索复用 shared/lib/search.ts
const query = ref('')
const applyKeyword = debounce((v: string) => {
  store.keyword = v
}, 200)
watch(query, (v) => applyKeyword(v))
onBeforeUnmount(() => applyKeyword.cancel())

onMounted(() => {
  void store.load()
})

const firstChars = computed(() => firstCharOptions(store.items))
const freqCounts = computed(() => countByFrequency(store.items))
const firstCharCounts = computed(() => countByFirstChar(store.items))

const hasFilter = computed(
  () => query.value.trim() !== '' || store.frequencyFilter !== null || store.firstCharFilter !== null
)

function toggleFrequency(f: number): void {
  store.frequencyFilter = store.frequencyFilter === f ? null : f
}

function toggleFirstChar(c: string): void {
  store.firstCharFilter = store.firstCharFilter === c ? null : c
}

function resetFilters(): void {
  query.value = ''
  applyKeyword.cancel()
  store.resetFilters()
}

function retryLoad(): void {
  void store.load()
}
</script>

<template>
  <section class="view idioms-page">
    <header class="page-header">
      <h1 class="page-title">成语库</h1>
      <span class="result-count" data-testid="result-count">
        共 {{ store.filtered.length }} / {{ store.items.length }} 条
      </span>
    </header>

    <div class="filter-bar">
      <NInput
        v-model:value="query"
        class="search-input"
        clearable
        placeholder="输入成语 / 全拼 / 首字母，如：鞠躬尽瘁、jugongjincui、jgj"
        data-testid="search-input"
      />
      <div class="filter-row">
        <span class="filter-label">频次</span>
        <div class="filter-options" role="group" aria-label="频次过滤">
          <NButton
            v-for="f in FREQUENCY_OPTIONS"
            :key="f"
            size="small"
            :type="store.frequencyFilter === f ? 'primary' : 'default'"
            :secondary="store.frequencyFilter !== f"
            :disabled="(freqCounts[f] ?? 0) === 0"
            class="filter-chip"
            :data-testid="`freq-${f}`"
            @click="toggleFrequency(f)"
          >
            {{ f }}<span class="chip-count">{{ freqCounts[f] ?? 0 }}</span>
          </NButton>
        </div>
      </div>
      <div class="filter-row">
        <span class="filter-label">首字</span>
        <div class="filter-options first-char-options" role="group" aria-label="首字过滤">
          <NButton
            v-for="c in firstChars"
            :key="c"
            size="small"
            :type="store.firstCharFilter === c ? 'primary' : 'default'"
            :secondary="store.firstCharFilter !== c"
            class="filter-chip"
            :data-testid="`first-${c}`"
            @click="toggleFirstChar(c)"
          >
            {{ c }}<span class="chip-count">{{ firstCharCounts.get(c) ?? 0 }}</span>
          </NButton>
        </div>
      </div>
      <div v-if="hasFilter" class="filter-row filter-actions">
        <NButton size="small" quaternary data-testid="reset-filters" @click="resetFilters">
          清除筛选
        </NButton>
      </div>
    </div>

    <div v-if="store.loading" class="list-state" data-testid="loading-state">
      <NSpin size="small" />
      <span class="state-text">正在加载语料库…</span>
    </div>
    <div v-else-if="store.error && !store.loaded" class="list-state" data-testid="error-state">
      <NEmpty description="语料库加载失败">
        <template #extra>
          <NButton size="small" data-testid="retry-load" @click="retryLoad">重试</NButton>
        </template>
      </NEmpty>
    </div>
    <div v-else-if="store.filtered.length === 0" class="list-state" data-testid="empty-state">
      <NEmpty
        :description="store.items.length === 0 ? '语料库为空' : '没有匹配的成语，换个关键字试试'"
      />
    </div>
    <IdiomVirtualList
      v-else
      :items="store.filtered"
      :keyword="store.keyword"
      class="list-scroll"
    />
  </section>
</template>

<style scoped>
.idioms-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 0;
}

.page-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.page-title {
  margin: 0;
  font-size: 20px;
  color: #2c3e50;
}

.result-count {
  font-size: 12px;
  color: #888;
}

.filter-bar {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-label {
  flex: 0 0 auto;
  font-size: 12px;
  color: #888;
}

.filter-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.first-char-options {
  max-height: 72px;
  overflow-y: auto;
}

.filter-chip :deep(.n-button__content) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.chip-count {
  font-size: 11px;
  opacity: 0.65;
}

.filter-actions {
  justify-content: flex-end;
}

.list-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 0;
  padding: 32px;
}

.state-text {
  font-size: 13px;
  color: #999;
}

.list-scroll {
  flex: 1;
  min-height: 0;
}
</style>
