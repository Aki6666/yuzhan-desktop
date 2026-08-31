/**
 * idioms store（PLAN.md §4.3）：正式库词条 + 内存检索索引 + 列表过滤状态
 * - 启动一次性 data:list 全量加载（§10.4 策略：过滤/搜索在 renderer 内存完成）
 * - 检索/索引逻辑在 shared/lib/search.ts（纯函数，可单测，T4–T8 只消费不重写）
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { Idiom } from '@shared/ipc/contracts'
import { createSearchIndex, search, type SearchIndex } from '@shared/lib/search'

export const useIdiomsStore = defineStore('idioms', () => {
  const items = ref<Idiom[]>([])
  const version = ref('0.0.0')
  const loaded = ref(false)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // 列表过滤状态（§4.3）：关键字 / 频次分档 / 首字
  const keyword = ref('')
  const frequencyFilter = ref<number | null>(null)
  const firstCharFilter = ref<string | null>(null)

  let index: SearchIndex | null = null

  async function load(): Promise<void> {
    if (loaded.value || loading.value) return
    loading.value = true
    error.value = null
    try {
      const res = await window.api.data.list()
      if (res.ok) {
        items.value = res.data.items
        version.value = res.data.version
        index = createSearchIndex(res.data.items)
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

  /** 过滤后的列表：关键字走内存检索（优先级排序），再叠加频次/首字过滤 */
  const filtered = computed<Idiom[]>(() => {
    let list: Idiom[]
    const kw = keyword.value.trim()
    if (kw) {
      const idx = index ?? createSearchIndex(items.value)
      list = search(idx, kw)
    } else {
      list = items.value
    }
    if (frequencyFilter.value !== null) {
      const f = frequencyFilter.value
      list = list.filter((i) => i.frequency === f)
    }
    if (firstCharFilter.value) {
      const c = firstCharFilter.value
      list = list.filter((i) => i.word.startsWith(c))
    }
    return list
  })

  function byId(id: string): Idiom | undefined {
    return items.value.find((i) => i.id === id)
  }

  function resetFilters(): void {
    keyword.value = ''
    frequencyFilter.value = null
    firstCharFilter.value = null
  }

  return {
    items,
    version,
    loaded,
    loading,
    error,
    keyword,
    frequencyFilter,
    firstCharFilter,
    filtered,
    load,
    byId,
    resetFilters
  }
})
