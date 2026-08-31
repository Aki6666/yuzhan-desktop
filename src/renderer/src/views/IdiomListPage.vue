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
    <!-- 页头：标题 + 副标题 + 结果计数 -->
    <header class="page-header">
      <div class="page-heading">
        <h1 class="page-title">成语库</h1>
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

    <!-- 筛选条：频次视觉化（FIX-2：5 档点阵 + 计数副行，选中态与 U1 token 一致） -->
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
            :title="`频次 ${f}：${freqCounts[f] ?? 0} 条`"
            @click="toggleFrequency(f)"
          >
            <span class="freq-dots" aria-hidden="true">
              <span v-for="d in 5" :key="d" class="freq-dot-mini" :class="{ on: d <= f }" />
            </span>
            <span class="freq-count">{{ freqCounts[f] ?? 0 }}</span>
          </button>
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

/* 频次视觉化：5 档点阵 + 计数副行（FIX-2） */
.freq-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.freq-seg {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  min-width: 56px;
  padding: 9px 12px 8px;
  border: 1px solid var(--y-border-light);
  border-radius: var(--y-radius-sm);
  background: var(--y-bg-card);
  cursor: pointer;
  transition:
    border-color 0.12s ease,
    background-color 0.12s ease;
}

.freq-seg:hover:not(:disabled) {
  background: var(--y-bg-hover);
}

.freq-seg:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.freq-seg.active {
  border-color: var(--y-primary);
  background: var(--y-primary-soft);
}

.freq-dots {
  display: flex;
  gap: 3px;
}

.freq-dot-mini {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--y-border);
}

.freq-dot-mini.on {
  background: var(--y-primary);
}

.freq-count {
  font-size: 11px;
  line-height: 1;
  color: var(--y-text-tertiary);
}

.freq-seg.active .freq-count {
  color: var(--y-primary);
  font-weight: 600;
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
