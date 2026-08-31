/**
 * T7 闪卡测试（AC-05 收敛规则 / §3.3 单卡流与空态 / §3.4 撤销与小结 / §10.3#6 flush）
 * - lib/flashcards.ts 纯逻辑：收敛规则（3 认识→mastered / 1 不认识→learning）、跟踪器、小结计数、牌堆过滤
 * - FlashcardCard：正面词形 / 翻面释义 + 判定徽标
 * - FlashcardsPage：判定→翻面→下一张、撤销回退、会话小结、空态引导、进度写入与 flush
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { VueWrapper } from '@vue/test-utils'
import type { Idiom, YuzhanApi } from '../shared/ipc/contracts'
import {
  MASTERED_AFTER_KNOWN,
  INITIAL_FLASHCARD_STATUS,
  FlashcardTracker,
  applyJudgment,
  buildReviewDeck,
  emptySummary,
  flashcardTracker,
  recordJudgment,
  unrecordJudgment
} from '../src/renderer/src/lib/flashcards'
import FlashcardCard from '../src/renderer/src/components/flashcard/FlashcardCard.vue'
import FlashcardsPage from '../src/renderer/src/views/FlashcardsPage.vue'

// ---------------------------------------------------------------------------
// 夹具
// ---------------------------------------------------------------------------

const fixtureA: Idiom = {
  schemaVersion: 1,
  id: 'ju-gong-jin-cui-01',
  word: '鞠躬尽瘁',
  pinyin: 'jū gōng jìn cuì',
  meaning: '小心谨慎，贡献出全部力量直到死，形容忠诚奉献。',
  origin: '三国·蜀·诸葛亮《后出师表》',
  emotion: '褒',
  register: '无',
  errorTypes: ['形近/音近混淆'],
  frequency: 4,
  quality: 'reviewed',
  library: 'official',
  verifiedBy: '用户',
  updatedAt: '2026-08-31'
}

const fixtureB: Idiom = {
  ...fixtureA,
  id: 'bu-jing-er-zou-01',
  word: '不胫而走',
  pinyin: 'bù jìng ér zǒu',
  meaning: '没有腿却能跑，比喻消息等迅速传开。',
  origin: '汉·孔融《论盛孝章书》',
  emotion: '中性',
  register: '无',
  frequency: 3
}

// ---------------------------------------------------------------------------
// 纯逻辑：收敛规则（AC-05）
// ---------------------------------------------------------------------------

describe('applyJudgment 收敛规则（AC-05）', () => {
  it('连续 3 次认识 → mastered；此前为 learning', () => {
    expect(MASTERED_AFTER_KNOWN).toBe(3)
    const s1 = applyJudgment(INITIAL_FLASHCARD_STATUS, 'known')
    expect(s1).toEqual({ status: 'learning', consecutiveKnown: 1 })
    const s2 = applyJudgment(s1, 'known')
    expect(s2).toEqual({ status: 'learning', consecutiveKnown: 2 })
    const s3 = applyJudgment(s2, 'known')
    expect(s3).toEqual({ status: 'mastered', consecutiveKnown: 3 })
    // 已 mastered 后再认识保持 mastered
    const s4 = applyJudgment(s3, 'known')
    expect(s4.status).toBe('mastered')
  })

  it('1 次不认识 → 降级 learning 且计数清零（含 mastered 降级）', () => {
    const mastered = { status: 'mastered' as const, consecutiveKnown: 3 }
    const s = applyJudgment(mastered, 'unknown')
    expect(s).toEqual({ status: 'learning', consecutiveKnown: 0 })

    // 新词直接不认识 → learning
    expect(applyJudgment(INITIAL_FLASHCARD_STATUS, 'unknown')).toEqual({
      status: 'learning',
      consecutiveKnown: 0
    })
  })

  it('不认识中断连续计数：认识×2 → 不认识 → 认识重新从 1 计', () => {
    const a = applyJudgment(INITIAL_FLASHCARD_STATUS, 'known')
    const b = applyJudgment(a, 'known')
    const c = applyJudgment(b, 'unknown')
    expect(c).toEqual({ status: 'learning', consecutiveKnown: 0 })
    const d = applyJudgment(c, 'known')
    expect(d).toEqual({ status: 'learning', consecutiveKnown: 1 })
  })
})

describe('FlashcardTracker 会话跟踪', () => {
  it('judge 返回判定前后状态并保存', () => {
    const t = new FlashcardTracker()
    const { before, after } = t.judge('a-01', 'known')
    expect(before).toEqual(INITIAL_FLASHCARD_STATUS)
    expect(after.consecutiveKnown).toBe(1)
    expect(t.get('a-01').consecutiveKnown).toBe(1)
  })

  it('revert 恢复到判定前状态；初始态恢复后删除记录', () => {
    const t = new FlashcardTracker()
    const { before } = t.judge('a-01', 'known')
    t.judge('a-01', 'known')
    t.revert('a-01', before)
    expect(t.get('a-01')).toEqual(INITIAL_FLASHCARD_STATUS)

    t.revert('a-01', INITIAL_FLASHCARD_STATUS)
    expect(t.get('a-01')).toEqual(INITIAL_FLASHCARD_STATUS)
  })

  it('reset 清空全部', () => {
    const t = new FlashcardTracker()
    t.judge('a-01', 'known')
    t.reset()
    expect(t.get('a-01')).toEqual(INITIAL_FLASHCARD_STATUS)
  })
})

describe('小结计数与牌堆过滤', () => {
  it('recordJudgment / unrecordJudgment 计数与回退（不低于 0）', () => {
    let s = emptySummary()
    s = recordJudgment(s, 'known')
    s = recordJudgment(s, 'known')
    s = recordJudgment(s, 'unknown')
    expect(s).toEqual({ known: 2, unknown: 1 })

    s = unrecordJudgment(s, 'unknown')
    expect(s).toEqual({ known: 2, unknown: 0 })
    s = unrecordJudgment(s, 'known')
    expect(s).toEqual({ known: 1, unknown: 0 })
    // 回退到 0 不再下降
    expect(unrecordJudgment({ known: 0, unknown: 0 }, 'known')).toEqual({ known: 0, unknown: 0 })
  })

  it('buildReviewDeck：仅过滤 mastered', () => {
    const items = [fixtureA, fixtureB]
    const isMastered = (id: string): boolean => id === 'ju-gong-jin-cui-01'
    const deck = buildReviewDeck(items, isMastered)
    expect(deck.map((i) => i.id)).toEqual(['bu-jing-er-zou-01'])
  })

  it('buildReviewDeck：Fisher-Yates 洗牌保留集合，随机源可注入（FIX-1）', () => {
    const items = [fixtureA, fixtureB]
    const isMastered = (): boolean => false
    // 集合/计数不变（顺序无关）
    const deck = buildReviewDeck(items, isMastered)
    expect(deck).toHaveLength(2)
    expect(new Set(deck.map((i) => i.id))).toEqual(
      new Set(['ju-gong-jin-cui-01', 'bu-jing-er-zou-01'])
    )
    // random 恒 0 → j=0 交换 → 确定性反转（验证洗牌确实执行）
    const deck0 = buildReviewDeck(items, isMastered, () => 0)
    expect(deck0.map((i) => i.id)).toEqual(['bu-jing-er-zou-01', 'ju-gong-jin-cui-01'])
    // random 恒 0.999… → j=i → 保持原序
    const deckSame = buildReviewDeck(items, isMastered, () => 0.999)
    expect(deckSame.map((i) => i.id)).toEqual(['ju-gong-jin-cui-01', 'bu-jing-er-zou-01'])
  })
})

// ---------------------------------------------------------------------------
// FlashcardCard 组件
// ---------------------------------------------------------------------------

describe('FlashcardCard 翻面', () => {
  it('未判定：显示正面词形，无判定徽标', () => {
    const w = mount(FlashcardCard, { props: { idiom: fixtureA, flipped: false, judgment: null } })
    expect(w.find('[data-testid="card-front"] .front-word').text()).toBe('鞠躬尽瘁')
    expect(w.find('.flip-inner.flipped').exists()).toBe(false)
    expect(w.find('[data-testid="judge-badge"]').exists()).toBe(false)
  })

  it('判定后：翻面展示释义 + 认识徽标', async () => {
    const w = mount(FlashcardCard, { props: { idiom: fixtureA, flipped: true, judgment: 'known' } })
    expect(w.find('.flip-inner.flipped').exists()).toBe(true)
    expect(w.find('[data-testid="card-back"] .back-meaning').text()).toContain('忠诚奉献')
    expect(w.find('[data-testid="judge-badge"]').text()).toBe('认识')
  })

  it('不认识徽标', () => {
    const w = mount(FlashcardCard, { props: { idiom: fixtureB, flipped: true, judgment: 'unknown' } })
    expect(w.find('[data-testid="judge-badge"]').text()).toBe('不认识')
  })
})

// ---------------------------------------------------------------------------
// FlashcardsPage 页面（单卡流 / 撤销 / 小结 / 空态 / flush）
// ---------------------------------------------------------------------------

function stubWindowApi(opts: { items?: Idiom[] } = {}): { save: ReturnType<typeof vi.fn> } {
  const save = vi.fn().mockResolvedValue({ ok: true, data: null })
  const api = {
    data: {
      list: vi.fn().mockResolvedValue({ ok: true, data: { items: opts.items ?? [fixtureA, fixtureB], version: '1.0.0' } }),
      get: vi.fn()
    },
    pairs: { list: vi.fn(async () => ({ ok: true, data: { pairs: [] } })) },
    progress: { save, list: vi.fn(async () => ({ ok: true, data: { items: {} } })) },
    pending: { list: vi.fn(), add: vi.fn(), remove: vi.fn() },
    quiz: { record: vi.fn(), history: { list: vi.fn(async () => ({ ok: true, data: { items: [] } })), add: vi.fn(async () => ({ ok: true, data: null })) } },
    settings: { get: vi.fn(), set: vi.fn() },
    log: vi.fn()
  } as unknown as YuzhanApi
  ;(window as unknown as { api: YuzhanApi }).api = api
  return { save }
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/flashcards', component: FlashcardsPage },
      { path: '/idioms', component: { template: '<div>list</div>' } },
      { path: '/quiz', component: { template: '<div>quiz</div>' } }
    ]
  })
}

async function mountPage() {
  const router = makeRouter()
  await router.push('/flashcards')
  await router.isReady()
  const pinia = createPinia()
  const { save } = stubWindowApi()
  const w = mount(FlashcardsPage, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { w, router, pinia, save }
}

describe('FlashcardsPage 单卡复习流', () => {
  beforeEach(() => {
    flashcardTracker.reset()
  })

  afterEach(() => {
    delete (window as unknown as { api?: unknown }).api
  })

  /** 词形 → id（牌堆已洗牌，按当前第一张词形取 id，断言顺序无关） */
  const WORD_TO_ID: Record<string, string> = {
    鞠躬尽瘁: 'ju-gong-jin-cui-01',
    不胫而走: 'bu-jing-er-zou-01'
  }
  /** 词形 → 释义片段（翻面断言按当前卡匹配） */
  const WORD_TO_MEANING: Record<string, string> = {
    鞠躬尽瘁: '忠诚奉献',
    不胫而走: '没有腿却能跑'
  }

  it('牌堆构建：展示第一张正面，认识判定后翻面展示释义并写入进度', async () => {
    const { w } = await mountPage()
    expect(w.find('[data-testid="session"]').exists()).toBe(true)
    // FIX-1 洗牌后首卡随机：断言为两卡之一（顺序无关）
    const firstWord = w.find('.front-word').text()
    expect(['鞠躬尽瘁', '不胫而走']).toContain(firstWord)
    expect(w.find('[data-testid="progress-text"]').exists()).toBe(true)

    await w.find('[data-testid="known-button"]').trigger('click')
    await flushPromises()
    expect(w.find('.flip-inner.flipped').exists()).toBe(true)
    expect(w.find('[data-testid="card-back"] .back-meaning').text()).toContain(
      WORD_TO_MEANING[firstWord]
    )
    expect(w.find('[data-testid="judge-badge"]').text()).toBe('认识')
    // 收敛规则：第 1 次认识 → learning
    expect(w.find('[data-testid="next-button"]').exists()).toBe(true)
    w.unmount()
    await flushPromises()
  })

  it('不认识判定：降级 learning 并展示释义', async () => {
    const { w } = await mountPage()
    await w.find('[data-testid="unknown-button"]').trigger('click')
    await flushPromises()
    expect(w.find('.flip-inner.flipped').exists()).toBe(true)
    expect(w.find('[data-testid="judge-badge"]').text()).toBe('不认识')
    w.unmount()
    await flushPromises()
  })

  it('撤销上一步：误点可回退，恢复正面与进度', async () => {
    const { w, pinia } = await mountPage()
    const firstWord = w.find('.front-word').text()
    const firstId = WORD_TO_ID[firstWord]
    await w.find('[data-testid="known-button"]').trigger('click')
    await flushPromises()

    // 撤销按钮出现
    expect(w.find('[data-testid="undo-button"]').exists()).toBe(true)
    await w.find('[data-testid="undo-button"]').trigger('click')
    await flushPromises()

    expect(w.find('.flip-inner.flipped').exists()).toBe(false)
    expect(w.find('[data-testid="judge-badge"]').exists()).toBe(false)
    expect(w.find('[data-testid="undo-button"]').exists()).toBe(false)

    // 进度恢复为未判定（new）——按实际首卡 id 断言（顺序无关）
    const { useProgressStore } = await import('../src/renderer/src/stores/progress')
    const store = useProgressStore(pinia)
    expect(store.getProgressItem(firstId)?.status).toBe('new')
    w.unmount()
    await flushPromises()
  })

  it('翻完一叠 → 会话小结（认识 X / 不认识 Y）并强制 flush', async () => {
    const { w, save } = await mountPage() // 牌堆 2 张（洗牌后顺序不定）

    // 第 1 张：认识
    const firstWord = w.find('.front-word').text()
    await w.find('[data-testid="known-button"]').trigger('click')
    await flushPromises()
    await w.find('[data-testid="next-button"]').trigger('click')
    await flushPromises()

    // 第 2 张：不认识（顺序无关：断言为另一张）
    const secondWord = w.find('.front-word').text()
    expect(secondWord).not.toBe(firstWord)
    expect(['鞠躬尽瘁', '不胫而走']).toContain(secondWord)
    await w.find('[data-testid="unknown-button"]').trigger('click')
    await flushPromises()
    await w.find('[data-testid="next-button"]').trigger('click') // 完成本轮
    await flushPromises()

    // 会话小结（根 div class=summary 自带 session-summary testid；inner testid 不受 fallthrough 影响）
    expect(w.find('.summary').exists()).toBe(true)
    expect(w.find('[data-testid="session-summary"]').exists()).toBe(true)
    expect(w.find('[data-testid="summary-known"]').text()).toBe('1')
    expect(w.find('[data-testid="summary-unknown"]').text()).toBe('1')
    // 会话结束强制 flush → progress.save 被调用
    await flushPromises()
    expect(save).toHaveBeenCalled()
    w.unmount()
    await flushPromises()
  })

  it('再来一轮：重新构建牌堆并重置会话', async () => {
    const { w } = await mountPage()
    await w.find('[data-testid="known-button"]').trigger('click')
    await flushPromises()
    await w.find('[data-testid="next-button"]').trigger('click')
    await flushPromises()
    await w.find('[data-testid="unknown-button"]').trigger('click')
    await flushPromises()
    await w.find('[data-testid="next-button"]').trigger('click')
    await flushPromises()

    expect(w.find('.summary').exists()).toBe(true)
    expect(w.find('[data-testid="session-summary"]').exists()).toBe(true)
    await w.find('[data-testid="restart-button"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="session"]').exists()).toBe(true)
    // 重新洗牌：首卡为两卡之一（顺序无关）
    expect(['鞠躬尽瘁', '不胫而走']).toContain(w.find('.front-word').text())
    w.unmount()
    await flushPromises()
  })

  it('无待复习卡（预置全部 mastered）→ 空态引导去成语库/自测', async () => {
    const { useProgressStore } = await import('../src/renderer/src/stores/progress')
    const pinia = createPinia()
    const store = useProgressStore(pinia)
    stubWindowApi()
    store.markStatus('ju-gong-jin-cui-01', 'mastered')
    store.markStatus('bu-jing-er-zou-01', 'mastered')
    await store.flush() // 清掉节流定时器，避免跨用例残留

    const router = makeRouter()
    await router.push('/flashcards')
    await router.isReady()
    const w = mount(FlashcardsPage, { global: { plugins: [pinia, router] } })
    await flushPromises()

    expect(w.find('[data-testid="state-empty"]').exists()).toBe(true)
    expect(w.text()).toContain('暂无待复习的成语')
    expect(w.text()).toContain('去成语库浏览')
    expect(w.text()).toContain('去自测积累')
    w.unmount()
  })
})

