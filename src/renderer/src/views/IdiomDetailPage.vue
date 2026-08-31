<script setup lang="ts">
/**
 * 成语详情页（路由 /idioms/:id，PLAN.md §3.2 / F4 / AC-02）
 * - 由列表页点击 / 快速输入命中跳转进入（T4/T6 侧消费，本页只实现视图）
 * - 数据来自 idioms store（T3 提供，只消费不重写）；纯本地渲染，无 AI 依赖（AC-02 离线可用）
 * - 三态：加载中（NSpin）/ 未收录（NEmpty + 返回引导）/ 正常（IdiomDetailCard）
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NEmpty, NSpin } from 'naive-ui'
import { useIdiomsStore } from '@renderer/stores/idioms'
import IdiomDetailCard from '@renderer/components/idiom-detail/IdiomDetailCard.vue'

const route = useRoute()
const router = useRouter()
const store = useIdiomsStore()

/** 当前词条 id（路由参数，/idioms/:id） */
const idiomId = computed(() => String(route.params.id ?? ''))

const idiom = computed(() => store.byId(idiomId.value))

/** 加载失败重试计数器（驱动 watch 重新拉取） */
const retryTick = ref(0)

async function ensureLoaded(): Promise<void> {
  if (!store.loaded && !store.loading) {
    await store.load()
  }
}

onMounted(() => {
  void ensureLoaded()
})

// 路由参数变化（列表→详情、详情→详情）与重试时重新定位
watch([idiomId, retryTick], () => {
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
}

.state-text {
  margin: 0;
  color: var(--y-text-secondary);
  font-size: var(--y-font-body);
}
</style>
