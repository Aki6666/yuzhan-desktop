/**
 * T4 列表页测试（AC-07 搜索 / 频次过滤 / 虚拟滚动 / 跳转 / 空态）+ listFilters 纯函数单测（FIX-1：首字筛选已移除）
 *
 * 说明：
 * - 检索核心逻辑复用 shared/lib/search.ts（其单测见 tests/search.test.ts），本文件只覆盖 UI 接线与派生数据
 * - 组件测试使用真实计时器 + 等待防抖窗口（约 260ms/用例），避免 fake timers 与
 *   @vue/test-utils flushPromises（内部 setImmediate）互相干扰
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import type { VueWrapper } from '@vue/test-utils'
import IdiomListPage from '../src/renderer/src/views/IdiomListPage.vue'
import IdiomVirtualList from '../src/renderer/src/components/idiom-list/IdiomVirtualList.vue'
import {
  FREQUENCY_OPTIONS,
  countByFrequency,
  debounce,
  highlightPinyinSpan,
  highlightSpan
} from '../src/renderer/src/lib/listFilters'
import type { Idiom, YuzhanApi } from '../shared/ipc/contracts'

// ---------------------------------------------------------------------------
// 夹具
// ---------------------------------------------------------------------------

function idiom(partial: Partial<Idiom> & { id: string; word: string; pinyin: string }): Idiom {
  return {
    schemaVersion: 1,
    meaning: '测试释义',
    emotion: '中性',
    register: '无',
    errorTypes: ['望文生义'],
    quality: 'reviewed',
    library: 'official',
    updatedAt: '2026-01-01',
    verifiedBy: 'test',
    ...partial
  }
}

const fixture: Idiom[] = [
  idiom({ id: 'ju-gong-jin-cui-01', word: '鞠躬尽瘁', pinyin: 'jū gōng jìn cuì', frequency: 5 }),
  idiom({ id: 'ju-an-si-wei-01', word: '居安思危', pinyin: 'jū ān sī wēi', frequency: 4 }),
  idiom({ id: 'an-ju-le-ye-01', word: '安居乐业', pinyin: 'ān jū lè yè', frequency: 4 }),
  idiom({ id: 'bu-luo-ke-jiu-01', word: '不落窠臼', pinyin: 'bù luò kē jiù', frequency: 3 }),
  idiom({ id: 'bu-chi-xia-wen-01', word: '不耻下问', pinyin: 'bù chǐ xià wèn', frequency: 3 }),
  idiom({ id: 'le-bu-si-shu-01', word: '乐不思蜀', pinyin: 'lè bù sī shǔ', frequency: 2 }),
  idiom({ id: 'jin-xin-jie-li-01', word: '尽心竭力', pinyin: 'jìn xīn jié lì', frequency: 1 })
]

/** 生成 n 条词条（用于虚拟滚动大数据量场景） */
function makeMany(n: number): Idiom[] {
  return Array.from({ length: n }, (_, i) =>
    idiom({
      id: `item-${String(i).padStart(3, '0')}`,
      word: `成语${String(i).padStart(3, '0')}`,
      pinyin: `chéng yǔ ${i}`,
      frequency: ((i % 5) + 1) as 1 | 2 | 3 | 4 | 5
    })
  )
}

// ---------------------------------------------------------------------------
// window.api mock（preload 白名单 API 形状见 shared/ipc/contracts.ts YuzhanApi）
// ---------------------------------------------------------------------------

function installApiMock(opts: { items?: Idiom[]; listImpl?: () => Promise<unknown> } = {}): YuzhanApi {
  const api: YuzhanApi = {
    data: {
      list: vi.fn(opts.listImpl ?? (async () => ({ ok: true, data: { items: opts.items ?? fixture, version: '2026.1' } }))),
      get: vi.fn(async () => ({ ok: true, data: null }))
    },
    progress: { save: vi.fn(async () => ({ ok: true, data: null })) },
    pending: {
      list: vi.fn(async () => ({ ok: true, data: [] })),
      add: vi.fn(async () => ({ ok: true, data: null })),
      remove: vi.fn(async () => ({ ok: true, data: null }))
    },
    quiz: { record: vi.fn(async () => ({ ok: true, data: null })) },
    settings: {
      get: vi.fn(async () => ({
        ok: true,
        data: { schemaVersion: 1, aiMode: 'disabled', quickInputShortcut: 'CommandOrControl+K' }
      })),
      set: vi.fn(async () => ({
        ok: true,
        data: { schemaVersion: 1, aiMode: 'disabled', quickInputShortcut: 'CommandOrControl+K' }
      }))
    },
    log: vi.fn(async () => ({ ok: true, data: null }))
  }
  vi.stubGlobal('api', api)
  return api
}

