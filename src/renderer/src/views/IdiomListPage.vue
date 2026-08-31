<script setup lang="ts">
/**
 * 成语列表页（PLAN.md §14.3 T4 / F3 / §3.3 / §3.4 / §4.7 / AC-07）
 * - 搜索：汉字/全拼/首字母/模糊（复用 shared/lib/search.ts，由 idioms store 的 filtered 承担），防抖 200ms
 * - 频次（1–5）过滤：直接写 store 过滤状态（§4.3「列表过滤状态」在 idioms store）
 * - 虚拟滚动：600 词条首屏 <300ms（IdiomVirtualList，固定行高）
 * - 点击行跳转 /idioms/:id
 *
 * v0.2.6 墨韵重构：衬线页标题 + 朱砂筛选态 + 纸感卡片；data-testid 与行为不变。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NButton, NInput, NSpin } from 'naive-ui'
import { useIdiomsStore } from '@renderer/stores/idioms'
import IdiomVirtualList from '@renderer/components/idiom-list/IdiomVirtualList.vue'
import {
  FREQUENCY_OPTIONS,
  FREQUENCY_TIER_INFO,
  countByFrequency,
  debounce
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

const freqCounts = computed(() => countByFrequency(store.items))

/** 分页（用户要求 #2：每次只显示一部分，触底/按钮加载更多） */
const PAGE_SIZE = 100
const limit = ref(PAGE_SIZE)
const shown = computed(() => Math.min(limit.value, store.filtered.length))

function loadMore(): void {
  if (limit.value < store.filtered.length) limit.value += PAGE_SIZE
}

// 搜索/筛选/排序变化 → 回到第一页
watch(
  () => [store.keyword, store.frequencyFilter, store.sortMode, store.sortDirection],
  () => {
    limit.value = PAGE_SIZE
  }
)

const hasFilter = computed(() => query.value.trim() !== '' || store.frequencyFilter !== null)

function toggleFrequency(f: number): void {
  store.frequencyFilter = store.frequencyFilter === f ? null : f
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
    <!-- 页头：衬线标题 + 副标题 + 结果计数 -->
    <header class="page-header">
      <div class="page-heading">
        <h1 class="page-title">
          <span class="page-eyebrow" aria-hidden="true" />
          成语库
        </h1>
        <p class="page-sub">拼音 / 首字母 / 模糊检索 · 频次筛选</p>
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
      placeholder="搜索成语"
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

    <!-- 筛选条：频次档位 + 排序控制 -->
    <div class="filter-card">
      <div class="filter-row">
        <span class="filter-label">频次</span>
        <div class="freq-selector" role="group" aria-label="频次过滤">
          <button
            v-for="f in FREQUENCY_OPTIONS"
            :key="f"
            type="button"
            class="freq-seg"
            :class="{ active: store.frequencyFilter === f }"
            :disabled="(freqCounts[f] ?? 0) === 0"
            :data-testid="`freq-${f}`"
            :title="`${FREQUENCY_TIER_INFO[f].label}：${FREQUENCY_TIER_INFO[f].desc}，共 ${freqCounts[f] ?? 0} 条`"
            @click="toggleFrequency(f)"
          >
            <span class="freq-label">{{ FREQUENCY_TIER_INFO[f].label }}</span>
            <span class="freq-desc">{{ FREQUENCY_TIER_INFO[f].desc }}</span>
            <span class="freq-count">{{ freqCounts[f] ?? 0 }} 条</span>
          </button>
        </div>
      </div>
      <div class="filter-row sort-row">
        <span class="filter-label">排序</span>
        <div class="sort-controls">
          <button
            type="button"
            class="sort-seg"
            :class="{ active: store.sortMode === 'frequency' }"
            data-testid="sort-frequency"
            @click="store.sortMode = 'frequency'"
          >
            档位序
          </button>
          <button
            type="button"
            class="sort-seg"
            :class="{ active: store.sortMode === 'pinyin' }"
            data-testid="sort-pinyin"
            @click="store.sortMode = 'pinyin'"
          >
            拼音序
          </button>
          <button
            type="button"
            class="sort-seg"
            data-testid="sort-direction"
            @click="store.toggleSortDirection()"
          >
            {{ store.sortDirection === 'desc' ? '降序 ↓' : '升序 ↑' }}
          </button>
          <span v-if="store.sortMode === 'frequency'" class="sort-hint">
            同档按真题出现次数{{ store.sortDirection === 'desc' ? '降序' : '升序' }}
          </span>
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

    <!-- 列表（虚拟滚动 + 分页：每页 100 条，触底加载更多） -->
    <IdiomVirtualList
      v-else
      :items="store.filtered"
      :limit="limit"
      :keyword="store.keyword"
      class="list-scroll"
      @bottom="loadMore"
    />

    <!-- 分页状态条 -->
    <div v-if="store.filtered.length > 0" class="pager-bar">
      <span class="pager-text" data-testid="pager-text">
        已显示 {{ shown }} / {{ store.filtered.length }} 条
      </span>
      <NButton v-if="limit < store.filtered.length" size="small" quaternary data-testid="load-more" @click="loadMore">
        加载更多
      </NButton>
    </div>
  </section>
</template>

<style scoped>
.idioms-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 1120px;
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
  gap: 4px;
}

