/**
 * 设计系统 Token（v0.2.6「墨韵」全局 UI 重构，PLAN.md 附录 B；§16.3 P0-③ 暗色模式）
 *
 * 单一事实来源：色板 / 间距 / 圆角 / 字号 / 阴影 / 字体 / 动效。
 * 浅色与暗色两套 token 表 + applyTheme() 将选中主题落为 CSS 变量（--y-*），
 * 页面样式只消费 var(--y-*)，禁止散落硬编码颜色。
 *
 * 设计方向（参考 anthropics/skills/frontend-design、kesslerio/taste-skill、
 * pbakaus/impeccable 的 Operate 模式方法论）：
 * - **墨韵 · Ink & Paper**：暖宣纸底 + 深墨文字 + 朱砂红（印章/朱批）点缀，
 *   克制的线性分隔与留白；成语字面用衬线展示（Noto Serif SC 本机已装），
 *   数字用等宽数字变体保证可读性——贴合「公考 · 言语理解 · 成语积累」的书卷气质。
 * - 暗色：暖墨夜（warm ink night）——深墨灰底 + 纸白文字 + 提亮朱砂，保留纸感不刺眼。
 * - Operate 模式：任务完成优先——扫描性、一致性、真实使用场景高于表现。
 * - 性能：全部效果为静态纹理 + transform/opacity 过渡，无 blur/filter 重绘开销。
 */
export type ThemeName = 'light' | 'dark'

interface ColorTokens {
  bgPage: string
  bgCard: string
  bgSubtle: string
  bgHover: string
  bgActive: string
  border: string
  borderLight: string
  textPrimary: string
  textBody: string
  textSecondary: string
  textTertiary: string
  textDisabled: string
  primary: string
  primaryHover: string
  primaryActive: string
  primarySoft: string
  danger: string
  success: string
  warning: string
  info: string
  /** 滚动条滑块（全局 scrollbar 观感） */
  scrollThumb: string
  scrollThumbHover: string
  /** 仪表盘墨晕欢迎区渐变（深色面板，白字） */
  heroInkStart: string
  heroInkEnd: string
}

interface DesignTokens {
  color: ColorTokens
  radius: Record<'sm' | 'md' | 'lg' | 'xl', number>
  space: Record<'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl' | 'xxxl', number>
  font: {
    family: string
    familySerif: string
    sizeTitleLg: number
    sizeTitle: number
    sizeBody: number
    sizeAux: number
    sizeTag: number
    lineHeightBody: number
  }
  shadow: { card: string; pop: string }
  motion: { fast: string; base: string; slow: string; ease: string }
}

/** 浅色：宣纸暖白 + 深墨 + 朱砂 */
export const designTokens: DesignTokens = {
  color: {
    bgPage: '#F7F5F0',
    bgCard: '#FFFFFF',
    bgSubtle: '#F2EFE8',
    bgHover: '#EBE7DD',
    bgActive: '#E0DBCE',
    border: '#E5E0D4',
    borderLight: '#EFEBE1',
    textPrimary: '#1C1B18',
    textBody: '#45423B',
    textSecondary: '#7C776C',
    textTertiary: '#A9A394',
    textDisabled: '#D8D3C6',
    primary: '#C0432C',
    primaryHover: '#AD3925',
    primaryActive: '#96301F',
    primarySoft: '#F9E9E3',
    danger: '#B3261E',
    success: '#4C7A4C',
    warning: '#A8781F',
    info: '#5B6C9E',
    scrollThumb: '#CFC9BA',
    scrollThumbHover: '#B5AE9C',
    heroInkStart: '#2A2823',
    heroInkEnd: '#1C1B18'
  },
  radius: { sm: 8, md: 12, lg: 16, xl: 20 },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 },
  font: {
    family: '"Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Segoe UI", sans-serif',
    familySerif: '"Noto Serif SC", "Source Han Serif SC", "Songti SC", "STSong", "SimSun", serif',
    sizeTitleLg: 26,
    sizeTitle: 22,
    sizeBody: 14,
    sizeAux: 12,
    sizeTag: 12,
    lineHeightBody: 1.65
  },
  shadow: {
    card: '0 1px 2px rgba(76, 62, 45, 0.05), 0 2px 8px rgba(76, 62, 45, 0.04)',
    pop: '0 16px 40px rgba(76, 62, 45, 0.13), 0 4px 12px rgba(76, 62, 45, 0.07)'
  },
  motion: { fast: '120ms', base: '180ms', slow: '320ms', ease: 'cubic-bezier(0.4, 0, 0.2, 1)' }
}

/** 暗色：暖墨夜——深墨灰底 + 纸白文字 + 提亮朱砂（纸感保留，不刺眼） */
export const designTokensDark: DesignTokens = {
  color: {
    bgPage: '#191816',
    bgCard: '#23211E',
    bgSubtle: '#2A2824',
    bgHover: '#322F2B',
    bgActive: '#3A3732',
    border: '#3A3732',
    borderLight: '#302D29',
    textPrimary: '#EDEAE1',
    textBody: '#C9C5B9',
    textSecondary: '#9A958A',
    textTertiary: '#6E6A61',
    textDisabled: '#4A4741',
    primary: '#E07154',
    primaryHover: '#E8876D',
    primaryActive: '#C4533A',
    primarySoft: '#3A2621',
    danger: '#E5484D',
    success: '#7AAE7A',
    warning: '#D4A24C',
    info: '#93A7D6',
    scrollThumb: '#3F3B36',
    scrollThumbHover: '#55504A',
    heroInkStart: '#2E2B27',
    heroInkEnd: '#201E1B'
  },
  radius: { sm: 8, md: 12, lg: 16, xl: 20 },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 },
  font: {
    family: '"Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Segoe UI", sans-serif',
    familySerif: '"Noto Serif SC", "Source Han Serif SC", "Songti SC", "STSong", "SimSun", serif',
    sizeTitleLg: 26,
    sizeTitle: 22,
    sizeBody: 14,
    sizeAux: 12,
    sizeTag: 12,
    lineHeightBody: 1.65
  },
  shadow: {
    card: '0 1px 2px rgba(0, 0, 0, 0.28), 0 2px 8px rgba(0, 0, 0, 0.22)',
    pop: '0 16px 40px rgba(0, 0, 0, 0.5), 0 4px 12px rgba(0, 0, 0, 0.35)'
  },
  motion: { fast: '120ms', base: '180ms', slow: '320ms', ease: 'cubic-bezier(0.4, 0, 0.2, 1)' }
}

/**
 * 将指定主题的 token 落为 CSS 变量（--y-*）并标注 data-theme / color-scheme。
 * 由 main.ts 启动时调用一次，App.vue 在设置主题变化时再次调用（§16.3 P0-③）。
 */
export function applyTheme(theme: ThemeName): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const t = theme === 'dark' ? designTokensDark : designTokens
  const { color, radius, space, font, shadow, motion } = t
  const set = (name: string, value: string): void => {
    root.style.setProperty(name, value)
  }
  set('--y-font-family', font.family)
  set('--y-font-serif', font.familySerif)
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
  set('--y-scrollbar-thumb', color.scrollThumb)
  set('--y-scrollbar-thumb-hover', color.scrollThumbHover)
  set('--y-hero-ink-start', color.heroInkStart)
  set('--y-hero-ink-end', color.heroInkEnd)
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
  set('--y-motion-fast', motion.fast)
  set('--y-motion-base', motion.base)
  set('--y-motion-slow', motion.slow)
  set('--y-motion-ease', motion.ease)
  root.dataset.theme = theme
  root.style.colorScheme = theme
}
