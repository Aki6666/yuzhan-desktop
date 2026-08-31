/**
 * T5 成语详情卡片测试（AC-02 离线渲染 / §3.4 辨析组默认折叠 / §5.1 考点字段）
 * - detailFormat 纯函数：多义项拆分、例句标注
 * - IdiomDetailCard：释义（多义项分号分隔渲染）/出处/色彩/语域/误用类型/反义/例句/频次/主题
 * - NearDiffGroup：默认折叠，点击展开 diff，再点收起
 * - ExampleList：exam 带卷别、made 标注
 * - IdiomDetailPage：路由参数 → store 消费 → 卡片 / 加载中 / 失败重试 / 未收录空态
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { Idiom, YuzhanApi } from '../shared/ipc/contracts'
import { exampleBadge, splitMeanings } from '../src/renderer/src/components/idiom-detail/detailFormat'
import IdiomDetailCard from '../src/renderer/src/components/idiom-detail/IdiomDetailCard.vue'
import NearDiffGroup from '../src/renderer/src/components/idiom-detail/NearDiffGroup.vue'
import ExampleList from '../src/renderer/src/components/idiom-detail/ExampleList.vue'
import IdiomDetailPage from '../src/renderer/src/views/IdiomDetailPage.vue'

// ---------------------------------------------------------------------------
// 夹具
// ---------------------------------------------------------------------------

const fixture: Idiom = {
  schemaVersion: 1,
  id: 'ju-gong-jin-cui-01',
  word: '鞠躬尽瘁',
  pinyin: 'jū gōng jìn cuì',
  meaning: '小心谨慎，贡献出全部力量直到死，形容忠诚奉献；现多泛指全心全意付出。',
  origin: '三国·蜀·诸葛亮《后出师表》',
  usage: '多用于忠诚奉献。【误用判定依据】§5.2 形近/音近混淆。',
  emotion: '褒',
  register: '谦辞',
  near: [
    { word: '殚精竭虑', diff: '鞠躬尽瘁重忠诚奉献、死而后已，殚精竭虑重用尽心思竭尽全力' },
    { word: '呕心沥血', diff: '鞠躬尽瘁重"至死方休"的忠诚，呕心沥血重"耗尽心血"的付出' }
  ],
  opposite: ['半途而废', '见异思迁'],
  errorTypes: ['形近/音近混淆'],
  examples: [
    { text: '他鞠躬尽瘁，为人民服务一生。', exam: '2024-国考-副省级', kind: 'exam' },
    { text: '他日夜操劳，鞠躬尽瘁。', kind: 'made' }
  ],
  frequency: 4,
  exams: ['2024-国考-副省级'],
  tags: ['态度奉献'],
  quality: 'reviewed',
  library: 'official',
  verifiedBy: '用户',
  updatedAt: '2026-08-31'
}

function listOk(items: Idiom[]): { ok: true; data: { items: Idiom[]; version: string } } {
  return { ok: true, data: { items, version: 'test-1.0.0' } }
}

function listErr(message: string): { ok: false; error: { code: 'IO_ERROR'; message: string } } {
  return { ok: false, error: { code: 'IO_ERROR', message } }
}

// ---------------------------------------------------------------------------
// detailFormat 纯函数
// ---------------------------------------------------------------------------

describe('detailFormat 纯函数', () => {
  it('splitMeanings：按「；」拆分多义项并去空白/空项', () => {
    expect(splitMeanings('甲义；乙义；丙义')).toEqual(['甲义', '乙义', '丙义'])
    expect(splitMeanings(' 单一义项 ')).toEqual(['单一义项'])
    expect(splitMeanings('甲义；；乙义；')).toEqual(['甲义', '乙义'])
  })

  it('exampleBadge：exam 带卷别 / exam 无卷别兜底 / made 标注自造', () => {
    expect(exampleBadge('exam', '2023-国考-副省级')).toBe('真题 · 2023-国考-副省级')
    expect(exampleBadge('exam', '  ')).toBe('真题')
    expect(exampleBadge('made')).toBe('自造')
    expect(exampleBadge('made', '2023-国考-副省级')).toBe('自造')
  })
})

// ---------------------------------------------------------------------------
// IdiomDetailCard
// ---------------------------------------------------------------------------

describe('IdiomDetailCard 考点字段渲染（§5.1）', () => {
  it('渲染词形、拼音与频次点', () => {
    const w = mount(IdiomDetailCard, { props: { idiom: fixture } })
    expect(w.find('.word').text()).toBe('鞠躬尽瘁')
    expect(w.find('.pinyin').text()).toBe('jū gōng jìn cuì')
    expect(w.findAll('.freq-dot.on')).toHaveLength(4)
    expect(w.find('.freq-num').text()).toBe('4/5')
  })

  it('释义多义项分号分隔渲染：分号拆成多条，无分号单条', () => {
    const multi = mount(IdiomDetailCard, { props: { idiom: fixture } })
    const senses = multi.findAll('.sense-item')
    expect(senses).toHaveLength(2)
    expect(senses[0]?.text()).toContain('小心谨慎')
    expect(senses[1]?.text()).toContain('现多泛指')

    const single = mount(IdiomDetailCard, {
      props: { idiom: { ...fixture, meaning: '单一义项释义' } }
    })
    expect(single.findAll('.sense-item')).toHaveLength(0)
    expect(single.find('.meaning').text()).toBe('单一义项释义')
  })

  it('渲染出处、适用与反义', () => {
    const w = mount(IdiomDetailCard, { props: { idiom: fixture } })
    expect(w.find('[data-testid="section-origin"] .origin').text()).toContain('诸葛亮')
    expect(w.find('[data-testid="section-usage"] .usage').text()).toContain('误用判定依据')
    const opposites = w.findAll('.opposite-item').map((n) => n.text())
    expect(opposites).toEqual(['半途而废', '见异思迁'])
  })

  it('渲染感情色彩/语域/误用类型徽标', () => {
    const w = mount(IdiomDetailCard, { props: { idiom: fixture } })
    expect(w.find('[data-testid="emotion-tag"]').text()).toBe('褒')
    expect(w.find('[data-testid="register-tag"]').text()).toBe('谦辞')
    expect(w.findAll('.error-tag').map((n) => n.text())).toEqual(['形近/音近混淆'])
  })

  it('register=无 时不渲染语域徽标', () => {
    const w = mount(IdiomDetailCard, { props: { idiom: { ...fixture, register: '无' } } })
    expect(w.find('[data-testid="register-tag"]').exists()).toBe(false)
  })

  it('渲染主题标签', () => {
    const w = mount(IdiomDetailCard, { props: { idiom: fixture } })
    expect(w.findAll('.tag-item').map((n) => n.text())).toEqual(['态度奉献'])
  })

  it('缺省字段（无 origin/usage/near/opposite/examples/tags）不渲染对应区块', () => {
    const minimal: Idiom = {
      ...fixture,
      origin: undefined,
      usage: undefined,
      near: undefined,
      opposite: undefined,
      examples: undefined,
      tags: undefined
    }
    const w = mount(IdiomDetailCard, { props: { idiom: minimal } })
    expect(w.find('[data-testid="section-origin"]').exists()).toBe(false)
    expect(w.find('[data-testid="section-usage"]').exists()).toBe(false)
    expect(w.find('[data-testid="section-near"]').exists()).toBe(false)
    expect(w.find('[data-testid="section-opposite"]').exists()).toBe(false)
    expect(w.find('[data-testid="section-examples"]').exists()).toBe(false)
    expect(w.find('[data-testid="section-tags"]').exists()).toBe(false)
    expect(w.find('[data-testid="section-meaning"]').exists()).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// NearDiffGroup 辨析组折叠（§3.4 默认折叠）
// ---------------------------------------------------------------------------

describe('NearDiffGroup 近义辨析组折叠交互', () => {
  it('默认折叠：diff 不可见，aria-expanded=false', () => {
    const w = mount(NearDiffGroup, { props: { near: fixture.near ?? [] } })
    expect(w.find('.near-list').exists()).toBe(false)
    expect(w.find('.near-toggle').attributes('aria-expanded')).toBe('false')
    expect(w.find('.near-title').text()).toBe('近义辨析（2）')
  })

  it('点击展开：逐条展示 word + diff 一句话；再点收起', async () => {
    const w = mount(NearDiffGroup, { props: { near: fixture.near ?? [] } })
    await w.find('.near-toggle').trigger('click')
    expect(w.find('.near-toggle').attributes('aria-expanded')).toBe('true')
    const items = w.findAll('.near-item')
    expect(items).toHaveLength(2)
    expect(items[0]!.text()).toContain('殚精竭虑')
    expect(items[0]!.text()).toContain('重忠诚奉献')
    expect(items[1]!.text()).toContain('呕心沥血')

    await w.find('.near-toggle').trigger('click')
    expect(w.find('.near-list').exists()).toBe(false)
  })

  it('在卡片内默认折叠，展开后展示 diff', async () => {
    const w = mount(IdiomDetailCard, { props: { idiom: fixture } })
    expect(w.find('.near-list').exists()).toBe(false)
    await w.find('.near-toggle').trigger('click')
    const nearItem = w.find('.near-item')
    expect(nearItem.exists()).toBe(true)
    expect(nearItem.text()).toContain('殚精竭虑')
    expect(nearItem.text()).toContain('重忠诚奉献')
  })
})

// ---------------------------------------------------------------------------
// ExampleList 例句标注
// ---------------------------------------------------------------------------

describe('ExampleList 真题例句标注（§6.2）', () => {
  it('exam 例句标注卷别；made 例句标注自造', () => {
    const w = mount(ExampleList, { props: { examples: fixture.examples ?? [] } })
    const badges = w.findAll('.example-badge').map((n) => n.text())
    expect(badges).toEqual(['真题 · 2024-国考-副省级', '自造'])
  })
})

// ---------------------------------------------------------------------------
// IdiomDetailPage 页面（路由 /idioms/:id → store 消费，AC-02 离线）
// ---------------------------------------------------------------------------

function stubWindowApi(listImpl: () => Promise<unknown>): void {
  const api = {
    data: {
      list: vi.fn(listImpl),
      get: vi.fn()
    },
    progress: { save: vi.fn() },
    pending: { list: vi.fn(), add: vi.fn(), remove: vi.fn() },
    quiz: { record: vi.fn() },
    settings: { get: vi.fn(), set: vi.fn() },
    log: vi.fn()
  } as unknown as YuzhanApi
  ;(window as unknown as { api: YuzhanApi }).api = api
}

function makeRouter(initialPath: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/idioms/:id', component: IdiomDetailPage },
      { path: '/idioms', name: 'idioms', component: { template: '<div>list</div>' } }
    ]
  })
  router.push(initialPath)
  return router
}

async function mountPage(router: ReturnType<typeof makeRouter>) {
  await router.isReady()
  const pinia = createPinia()
  const w = mount(IdiomDetailPage, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return w
}

describe('IdiomDetailPage 页面状态', () => {
  let router: ReturnType<typeof makeRouter>

  beforeEach(() => {
    router = makeRouter('/idioms/ju-gong-jin-cui-01')
  })

  afterEach(() => {
    delete (window as unknown as { api?: unknown }).api
  })

  it('命中词条：渲染详情卡片（store 数据，纯本地无 AI）', async () => {
    stubWindowApi(() => Promise.resolve(listOk([fixture])))
    const w = await mountPage(router)
    expect(w.find('[data-testid="state-loading"]').exists()).toBe(false)
    expect(w.find('[data-testid="state-not-found"]').exists()).toBe(false)
    const card = w.find('[data-testid="idiom-detail-card"]')
    expect(card.exists()).toBe(true)
    expect(card.find('.word').text()).toBe('鞠躬尽瘁')
    expect(card.find('.origin').text()).toContain('诸葛亮')
  })

  it('未收录 id：展示空态并引导回列表', async () => {
    stubWindowApi(() => Promise.resolve(listOk([fixture])))
    router = makeRouter('/idioms/not-in-library-99')
    const w = await mountPage(router)
    expect(w.find('[data-testid="state-not-found"]').exists()).toBe(true)
    expect(w.text()).toContain('词库未收录该成语')
    expect(w.find('[data-testid="idiom-detail-card"]').exists()).toBe(false)
  })

  it('加载失败：展示错误与重试；重试成功后渲染卡片', async () => {
    const listMock = vi
      .fn()
      .mockResolvedValueOnce(listErr('词库读取失败'))
      .mockResolvedValueOnce(listOk([fixture]))
    const api = {
      data: { list: listMock, get: vi.fn() },
      progress: { save: vi.fn() },
      pending: { list: vi.fn(), add: vi.fn(), remove: vi.fn() },
      quiz: { record: vi.fn() },
      settings: { get: vi.fn(), set: vi.fn() },
      log: vi.fn()
    } as unknown as YuzhanApi
    ;(window as unknown as { api: YuzhanApi }).api = api

    const w = await mountPage(router)
    expect(w.find('[data-testid="state-error"]').exists()).toBe(true)
    expect(w.text()).toContain('词库加载失败')

    await w.find('[data-testid="retry-button"]').trigger('click') // 重试（避开工具栏返回按钮）
    await flushPromises()
    expect(w.find('[data-testid="idiom-detail-card"]').exists()).toBe(true)
  })

  it('加载中：data:list 未返回前展示加载态', async () => {
    let resolveList!: (v: unknown) => void
    stubWindowApi(() => new Promise((res) => (resolveList = res)))
    const w = await mountPage(router)
    expect(w.find('[data-testid="state-loading"]').exists()).toBe(true)
    resolveList(listOk([fixture]))
    await flushPromises()
    expect(w.find('[data-testid="state-loading"]').exists()).toBe(false)
    expect(w.find('[data-testid="idiom-detail-card"]').exists()).toBe(true)
  })
})
