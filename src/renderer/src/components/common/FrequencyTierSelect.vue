<script setup lang="ts">
/**
 * 频次档位选择器（用户要求 #6：闪卡/自测抽题时由用户选择档位）
 * - 多选 chips：点选 5/4/3/2/1 档位；「全部」一键清空选择（空数组 = 全部档位）
 * - 纯展示组件：modelValue 为已选档位数组，emit update:modelValue
 */
import { computed } from 'vue'
import { FREQUENCY_OPTIONS, FREQUENCY_TIER_INFO } from '@renderer/lib/listFilters'

const props = defineProps<{
  /** 已选档位（空数组 = 全部） */
  modelValue: number[]
  /** 各档位词条数（可选，用于展示） */
  counts?: Record<number, number>
}>()

const emit = defineEmits<{ (e: 'update:modelValue', value: number[]): void }>()

const isAll = computed(() => props.modelValue.length === 0)

function toggleTier(f: number): void {
  const set = new Set(props.modelValue)
  if (set.has(f)) set.delete(f)
  else set.add(f)
  emit('update:modelValue', [...set].sort((a, b) => b - a))
}

function selectAll(): void {
  emit('update:modelValue', [])
}

function tierCount(f: number): number {
  return props.counts?.[f] ?? 0
}
</script>

<template>
  <div class="tier-selector" role="group" aria-label="频次档位选择">
    <button
      type="button"
      class="tier-chip"
      :class="{ active: isAll }"
      data-testid="tier-all"
      @click="selectAll"
    >
      全部
    </button>
    <button
      v-for="f in FREQUENCY_OPTIONS"
      :key="f"
      type="button"
      class="tier-chip"
      :class="{ active: !isAll && modelValue.includes(f) }"
      :data-testid="`tier-${f}`"
      :title="`${FREQUENCY_TIER_INFO[f].label}：${FREQUENCY_TIER_INFO[f].desc}`"
      @click="toggleTier(f)"
    >
      <span class="tier-name">{{ f }}档</span>
      <span v-if="counts" class="tier-count">{{ tierCount(f) }}</span>
    </button>
  </div>
</template>

<style scoped>
.tier-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tier-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  font-size: 12px;
  border: 1px solid var(--y-border-light);
  border-radius: 999px;
  background: var(--y-bg-card);
  color: var(--y-text-secondary);
  cursor: pointer;
  transition:
    border-color var(--y-motion-fast) var(--y-motion-ease),
    background-color var(--y-motion-fast) var(--y-motion-ease),
    color var(--y-motion-fast) var(--y-motion-ease);
}

.tier-chip:hover {
  background: var(--y-bg-hover);
}

.tier-chip.active {
  border-color: color-mix(in srgb, var(--y-primary) 42%, var(--y-border));
  background: var(--y-primary-soft);
  color: var(--y-primary);
  font-weight: 600;
}

.tier-count {
  font-size: 11px;
  color: var(--y-text-tertiary);
  font-variant-numeric: tabular-nums;
}

.tier-chip.active .tier-count {
  color: var(--y-primary);
}
</style>
