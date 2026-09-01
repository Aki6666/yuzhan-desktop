<script setup lang="ts">
/**
 * 仪表盘首页（用户要求 #1「新的方式排布」，2026-09-01；v0.2.6 墨韵重构）
 * - 打开应用先进仪表盘：墨晕欢迎区 + 学习统计 + 功能入口大卡片
 * - 统计：语料词条 / 学习中 / 已掌握 / 错题 / 易混对 / 最近自测正确率
 * - 入口：成语库 / 闪卡 / 自测 / 易混淆 / 错题本 / 生词本
 */
import { computed, onMounted, ref } from 'vue'
import { NButton } from 'naive-ui'
import { useIdiomsStore } from '@renderer/stores/idioms'
import { useProgressStore } from '@renderer/stores/progress'
import { todayDueCount } from '@renderer/components/progress-dashboard/dashboardStats'
import type { QuizHistoryItem } from '@shared/ipc/contracts'

const idiomsStore = useIdiomsStore()
const progressStore = useProgressStore()

const pairCount = ref(0)
const history = ref<QuizHistoryItem[]>([])

/** 今日（YYYY-MM-DD，UTC 口径与 store lastSeen/due 一致） */
const todayStr = new Date().toISOString().slice(0, 10)

/** 今日到期待复习数（SM-2 调度，v0.2.6 P1-② 每日目标） */
const dueToday = computed(() => todayDueCount(progressStore.progress, todayStr))

const stats = computed(() => {
  const p = progressStore.progress
  let learning = 0
  let mastered = 0
  let wrong = 0
  for (const item of Object.values(p)) {
    if (item.status === 'learning') learning++
    if (item.status === 'mastered') mastered++
    if ((item.wrongTimes ?? 0) > 0) wrong++
  }
  return {
    idioms: idiomsStore.items.length,
    learning,
    mastered,
    wrong,
    pairs: pairCount.value
  }
})

/** 最近一次自测正确率（无历史 → null） */
const lastRate = computed<number | null>(() => {
  const h = history.value[0]
  if (!h || h.total === 0) return null
  return Math.round((h.correct / h.total) * 100)
})

