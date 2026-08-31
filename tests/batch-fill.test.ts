/**
 * V2-H 生词本批量 AI 补全测试（t27）
 *
 * - lib/batchFill.ts 纯逻辑：顺序逐词查询 / 失败 / 确认 / 跳过 / 取消 / 重跑 / 守卫 / onChange
 * - PendingPage 集成：入口禁用与提示（无 key/断网）→ 批量进度 → 逐条确认入库
 *   （与 V2-F 一致的个人库机制：buildPersonalIdiom + addPersonalItem + progress 闪卡队列）
 *   → 跳过 → 取消 → 失败原因展示 → 完成小结；既有生词本行为不回归
 *
 * 说明：既有 quick-input.test.ts 的 PendingPage 用例（AC-04）不改动，本文件独立覆盖新功能。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { nextTick } from 'vue'
import PendingPage from '../src/renderer/src/views/PendingPage.vue'
import { createBatchFill, batchSummary, type QueryOutcome } from '../src/renderer/src/lib/batchFill'
import { clearPersonalLibrary, findPersonal, listPersonalLibrary } from '../src/renderer/src/lib/quickRecord'
import type { AiDraftResult, Idiom, YuzhanApi } from '../shared/ipc/contracts'

beforeEach(() => {
  clearPersonalLibrary()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// 夹具
// ---------------------------------------------------------------------------

function draft(word: string): AiDraftResult {
  return {
    word,
    meaning: `释义：${word}`,
    emotion: '中性',
    register: '无',
    errorTypes: ['望文生义'],
    frequency: 3
  }
}

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
    ...partial,
    frequency: partial.frequency ?? 3
  } as Idiom
}

interface ApiMockOpts {
  aiMode?: 'disabled' | 'configured' | 'online' | 'error'
  pending?: string[]
  items?: Idiom[]
}

function installApiMock(opts: ApiMockOpts = {}) {
  const { aiMode = 'disabled', pending = [], items = [idiom({ id: 'ju-gong-jin-cui-01', word: '鞠躬尽瘁', pinyin: 'jū gōng jìn cuì' })] } = opts
  const pendingDb: { word: string; addedAt: string }[] = pending.map((word, i) => ({
    word,
    addedAt: new Date(Date.UTC(2026, 7, 31 - i)).toISOString()
  }))
  const aiSearchWord = vi.fn(async (word: string, _requestId?: string) => {
    if (word === '触发失败词') {
      return { ok: false, error: { code: 'AI_ERROR' as const, message: '查询失败：模拟超时' } }
    }
    return { ok: true, data: { draft: draft(word), cached: false } }
  })
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
        data: { schemaVersion: 1, aiMode, quickInputShortcut: 'Plus' }
      })),
      set: vi.fn(async () => ({
        ok: true,
        data: { schemaVersion: 1, aiMode, quickInputShortcut: 'Plus' }
      }))
    },
    ai: { searchWord: aiSearchWord },
    log: vi.fn(async () => ({ ok: true, data: null }))
  } as YuzhanApi
  vi.stubGlobal('api', api)
  return { api, pendingDb, aiSearchWord }
}

async function mountPending(opts: ApiMockOpts = {}) {
  const mocks = installApiMock(opts)
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/pending', component: PendingPage },
      { path: '/settings', component: { template: '<div>settings</div>' } },
      { path: '/idioms/:id', component: { template: '<div>detail</div>' } }
    ]
  })
  await router.push('/pending')
  await router.isReady()
  const wrapper = mount(PendingPage, { global: { plugins: [pinia, router] } })
  await flushPromises()
  await nextTick()
  return { wrapper, router, ...mocks }
}

// ---------------------------------------------------------------------------
// lib/batchFill.ts 纯逻辑
// ---------------------------------------------------------------------------

describe('batchFill 纯逻辑（createBatchFill）', () => {
  it('顺序逐词查询：queryWord 按 (word, seq) 顺序调用，全部 ready', async () => {
    const words = ['甲', '乙', '丙']
    const queryWord = vi.fn(async (word: string, _seq: number): Promise<QueryOutcome> => ({ ok: true, draft: draft(word) }))
    const saveDraft = vi.fn(async () => true)
    const c = createBatchFill(words, { queryWord, saveDraft })
    expect(c.running()).toBe(false)
    expect(c.done()).toBe(false)
    await c.run()
    expect(queryWord).toHaveBeenCalledTimes(3)
    expect(queryWord.mock.calls.map((c) => c[0])).toEqual(['甲', '乙', '丙'])
    expect(queryWord.mock.calls.map((c) => c[1])).toEqual([0, 1, 2])
    expect(c.items().every((i) => i.status === 'ready')).toBe(true)
    expect(c.current()).toBe(3)
    expect(c.running()).toBe(false)
    expect(c.done()).toBe(true)
    expect(c.cancelled()).toBe(false)
  })

  it('查询失败：该词 failed 带原因，其余继续', async () => {
    const queryWord = vi.fn(async (word: string, _seq: number): Promise<QueryOutcome> =>
      word === '乙' ? { ok: false, reason: 'AI 超时' } : { ok: true, draft: draft(word) }
    )
    const c = createBatchFill(['甲', '乙', '丙'], { queryWord, saveDraft: async () => true })
    await c.run()
    const byWord = Object.fromEntries(c.items().map((i) => [i.word, i]))
    expect(byWord['乙'].status).toBe('failed')
    expect(byWord['乙'].error).toBe('AI 超时')
    expect(byWord['甲'].status).toBe('ready')
    expect(byWord['丙'].status).toBe('ready')
    expect(c.failedCount()).toBe(1)
  })

  it('confirm 成功：调 saveDraft(word, draft)，状态 saved', async () => {
    const saveDraft = vi.fn(async () => true)
    const c = createBatchFill(['甲'], { queryWord: async (w) => ({ ok: true, draft: draft(w) }), saveDraft })
    await c.run()
    const ok = await c.confirm('甲')
    expect(ok).toBe(true)
    expect(saveDraft).toHaveBeenCalledWith('甲', expect.objectContaining({ word: '甲' }))
    expect(c.items()[0].status).toBe('saved')
    expect(c.savedCount()).toBe(1)
  })

  it('confirm 失败：状态保持 ready 且可重试', async () => {
    const saveDraft = vi.fn(async () => false)
    const c = createBatchFill(['甲'], { queryWord: async (w) => ({ ok: true, draft: draft(w) }), saveDraft })
    await c.run()
    expect(await c.confirm('甲')).toBe(false)
    expect(c.items()[0].status).toBe('ready')
    expect(c.items()[0].error).toBe('保存失败，请重试')
    // 重试成功
    saveDraft.mockResolvedValueOnce(true)
    expect(await c.confirm('甲')).toBe(true)
    expect(c.items()[0].status).toBe('saved')
  })

  it('confirm 守卫：非 ready 状态返回 false 且不调 saveDraft', async () => {
    const saveDraft = vi.fn(async () => true)
    const c = createBatchFill(['甲', '乙'], { queryWord: async (w) => ({ ok: true, draft: draft(w) }), saveDraft })
    expect(await c.confirm('甲')).toBe(false) // queued
    await c.run()
    c.skip('甲')
    expect(await c.confirm('甲')).toBe(false) // skipped
    expect(await c.confirm('不存在的词')).toBe(false)
    expect(saveDraft).not.toHaveBeenCalled()
  })

  it('skip：ready → skipped；非 ready 无效', async () => {
    const c = createBatchFill(['甲', '乙'], { queryWord: async (w) => ({ ok: true, draft: draft(w) }), saveDraft: async () => true })
    c.skip('甲') // queued 无效
    expect(c.items()[0].status).toBe('queued')
    await c.run()
    c.skip('甲')
    expect(c.items()[0].status).toBe('skipped')
    expect(c.skippedCount()).toBe(1)
  })

  it('cancel：当前查询完成后停止，后续词不再查询', async () => {
    let resolveSecond: (v: { ok: true; draft: AiDraftResult }) => void = () => {}
    const queryWord = vi.fn(async (word: string, seq: number): Promise<QueryOutcome> => {
      if (seq === 1) {
        return new Promise<QueryOutcome>((r) => {
          resolveSecond = r
        })
      }
      return { ok: true, draft: draft(word) }
    })
    const c = createBatchFill(['甲', '乙', '丙'], { queryWord, saveDraft: async () => true })
    const runPromise = c.run()
    await flushPromises() // 甲完成，乙查询挂起
    expect(c.items()[0].status).toBe('ready')
    expect(c.items()[1].status).toBe('querying')
    c.cancel()
    resolveSecond({ ok: true, draft: draft('乙') })
    await runPromise
    expect(c.cancelled()).toBe(true)
    expect(c.items()[1].status).toBe('ready') // 在途查询正常完成
    expect(c.items()[2].status).toBe('queued') // 未开始
    expect(queryWord).toHaveBeenCalledTimes(2) // 丙未被查询
  })

  it('空列表：直接 done，无查询', async () => {
    const queryWord = vi.fn()
    const c = createBatchFill([], { queryWord, saveDraft: async () => true })
    await c.run()
    expect(c.done()).toBe(true)
    expect(c.total()).toBe(0)
    expect(queryWord).not.toHaveBeenCalled()
  })

  it('run 幂等：running 中重复 run 无效；done 后可重置重跑', async () => {
    const queryWord = vi.fn(async (w: string, _seq: number): Promise<QueryOutcome> => ({ ok: true, draft: draft(w) }))
    const c = createBatchFill(['甲'], { queryWord, saveDraft: async () => true })
    const p1 = c.run()
    const p2 = c.run() // running 中 → no-op
    await Promise.all([p1, p2])
    expect(queryWord).toHaveBeenCalledTimes(1)
    await c.run() // done → 重置重跑
    expect(queryWord).toHaveBeenCalledTimes(2)
  })

  it('onChange：状态变更时回调', async () => {
    const onChange = vi.fn()
    const c = createBatchFill(['甲'], { queryWord: async (w) => ({ ok: true, draft: draft(w) }), saveDraft: async () => true, onChange })
    await c.run()
    expect(onChange.mock.calls.length).toBeGreaterThanOrEqual(3) // run 开始 + 状态翻转 + run 结束
    await c.confirm('甲')
    expect(onChange.mock.calls.length).toBeGreaterThanOrEqual(4)
  })

  it('batchSummary：saved/failed/skipped/remaining 聚合', async () => {
    const c = createBatchFill(['甲', '乙', '丙'], {
      queryWord: async (w) => (w === '乙' ? { ok: false, reason: 'x' } : { ok: true, draft: draft(w) }),
      saveDraft: async () => true
    })
    await c.run()
    await c.confirm('甲')
    c.skip('丙')
    expect(batchSummary(c)).toEqual({ saved: 1, failed: 1, skipped: 1, remaining: 0 })
  })
})

// ---------------------------------------------------------------------------
// PendingPage 集成（V2-H）
// ---------------------------------------------------------------------------

describe('PendingPage 批量 AI 补全（V2-H）', () => {
  it('无 key（aiMode=disabled）：入口禁用 + 提示配置；点击不触发 AI 查询', async () => {
    const { wrapper, aiSearchWord } = await mountPending({ aiMode: 'disabled', pending: ['生僻词甲'] })
    const btn = wrapper.find('[data-testid="batch-fill-start"]')
    expect(btn.attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="batch-ai-hint"]').exists()).toBe(true)
    await btn.trigger('click')
    await flushPromises()
    expect(aiSearchWord).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="batch-panel"]').exists()).toBe(false)
  })

  it('aiMode=error：入口禁用并提示不可用', async () => {
    const { wrapper } = await mountPending({ aiMode: 'error', pending: ['生僻词甲'] })
    expect(wrapper.find('[data-testid="batch-fill-start"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="batch-ai-hint"]').text()).toContain('AI 模式「异常」不可用')
  })

  it('aiMode=online + 生词：入口可用 → 点击开始批量 → 逐词查询并展示预览/进度', async () => {
    const { wrapper, aiSearchWord } = await mountPending({
      aiMode: 'online',
      pending: ['生僻词甲', '生僻词乙']
    })
    expect(wrapper.find('[data-testid="batch-fill-start"]').attributes('disabled')).toBeUndefined()
    await wrapper.find('[data-testid="batch-fill-start"]').trigger('click')
    await flushPromises()
    await nextTick()
    expect(aiSearchWord).toHaveBeenCalledTimes(2)
    expect(aiSearchWord.mock.calls[0][0]).toBe('生僻词甲')
    expect(String(aiSearchWord.mock.calls[0][1])).toMatch(/^batch-0-/)
    expect(wrapper.find('[data-testid="batch-panel"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="batch-item"]').length).toBe(2)
    const ready = wrapper.findAll('[data-testid="batch-item"]')
    expect(ready[0].attributes('data-status')).toBe('ready')
    expect(ready[0].text()).toContain('释义：生僻词甲')
  })

  it('确认入库：写个人库（quality=user，与 V2-F 一致）+ progress 闪卡队列 + 移出生词本', async () => {
    const { wrapper, api } = await mountPending({
      aiMode: 'online',
      pending: ['生僻词甲', '生僻词乙']
    })
    await wrapper.find('[data-testid="batch-fill-start"]').trigger('click')
    await flushPromises()
    await nextTick()
    await wrapper.find('[data-testid="batch-confirm"]').trigger('click')
    await flushPromises()
    await nextTick()
    // 个人库注册表已收录（quality=user / library=user）
    const saved = findPersonal('生僻词甲')
    expect(saved).toBeDefined()
    expect(saved?.quality).toBe('user')
    expect(saved?.library).toBe('user')
    expect(saved?.meaning).toContain('释义：生僻词甲')
    // 闪卡队列：progress 已写（recordAttempt + flush → progress.save）
    expect(api.progress.save).toHaveBeenCalled()
    // 生词本移出已入库词
    expect(api.pending.remove).toHaveBeenCalledWith('生僻词甲')
    expect(wrapper.findAll('[data-testid="pending-row"]').length).toBe(1)
    expect(wrapper.find('[data-testid="batch-item"][data-word="生僻词甲"]').attributes('data-status')).toBe('saved')
  })

  it('确认入库去重：同词已收录时二次确认幂等成功，个人库仅一条', async () => {
    const { wrapper } = await mountPending({ aiMode: 'online', pending: ['生僻词甲'] })
    await wrapper.find('[data-testid="batch-fill-start"]').trigger('click')
    await flushPromises()
    await nextTick()
    const confirmBtn = wrapper.find('[data-testid="batch-confirm"]')
    await confirmBtn.trigger('click')
    await flushPromises()
    await nextTick()
    expect(listPersonalLibrary().filter((i) => i.word === '生僻词甲').length).toBe(1)
    // 再次确认（去重路径）仍成功
    await confirmBtn.trigger('click')
    await flushPromises()
    await nextTick()
    expect(listPersonalLibrary().filter((i) => i.word === '生僻词甲').length).toBe(1)
  })

  it('跳过：状态 skipped，生词保留', async () => {
    const { wrapper } = await mountPending({ aiMode: 'online', pending: ['生僻词甲'] })
    await wrapper.find('[data-testid="batch-fill-start"]').trigger('click')
    await flushPromises()
    await nextTick()
    await wrapper.find('[data-testid="batch-skip"]').trigger('click')
    await nextTick()
    expect(wrapper.find('[data-testid="batch-item"]').attributes('data-status')).toBe('skipped')
    expect(findPersonal('生僻词甲')).toBeUndefined()
    expect(wrapper.findAll('[data-testid="pending-row"]').length).toBe(1)
  })

  it('查询失败：展示失败原因，不影响其他词', async () => {
    const { wrapper } = await mountPending({ aiMode: 'online', pending: ['触发失败词', '正常词'] })
    await wrapper.find('[data-testid="batch-fill-start"]').trigger('click')
    await flushPromises()
    await nextTick()
    const failed = wrapper.find('[data-testid="batch-item"][data-word="触发失败词"]')
    expect(failed.attributes('data-status')).toBe('failed')
    expect(failed.text()).toContain('查询失败：模拟超时')
    expect(wrapper.find('[data-testid="batch-item"][data-word="正常词"]').attributes('data-status')).toBe('ready')
  })

  it('取消：停止后续查询，显示完成小结', async () => {
    const { wrapper, aiSearchWord } = await mountPending({ aiMode: 'online', pending: ['甲词', '乙词', '丙词'] })
    // 让第二个查询挂起，便于取消
    let release: () => void = () => {}
    aiSearchWord.mockImplementationOnce(async () => ({ ok: true, data: { draft: draft('甲词'), cached: false } }))
    aiSearchWord.mockImplementationOnce(
      () => new Promise((r) => { release = () => r({ ok: true, data: { draft: draft('乙词'), cached: false } }) })
    )
    await wrapper.find('[data-testid="batch-fill-start"]').trigger('click')
    await flushPromises()
    await nextTick()
    expect(wrapper.find('[data-testid="batch-progress-text"]').text()).toContain('正在查询第 2/3 词')
    await wrapper.find('[data-testid="batch-cancel"]').trigger('click')
    release()
    await flushPromises()
    await nextTick()
    expect(aiSearchWord).toHaveBeenCalledTimes(2) // 丙词未查询
    expect(wrapper.find('[data-testid="batch-done-summary"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="batch-item"]')[2].attributes('data-status')).toBe('queued')
  })

  it('完成小结与关闭：显示统计，关闭后面板消失', async () => {
    const { wrapper } = await mountPending({ aiMode: 'online', pending: ['生僻词甲'] })
    await wrapper.find('[data-testid="batch-fill-start"]').trigger('click')
    await flushPromises()
    await nextTick()
    expect(wrapper.find('[data-testid="batch-done-summary"]').text()).toContain('已入库 0 · 失败 0 · 跳过 0')
    await wrapper.find('[data-testid="batch-dismiss"]').trigger('click')
    await nextTick()
    expect(wrapper.find('[data-testid="batch-panel"]').exists()).toBe(false)
  })

  it('空生词本：入口禁用，无 AI 提示条', async () => {
    const { wrapper } = await mountPending({ aiMode: 'online', pending: [] })
    expect(wrapper.find('[data-testid="batch-fill-start"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="batch-ai-hint"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="pending-empty"]').exists()).toBe(true)
  })

  it('既有行为不回归：列表渲染 / 立即复习未收录提示 / 删除', async () => {
    const { wrapper, api } = await mountPending({ aiMode: 'disabled', pending: ['鞠躬尽瘁', '未收录词xyz'] })
    expect(wrapper.findAll('[data-testid="pending-row"]').length).toBe(2)
    expect(wrapper.find('[data-testid="pending-count"]').text()).toContain('共 2 条')
    // 立即复习：未收录 → 提示
    await wrapper.find('[data-testid="pending-review"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="pending-hint"]').text()).toContain('无法记录复习进度')
    // 删除
    await wrapper.find('[data-testid="pending-remove"]').trigger('click')
    await flushPromises()
    expect(api.pending.remove).toHaveBeenCalled()
    expect(wrapper.findAll('[data-testid="pending-row"]').length).toBe(1)
  })
})
