<script setup lang="ts">
/**
 * 自测视图入口（路由 /quiz 由 T1 指向本文件）
 * 实现委托给 QuizPage（T8，见 PLAN.md §3.2/F6），保持路由接线不变。
 */
import QuizPage from './QuizPage.vue'
</script>

<template>
  <QuizPage />
</template>
