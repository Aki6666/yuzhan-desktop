<script setup lang="ts">
/**
 * 设置页（F10 简版）：快捷键说明 + 数据备份（userData JSON 导出）
 * - 快捷键：v0.1 应用内快捷键为主（窗口聚焦时生效）；全局注册为增强，失败静默降级（§3.4/§10.2）
 * - 备份：renderer 可及会话数据快照（设置/生词本/进度会话态）；全量备份为 v0.2 必补项
 *
 * U2 视觉重构：分组设置卡片，消费 U1 设计 token；data-testid 与行为不变。
 */
import { onMounted, ref } from 'vue'
import { NButton, NCard, NTag } from 'naive-ui'
import { useSettingsStore } from '@renderer/stores/settings'
import { usePendingStore } from '@renderer/stores/pending'
import { useProgressStore } from '@renderer/stores/progress'
import { backupFileName, buildBackupPayload } from '@renderer/lib/backup'

const settingsStore = useSettingsStore()
const pendingStore = usePendingStore()
const progressStore = useProgressStore()

const exporting = ref(false)
const exportedAt = ref<string | null>(null)
const exportError = ref<string | null>(null)

onMounted(() => {
  void settingsStore.load()
  void pendingStore.load()
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
        <h1 class="page-title">设置</h1>
        <p class="page-sub">快捷键与数据</p>
      </div>
    </header>

    <!-- 快捷键 -->
    <NCard class="card" data-testid="card-shortcut">
      <template #header>
        <div class="card-header">
          <span class="card-title">快捷键</span>
          <NTag size="small" :bordered="false" round>快速输入</NTag>
        </div>
      </template>
      <div class="row">
        <span class="row-label">快速记录（快速输入弹层）</span>
        <NTag size="small" type="primary" round data-testid="shortcut-tag">
          {{ settingsStore.settings.quickInputShortcut }}
        </NTag>
      </div>
      <p class="muted">
        v0.1 应用内快捷键为主（窗口聚焦时生效）；全局注册为增强，被占用/失败时静默降级（§3.4/§10.2）。
      </p>
    </NCard>

    <!-- AI 模式 -->
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
      <p class="muted">v0.1 无 AI 联网（AI 闭环 v0.2）；无 key/断网时本地功能完整可用（AC-02）。</p>
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

.muted {
  color: var(--y-text-tertiary);
  font-size: var(--y-font-aux);
  margin: 4px 0 0;
  line-height: 1.6;
}

.error {
  color: var(--y-danger);
  font-size: 13px;
  margin: 4px 0 0;
}
</style>
