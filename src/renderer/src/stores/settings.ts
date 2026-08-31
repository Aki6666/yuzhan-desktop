/**
 * settings store（PLAN.md §4.3）：应用设置（AI key 掩码、快捷键）
 * 读写走 settings:get / settings:set（§10.4）；v0.1 简版（快捷键说明、数据备份入口，F10）
 */
import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { AiMode, AppSettings, SettingsSetRequest } from '@shared/ipc/contracts'

const DEFAULT_SETTINGS: AppSettings = {
  schemaVersion: 1,
  aiMode: 'disabled',
  quickInputShortcut: 'CommandOrControl+K'
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
        settings.value = res.data
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
