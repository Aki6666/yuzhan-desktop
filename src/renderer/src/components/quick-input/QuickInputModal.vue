<script setup lang="ts">
/**
 * 快速记录弹层（PLAN.md §10 / F7 / AC-03/04，§3.3 快速输入交互）
 * - 唤起快捷键（FIX-2，附录 B v0.1.3）：默认「+」键（+/=/数字键盘加号），可在设置页自定义
 *   （settings.quickInputShortcut，renderer 动态监听、保存即生效）；应用内 window keydown 为主，
 *   main 侧不注册 globalShortcut（FIX-1 根因：Windows 下会消费组合键）
 * - 自动聚焦、Esc 关闭；输入防抖 200ms 后本地检索（复用 shared/lib/search.ts）
 * - 命中：展示卡片 + 「复习一次 / 标记掌握」（progress store 记录闭环，节流写 + 强制 flush）
 * - 未命中（V2-F，§10.1 ②③）：aiMode 可用时 → AI 查询（ai:searchWord）→ 草稿预览确认面板
 *   （可编辑/混淆词勾选/缺字段标记/loading·超时·错误提示）→ 确认写个人库（会话内注册表 +
 *   progress 闪卡队列）；aiMode 未配置/异常 → v0.1 降级直接存入生词本；请求序号防 stale
 *
 * U3 视觉重构：输入框醒目、命中/未命中反馈精修、快捷键提示行；消费 U1 设计 token；
 * 焦点逻辑与 data-testid 全部不变（quick-input 测试依赖）
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NInput, NModal, NSelect, NSpin, NTag } from 'naive-ui'
import { useIdiomsStore } from '@renderer/stores/idioms'
import { usePendingStore } from '@renderer/stores/pending'
import { useProgressStore } from '@renderer/stores/progress'
import { useSettingsStore } from '@renderer/stores/settings'
import { useUserStore } from '@renderer/stores/user'
import { debounce } from '@renderer/lib/listFilters'
import type { SearchHit } from '@shared/lib/search'
import type { IpcErrorCode } from '@shared/ipc/contracts'
import {
  DEFAULT_SHORTCUT,
  QUICK_INPUT_DEBOUNCE_MS,
  aiEnabled,
  aiModeLabel,
  aiModeTagType,
  buildPersonalIdiom,
  clipboardToQuery,
  createQuickIndex,
  describeShortcut,
  draftMissingFields,
  eventMatchesAccelerator,
  firstHit,
  isPlusKey,
  pendingWordFromQuery,
  searchHits,
  tierLabel,
  type PersonalIdiomInput
} from '@renderer/lib/quickRecord'

const router = useRouter()
const idiomsStore = useIdiomsStore()
const pendingStore = usePendingStore()
const progressStore = useProgressStore()
const settingsStore = useSettingsStore()
const userStore = useUserStore()

const show = ref(false)
const query = ref('')
const hits = ref<SearchHit[]>([])
const feedback = ref<string | null>(null)
const lastAddedWord = ref<string | null>(null)

// 检索池 = 正式库 + 个人库（v0.2.6 P0-④：user store 响应式快照，重启加载后同样可检索命中）
const index = computed(() => createQuickIndex([...idiomsStore.items, ...userStore.items]))
const ready = computed(() => idiomsStore.loaded)
const shortcut = computed(() => settingsStore.settings.quickInputShortcut)
const aiMode = computed(() => settingsStore.settings.aiMode)

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
  resetAiState() // 新查询使在途 AI 结果失效并收起预览（防 stale）
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
// 唤起 / 关闭（§3.3 + FIX-1：Ctrl+K 或「+」键唤起、自动聚焦、Esc 关闭）
// ---------------------------------------------------------------------------

function onKeydown(e: KeyboardEvent): void {
  // 应用内快捷键：settings.quickInputShortcut（默认「+」= 'Plus'，可在设置页自定义）
  if (eventMatchesAccelerator(e, shortcut.value)) {
    e.preventDefault()
    toggle()
    return
  }
  // 默认「+」键兜底：+/=/Add/NumpadAdd 均可触发（排除 ctrl/alt/meta；shift 允许——主键盘 '+' 常需 Shift）
  if (shortcut.value === DEFAULT_SHORTCUT && isPlusKey(e) && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault()
    toggle()
    return
  }
  if (e.key === 'Escape' && show.value) close()
}

function toggle(): void {
  if (show.value) close()
  else open()
}

function open(): void {
  show.value = true
  focusInput()
  void fillFromClipboard()
}

/**
 * 剪贴板自动填充（v0.2.6 迭代，§16.3 P0-②）：
 * 唤起时若检索框为空且剪贴板为纯 2–8 汉字（如刷题时复制的成语），自动填入并触发检索。
 * 剪贴板不可读（无权限/异常）时静默忽略，不阻塞弹层。
 */
