<script setup lang="ts">
/**
 * 应用壳层（v0.2.6「墨韵」全局 UI 重构，PLAN.md 附录 B）
 *
 * - 墨韵书斋：宣纸暖底侧栏 + 朱砂印章品牌 + 衬线品牌字 + 克制的导航激活态
 * - 顶栏展示当前路由页名（route.meta.title，router/index.ts 同步维护），
 *   右侧「快速记录」按钮（当前快捷键中文描述）+ 设置入口
 * - 内容区 RouterView 挂载页面过渡（fade + 上移，GPU 友好）
 * - 硬约束保持：QuickInputModal 挂载与快捷键接线、全部路由与页面组件转发不动、
 *   功能与信息架构不变、data-testid 不变
 */
import { computed, ref, watch } from 'vue'
import { darkTheme, dateZhCN, NButton, NConfigProvider, NTag, zhCN } from 'naive-ui'
import { useRoute } from 'vue-router'
import QuickInputModal from '@renderer/components/quick-input/QuickInputModal.vue'
import { useSettingsStore } from '@renderer/stores/settings'
import { useProgressStore } from '@renderer/stores/progress'
import { useIdiomsStore } from '@renderer/stores/idioms'
import { describeShortcut } from '@renderer/lib/quickRecord'
import { applyTheme } from '@renderer/styles/designTokens'
import { themeOverrides } from '@renderer/theme/naiveTheme'

const quickInputRef = ref<{ open: () => void } | null>(null)
const settingsStore = useSettingsStore()
const route = useRoute()

// 暗色模式（v0.2.6 迭代，§16.3 P0-③）：设置持久化 theme，切换即重应用 token 与 Naive 主题
const isDark = computed(() => settingsStore.settings.theme === 'dark')
watch(
  () => settingsStore.settings.theme,
  (t) => {
    if (t === 'light' || t === 'dark') applyTheme(t)
  }
)

// 顶栏展示当前唤起快捷键的中文描述（默认「+」，设置页可自定义），去英文 accelerator 串
const quickShortcutLabel = computed(() => describeShortcut(settingsStore.settings.quickInputShortcut))

// 当前页面名（路由 meta.title；无则回退空，顶栏隐藏）
const pageTitle = computed(() => String(route.meta.title ?? ''))

void settingsStore.load()
// 启动即加载持久化进度（错题本/进度页数据源）
void useProgressStore().load()
// 预加载语料库（侧栏统计 + 各页复用）
const idiomsStore = useIdiomsStore()
void idiomsStore.load()

/** 侧边导航项（§3.1：首页仪表盘 · 成语库 · 闪卡 · 自测 · 进度 · 生词本；V2-D 增 错题本；易混淆） */
const NAV_ITEMS = [
  { to: '/', label: '首页', icon: 'home' },
  { to: '/idioms', label: '成语库', icon: 'book' },
  { to: '/flashcards', label: '闪卡', icon: 'flash' },
  { to: '/quiz', label: '自测', icon: 'check' },
  { to: '/confusable', label: '易混淆', icon: 'shuffle' },
  { to: '/progress', label: '进度', icon: 'chart' },
  { to: '/wrongbook', label: '错题本', icon: 'xcircle' },
  { to: '/pending', label: '生词本', icon: 'bookmark' }
] as const

/** 内联图标（Feather 风格线性图标，stroke 继承 currentColor，18px） */
const ICON_PATHS: Record<string, string[]> = {
  home: ['M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z'],
  book: [
    'M4 19.5A2.5 2.5 0 0 1 6.5 17H20',
    'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'
  ],
  flash: ['M13 2 3 14h9l-1 8 10-12h-9l1-8z'],
  check: ['M22 11.08V12a10 10 0 1 1-5.93-9.14', 'M22 4 12 14.01l-3-3'],
  chart: ['M18 20V10', 'M12 20V4', 'M6 20v-6'],
  bookmark: ['M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z'],
  xcircle: ['M12 22c5.5 0 10-4.5 10-10S17.5 2 12 2 2 6.5 2 12s4.5 10 10 10z', 'M15 9l-6 6', 'M9 9l6 6'],
  shuffle: ['M16 3h5v5', 'M4 20 21 3', 'M21 16v5h-5', 'M15 15l6 6', 'M4 4l5 5']
}
</script>

