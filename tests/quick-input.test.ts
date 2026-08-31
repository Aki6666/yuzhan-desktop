/**
 * T6 快速记录 + 生词本测试（AC-03/04，§10 快速输入）
 *
 * - 检索核心逻辑复用 shared/lib/search.ts（单测见 tests/search.test.ts），本文件覆盖
 *   quickRecord 接线纯函数 + QuickInputModal 组件交互 + PendingPage 生词本页
 * - NModal 默认 teleport 到 body，组件断言用 document.body 查询
 * - 使用真实计时器等待 200ms 防抖窗口（260ms/用例），避免 fake timers 与
 *   @vue/test-utils flushPromises（内部 setImmediate）互相干扰
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { nextTick } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import QuickInputModal from '../src/renderer/src/components/quick-input/QuickInputModal.vue'
import PendingPage from '../src/renderer/src/views/PendingPage.vue'
import {
  createQuickIndex,
  eventMatchesAccelerator,
  firstHit,
  formatAddedAt,
  isPlusKey,
  isRecordableQuery,
  parseAccelerator,
  pendingWordFromQuery,
  searchHits,
  tierLabel
} from '../src/renderer/src/lib/quickRecord'
import { SearchTier } from '../shared/lib/search'
import type { Idiom, YuzhanApi } from '../shared/ipc/contracts'

// ---------------------------------------------------------------------------
// 夹具与 window.api mock
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
  idiom({ id: 'bu-luo-ke-jiu-01', word: '不落窠臼', pinyin: 'bù luò kē jiù', frequency: 3 }),
  idiom({ id: 'le-bu-si-shu-01', word: '乐不思蜀', pinyin: 'lè bù sī shǔ', frequency: 2 }),
  idiom({ id: 'jin-xin-jie-li-01', word: '尽心竭力', pinyin: 'jìn xīn jié lì', frequency: 1 })
]

function installApiMock(opts: { items?: Idiom[]; pending?: string[] } = {}) {
  const items = opts.items ?? fixture
  const pendingDb: { word: string; addedAt: string }[] = (opts.pending ?? []).map((word, i) => ({
    word,
    addedAt: new Date(Date.UTC(2026, 7, 31 - i)).toISOString()
  }))
  const api: YuzhanApi = {
    data: {
      list: vi.fn(async () => ({ ok: true, data: { items, version: '2026.1' } })),
      get: vi.fn(async () => ({ ok: true, data: null }))
    },
    progress: { save: vi.fn(async () => ({ ok: true, data: null })) },
    pending: {
      list: vi.fn(async () => ({ ok: true, data: [...pendingDb] })),
      add: vi.fn(async (word: string) => {
        pendingDb.push({ word, addedAt: new Date().toISOString() })
        return { ok: true, data: null }
      }),
      remove: vi.fn(async (word: string) => {
        const i = pendingDb.findIndex((p) => p.word === word)
        if (i >= 0) pendingDb.splice(i, 1)
        return { ok: true, data: null }
      })
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
  return { api, pendingDb }
}

// NModal teleport 到 body，正文内容用 document.body 查询
const modal = () => document.body.querySelector('[data-testid="quick-input-modal"]')
const qInput = () => document.body.querySelector<HTMLInputElement>('[data-testid="quick-input"] input')

async function mountModal(opts: { items?: Idiom[] } = {}) {
  const { api } = installApiMock(opts)
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/idioms/:id', component: { template: '<div>detail</div>' } },
      { path: '/pending', component: { template: '<div>pending</div>' } }
    ]
  })
  await router.push('/')
  await router.isReady()
  const wrapper = mount(QuickInputModal, { global: { plugins: [pinia, router] } })
  await flushPromises() // 各 store load 完成
  return { wrapper, router, api, pinia }
}

async function openAndType(wrapper: VueWrapper, text: string): Promise<void> {
  await openModal(wrapper)
  const input = qInput()
  if (!input) throw new Error('quick input 未渲染')
  input.value = text
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 260)) // 防抖 200ms 窗口
  await flushPromises()
}

const bodyClick = (testId: string): void => {
  const el = document.body.querySelector<HTMLElement>(`[data-testid="${testId}"]`)
  if (!el) throw new Error(`未找到 ${testId}`)
  el.click()
}

/** 弹层打开状态（defineExpose 暴露，状态级断言，不依赖过渡动画时序） */
const isOpen = (wrapper: VueWrapper): boolean =>
  (wrapper.vm as unknown as { isOpen: () => boolean }).isOpen()

