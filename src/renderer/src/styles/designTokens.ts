/**
 * 设计系统 Token（U1 UI 重构，PLAN.md 附录 B v0.1.1）
 *
 * 单一事实来源：色板 / 间距 / 圆角 / 字号 / 阴影。
 * - CSS 变量（styles/global.css 的 :root）由 main.ts 在本文件基础上生成（installDesignTokens），
 *   页面样式只消费 var(--y-*)，禁止散落硬编码颜色
 * - Naive UI 主题覆写（theme/naiveTheme.ts）也全部取自本文件
 */
export const designTokens = {
  /** 色板：浅色极简基调（页面浅灰 / 卡片纯白 / 细边框 / 灰阶文字层级） */
  color: {
    bgPage: '#F7F7F8', // 页面背景（浅灰）
    bgCard: '#FFFFFF', // 卡片纯白
    bgSubtle: '#FAFAFA', // 次级底色（表格/标签底）
    bgHover: '#F0F0F1', // hover 微交互
    bgActive: '#E8E9EB', // pressed
    border: '#E5E5E5', // 细边框
    borderLight: '#EFEFEF', // 更细分隔线
    textPrimary: '#1F1F1F', // 标题/强文字
    textBody: '#3D3D3D', // 正文
    textSecondary: '#6E6E73', // 次级文字
    textTertiary: '#9A9AA0', // 辅助文字
    textDisabled: '#C4C4C8', // 禁用
    primary: '#0F766E', // 克制主色：深青 teal-700（点缀使用，非大面积高饱和）
    primaryHover: '#115E59',
    primaryActive: '#134E4A',
    primarySoft: '#E6F4F2', // 主色浅底（激活态/选中态）
    danger: '#DC2626',
    success: '#16A34A',
    warning: '#D97706',
    info: '#2563EB'
  },
  /** 圆角 8–12px */
  radius: {
    sm: 8,
    md: 10,
    lg: 12,
    xl: 16
  },
  /** 间距 */
  space: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
    xxxl: 48
  },
  /** 字号：标题 20–24px / 正文 14px / 辅助 12px */
  font: {
    sizeTitleLg: 24,
    sizeTitle: 20,
    sizeBody: 14,
    sizeAux: 12,
    sizeTag: 12,
    lineHeightBody: 1.6
  },
  /** 阴影：克制、低透明度 */
  shadow: {
    card: '0 1px 2px rgba(0, 0, 0, 0.04)',
    pop: '0 8px 24px rgba(0, 0, 0, 0.08)'
  }
} as const

export type DesignTokens = typeof designTokens
