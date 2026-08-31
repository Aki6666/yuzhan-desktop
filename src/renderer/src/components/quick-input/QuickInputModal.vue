<script setup lang="ts">
/**
 * 快速记录弹层（PLAN.md §10 / F7 / AC-03/04，§3.3 快速输入交互）
 * - Ctrl+K 任意页面唤起（自注册 window keydown，应用内快捷键为主；globalShortcut 由 main 侧升级/降级）
 * - 自动聚焦、Esc 关闭；输入防抖 200ms 后本地检索（复用 shared/lib/search.ts）
 * - 命中：展示卡片 + 「复习一次 / 标记掌握」（progress store 记录闭环，节流写 + 强制 flush）
 * - 未命中：v0.1 存入生词本（pending store，即时写 userData/pending.json）
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NInput, NModal, NSpin, NTag } from 'naive-ui'
import { useIdiomsStore } from '@renderer/stores/idioms'
import { usePendingStore } from '@renderer/stores/pending'
import { useProgressStore } from '@renderer/stores/progress'
import { useSettingsStore } from '@renderer/stores/settings'
import { debounce } from '@renderer/lib/listFilters'
import type { SearchHit } from '@shared/lib/search'
import {
  QUICK_INPUT_DEBOUNCE_MS,
  createQuickIndex,
  eventMatchesAccelerator,
  firstHit,
  pendingWordFromQuery,
  searchHits,
  tierLabel
} from '@renderer/lib/quickRecord'

const router = useRouter()
const idiomsStore = useIdiomsStore()
const pendingStore = usePendingStore()
const progressStore = useProgressStore()
const settingsStore = useSettingsStore()

const show = ref(false)
const query = ref('')
const hits = ref<SearchHit[]>([])
const feedback = ref<string | null>(null)
const lastAddedWord = ref<string | null>(null)

const index = computed(() => createQuickIndex(idiomsStore.items))
const ready = computed(() => idiomsStore.loaded)
const shortcut = computed(() => settingsStore.settings.quickInputShortcut)

const applySearch = debounce((v: string) => {
  const q = v.trim()
  if (!q) {
    hits.value = []
    return
  }
  hits.value = searchHits(index.value, q)
}, QUICK_INPUT_DEBOUNCE_MS)

watch(query, (v) => {
  feedback.value = null
  applySearch(v)
})

// 词库异步加载完成后，对当前输入重新检索
watch(
  () => idiomsStore.items,
  () => {
    if (query.value.trim()) applySearch(query.value)
  }
)

type QuickStatus = 'loading' | 'idle' | 'hit' | 'miss'

const status = computed<QuickStatus>(() => {
  if (!ready.value) return 'loading'
  if (!query.value.trim()) return 'idle'
  return hits.value.length > 0 ? 'hit' : 'miss'
})

const activeHit = computed(() => firstHit(hits.value))
const activeProgress = computed(() =>
  activeHit.value ? progressStore.getProgressItem(activeHit.value.idiom.id) : undefined
)
const progressStatusTag = computed<{ type: 'default' | 'warning' | 'success'; label: string } | null>(() => {
  const st = activeProgress.value?.status
  if (st === 'learning') return { type: 'warning', label: '学习中' }
  if (st === 'mastered') return { type: 'success', label: '已掌握' }
  if (st === 'new') return { type: 'default', label: '新词' }
  return null
})

// ---------------------------------------------------------------------------
// 唤起 / 关闭（§3.3：Ctrl+K 唤起、自动聚焦、Esc 关闭）
// ---------------------------------------------------------------------------

function onKeydown(e: KeyboardEvent): void {
  if (eventMatchesAccelerator(e, shortcut.value)) {
    e.preventDefault()
    if (show.value) close()
    else open()
    return
  }
  if (e.key === 'Escape' && show.value) close()
}

function open(): void {
  show.value = true
  void focusInput()
}

function close(): void {
  show.value = false
}

function onUpdateShow(v: boolean): void {
  show.value = v
}

async function focusInput(): Promise<void> {
  await nextTick()
  await nextTick() // NModal 内容挂载后再聚焦
  document.querySelector<HTMLInputElement>('[data-testid="quick-input"] input')?.focus()
}

// ---------------------------------------------------------------------------
// 命中动作（AC-03 记录闭环）与未命中入本（AC-04）
// ---------------------------------------------------------------------------

async function reviewOnce(): Promise<void> {
  const hit = activeHit.value
  if (!hit) return
  progressStore.recordAttempt(hit.idiom.id)
  await progressStore.flush() // §10.3#6 会话动作后强制写盘，保证重启后进度仍在
  feedback.value = `已复习一次：${hit.idiom.word}`
}

async function markMastered(): Promise<void> {
  const hit = activeHit.value
  if (!hit) return
  progressStore.markStatus(hit.idiom.id, 'mastered')
  await progressStore.flush()
  feedback.value = `已标记掌握：${hit.idiom.word}`
}

async function addToPending(): Promise<void> {
  const word = pendingWordFromQuery(query.value)
  if (!word) return
  const ok = await pendingStore.add(word)
  if (ok) {
    feedback.value = `已存入生词本：${word}`
    lastAddedWord.value = word
  } else {
    feedback.value = pendingStore.error ?? '存入生词本失败'
  }
}

function onEnter(): void {
  if (status.value === 'miss') void addToPending()
}

function clearQuery(): void {
  query.value = ''
  lastAddedWord.value = null
}

function goDetail(id: string): void {
  close()
  void router.push(`/idioms/${id}`)
}

function goPending(): void {
  close()
  void router.push('/pending')
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  void idiomsStore.load()
  void pendingStore.load()
  void settingsStore.load()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})

defineExpose({ open, close, isOpen: () => show.value })
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    :style="{ width: '560px', maxWidth: '92vw' }"
    :title="`快速记录 ${shortcut}`"
    :bordered="false"
    @update:show="onUpdateShow"
  >
    <div class="quick-input" data-testid="quick-input-modal">
      <NInput
        v-model:value="query"
        clearable
        autofocus
        placeholder="输入成语 / 拼音 / 首字母，如：jgj、鞠躬尽瘁，回车记录"
        data-testid="quick-input"
        @keydown.enter.prevent="onEnter"
      />

      <!-- 词库加载中 -->
      <div v-if="status === 'loading'" class="state" data-testid="quick-state-loading">
        <NSpin size="small" />
        <span class="state-text">词库加载中…</span>
      </div>

      <!-- 初始提示 -->
      <div v-else-if="status === 'idle'" class="state" data-testid="quick-state-idle">
        <p class="state-text">
          输入成语 / 拼音 / 首字母：命中已有词可直接「复习一次 / 标记掌握」；未命中可存入生词本。
        </p>
      </div>

      <!-- 命中卡片（记录闭环，不重复建卡，§10.1） -->
      <div v-else-if="status === 'hit' && activeHit" class="hit-card" data-testid="quick-hit-card">
        <header class="hit-head">
          <div class="hit-head-main">
            <span class="hit-word">{{ activeHit.idiom.word }}</span>
            <span class="hit-pinyin">{{ activeHit.idiom.pinyin }}</span>
          </div>
          <div class="hit-head-meta">
            <NTag size="small" type="info" :bordered="false" data-testid="hit-tier">
              {{ tierLabel(activeHit.tier) }}
            </NTag>
            <NTag
              v-if="progressStatusTag"
              size="small"
              :type="progressStatusTag.type"
              :bordered="false"
              data-testid="hit-progress-status"
            >
              {{ progressStatusTag.label }}
            </NTag>
          </div>
        </header>
        <p class="hit-meaning">{{ activeHit.idiom.meaning }}</p>
        <div class="hit-actions">
          <NButton size="small" type="primary" data-testid="action-review" @click="reviewOnce">
            复习一次
          </NButton>
          <NButton size="small" secondary data-testid="action-master" @click="markMastered">
            标记掌握
          </NButton>
          <NButton size="small" quaternary data-testid="action-detail" @click="goDetail(activeHit.idiom.id)">
            查看详情
          </NButton>
        </div>
      </div>

      <!-- 未命中：v0.1 直接入生词本（AI 查询 v0.2） -->
      <div v-else-if="status === 'miss'" class="state" data-testid="quick-state-miss">
        <p class="state-text">词库未收录「{{ query }}」（AI 查询 v0.2 提供）</p>
        <div class="miss-actions">
          <NButton size="small" type="primary" data-testid="action-add-pending" @click="addToPending">
            存入生词本
          </NButton>
          <span class="hint">回车也可直接存入</span>
        </div>
      </div>

      <!-- 操作反馈 -->
      <div v-if="feedback" class="feedback" data-testid="quick-feedback">
        <NTag size="small" type="success" :bordered="false">{{ feedback }}</NTag>
        <template v-if="lastAddedWord">
          <NButton size="tiny" quaternary data-testid="goto-pending" @click="goPending">查看生词本</NButton>
          <NButton size="tiny" quaternary data-testid="continue-input" @click="clearQuery">继续输入</NButton>
        </template>
      </div>
    </div>
  </NModal>
</template>

<style scoped>
.quick-input {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 18px 0 6px;
}

.state-text {
  margin: 0;
  font-size: 13px;
  color: #7a8699;
  text-align: center;
  line-height: 1.7;
}

.miss-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.hint {
  font-size: 12px;
  color: #b0b8c4;
}

.hit-card {
  border: 1px solid #e3e6ea;
  border-radius: 10px;
  padding: 14px 16px;
  background: #fafbfc;
}

.hit-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.hit-head-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.hit-word {
  font-size: 22px;
  font-weight: 700;
  color: #1f2d3d;
  letter-spacing: 1px;
}

.hit-pinyin {
  font-size: 12px;
  color: #7a8699;
}

.hit-head-meta {
  display: flex;
  gap: 6px;
  flex: 0 0 auto;
}

.hit-meaning {
  margin: 10px 0 0;
  font-size: 14px;
  line-height: 1.7;
  color: #333;
}

.hit-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.feedback {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
</style>
