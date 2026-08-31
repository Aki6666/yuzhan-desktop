<script setup lang="ts">
/**
 * 错题本页（/wrongbook，v0.2 §8：错题本 + 误用类型统计）
 * - 错题列表：wrongTimes>0 词条按次数降序，展示当前状态/错误次数/误用类型，
 *   可跳详情 / 「立即复习」（复习一次 → 记入闪卡队列）
 * - 误用类型统计：§5.2 8 类聚合计数与占比（横向条形可视化，消费 U1 token）
 * - 数据源：progress store（V2-A 已扩展）；空态引导去自测/成语库
 */
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NSpin, NTag } from 'naive-ui'
import { useIdiomsStore } from '@renderer/stores/idioms'
import { useProgressStore } from '@renderer/stores/progress'
import WrongTypeDistribution from '@renderer/components/wrong-book/WrongTypeDistribution.vue'
import { aggregateWrongTypes, statusLabel, statusTagType, wrongItems } from '@renderer/components/wrong-book/wrongBookStats'

const router = useRouter()
const idiomsStore = useIdiomsStore()
const progressStore = useProgressStore()

onMounted(() => {
  void idiomsStore.load()
})

const rows = computed(() => wrongItems(progressStore.progress, idiomsStore.items))
const stats = computed(() => aggregateWrongTypes(progressStore.progress))
const totalWrongTimes = computed(() => rows.value.reduce((a, r) => a + r.wrongTimes, 0))

/** 「立即复习」：复习一次（new→learning + SM-2 调度字段 + 强制 flush）并跳详情（记入闪卡队列） */
async function reviewNow(id: string): Promise<void> {
  progressStore.recordAttempt(id)
  await progressStore.flush()
  void router.push(`/idioms/${id}`)
}
</script>

<template>
  <section class="view wrongbook-page" data-testid="wrongbook-page">
    <header class="page-header">
      <div class="page-heading">
        <h1 class="page-title">错题本</h1>
        <p class="page-sub">错词汇总 · 误用类型分布</p>
      </div>
      <span class="result-count" data-testid="wrongbook-count">
        共 {{ rows.length }} 题 · {{ totalWrongTimes }} 次错误
      </span>
    </header>

    <!-- 词库加载中 -->
    <div v-if="idiomsStore.loading && !idiomsStore.loaded" class="list-state" data-testid="wrongbook-loading">
      <NSpin size="small" />
      <span class="state-text">词库加载中…</span>
    </div>

    <!-- 加载失败 -->
    <div v-else-if="idiomsStore.error && !idiomsStore.loaded" class="list-state" data-testid="wrongbook-error">
      <p class="state-text">词库加载失败：{{ idiomsStore.error }}</p>
    </div>

    <!-- 空态：无错题 → 引导去自测/成语库 -->
    <div v-else-if="rows.length === 0" class="list-state" data-testid="wrongbook-empty">
      <svg
        class="empty-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M15 9l-6 6" />
        <path d="M9 9l6 6" />
      </svg>
      <p class="empty-title">还没有错题</p>
      <p class="empty-desc">去自测 10 题组或浏览成语库积累错题数据</p>
      <div class="empty-actions">
        <RouterLink to="/quiz">
          <NButton size="small" type="primary" data-testid="goto-quiz">去自测</NButton>
        </RouterLink>
        <RouterLink to="/idioms">
          <NButton size="small" secondary data-testid="goto-idioms">去成语库浏览</NButton>
        </RouterLink>
      </div>
    </div>

    <template v-else>
      <!-- 误用类型统计卡 -->
      <div class="stats-card" data-testid="wrongbook-stats">
        <div class="stats-head">
          <h2 class="stats-title">误用类型分布</h2>
          <span class="stats-sub">§5.2 八类 · 按错误次数占比</span>
        </div>
        <WrongTypeDistribution :stats="stats" />
      </div>

      <!-- 错题列表 -->
      <ul class="wrong-list" data-testid="wrong-list">
        <li
          v-for="row in rows"
          :key="row.id"
          class="wrong-row"
          data-testid="wrong-row"
          :data-id="row.id"
        >
          <RouterLink :to="`/idioms/${row.id}`" class="wrong-main">
            <span class="wrong-word" data-testid="wrong-word">{{ row.word }}</span>
            <span class="wrong-pinyin">{{ row.pinyin }}</span>
          </RouterLink>
          <div class="wrong-meta">
            <NTag size="small" :type="statusTagType(row.status)" :bordered="false" data-testid="wrong-status">
              {{ statusLabel(row.status) }}
            </NTag>
            <NTag size="small" type="error" :bordered="false" round data-testid="wrong-times">
              错 {{ row.wrongTimes }} 次
            </NTag>
            <NTag
              v-for="t in row.wrongTypes"
              :key="t.type"
              size="small"
              :bordered="false"
              class="wrong-type-tag"
            >
              {{ t.type }}{{ t.count > 1 ? ` ×${t.count}` : '' }}
            </NTag>
            <NButton size="small" secondary data-testid="wrong-review" @click="reviewNow(row.id)">
              立即复习
            </NButton>
          </div>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.wrongbook-page {
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
  gap: 12px;
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

.result-count {
  font-size: var(--y-font-aux);
  color: var(--y-text-secondary);
  padding-bottom: 2px;
}

.list-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 280px;
  padding: 40px;
  background: var(--y-bg-card);
  border: 1px solid var(--y-border-light);
  border-radius: var(--y-radius-lg);
  text-align: center;
}

.state-text {
  font-size: var(--y-font-body);
  color: var(--y-text-secondary);
}

.empty-icon {
  width: 40px;
  height: 40px;
  color: var(--y-text-tertiary);
  margin-bottom: 4px;
}

.empty-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--y-text-body);
}

.empty-desc {
  margin: 0 0 6px;
  font-size: var(--y-font-body);
  color: var(--y-text-tertiary);
}

.empty-actions {
  display: flex;
  gap: 8px;
}

/* 统计卡 */
.stats-card {
  padding: 18px 20px;
  background: var(--y-bg-card);
  border: 1px solid var(--y-border-light);
  border-radius: var(--y-radius-lg);
  box-shadow: var(--y-shadow-card);
}

.stats-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}

.stats-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--y-text-primary);
}

.stats-sub {
  font-size: var(--y-font-aux);
  color: var(--y-text-tertiary);
}

/* 错题列表 */
.wrong-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--y-border-light);
  border-radius: var(--y-radius-lg);
  overflow: hidden;
  background: var(--y-bg-card);
  box-shadow: var(--y-shadow-card);
}

.wrong-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--y-border-light);
  transition: background-color 0.12s ease;
}

.wrong-row:last-child {
  border-bottom: none;
}

.wrong-row:hover {
  background: var(--y-bg-hover);
}

.wrong-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  text-decoration: none;
  color: inherit;
}

.wrong-word {
  font-size: 16px;
  font-weight: 600;
  color: var(--y-text-primary);
}

.wrong-pinyin {
  font-size: var(--y-font-aux);
  color: var(--y-text-tertiary);
}

.wrong-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.wrong-type-tag {
  color: var(--y-text-secondary);
}
</style>
