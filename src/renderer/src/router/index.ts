import { createRouter, createWebHashHistory } from 'vue-router'
import IdiomsView from '@renderer/views/IdiomsView.vue'
import IdiomDetailView from '@renderer/views/IdiomDetailView.vue'
import FlashcardsView from '@renderer/views/FlashcardsView.vue'
import QuizView from '@renderer/views/QuizView.vue'
import ProgressView from '@renderer/views/ProgressView.vue'
import SettingsView from '@renderer/views/SettingsView.vue'
import PendingPage from '@renderer/views/PendingPage.vue'
import WrongBookPage from '@renderer/views/WrongBookPage.vue'
import ConfusablePage from '@renderer/views/ConfusablePage.vue'
import DashboardPage from '@renderer/views/DashboardPage.vue'

/**
 * 路由表（PLAN.md §3.2）
 * 打包后走 file:// 协议，故使用 hash history。
 * meta.title 供 App.vue 顶栏展示当前页面名（v0.2.6 墨韵重构）。
 */
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: DashboardPage, meta: { title: '首页' } },
    { path: '/idioms', name: 'idioms', component: IdiomsView, meta: { title: '成语库' } },
    { path: '/idioms/:id', name: 'idiom-detail', component: IdiomDetailView, meta: { title: '成语详情' } },
    { path: '/flashcards', name: 'flashcards', component: FlashcardsView, meta: { title: '闪卡' } },
    { path: '/quiz', name: 'quiz', component: QuizView, meta: { title: '自测' } },
    { path: '/progress', name: 'progress', component: ProgressView, meta: { title: '进度' } },
    { path: '/settings', name: 'settings', component: SettingsView, meta: { title: '设置' } },
    { path: '/pending', name: 'pending', component: PendingPage, meta: { title: '生词本' } },
    { path: '/wrongbook', name: 'wrongbook', component: WrongBookPage, meta: { title: '错题本' } },
    { path: '/confusable', name: 'confusable', component: ConfusablePage, meta: { title: '易混淆成语' } },
    { path: '/:pathMatch(.*)*', redirect: '/idioms' }
  ]
})

export default router