// ---------------------------------------------------------------------------
// AC-05 页面级收敛：同一词跨会话连续 3 次认识 → mastered
// （FlashcardTracker 模块级单例在应用运行期内保持连续计数）
// ---------------------------------------------------------------------------

describe('AC-05 页面级：连续 3 次认识 → mastered', () => {
  beforeEach(() => {
    flashcardTracker.reset()
  })

  afterEach(() => {
    delete (window as unknown as { api?: unknown }).api
  })

  it('同一词（fixture 单张牌堆）连续 3 次认识后状态为 mastered', async () => {
    const { useProgressStore } = await import('../src/renderer/src/stores/progress')

    // 三次独立会话（重新挂载页面），tracker 单例保持计数
    for (let i = 0; i < 3; i++) {
      stubWindowApi({ items: [fixtureA] })
      const pinia = createPinia()
      const store = useProgressStore(pinia)
      const router = makeRouter()
      await router.push('/flashcards')
      await router.isReady()
      const w = mount(FlashcardsPage, { global: { plugins: [pinia, router] } })
      await flushPromises()

      await w.find('[data-testid="known-button"]').trigger('click')
      await flushPromises()
      await w.find('[data-testid="next-button"]').trigger('click') // 完成本轮
      await flushPromises()
      w.unmount()

      const st = store.getProgressItem('ju-gong-jin-cui-01')
      expect(st?.status).toBe(i < 2 ? 'learning' : 'mastered')
    }
  })

  it('认识×2 后 1 次不认识 → learning 且计数清零，再认识需重新累计', async () => {
    const t = new FlashcardTracker()
    t.judge('a-01', 'known')
    t.judge('a-01', 'known')
    t.judge('a-01', 'unknown')
    expect(t.get('a-01')).toEqual({ status: 'learning', consecutiveKnown: 0 })
  })
})

