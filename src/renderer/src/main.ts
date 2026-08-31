import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { applyTheme } from './styles/designTokens'
import './assets/main.css'
import './styles/global.css'

/**
 * 启动时应用默认浅色主题（designTokens.ts 的 applyTheme 为单一应用入口；
 * 设置页切换主题时由 App.vue 再次调用，§16.3 P0-③）。
 */
applyTheme('light')

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
