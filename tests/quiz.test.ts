/**
 * T8 自测测试（AC-06 / §3.3 出题规则 / F6）
 *
 * - 组卷纯逻辑单测（shared/lib/quiz.ts：优先错词/高频、避免重复、干扰项来源、答案位置随机）
 * - quiz store 会话测试（答题流 / quiz:record 批量写 / 下次优先错词）
 * - QuizPage 组件测试（题库<10 空态引导 / 即时反馈 / 结果面板）
 * - 随机源注入 mulberry32 种子，测试确定性
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { VueWrapper } from '@vue/test-utils'
import {
  HIGH_FREQUENCY_TIERS,
  OPTION_COUNT,
  QUIZ_SIZE,
  SCORE_NEAR,
  SCORE_SAME_TAG,
  buildOptionsFor,
  buildQuiz,
  confusableScore,
  createDistractorIndex,
  selectQuizTargets
} from '../shared/lib/quiz'
import { useQuizStore } from '../src/renderer/src/stores/quiz'
import { useProgressStore } from '../src/renderer/src/stores/progress'
import QuizPage from '../src/renderer/src/views/QuizPage.vue'
import QuizQuestionCard from '../src/renderer/src/components/quiz/QuizQuestionCard.vue'
import type { QuizQuestion } from '../shared/lib/quiz'
import type { Idiom, YuzhanApi } from '../shared/ipc/contracts'

// ---------------------------------------------------------------------------
// 夹具与随机源
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

/** 错词（freq 3） */
const WRONG = [
  idiom({ id: 'w-01', word: '错词甲', pinyin: 'cuò cí jiǎ', meaning: '错词甲释义', frequency: 3, tags: ['态度奉献'] }),
  idiom({ id: 'w-02', word: '错词乙', pinyin: 'cuò cí yǐ', meaning: '错词乙释义', frequency: 3, tags: ['态度奉献'] })
]

/** 高频（freq 5/4） */
const HIGH = [
  idiom({ id: 'h-01', word: '高风亮节', pinyin: 'gāo fēng liàng jié', meaning: '高风亮节释义', frequency: 5, tags: ['态度奉献'] }),
  idiom({ id: 'h-02', word: '励精图治', pinyin: 'lì jīng tú zhì', meaning: '励精图治释义', frequency: 5, tags: ['态度奉献'] }),
  idiom({ id: 'h-03', word: '恪尽职守', pinyin: 'kè jìn zhí shǒu', meaning: '恪尽职守释义', frequency: 5, tags: ['态度奉献'] }),
  idiom({ id: 'h-04', word: '呕心沥血', pinyin: 'ǒu xīn lì xuè', meaning: '呕心沥血释义', frequency: 4, tags: ['态度奉献'] }),
  idiom({ id: 'h-05', word: '夙兴夜寐', pinyin: 'sù xīng yè mèi', meaning: '夙兴夜寐释义', frequency: 4, tags: ['勤勉'] }),
  idiom({ id: 'h-06', word: '孜孜不倦', pinyin: 'zī zī bù juàn', meaning: '孜孜不倦释义', frequency: 4, tags: ['勤勉'] })
]

/** 低频（freq 2/1） */
const LOW = [
  idiom({ id: 'l-01', word: '按图索骥', pinyin: 'àn tú suǒ jì', meaning: '按图索骥释义', frequency: 2, tags: ['方法'] }),
  idiom({ id: 'l-02', word: '标新立异', pinyin: 'biāo xīn lì yì', meaning: '标新立异释义', frequency: 2, tags: ['方法'] }),
  idiom({ id: 'l-03', word: '差强人意', pinyin: 'chā qiáng rén yì', meaning: '差强人意释义', frequency: 2, tags: ['程度'] }),
  idiom({ id: 'l-04', word: '独树一帜', pinyin: 'dú shù yī zhì', meaning: '独树一帜释义', frequency: 2, tags: ['方法'] }),
  idiom({ id: 'l-05', word: '耳濡目染', pinyin: 'ěr rú mù rǎn', meaning: '耳濡目染释义', frequency: 1, tags: ['方法'] }),
  idiom({ id: 'l-06', word: '废寝忘食', pinyin: 'fèi qǐn wàng shí', meaning: '废寝忘食释义', frequency: 1, tags: ['勤勉'] })
]

