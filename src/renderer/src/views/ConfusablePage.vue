<script setup lang="ts">
/**
 * 易混淆成语库（用户要求 #8，路由 /confusable）
 * - 数据源：data/pairs.json（§6.4，含人工精选 57 对 + 卡片 near 提取 29 对），经 pairs:list 加载
 * - 每对一张卡片：A ⇄ B + 一句话核心区别；点击任一词跳转该词详情
 * - 关键字过滤（按两个词命中）
 */
import { computed, onMounted, ref } from 'vue'
import { NButton, NInput, NSpin } from 'naive-ui'
import type { ConfusablePair } from '@shared/ipc/contracts'
import { useIdiomsStore } from '@renderer/stores/idioms'

const pairs = ref<ConfusablePair[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const query = ref('')

const idiomsStore = useIdiomsStore()

/** 当前构建是否支持易混淆功能（旧版 preload 无 pairs API → 明确提示重装） */
const unsupported = computed(
  () =>
    !(window.api && typeof (window.api as { pairs?: { list?: unknown } }).pairs?.list === 'function')
)

/** word → id（详情跳转用；词条不存在则回退 word 本身） */
function idOf(word: string): string {
  return idiomsStore.items.find((i) => i.word === word)?.id ?? word
}

async function load(): Promise<void> {
  if (unsupported.value) return
  loading.value = true
  error.value = null
  try {
    if (!idiomsStore.loaded && !idiomsStore.loading) await idiomsStore.load()
    const res = await window.api.pairs.list()
    if (res.ok) pairs.value = res.data.pairs
    else error.value = res.error.message
  } catch (e) {
    error.value = String(e)
  } finally {
    loading.value = false
  }
}

onMounted(load)

const filtered = computed(() => {
  const q = query.value.trim()
  if (!q) return pairs.value
  return pairs.value.filter((p) => p.a.includes(q) || p.b.includes(q))
})
</script>

<template>
  <section class="view confusable-page">
    <header class="page-header">
      <div class="page-heading">
        <h1 class="page-title">
          <span class="page-eyebrow" aria-hidden="true" />
          易混淆成语
        </h1>
        <p class="page-sub">结对辨析 · 一句话说清核心区别 · 点词看详情</p>
      </div>
      <span class="result-count" data-testid="pair-count">
        共 {{ filtered.length }} / {{ pairs.length }} 对
      </span>
    </header>

    <NInput
      v-model:value="query"
      size="large"
      clearable
      class="search-input"
      placeholder="输入成语过滤，如：相得益彰"
      data-testid="pair-search"
    />

    <div v-if="unsupported" class="state-block" data-testid="pair-unsupported">
      <p class="state-text">
        当前应用版本过旧：易混淆功能需要新版本（preload 未包含 pairs API）。
        请重新构建应用（本地运行 pnpm build 后 pnpm start，或重新安装最新安装包）。
      </p>
    </div>

    <div v-else-if="loading" class="state-block" data-testid="pair-loading">
      <NSpin size="small" />
      <span class="state-text">正在加载易混淆对…</span>
    </div>

    <div v-else-if="error" class="state-block" data-testid="pair-error">
      <p class="state-text">加载失败：{{ error }}</p>
      <NButton size="small" @click="load">重试</NButton>
    </div>

    <div v-else-if="filtered.length === 0" class="state-block" data-testid="pair-empty">
      <p class="state-text">
        {{ pairs.length === 0 ? '暂无易混淆对数据：请确认 data/pairs.json 已随应用打包（需重新构建）' : '没有匹配的易混淆对，换个关键字试试' }}
      </p>
    </div>

    <div v-else class="pair-grid" data-testid="pair-grid">
      <div v-for="(p, i) in filtered" :key="i" class="pair-card" :data-testid="`pair-${i}`">
        <div class="pair-words">
          <RouterLink :to="`/idioms/${idOf(p.a)}`" class="pair-word" :title="`查看「${p.a}」详情`">
            {{ p.a }}
          </RouterLink>
          <span class="pair-vs" aria-hidden="true">⇄</span>
          <RouterLink :to="`/idioms/${idOf(p.b)}`" class="pair-word" :title="`查看「${p.b}」详情`">
            {{ p.b }}
          </RouterLink>
        </div>
        <p class="pair-diff">{{ p.diff }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.confusable-page {
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
  font-variant-numeric: tabular-nums;
}

.search-input {
  --n-height: 44px;
}

.pair-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
}

.pair-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 18px;
  border: 1px solid var(--y-border-light);
  border-radius: var(--y-radius-lg);
  background: var(--y-bg-card);
  box-shadow: var(--y-shadow-card);
  transition:
    border-color var(--y-motion-base) var(--y-motion-ease),
    box-shadow var(--y-motion-base) var(--y-motion-ease),
    transform var(--y-motion-base) var(--y-motion-ease);
}

.pair-card:hover {
  border-color: color-mix(in srgb, var(--y-primary) 30%, var(--y-border));
  box-shadow: var(--y-shadow-pop);
  transform: translateY(-2px);
}

.pair-words {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.pair-word {
  font-family: var(--y-font-serif);
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 1px;
  color: var(--y-primary);
  text-decoration: none;
  border-bottom: 1px dashed transparent;
}

.pair-word:hover {
  border-bottom-color: var(--y-primary);
}

.pair-vs {
  font-size: 14px;
  color: var(--y-text-tertiary);
}

.pair-diff {
  margin: 0;
  font-size: var(--y-font-body);
  line-height: var(--y-line-height-body);
  color: var(--y-text-secondary);
}

.state-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 48px 0;
  text-align: center;
}

.state-text {
  margin: 0;
  font-size: var(--y-font-body);
  color: var(--y-text-secondary);
}
</style>
