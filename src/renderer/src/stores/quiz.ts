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
import type { Idiom, QuizAnswer, UserProgress } from '@shared/ipc/contracts'
import { QUIZ_SIZE, buildQuiz, type QuizQuestion } from '@shared/lib/quiz'

export type QuizPhase = 'idle' | 'active' | 'finished'

export const useQuizStore = defineStore('quiz', () => {
  const phase = ref<QuizPhase>('idle')
  const questions = ref<QuizQuestion[]>([])
  const currentIndex = ref(0)
  /** 已提交答案（答题后锁定，防止重复作答） */
  const answers = ref<QuizAnswer[]>([])
  const selectedIndex = ref<number | null>(null)
  const submitError = ref<string | null>(null)
  const writePending = ref(false)

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

  /**
   * 组卷并进入答题态。
   * 出题优先级：progress 中 wrongTimes>0 的词 + 上轮错词 → 高频（4–5）→ 其余；
   * 避免与上轮重复（上轮答对的词；上轮错词仍需复测）。
   * @returns 是否成功开始
   */
  function start(items: Idiom[], progress: Record<string, UserProgress>): boolean {
    if (items.length < QUIZ_SIZE) return false
    const lastWrongSet = new Set(lastSessionWrongIds.value)
    const avoidIds = lastSessionIds.value.filter((id) => !lastWrongSet.has(id))
    const wrongIds = [
      ...lastSessionWrongIds.value,
      ...Object.values(progress)
        .filter((p) => p.wrongTimes > 0)
        .map((p) => p.id)
    ]
    const qs = buildQuiz(items, { avoidIds, wrongIds })
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
      const res = await window.api.quiz.record({ answers: answers.value })
      if (!res.ok) submitError.value = res.error.message
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
    canStart,
    start,
    answer,
    next,
    finish,
    reset
  }
})
