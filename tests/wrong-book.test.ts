/**
 * V2-D 错题本 + 误用类型统计测试（§8 / v0.2）
 * - wrongBookStats 纯函数：错题列表排序/字段映射、§5.2 8 类聚合计数与占比、状态中文标签
 * - WrongBookPage：列表渲染、跳详情、立即复习（记入闪卡队列 + flush）、统计卡、空态引导、路由
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { VueWrapper } from '@vue/test-utils'
import {
  WRONG_TYPE_ORDER,
  aggregateWrongTypes,
  statusLabel,
  statusTagType,
  wrongItems
} from '../src/renderer/src/components/wrong-book/wrongBookStats'
import WrongBookPage from '../src/renderer/src/views/WrongBookPage.vue'
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
  idiom({ id: 'a-01', word: '错词甲', pinyin: 'cuò cí jiǎ', frequency: 5 }),
  idiom({ id: 'b-02', word: '错词乙', pinyin: 'cuò cí yǐ', frequency: 4 }),
  idiom({ id: 'c-03', word: '错词丙', pinyin: 'cuò cí bǐng', frequency: 3 })
]

function installApiMock() {
  const api: YuzhanApi = {
    data: {
      list: vi.fn(async () => ({ ok: true, data: { items: fixture, version: '2026.1' } })),
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
        data: { schemaVersion: 1, aiMode: 'disabled', quickInputShortcut: 'Plus' }
      })),
      set: vi.fn(async () => ({
        ok: true,
        data: { schemaVersion: 1, aiMode: 'disabled', quickInputShortcut: 'Plus' }
      }))
    },
    log: vi.fn(async () => ({ ok: true, data: null }))
  }
  vi.stubGlobal('api', api)
  return api
}

type SeedFn = (store: {
  incrementWrong: (id: string, type?: string) => void
  markStatus: (id: string, status: 'new' | 'learning' | 'mastered') => void
}) => void

async function mountPage(opts: { seed?: SeedFn } = {}) {
  const api = installApiMock()
  const pinia = createPinia()
  setActivePinia(pinia)
  const { useProgressStore } = await import('../src/renderer/src/stores/progress')
  const progressStore = useProgressStore(pinia)
  opts.seed?.(progressStore)

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/wrongbook', component: WrongBookPage },
      { path: '/idioms/:id', component: { template: '<div>detail</div>' } },
      { path: '/idioms', component: { template: '<div>list</div>' } },
      { path: '/quiz', component: { template: '<div>quiz</div>' } }
    ]
  })
  await router.push('/wrongbook')
  await router.isReady()
  const wrapper = mount(WrongBookPage, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router, api, pinia }
}

/** 常规种子：a-01 错 2 次（望文生义×2）、b-02 学习中错 1 次（褒贬误用）、c-03 错 1 次（望文生义） */
function seedDefault(progressStore: {
  incrementWrong: (id: string, type?: string) => void
  markStatus: (id: string, status: 'new' | 'learning' | 'mastered') => void
}): void {
  progressStore.incrementWrong('a-01', '望文生义')
  progressStore.incrementWrong('a-01', '望文生义')
  progressStore.markStatus('b-02', 'learning')
  progressStore.incrementWrong('b-02', '褒贬误用')
  progressStore.incrementWrong('c-03', '望文生义')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------
// wrongBookStats 纯函数
// ---------------------------------------------------------------------------

describe('wrongBookStats 纯函数', () => {
  it('wrongItems：仅 wrongTimes>0，按次数降序，映射词形/拼音/状态/误用类型', () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    // 用页面同款种子，但直接构造 progress 记录更贴近纯函数测试
    const progress = {
      'a-01': { id: 'a-01', status: 'new' as const, wrongTimes: 2, wrongTypes: { 望文生义: 2 } },
      'b-02': { id: 'b-02', status: 'learning' as const, wrongTimes: 1, wrongTypes: { 褒贬误用: 1, 望文生义: 0 } },
      'c-03': { id: 'c-03', status: 'new' as const, wrongTimes: 1, wrongTypes: { 望文生义: 1 } },
      'd-04': { id: 'd-04', status: 'new' as const, wrongTimes: 0, wrongTypes: {} }
    }
    const rows = wrongItems(progress, fixture)
    expect(rows.map((r) => r.id)).toEqual(['a-01', 'b-02', 'c-03']) // d-04 被过滤
    expect(rows[0].word).toBe('错词甲')
    expect(rows[0].wrongTypes).toEqual([{ type: '望文生义', count: 2 }])
    expect(rows[1].wrongTypes).toEqual([{ type: '褒贬误用', count: 1 }]) // count 0 的类型剔除
    expect(rows[2].status).toBe('new')
  })

  it('aggregateWrongTypes：按 §5.2 8 类顺序聚合计数与占比（未出现类 count=0）', () => {
    const progress = {
      'a-01': { id: 'a-01', status: 'new' as const, wrongTimes: 2, wrongTypes: { 望文生义: 2 } },
      'b-02': { id: 'b-02', status: 'learning' as const, wrongTimes: 1, wrongTypes: { 褒贬误用: 1 } },
      'c-03': { id: 'c-03', status: 'new' as const, wrongTimes: 1, wrongTypes: { 望文生义: 1 } }
    }
    const stats = aggregateWrongTypes(progress)
    expect(stats).toHaveLength(WRONG_TYPE_ORDER.length)
    expect(stats.map((s) => s.type)).toEqual([...WRONG_TYPE_ORDER])
    const wangwen = stats.find((s) => s.type === '望文生义')!
    expect(wangwen.count).toBe(3)
    expect(wangwen.percent).toBe(75) // 3/4
    const baobian = stats.find((s) => s.type === '褒贬误用')!
    expect(baobian.count).toBe(1)
    expect(baobian.percent).toBe(25)
    expect(stats.find((s) => s.type === '搭配不当')!.count).toBe(0)
    expect(stats.find((s) => s.type === '搭配不当')!.percent).toBe(0)
  })

  it('statusLabel / statusTagType：mastered→已掌握、learning→学习中、new→新词', () => {
    expect(statusLabel('mastered')).toBe('已掌握')
    expect(statusLabel('learning')).toBe('学习中')
    expect(statusLabel('new')).toBe('新词')
    expect(statusTagType('mastered')).toBe('success')
    expect(statusTagType('learning')).toBe('warning')
    expect(statusTagType('new')).toBe('default')
  })
})