async function fillFromClipboard(): Promise<void> {
  if (query.value.trim()) return
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) return
    const text = await navigator.clipboard.readText()
    const q = clipboardToQuery(text)
    if (q) query.value = q
  } catch {
    /* 剪贴板读取失败：静默降级为手动输入 */
  }
}

function close(): void {
  show.value = false
}

function onUpdateShow(v: boolean): void {
  show.value = v
}

/**
 * 弹层打开后自动聚焦输入框（§3.3 自动聚焦）。
 * NModal 关闭 autoFocus（VFocusTrap 不再主动抢焦）与 trapFocus（禁用陷阱的 document
 * capture 焦点监听，jsdom 下 isFocusable 判定异常会回退聚焦容器 div），快速输入弹层
 * 无需焦点陷阱；聚焦完全由本组件以宏任务延迟 + 重试（最多 5×30ms）负责，
 * 确保输入框真正挂载后再聚焦，时序与 NModal 异步渲染解耦。
 */
function focusInput(): void {
  let attempts = 0
  const tryFocus = (): void => {
    const el = document.querySelector<HTMLInputElement>('[data-testid="quick-input"] input')
    if (el) {
      el.focus()
      return
    }
    if (++attempts < 5) setTimeout(tryFocus, 30)
  }
  setTimeout(tryFocus, 30)
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
  resetAiState()
}

function goDetail(id: string): void {
  close()
  void router.push(`/idioms/${id}`)
}

function goPending(): void {
  close()
  void router.push('/pending')
}

// ---------------------------------------------------------------------------
// v0.2 AI 查询闭环（V2-F，§10.1 ②③）：未命中 → ai:searchWord → 预览确认 → 写个人库
// ---------------------------------------------------------------------------

type AiState = 'idle' | 'loading' | 'ok' | 'error'

const aiState = ref<AiState>('idle')
const aiErrorText = ref<string | null>(null)
const aiFeedback = ref<string | null>(null)
/** 请求序号：新查询/取消自增，使在途响应失效（防 stale 覆盖，§10.2） */
const aiSeq = ref(0)
const draftForm = ref<PersonalIdiomInput | null>(null)
const draftMissing = ref<string[]>([])
const checkedNearWords = ref<string[]>([])

const EMOTION_OPTIONS = [
  { label: '褒', value: '褒' },
  { label: '贬', value: '贬' },
  { label: '中性', value: '中性' }
]
const REGISTER_OPTIONS = [
  { label: '谦辞', value: '谦辞' },
  { label: '敬辞', value: '敬辞' },
  { label: '无', value: '无' }
]
const FREQ_OPTIONS = [1, 2, 3, 4, 5].map((f) => ({ label: `${f} 档`, value: f }))

const draftErrorTypesText = computed<string>({
  get: () => (draftForm.value?.errorTypes ?? []).join('，'),
  set: (v: string) => {
    if (draftForm.value) {
      draftForm.value.errorTypes = v
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean)
    }
  }
})

function resetAiState(): void {
  aiSeq.value++
  aiState.value = 'idle'
  aiErrorText.value = null
  aiFeedback.value = null
  draftForm.value = null
  draftMissing.value = []
  checkedNearWords.value = []
}

function aiErrorMessage(code: IpcErrorCode): string {
  switch (code) {
    case 'NO_API_KEY':
      return '未配置 API Key（可降级为生词本，或到设置页配置）'
    case 'AI_TIMEOUT':
      return 'AI 查询超时，请重试'
    case 'RATE_LIMITED':
      return '查询过于频繁，请稍后再试'
    case 'AI_ERROR':
      return 'AI 查询失败，请重试'
    default:
      return 'AI 查询出错，请重试'
  }
}

