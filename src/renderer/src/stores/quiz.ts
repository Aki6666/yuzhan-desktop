/**
 * quiz store（PLAN.md §4.3：自测组卷与答题状态，错题写 progress）
 *
 * - 组卷纯逻辑在 shared/lib/quiz.ts（只消费不重写，§4.8）
 * - 三态：idle（组卷入口）→ active（答题）→ finished（结果），同页多状态（§3.2）
 * - 结束批量 quiz:record（§10.4：{ answers } 一次 10 题；main 侧累计 wrongTimes）
 * - 会话记忆：上轮词条避免重复、上轮错词下次优先（AC-06，应用运行期内；重启后
 *   wrongTimes 由 main 侧 userData/progress.json 持久化，读取入口留待后续版本，§10.4）
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { ConfusablePair, Idiom, QuizAnswer, UserProgress } from '@shared/ipc/contracts'
import {
  QUIZ_SIZE,
  buildQuiz,
  type QuizDifficulty,
  type QuizMode,
  type QuizQuestion
} from '@shared/lib/quiz'
import { useProgressStore } from './progress'

export type QuizPhase = 'idle' | 'active' | 'finished'

/** 题型选择（v0.2.6 P1：正向/反向/混合） */
export type QuizModeChoice = QuizMode | 'mixed'

