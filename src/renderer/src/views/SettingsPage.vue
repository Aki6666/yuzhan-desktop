<script setup lang="ts">
/**
 * 设置页（F10 简版）：快捷键（自定义捕获）+ AI 模式 + 数据备份（userData JSON 导出）
 * - 快捷键（FIX-2，附录 B v0.1.3）：应用内快捷键（窗口聚焦时生效），默认「+」键；
 *   点击「自定义按键」进入捕获态 → 按新键/组合键 → 实时中文预览 → 自动保存
 *   settings.quickInputShortcut（parseAccelerator 兼容格式），保存后 renderer 立即生效；Esc 取消
 * - 备份：renderer 可及会话数据快照（设置/生词本/进度会话态）；全量备份为 v0.2 必补项
 *
 * U2 视觉重构：分组设置卡片，消费 U1 设计 token；data-testid 与行为不变。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { NButton, NCard, NInput, NSwitch, NTag } from 'naive-ui'
import { useSettingsStore } from '@renderer/stores/settings'
import { usePendingStore } from '@renderer/stores/pending'
import { useProgressStore } from '@renderer/stores/progress'
import { backupFileName, buildBackupPayload } from '@renderer/lib/backup'
import { DEFAULT_SHORTCUT, acceleratorFromEvent, describeShortcut } from '@renderer/lib/quickRecord'

const settingsStore = useSettingsStore()
const pendingStore = usePendingStore()
const progressStore = useProgressStore()

const exporting = ref(false)
const exportedAt = ref<string | null>(null)
const exportError = ref<string | null>(null)

// ---------------------------------------------------------------------------
// AI 配置（v0.2，t23）：apiKey（safeStorage 加密）+ OpenAI 兼容端点/模型
// ---------------------------------------------------------------------------

const apiKeyInput = ref('')
const aiSaving = ref(false)
const aiMessage = ref<string | null>(null)
const aiError = ref<string | null>(null)
const aiBaseUrlInput = ref('')
const aiModelInput = ref('')

/** 当前 key 掩码（前 4 位 + ****；无 key 显示提示） */
const apiKeyMasked = computed(() => settingsStore.settings.apiKeyMasked ?? '')

async function saveAiConfig(): Promise<void> {
  aiSaving.value = true
  aiError.value = null
  aiMessage.value = null
  try {
    const patch: { apiKey?: string; aiBaseUrl?: string; aiModel?: string } = {}
    if (apiKeyInput.value.trim() !== '') {
      patch.apiKey = apiKeyInput.value.trim()
    }
    if (aiBaseUrlInput.value.trim() !== '') patch.aiBaseUrl = aiBaseUrlInput.value.trim()
    if (aiModelInput.value.trim() !== '') patch.aiModel = aiModelInput.value.trim()
    if (Object.keys(patch).length > 0) {
      await settingsStore.update(patch)
    }
    apiKeyInput.value = '' // 输入框清空（已保存；掩码区显示新掩码）
    aiMessage.value = 'AI 配置已保存（apiKey 经系统加密存储）'
  } catch (e) {
    aiError.value = String(e)
  } finally {
    aiSaving.value = false
  }
}

async function clearApiKey(): Promise<void> {
  aiSaving.value = true
  aiError.value = null
  aiMessage.value = null
  try {
    await settingsStore.setApiKey('')
    apiKeyInput.value = ''
    aiMessage.value = '已清除 API Key（AI 降级为纯本地/生词本）'
  } catch (e) {
    aiError.value = String(e)
  } finally {
    aiSaving.value = false
  }
}

onMounted(() => {
  void settingsStore.load().then(() => {
    aiBaseUrlInput.value = settingsStore.settings.aiBaseUrl ?? ''
    aiModelInput.value = settingsStore.settings.aiModel ?? ''
  })
  void pendingStore.load()
})

/** 当前键位中文描述（FIX-2 去英文：'Plus' → '+ / 等号 / 数字键盘加号'；自定义 → 如 'Ctrl + K'） */
const shortcutDisplay = computed(() => describeShortcut(settingsStore.settings.quickInputShortcut))
const isCustomShortcut = computed(
  () => settingsStore.settings.quickInputShortcut !== DEFAULT_SHORTCUT
)

// ---------------------------------------------------------------------------
// 自定义按键捕获（FIX-2）
// ---------------------------------------------------------------------------

const capturing = ref(false)
const capturePreview = ref<string | null>(null)

function onCaptureKey(e: KeyboardEvent): void {
  e.preventDefault()
  e.stopImmediatePropagation() // 阻止快速输入弹层等同一事件上的其他监听器
  if (e.key === 'Escape') {
    cancelCapture()
    return
  }
  const acc = acceleratorFromEvent(e)
  if (!acc) return // 单独修饰键/未知键：忽略，继续等待
  capturePreview.value = describeShortcut(acc)
  void saveCaptured(acc)
}