/** AI 查询：ai:searchWord（V2-C）；requestId 随序号，防 stale */
async function queryAi(): Promise<void> {
  const word = query.value.trim()
  if (!word || !aiEnabled(aiMode.value)) return
  const seq = ++aiSeq.value
  aiState.value = 'loading'
  aiErrorText.value = null
  aiFeedback.value = null
  try {
    const res = await window.api.ai.searchWord(word, String(seq))
    if (seq !== aiSeq.value) return // stale：期间有新查询/取消
    if (res.ok) {
      const d = res.data.draft
      draftForm.value = {
        word: d.word?.trim() || word,
        meaning: d.meaning?.trim() ?? '',
        origin: d.origin,
        usage: d.usage,
        emotion: d.emotion ?? '中性',
        register: d.register ?? '无',
        errorTypes: Array.isArray(d.errorTypes) ? d.errorTypes : [],
        near: Array.isArray(d.near) ? d.near : [],
        opposite: d.opposite,
        examples: d.examples,
        frequency:
          typeof d.frequency === 'number' && d.frequency >= 1 && d.frequency <= 5 ? d.frequency : 3,
        tags: d.tags
      }
      draftMissing.value = draftMissingFields(d)
      checkedNearWords.value = (draftForm.value.near ?? []).map((n) => n.word)
      aiState.value = 'ok'
    } else {
      aiState.value = 'error'
      aiErrorText.value = aiErrorMessage(res.error.code)
    }
  } catch (e) {
    if (seq !== aiSeq.value) return
    aiState.value = 'error'
    aiErrorText.value = String(e)
  }
}

/** 取消（renderer 侧）：使在途响应失效并收起预览 */
function cancelAi(): void {
  resetAiState()
}

function toggleNear(word: string): void {
  const set = new Set(checkedNearWords.value)
  if (set.has(word)) set.delete(word)
  else set.add(word)
  checkedNearWords.value = [...set]
}

/** 混淆词候选是否已在库（正式库或个人库） */
function candidateInLibrary(word: string): boolean {
  return idiomsStore.items.some((i) => i.word === word)
}

