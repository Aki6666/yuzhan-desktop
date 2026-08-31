<script setup lang="ts">
/**
 * 生词本页（PLAN.md §3.3 生词本 / F7 / AC-04）
 * - 列表 + 手动删除 + 「立即复习」（命中库内词 → progress 记录 + 跳转详情；未收录 → 提示）
 * - 空态引导：刷题遇到生词，Ctrl+K 记下来（§3.3）
 * - 数据走 pending store（T3：userData/pending.json 即时写）与 progress store（T3）
 *
 * V2-H 批量 AI 补全（v0.2，§3.3 生词本「批量 AI 补全」）：
 * - 「批量 AI 补全」入口：遍历 pending 逐词调 ai:searchWord（V2-C）→ 结果预览
 *   （draft 概览 / 失败原因）→ 逐条「确认入库 / 跳过」→ 确认写个人库（V2-F 机制，quality=user）
 * - 进度反馈（当前 i/N、loading、取消）；无 key（aiMode=disabled）/ AI 异常（error）时入口禁用并提示配置
 * - 纯逻辑在 lib/batchFill.ts（依赖注入，可单测）；本组件只做接线与渲染
 *
 * U2 视觉重构：消费 U1 设计 token；data-testid、文案与既有行为保持不变。
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NSpin, NTag } from 'naive-ui'
import { useIdiomsStore } from '@renderer/stores/idioms'
import { usePendingStore } from '@renderer/stores/pending'
import { useProgressStore } from '@renderer/stores/progress'
import { useSettingsStore } from '@renderer/stores/settings'
import { createBatchFill, type BatchFillController, type BatchItem } from '@renderer/lib/batchFill'
import { addPersonalItem, aiEnabled, aiModeLabel, buildPersonalIdiom, findPersonal, formatAddedAt } from '@renderer/lib/quickRecord'
import type { AiDraftResult } from '@shared/ipc/contracts'

const router = useRouter()
const pendingStore = usePendingStore()
const idiomsStore = useIdiomsStore()
const progressStore = useProgressStore()
const settingsStore = useSettingsStore()

const hint = ref<string | null>(null)

onMounted(() => {
  void pendingStore.load()
  void idiomsStore.load()
  void settingsStore.load()
})

const count = computed(() => pendingStore.items.length)

/** AI 可用性（§10.2 aiMode 四态；与 V2-F 快速输入共用 quickRecord.aiEnabled 判定） */
const aiReady = computed(() => aiEnabled(settingsStore.settings.aiMode))

const aiHintText = computed(() => `AI 模式「${aiModeLabel(settingsStore.settings.aiMode)}」不可用，请到设置页配置后重试`)

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

function goSettings(): void {
  void router.push('/settings')
}

// ---------------------------------------------------------------------------
// 批量 AI 补全（V2-H）
// ---------------------------------------------------------------------------

const batch = ref<BatchFillController | null>(null)
/** 渲染触发：batchFill 控制器为纯逻辑（非响应式），每次状态变更经 onChange 自增刷新 */
const refresh = ref(0)
const savingWord = ref<string | null>(null)

/** 模板依赖：读取 refresh 建立响应式依赖，onChange 自增后强制重渲染读取最新状态 */
const batchView = computed<BatchFillController | null>(() => {
  void refresh.value
  return batch.value
})

const batchRunning = computed(() => batchView.value?.running() ?? false)

/**
 * 确认后的个人库写入（与 V2-F 快速输入确认流程完全一致，§10.1③ / quickRecord 个人库最小实现）：
 * buildPersonalIdiom（quality=user / library=user，id=词形slug+序号）→ addPersonalItem（会话内注册表，按词形去重）
 * → progressStore.recordAttempt（新建进度记录 → 闪卡队列）→ 强制 flush（§10.3#6 持久化）。
 * 注：userData 个人库文件落盘 + 对应 IPC channel 为 v0.2 记录项（附录 B，需 main 侧实现，超出本任务 inScope）。
 */
async function saveUserDraft(word: string, draft: AiDraftResult): Promise<boolean> {
  if (findPersonal(word)) return true // 已收录 → 去重视为成功
  const idiom = buildPersonalIdiom(draft)
  if (!addPersonalItem(idiom)) return false
  progressStore.recordAttempt(idiom.id) // 加入闪卡队列（与 V2-F 一致）
  await progressStore.flush()
  return true
}

function startBatch(): void {
  hint.value = null
  const words = pendingStore.items.map((p) => p.word)
  if (words.length === 0 || !aiReady.value || batchRunning.value) return
  const c = createBatchFill(words, {
    queryWord: async (word, seq) => {
      try {
        // seq 作 requestId 前缀：stale 防护（§10.2）
        const res = await window.api.ai.searchWord(word, `batch-${seq}-${Date.now()}`)
        if (res.ok) return { ok: true, draft: res.data.draft }
        return { ok: false, reason: res.error.message }
      } catch (e) {
        return { ok: false, reason: String(e) }
      }
    },
    saveDraft: saveUserDraft,
    onChange: () => {
      refresh.value++
    }
  })
  batch.value = c
  void c.run()
}

async function confirmItem(word: string): Promise<void> {
  if (savingWord.value) return
  savingWord.value = word
  try {
    const ok = (await batch.value?.confirm(word)) ?? false
    if (ok) await pendingStore.remove(word) // 已入个人库 → 移出生词本（即时写）
  } finally {
    savingWord.value = null
  }
}

function skipItem(word: string): void {
  batch.value?.skip(word)
}

function cancelBatch(): void {
  batch.value?.cancel()
}

function dismissBatch(): void {
  batch.value = null
  refresh.value++
}