async function saveCaptured(acc: string): Promise<void> {
  await settingsStore.update({ quickInputShortcut: acc })
  cancelCapture()
}

function startCapture(): void {
  capturing.value = true
  capturePreview.value = null
  window.addEventListener('keydown', onCaptureKey, true)
}

function cancelCapture(): void {
  capturing.value = false
  capturePreview.value = null
  window.removeEventListener('keydown', onCaptureKey, true)
}

onBeforeUnmount(() => {
  if (capturing.value) window.removeEventListener('keydown', onCaptureKey, true)
})

function downloadJson(payload: unknown, fileName: string): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

async function handleExport(): Promise<void> {
  exporting.value = true
  exportError.value = null
  try {
    const payload = buildBackupPayload({
      name: 'yuzhan',
      version: '0.1.0',
      settings: settingsStore.settings,
      pending: pendingStore.items,
      progress: progressStore.progress
    })
    downloadJson(payload, backupFileName())
    exportedAt.value = new Date().toISOString()
  } catch (e) {
    exportError.value = String(e)
  } finally {
    exporting.value = false
  }
}

const aiModeTag = {
  disabled: { type: 'default', label: '未配置（纯本地模式）' },
  configured: { type: 'info', label: '已配置待自检' },
  online: { type: 'success', label: '可查询' },
  error: { type: 'error', label: '异常（降级本地）' }
} as const
</script>

