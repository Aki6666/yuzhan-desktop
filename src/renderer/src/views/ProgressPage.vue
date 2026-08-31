<script setup lang="ts">
/**
 * 进度页（F9 简版，US-05）：掌握数 / 待复习 / 错词数 三摘要
 * 数据来自 progress store（T3，会话内事实源；§10.4 无进度读取 channel，
 * 重启后数据仍在 userData/progress.json，读取入口 v0.2）
 *
 * U2 视觉重构：三摘要改大数字统计卡 + 辅助说明，消费 U1 设计 token；data-testid 不变。
 */
import { computed, onMounted } from 'vue'
import { NEmpty, NGrid, NGridItem, NTag } from 'naive-ui'
import { useProgressStore } from '@renderer/stores/progress'
import { summarizeProgress } from '@renderer/lib/progressSummary'

const progressStore = useProgressStore()

onMounted(() => {
  // progress store 无异步加载（无读取 channel），会话内由 T6/T7/T8 写入
})

const summary = computed(() => summarizeProgress(progressStore.progress))

const hasData = computed(() => summary.value.total > 0)
</script>

<template>
  <section class="view progress-page" data-testid="progress-page">
    <header class="page-header">
      <div class="page-heading">
        <h1 class="page-title">进度</h1>
        <p class="page-sub">掌握 / 待复习 / 错词 一览</p>
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

    <NGrid v-else cols="3" :x-gap="16" :y-gap="16" responsive="screen" class="stat-grid">
      <NGridItem>
        <div class="stat-card" data-testid="stat-mastered">
          <div class="stat-value" data-stat="mastered">{{ summary.mastered }}</div>
          <div class="stat-label">掌握</div>
          <NTag size="small" type="success" :bordered="false" round>mastered</NTag>
          <p class="stat-note">连续 3 次「认识」达到</p>
        </div>
      </NGridItem>
      <NGridItem>
        <div class="stat-card" data-testid="stat-reviewing">
          <div class="stat-value" data-stat="reviewing">{{ summary.reviewing }}</div>
          <div class="stat-label">待复习</div>
          <NTag size="small" type="warning" :bordered="false" round>learning / new</NTag>
          <p class="stat-note">需要再次巩固的词条</p>
        </div>
      </NGridItem>
      <NGridItem>
        <div class="stat-card" data-testid="stat-wrong">
          <div class="stat-value" data-stat="wrong">{{ summary.wrong }}</div>
          <div class="stat-label">错词数</div>
          <NTag size="small" type="error" :bordered="false" round>wrongTimes &gt; 0</NTag>
          <p class="stat-note">自测 / 复习中答错过的词条</p>
        </div>
      </NGridItem>
    </NGrid>

    <p v-if="hasData" class="muted total-line" data-testid="total-line">
      共 {{ summary.total }} 个词条有进度记录
    </p>
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

.stat-grid {
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

.muted {
  color: var(--y-text-tertiary);
  font-size: var(--y-font-aux);
}

.total-line {
  margin: 0;
  padding-left: 2px;
}
</style>
