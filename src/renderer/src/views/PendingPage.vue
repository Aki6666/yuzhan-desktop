<script setup lang="ts">
/**
 * 生词本页（PLAN.md §3.3 生词本 / F7 / AC-04）
 * - 列表 + 手动删除 + 「立即复习」（命中库内词 → progress 记录 + 跳转详情；未收录 → 提示）
 * - 空态引导：刷题遇到生词，Ctrl+K 记下来（§3.3）
 * - 数据走 pending store（T3：userData/pending.json 即时写）与 progress store（T3）
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NEmpty, NSpin, NTag } from 'naive-ui'
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
      <h1 class="page-title">生词本</h1>
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

    <!-- 空态引导（§3.3） -->
    <div v-else-if="count === 0" class="list-state" data-testid="pending-empty">
      <NEmpty description="刷题遇到生词，Ctrl+K 记下来">
        <template #extra>
          <NButton size="small" type="primary" data-testid="goto-browse" @click="goBrowse">
            去成语库浏览
          </NButton>
        </template>
      </NEmpty>
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
  gap: 12px;
  max-width: 720px;
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

.hint-bar {
  display: flex;
}

.list-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 240px;
}

.state-text {
  font-size: 13px;
  color: #999;
}

.pending-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid #ececec;
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
}

.pending-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid #f2f2f2;
}

.pending-row:last-child {
  border-bottom: none;
}

.pending-row:hover {
  background: #f7f9fc;
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
  color: #2c3e50;
}

.pending-date {
  font-size: 12px;
  color: #9aa4b2;
}

.pending-actions {
  display: flex;
  gap: 6px;
  flex: 0 0 auto;
}
</style>
