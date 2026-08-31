/**
 * idioms store（PLAN.md §4.3）：正式库词条 + 内存检索索引 + 列表过滤状态
 * - 启动一次性 data:list 全量加载（§10.4 策略：过滤/搜索在 renderer 内存完成）
 * - 检索/索引逻辑在 shared/lib/search.ts（纯函数，可单测，T4–T8 只消费不重写）
 */
import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type { Idiom } from '@shared/ipc/contracts'
import {
  createSearchIndex,
  createSearchIndexFromCache,
  search,
  type SearchCacheWord,
  type SearchIndex
} from '@shared/lib/search'

export const useIdiomsStore = defineStore('idioms', () => {
  // 性能（用户要求 #2）：词条为只读数据，用 shallowRef 避免 Vue 深响应式代理
  // 2600+ 对象（赋值/遍历/排序的代理开销是卡顿来源之一）
  const items = shallowRef<Idiom[]>([])
  const version = ref('0.0.0')
  const loaded = ref(false)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // 列表过滤状态（§4.3）：关键字 / 频次分档 / 首字
  const keyword = ref('')
  const frequencyFilter = ref<number | null>(null)
  const firstCharFilter = ref<string | null>(null)

  // 列表排序（用户要求 #3）：默认按频次档降序、同档按真题出现次数降序；可切换方向或按拼音
  type SortMode = 'frequency' | 'pinyin'
  const sortMode = ref<SortMode>('frequency')
  const sortDirection = ref<'desc' | 'asc'>('desc')

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
        // 性能优化（用户要求 #1）：优先用预生成检索索引缓存重建（免 pinyin-pro 全量计算）
        index =
          res.data.search && res.data.search.length > 0
            ? createSearchIndexFromCache(res.data.items, res.data.search as SearchCacheWord[])
            : createSearchIndex(res.data.items)
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

  /** 频次档 + 出现次数排序比较器；同档同次返回 0（稳定排序，保持加载顺序，
   *  即主进程 data:list 的「频次档→出现次数→id」预排序或 fixture 原序） */
  function byTier(a: Idiom, b: Idiom): number {
    const dir = sortDirection.value === 'desc' ? -1 : 1
    if (a.frequency !== b.frequency) return (a.frequency - b.frequency) * dir
    const ao = a.occurrences ?? 0
    const bo = b.occurrences ?? 0
    if (ao !== bo) return (ao - bo) * dir
    return 0
  }

  /** 过滤后的列表：关键字走内存检索（优先级排序），再叠加频次过滤 + 排序 */
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
    // 搜索命中：保持 search() 的相关度顺序（层级→频次→id），不按档位重排
    if (kw) return list
    if (sortMode.value === 'pinyin') {
      const dir = sortDirection.value === 'desc' ? -1 : 1
      list = [...list].sort((a, b) => (a.id < b.id ? -1 : 1) * dir)
    } else {
      list = [...list].sort(byTier)
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

  /** 切换排序方向（用户要求 #3：同档按出现次数升/降序） */
  function toggleSortDirection(): void {
    sortDirection.value = sortDirection.value === 'desc' ? 'asc' : 'desc'
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
    sortMode,
    sortDirection,
    filtered,
    load,
    byId,
    resetFilters,
    toggleSortDirection
  }
})
