import { createRouter, createWebHashHistory } from 'vue-router'
import IdiomsView from '@renderer/views/IdiomsView.vue'
import IdiomDetailView from '@renderer/views/IdiomDetailView.vue'
import FlashcardsView from '@renderer/views/FlashcardsView.vue'
import QuizView from '@renderer/views/QuizView.vue'
import ProgressView from '@renderer/views/ProgressView.vue'
import SettingsView from '@renderer/views/SettingsView.vue'
import PendingPage from '@renderer/views/PendingPage.vue'

/**
 * 路由表（PLAN.md §3.2）
 * 打包后走 file:// 协议，故使用 hash history。
 */
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/idioms' },
    { path: '/idioms', name: 'idioms', component: IdiomsView },
    { path: '/idioms/:id', name: 'idiom-detail', component: IdiomDetailView },
    { path: '/flashcards', name: 'flashcards', component: FlashcardsView },
    { path: '/quiz', name: 'quiz', component: QuizView },
    { path: '/progress', name: 'progress', component: ProgressView },
    { path: '/settings', name: 'settings', component: SettingsView },
    { path: '/pending', name: 'pending', component: PendingPage },
    { path: '/:pathMatch(.*)*', redirect: '/idioms' }
  ]
})

export default router
