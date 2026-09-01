/**
 * T6 快速记录 + 生词本测试（AC-03/04，§10 快速输入）
 *
 * - 检索核心逻辑复用 shared/lib/search.ts（单测见 tests/search.test.ts），本文件覆盖
 *   quickRecord 接线纯函数 + QuickInputModal 组件交互 + PendingPage 生词本页
 * - NModal 默认 teleport 到 body，组件断言用 document.body 查询
 * - 使用真实计时器等待 200ms 防抖窗口（260ms/用例），避免 fake timers 与
 *   @vue/test-utils flushPromises（内部 setImmediate）互相干扰
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { nextTick } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import QuickInputModal from '../src/renderer/src/components/quick-input/QuickInputModal.vue'
import PendingPage from '../src/renderer/src/views/PendingPage.vue'
import {
  DEFAULT_SHORTCUT,
  acceleratorFromEvent,
  addPersonalItem,
  aiEnabled,
  aiModeLabel,
  aiModeTagType,
  buildPersonalIdiom,
  clearPersonalLibrary,
  clipboardToQuery,
  createQuickIndex,
  derivePinyin,
  describeShortcut,
  draftMissingFields,
  eventMatchesAccelerator,
  findPersonal,
  firstHit,
  formatAddedAt,
  isPlusKey,
  isRecordableQuery,
  listPersonalLibrary,
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

function installApiMock(
  opts: {
    items?: Idiom[]
    pending?: string[]
    aiMode?: 'disabled' | 'configured' | 'online' | 'error'
    aiSearchWord?: () => Promise<unknown>
  } = {}
) {
  const items = opts.items ?? fixture
  const aiMode = opts.aiMode ?? 'disabled'
  const pendingDb: { word: string; addedAt: string }[] = (opts.pending ?? []).map((word, i) => ({
    word,
    addedAt: new Date(Date.UTC(2026, 7, 31 - i)).toISOString()
  }))
  const api: YuzhanApi = {
    data: {
      list: vi.fn(async () => ({ ok: true, data: { items, version: '2026.1' } })),
      get: vi.fn(async () => ({ ok: true, data: null }))
    },
    pairs: { list: vi.fn(async () => ({ ok: true, data: { pairs: [] } })) },
    progress: {
      save: vi.fn(async () => ({ ok: true, data: null })),
      list: vi.fn(async () => ({ ok: true, data: { items: {} } }))
    },
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
    quiz: {
      record: vi.fn(async () => ({ ok: true, data: null })),
      history: {
        list: vi.fn(async () => ({ ok: true, data: { items: [] } })),
        add: vi.fn(async () => ({ ok: true, data: null }))
      }
    },
    settings: {
      get: vi.fn(async () => ({
        ok: true,
        data: { schemaVersion: 1, aiMode, quickInputShortcut: 'Plus' }
      })),
      set: vi.fn(async (patch: { quickInputShortcut?: string; aiMode?: string }) => ({
        ok: true,
        data: {
          schemaVersion: 1,
          aiMode: patch.aiMode ?? aiMode,
          quickInputShortcut: patch.quickInputShortcut ?? 'Plus'
        }
      }))
    },
    ai: {
      searchWord: vi.fn(
        opts.aiSearchWord ??
          (async () => ({
            ok: true,
            data: {
              draft: {
                word: '新造词甲',
                meaning: '新造词甲释义',
                emotion: '中性',
                register: '无',
                errorTypes: ['望文生义'],
                frequency: 3
              },
              cached: false
            }
          }))
      )
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
  // FIX-2：默认「+」键唤起
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '+' }))
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
  it('parseAccelerator：CommandOrControl+K → ctrlOrMeta + key=k；Plus → key=+（FIX-2）', () => {
    expect(parseAccelerator('CommandOrControl+K')).toEqual({ ctrlOrMeta: true, alt: false, shift: false, key: 'k' })
    expect(parseAccelerator('Alt+Shift+X')).toEqual({ ctrlOrMeta: false, alt: true, shift: true, key: 'x' })
    expect(parseAccelerator('Plus')).toEqual({ ctrlOrMeta: false, alt: false, shift: false, key: '+' })
    expect(parseAccelerator('Control+Plus')).toEqual({ ctrlOrMeta: true, alt: false, shift: false, key: '+' })
  })

  it('eventMatchesAccelerator：ctrl 或 meta 均匹配 CommandOrControl+K，其余不匹配；Plus 匹配 + 键', () => {
    expect(eventMatchesAccelerator(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }), 'CommandOrControl+K')).toBe(true)
    expect(eventMatchesAccelerator(new KeyboardEvent('keydown', { key: 'k', metaKey: true }), 'CommandOrControl+K')).toBe(true)
    expect(eventMatchesAccelerator(new KeyboardEvent('keydown', { key: 'k' }), 'CommandOrControl+K')).toBe(false)
    expect(eventMatchesAccelerator(new KeyboardEvent('keydown', { key: 'j', ctrlKey: true }), 'CommandOrControl+K')).toBe(false)
    expect(eventMatchesAccelerator(new KeyboardEvent('keydown', { key: '+' }), 'Plus')).toBe(true)
    expect(eventMatchesAccelerator(new KeyboardEvent('keydown', { key: '+' }), 'CommandOrControl+K')).toBe(false)
  })

  it('describeShortcut：中文/符号描述（去英文 accelerator 串，FIX-2）', () => {
    expect(describeShortcut('Plus')).toBe('+')
    expect(describeShortcut('Control+K')).toBe('Ctrl + K')
    expect(describeShortcut('CommandOrControl+K')).toBe('Ctrl + K')
    expect(describeShortcut('')).toBe('')
  })

  it('acceleratorFromEvent：按键事件 → accelerator（捕获器用，FIX-2）', () => {
    expect(acceleratorFromEvent(new KeyboardEvent('keydown', { key: '+' }))).toBe('Plus')
    expect(acceleratorFromEvent(new KeyboardEvent('keydown', { key: '=', code: 'NumpadAdd' }))).toBe('Plus')
    expect(acceleratorFromEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))).toBe('Control+K')
    expect(acceleratorFromEvent(new KeyboardEvent('keydown', { key: 'j', metaKey: true, shiftKey: true }))).toBe('Command+Shift+J')
    expect(acceleratorFromEvent(new KeyboardEvent('keydown', { key: ' ' }))).toBe('Space')
    // 单独修饰键 / Esc：捕获器忽略（返回空）
    expect(acceleratorFromEvent(new KeyboardEvent('keydown', { key: 'Control' }))).toBe('')
    expect(acceleratorFromEvent(new KeyboardEvent('keydown', { key: 'Escape' }))).toBe('')
  })

  it('tierLabel：精确→前缀→子串→模糊（编辑距离）', () => {
    expect(tierLabel(SearchTier.Exact)).toBe('精确命中')
    expect(tierLabel(SearchTier.Prefix)).toBe('前缀命中')
    expect(tierLabel(SearchTier.Substring)).toBe('包含命中')
    expect(tierLabel(SearchTier.EditDistance)).toBe('模糊命中')
  })

  it('clipboardToQuery：纯 2–8 汉字采用（含首尾空白修剪）；非汉字/越界/空白返回空串（v0.2.6 P0-②）', () => {
    expect(clipboardToQuery(' 不落窠臼 ')).toBe('不落窠臼')
    expect(clipboardToQuery('守株待兔')).toBe('守株待兔')
    expect(clipboardToQuery('生僻')).toBe('生僻')
    expect(clipboardToQuery('abc')).toBe('')
    expect(clipboardToQuery('一二三四五六七八九')).toBe('') // 9 字超限
    expect(clipboardToQuery('你好world')).toBe('')
    expect(clipboardToQuery('')).toBe('')
    expect(clipboardToQuery('   ')).toBe('')
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

  it('AI 模式（V2-F）：中文标签 / 标签类型 / 可用性判定（未配置·异常 → 降级生词本）', () => {
    expect(aiModeLabel('disabled')).toBe('未配置')
    expect(aiModeLabel('configured')).toBe('已配置')
    expect(aiModeLabel('online')).toBe('在线')
    expect(aiModeLabel('error')).toBe('异常')
    expect(aiModeTagType('online')).toBe('success')
    expect(aiModeTagType('error')).toBe('error')
    expect(aiEnabled('disabled')).toBe(false)
    expect(aiEnabled('error')).toBe(false)
    expect(aiEnabled('configured')).toBe(true)
    expect(aiEnabled('online')).toBe(true)
  })

  it('draftMissingFields：缺字段明确标记（§10.1）', () => {
    const full = {
      word: '词', meaning: '释义', emotion: '褒' as const, register: '无' as const,
      errorTypes: ['望文生义'], frequency: 3
    }
    expect(draftMissingFields(full)).toEqual([])
    expect(draftMissingFields({ ...full, meaning: '' })).toContain('释义')
    expect(draftMissingFields({ ...full, word: '  ' })).toContain('词形')
    expect(draftMissingFields({ ...full, errorTypes: [] })).toContain('误用类型')
    expect(draftMissingFields({ ...full, frequency: 9 })).toContain('频次')
  })

  it('derivePinyin：词形 → 带声调拼音', () => {
    expect(derivePinyin('鞠躬尽瘁')).toBe('jū gōng jìn cuì')
    expect(derivePinyin('  ')).toBe('')
  })

  it('buildPersonalIdiom / addPersonalItem：quality=user、library=user、按词形去重', () => {
    clearPersonalLibrary()
    const a = buildPersonalIdiom({
      word: '新造词', meaning: '新释义', emotion: '中性', register: '无',
      errorTypes: ['望文生义'], frequency: 3, near: [{ word: '近义词', diff: '区别' }]
    })
    expect(a.quality).toBe('user')
    expect(a.library).toBe('user')
    expect(a.id).toMatch(/^新造词-u/)
    expect(a.pinyin.length).toBeGreaterThan(0)
    expect(addPersonalItem(a)).toBe(true)
    expect(addPersonalItem(a)).toBe(false) // 同词去重
    expect(listPersonalLibrary()).toHaveLength(1)
    expect(findPersonal('新造词')?.meaning).toBe('新释义')
    clearPersonalLibrary()
  })
})

// ---------------------------------------------------------------------------
// QuickInputModal：唤起 / 命中动作 / 未命中入本
// ---------------------------------------------------------------------------

describe('QuickInputModal（§3.3 快速输入交互，AC-03/04）', () => {
  it('「+」键唤起弹层并自动聚焦输入框；再次按 + 关闭（FIX-2 默认键）', async () => {
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

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '+' }))
    await nextTick()
    await nextTick()
    expect(isOpen(wrapper)).toBe(false)
    wrapper.unmount()
  })

  it('Ctrl+K 默认不再触发（FIX-2：已移除 CommandOrControl+K 硬编码默认）', async () => {
    const { wrapper } = await mountModal()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))
    await nextTick()
    await nextTick()
    expect(isOpen(wrapper)).toBe(false)
    wrapper.unmount()
  })

  it('自定义快捷键：保存 Control+K 后 Ctrl+K 立即生效（动态监听 settings.quickInputShortcut）', async () => {
    const { wrapper, pinia } = await mountModal()
    expect(isOpen(wrapper)).toBe(false)
    // 模拟设置页保存自定义快捷键
    const { useSettingsStore } = await import('../src/renderer/src/stores/settings')
    const settingsStore = useSettingsStore(pinia)
    await settingsStore.update({ quickInputShortcut: 'Control+K' })
    expect(settingsStore.settings.quickInputShortcut).toBe('Control+K')

    // 自定义键触发
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))
    await nextTick()
    await nextTick()
    expect(isOpen(wrapper)).toBe(true)

    // 默认「+」键不再触发（自定义键接管）
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '+' }))
    await nextTick()
    await nextTick()
    expect(isOpen(wrapper)).toBe(true)
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

  it('每次打开清空上次搜索（v0.2.6，BUG-7）', async () => {
    const { wrapper } = await mountModal()
    await openAndType(wrapper, 'jgj')
    expect(document.body.querySelector('[data-testid="quick-hit-card"]')).not.toBeNull()
    // 关闭（+ 键 toggle）
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '+' }))
    await nextTick()
    await nextTick()
    await flushPromises()
    expect(isOpen(wrapper)).toBe(false)
    // 再次打开 → 输入清空、无残留命中卡片
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '+' }))
    await nextTick()
    await nextTick()
    await flushPromises()
    expect(isOpen(wrapper)).toBe(true)
    expect(qInput()?.value ?? '').toBe('')
    expect(document.body.querySelector('[data-testid="quick-hit-card"]')).toBeNull()
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
// QuickInputModal AI 闭环（V2-F，§10.1 ②③）
// ---------------------------------------------------------------------------

describe('QuickInputModal AI 闭环（V2-F）', () => {
  async function mountAiModal(opts: {
    aiMode?: 'disabled' | 'configured' | 'online' | 'error'
    aiSearchWord?: () => Promise<unknown>
  } = {}) {
    const { api } = installApiMock({ aiMode: opts.aiMode ?? 'online', aiSearchWord: opts.aiSearchWord })
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
    await flushPromises()
    return { wrapper, router, api, pinia }
  }

  const bodyFind = (testId: string): HTMLElement | null =>
    document.body.querySelector<HTMLElement>(`[data-testid="${testId}"]`)

  beforeEach(() => {
    clearPersonalLibrary()
  })

  afterEach(() => {
    clearPersonalLibrary()
  })

  it('降级：aiMode=disabled/error → 无 AI 查询按钮，直接走生词本（v0.1 行为）', async () => {
    for (const mode of ['disabled', 'error'] as const) {
      const { wrapper, api } = await mountAiModal({ aiMode: mode })
      await openAndType(wrapper, '生僻词x')
      expect(bodyFind('ai-mode-tag')?.textContent).toBe(mode === 'disabled' ? '未配置' : '异常')
      expect(bodyFind('action-ai-query')).toBeNull() // 无 AI 查询入口
      expect(bodyFind('action-add-pending')).not.toBeNull()
      bodyClick('action-add-pending')
      await flushPromises()
      expect(api.pending.add).toHaveBeenCalledWith('生僻词x')
      wrapper.unmount()
      document.body.innerHTML = ''
    }
  })

  it('AI 查询 → 草稿预览：展示词形/释义，可编辑后确认写个人库并加入复习队列', async () => {
    const { wrapper, api } = await mountAiModal()
    await openAndType(wrapper, '生僻词x')
    expect(bodyFind('ai-mode-tag')?.textContent).toBe('在线')
    bodyClick('action-ai-query')
    await flushPromises()
    // 预览面板
    expect(bodyFind('ai-draft-panel')).not.toBeNull()
    expect(
      document.body.querySelector<HTMLInputElement>('[data-testid="draft-word"] input')?.value
    ).toBe('新造词甲')
    // 编辑词形
    const wordInput = document.body.querySelector<HTMLInputElement>('[data-testid="draft-word"] input')
    wordInput!.value = '新造词甲改'
    wordInput!.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    // 确认
    bodyClick('draft-confirm')
    await flushPromises()
    expect(bodyFind('ai-feedback')?.textContent).toContain('已加入个人库并进入复习队列')
    // 个人库登记 + 闪卡队列（progress 新建记录 + flush）
    expect(findPersonal('新造词甲改')).toBeDefined()
    expect(api.progress.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'learning' })
    )
    wrapper.unmount()
  })

  it('混淆词候选：库内词标「库内」/新词标「候选草稿」，勾选过滤后保留选中项', async () => {
    const { wrapper } = await mountAiModal({
      aiSearchWord: async () => ({
        ok: true,
        data: {
          draft: {
            word: '生僻词x',
            meaning: '生僻释义',
            emotion: '中性',
            register: '无',
            errorTypes: ['望文生义'],
            frequency: 3,
            near: [
              { word: '不落窠臼', diff: '库内对端' },
              { word: '新词乙', diff: '新词候选' }
            ]
          },
          cached: false
        }
      })
    })
    await openAndType(wrapper, '生僻词x')
    bodyClick('action-ai-query')
    await flushPromises()
    // 库内词标记
    const inLib = bodyFind('candidate-不落窠臼')
    expect(inLib?.textContent).toContain('库内')
    expect(inLib?.textContent).toContain('不落窠臼')
    const newWord = bodyFind('candidate-新词乙')
    expect(newWord?.textContent).toContain('候选草稿')
    // 取消勾选 新词乙
    newWord?.querySelector('input')?.click()
    await flushPromises()
    bodyClick('draft-confirm')
    await flushPromises()
    const saved = findPersonal('生僻词x')
    expect(saved).toBeDefined()
    expect(saved!.near?.map((n) => n.word)).toEqual(['不落窠臼'])
    wrapper.unmount()
  })

  it('缺字段标记：AI 返回缺释义 → 预览面板提示「缺字段：释义」', async () => {
    const { wrapper } = await mountAiModal({
      aiSearchWord: async () => ({
        ok: true,
        data: {
          draft: { word: '缺词', meaning: '', emotion: '中性', register: '无', errorTypes: ['望文生义'], frequency: 3 },
          cached: false
        }
      })
    })
    await openAndType(wrapper, '缺词')
    bodyClick('action-ai-query')
    await flushPromises()
    expect(bodyFind('draft-missing')?.textContent).toContain('缺字段：释义')
    wrapper.unmount()
  })

  it('AI 查询错误：NO_API_KEY → 错误提示 + 重试按钮（§3.4 禁止无反馈等待）', async () => {
    const { wrapper } = await mountAiModal({
      aiSearchWord: async () => ({ ok: false, error: { code: 'NO_API_KEY', message: '未配置' } })
    })
    await openAndType(wrapper, '生僻词x')
    bodyClick('action-ai-query')
    await flushPromises()
    expect(bodyFind('ai-error')?.textContent).toContain('未配置 API Key')
    expect(bodyFind('ai-retry')).not.toBeNull()
    wrapper.unmount()
  })

  it('取消/防 stale：查询在途时取消 → 响应到达不覆盖（无预览出现）', async () => {
    let resolveAi!: (v: unknown) => void
    const { wrapper } = await mountAiModal({
      aiSearchWord: () => new Promise((r) => { resolveAi = r })
    })
    await openAndType(wrapper, '生僻词x')
    bodyClick('action-ai-query')
    await flushPromises()
    expect(bodyFind('ai-loading')).not.toBeNull()
    bodyClick('ai-cancel') // 取消：使在途响应失效
    await flushPromises()
    expect(bodyFind('ai-draft-panel')).toBeNull()
    resolveAi({
      ok: true,
      data: { draft: { word: '迟到词', meaning: '迟到释义', emotion: '中性', register: '无', errorTypes: [], frequency: 3 }, cached: false }
    })
    await flushPromises()
    expect(bodyFind('ai-draft-panel')).toBeNull() // stale 被忽略
    expect(findPersonal('迟到词')).toBeUndefined()
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