/** 近义辨析组对端（near 对端无字形/主题交集，验证近义池独立入选） */
const NEAR_TARGET = idiom({
  id: 'near-t',
  word: '鞠躬尽瘁',
  pinyin: 'jū gōng jìn cuì',
  meaning: '忠诚奉献直到生命结束',
  frequency: 5,
  tags: ['态度奉献'],
  near: [{ word: '殚精竭虑', diff: '前者重忠诚奉献，后者重用尽心思' }]
})
const NEAR_PARTNER = idiom({
  id: 'near-p',
  word: '殚精竭虑',
  pinyin: 'dān jīng jié lǜ',
  meaning: '用尽精力思虑谋划',
  frequency: 4,
  tags: ['勤勉']
})

const fixture: Idiom[] = [...WRONG, ...HIGH, ...LOW, NEAR_TARGET, NEAR_PARTNER] // 15 条

/** 确定性随机源 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------------------
// shared/lib/quiz.ts 组卷规则
// ---------------------------------------------------------------------------

describe('shared/lib/quiz.ts 组卷规则（§3.3 / AC-06）', () => {
  it('常量：10 题一组，每题 4 选项，高频档 [4,5]', () => {
    expect(QUIZ_SIZE).toBe(10)
    expect(OPTION_COUNT).toBe(4)
    expect(HIGH_FREQUENCY_TIERS).toEqual([4, 5])
  })

  it('题库 ≥10 → 10 道不重复题；题库 <10 → 空数组（空态依据）', () => {
    const qs = buildQuiz(fixture, { random: mulberry32(1) })
    expect(qs).toHaveLength(QUIZ_SIZE)
    expect(new Set(qs.map((q) => q.id)).size).toBe(QUIZ_SIZE)
    expect(buildQuiz(fixture.slice(0, 9), { random: mulberry32(1) })).toEqual([])
  })

  it('每道题 4 个释义选项，正确答案位置在 [0,3] 且内容为释义', () => {
    const qs = buildQuiz(fixture, { random: mulberry32(2) })
    for (const q of qs) {
      expect(q.options).toHaveLength(OPTION_COUNT)
      expect(q.correctIndex).toBeGreaterThanOrEqual(0)
      expect(q.correctIndex).toBeLessThan(OPTION_COUNT)
      expect(q.options[q.correctIndex]).toBe(q.meaning)
      expect(q.meaning).toBeTruthy()
    }
  })

  it('优先错词：wrongIds 的词条全部入选且排在开头', () => {
    const wrongIds = WRONG.map((w) => w.id)
    const qs = buildQuiz(fixture, { wrongIds, random: mulberry32(3) })
    const ids = qs.map((q) => q.id)
    expect(ids.slice(0, wrongIds.length).sort()).toEqual([...wrongIds].sort())
    for (const wid of wrongIds) expect(ids).toContain(wid)
  })

  it('优先高频：无错词时高频（4–5）词条先于低频；高频不足 10 时全部高频入选', () => {
    const highIds = HIGH.map((h) => h.id)
    const qs = buildQuiz(fixture, { random: mulberry32(4) })
    const ids = qs.map((q) => q.id)
    // 高频（6 条 < 10）全部入选
    for (const hid of highIds) expect(ids).toContain(hid)
    // 高频段（前 6 题）都在高频档内
    for (const q of qs.slice(0, highIds.length)) {
      expect(HIGH_FREQUENCY_TIERS).toContain(fixture.find((i) => i.id === q.id)?.frequency)
    }
  })

  it('避免与上轮重复：上轮答对词条不再出（题库充足时）', () => {
    const avoidIds = ['h-01', 'h-02', 'h-03', 'h-04']
    const qs = buildQuiz(fixture, { avoidIds, random: mulberry32(5) })
    const ids = new Set(qs.map((q) => q.id))
    for (const id of avoidIds) expect(ids.has(id)).toBe(false)
  })

  it('错词复测：上轮错词即使在上轮词条列表中也再次入选（AC-06 下次优先）', () => {
    const qs = buildQuiz(fixture, {
      wrongIds: ['w-01'],
      avoidIds: ['w-01', 'h-01', 'h-02', 'h-03', 'h-04', 'h-05'],
      random: mulberry32(6)
    })
    expect(qs.map((q) => q.id)).toContain('w-01')
  })

  it('干扰项同主题优先：目标词含 tag 时，干扰项来自同主题词条释义', () => {
    const target = HIGH[0] // 高风亮节，tags=['态度奉献']（无近义/形近候选 → 退化同主题）
    const built = buildOptionsFor(target, createDistractorIndex(fixture), mulberry32(7))
    expect(built).not.toBeNull()
    const sameTagMeanings = HIGH.filter((h) => h.id !== target.id && h.tags?.includes('态度奉献')).map((h) => h.meaning)
    const distractorHits = built!.options.filter((o, i) => i !== built!.correctIndex && sameTagMeanings.includes(o))
    expect(distractorHits.length).toBeGreaterThan(0)
  })

  it('干扰项近义辨析组：near 对端词释义入选且附带易混辨析提示（v0.2.6）', () => {
    const index = createDistractorIndex(fixture)
    const built = buildOptionsFor(NEAR_TARGET, index, mulberry32(8))
    expect(built).not.toBeNull()
    expect(built!.options.filter((o, i) => i !== built!.correctIndex)).toContain(NEAR_PARTNER.meaning)
    // 近义干扰项附带 diff 提示（答错时展示「易与 X 混淆：diff」）
    const hint = built!.hints.find((h) => h.word === '殚精竭虑')
    expect(hint).toBeTruthy()
    expect(hint!.diff).toContain('忠诚奉献')
    expect(hint!.option).toBe(NEAR_PARTNER.meaning)
  })

  it('正确答案位置随机：不同随机源产生不同选项顺序', () => {
    const index = createDistractorIndex(fixture)
    const indices = new Set<number>()
    for (let seed = 10; seed < 20; seed++) {
      const built = buildOptionsFor(HIGH[1], index, mulberry32(seed))
      expect(built).not.toBeNull()
      indices.add(built!.correctIndex)
    }
    expect(indices.size).toBeGreaterThan(1) // 10 个种子应覆盖多个位置
  })

  it('同一随机源结果确定性（可复现）', () => {
    const a = buildQuiz(fixture, { random: mulberry32(42) })
    const b = buildQuiz(fixture, { random: mulberry32(42) })
    expect(a).toEqual(b)
  })

  it('释义去重：干扰项不与正确答案重复', () => {
    const qs = buildQuiz(fixture, { random: mulberry32(11) })
    for (const q of qs) {
      expect(q.options.filter((o) => o === q.meaning)).toHaveLength(1)
      expect(new Set(q.options).size).toBe(OPTION_COUNT)
    }
  })

  it('selectQuizTargets：错词 → 高频 → 低频 分层排序', () => {
    const ordered = selectQuizTargets(fixture, { wrongIds: WRONG.map((w) => w.id) })
    const wrongLen = WRONG.length
    const highCount = fixture.filter((i) => HIGH_FREQUENCY_TIERS.includes(i.frequency)).length
    expect(ordered.slice(0, wrongLen).map((i) => i.id).sort()).toEqual(WRONG.map((w) => w.id).sort())
    for (const h of ordered.slice(wrongLen, wrongLen + highCount)) {
      expect(HIGH_FREQUENCY_TIERS).toContain(h.frequency)
    }
    for (const l of ordered.slice(wrongLen + highCount)) {
      expect(HIGH_FREQUENCY_TIERS).not.toContain(l.frequency)
    }
  })
})

// ---------------------------------------------------------------------------
// v0.2.6 迭代：干扰项混淆度引擎（§16.3 P0-⑤「选项区分度」）
// ---------------------------------------------------------------------------

describe('干扰项混淆度引擎（v0.2.6，§16.3 P0-⑤）', () => {
  /** 形近对：一蹴而就 / 一挥而就（共享 3 字 + 同首 + 同尾，A 级高相似；真题易混对） */
  const SHAPE_TARGET = idiom({
    id: 'shape-t',
    word: '一蹴而就',
    pinyin: 'yī cù ér jiù',
    meaning: '踏一步就成功，形容事情轻而易举',
    frequency: 4,
    tags: ['方法']
  })
  const SHAPE_SHARED = idiom({
    id: 'shape-s',
    word: '一挥而就',
    pinyin: 'yī huī ér jiù',
    meaning: '一动笔就写成，形容才思敏捷',
    frequency: 3,
    tags: ['言语表达']
  })
  const SHAPE_FIRST = idiom({
    id: 'shape-f',
    word: '一马当先',
    pinyin: 'yī mǎ dāng xiān',
    meaning: '作战或做事走在最前面',
    frequency: 3,
    tags: ['方法']
  })
  const TAG_ONLY = idiom({
    id: 'tag-only',
    word: '夜以继日',
    pinyin: 'yè yǐ jì rì',
    meaning: '日夜不停',
    frequency: 2,
    tags: ['方法']
  })
  // 扩充填充词：保证每个目标词都有 ≥3 个可作干扰项的候选
  const FILL_A = idiom({
    id: 'fill-a',
    word: '举一反三',
    pinyin: 'jǔ yī fǎn sān',
    meaning: '从一件事情类推而知道许多事情',
    frequency: 4,
    tags: ['方法']
  })
  const FILL_B = idiom({
    id: 'fill-b',
    word: '一鸣惊人',
    pinyin: 'yī míng jīng rén',
    meaning: '平时没有突出的表现，一下子做出惊人的成绩',
    frequency: 5,
    tags: ['言语表达']
  })
  const FILL_C = idiom({
    id: 'fill-c',
    word: '白手起家',
    pinyin: 'bái shǒu qǐ jiā',
    meaning: '没有任何基础，靠自己的努力创立事业',
    frequency: 4,
    tags: ['处事方法']
  })
  const FILL_D = idiom({
    id: 'fill-d',
    word: '有条不紊',
    pinyin: 'yǒu tiáo bù wěn',
    meaning: '做事有条理，一点不乱',
    frequency: 3,
    tags: ['处事方法']
  })
  const shapeFixture: Idiom[] = [SHAPE_TARGET, SHAPE_SHARED, SHAPE_FIRST, TAG_ONLY, FILL_A, FILL_B, FILL_C, FILL_D]

  it('confusableScore：near 对端 = 100；形近（共享3字+同首同尾）远高于同 tag；pairs 对端 = 100', () => {
    const idx = createDistractorIndex(fixture)
    // near 对端（鞠躬尽瘁 → 殚精竭虑）
    const near = confusableScore(NEAR_TARGET, NEAR_PARTNER, idx)
    expect(near.score).toBe(SCORE_NEAR)
    expect(near.hint?.diff).toContain('忠诚奉献')

    const sidx = createDistractorIndex(shapeFixture)
    // 形近（一蹴而就 vs 一挥而就：共享 3 字 + 同首 + 同尾）：16 + 5 + 8 = 29
    const shape = confusableScore(SHAPE_TARGET, SHAPE_SHARED, sidx)
    expect(shape.score).toBeGreaterThanOrEqual(29)
    // 同首字「一」+ 同 tag「方法」：5 + 2 = 7（低于形近）
    const first = confusableScore(SHAPE_TARGET, SHAPE_FIRST, sidx)
    expect(first.score).toBeGreaterThanOrEqual(7)
    expect(first.score).toBeLessThan(shape.score)
    // 仅同 tag（无字形相似）：2
    const tag = confusableScore(SHAPE_TARGET, TAG_ONLY, sidx)
    expect(tag.score).toBe(SCORE_SAME_TAG)

    // pairs 对端（双向映射）
    const pidx = createDistractorIndex(shapeFixture, [{ a: '一蹴而就', b: '一挥而就', diff: '一蹴而就重一步成功，一挥而就重一挥而成' }])
    const pair = confusableScore(SHAPE_TARGET, SHAPE_SHARED, pidx)
    expect(pair.score).toBe(SCORE_NEAR)
    expect(pair.hint?.diff).toContain('一蹴而就重一步成功')
  })

  it('standard（默认）：至少 1 个高相似干扰项（形近/near），其余按混淆度降序', () => {
    const idx = createDistractorIndex(shapeFixture)
    const built = buildOptionsFor(SHAPE_TARGET, idx, mulberry32(21))
    expect(built).not.toBeNull()
    const distractors = built!.options.filter((o, i) => i !== built!.correctIndex)
    // 高相似候选（一挥而就 score 29）必然入选
    expect(distractors).toContain(SHAPE_SHARED.meaning)
  })

  it('hard：干扰项全部优先高相似（形近/近义）', () => {
    const idx = createDistractorIndex(shapeFixture)
    const built = buildOptionsFor(SHAPE_TARGET, idx, mulberry32(22), 'hard')
    expect(built).not.toBeNull()
    const distractors = built!.options.filter((o, i) => i !== built!.correctIndex)
    expect(distractors).toContain(SHAPE_SHARED.meaning) // 29 分必选
    expect(distractors).toContain(SHAPE_FIRST.meaning) // 7 分（同首+同 tag）在 hard 降级阈内优先于纯 tag
  })

  it('easy：宽松（同主题即可，不强求高相似）', () => {
    const idx = createDistractorIndex(shapeFixture)
    const built = buildOptionsFor(SHAPE_TARGET, idx, mulberry32(23), 'easy')
    expect(built).not.toBeNull()
    expect(built!.options.filter((o, i) => i !== built!.correctIndex)).toHaveLength(OPTION_COUNT - 1)
  })

  it('buildQuiz：size/difficulty + pairs 透传（pairs 对端入选且带易混提示）', () => {
    const qs = buildQuiz(shapeFixture, {
      size: 4,
      pairs: [{ a: '一蹴而就', b: '一挥而就', diff: '一蹴而就重一步成功，一挥而就重一挥而成' }],
      difficulty: 'standard',
      random: mulberry32(24)
    })
    expect(qs).toHaveLength(4)
    const q = qs.find((x) => x.id === 'shape-t')
    expect(q).toBeTruthy()
    expect(q!.options.filter((o, i) => i !== q!.correctIndex)).toContain(SHAPE_SHARED.meaning)
    expect(q!.confusableHints?.some((h) => h.word === '一挥而就')).toBe(true)
  })

  it('释义去重仍成立：选项互不重复且唯一正确', () => {
    for (const seed of [31, 32, 33]) {
      const qs = buildQuiz(shapeFixture, { size: 4, random: mulberry32(seed) })
      expect(qs).toHaveLength(4)
      for (const q of qs) {
        expect(new Set(q.options).size).toBe(OPTION_COUNT)
        expect(q.options.filter((o) => o === q.meaning)).toHaveLength(1)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// quiz store（会话三态 / quiz:record 批量写 / 下次优先错词）
// ---------------------------------------------------------------------------

function installApiMock(opts: { items?: Idiom[] } = {}) {
  const items = opts.items ?? fixture
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
      list: vi.fn(async () => ({ ok: true, data: [] })),
      add: vi.fn(async () => ({ ok: true, data: null })),
      remove: vi.fn(async () => ({ ok: true, data: null }))
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

describe('quiz store（AC-06）', () => {
  function freshStores() {
    const pinia = createPinia()
    setActivePinia(pinia)
    const quizStore = useQuizStore()
    const progressStore = useProgressStore()
    return { quizStore, progressStore }
  }

  it('canStart：题库 <10 → false（空态依据）', () => {
    const { quizStore } = freshStores()
    expect(quizStore.canStart(9)).toBe(false)
    expect(quizStore.canStart(10)).toBe(true)
  })

  it('start：题库不足 → 返回 false 且保持 idle；题库充足 → active + 10 题', () => {
    const { quizStore } = freshStores()
    expect(quizStore.start(fixture.slice(0, 9), {})).toBe(false)
    expect(quizStore.phase).toBe('idle')
    expect(quizStore.start(fixture, {})).toBe(true)
    expect(quizStore.phase).toBe('active')
    expect(quizStore.total).toBe(QUIZ_SIZE)
  })

  it('答题：作答锁定、重复作答无效、答案记录正确性', () => {
    const { quizStore } = freshStores()
    quizStore.start(fixture, {})
    const q0 = quizStore.current!
    quizStore.answer(q0.correctIndex)
    expect(quizStore.selectedIndex).toBe(q0.correctIndex)
    expect(quizStore.answers).toHaveLength(1)
    expect(quizStore.answers[0]).toEqual({ id: q0.id, correct: true })
    // 已作答后再次点击不生效
    const wrong = (q0.correctIndex + 1) % OPTION_COUNT
    quizStore.answer(wrong)
    expect(quizStore.answers).toHaveLength(1)
  })

  it('完整 10 题：答完所有题 → finish → quiz:record 批量写入（含错词 wrongTimes 依据）', async () => {
    const api = installApiMock()
    const { quizStore } = freshStores()
    quizStore.start(fixture, {})
    // 全部答错，第 0、1 题答对（验证 correct 混合）
    for (let i = 0; i < QUIZ_SIZE; i++) {
      const q = quizStore.current!
      if (i < 2) quizStore.answer(q.correctIndex)
      else quizStore.answer((q.correctIndex + 1) % OPTION_COUNT)
      if (quizStore.isLast) break
      quizStore.next()
    }
    quizStore.next() // 最后一题 → finish
    await flushPromises()
    expect(quizStore.phase).toBe('finished')
    expect(quizStore.result).toEqual({ correct: 2, wrong: 8, total: 10 })
    expect(api.quiz.record).toHaveBeenCalledWith({ answers: expect.any(Array) })
    const payload = (api.quiz.record as ReturnType<typeof vi.fn>).mock.calls[0][0] as { answers: { id: string; correct: boolean }[] }
    expect(payload.answers).toHaveLength(10)
    expect(payload.answers.filter((a) => a.correct)).toHaveLength(2)
    expect(quizStore.wrongQuestions).toHaveLength(8)
  })

  it('下次自测优先出上轮错词（AC-06）：上轮错词进入 wrongIds 且上轮答对词避免', async () => {
    installApiMock()
    const { quizStore } = freshStores()
    quizStore.start(fixture, {})
    // 故意全部答错，记住错词 = 全部 10 个
    for (let i = 0; i < QUIZ_SIZE; i++) {
      const q = quizStore.current!
      quizStore.answer((q.correctIndex + 1) % OPTION_COUNT)
      if (!quizStore.isLast) quizStore.next()
    }
    quizStore.next()
    await flushPromises()
    const wrongIds = [...quizStore.lastSessionWrongIds]
    expect(wrongIds).toHaveLength(10)
    expect(quizStore.lastSessionIds).toHaveLength(10)

    quizStore.reset()
    expect(quizStore.start(fixture, {})).toBe(true)
    // 上轮错词优先：本轮前若干题应包含上轮错词
    const ids = quizStore.questions.map((q) => q.id)
    expect(ids.slice(0, wrongIds.length).sort()).toEqual([...wrongIds].sort())
  })

  it('progress 中 wrongTimes>0 的词也优先出题', () => {
    const { quizStore, progressStore } = freshStores()
    progressStore.incrementWrong('l-01')
    progressStore.incrementWrong('l-02')
    quizStore.start(fixture, progressStore.progress)
    const ids = quizStore.questions.map((q) => q.id)
    expect(ids[0]).toBe('l-01')
    expect(ids[1]).toBe('l-02')
  })
})

// ---------------------------------------------------------------------------
// QuizQuestionCard 易混辨析提示（v0.2.6 迭代：答错且命中 near/pairs 干扰项时展示）
// ---------------------------------------------------------------------------

describe('QuizQuestionCard 易混提示（v0.2.6）', () => {
  function question(partial: Partial<QuizQuestion> = {}): QuizQuestion {
    return {
      id: 'q-01',
      word: '一蹴而就',
      pinyin: 'yī cù ér jiù',
      options: ['正确释义', '一挥而就的释义', '无关释义', '另一释义'],
      correctIndex: 0,
      meaning: '正确释义',
      errorTypes: [],
      tags: [],
      ...partial
    }
  }

  it('答错且所选选项命中易混提示 → 展示「易混提示：词 —— diff」', () => {
    const w = mount(QuizQuestionCard, {
      props: {
        question: question({
          confusableHints: [{ option: '一挥而就的释义', word: '一挥而就', diff: '一蹴而就重一步成功，一挥而就重一挥而成' }]
        }),
        selected: 1,
        index: 0,
        total: 1
      }
    })
    expect(w.find('[data-testid="q-confusable"]').exists()).toBe(true)
    expect(w.find('[data-testid="q-confusable"]').text()).toContain('一挥而就')
    expect(w.find('[data-testid="q-confusable"]').text()).toContain('一挥而成')
    w.unmount()
  })

  it('答对 → 不显示易混提示（无混淆语境）', () => {
    const w = mount(QuizQuestionCard, {
      props: {
        question: question({
          confusableHints: [{ option: '一挥而就的释义', word: '一挥而就', diff: '重一挥而成' }]
        }),
        selected: 0, // 正确
        index: 0,
        total: 1
      }
    })
    expect(w.find('[data-testid="q-confusable"]').exists()).toBe(false)
    w.unmount()
  })

  it('答错但所选选项无易混提示（随机干扰项）→ 不显示', () => {
    const w = mount(QuizQuestionCard, {
      props: { question: question({ confusableHints: undefined }), selected: 2, index: 0, total: 1 }
    })
    expect(w.find('[data-testid="q-confusable"]').exists()).toBe(false)
    w.unmount()
  })
})

// ---------------------------------------------------------------------------
// QuizPage 组件（三态 / 题库<10 空态 / 即时反馈）
// ---------------------------------------------------------------------------

describe('QuizPage（§3.2 三态 / §3.3 空态 / F6）', () => {
  async function mountPage(opts: { items?: Idiom[] } = {}) {
    const api = installApiMock(opts)
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/quiz', component: QuizPage },
        { path: '/idioms', component: { template: '<div>idioms</div>' } }
      ]
    })
    await router.push('/quiz')
    await router.isReady()
    const wrapper = mount(QuizPage, { global: { plugins: [pinia, router] } })
    await flushPromises()
    return { wrapper, router, api }
  }

  it('题库 <10 → 提示并引导浏览成语库（§3.3 空态）', async () => {
    const { wrapper, router } = await mountPage({ items: fixture.slice(0, 9) })
    expect(wrapper.find('[data-testid="quiz-idle"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('题库不足 10 题')
    await wrapper.find('[data-testid="quiz-goto-browse"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/idioms')
    wrapper.unmount()
  })

  it('难度选择（v0.2.6）：默认 standard；点击困难 → store.difficulty=hard', async () => {
    const { wrapper } = await mountPage()
    const pinia = wrapper.vm.$pinia
    const quizStore = useQuizStore(pinia)
    expect(quizStore.difficulty).toBe('standard')
    await wrapper.find('[data-testid="quiz-difficulty-hard"]').trigger('click')
    expect(quizStore.difficulty).toBe('hard')
    expect(wrapper.find('[data-testid="quiz-difficulty-hard"]').classes()).toContain('active')
    wrapper.unmount()
  })

  it('完整流程：开始 → 答题即时反馈（对/错 + 考点）→ 10 题 → 结果面板 + quiz:record', async () => {
    const { wrapper, api } = await mountPage()
    await wrapper.find('[data-testid="quiz-start"]').trigger('click')
    expect(wrapper.find('[data-testid="quiz-question"]').exists()).toBe(true)

    // 第 1 题答对：反馈「回答正确」+ 考点展示
    // 正确答案下标从 store 取（选项顺序由组卷随机决定）
    const pinia = wrapper.vm.$pinia
    const quizStore = useQuizStore(pinia)
    const first = quizStore.current!
    await wrapper.find(`[data-testid="q-option-${first.correctIndex}"]`).trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="q-result-tag"]').text()).toContain('回答正确')
    expect(wrapper.find('[data-testid="q-feedback"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="q-feedback"]').text()).toContain('释义')

    // 第 1 题答对 + 第 2 题答错，走完 10 题
    await wrapper.find('[data-testid="q-next"]').trigger('click')
    await flushPromises()
    const second = quizStore.current!
    const wrongIdx = (second.correctIndex + 1) % OPTION_COUNT
    await wrapper.find(`[data-testid="q-option-${wrongIdx}"]`).trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="q-result-tag"]').text()).toContain('回答错误')
    await wrapper.find('[data-testid="q-next"]').trigger('click')
    await flushPromises()
    // 其余 8 题自动答对（走完流程）
    for (let i = 2; i < QUIZ_SIZE; i++) {
      const q = quizStore.current!
      await wrapper.find(`[data-testid="q-option-${q.correctIndex}"]`).trigger('click')
      await flushPromises()
      await wrapper.find('[data-testid="q-next"]').trigger('click')
      await flushPromises()
    }
    expect(wrapper.find('[data-testid="quiz-result"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="quiz-summary"]').text()).toContain('答对 9')
    expect(wrapper.find('[data-testid="quiz-summary"]').text()).toContain('答错 1')
    expect(wrapper.find('[data-testid="quiz-wrong-item"]').exists()).toBe(true)
    expect(api.quiz.record).toHaveBeenCalledTimes(1)

    // 再来一组 → 回到答题态
    await wrapper.find('[data-testid="quiz-restart"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="quiz-question"]').exists()).toBe(true)
    wrapper.unmount()
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})
