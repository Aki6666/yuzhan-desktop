<script setup lang="ts">
/**
 * 应用壳层（U1 UI 重构，PLAN.md 附录 B v0.1.1）
 *
 * - OpenAI 式简洁：大留白、细分割线、图标+文字侧边导航（激活态/hover 微交互）、精简顶栏
 * - 视觉全部消费 designTokens 生成的 CSS 变量（var(--y-*)），禁止散落硬编码颜色
 * - 硬约束保持：QuickInputModal 挂载与快捷键接线（T6/FIX-2）、全部路由与 *View.vue 转发不动、
 *   功能与信息架构不变
 */
import { computed, ref } from 'vue'
import { dateZhCN, NButton, NConfigProvider, NTag, zhCN } from 'naive-ui'
import QuickInputModal from '@renderer/components/quick-input/QuickInputModal.vue'
import { useSettingsStore } from '@renderer/stores/settings'
import { describeShortcut } from '@renderer/lib/quickRecord'
import { themeOverrides } from '@renderer/theme/naiveTheme'

const quickInputRef = ref<{ open: () => void } | null>(null)
const settingsStore = useSettingsStore()

// FIX-2：顶栏展示当前唤起快捷键的中文描述（默认「+」，设置页可自定义），去英文 accelerator 串
const quickShortcutLabel = computed(() => describeShortcut(settingsStore.settings.quickInputShortcut))

void settingsStore.load()

/** 侧边导航项（§3.1：成语库 · 闪卡 · 自测 · 进度 · 生词本；V2-D 增 错题本） */
const NAV_ITEMS = [
  { to: '/idioms', label: '成语库', icon: 'book' },
  { to: '/flashcards', label: '闪卡', icon: 'flash' },
  { to: '/quiz', label: '自测', icon: 'check' },
  { to: '/progress', label: '进度', icon: 'chart' },
  { to: '/wrongbook', label: '错题本', icon: 'xcircle' },
  { to: '/pending', label: '生词本', icon: 'bookmark' }
] as const

/** 内联图标（Feather 风格线性图标，stroke 继承 currentColor，18px） */
const ICON_PATHS: Record<string, string[]> = {
  book: [
    'M4 19.5A2.5 2.5 0 0 1 6.5 17H20',
    'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'
  ],
  flash: ['M13 2 3 14h9l-1 8 10-12h-9l1-8z'],
  check: ['M22 11.08V12a10 10 0 1 1-5.93-9.14', 'M22 4 12 14.01l-3-3'],
  chart: ['M18 20V10', 'M12 20V4', 'M6 20v-6'],
  bookmark: ['M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z'],
  xcircle: ['M12 22c5.5 0 10-4.5 10-10S17.5 2 12 2 2 6.5 2 12s4.5 10 10 10z', 'M15 9l-6 6', 'M9 9l6 6']
}
</script>

<template>
  <NConfigProvider :locale="zhCN" :date-locale="dateZhCN" :theme-overrides="themeOverrides">
    <div class="app-shell">
      <!-- 侧边导航：品牌 + 图标文字导航（§3.1） -->
      <aside class="sidebar">
        <div class="brand">
          <span class="brand-mark" aria-hidden="true">语</span>
          <div class="brand-text">
            <span class="brand-name">语栈</span>
            <span class="brand-sub">言语理解 · 成语积累</span>
          </div>
        </div>

        <nav class="nav" aria-label="主导航">
          <RouterLink
            v-for="item in NAV_ITEMS"
            :key="item.to"
            :to="item.to"
            class="nav-item"
          >
            <svg
              class="nav-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path v-for="(d, i) in ICON_PATHS[item.icon]" :key="i" :d="d" />
            </svg>
            <span class="nav-label">{{ item.label }}</span>
          </RouterLink>
        </nav>

        <div class="sidebar-foot">
          <NTag size="small" :bordered="false" round class="version-tag">v0.1 MVP</NTag>
        </div>
      </aside>

      <div class="main-area">
        <!-- 顶栏：快速记录（当前快捷键）· 设置 -->
        <header class="topbar">
          <div class="topbar-left">
            <span class="topbar-hint">快速记录错词，碎片时间复习</span>
          </div>
          <div class="topbar-actions">
            <NButton size="small" secondary class="quick-btn" @click="quickInputRef?.open()">
              <svg
                class="btn-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              快速记录
              <kbd>{{ quickShortcutLabel }}</kbd>
            </NButton>
            <RouterLink to="/settings" class="settings-link" title="设置" aria-label="设置">
              <NButton size="small" quaternary circle>
                <svg
                  class="btn-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M4 21v-7" />
                  <path d="M4 10V3" />
                  <path d="M12 21v-9" />
                  <path d="M12 8V3" />
                  <path d="M20 21v-5" />
                  <path d="M20 12V3" />
                  <path d="M1 14h6" />
                  <path d="M9 8h6" />
                  <path d="M17 16h6" />
                </svg>
              </NButton>
            </RouterLink>
          </div>
        </header>

        <main class="content">
          <RouterView />
        </main>
      </div>
    </div>

    <!-- 全局快速记录弹层（快捷键任意页面唤起，T6 接线保持不动；FIX-2 默认「+」键可自定义） -->
    <QuickInputModal ref="quickInputRef" />
  </NConfigProvider>
</template>

<style scoped>
.app-shell {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: var(--y-bg-page);
}

/* ------------------------------------------------------------------ */
/* 侧边导航：纯白底 + 细分割线，大留白 */
/* ------------------------------------------------------------------ */
.sidebar {
  width: 216px;
  flex: 0 0 216px;
  display: flex;
  flex-direction: column;
  padding: 20px 14px 16px;
  background: var(--y-bg-card);
  border-right: 1px solid var(--y-border-light);
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 2px 8px 22px;
}

.brand-mark {
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--y-radius-md);
  background: var(--y-primary);
  color: #fff;
  font-size: 16px;
  font-weight: 700;
}

.brand-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.brand-name {
  font-size: var(--y-font-title);
  font-weight: 700;
  color: var(--y-text-primary);
  line-height: 1.2;
}

.brand-sub {
  font-size: var(--y-font-aux);
  color: var(--y-text-tertiary);
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: var(--y-radius-sm);
  color: var(--y-text-secondary);
  text-decoration: none;
  font-size: var(--y-font-body);
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.nav-icon {
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  opacity: 0.85;
}

.nav-item:hover {
  background: var(--y-bg-hover);
  color: var(--y-text-body);
}

/* 激活态：主色浅底 + 深青文字（克制点缀） */
.nav-item.router-link-active {
  background: var(--y-primary-soft);
  color: var(--y-primary);
  font-weight: 600;
}

.nav-item.router-link-active .nav-icon {
  opacity: 1;
}

.sidebar-foot {
  margin-top: auto;
  padding: 12px 8px 0;
}

.version-tag {
  color: var(--y-text-tertiary);
}

/* ------------------------------------------------------------------ */
/* 主区：顶栏 + 内容（大留白） */
/* ------------------------------------------------------------------ */
.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.topbar {
  height: 56px;
  flex: 0 0 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 32px;
  background: var(--y-bg-card);
  border-bottom: 1px solid var(--y-border-light);
}

.topbar-hint {
  font-size: var(--y-font-aux);
  color: var(--y-text-tertiary);
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.quick-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.btn-icon {
  width: 15px;
  height: 15px;
}

.settings-link {
  display: inline-flex;
  color: inherit;
}

.content {
  flex: 1;
  overflow: auto;
  padding: 28px 32px 40px;
}
</style>
