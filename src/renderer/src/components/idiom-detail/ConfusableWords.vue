<script setup lang="ts">
/**
 * 详情页易混淆词区块（v0.2.6 迭代，BUG-4）
 * - 按混淆度评分（near/pairs 对端 → 形近 → 同首/同尾 → 同主题）取该词最易混的若干词
 * - 每项：词形（点击跳详情）+ 一句话区别（near/pairs diff，无则展示释义截断）
 * - 数据：items（正式库+个人库）+ pairs（易混淆对），由父级注入
 */
import { computed } from 'vue'
import type { ConfusablePair, Idiom } from '@shared/ipc/contracts'
import { createDistractorIndex, findConfusableWords } from '@shared/lib/quiz'

const props = defineProps<{
  /** 当前词条 */
  idiom: Idiom
  /** 全库词条（含个人库） */
  items: Idiom[]
  /** 易混淆对（data/pairs.json） */
  pairs: ConfusablePair[]
}>()

const index = computed(() => createDistractorIndex(props.items, props.pairs))
const confusables = computed(() => findConfusableWords(props.idiom, index.value, 4))

/** word → id（详情跳转；词条不在库时回退 word 本身） */
function idOf(word: string): string {
  return props.items.find((i) => i.word === word)?.id ?? word
}

/** 无 diff 时展示释义（截断 24 字） */
function meaningPreview(meaning: string): string {
  return meaning.length > 24 ? `${meaning.slice(0, 24)}…` : meaning
}
</script>

<template>
  <section v-if="confusables.length > 0" class="confusable-section" data-testid="section-confusable">
    <h3 class="conf-title">易混淆词</h3>
    <p class="conf-sub">形近 / 近义 · 点击词条查看详情</p>
    <div class="conf-list">
      <RouterLink
        v-for="c in confusables"
        :key="c.word"
        :to="`/idioms/${idOf(c.word)}`"
        class="conf-item"
        :title="`查看「${c.word}」详情`"
      >
        <span class="conf-word">{{ c.word }}</span>
        <span class="conf-info">{{ c.diff ?? meaningPreview(c.meaning) }}</span>
        <span class="conf-arrow" aria-hidden="true">→</span>
      </RouterLink>
    </div>
  </section>
</template>

<style scoped>
.confusable-section {
  margin-top: 16px;
  padding: 20px 24px;
  background: var(--y-bg-card);
  border: 1px solid var(--y-border-light);
  border-radius: var(--y-radius-lg);
  box-shadow: var(--y-shadow-card);
}

.conf-title {
  position: relative;
  margin: 0 0 2px;
  padding-left: 12px;
  font-size: var(--y-font-aux);
  font-weight: 600;
  letter-spacing: 2px;
  color: var(--y-text-tertiary);
}

.conf-title::before {
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

.conf-sub {
  margin: 4px 0 12px;
  padding-left: 12px;
  font-size: 11px;
  color: var(--y-text-tertiary);
}

.conf-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.conf-item {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 10px 14px;
  border: 1px solid var(--y-border-light);
  border-left: 3px solid color-mix(in srgb, var(--y-primary) 50%, var(--y-border));
  border-radius: var(--y-radius-sm);
  background: var(--y-bg-subtle);
  text-decoration: none;
  transition:
    border-color var(--y-motion-fast) var(--y-motion-ease),
    background-color var(--y-motion-fast) var(--y-motion-ease),
    transform var(--y-motion-fast) var(--y-motion-ease);
}

.conf-item:hover {
  border-color: color-mix(in srgb, var(--y-primary) 35%, var(--y-border));
  background: var(--y-bg-card);
  transform: translateX(2px);
}

.conf-word {
  flex: 0 0 auto;
  font-family: var(--y-font-serif);
  font-size: 15px;
  font-weight: 600;
  color: var(--y-primary);
  white-space: nowrap;
}

.conf-info {
  min-width: 0;
  font-size: 13px;
  line-height: var(--y-line-height-body);
  color: var(--y-text-body);
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.conf-arrow {
  margin-left: auto;
  flex: 0 0 auto;
  font-size: 12px;
  color: var(--y-text-tertiary);
}
</style>
