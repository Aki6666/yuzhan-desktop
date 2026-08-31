<script setup lang="ts">
/**
 * 闪卡视图入口（路由 /flashcards 由 T1 指向本文件）
 * 实现委托给 FlashcardsPage（T7，见 PLAN.md §3.2/F5），保持路由接线不变。
 */
import FlashcardsPage from './FlashcardsPage.vue'
</script>

<template>
  <FlashcardsPage />
</template>
