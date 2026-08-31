<script setup lang="ts">
/**
 * 进度页 · 掌握度仪表盘（V2-E，v0.2 §8；F9/US-05 升级）
 *
 * - 掌握度百分比：mastered / 正式库总词条（idioms store；未加载时回退 progress 条目数）
 * - 近 7 日复习趋势（reviewAt 落日复习数 + lastSeen 落日新掌握数，mini 条形图）
 * - 误用类型分布（复用 V2-D wrongBookStats.aggregateWrongTypes + WrongTypeDistribution）
 * - 三摘要大数字统计卡保留（掌握/待复习/错词）+ 新增今日到期复习数（ReviewState.due，V2-A）
 * - 消费 U1 设计 token；空态引导
 */
import { computed, onMounted } from 'vue'
import { NEmpty, NGrid, NGridItem, NTag } from 'naive-ui'
import { useIdiomsStore } from '@renderer/stores/idioms'
import { useProgressStore } from '@renderer/stores/progress'
import { summarizeProgress } from '@renderer/lib/progressSummary'
import { aggregateWrongTypes } from '@renderer/components/wrong-book/wrongBookStats'
import WrongTypeDistribution from '@renderer/components/wrong-book/WrongTypeDistribution.vue'
import { masteryPercent, reviewTrend, todayDueCount } from '@renderer/components/progress-dashboard/dashboardStats'
import TrendBars from '@renderer/components/progress-dashboard/TrendBars.vue'

const progressStore = useProgressStore()
const idiomsStore = useIdiomsStore()

onMounted(() => {
  // idioms store 提供正式库总词条数（掌握度分母）；progress store 为会话内事实源
  void idiomsStore.load()
})

/** 今天（YYYY-MM-DD，UTC 口径与 store lastSeen/due 一致） */
const today = computed(() => new Date().toISOString().slice(0, 10))

const summary = computed(() => summarizeProgress(progressStore.progress))

/** 总词条：正式库规模优先，未加载时回退 progress 条目数 */
const totalWords = computed(() =>
  idiomsStore.items.length > 0 ? idiomsStore.items.length : summary.value.total
)

const mastery = computed(() => masteryPercent(summary.value.mastered, totalWords.value))

const dueToday = computed(() => todayDueCount(progressStore.progress, today.value))

const trend = computed(() => reviewTrend(progressStore.progress, today.value, 7))

const wrongTypeStats = computed(() => aggregateWrongTypes(progressStore.progress))

const hasData = computed(() => summary.value.total > 0)
</script>

<template>
  <section class="view progress-page" data-testid="progress-page">
    <header class="page-header">
      <div class="page-heading">
        <h1 class="page-title">进度</h1>
        <p class="page-sub">掌握度 / 复习趋势 / 误用类型 · 一览</p>
      </div>
    </header>

    <NEmpty v-if="!hasData" class="empty-block" description="本会话暂无进度数据">
      <template #extra>
        <div class="empty-tip">
          <p>刷题遇到生词，用 Ctrl+K 记下来；去成语库浏览或自测 10 题组即可积累进度。</p>
          <p class="muted">重启后进度数据仍保存在 userData/progress.json（读取入口随 v0.2 补齐）。</p>
        </div>
      </template>
    </NEmpty>

    <template v-else>
      <!-- 掌握度总览卡 -->
      <div class="mastery-card" data-testid="mastery-card">
        <div class="mastery-main">
          <div class="mastery-value" data-testid="mastery-value">{{ mastery }}%</div>
          <div class="mastery-meta">
            <span class="mastery-label">掌握度</span>
            <span class="mastery-sub">已掌握 {{ summary.mastered }} / {{ totalWords }} 词条</span>
          </div>
        </div>
        <div class="mastery-track" aria-hidden="true">
          <div class="mastery-fill" :style="{ width: `${Math.min(100, mastery)}%` }" data-testid="mastery-fill" />
        </div>
      </div>

      <!-- 四摘要统计卡：掌握 / 待复习 / 错词 / 今日到期 -->
      <NGrid cols="4" :x-gap="16" :y-gap="16" responsive="screen" class="stat-grid">
        <NGridItem>
          <div class="stat-card" data-testid="stat-mastered">
            <div class="stat-value" data-stat="mastered">{{ summary.mastered }}</div>
            <div class="stat-label">掌握</div>
            <NTag size="small" type="success" :bordered="false" round>已掌握</NTag>
            <p class="stat-note">连续 3 次「认识」达到</p>
          </div>
        </NGridItem>
        <NGridItem>
          <div class="stat-card" data-testid="stat-reviewing">
            <div class="stat-value" data-stat="reviewing">{{ summary.reviewing }}</div>
            <div class="stat-label">待复习</div>
            <NTag size="small" type="warning" :bordered="false" round>学习中 / 新词</NTag>
            <p class="stat-note">需要再次巩固的词条</p>
          </div>
        </NGridItem>
        <NGridItem>
          <div class="stat-card" data-testid="stat-wrong">
            <div class="stat-value" data-stat="wrong">{{ summary.wrong }}</div>
            <div class="stat-label">错词数</div>
            <NTag size="small" type="error" :bordered="false" round>答错过</NTag>
            <p class="stat-note">自测 / 复习中答错过的词条</p>
          </div>
        </NGridItem>
        <NGridItem>
          <div class="stat-card stat-card-due" data-testid="stat-due">
            <div class="stat-value" data-stat="due">{{ dueToday }}</div>
            <div class="stat-label">今日到期</div>
            <NTag size="small" type="info" :bordered="false" round>SM-2 调度</NTag>
            <p class="stat-note">ReviewState.due ≤ 今天，可立即复习</p>
          </div>
        </NGridItem>
      </NGrid>

      <!-- 趋势 + 误用类型分布 -->
      <NGrid cols="2" :x-gap="16" :y-gap="16" responsive="screen" class="detail-grid">
        <NGridItem>
          <div class="panel-card" data-testid="trend-card">
            <h3 class="panel-title">近 7 日复习趋势</h3>
            <TrendBars :points="trend" />
          </div>
        </NGridItem>
        <NGridItem>
          <div class="panel-card" data-testid="wrong-type-card">
            <h3 class="panel-title">误用类型分布</h3>
            <WrongTypeDistribution :stats="wrongTypeStats" />
          </div>
        </NGridItem>
      </NGrid>

      <p class="muted total-line" data-testid="total-line">
        共 {{ summary.total }} 个词条有进度记录
      </p>
    </template>
  </section>
