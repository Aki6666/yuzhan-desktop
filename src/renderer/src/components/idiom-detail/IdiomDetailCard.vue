<script setup lang="ts">
/**
 * 成语详情卡片（PLAN.md F4 / §3.3 / §5.1）
 * 纯本地数据渲染（AC-02 离线可用，无 AI 依赖），数据由父级从 idioms store 注入。
 * 展示字段：释义（多义项「；」分隔渲染）/出处/感情色彩/语域/误用类型/近义辨析组（折叠）/反义/真题例句/频次/主题
 *
 * U2 视觉重构：信息层级——顶部词条区（大字词形+拼音+徽标）与正文分区卡片（细分割线分隔），
 * 消费 U1 设计 token；data-testid 与行为（默认折叠等）保持不变。
 */
import { computed } from 'vue'
import { NTag } from 'naive-ui'
import type { Idiom } from '@shared/ipc/contracts'
import { splitMeanings } from './detailFormat'
import NearDiffGroup from './NearDiffGroup.vue'
import ExampleList from './ExampleList.vue'

const props = defineProps<{ idiom: Idiom }>()

/** 多义项：按「；」拆分逐条渲染（§5.1） */
const senses = computed(() => splitMeanings(props.idiom.meaning))

const emotionType = computed(() => {
  switch (props.idiom.emotion) {
    case '褒':
      return 'success'
    case '贬':
      return 'error'
    default:
      return 'default'
  }
})

const registerText = computed(() => (props.idiom.register === '无' ? '' : props.idiom.register))

const freqDots = computed(() => Array.from({ length: 5 }, (_, i) => i < props.idiom.frequency))
</script>

<template>
  <article class="idiom-card" data-testid="idiom-detail-card">
    <!-- 顶部词条区：大字词形 + 拼音 + 频次 + 徽标（感情色彩/语域/误用类型） -->
    <header class="card-hero">
      <div class="hero-row">
        <div class="hero-main">
          <h2 class="word">{{ idiom.word }}</h2>
          <p class="pinyin">{{ idiom.pinyin }}</p>
        </div>
        <div class="freq" :title="`真题频次 ${idiom.frequency}/5`" aria-label="真题频次">
          <span
            v-for="(on, i) in freqDots"
            :key="i"
            class="freq-dot"
            :class="{ on }"
            aria-hidden="true"
          />
          <span class="freq-num">{{ idiom.frequency }}/5</span>
        </div>
      </div>

      <div class="hero-tags">
        <NTag size="small" :type="emotionType" :bordered="false" data-testid="emotion-tag">
          {{ idiom.emotion }}
        </NTag>
        <NTag v-if="registerText" size="small" type="warning" :bordered="false" data-testid="register-tag">
          {{ registerText }}
        </NTag>
        <NTag
          v-for="t in idiom.errorTypes"
          :key="t"
          size="small"
          type="error"
          :bordered="false"
          class="error-tag"
        >
          {{ t }}
        </NTag>
      </div>
    </header>

    <!-- 正文分区卡片：细分割线分隔 -->
    <div class="card-body">
      <!-- 释义：多义项分号分隔渲染 -->
      <section class="card-section" data-testid="section-meaning">
        <h3 class="sec-title">释义</h3>
        <ol v-if="senses.length > 1" class="senses">
          <li v-for="(s, i) in senses" :key="i" class="sense-item">{{ s }}</li>
        </ol>
        <p v-else class="meaning">{{ idiom.meaning }}</p>
      </section>

      <!-- 出处 -->
      <section v-if="idiom.origin" class="card-section" data-testid="section-origin">
        <h3 class="sec-title">出处</h3>
        <p class="origin">{{ idiom.origin }}</p>
      </section>

      <!-- 适用/语境 -->
      <section v-if="idiom.usage" class="card-section" data-testid="section-usage">
        <h3 class="sec-title">适用</h3>
        <p class="usage">{{ idiom.usage }}</p>
      </section>

      <!-- 近义辨析组：默认折叠，diff 一句话展示（§3.4） -->
      <section v-if="idiom.near && idiom.near.length > 0" class="card-section" data-testid="section-near">
        <h3 class="sec-title">近义辨析</h3>
        <NearDiffGroup :near="idiom.near" />
      </section>

      <!-- 反义 -->
      <section v-if="idiom.opposite && idiom.opposite.length > 0" class="card-section" data-testid="section-opposite">
        <h3 class="sec-title">反义</h3>
        <ul class="opposite-list">
          <li v-for="(o, i) in idiom.opposite" :key="i" class="opposite-item">{{ o }}</li>
        </ul>
      </section>

      <!-- 真题例句：exam 带卷别、made 标注 -->
      <section v-if="idiom.examples && idiom.examples.length > 0" class="card-section" data-testid="section-examples">
        <h3 class="sec-title">例句</h3>
        <ExampleList :examples="idiom.examples" />
      </section>

      <!-- 主题 -->
      <section v-if="idiom.tags && idiom.tags.length > 0" class="card-section" data-testid="section-tags">
        <h3 class="sec-title">主题</h3>
        <div class="tag-list">
          <NTag v-for="t in idiom.tags" :key="t" size="small" :bordered="false" class="tag-item">
            {{ t }}
          </NTag>
        </div>
      </section>
    </div>
  </article>
</template>

<style scoped>
.idiom-card {
  background: var(--y-bg-card);
  border: 1px solid var(--y-border-light);
  border-radius: var(--y-radius-lg);
  box-shadow: var(--y-shadow-card);
  overflow: hidden;
}

/* 顶部词条区 */
.card-hero {
  padding: 24px 28px 18px;
  border-bottom: 1px solid var(--y-border-light);
  background: var(--y-bg-card);
}

.hero-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.hero-main {
  min-width: 0;
}

.word {
  margin: 0;
  font-size: 32px;
  font-weight: 700;
  color: var(--y-text-primary);
  letter-spacing: 3px;
  line-height: 1.2;
}

.pinyin {
  margin: 8px 0 0;
  color: var(--y-text-secondary);
  font-size: var(--y-font-body);
}

.freq {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  padding-top: 8px;
}

.freq-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--y-border);
}

.freq-dot.on {
  background: var(--y-primary);
}

.freq-num {
  margin-left: 4px;
  font-size: var(--y-font-aux);
  color: var(--y-text-tertiary);
}

.hero-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 14px;
}

/* 正文分区：细分割线分隔 */
.card-body {
  padding: 6px 28px 20px;
}

.card-section {
  padding: 18px 0 2px;
  border-top: 1px solid var(--y-border-light);
}

.card-section:first-child {
  border-top: none;
}

.sec-title {
  margin: 0 0 8px;
  font-size: var(--y-font-aux);
  font-weight: 600;
  letter-spacing: 0.5px;
  color: var(--y-text-tertiary);
  text-transform: uppercase;
}

.senses {
  margin: 0;
  padding-left: 20px;
}

.sense-item {
  margin: 4px 0;
  font-size: var(--y-font-body);
  line-height: var(--y-line-height-body);
  color: var(--y-text-body);
}

.meaning,
.origin,
.usage {
  margin: 0;
  font-size: var(--y-font-body);
  line-height: var(--y-line-height-body);
  color: var(--y-text-body);
}

.opposite-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.opposite-item {
  padding: 3px 12px;
  border: 1px dashed var(--y-border);
  border-radius: 6px;
  font-size: 13px;
  color: var(--y-text-secondary);
  background: var(--y-bg-subtle);
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