<template>
  <NConfigProvider
    :locale="zhCN"
    :date-locale="dateZhCN"
    :theme="isDark ? darkTheme : null"
    :theme-overrides="themeOverrides(isDark ? 'dark' : 'light')"
  >
    <div class="app-shell">
      <!-- 侧边导航：朱砂印章品牌 + 图标文字导航（§3.1） -->
      <aside class="sidebar">
        <div class="brand">
          <span class="brand-seal y-seal" aria-hidden="true">语</span>
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
          <div class="corpus-stat" title="正式库词条数">
            <span class="stat-dot" aria-hidden="true" />
            <span>语料 {{ idiomsStore.items.length }} 词</span>
          </div>
          <NTag size="small" :bordered="false" round class="version-tag">v0.2 MVP</NTag>
        </div>
      </aside>

      <div class="main-area">
        <!-- 顶栏：当前页面名 · 快速记录（当前快捷键）· 设置 -->
        <header class="topbar">
          <div class="topbar-left">
            <span v-if="pageTitle" class="topbar-title">{{ pageTitle }}</span>
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
          <RouterView v-slot="{ Component }">
            <Transition name="y-page" mode="out-in">
              <component :is="Component" />
            </Transition>
          </RouterView>
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
/* 侧边导航：宣纸暖底 + 细分割线，大留白 */
/* ------------------------------------------------------------------ */
.sidebar {
  width: 216px;
  flex: 0 0 216px;
  display: flex;
  flex-direction: column;
  padding: 18px 14px 16px;
  background: color-mix(in srgb, var(--y-bg-card) 82%, var(--y-bg-page));
  border-right: 1px solid var(--y-border-light);
}

/* 品牌区：朱砂印章 + 衬线名称（书斋气质） */
.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 2px 18px;
  padding: 12px 12px;
  border-radius: var(--y-radius-lg);
  background:
    radial-gradient(120px 60px at 0% 0%, color-mix(in srgb, var(--y-primary) 7%, transparent), transparent 70%),
    var(--y-bg-subtle);
  border: 1px solid var(--y-border-light);
}

.brand-seal {
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  font-size: 18px;
  letter-spacing: 0;
}

.brand-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.brand-name {
  font-family: var(--y-font-serif);
  font-size: 19px;
  font-weight: 700;
  color: var(--y-text-primary);
  line-height: 1.2;
  letter-spacing: 4px;
}

.brand-sub {
  font-size: 11px;
  color: var(--y-text-tertiary);
  white-space: nowrap;
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
    background-color var(--y-motion-fast) var(--y-motion-ease),
    color var(--y-motion-fast) var(--y-motion-ease);
}

.nav-icon {
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  opacity: 0.8;
}

.nav-item:hover {
  background: var(--y-bg-hover);
  color: var(--y-text-body);
}

/* 激活态：朱砂浅底 + 朱砂文字 + 左侧圆角指示条 */
.nav-item.router-link-active {
  background: var(--y-primary-soft);
  color: var(--y-primary);
  font-weight: 600;
  position: relative;
}

.nav-item.router-link-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 16px;
  border-radius: 999px;
  background: var(--y-primary);
}

.nav-item.router-link-active .nav-icon {
  opacity: 1;
}

.sidebar-foot {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 8px 0;
  border-top: 1px solid var(--y-border-light);
}

.corpus-stat {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--y-text-tertiary);
}

.stat-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--y-success);
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
  background: color-mix(in srgb, var(--y-bg-card) 86%, transparent);
  border-bottom: 1px solid var(--y-border-light);
}

.topbar-left {
  display: flex;
  align-items: baseline;
  gap: 12px;
  min-width: 0;
}

.topbar-title {
  font-family: var(--y-font-serif);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--y-text-primary);
  white-space: nowrap;
}

.topbar-hint {
  font-size: var(--y-font-aux);
  color: var(--y-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
