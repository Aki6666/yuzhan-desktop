import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { designTokens } from './styles/designTokens'
import './assets/main.css'
import './styles/global.css'

/**
 * 将设计系统 Token（styles/designTokens.ts，单一事实来源）落为 CSS 变量
 * （--y-*），页面样式统一消费 var(--y-*)，禁止散落硬编码颜色。
 */
function installDesignTokens(): void {
  const root = document.documentElement.style
  const { color, radius, space, font, shadow } = designTokens
  const set = (name: string, value: string): void => {
    root.setProperty(name, value)
  }
  set('--y-bg-page', color.bgPage)
  set('--y-bg-card', color.bgCard)
  set('--y-bg-subtle', color.bgSubtle)
  set('--y-bg-hover', color.bgHover)
  set('--y-bg-active', color.bgActive)
  set('--y-border', color.border)
  set('--y-border-light', color.borderLight)
  set('--y-text-primary', color.textPrimary)
  set('--y-text-body', color.textBody)
  set('--y-text-secondary', color.textSecondary)
  set('--y-text-tertiary', color.textTertiary)
  set('--y-text-disabled', color.textDisabled)
  set('--y-primary', color.primary)
  set('--y-primary-hover', color.primaryHover)
  set('--y-primary-active', color.primaryActive)
  set('--y-primary-soft', color.primarySoft)
  set('--y-danger', color.danger)
  set('--y-success', color.success)
  set('--y-warning', color.warning)
  set('--y-info', color.info)
  set('--y-radius-sm', `${radius.sm}px`)
  set('--y-radius-md', `${radius.md}px`)
  set('--y-radius-lg', `${radius.lg}px`)
  set('--y-radius-xl', `${radius.xl}px`)
  set('--y-space-xs', `${space.xs}px`)
  set('--y-space-sm', `${space.sm}px`)
  set('--y-space-md', `${space.md}px`)
  set('--y-space-lg', `${space.lg}px`)
  set('--y-space-xl', `${space.xl}px`)
  set('--y-space-xxl', `${space.xxl}px`)
  set('--y-space-xxxl', `${space.xxxl}px`)
  set('--y-font-title-lg', `${font.sizeTitleLg}px`)
  set('--y-font-title', `${font.sizeTitle}px`)
  set('--y-font-body', `${font.sizeBody}px`)
  set('--y-font-aux', `${font.sizeAux}px`)
  set('--y-line-height-body', String(font.lineHeightBody))
  set('--y-shadow-card', shadow.card)
  set('--y-shadow-pop', shadow.pop)
}

installDesignTokens()

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