export const useQuizStore = defineStore('quiz', () => {
  const phase = ref<QuizPhase>('idle')
  const questions = ref<QuizQuestion[]>([])
  const currentIndex = ref(0)
  /** 已提交答案（答题后锁定，防止重复作答） */
  const answers = ref<QuizAnswer[]>([])
  const selectedIndex = ref<number | null>(null)
  const submitError = ref<string | null>(null)
  const writePending = ref(false)

  /** 难度档位（v0.2.6 迭代：干扰项区分度，默认 standard） */
  const difficulty = ref<QuizDifficulty>('standard')
  /** 题型（v0.2.6 P1：默认混合——正向/反向交替） */
  const mode = ref<QuizModeChoice>('mixed')
  /** 易混淆对（v0.2.6 迭代：pairs:list 加载，a/b 互为干扰项 + 辨析提示） */
  const pairs = ref<ConfusablePair[]>([])

  /** 上轮词条（避免与上轮重复；含错词——错词下次仍需优先复测） */
  const lastSessionIds = ref<string[]>([])
  const lastSessionWrongIds = ref<string[]>([])

  const current = computed<QuizQuestion | null>(() => questions.value[currentIndex.value] ?? null)
  const isLast = computed(() => currentIndex.value >= questions.value.length - 1)
  const total = computed(() => questions.value.length)

  const result = computed(() => {
    const correct = answers.value.filter((a) => a.correct).length
    return { correct, wrong: answers.value.length - correct, total: answers.value.length }
  })

  /** 答错的题（结果面板展示，供复习） */
  const wrongQuestions = computed<QuizQuestion[]>(() =>
    questions.value.filter((q) => answers.value.some((a) => a.id === q.id && !a.correct))
  )

  /** 题库是否足以组卷（§3.3：题库 <10 → 提示并引导浏览成语库） */
  function canStart(itemsCount: number): boolean {
    return itemsCount >= QUIZ_SIZE
  }

  /** 设置难度档位（v0.2.6 迭代） */
  function setDifficulty(d: QuizDifficulty): void {
    difficulty.value = d
  }

  /** 设置题型（v0.2.6 P1：正向/反向/混合） */
  function setMode(m: QuizModeChoice): void {
    mode.value = m
  }

  /** 加载易混淆对（pairs:list；失败静默，组卷退回无 pairs 模式） */
  async function loadPairs(): Promise<void> {
    try {
      const res = await window.api.pairs.list()
      if (res.ok) pairs.value = res.data.pairs
    } catch {
      /* pairs 不可用（旧版/测试）：组卷不依赖 pairs */
    }
  }

  /**
   * 组卷并进入答题态。
   * 出题优先级：progress 中 wrongTimes>0 的词 + 上轮错词 → 高频（4–5）→ 其余；
   * 避免与上轮重复（上轮答对的词；上轮错词仍需复测）。
   * v0.2.6 迭代：干扰项按混淆度评分 + difficulty 档位生成（pairs 提供易混对）；
   * v0.2.6 P1：mode 题型（混合=正向/反向交替各半，反向避免与正向重复）。
   * @returns 是否成功开始
   */
  function start(
    items: Idiom[],
    progress: Record<string, UserProgress>,
    opts: { pairs?: ConfusablePair[]; difficulty?: QuizDifficulty; mode?: QuizModeChoice } = {}
  ): boolean {
    if (items.length < QUIZ_SIZE) return false
    if (opts.difficulty) difficulty.value = opts.difficulty
    if (opts.mode) mode.value = opts.mode
    if (opts.pairs) pairs.value = opts.pairs
    const lastWrongSet = new Set(lastSessionWrongIds.value)
    const avoidIds = lastSessionIds.value.filter((id) => !lastWrongSet.has(id))
    const wrongIds = [
      ...lastSessionWrongIds.value,
      ...Object.values(progress)
        .filter((p) => p.wrongTimes > 0)
        .map((p) => p.id)
    ]
    const base: Parameters<typeof buildQuiz>[1] = {
      avoidIds,
      wrongIds,
      pairs: pairs.value,
      difficulty: difficulty.value
    }
    let qs: QuizQuestion[]
    if (mode.value === 'mixed') {
      // 混合：正向/反向交替合并（各半；反向避免与正向重复）
      const half = Math.ceil(QUIZ_SIZE / 2)
      const fwd = buildQuiz(items, { ...base, size: half, mode: 'word-to-meaning' })
      const rev = buildQuiz(items, {
        ...base,
        size: QUIZ_SIZE - half,
        mode: 'meaning-to-word',
        avoidIds: [...avoidIds, ...fwd.map((q) => q.id)]
      })
      qs = []
      for (let i = 0; i < Math.max(fwd.length, rev.length); i++) {
        if (fwd[i]) qs.push(fwd[i])
        if (rev[i]) qs.push(rev[i])
      }
      qs = qs.slice(0, QUIZ_SIZE)
    } else {
      qs = buildQuiz(items, { ...base, mode: mode.value })
    }
    if (qs.length < QUIZ_SIZE) return false
    questions.value = qs
    currentIndex.value = 0
    answers.value = []
    selectedIndex.value = null
    submitError.value = null
    phase.value = 'active'
    return true
  }

  /** 作答当前题（锁定后不可重复提交） */
  function answer(optionIndex: number): void {
    const q = current.value
    if (!q || phase.value !== 'active' || selectedIndex.value !== null) return
    if (optionIndex < 0 || optionIndex >= q.options.length) return
    selectedIndex.value = optionIndex
    answers.value = [...answers.value, { id: q.id, correct: optionIndex === q.correctIndex }]
  }

  /** 下一题；最后一题 → 结束并批量写 quiz:record */
  function next(): void {
    if (selectedIndex.value === null || phase.value !== 'active') return
    if (isLast.value) {
      void finish()
    } else {
      currentIndex.value++
      selectedIndex.value = null
    }
  }

  /** 结束会话：记录上轮词条/错词，批量写 quiz:record（AC-06：答错 → wrongTimes 累计） */
  async function finish(): Promise<void> {
    if (phase.value !== 'active') return
    lastSessionIds.value = questions.value.map((q) => q.id)
    lastSessionWrongIds.value = answers.value.filter((a) => !a.correct).map((a) => a.id)
    phase.value = 'finished'
    if (answers.value.length === 0) return
    writePending.value = true
    submitError.value = null
    try {
      // 注意：answers.value 是 Vue ref 深响应式 Proxy，Electron IPC 结构化克隆无法克隆
      // Proxy（报 "An object could not be cloned."），这里显式构造纯对象数组再发送。
      const plainAnswers = answers.value.map((a) => ({ id: a.id, correct: a.correct }))
      const res = await window.api.quiz.record({ answers: plainAnswers })
      if (!res.ok) submitError.value = res.error.message
      // 自测历史（用户要求 #4 + v0.2.6 详细练习记录）：成绩 + 每题明细
      const { correct, wrong } = result.value
      const details = questions.value.map((q) => ({
        id: q.id,
        word: q.word,
        correct: answers.value.some((a) => a.id === q.id && a.correct)
      }))
      void window.api.quiz.history.add({
        time: new Date().toISOString(),
        correct,
        wrong,
        total: answers.value.length,
        details
      })
      // 同步 renderer 内存态（用户要求 #5：错题立即进错题本）——以 main 持久化进度为准全量拉取
      const progressStore = useProgressStore()
      await progressStore.load()
    } catch (e) {
      submitError.value = String(e)
    } finally {
      writePending.value = false
    }
  }

  /** 回到组卷入口（保留会话记忆：上轮词条/错词供下次组卷） */
  function reset(): void {
    phase.value = 'idle'
    questions.value = []
    currentIndex.value = 0
    answers.value = []
    selectedIndex.value = null
    submitError.value = null
  }

  return {
    phase,
    questions,
    currentIndex,
    current,
    isLast,
    total,
    answers,
    selectedIndex,
    result,
    wrongQuestions,
    writePending,
    submitError,
    lastSessionIds,
    lastSessionWrongIds,
    difficulty,
    mode,
    pairs,
    canStart,
    start,
    setDifficulty,
    setMode,
    loadPairs,
    answer,
    next,
    finish,
    reset
  }
})
