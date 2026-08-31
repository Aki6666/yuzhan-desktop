<script setup lang="ts">
import { dateZhCN, NButton, NConfigProvider, NTag, zhCN } from 'naive-ui'
</script>

<template>
  <NConfigProvider :locale="zhCN" :date-locale="dateZhCN">
    <div class="app-shell">
      <!-- 侧边导航（PLAN.md §3.1） -->
      <aside class="sidebar">
        <div class="brand">语栈</div>
        <nav class="nav">
          <RouterLink to="/idioms" class="nav-item">成语库</RouterLink>
          <RouterLink to="/flashcards" class="nav-item">闪卡</RouterLink>
          <RouterLink to="/quiz" class="nav-item">自测</RouterLink>
          <RouterLink to="/progress" class="nav-item">进度</RouterLink>
        </nav>
      </aside>

      <div class="main-area">
        <!-- 顶栏：右上 快速记录 (Ctrl+K) · 设置 -->
        <header class="topbar">
          <NTag size="small" type="info" round>v0.1 MVP</NTag>
          <div class="topbar-actions">
            <NButton size="small" secondary disabled title="T6 实现">快速记录 Ctrl+K</NButton>
            <RouterLink to="/settings">
              <NButton size="small" secondary>设置</NButton>
            </RouterLink>
          </div>
        </header>

        <main class="content">
          <RouterView />
        </main>
      </div>
    </div>
  </NConfigProvider>
</template>

<style scoped>
.app-shell {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.sidebar {
  width: 180px;
  flex: 0 0 180px;
  display: flex;
  flex-direction: column;
  padding: 16px 12px;
  background: #f5f6f8;
  border-right: 1px solid #e8e8e8;
}

.brand {
  font-size: 20px;
  font-weight: 700;
  color: #2c3e50;
  padding: 4px 8px 20px;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-item {
  padding: 8px 10px;
  border-radius: 6px;
  color: #444;
  text-decoration: none;
  font-size: 14px;
}

.nav-item:hover {
  background: #e9ecf1;
}

.nav-item.router-link-active {
  background: #d0d8e6;
  color: #1f2d3d;
  font-weight: 600;
}

.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.topbar {
  height: 48px;
  flex: 0 0 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-bottom: 1px solid #e8e8e8;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.content {
  flex: 1;
  overflow: auto;
  padding: 20px;
}
</style>
