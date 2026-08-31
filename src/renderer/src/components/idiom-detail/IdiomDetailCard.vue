<script setup lang="ts">
/**
 * 成语详情卡片（PLAN.md F4 / §3.3 / §5.1）
 * 纯本地数据渲染（AC-02 离线可用，无 AI 依赖），数据由父级从 idioms store 注入。
 * 展示字段：释义（多义项「；」分隔渲染）/出处/感情色彩/语域/误用类型/近义辨析组（折叠）/反义/真题例句/频次/主题
 *
 * v0.2.6 墨韵重构：衬线词形 + 朱砂频次徽标 + 分区眉题（细竖线）；data-testid/类名与行为不变。
 */
import { computed } from 'vue'
import { NTag } from 'naive-ui'
import type { Idiom } from '@shared/ipc/contracts'
import { FREQUENCY_TIER_INFO } from '@renderer/lib/listFilters'
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

/** 频次档位理由（如「5档：真题出现 80 次以上」） */
const freqTitle = computed(() => {
  const info = FREQUENCY_TIER_INFO[props.idiom.frequency as 1 | 2 | 3 | 4 | 5]
  return info ? `${info.label}：${info.desc}` : `频次 ${props.idiom.frequency} 档`
})

/** 真题出现次数（存在时展示） */
const occurrencesText = computed(() =>
  typeof props.idiom.occurrences === 'number' && props.idiom.occurrences > 0
    ? `真题出现 ${props.idiom.occurrences} 次`
    : ''
)
</script>

<template>
  <article class="idiom-card" data-testid="idiom-detail-card">
    <!-- 顶部词条区：朱砂顶饰 + 衬线大字词形 + 拼音 + 频次徽标（印章式）+ 感情色彩/语域/误用类型 -->
    <header class="card-hero">
      <div class="hero-accent" aria-hidden="true" />
      <div class="hero-row">
        <div class="hero-main">
          <span class="hero-seal y-seal" aria-hidden="true">语</span>
          <h2 class="word">{{ idiom.word }}</h2>
          <p class="pinyin">{{ idiom.pinyin }}</p>
        </div>
        <div class="freq-block">
          <NTag size="small" type="warning" round :title="freqTitle" class="freq-tier" data-testid="freq-tier">
            {{ idiom.frequency }}档
          </NTag>
          <span v-if="occurrencesText" class="freq-occur" :title="occurrencesText">{{ occurrencesText }}</span>
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

    <!-- 正文分区：细分割线分隔 + 眉题细竖线 -->
    <div class="card-body">
      <!-- 释义：多义项分号分隔渲染 -->
      <section class="card-section" data-testid="section-meaning">
        <h3 class="sec-title">释义</h3>
        <ol v-if="senses.length > 1" class="senses">
          <li v-for="(s, i) in senses" :key="i" class="sense-item">
            <span class="sense-index" aria-hidden="true">{{ i + 1 }}</span>{{ s }}
          </li>
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

/* 顶部词条区：宣纸暖白 → 纸白渐变，朱砂顶饰 */
.card-hero {
  position: relative;
  padding: 28px 28px 18px;
  border-bottom: 1px solid var(--y-border-light);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--y-primary-soft) 45%, var(--y-bg-card)) 0%,
    var(--y-bg-card) 100%
  );
  overflow: hidden;
}

/* 朱砂顶饰（印章落款感） */
.hero-accent {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--y-primary) 0%, rgba(192, 67, 44, 0.35) 70%, transparent 100%);
}

.hero-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.hero-main {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
}

.hero-seal {
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  font-size: 14px;
  align-self: center;
}

.word {
  margin: 0;
  font-family: var(--y-font-serif);
  font-size: 36px;
  font-weight: 700;
  color: var(--y-text-primary);
  letter-spacing: 6px;
  line-height: 1.25;
}

.pinyin {
  margin: 8px 0 0;
  color: var(--y-text-secondary);
  font-size: 15px;
  letter-spacing: 0.5px;
}

.freq-block {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex-shrink: 0;
  padding-top: 4px;
}

.freq-tier {
  background: color-mix(in srgb, var(--y-primary) 10%, var(--y-bg-card)) !important;
  color: var(--y-primary) !important;
  border: 1px solid color-mix(in srgb, var(--y-primary) 30%, var(--y-border)) !important;
  font-weight: 600;
}

.freq-occur {
  font-size: 11px;
  color: var(--y-text-tertiary);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
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
  position: relative;
  margin: 0 0 8px;
  padding-left: 12px;
  font-size: var(--y-font-aux);
  font-weight: 600;
  letter-spacing: 2px;
  color: var(--y-text-tertiary);
}

.sec-title::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 12px;
  border-radius: 2px;
  background: var(--y-primary);
  opacity: 0.8;
}

.senses {
  margin: 0;
  padding-left: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sense-item {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: var(--y-font-body);
  line-height: var(--y-line-height-body);
  color: var(--y-text-body);
}

.sense-index {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--y-bg-subtle);
  border: 1px solid var(--y-border-light);
  font-size: 11px;
  font-weight: 700;
  color: var(--y-text-secondary);
  transform: translateY(2px);
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

.tag-item {
  color: var(--y-text-secondary);
}
</style>
