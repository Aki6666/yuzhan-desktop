<script setup lang="ts">
/**
 * 生词本页（PLAN.md §3.3 生词本 / F7 / AC-04）
 * - 列表 + 手动删除 + 「立即复习」（命中库内词 → progress 记录 + 跳转详情；未收录 → 提示）
 * - 空态引导：刷题遇到生词，Ctrl+K 记下来（§3.3）
 * - 数据走 pending store（T3：userData/pending.json 即时写）与 progress store（T3）
 *
 * U2 视觉重构：消费 U1 设计 token；data-testid、文案与行为保持不变。
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NSpin, NTag } from 'naive-ui'
import { useIdiomsStore } from '@renderer/stores/idioms'
import { usePendingStore } from '@renderer/stores/pending'
import { useProgressStore } from '@renderer/stores/progress'
import { formatAddedAt } from '@renderer/lib/quickRecord'

const router = useRouter()
const pendingStore = usePendingStore()
const idiomsStore = useIdiomsStore()
const progressStore = useProgressStore()

const hint = ref<string | null>(null)

onMounted(() => {
  void pendingStore.load()
  void idiomsStore.load()
})

const count = computed(() => pendingStore.items.length)

function findIdiomByWord(word: string) {
  return idiomsStore.items.find((i) => i.word === word)
}

/** 「立即复习」：库内命中 → 记录复习（new→learning + 强制 flush）并跳详情；未收录 → 提示 */
async function reviewNow(word: string): Promise<void> {
  hint.value = null
  const idiom = findIdiomByWord(word)
  if (!idiom) {
    hint.value = `词库未收录「${word}」，无法记录复习进度`
    return
  }
  progressStore.recordAttempt(idiom.id)
  await progressStore.flush()
  void router.push(`/idioms/${idiom.id}`)
}

async function removeWord(word: string): Promise<void> {
  hint.value = null
  await pendingStore.remove(word)
}

function goBrowse(): void {
  void router.push('/idioms')
}
</script>

<template>
  <section class="view pending-page">
    <header class="page-header">
      <div class="page-heading">
        <h1 class="page-title">生词本</h1>
        <p class="page-sub">刷题遇到的未收录生词 · 可立即复习或删除</p>
      </div>
      <span class="result-count" data-testid="pending-count">共 {{ count }} 条</span>
    </header>

    <div v-if="hint" class="hint-bar" data-testid="pending-hint">
      <NTag size="small" type="warning" :bordered="false">{{ hint }}</NTag>
    </div>

    <!-- 加载中 -->
    <div v-if="pendingStore.loading" class="list-state" data-testid="pending-loading">
      <NSpin size="small" />
      <span class="state-text">加载中…</span>
    </div>

    <!-- 加载失败 -->
    <div v-else-if="pendingStore.error && !pendingStore.loaded" class="list-state" data-testid="pending-error">
      <p class="state-text">生词本加载失败：{{ pendingStore.error }}</p>
    </div>

    <!-- 空态引导（§3.3：刷题遇到生词，Ctrl+K 记下来） -->
    <div v-else-if="count === 0" class="list-state" data-testid="pending-empty">
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
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        <path d="M12 7v6" />
        <path d="M9 10h6" />
      </svg>
      <p class="empty-title">生词本还是空的</p>
      <p class="empty-desc">刷题遇到生词，Ctrl+K 记下来</p>
      <NButton size="small" type="primary" data-testid="goto-browse" @click="goBrowse">
        去成语库浏览
      </NButton>
    </div>

    <!-- 生词列表 -->
    <ul v-else class="pending-list">
      <li
        v-for="item in pendingStore.items"
        :key="item.word"
        class="pending-row"
        data-testid="pending-row"
        :data-word="item.word"
      >
        <div class="pending-main">
          <span class="pending-word">{{ item.word }}</span>
          <span class="pending-date">{{ formatAddedAt(item.addedAt) }}</span>
        </div>
        <div class="pending-actions">
          <NButton size="small" secondary data-testid="pending-review" @click="reviewNow(item.word)">
            立即复习
          </NButton>
          <NButton size="small" quaternary type="error" data-testid="pending-remove" @click="removeWord(item.word)">
            删除
          </NButton>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.pending-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 720px;
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

.hint-bar {
  display: flex;
}

.list-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 280px;
  padding: 40px;
  background: var(--y-bg-card);
  border: 1px solid var(--y-border-light);
  border-radius: var(--y-radius-lg);
  text-align: center;
}

.state-text {
  font-size: var(--y-font-body);
  color: var(--y-text-secondary);
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
  margin: 0 0 6px;
  font-size: var(--y-font-body);
  color: var(--y-text-tertiary);
}

.pending-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--y-border-light);
  border-radius: var(--y-radius-lg);
  overflow: hidden;
  background: var(--y-bg-card);
  box-shadow: var(--y-shadow-card);
}

.pending-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--y-border-light);
  transition: background-color 0.12s ease;
}

.pending-row:last-child {
  border-bottom: none;
}

.pending-row:hover {
  background: var(--y-bg-hover);
}

.pending-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.pending-word {
  font-size: 16px;
  font-weight: 600;
  color: var(--y-text-primary);
}

.pending-date {
  font-size: var(--y-font-aux);
  color: var(--y-text-tertiary);
}

.pending-actions {
  display: flex;
  gap: 6px;
  flex: 0 0 auto;
}
</style>