// ---------------------------------------------------------------------------
// WrongBookPage 组件
// ---------------------------------------------------------------------------

describe('WrongBookPage（V2-D）', () => {
  it('错题列表：按错误次数降序渲染，展示状态/次数/误用类型', async () => {
    const { wrapper } = await mountPage({ seed: seedDefault })
    const rows = wrapper.findAll('[data-testid="wrong-row"]')
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.attributes('data-id'))).toEqual(['a-01', 'b-02', 'c-03'])
    expect(rows[0].text()).toContain('错词甲')
    expect(rows[0].text()).toContain('新词')
    expect(rows[0].text()).toContain('错 2 次')
    expect(rows[0].text()).toContain('望文生义 ×2')
    expect(rows[1].text()).toContain('学习中')
    expect(rows[1].text()).toContain('褒贬误用')
    expect(wrapper.find('[data-testid="wrongbook-count"]').text()).toContain('共 3 题 · 4 次错误')
    wrapper.unmount()
  })

  it('误用类型统计卡：8 类全列出，占比正确，条形宽度与占比一致', async () => {
    const { wrapper } = await mountPage({ seed: seedDefault })
    const typeRows = wrapper.findAll('[data-testid="wrong-type-row"]')
    expect(typeRows).toHaveLength(WRONG_TYPE_ORDER.length)
    // 望文生义 75%：条形宽度 75%
    const bar = wrapper.find('[data-testid="wrong-type-bar"][data-type="望文生义"]')
    expect(bar.attributes('style')).toContain('width: 75%')
    // 未出现类型 count=0 且 zero 类
    const zeroRow = wrapper.find('[data-testid="wrong-type-row"][data-type="搭配不当"]')
    expect(zeroRow.classes()).toContain('empty')
    wrapper.unmount()
  })

  it('点击词条跳详情 /idioms/:id', async () => {
    const { wrapper, router } = await mountPage({ seed: seedDefault })
    await wrapper.find('[data-testid="wrong-row"][data-id="a-01"] .wrong-main').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/idioms/a-01')
    wrapper.unmount()
  })

  it('「立即复习」→ 复习一次（new→learning + flush 写盘）并跳详情', async () => {
    const { wrapper, router, api } = await mountPage({ seed: seedDefault })
    await wrapper.find('[data-testid="wrong-row"][data-id="a-01"] [data-testid="wrong-review"]').trigger('click')
    await flushPromises()
    expect(api.progress.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a-01', status: 'learning' })
    )
    expect(router.currentRoute.value.path).toBe('/idioms/a-01')
    wrapper.unmount()
  })

  it('空态引导：无错题 → 去自测 / 去成语库', async () => {
    const { wrapper, router } = await mountPage() // 无种子
    expect(wrapper.find('[data-testid="wrongbook-empty"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('还没有错题')
    await wrapper.find('[data-testid="goto-quiz"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/quiz')
    // 回错题本后再点去成语库
    await router.push('/wrongbook')
    await wrapper.find('[data-testid="goto-idioms"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/idioms')
    wrapper.unmount()
  })
})