async function openModal(wrapper: VueWrapper): Promise<void> {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))
  await nextTick()
  await nextTick()
  await flushPromises()
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

// ---------------------------------------------------------------------------
// quickRecord 纯函数
// ---------------------------------------------------------------------------

describe('quickRecord 纯函数', () => {
  it('parseAccelerator：CommandOrControl+K → ctrlOrMeta + key=k', () => {
    expect(parseAccelerator('CommandOrControl+K')).toEqual({ ctrlOrMeta: true, alt: false, shift: false, key: 'k' })
    expect(parseAccelerator('Alt+Shift+X')).toEqual({ ctrlOrMeta: false, alt: true, shift: true, key: 'x' })
  })

  it('eventMatchesAccelerator：ctrl 或 meta 均匹配 CommandOrControl+K，其余不匹配', () => {
    expect(eventMatchesAccelerator(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }), 'CommandOrControl+K')).toBe(true)
    expect(eventMatchesAccelerator(new KeyboardEvent('keydown', { key: 'k', metaKey: true }), 'CommandOrControl+K')).toBe(true)
    expect(eventMatchesAccelerator(new KeyboardEvent('keydown', { key: 'k' }), 'CommandOrControl+K')).toBe(false)
    expect(eventMatchesAccelerator(new KeyboardEvent('keydown', { key: 'j', ctrlKey: true }), 'CommandOrControl+K')).toBe(false)
  })

  it('tierLabel：精确→前缀→子串→模糊（编辑距离）', () => {
    expect(tierLabel(SearchTier.Exact)).toBe('精确命中')
    expect(tierLabel(SearchTier.Prefix)).toBe('前缀命中')
    expect(tierLabel(SearchTier.Substring)).toBe('包含命中')
    expect(tierLabel(SearchTier.EditDistance)).toBe('模糊命中')
  })

  it('检索接线：jgj（鞠躬尽瘁首字母缩写前缀）命中 鞠躬尽瘁（复用 shared/lib/search.ts）', () => {
    const idx = createQuickIndex(fixture)
    const hits = searchHits(idx, 'jgj')
    expect(firstHit(hits)?.idiom.id).toBe('ju-gong-jin-cui-01')
    // 鞠躬尽瘁 initials=「jgjc」，'jgj' 为其前缀 → Prefix 层（AC-03 示例输入）
    expect(firstHit(hits)?.tier).toBe(SearchTier.Prefix)
  })

  it('pendingWordFromQuery / isRecordableQuery / formatAddedAt', () => {
    expect(pendingWordFromQuery('  生僻词  ')).toBe('生僻词')
    expect(isRecordableQuery('  ')).toBe(false)
    expect(isRecordableQuery('x')).toBe(true)
    expect(formatAddedAt('2026-08-31T12:00:00.000Z')).toBe('2026-08-31')
    expect(formatAddedAt('bad-iso')).toBe('bad-iso')
  })

  it('isPlusKey（FIX-1）：主键盘 + / 等号 / 数字键盘 Add 均判定为「+」键', () => {
    expect(isPlusKey(new KeyboardEvent('keydown', { key: '+' }))).toBe(true)
    expect(isPlusKey(new KeyboardEvent('keydown', { key: '=' }))).toBe(true)
    expect(isPlusKey(new KeyboardEvent('keydown', { key: 'Add' }))).toBe(true)
    expect(isPlusKey(new KeyboardEvent('keydown', { key: '+', code: 'NumpadAdd' }))).toBe(true)
    expect(isPlusKey(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))).toBe(false)
    expect(isPlusKey(new KeyboardEvent('keydown', { key: 'Enter' }))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// QuickInputModal：唤起 / 命中动作 / 未命中入本
// ---------------------------------------------------------------------------

describe('QuickInputModal（§3.3 快速输入交互，AC-03/04）', () => {
  it('Ctrl+K 唤起弹层并自动聚焦输入框；再次 Ctrl+K 关闭', async () => {
    const { wrapper } = await mountModal()
    expect(modal()).toBeNull()

    await openModal(wrapper)
    expect(isOpen(wrapper)).toBe(true)
    expect(modal()).not.toBeNull()
    // 事件驱动等待：组件 30ms 宏任务 + 重试聚焦完成，轮询直到 activeElement 落在输入框
    const input = qInput()
    expect(input).not.toBeNull()
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(input)
    }, { timeout: 2000, interval: 40 })

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))
    await nextTick()
    await nextTick()
    expect(isOpen(wrapper)).toBe(false)
    wrapper.unmount()
  })

  it('Esc 关闭弹层', async () => {
    const { wrapper } = await mountModal()
    await openModal(wrapper)
    expect(modal()).not.toBeNull()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    await nextTick()
    expect(isOpen(wrapper)).toBe(false)
    wrapper.unmount()
  })

  it('「+」键直接唤起（FIX-1）：+ / = / 数字键盘 Add 均可触发，无需组合键', async () => {
    const { wrapper } = await mountModal()
    expect(isOpen(wrapper)).toBe(false)

    // 主键盘 +（Shift+= 产生）
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '+' }))
    await nextTick()
    await nextTick()
    expect(isOpen(wrapper)).toBe(true)

    // 再次按 + → 关闭（toggle）
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '+' }))
    await nextTick()
    await nextTick()
    expect(isOpen(wrapper)).toBe(false)

    // 等号键
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '=' }))
    await nextTick()
    await nextTick()
    expect(isOpen(wrapper)).toBe(true)

    // 数字键盘加号（key='Add' / code='NumpadAdd'）
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Add', code: 'NumpadAdd' }))
    await nextTick()
    await nextTick()
    expect(isOpen(wrapper)).toBe(false) // toggle 关闭
    wrapper.unmount()
  })

  it('「+」键带 ctrl/alt/meta 组合不触发（避免与编辑快捷键冲突）', async () => {
    const { wrapper } = await mountModal()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '+', ctrlKey: true }))
    await nextTick()
    await nextTick()
    expect(isOpen(wrapper)).toBe(false)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '+', altKey: true }))
    await nextTick()
    await nextTick()
    expect(isOpen(wrapper)).toBe(false)
    wrapper.unmount()
  })

  it('AC-03 输入拼音 jgj → 命中卡片展示鞠躬尽瘁（前缀命中）', async () => {
    const { wrapper } = await mountModal()
    await openAndType(wrapper, 'jgj')
    const card = document.body.querySelector('[data-testid="quick-hit-card"]')
    expect(card).not.toBeNull()
    expect(card?.textContent).toContain('鞠躬尽瘁')
    expect(card?.textContent).toContain('jū gōng jìn cuì')
    expect(card?.textContent).toContain('前缀命中')
    wrapper.unmount()
  })

  it('命中「复习一次」→ progress 写 status=learning（记录闭环 + 强制 flush）', async () => {
    const { wrapper, api } = await mountModal()
    await openAndType(wrapper, 'jgj')
    bodyClick('action-review')
    await flushPromises()
    expect(api.progress.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ju-gong-jin-cui-01', status: 'learning' })
    )
    expect(document.body.querySelector('[data-testid="quick-feedback"]')?.textContent).toContain('已复习一次')
    wrapper.unmount()
  })

  it('「标记掌握」→ progress 写 status=mastered', async () => {
    const { wrapper, api } = await mountModal()
    await openAndType(wrapper, 'jgj')
    bodyClick('action-master')
    await flushPromises()
    expect(api.progress.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ju-gong-jin-cui-01', status: 'mastered' })
    )
    wrapper.unmount()
  })

  it('AC-04 未命中 → 「存入生词本」按钮 → pending.add 且反馈可见', async () => {
    const { wrapper, api } = await mountModal()
    await openAndType(wrapper, '生僻词')
    expect(document.body.querySelector('[data-testid="quick-state-miss"]')).not.toBeNull()
    bodyClick('action-add-pending')
    await flushPromises()
    expect(api.pending.add).toHaveBeenCalledWith('生僻词')
    expect(document.body.querySelector('[data-testid="quick-feedback"]')?.textContent).toContain('已存入生词本')
    wrapper.unmount()
  })

  it('未命中时回车直接存入生词本', async () => {
    const { wrapper, api } = await mountModal()
    await openAndType(wrapper, '不入流词')
    qInput()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flushPromises()
    expect(api.pending.add).toHaveBeenCalledWith('不入流词')
    wrapper.unmount()
  })

  it('命中卡片「查看详情」→ 跳转 /idioms/:id 并关闭弹层', async () => {
    const { wrapper, router } = await mountModal()
    await openAndType(wrapper, 'jgj')
    bodyClick('action-detail')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/idioms/ju-gong-jin-cui-01')
    expect(isOpen(wrapper)).toBe(false)
    wrapper.unmount()
  })
})