async function mountPage(
  opts: { items?: Idiom[]; listImpl?: () => Promise<unknown> } = {}
): Promise<{ wrapper: VueWrapper; router: Router }> {
  installApiMock(opts)
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/idioms', name: 'idioms', component: IdiomListPage },
      {
        path: '/idioms/:id',
        name: 'idiom-detail',
        component: { template: '<div class="detail-stub">detail</div>' }
      }
    ]
  })
  await router.push('/idioms')
  await router.isReady()
  const wrapper = mount(IdiomListPage, { global: { plugins: [pinia, router] } })
  await flushPromises() // store.load() 完成
  return { wrapper, router }
}

const DEBOUNCE_MS = 200

async function typeAndSettle(wrapper: VueWrapper, text: string): Promise<void> {
  await wrapper.find('input').setValue(text)
  await new Promise((r) => setTimeout(r, DEBOUNCE_MS + 60))
  await flushPromises()
}

const rows = (w: VueWrapper) => w.findAll('[data-testid="idiom-row"]')

afterEach(() => {
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------
// listFilters 纯函数
// ---------------------------------------------------------------------------

describe('listFilters 纯函数', () => {
  it('FREQUENCY_OPTIONS = [1..5]', () => {
    expect(FREQUENCY_OPTIONS).toEqual([1, 2, 3, 4, 5])
  })

  it('countByFrequency：1–5 全键，缺失为 0', () => {
    const c = countByFrequency(fixture)
    expect(c[5]).toBe(1)
    expect(c[4]).toBe(2)
    expect(c[3]).toBe(2)
    expect(c[2]).toBe(1)
    expect(c[1]).toBe(1)
    expect(Object.keys(c)).toHaveLength(5)
  })

  it('debounce：防抖窗口内合并多次调用，只执行最后一次', () => {
    vi.useFakeTimers()
    try {
      const fn = vi.fn()
      const d = debounce(fn, 200)
      d('a')
      d('b')
      d('c')
      vi.advanceTimersByTime(199)
      expect(fn).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1)
      expect(fn).toHaveBeenCalledTimes(1)
      expect(fn).toHaveBeenCalledWith('c')
    } finally {
      vi.useRealTimers()
    }
  })

  it('debounce：cancel 取消待执行调用', () => {
    vi.useFakeTimers()
    try {
      const fn = vi.fn()
      const d = debounce(fn, 200)
      d('x')
      d.cancel()
      vi.advanceTimersByTime(300)
      expect(fn).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('highlightSpan：汉字子串命中（前缀/子串均可用）', () => {
    expect(highlightSpan('鞠躬尽瘁', '鞠躬')).toEqual({ start: 0, end: 2 })
    expect(highlightSpan('鞠躬尽瘁', '尽瘁')).toEqual({ start: 2, end: 4 })
  })

  it('highlightSpan：编辑距离 ≤1 近似窗口（不落巢臼 → 不落窠臼）', () => {
    expect(highlightSpan('不落窠臼', '不落巢臼')).toEqual({ start: 0, end: 4 })
  })

  it('highlightSpan：拼音/首字母查询不在汉字上定位，空白查询返回 null', () => {
    expect(highlightSpan('鞠躬尽瘁', 'jugong')).toBeNull()
    expect(highlightSpan('鞠躬尽瘁', 'jgj')).toBeNull()
    expect(highlightSpan('鞠躬尽瘁', '')).toBeNull()
    expect(highlightSpan('鞠躬尽瘁', '  ')).toBeNull()
  })

  it('highlightPinyinSpan：全拼子串映射回带声调原文（含多音节跨空格）', () => {
    expect(highlightPinyinSpan('jū gōng jìn cuì', 'jugong')).toEqual({ start: 0, end: 7 })
    expect(highlightPinyinSpan('jū gōng jìn cuì', 'jincui')).toEqual({ start: 8, end: 15 })
  })

  it('highlightPinyinSpan：首字母缩写非连续子串 → 不定位（由汉字高亮承担）', () => {
    expect(highlightPinyinSpan('jū gōng jìn cuì', 'jgj')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 列表页：搜索（防抖 200ms + 复用 shared/lib/search.ts，AC-07）
// ---------------------------------------------------------------------------

describe('列表页搜索（AC-07）', () => {
  it('初始渲染全部词条；输入后 200ms 防抖窗口内不触发过滤，防抖后按关键字过滤', async () => {
    const { wrapper } = await mountPage()
    expect(rows(wrapper)).toHaveLength(fixture.length)

    await wrapper.find('input').setValue('ju')
    await flushPromises()
    // 防抖窗口内：尚未过滤
    expect(rows(wrapper)).toHaveLength(fixture.length)

    await new Promise((r) => setTimeout(r, DEBOUNCE_MS + 60))
    await flushPromises()
    // 'ju'：前缀命中 鞠躬尽瘁(5)/居安思危(4) + 子串命中 安居乐业(4)，层内按频次降序
    const hitRows = rows(wrapper)
    expect(hitRows.map((r) => r.attributes('data-id'))).toEqual([
      'ju-gong-jin-cui-01',
      'ju-an-si-wei-01',
      'an-ju-le-ye-01'
    ])
  })

  it('汉字查询命中（鞠躬）', async () => {
    const { wrapper } = await mountPage()
    await typeAndSettle(wrapper, '鞠躬')
    expect(rows(wrapper).map((r) => r.attributes('data-id'))).toEqual(['ju-gong-jin-cui-01'])
  })

  it('全拼查询命中（jugongjincui）', async () => {
    const { wrapper } = await mountPage()
    await typeAndSettle(wrapper, 'jugongjincui')
    expect(rows(wrapper).map((r) => r.attributes('data-id'))).toEqual(['ju-gong-jin-cui-01'])
  })

  it('首字母查询命中（jgj）', async () => {
    const { wrapper } = await mountPage()
    await typeAndSettle(wrapper, 'jgj')
    expect(rows(wrapper).map((r) => r.attributes('data-id'))).toEqual(['ju-gong-jin-cui-01'])
  })

  it('含拼音错误（编辑距离 ≤1）命中目标词（不落巢臼 → 不落窠臼）', async () => {
    const { wrapper } = await mountPage()
    await typeAndSettle(wrapper, '不落巢臼')
    expect(rows(wrapper).map((r) => r.attributes('data-id'))).toEqual(['bu-luo-ke-jiu-01'])
  })

  it('命中高亮：汉字子串命中渲染 <mark class="hl-hit">', async () => {
    const { wrapper } = await mountPage()
    await typeAndSettle(wrapper, '鞠躬')
    const mark = wrapper.find('.idiom-word mark.hl-hit')
    expect(mark.exists()).toBe(true)
    expect(mark.text()).toBe('鞠躬')
  })

  it('无命中 → 空态（empty-state），无列表行', async () => {
    const { wrapper } = await mountPage()
    await typeAndSettle(wrapper, 'zzzz')
    expect(rows(wrapper)).toHaveLength(0)
    expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 列表页：频次（1–5）过滤 + 组合（FIX-1：首字筛选已移除，附录 B v0.1.2）
// ---------------------------------------------------------------------------

describe('列表页频次过滤', () => {
  it('频次过滤：点击 频4 → 仅显示频次=4 的词条（FIX-2 新视觉：选中段 active 态）', async () => {
    const { wrapper } = await mountPage()
    await wrapper.find('[data-testid="freq-4"]').trigger('click')
    expect(wrapper.find('[data-testid="freq-4"]').classes()).toContain('active')
    expect(rows(wrapper).map((r) => r.attributes('data-id'))).toEqual([
      'ju-an-si-wei-01',
      'an-ju-le-ye-01'
    ])
  })

  it('频次过滤：再次点击同一频次 → 取消过滤', async () => {
    const { wrapper } = await mountPage()
    await wrapper.find('[data-testid="freq-4"]').trigger('click')
    await wrapper.find('[data-testid="freq-4"]').trigger('click')
    expect(rows(wrapper)).toHaveLength(fixture.length)
  })

  it('组合过滤：关键字 ju + 频次 4 → 只剩 居安思危/安居乐业', async () => {
    const { wrapper } = await mountPage()
    await wrapper.find('[data-testid="freq-4"]').trigger('click')
    await typeAndSettle(wrapper, 'ju')
    expect(rows(wrapper).map((r) => r.attributes('data-id'))).toEqual([
      'ju-an-si-wei-01',
      'an-ju-le-ye-01'
    ])
  })

  it('清除筛选：重置关键字与全部过滤', async () => {
    const { wrapper } = await mountPage()
    await wrapper.find('[data-testid="freq-4"]').trigger('click')
    await typeAndSettle(wrapper, 'ju')
    expect(rows(wrapper)).toHaveLength(2)
    await wrapper.find('[data-testid="reset-filters"]').trigger('click')
    expect(rows(wrapper)).toHaveLength(fixture.length)
    expect(wrapper.find('[data-testid="reset-filters"]').exists()).toBe(false)
  })

  it('计数展示：结果数 = 过滤后/总数', async () => {
    const { wrapper } = await mountPage()
    expect(wrapper.find('[data-testid="result-count"]').text()).toContain(`共 ${fixture.length} / ${fixture.length} 条`)
    await typeAndSettle(wrapper, 'jgj')
    expect(wrapper.find('[data-testid="result-count"]').text()).toContain('共 1 / 7 条')
  })
})

// ---------------------------------------------------------------------------
// 列表页：跳转详情
// ---------------------------------------------------------------------------

describe('列表页跳转', () => {
  it('点击词条 → 路由跳转 /idioms/:id', async () => {
    const { wrapper, router } = await mountPage()
    await rows(wrapper)[0].trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/idioms/ju-gong-jin-cui-01')
  })
})

// ---------------------------------------------------------------------------
// 列表页：加载失败空态
// ---------------------------------------------------------------------------

describe('列表页加载失败', () => {
  it('data:list 失败 → 错误态 + 重试按钮', async () => {
    const { wrapper } = await mountPage({
      listImpl: () => Promise.reject(new Error('boom'))
    })
    expect(wrapper.find('[data-testid="error-state"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="retry-load"]').exists()).toBe(true)
    expect(rows(wrapper)).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 虚拟滚动（§4.7：600 条首屏 <300ms）
// ---------------------------------------------------------------------------

describe('虚拟滚动', () => {
  it('600 条只渲染可视窗口（约 16 行 DOM），占位高度覆盖全部条目', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }]
    })
    const wrapper = mount(IdiomVirtualList, {
      props: { items: makeMany(600) },
      global: { plugins: [pinia, router] }
    })
    // jsdom 无布局：clientHeight=0 → 兜底视口 640px，行高 56，overscan 4 → ceil(640/56)+4 = 16 行
    expect(rows(wrapper)).toHaveLength(16)
    expect(rows(wrapper)[0].attributes('data-id')).toBe('item-000')
    const spacer = wrapper.find('.idiom-virtual-list-spacer')
    expect(spacer.attributes('style')).toContain('33600px') // 600 × 56
    wrapper.unmount()
  })

  it('滚动后可视窗口移动（scrollTop=5600 → 窗口 96..115）', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }]
    })
    const wrapper = mount(IdiomVirtualList, {
      props: { items: makeMany(600) },
      global: { plugins: [pinia, router] }
    })
    const scroller = wrapper.find('[data-testid="virtual-scroll"]')
    scroller.element.scrollTop = 56 * 100
    await scroller.trigger('scroll')
    expect(rows(wrapper)).toHaveLength(20) // start=96, end=min(600, ceil(6240/56)+4)=116
    expect(rows(wrapper)[0].attributes('data-id')).toBe('item-096')
    expect(rows(wrapper)[rows(wrapper).length - 1].attributes('data-id')).toBe('item-115')
    wrapper.unmount()
  })

  it('列表页接入虚拟滚动：600 词条仅渲染可视窗口，DOM 行数远小于总数', async () => {
    const { wrapper } = await mountPage({ items: makeMany(600) })
    expect(wrapper.find('[data-testid="virtual-scroll"]').exists()).toBe(true)
    expect(rows(wrapper).length).toBeLessThan(600)
    expect(rows(wrapper).length).toBeGreaterThan(0)
  })
})