const ENTRIES = [
  { to: '/idioms', label: '成语库', desc: '浏览 2600+ 高频成语 · 多列检索', icon: ['M4 19.5A2.5 2.5 0 0 1 6.5 17H20', 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'] },
  { to: '/flashcards', label: '闪卡', desc: '碎片时间复习 · 3 次认识即掌握', icon: ['M13 2 3 14h9l-1 8 10-12h-9l1-8z'] },
  { to: '/quiz', label: '自测', desc: '10 题一组 · 错题进错题本', icon: ['M22 11.08V12a10 10 0 1 1-5.93-9.14', 'M22 4 12 14.01l-3-3'] },
  { to: '/confusable', label: '易混淆', desc: '结对辨析 · 一句话说清区别', icon: ['M16 3h5v5', 'M4 20 21 3', 'M21 16v5h-5', 'M15 15l6 6', 'M4 4l5 5'] },
  { to: '/wrongbook', label: '错题本', desc: '错词汇总 · 误用类型分布', icon: ['M12 22c5.5 0 10-4.5 10-10S17.5 2 12 2 2 6.5 2 12s4.5 10 10 10z', 'M15 9l-6 6', 'M9 9l6 6'] },
  { to: '/pending', label: '生词本', desc: '未收录词条暂存 · AI 补全', icon: ['M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z'] }
] as const

onMounted(() => {
  void idiomsStore.load()
  void progressStore.load()
  void window.api.pairs.list().then((r) => {
    if (r.ok) pairCount.value = r.data.pairs.length
  })
  void window.api.quiz.history.list().then((r) => {
    if (r.ok) history.value = r.data.items
  })
})
</script>

<template>
  <section class="view dashboard-page">
    <!-- 欢迎区：墨晕 + 朱砂印章 -->
    <header class="welcome">
      <div class="welcome-wash" aria-hidden="true" />
      <div class="welcome-seal y-seal" aria-hidden="true">语</div>
      <div class="welcome-main">
        <h1 class="welcome-title">语栈</h1>
        <p class="welcome-sub">公务员考试 · 言语理解成语积累</p>
      </div>
      <div v-if="lastRate !== null" class="last-rate">
        <span class="rate-num y-num">{{ lastRate }}%</span>
        <span class="rate-label">最近自测正确率</span>
      </div>
    </header>

    <!-- 每日目标：今日到期待复习（v0.2.6 P1-②） -->
    <div v-if="dueToday > 0" class="due-banner" data-testid="today-due">
      <span class="due-seal" aria-hidden="true">今</span>
      <div class="due-main">
        <span class="due-title">今日有 <b class="due-num">{{ dueToday }}</b> 张到期复习</span>
        <span class="due-sub">趁热打铁，先清今天的卡</span>
      </div>
      <RouterLink to="/flashcards" class="due-action">
        <NButton size="small" type="primary" data-testid="goto-flashcards">去复习</NButton>
      </RouterLink>
    </div>

    <!-- 学习统计 -->
    <div class="stats-grid">
      <div class="stat-card">
        <span class="stat-num y-num">{{ stats.idioms }}</span>
        <span class="stat-label">语料词条</span>
      </div>
      <div class="stat-card">
        <span class="stat-num y-num">{{ stats.learning }}</span>
        <span class="stat-label">学习中</span>
      </div>
      <div class="stat-card">
        <span class="stat-num y-num">{{ stats.mastered }}</span>
        <span class="stat-label">已掌握</span>
      </div>
      <div class="stat-card">
        <span class="stat-num accent y-num">{{ stats.wrong }}</span>
        <span class="stat-label">错题</span>
      </div>
      <div class="stat-card">
        <span class="stat-num y-num">{{ stats.pairs }}</span>
        <span class="stat-label">易混对</span>
      </div>
    </div>

    <!-- 功能入口 -->
    <div class="entry-grid">
      <RouterLink v-for="e in ENTRIES" :key="e.to" :to="e.to" class="entry-card">
        <span class="entry-icon-box" aria-hidden="true">
          <svg
            class="entry-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path v-for="(d, i) in e.icon" :key="i" :d="d" />
          </svg>
        </span>
        <div class="entry-text">
          <span class="entry-label">{{ e.label }}</span>
          <span class="entry-desc">{{ e.desc }}</span>
        </div>
        <span class="entry-arrow" aria-hidden="true">→</span>
      </RouterLink>
    </div>
  </section>
</template>

<style scoped>
.dashboard-page {
  max-width: 960px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 22px;
}

/* 欢迎区：深墨墨晕 + 朱砂印章（书斋气质） */
.welcome {
  position: relative;
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 30px 32px;
  border-radius: var(--y-radius-xl);
  background:
    radial-gradient(420px 180px at 88% -40px, rgba(192, 67, 44, 0.22), transparent 70%),
    linear-gradient(135deg, #2a2823 0%, #1c1b18 55%, #26231d 100%);
  color: #fff;
  box-shadow: var(--y-shadow-pop);
  overflow: hidden;
}

/* 顶部细饰：朱砂线性（印章落款感） */
.welcome::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--y-primary) 0%, rgba(192, 67, 44, 0.25) 70%, transparent 100%);
}

.welcome-wash {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(260px 140px at 12% 120%, rgba(192, 67, 44, 0.1), transparent 65%);
  pointer-events: none;
}

.welcome-seal {
  width: 46px;
  height: 46px;
  flex: 0 0 46px;
  font-size: 22px;
  position: relative;
}

.welcome-main {
  position: relative;
  min-width: 0;
}

.welcome-title {
  margin: 0;
  font-family: var(--y-font-serif);
  font-size: 32px;
  font-weight: 700;
  letter-spacing: 8px;
  line-height: 1.15;
}