/** 确认：写个人库（会话内注册表）+ 加入闪卡队列（progress 新建记录，节流写 + flush） */
async function confirmDraft(): Promise<void> {
  const form = draftForm.value
  if (!form) return
  if (!form.word.trim() || !form.meaning.trim()) {
    aiFeedback.value = '词形与释义为必填项，请补充后确认'
    return
  }
  const idiom = buildPersonalIdiom({
    ...form,
    near: (form.near ?? []).filter((n) => checkedNearWords.value.includes(n.word))
  })
  userStore.add(idiom)
  progressStore.recordAttempt(idiom.id) // 新建进度记录 → 闪卡队列（非 mastered）
  await progressStore.flush()
  aiFeedback.value = `已加入个人库并进入复习队列：${idiom.word}`
  aiState.value = 'idle'
  draftForm.value = null
  draftMissing.value = []
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  void idiomsStore.load()
  void pendingStore.load()
  void settingsStore.load()
  void userStore.load()
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
    :style="{ width: '560px', maxWidth: '92vw', borderRadius: 'var(--y-radius-xl)' }"
    :title="`快速记录 · ${describeShortcut(shortcut)}`"
    :bordered="false"
    :auto-focus="false"
    :trap-focus="false"
    @update:show="onUpdateShow"
  >
    <div class="quick-input" data-testid="quick-input-modal">
      <NInput
        v-model:value="query"
        clearable
        size="large"
        placeholder="搜索成语，回车记录"
        class="quick-input-field"
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
        <p class="state-text">命中已有词可复习；未命中自动进生词本。</p>
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

      <!-- 未命中（V2-F）：aiMode 可用 → AI 草稿预览确认；否则 v0.1 降级存入生词本 -->
      <div v-else-if="status === 'miss'" class="state miss-state" data-testid="quick-state-miss">
        <!-- AI 草稿预览确认面板 -->
        <template v-if="aiState === 'ok' && draftForm">
          <div class="draft-panel" data-testid="ai-draft-panel">
            <div class="draft-head">
              <span class="draft-title">AI 草稿确认</span>
              <NTag
                v-if="draftMissing.length > 0"
                size="small"
                type="warning"
                :bordered="false"
                data-testid="draft-missing"
              >
                缺字段：{{ draftMissing.join('、') }}
              </NTag>
            </div>

            <div class="draft-field">
              <label class="draft-label">词形</label>
              <NInput v-model:value="draftForm.word" size="small" data-testid="draft-word" />
            </div>
            <div class="draft-field">
              <label class="draft-label">释义</label>
              <NInput
                v-model:value="draftForm.meaning"
                size="small"
                type="textarea"
                :autosize="{ minRows: 2, maxRows: 4 }"
                data-testid="draft-meaning"
              />
            </div>
            <div class="draft-field">
              <label class="draft-label">适用</label>
              <NInput
                v-model:value="draftForm.usage"
                size="small"
                placeholder="可选"
                data-testid="draft-usage"
              />
            </div>
            <div class="draft-row">
              <div class="draft-field draft-half">
                <label class="draft-label">感情色彩</label>
                <NSelect
                  v-model:value="draftForm.emotion"
                  size="small"
                  :options="EMOTION_OPTIONS"
                  data-testid="draft-emotion"
                />
              </div>
              <div class="draft-field draft-half">
                <label class="draft-label">语域</label>
                <NSelect
                  v-model:value="draftForm.register"
                  size="small"
                  :options="REGISTER_OPTIONS"
                  data-testid="draft-register"
                />
              </div>
            </div>
            <div class="draft-field">
              <label class="draft-label">误用类型</label>
              <NInput
                v-model:value="draftErrorTypesText"
                size="small"
                placeholder="逗号分隔，如：望文生义, 褒贬误用"
                data-testid="draft-error-types"
              />
            </div>
            <div class="draft-field">
              <label class="draft-label">频次</label>
              <NSelect
                v-model:value="draftForm.frequency"
                size="small"
                :options="FREQ_OPTIONS"
                data-testid="draft-freq"
              />
            </div>

            <!-- 混淆词候选：逐条勾选（库内词标记 / 新词标候选草稿） -->
            <div v-if="draftForm.near && draftForm.near.length > 0" class="draft-field">
              <label class="draft-label">混淆词候选（勾选保留）</label>
              <div class="candidate-list">
                <label
                  v-for="n in draftForm.near"
                  :key="n.word"
                  class="candidate"
                  :data-testid="`candidate-${n.word}`"
                >
                  <input
                    type="checkbox"
                    :checked="checkedNearWords.includes(n.word)"
                    data-testid="candidate-check"
                    @change="toggleNear(n.word)"
                  />
                  <span class="candidate-word">{{ n.word }}</span>
                  <NTag v-if="candidateInLibrary(n.word)" size="small" type="info" :bordered="false">
                    库内
                  </NTag>
                  <NTag v-else size="small" :bordered="false" class="candidate-draft-tag">候选草稿</NTag>
                </label>
              </div>
            </div>

            <div class="draft-actions">
              <NButton size="small" type="primary" data-testid="draft-confirm" @click="confirmDraft">
                确认加入个人库
              </NButton>
              <NButton size="small" quaternary data-testid="draft-cancel" @click="cancelAi">取消</NButton>
            </div>
          </div>
        </template>

        <!-- 未命中默认面板：AI 查询成功反馈 / AI 模式状态 + 查询·降级动作 -->
        <template v-else>
          <div v-if="aiFeedback" class="feedback" data-testid="ai-feedback">
            <NTag size="small" type="success" :bordered="false">{{ aiFeedback }}</NTag>
            <NButton size="tiny" quaternary data-testid="continue-input" @click="clearQuery">继续输入</NButton>
          </div>

          <template v-else>
            <div class="miss-head">
              <p class="state-text">词库未收录「{{ query }}」</p>
              <NTag
                size="small"
                :type="aiModeTagType(aiMode)"
                :bordered="false"
                data-testid="ai-mode-tag"
              >
                {{ aiModeLabel(aiMode) }}
              </NTag>
            </div>

            <template v-if="aiState === 'loading'">
              <NSpin size="small" />
              <span class="state-text" data-testid="ai-loading">AI 查询中…</span>
              <NButton size="small" quaternary data-testid="ai-cancel" @click="cancelAi">取消</NButton>
            </template>
            <template v-else-if="aiState === 'error'">
              <span class="ai-error" data-testid="ai-error">{{ aiErrorText }}</span>
              <NButton size="small" data-testid="ai-retry" @click="queryAi">重试</NButton>
            </template>
            <template v-else>
              <div class="miss-actions">
                <NButton
                  v-if="aiEnabled(aiMode)"
                  size="small"
                  type="primary"
                  data-testid="action-ai-query"
                  @click="queryAi"
                >
                  AI 查询
                </NButton>
                <NButton size="small" secondary data-testid="action-add-pending" @click="addToPending">
                  存入生词本
                </NButton>
                <span class="hint">回车也可直接存入</span>
              </div>
            </template>
          </template>
        </template>
      </div>

      <!-- 操作反馈 -->
      <div v-if="feedback" class="feedback" data-testid="quick-feedback">
        <NTag size="small" type="success" :bordered="false">{{ feedback }}</NTag>
        <template v-if="lastAddedWord">
          <NButton size="tiny" quaternary data-testid="goto-pending" @click="goPending">查看生词本</NButton>
          <NButton size="tiny" quaternary data-testid="continue-input" @click="clearQuery">继续输入</NButton>
        </template>
      </div>

      <!-- 快捷键提示行（FIX-2：展示当前键位中文描述 · Esc 关闭 · 回车记录） -->
      <div class="shortcut-row">
        <span class="shortcut-item"><kbd>{{ describeShortcut(shortcut) }}</kbd> 唤起</span>
        <span class="shortcut-item"><kbd>Esc</kbd> 关闭</span>
        <span class="shortcut-item"><kbd>回车</kbd> 直接记录</span>
      </div>
    </div>
  </NModal>
</template>

<style scoped>
.quick-input {
  display: flex;
  flex-direction: column;
  gap: var(--y-space-md);
}

.quick-input-field {
  border-radius: var(--y-radius-md);
}

.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--y-space-md);
  padding: var(--y-space-lg) 0 var(--y-space-sm);
}

