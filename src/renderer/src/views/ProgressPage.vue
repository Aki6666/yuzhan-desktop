<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { NCard, NEmpty, NGrid, NGridItem, NStatistic, NTag } from 'naive-ui'
import { useProgressStore } from '@renderer/stores/progress'
import { summarizeProgress } from '@renderer/lib/progressSummary'

/**
 * 进度页（F9 简版，US-05）：掌握数 / 待复习 / 错词数 三摘要
 * 数据来自 progress store（T3，会话内事实源；§10.4 无进度读取 channel，
 * 重启后数据仍在 userData/progress.json，读取入口 v0.2）
 */
const progressStore = useProgressStore()

onMounted(() => {
  // progress store 无异步加载（无读取 channel），会话内由 T6/T7/T8 写入
})

const summary = computed(() => summarizeProgress(progressStore.progress))

const hasData = computed(() => summary.value.total > 0)
</script>

<template>
  <section class="view" data-testid="progress-page">
    <h1>进度</h1>

    <NEmpty v-if="!hasData" description="本会话暂无进度数据">
      <template #extra>
        <div class="empty-tip">
          <p>刷题遇到生词，用 Ctrl+K 记下来；去成语库浏览或自测 10 题组即可积累进度。</p>
          <p class="muted">重启后进度数据仍保存在 userData/progress.json（读取入口随 v0.2 补齐）。</p>
        </div>
      </template>
    </NEmpty>

    <NGrid v-else cols="3" :x-gap="16" :y-gap="16" responsive="screen">
      <NGridItem>
        <NCard data-testid="stat-mastered">
          <NStatistic label="掌握" :value="summary.mastered">
            <template #suffix>
              <NTag size="small" type="success" round>mastered</NTag>
            </template>
          </NStatistic>
        </NCard>
      </NGridItem>
      <NGridItem>
        <NCard data-testid="stat-reviewing">
          <NStatistic label="待复习" :value="summary.reviewing">
            <template #suffix>
              <NTag size="small" type="warning" round>learning / new</NTag>
            </template>
          </NStatistic>
        </NCard>
      </NGridItem>
      <NGridItem>
        <NCard data-testid="stat-wrong">
          <NStatistic label="错词数" :value="summary.wrong">
            <template #suffix>
              <NTag size="small" type="error" round>wrongTimes &gt; 0</NTag>
            </template>
          </NStatistic>
        </NCard>
      </NGridItem>
    </NGrid>

    <p v-if="hasData" class="muted total-line" data-testid="total-line">
      共 {{ summary.total }} 个词条有进度记录
    </p>
  </section>
</template>

<style scoped>
.empty-tip {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  color: #666;
  font-size: 13px;
}

.muted {
  color: #999;
  font-size: 12px;
}

.total-line {
  margin-top: 16px;
}
</style>