.welcome-sub {
  margin: 8px 0 0;
  font-size: var(--y-font-body);
  opacity: 0.72;
  letter-spacing: 0.5px;
}

.last-rate {
  position: relative;
  margin-left: auto;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.rate-num {
  font-size: 30px;
  font-weight: 700;
  color: #fff;
}

.rate-label {
  font-size: var(--y-font-aux);
  opacity: 0.7;
}

/* 每日目标横幅（v0.2.6 P1-②） */
.due-banner {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  border: 1px solid color-mix(in srgb, var(--y-primary) 28%, var(--y-border-light));
  border-radius: var(--y-radius-lg);
  background:
    radial-gradient(200px 80px at 0% 0%, color-mix(in srgb, var(--y-primary) 6%, transparent), transparent 70%),
    var(--y-bg-card);
  box-shadow: var(--y-shadow-card);
}

.due-seal {
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--y-font-serif);
  font-size: 15px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(150deg, var(--y-primary) 0%, var(--y-primary-active) 100%);
  border-radius: 8px;
  box-shadow: 0 2px 6px rgba(150, 48, 31, 0.28);
}

.due-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.due-title {
  font-size: var(--y-font-body);
  color: var(--y-text-body);
}

.due-num {
  color: var(--y-primary);
  font-size: 18px;
}

.due-sub {
  font-size: var(--y-font-aux);
  color: var(--y-text-tertiary);
}

.due-action {
  margin-left: auto;
  text-decoration: none;
}

/* 统计卡 */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}

.stat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 18px 12px;
  border: 1px solid var(--y-border-light);
  border-radius: var(--y-radius-lg);
  background: var(--y-bg-card);
  box-shadow: var(--y-shadow-card);
  transition:
    transform var(--y-motion-base) var(--y-motion-ease),
    box-shadow var(--y-motion-base) var(--y-motion-ease);
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--y-shadow-pop);
}

.stat-num {
  font-size: 26px;
  font-weight: 700;
  color: var(--y-text-primary);
}

.stat-num.accent {
  color: var(--y-primary);
}

.stat-label {
  font-size: var(--y-font-aux);
  letter-spacing: 1px;
  color: var(--y-text-tertiary);
}

/* 功能入口 */
.entry-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.entry-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
  border: 1px solid var(--y-border-light);
  border-radius: var(--y-radius-lg);
  background: var(--y-bg-card);
  text-decoration: none;
  color: inherit;
  box-shadow: var(--y-shadow-card);
  transition:
    border-color var(--y-motion-base) var(--y-motion-ease),
    transform var(--y-motion-base) var(--y-motion-ease),
    box-shadow var(--y-motion-base) var(--y-motion-ease);
}

.entry-card:hover {
  border-color: color-mix(in srgb, var(--y-primary) 32%, var(--y-border));
  transform: translateY(-2px);
  box-shadow: var(--y-shadow-pop);
}

.entry-icon-box {
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--y-radius-md);
  background: var(--y-primary-soft);
  color: var(--y-primary);
  transition: background-color var(--y-motion-base) var(--y-motion-ease);
}

.entry-card:hover .entry-icon-box {
  background: color-mix(in srgb, var(--y-primary) 14%, var(--y-bg-card));
}

.entry-icon {
  width: 21px;
  height: 21px;
}

.entry-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.entry-label {
  font-family: var(--y-font-serif);
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 1px;
  color: var(--y-text-primary);
}

.entry-desc {
  font-size: var(--y-font-aux);
  color: var(--y-text-tertiary);
}

.entry-arrow {
  margin-left: auto;
  color: var(--y-text-tertiary);
  font-size: 16px;
  transition:
    transform var(--y-motion-base) var(--y-motion-ease),
    color var(--y-motion-base) var(--y-motion-ease);
}

.entry-card:hover .entry-arrow {
  color: var(--y-primary);
  transform: translateX(3px);
}
</style>