function statusLabel(item: BatchItem): string {
  switch (item.status) {
    case 'ready':
      return '待确认'
    case 'failed':
      return '查询失败'
    case 'saved':
      return '已入库'
    case 'skipped':
      return '已跳过'
    case 'querying':
      return '查询中…'
    default:
      return '等待中'
  }
}
</script>

<template>
  <section class="view pending-page">
    <header class="page-header">
      <div class="page-heading">
        <h1 class="page-title">生词本</h1>
        <p class="page-sub">刷题遇到的未收录生词 · 可立即复习、删除或批量 AI 补全</p>
      </div>
      <div class="page-header-actions">
        <span class="result-count" data-testid="pending-count">共 {{ count }} 条</span>
        <NButton
          size="small"
          secondary
          type="primary"
          :disabled="!aiReady || count === 0 || batchRunning"
          data-testid="batch-fill-start"
          @click="startBatch"
        >
          批量 AI 补全
        </NButton>
      </div>
    </header>

    <div v-if="hint" class="hint-bar" data-testid="pending-hint">
      <NTag size="small" type="warning" :bordered="false">{{ hint }}</NTag>
    </div>

    <!-- AI 未就绪提示（§3.3：无 key/断网禁用并提示配置） -->
    <div v-if="!aiReady && count > 0 && !batchView" class="ai-hint" data-testid="batch-ai-hint">
      <NTag size="small" type="info" :bordered="false">{{ aiHintText }}，配置后可批量 AI 补全</NTag>
      <NButton size="tiny" quaternary data-testid="batch-goto-settings" @click="goSettings">去设置</NButton>
    </div>

    <!-- 批量 AI 补全面板 -->
    <div v-if="batchView" class="batch-panel" data-testid="batch-panel">
      <div class="batch-progress" data-testid="batch-progress">
        <template v-if="batchRunning">
          <NSpin size="small" />
          <span class="batch-progress-text" data-testid="batch-progress-text">
            正在查询第 {{ batchView.current() }}/{{ batchView.total() }} 词…
          </span>
          <NButton size="tiny" quaternary data-testid="batch-cancel" @click="cancelBatch">取消</NButton>
        </template>
        <template v-else>
          <span class="batch-progress-text" data-testid="batch-done-summary">
            已入库 {{ batchView.savedCount() }} · 失败 {{ batchView.failedCount() }} · 跳过 {{ batchView.skippedCount() }}
          </span>
          <NButton size="tiny" quaternary data-testid="batch-dismiss" @click="dismissBatch">关闭</NButton>
        </template>
      </div>

      <ul class="batch-list" data-testid="batch-list">
        <li
          v-for="item in batchView.items()"
          :key="item.word"
          class="batch-item"
          data-testid="batch-item"
          :data-word="item.word"
          :data-status="item.status"
        >
          <div class="batch-item-main">
            <span class="batch-item-word">{{ item.word }}</span>
            <span v-if="item.status === 'ready' && item.draft" class="batch-item-mean" data-testid="batch-mean">
              {{ item.draft.meaning }}
            </span>
            <span v-else-if="item.status === 'failed'" class="batch-item-err">{{ item.error }}</span>
            <span v-else-if="item.status === 'saved'" class="batch-item-state">已入库个人库</span>
            <span v-else-if="item.status === 'skipped'" class="batch-item-state">已跳过</span>
            <span v-else class="batch-item-queued">{{ statusLabel(item) }}</span>
          </div>
          <div class="batch-item-side">
            <span class="batch-item-status" data-testid="batch-status">{{ statusLabel(item) }}</span>
            <div v-if="item.status === 'ready'" class="batch-item-actions">
              <NButton
                size="tiny"
                type="primary"
                :loading="savingWord === item.word"
                data-testid="batch-confirm"
                @click="confirmItem(item.word)"
              >
                确认入库
              </NButton>
              <NButton size="tiny" secondary data-testid="batch-skip" @click="skipItem(item.word)">跳过</NButton>
            </div>
          </div>
        </li>
      </ul>
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

.page-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 2px;
}

.result-count {
  font-size: var(--y-font-aux);
  color: var(--y-text-secondary);
}

.hint-bar {
  display: flex;
}

.ai-hint {
  display: flex;
  align-items: center;
  gap: 6px;
}

.batch-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border: 1px solid var(--y-border-light);
  border-radius: var(--y-radius-lg);
  background: var(--y-bg-card);
  box-shadow: var(--y-shadow-card);
  padding: 12px 16px;
}

.batch-progress {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: var(--y-font-body);
  color: var(--y-text-secondary);
}

.batch-progress-text {
  flex: 1;
}

.batch-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 320px;
  overflow-y: auto;
}

.batch-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--y-border-light);
  border-radius: var(--y-radius-md);
  background: var(--y-bg-subtle);
}

.batch-item-main {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  flex: 1;
}

.batch-item-word {
  font-size: 15px;
  font-weight: 600;
  color: var(--y-text-primary);
}

.batch-item-mean {
  font-size: var(--y-font-aux);
  color: var(--y-text-secondary);
  line-height: var(--y-line-height-body);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.batch-item-err {
  font-size: var(--y-font-aux);
  color: var(--y-text-danger, #d03050);
}

.batch-item-state {
  font-size: var(--y-font-aux);
  color: var(--y-text-secondary);
}

.batch-item-queued {
  font-size: var(--y-font-aux);
  color: var(--y-text-tertiary);
}

.batch-item-side {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
}

.batch-item-status {
  font-size: var(--y-font-aux);
  color: var(--y-text-tertiary);
}

.batch-item-actions {
  display: flex;
  gap: 6px;
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