<template>
  <section class="view settings-page" data-testid="settings-page">
    <header class="page-header">
      <div class="page-heading">
        <h1 class="page-title">
          <span class="page-eyebrow" aria-hidden="true" />
          设置
        </h1>
        <p class="page-sub">快捷键与数据</p>
      </div>
    </header>

    <!-- 快捷键（FIX-2：当前键位 + 自定义按键捕获器） -->
    <NCard class="card" data-testid="card-shortcut">
      <template #header>
        <div class="card-header">
          <span class="card-title">快捷键</span>
          <NTag size="small" :bordered="false" round>快速输入</NTag>
        </div>
      </template>
      <div class="row">
        <span class="row-label">快速记录（快速输入弹层）</span>
        <div class="shortcut-tags">
          <NTag size="small" type="primary" round data-testid="shortcut-tag">
            {{ shortcutDisplay }}
          </NTag>
          <NTag v-if="isCustomShortcut" size="small" round>自定义</NTag>
        </div>
      </div>
      <div class="capture-row">
        <NButton
          size="small"
          :type="capturing ? 'primary' : 'default'"
          :secondary="!capturing"
          data-testid="shortcut-capture"
          @click="startCapture"
        >
          {{ capturing ? '请按键…（Esc 取消）' : '自定义按键' }}
        </NButton>
        <span v-if="capturing" class="capture-preview" data-testid="capture-preview">
          {{ capturePreview ? `已捕获：${capturePreview}` : '按下新的按键或组合键' }}
        </span>
      </div>
      <p class="muted">
        默认「+」键（主键盘 + / 等号键 / 数字键盘加号）唤起快速记录；点击「自定义按键」后按下新的
        按键或组合键即生效（保存后立即应用），Esc 取消；Esc 关闭弹层、回车直接记录。
      </p>
    </NCard>

    <!-- 外观（v0.2.6 迭代，§16.3 P0-③ 暗色模式） -->
    <NCard class="card" data-testid="card-theme">
      <template #header>
        <div class="card-header">
          <span class="card-title">外观</span>
          <NTag size="small" :bordered="false" round>主题</NTag>
        </div>
      </template>
      <div class="row">
        <span class="row-label">深色模式</span>
        <NSwitch
          :value="settingsStore.settings.theme === 'dark'"
          size="small"
          data-testid="theme-switch"
          @update:value="(v: boolean) => settingsStore.setTheme(v ? 'dark' : 'light')"
        />
      </div>
      <p class="muted">
        暗色「暖墨夜」主题：深墨灰底 + 纸白文字，保留纸感不刺眼，适合晚间刷题复习；
        选择即时生效并持久化（config.json）。
      </p>
    </NCard>

    <!-- AI 模式（v0.2：四态 + apiKey 配置 + OpenAI 兼容端点/模型） -->
    <NCard class="card" data-testid="card-aimode">
      <template #header>
        <div class="card-header">
          <span class="card-title">AI 模式</span>
          <NTag size="small" :bordered="false" round>v0.2</NTag>
        </div>
      </template>
      <div class="row">
        <span class="row-label">AI 查询模式</span>
        <NTag size="small" :type="aiModeTag[settingsStore.settings.aiMode].type" round data-testid="aimode-tag">
          {{ aiModeTag[settingsStore.settings.aiMode].label }}
        </NTag>
      </div>

      <div class="ai-field" data-testid="ai-key-field">
        <span class="row-label">API Key</span>
        <div class="ai-input-row">
          <NInput
            v-model:value="apiKeyInput"
            type="password"
            show-password-on="click"
            size="small"
            :placeholder="apiKeyMasked ? `已配置：${apiKeyMasked}（输入新值替换，留空不修改）` : 'sk-…（未配置）'"
            data-testid="ai-key-input"
          />
          <NButton size="small" type="primary" :loading="aiSaving" data-testid="ai-save" @click="saveAiConfig">
            保存
          </NButton>
          <NButton
            v-if="settingsStore.settings.hasApiKey"
            size="small"
            secondary
            data-testid="ai-key-clear"
            @click="clearApiKey"
          >
            清除
          </NButton>
        </div>
      </div>

      <div class="ai-field" data-testid="ai-endpoint-field">
        <span class="row-label">API 端点（OpenAI 兼容）</span>
        <NInput v-model:value="aiBaseUrlInput" size="small" placeholder="https://api.deepseek.com" data-testid="ai-baseurl-input" />
      </div>
      <div class="ai-field" data-testid="ai-model-field">
        <span class="row-label">模型名</span>
        <NInput v-model:value="aiModelInput" size="small" placeholder="deepseek-v4-flash" data-testid="ai-model-input" />
      </div>
      <div class="ai-field" data-testid="ai-fastmode-field">
        <span class="row-label">快速模式</span>
        <NSwitch
          :value="settingsStore.settings.aiFastMode !== false"
          size="small"
          data-testid="ai-fastmode-switch"
          @update:value="(v: boolean) => settingsStore.setAiFastMode(v)"
        />
        <span class="muted">开启后查询跳过模型思考阶段（thinking:disabled），成语释义查询速度更快；如需更深入的分析可关闭</span>
      </div>

      <p v-if="aiMessage" class="success" data-testid="ai-message">{{ aiMessage }}</p>
      <p v-if="aiError" class="error" data-testid="ai-error">{{ aiError }}</p>
      <p class="muted">
        apiKey 经系统加密存储（Windows DPAPI）；解密失败视为未配置（降级纯本地，不崩不丢数据）。
        无 key/断网时本地功能完整可用（AC-02）；未命中词条降级存入生词本。
      </p>
    </NCard>

    <!-- 数据备份 -->
    <NCard class="card" data-testid="card-backup">
      <template #header>
        <div class="card-header">
          <span class="card-title">数据备份</span>
          <NTag size="small" :bordered="false" round>JSON 导出</NTag>
        </div>
      </template>
      <div class="row">
        <NButton
          type="primary"
          size="small"
          :loading="exporting"
          data-testid="export-button"
          @click="handleExport"
        >
          导出 JSON 备份
        </NButton>
        <span v-if="exportedAt" class="muted" data-testid="exported-at">
          已导出于 {{ exportedAt.slice(0, 19).replace('T', ' ') }}
        </span>
      </div>
      <p v-if="exportError" class="error" data-testid="export-error">{{ exportError }}</p>
      <p class="muted">
        v0.1 简版：导出设置 + 生词本 + 进度（会话数据快照）。全量 userData 备份（含重启前完整
        progress.json）记录为 v0.2 必补项（§11.4 检查单 6）。
      </p>
    </NCard>
  </section>
</template>

<style scoped>
.settings-page {
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

.card {
  background: var(--y-bg-card);
  border: 1px solid var(--y-border-light);
  border-radius: var(--y-radius-lg);
  box-shadow: var(--y-shadow-card);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--y-text-primary);
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.row-label {
  font-size: var(--y-font-body);
  color: var(--y-text-body);
}

.shortcut-tags {
  display: flex;
  align-items: center;
  gap: 6px;
}

.capture-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 4px 0 8px;
}

.capture-preview {
  font-size: var(--y-font-aux);
  color: var(--y-text-secondary);
}

.muted {
  color: var(--y-text-tertiary);
  font-size: var(--y-font-aux);
  margin: 4px 0 0;
  line-height: 1.6;
}

.ai-field {
  margin: 10px 0;
}

.ai-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}

.success {
  color: var(--y-primary);
  font-size: 13px;
  margin: 4px 0 0;
}

.error {
  color: var(--y-danger);
  font-size: 13px;
  margin: 4px 0 0;
}
</style>
