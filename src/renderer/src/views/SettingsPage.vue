<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { NButton, NCard, NEmpty, NTag } from 'naive-ui'
import { useSettingsStore } from '@renderer/stores/settings'
import { usePendingStore } from '@renderer/stores/pending'
import { useProgressStore } from '@renderer/stores/progress'
import { backupFileName, buildBackupPayload } from '@renderer/lib/backup'

/**
 * 设置页（F10 简版）：快捷键说明 + 数据备份（userData JSON 导出）
 * - 快捷键：v0.1 应用内快捷键为主（窗口聚焦时生效）；全局注册为增强，失败静默降级（§3.4/§10.2）
 * - 备份：renderer 可及会话数据快照（设置/生词本/进度会话态）；全量备份为 v0.2 必补项
 */
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
  <section class="view" data-testid="settings-page">
    <h1>设置</h1>

    <NCard title="快捷键" class="card" data-testid="card-shortcut">
      <div class="row">
        <span>快速记录（快速输入弹层）</span>
        <NTag size="small" type="primary" round data-testid="shortcut-tag">
          {{ settingsStore.settings.quickInputShortcut }}
        </NTag>
      </div>
      <p class="muted">
        v0.1 应用内快捷键为主（窗口聚焦时生效）；全局注册为增强，被占用/失败时静默降级（§3.4/§10.2）。
      </p>
    </NCard>

    <NCard title="AI 模式" class="card" data-testid="card-aimode">
      <div class="row">
        <span>AI 查询模式</span>
        <NTag size="small" :type="aiModeTag[settingsStore.settings.aiMode].type" round data-testid="aimode-tag">
          {{ aiModeTag[settingsStore.settings.aiMode].label }}
        </NTag>
      </div>
      <p class="muted">v0.1 无 AI 联网（AI 闭环 v0.2）；无 key/断网时本地功能完整可用（AC-02）。</p>
    </NCard>

    <NCard title="数据备份" class="card" data-testid="card-backup">
      <NEmpty
        v-if="exportedAt"
        description="备份已导出"
        :show-description="false"
        class="exported-hint"
      />
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
.card {
  margin-bottom: 16px;
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.muted {
  color: #999;
  font-size: 12px;
  margin: 4px 0;
}

.error {
  color: #d03050;
  font-size: 13px;
}

.exported-hint {
  margin-bottom: 8px;
}
</style>
