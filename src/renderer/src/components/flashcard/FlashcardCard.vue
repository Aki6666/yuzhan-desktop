<script setup lang="ts">
/**
 * 闪卡单卡（PLAN.md §3.4：翻面动效；§3.3：认识/不认识立即判定并展示释义）
 * - 正面：词形 + 拼音
 * - 背面：释义（考试语境）+ 感情色彩/语域徽标 + 判定结果（认识/不认识）
 * - flipped=false 显示正面；判定后 flipped=true 翻面展示释义
 *
 * U3 视觉重构：消费 U1 设计 token（var(--y-*)），翻面动效/类名/data-testid 不变
 */
import { computed } from 'vue'
import { NTag } from 'naive-ui'
import type { Idiom } from '@shared/ipc/contracts'
import type { FlashcardJudgment } from '@renderer/lib/flashcards'

const props = defineProps<{
  idiom: Idiom
  flipped: boolean
  /** 本次判定结果（未判定为 null）；已知判定后用于背面徽标 */
  judgment: FlashcardJudgment | null
}>()

const registerText = computed(() => (props.idiom.register === '无' ? '' : props.idiom.register))
</script>

<template>
  <div class="flip-scene">
    <div class="flip-inner" :class="{ flipped }">
      <!-- 正面：词形 -->
      <div class="face face-front" data-testid="card-front">
        <p class="front-hint">回想释义，再作判定</p>
        <h2 class="front-word">{{ idiom.word }}</h2>
        <p class="front-pinyin">{{ idiom.pinyin }}</p>
      </div>

      <!-- 背面：释义 -->
      <div class="face face-back" data-testid="card-back">
        <NTag
          v-if="judgment"
          size="small"
          :type="judgment === 'known' ? 'success' : 'error'"
          :bordered="false"
          class="judge-badge"
          data-testid="judge-badge"
        >
          {{ judgment === 'known' ? '认识' : '不认识' }}
        </NTag>
        <h3 class="back-word">{{ idiom.word }}</h3>
        <p class="back-meaning">{{ idiom.meaning }}</p>
        <div class="back-tags">
          <NTag size="small" :type="idiom.emotion === '褒' ? 'success' : idiom.emotion === '贬' ? 'error' : 'default'" :bordered="false">
            {{ idiom.emotion }}
          </NTag>
          <NTag v-if="registerText" size="small" type="warning" :bordered="false">
            {{ registerText }}
          </NTag>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.flip-scene {
  perspective: 1200px;
  height: 300px;
  width: 100%;
  max-width: 560px;
}

.flip-inner {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  transition: transform 0.45s cubic-bezier(0.4, 0, 0.2, 1);
}

.flip-inner.flipped {
  transform: rotateY(180deg);
}

.face {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  border: 1px solid var(--y-border);
  border-radius: var(--y-radius-xl);
  background: var(--y-bg-card);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--y-space-xxl);
  text-align: center;
  box-shadow: var(--y-shadow-card);
}

.face-back {
  transform: rotateY(180deg);
}

.front-hint {
  margin: 0 0 var(--y-space-xl);
  font-size: var(--y-font-aux);
  color: var(--y-text-tertiary);
  letter-spacing: 1px;
}

.front-word {
  margin: 0;
  font-size: 42px;
  letter-spacing: 6px;
  color: var(--y-text-primary);
}

.front-pinyin {
  margin: var(--y-space-md) 0 0;
  font-size: var(--y-font-body);
  color: var(--y-text-secondary);
}

.judge-badge {
  position: absolute;
  top: var(--y-space-lg);
  right: var(--y-space-lg);
}

.back-word {
  margin: 0 0 var(--y-space-md);
  font-size: var(--y-font-title-lg);
  color: var(--y-text-primary);
  letter-spacing: 2px;
}

.back-meaning {
  margin: 0;
  font-size: var(--y-font-body);
  line-height: var(--y-line-height-body);
  color: var(--y-text-body);
  max-width: 460px;
}

.back-tags {
  display: flex;
  gap: var(--y-space-sm);
  margin-top: var(--y-space-lg);
}
</style>