// ---------------------------------------------------------------------------
// PendingPage 生词本（AC-04）
// ---------------------------------------------------------------------------

describe('PendingPage 生词本（AC-04）', () => {
  async function mountPending(opts: { items?: Idiom[]; pending?: string[] } = {}) {
    const { api } = installApiMock(opts)
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/pending', component: PendingPage },
        { path: '/idioms/:id', component: { template: '<div>detail</div>' } }
      ]
    })
    await router.push('/pending')
    await router.isReady()
    const wrapper = mount(PendingPage, { global: { plugins: [pinia, router] } })
    await flushPromises()
    return { wrapper, router, api }
  }

  it('列出生词本词条并显示计数', async () => {
    const { wrapper } = await mountPending({ pending: ['不落窠臼', '生僻词甲'] })
    const rows = wrapper.findAll('[data-testid="pending-row"]')
    expect(rows).toHaveLength(2)
    expect(wrapper.find('[data-testid="pending-count"]').text()).toContain('共 2 条')
    expect(rows[0].text()).toContain('不落窠臼')
    wrapper.unmount()
  })

  it('删除生词 → 调 pending.remove 且行消失，剩 0 条显示空态', async () => {
    const { wrapper, api } = await mountPending({ pending: ['生僻词甲'] })
    await wrapper.find('[data-testid="pending-remove"]').trigger('click')
    await flushPromises()
    expect(api.pending.remove).toHaveBeenCalledWith('生僻词甲')
    expect(wrapper.findAll('[data-testid="pending-row"]')).toHaveLength(0)
    expect(wrapper.find('[data-testid="pending-empty"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('立即复习（库内命中）→ progress 记录 new→learning + 跳转详情', async () => {
    const { wrapper, router, api } = await mountPending({ pending: ['鞠躬尽瘁'] })
    await wrapper.find('[data-testid="pending-review"]').trigger('click')
    await flushPromises()
    expect(api.progress.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ju-gong-jin-cui-01', status: 'learning' })
    )
    expect(router.currentRoute.value.path).toBe('/idioms/ju-gong-jin-cui-01')
    wrapper.unmount()
  })

  it('立即复习（未收录）→ 提示无法记录且不跳转', async () => {
    const { wrapper, router } = await mountPending({ pending: ['未收录词xyz'] })
    await wrapper.find('[data-testid="pending-review"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="pending-hint"]').text()).toContain('无法记录复习进度')
    expect(router.currentRoute.value.path).toBe('/pending')
    wrapper.unmount()
  })

  it('空态引导：刷题遇到生词，Ctrl+K 记下来（§3.3）', async () => {
    const { wrapper } = await mountPending()
    expect(wrapper.find('[data-testid="pending-empty"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Ctrl+K 记下来')
    wrapper.unmount()
  })
})
