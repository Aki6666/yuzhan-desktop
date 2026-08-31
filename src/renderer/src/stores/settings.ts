/**
 * settings store（PLAN.md §4.3）：应用设置（AI key 掩码、快捷键）
 * 读写走 settings:get / settings:set（§10.4）；v0.1 简版（快捷键说明、数据备份入口，F10）
 *
 * FIX-2（附录 B v0.1.3）：
 * - 默认快捷键改为「+」键（DEFAULT_SHORTCUT='Plus'，见 quickRecord.ts），移除 Ctrl+K 硬编码默认
 * - 加载时把旧版默认 'CommandOrControl+K' 迁移为 'Plus'（旧配置/主进程默认值兜底），
 *   用户自定义值（如 'Control+K'）原样保留
 *
 * v0.2 AI 层（t23）：apiKey 配置（safeStorage 加密存储，main 侧）、OpenAI 兼容 baseURL/模型可配；
 * settings:get 派生 apiKeyMasked/hasApiKey 供 UI 掩码展示
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
  quickInputShortcut: DEFAULT_SHORTCUT,
  theme: 'light'
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

  /** 配置/清除 apiKey（main 侧 safeStorage 加密存储；空串/空白 = 清除） */
  function setApiKey(apiKey: string): Promise<AppSettings | null> {
    return update({ apiKey })
  }

  /** 配置 OpenAI 兼容端点与模型（v0.2 AI 层） */
  function setAiConfig(patch: { aiBaseUrl?: string; aiModel?: string }): Promise<AppSettings | null> {
    return update(patch)
  }

  /** 快速模式开关（关闭模型思考以提升查询速度，用户要求 #4） */
  function setAiFastMode(fast: boolean): Promise<AppSettings | null> {
    return update({ aiFastMode: fast })
  }

  /** 应用主题切换（v0.2.6 迭代，§16.3 P0-③ 暗色模式；持久化到 config.json） */
  function setTheme(theme: 'light' | 'dark'): Promise<AppSettings | null> {
    return update({ theme })
  }

  return { settings, loaded, loading, error, load, update, setAiMode, setApiKey, setAiConfig, setAiFastMode, setTheme }
})