.state-text {
  margin: 0;
  font-size: var(--y-font-body);
  color: var(--y-text-secondary);
  text-align: center;
  line-height: var(--y-line-height-body);
}

.miss-state {
  padding: var(--y-space-lg);
  border: 1px dashed var(--y-border);
  border-radius: var(--y-radius-md);
  background: var(--y-bg-subtle);
}

.miss-actions {
  display: flex;
  align-items: center;
  gap: var(--y-space-md);
}

.hint {
  font-size: var(--y-font-aux);
  color: var(--y-text-tertiary);
}

.hit-card {
  border: 1px solid var(--y-border-light);
  border-left: 3px solid var(--y-primary);
  border-radius: var(--y-radius-md);
  padding: var(--y-space-lg) var(--y-space-lg);
  background: var(--y-bg-card);
  box-shadow: var(--y-shadow-card);
}

.hit-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--y-space-md);
}

.hit-head-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.hit-word {
  font-family: var(--y-font-serif);
  font-size: var(--y-font-title);
  font-weight: 700;
  color: var(--y-text-primary);
  letter-spacing: 2px;
}

.hit-pinyin {
  font-size: var(--y-font-aux);
  color: var(--y-text-secondary);
}

.hit-head-meta {
  display: flex;
  gap: var(--y-space-sm);
  flex: 0 0 auto;
}

.hit-meaning {
  margin: var(--y-space-md) 0 0;
  font-size: var(--y-font-body);
  line-height: var(--y-line-height-body);
  color: var(--y-text-body);
}

.hit-actions {
  display: flex;
  gap: var(--y-space-sm);
  margin-top: var(--y-space-md);
}

.feedback {
  display: flex;
  align-items: center;
  gap: var(--y-space-sm);
  flex-wrap: wrap;
  padding: var(--y-space-sm) var(--y-space-md);
  border: 1px solid var(--y-border-light);
  border-radius: var(--y-radius-sm);
  background: var(--y-bg-subtle);
}

.shortcut-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--y-space-lg);
  padding-top: var(--y-space-sm);
  border-top: 1px solid var(--y-border-light);
}

.shortcut-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--y-font-aux);
  color: var(--y-text-tertiary);
}

/* V2-F：未命中 AI 面板 */
.miss-head {
  display: flex;
  align-items: center;
  gap: var(--y-space-sm);
  flex-wrap: wrap;
  justify-content: center;
}

.ai-error {
  font-size: var(--y-font-body);
  color: var(--y-danger);
}

/* AI 草稿预览确认面板 */
.draft-panel {
  display: flex;
  flex-direction: column;
  gap: var(--y-space-md);
  width: 100%;
  text-align: left;
}

.draft-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--y-space-sm);
}

.draft-title {
  font-family: var(--y-font-serif);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 1px;
  color: var(--y-text-primary);
}

.draft-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.draft-row {
  display: flex;
  gap: var(--y-space-md);
}

.draft-half {
  flex: 1;
}

.draft-label {
  font-size: var(--y-font-aux);
  color: var(--y-text-tertiary);
}

.candidate-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.candidate {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid var(--y-border-light);
  border-radius: var(--y-radius-sm);
  background: var(--y-bg-subtle);
  cursor: pointer;
}

.candidate-word {
  font-family: var(--y-font-serif);
  font-size: var(--y-font-body);
  color: var(--y-text-body);
}

.candidate-draft-tag {
  color: var(--y-text-tertiary);
}

.draft-actions {
  display: flex;
  gap: var(--y-space-sm);
  margin-top: 2px;
}
</style>
