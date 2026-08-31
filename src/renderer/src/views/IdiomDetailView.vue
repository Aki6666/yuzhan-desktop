<script setup lang="ts">
/**
 * 成语详情视图入口（路由 /idioms/:id 由 T1 指向本文件）
 * 实现委托给 IdiomDetailPage（T5，见 PLAN.md §3.2/F4），保持路由接线不变。
 */
import IdiomDetailPage from './IdiomDetailPage.vue'
</script>

<template>
  <IdiomDetailPage />
</template>