// ---------------------------------------------------------------------------
// v0.2.6 迭代（§16.3 P0-①）：闪卡键盘快捷键 1/2/空格/U
// ---------------------------------------------------------------------------

describe('FlashcardsPage 键盘快捷键（v0.2.6 P0-①）', () => {
  beforeEach(() => {
    flashcardTracker.reset()
  })

  afterEach(() => {
    delete (window as unknown as { api?: unknown }).api
  })

  /** 在 window 上派发按键（页面挂载时注册的监听器接收） */
  async function press(w: VueWrapper, key: string): Promise<void> {
    window.dispatchEvent(new KeyboardEvent('keydown', { key }))
    await flushPromises()
  }

  it('按 1 → 认识判定翻面；再按空格 → 下一张恢复正面', async () => {
    const { w } = await mountPage()
    expect(w.find('[data-testid="session"]').exists()).toBe(true)
    await press(w, '1')
    expect(w.find('.flip-inner.flipped').exists()).toBe(true)
    expect(w.find('[data-testid="judge-badge"]').text()).toBe('认识')
    // 空格 → 下一张（两张牌堆未结束 → 恢复正面）
    await press(w, ' ')
    expect(w.find('.flip-inner.flipped').exists()).toBe(false)
    w.unmount()
    await flushPromises()
  })

  it('按 2 → 不认识判定翻面', async () => {
    const { w } = await mountPage()
    await press(w, '2')
    expect(w.find('.flip-inner.flipped').exists()).toBe(true)
    expect(w.find('[data-testid="judge-badge"]').text()).toBe('不认识')
    w.unmount()
    await flushPromises()
  })

  it('按 U（小写 u）→ 撤销上一步恢复正面', async () => {
    const { w } = await mountPage()
    await press(w, '1')
    expect(w.find('.flip-inner.flipped').exists()).toBe(true)
    await press(w, 'u')
    expect(w.find('.flip-inner.flipped').exists()).toBe(false)
    expect(w.find('[data-testid="undo-button"]').exists()).toBe(false)
    w.unmount()
    await flushPromises()
  })

  it('输入框聚焦时按 1 不触发判定（防误触）', async () => {
    const { w } = await mountPage()
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    input.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }))
    await flushPromises()
    // 未翻面（事件 target 为 input → 跳过）
    expect(w.find('.flip-inner.flipped').exists()).toBe(false)
    input.remove()
    w.unmount()
    await flushPromises()
  })
})
