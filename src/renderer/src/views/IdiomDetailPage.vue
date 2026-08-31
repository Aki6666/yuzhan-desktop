<script setup lang="ts">
/**
 * 成语详情页（路由 /idioms/:id，PLAN.md §3.2 / F4 / AC-02）
 * - 由列表页点击 / 快速输入命中跳转进入（T4/T6 侧消费，本页只实现视图）
 * - 数据：先以 store 列表条目即时渲染，再经 data:get 拉全量（examples/origin，
 *   列表为性能已剥离这两字段，用户要求 #1）；纯本地渲染，无 AI 依赖（AC-02 离线可用）
 * - 三态：加载中（NSpin）/ 未收录（NEmpty + 返回引导）/ 正常（IdiomDetailCard）
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NEmpty, NSpin } from 'naive-ui'
import { useIdiomsStore } from '@renderer/stores/idioms'
import IdiomDetailCard from '@renderer/components/idiom-detail/IdiomDetailCard.vue'
import type { Idiom } from '@shared/ipc/contracts'

const route = useRoute()
const router = useRouter()
const store = useIdiomsStore()

/** 当前词条 id（路由参数，/idioms/:id） */
const idiomId = computed(() => String(route.params.id ?? ''))

/** 全量词条（data:get 拉取后合并 examples/origin） */
const fullIdiom = ref<Idiom | null>(null)

/** 先显示列表条目（快），全量到达后合并 */
const idiom = computed<Idiom | null>(() => {
  const base = store.byId(idiomId.value) ?? null
  const full = fullIdiom.value
  if (!full) return base
  return full
})

/** 加载失败重试计数器（驱动 watch 重新拉取） */
const retryTick = ref(0)

async function ensureLoaded(): Promise<void> {
  if (!store.loaded && !store.loading) {
    await store.load()
  }
  // 拉取全量（examples/origin；列表已剥离以减小 IPC 载荷）
  const id = idiomId.value
  if (!id) return
  try {
    const res = await window.api.data.get(id)
    if (res.ok && res.data) fullIdiom.value = res.data
  } catch {
    /* 全量失败不阻塞：保留列表条目展示 */
  }
}

onMounted(() => {
  void ensureLoaded()
})

// 路由参数变化（列表→详情、详情→详情）与重试时重新定位
watch([idiomId, retryTick], () => {
  fullIdiom.value = null
  void ensureLoaded()
})

function goBackToList(): void {
  router.push({ name: 'idioms' })
}
</script>

<template>
  <section class="view detail-page">
    <div class="detail-toolbar">
      <NButton size="small" quaternary class="back-btn" @click="goBackToList">
        <span aria-hidden="true">←</span> 返回列表
      </NButton>
    </div>

    <!-- 加载中 -->
    <div v-if="store.loading && !store.loaded" class="state-block" data-testid="state-loading">
      <NSpin size="small" />
      <p class="state-text">词库加载中…</p>
    </div>

    <!-- 加载失败 -->
    <div v-else-if="store.error && !store.loaded" class="state-block" data-testid="state-error">
      <p class="state-text">词库加载失败：{{ store.error }}</p>
      <NButton size="small" data-testid="retry-button" @click="retryTick++">重试</NButton>
    </div>

    <!-- 未收录 -->
    <div v-else-if="!idiom" class="state-block" data-testid="state-not-found">
      <NEmpty description="词库未收录该成语">
        <template #extra>
          <NButton size="small" type="primary" @click="goBackToList">去成语库浏览</NButton>
        </template>
      </NEmpty>
    </div>

    <!-- 正常展示 -->
    <IdiomDetailCard v-else :idiom="idiom" />
  </section>
</template>

<style scoped>
.detail-page {
  max-width: 880px;
  margin: 0 auto;
}

.detail-toolbar {
  display: flex;
  align-items: center;
  margin-bottom: 14px;
}

.back-btn {
  color: var(--y-text-secondary);
}

.state-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 280px;
  padding: 40px;
  background: var(--y-bg-card);
  border: 1px solid var(--y-border-light);
  border-radius: var(--y-radius-lg);
  box-shadow: var(--y-shadow-card);
}

.state-text {
  margin: 0;
  color: var(--y-text-secondary);
  font-size: var(--y-font-body);
}
</style>
