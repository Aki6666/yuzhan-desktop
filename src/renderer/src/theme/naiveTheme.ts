/**
 * Naive UI 主题覆写（U1 设计系统）
 *
 * 浅色极简基调：全部值取自 styles/designTokens.ts（单一事实来源），
 * 禁止在此文件散落硬编码颜色。common 覆写会级联到所有 Naive UI 组件
 * （按钮/输入框/卡片/弹层/标签……），实现全应用视觉统一而不改任何页面组件。
 */
import type { GlobalThemeOverrides } from 'naive-ui'
import { designTokens } from '../styles/designTokens'

const c = designTokens.color
const r = designTokens.radius
const f = designTokens.font

export const themeOverrides: GlobalThemeOverrides = {
  common: {
    // 克制主色：深青点缀
    primaryColor: c.primary,
    primaryColorHover: c.primaryHover,
    primaryColorPressed: c.primaryActive,
    primaryColorSuppl: c.primary,
    infoColor: c.info,
    successColor: c.success,
    warningColor: c.warning,
    errorColor: c.danger,
    // 表面：页面浅灰 / 卡片与弹层纯白
    bodyColor: c.bgPage,
    cardColor: c.bgCard,
    modalColor: c.bgCard,
    popoverColor: c.bgCard,
    inputColor: c.bgCard,
    tableColor: c.bgCard,
    tagColor: c.bgSubtle,
    actionColor: c.bgSubtle,
    // 灰阶文字层级：标题 / 正文 / 次级 / 辅助 / 禁用
    textColor1: c.textPrimary,
    textColor2: c.textBody,
    textColor3: c.textSecondary,
    textColorDisabled: c.textDisabled,
    placeholderColor: c.textTertiary,
    // 细边框与分割线
    borderColor: c.border,
    dividerColor: c.borderLight,
    hoverColor: c.bgHover,
    pressedColor: c.bgActive,
    // 圆角 8–12px
    borderRadius: `${r.md}px`,
    borderRadiusSmall: `${r.sm}px`,
    // 字号：正文 14px / 辅助 12px / 标题 20px
    fontSize: `${f.sizeBody}px`,
    fontSizeSmall: `${f.sizeAux}px`,
    fontSizeMedium: `${f.sizeBody}px`,
    fontSizeLarge: `${f.sizeTitle}px`,
    fontWeight: '500',
    fontWeightStrong: '600',
    // 克制阴影
    boxShadow1: designTokens.shadow.card,
    boxShadow2: '0 4px 12px rgba(0, 0, 0, 0.06)',
    boxShadow3: designTokens.shadow.pop,
    fontFamily:
      "'Segoe UI', 'PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif"
  }
}
