<script setup lang="ts">
/**
 * /idioms 路由入口：渲染 T4 成语列表页（IdiomListPage）。
 * 路由表（T1 §3.2）保持不变，此处转发避免改动 router/index.ts 的既有装配。
 */
import IdiomListPage from './IdiomListPage.vue'
</script>

<template>
  <IdiomListPage />
</template>