.page-title {
  margin: 0;
  font-family: var(--y-font-serif);
  font-size: var(--y-font-title-lg);
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--y-text-primary);
}

.page-eyebrow {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 10px;
  border-radius: 2px;
  background: var(--y-primary);
  transform: translateY(-3px);
}

.page-sub {
  margin: 0;
  font-size: var(--y-font-aux);
  color: var(--y-text-tertiary);
  padding-left: 18px;
}

.result-count {
  font-size: var(--y-font-aux);
  color: var(--y-text-secondary);
  padding: 4px 12px;
  border: 1px solid var(--y-border-light);
  border-radius: 999px;
  background: var(--y-bg-card);
  white-space: nowrap;
}

.search-input {
  --n-height: 46px;
}

.search-icon {
  width: 16px;
  height: 16px;
  color: var(--y-text-tertiary);
}

/* 筛选卡：纸白表面 */
.filter-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  background: var(--y-bg-card);
  border: 1px solid var(--y-border-light);
  border-radius: var(--y-radius-lg);
  box-shadow: var(--y-shadow-card);
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.filter-label {
  flex: 0 0 32px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 2px;
  color: var(--y-text-tertiary);
  padding-top: 4px;
}

/* 频次档位：纸片式分段卡，激活为朱砂浅底 */
.freq-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.freq-seg {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  min-width: 104px;
  padding: 8px 12px;
  border: 1px solid var(--y-border-light);
  border-radius: var(--y-radius-sm);
  background: var(--y-bg-card);
  cursor: pointer;
  transition:
    border-color var(--y-motion-fast) var(--y-motion-ease),
    background-color var(--y-motion-fast) var(--y-motion-ease);
}

.freq-seg:hover:not(:disabled) {
  background: var(--y-bg-hover);
}

.freq-seg:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.freq-seg.active {
  border-color: color-mix(in srgb, var(--y-primary) 42%, var(--y-border));
  background: var(--y-primary-soft);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--y-primary) 14%, transparent);
}

.freq-label {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.2;
  color: var(--y-text-primary);
}

.freq-desc {
  font-size: 11px;
  line-height: 1.2;
  color: var(--y-text-tertiary);
  white-space: nowrap;
}

.freq-count {
  font-size: 11px;
  line-height: 1.2;
  color: var(--y-text-tertiary);
  font-variant-numeric: tabular-nums;
}

.freq-seg.active .freq-label {
  color: var(--y-primary);
}

.freq-seg.active .freq-count {
  color: var(--y-primary);
  font-weight: 600;
}

/* 排序控制 */
.sort-row {
  align-items: flex-start;
}

.sort-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.sort-seg {
  padding: 5px 12px;
  font-size: 12px;
  border: 1px solid var(--y-border-light);
  border-radius: 999px;
  background: var(--y-bg-card);
  color: var(--y-text-secondary);
  cursor: pointer;
  transition:
    border-color var(--y-motion-fast) var(--y-motion-ease),
    background-color var(--y-motion-fast) var(--y-motion-ease),
    color var(--y-motion-fast) var(--y-motion-ease);
}

.sort-seg:hover {
  background: var(--y-bg-hover);
}

.sort-seg.active {
  border-color: color-mix(in srgb, var(--y-primary) 42%, var(--y-border));
  color: var(--y-primary);
  background: var(--y-primary-soft);
  font-weight: 600;
}

.sort-hint {
  font-size: 11px;
  color: var(--y-text-tertiary);
}

.filter-actions {
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid var(--y-border-light);
  padding-top: 8px;
}

/* 状态块 */
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
  box-shadow: var(--y-shadow-card);
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

/* 分页状态条 */
.pager-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 4px 0 2px;
}

.pager-text {
  font-size: var(--y-font-aux);
  color: var(--y-text-tertiary);
  font-variant-numeric: tabular-nums;
}
</style>
