/**
 * settings store（PLAN.md §4.3）：应用设置（AI key 掩码、快捷键）
 * 读写走 settings:get / settings:set（§10.4）；v0.1 简版（快捷键说明、数据备份入口，F10）
 *
 * FIX-2（附录 B v0.1.3）：
 * - 默认快捷键改为「+」键（DEFAULT_SHORTCUT='Plus'，见 quickRecord.ts），移除 Ctrl+K 硬编码默认
 * - 加载时把旧版默认 'CommandOrControl+K' 迁移为 'Plus'（旧配置/主进程默认值兜底），
 *   用户自定义值（如 'Control+K'）原样保留
 */
import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { AiMode, AppSettings, SettingsSetRequest } from '@shared/ipc/contracts'
import { DEFAULT_SHORTCUT } from '@renderer/lib/quickRecord'

/** 旧版本默认（v0.1.2 及之前）：Ctrl+K；加载时迁移为 DEFAULT_SHORTCUT */
const LEGACY_DEFAULT_SHORTCUT = 'CommandOrControl+K'

const DEFAULT_SETTINGS: AppSettings = {
  schemaVersion: 1,
  aiMode: 'disabled',
  quickInputShortcut: DEFAULT_SHORTCUT
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AppSettings>({ ...DEFAULT_SETTINGS })
  const loaded = ref(false)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function load(): Promise<void> {
    if (loaded.value || loading.value) return
    loading.value = true
    error.value = null
    try {
      const res = await window.api.settings.get()
      if (res.ok) {
        const data = res.data
        settings.value = {
          ...data,
          // 旧版默认 'CommandOrControl+K' → 迁移为「+」键（FIX-2 不再默认触发 Ctrl+K）
          quickInputShortcut:
            data.quickInputShortcut === LEGACY_DEFAULT_SHORTCUT ? DEFAULT_SHORTCUT : data.quickInputShortcut
        }
        loaded.value = true
      } else {
        error.value = res.error.message
      }
    } catch (e) {
      error.value = String(e)
    } finally {
      loading.value = false
    }
  }

  /** 更新设置（patch 白名单字段）；返回最新设置 */
  async function update(patch: SettingsSetRequest): Promise<AppSettings | null> {
    const res = await window.api.settings.set(patch)
    if (res.ok) {
      settings.value = res.data
      return res.data
    }
    error.value = res.error.message
    return null
  }

  function setAiMode(mode: AiMode): Promise<AppSettings | null> {
    return update({ aiMode: mode })
  }

  return { settings, loaded, loading, error, load, update, setAiMode }
})
