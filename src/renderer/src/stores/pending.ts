/**
 * pending store（PLAN.md §4.3）：生词本（未命中词条暂存队列，§5.6 userData/pending.json）
 * 即时写：add/remove 直接走 pending:add / pending:remove（main 串行写队列兜底）
 */
import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { PendingItem } from '@shared/ipc/contracts'

export const usePendingStore = defineStore('pending', () => {
  const items = ref<PendingItem[]>([])
  const loaded = ref(false)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function load(): Promise<void> {
    if (loaded.value || loading.value) return
    loading.value = true
    error.value = null
    try {
      const res = await window.api.pending.list()
      if (res.ok) {
        items.value = res.data
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

  /** 入生词本（即时写；重复词幂等） */
  async function add(word: string): Promise<boolean> {
    const trimmed = word.trim()
    if (!trimmed) return false
    if (items.value.some((p) => p.word === trimmed)) return true
    const res = await window.api.pending.add(trimmed)
    if (res.ok) {
      items.value = [...items.value, { word: trimmed, addedAt: new Date().toISOString() }]
      return true
    }
    error.value = res.error.message
    return false
  }

  /** 删除生词（即时写） */
  async function remove(word: string): Promise<boolean> {
    const res = await window.api.pending.remove(word)
    if (res.ok) {
      items.value = items.value.filter((p) => p.word !== word.trim())
      return true
    }
    error.value = res.error.message
    return false
  }

  function has(word: string): boolean {
    return items.value.some((p) => p.word === word.trim())
  }

  return { items, loaded, loading, error, load, add, remove, has }
})
