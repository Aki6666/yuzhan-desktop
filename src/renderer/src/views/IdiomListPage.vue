<script setup lang="ts">
/**
 * 成语列表页（PLAN.md §14.3 T4 / F3 / §3.3 / §3.4 / §4.7 / AC-07）
 * - 搜索：汉字/全拼/首字母/模糊（复用 shared/lib/search.ts，由 idioms store 的 filtered 承担），防抖 200ms
 * - 频次（1–5）/首字过滤：直接写 store 过滤状态（§4.3「列表过滤状态」在 idioms store）
 * - 虚拟滚动：600 词条首屏 <300ms（IdiomVirtualList，固定行高）
 * - 点击行跳转 /idioms/:id（详情页为 T5 产物，链接先就位）
 *
 * U2 视觉重构：消费 U1 设计 token（var(--y-*)），data-testid 与行为保持不变。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NButton, NInput, NSpin } from 'naive-ui'
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
    <!-- 页头：标题 + 副标题 + 结果计数 -->
    <header class="page-header">
      <div class="page-heading">
        <h1 class="page-title">成语库</h1>
        <p class="page-sub">拼音 / 首字母 / 模糊检索 · 频次与首字筛选</p>
      </div>
      <span class="result-count" data-testid="result-count">
        共 {{ store.filtered.length }} / {{ store.items.length }} 条
      </span>
    </header>

    <!-- 搜索框：醒目顶置 -->
    <NInput
      v-model:value="query"
      size="large"
      clearable
      class="search-input"
      placeholder="输入成语 / 全拼 / 首字母，如：鞠躬尽瘁、jugongjincui、jgj"
      data-testid="search-input"
    >
      <template #prefix>
        <svg
          class="search-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
      </template>
    </NInput>

    <!-- 筛选条：频次 / 首字 chips -->
    <div class="filter-card">
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
      <div v-if="hasFilter" class="filter-actions">
        <NButton size="small" quaternary data-testid="reset-filters" @click="resetFilters">
          清除筛选
        </NButton>
      </div>
    </div>

    <!-- 加载中 -->
    <div v-if="store.loading" class="list-state" data-testid="loading-state">
      <NSpin size="small" />
      <span class="state-text">正在加载语料库…</span>
    </div>

    <!-- 加载失败 -->
    <div v-else-if="store.error && !store.loaded" class="list-state" data-testid="error-state">
      <p class="state-text">语料库加载失败：{{ store.error }}</p>
      <NButton size="small" data-testid="retry-load" @click="retryLoad">重试</NButton>
    </div>

    <!-- 空态（无匹配 / 空库） -->
    <div v-else-if="store.filtered.length === 0" class="list-state" data-testid="empty-state">
      <svg
        class="empty-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
        <path d="M8 11h6" />
      </svg>
      <p class="empty-title">{{ store.items.length === 0 ? '语料库为空' : '没有匹配的成语' }}</p>
      <p class="empty-desc">
        {{ store.items.length === 0 ? '去数据目录补充词条后刷新' : '换个关键字，或清除筛选条件试试' }}
      </p>
      <NButton v-if="hasFilter" size="small" quaternary data-testid="empty-reset" @click="resetFilters">
        清除筛选
      </NButton>
    </div>

    <!-- 列表（虚拟滚动） -->
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
  gap: 14px;
  max-width: 880px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}

.page-heading {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.page-title {
  margin: 0;
  font-size: var(--y-font-title-lg);
  font-weight: 700;
  color: var(--y-text-primary);
}

.page-sub {
  margin: 0;
  font-size: var(--y-font-aux);
  color: var(--y-text-tertiary);
}

.result-count {
  font-size: var(--y-font-aux);
  color: var(--y-text-secondary);
  padding-bottom: 2px;
}

.search-input {
  --n-height: 44px;
}

.search-icon {
  width: 16px;
  height: 16px;
  color: var(--y-text-tertiary);
}

.filter-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  background: var(--y-bg-card);
  border: 1px solid var(--y-border-light);
  border-radius: var(--y-radius-lg);
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.filter-label {
  flex: 0 0 32px;
  font-size: var(--y-font-aux);
  color: var(--y-text-tertiary);
}

.filter-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.first-char-options {
  max-height: 84px;
  overflow-y: auto;
}

.filter-chip :deep(.n-button__content) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.chip-count {
  font-size: 11px;
  opacity: 0.6;
}

.filter-actions {
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid var(--y-border-light);
  padding-top: 8px;
}

.list-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 300px;
  padding: 40px;
  background: var(--y-bg-card);
  border: 1px solid var(--y-border-light);
  border-radius: var(--y-radius-lg);
  text-align: center;
}

.state-text {
  font-size: var(--y-font-body);
  color: var(--y-text-secondary);
  line-height: var(--y-line-height-body);
}

.empty-icon {
  width: 40px;
  height: 40px;
  color: var(--y-text-tertiary);
  margin-bottom: 4px;
}

.empty-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--y-text-body);
}

.empty-desc {
  margin: 0;
  font-size: var(--y-font-body);
  color: var(--y-text-tertiary);
}

.list-scroll {
  flex: 1;
  min-height: 0;
}
</style>