</template>

<style scoped>
.progress-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 880px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
}

.page-heading {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.page-title {
  margin: 0;
  font-size: var(--y-font-title-lg);
  font-weight: 700;
  color: var(--y-text-primary);
}

.page-sub {
  margin: 0;
  font-size: var(--y-font-aux);
  color: var(--y-text-tertiary);
}

.empty-block {
  background: var(--y-bg-card);
  border: 1px solid var(--y-border-light);
  border-radius: var(--y-radius-lg);
  padding: 40px 24px;
}

.empty-tip {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  color: var(--y-text-secondary);
  font-size: 13px;
}

/* 掌握度总览卡 */
.mastery-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px 22px;
  background: var(--y-bg-card);
  border: 1px solid var(--y-border-light);
  border-radius: var(--y-radius-lg);
  box-shadow: var(--y-shadow-card);
}

.mastery-main {
  display: flex;
  align-items: baseline;
  gap: 14px;
}

.mastery-value {
  font-size: 44px;
  font-weight: 700;
  line-height: 1.1;
  color: var(--y-primary);
  font-variant-numeric: tabular-nums;
}

.mastery-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mastery-label {
  font-size: var(--y-font-body);
  font-weight: 600;
  color: var(--y-text-body);
}

.mastery-sub {
  font-size: var(--y-font-aux);
  color: var(--y-text-tertiary);
}

.mastery-track {
  height: 8px;
  border-radius: 4px;
  background: var(--y-bg-hover);
  overflow: hidden;
}

.mastery-fill {
  height: 100%;
  border-radius: 4px;
  background: var(--y-primary);
  transition: width 0.4s ease;
}

.stat-grid {
  row-gap: 16px;
}

.detail-grid {
  row-gap: 16px;
}

/* 大数字统计卡 */
.stat-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 20px 22px;
  background: var(--y-bg-card);
  border: 1px solid var(--y-border-light);
  border-radius: var(--y-radius-lg);
  box-shadow: var(--y-shadow-card);
}

.stat-card-due {
  border-color: color-mix(in srgb, var(--y-info) 30%, var(--y-border));
}

.stat-value {
  font-size: 40px;
  font-weight: 700;
  line-height: 1.1;
  color: var(--y-text-primary);
  font-variant-numeric: tabular-nums;
}

.stat-label {
  font-size: var(--y-font-body);
  font-weight: 600;
  color: var(--y-text-body);
}

.stat-note {
  margin: 2px 0 0;
  font-size: var(--y-font-aux);
  color: var(--y-text-tertiary);
}

/* 面板卡（趋势 / 分布） */
.panel-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px 22px;
  background: var(--y-bg-card);
  border: 1px solid var(--y-border-light);
  border-radius: var(--y-radius-lg);
  box-shadow: var(--y-shadow-card);
}

.panel-title {
  margin: 0;
  font-size: var(--y-font-body);
  font-weight: 600;
  color: var(--y-text-body);
}

.muted {
  color: var(--y-text-tertiary);
  font-size: var(--y-font-aux);
}

.total-line {
  margin: 0;
  padding-left: 2px;
}
</style>
