/**
 * Naive UI 主题覆写（v0.2.6「墨韵」设计系统；§16.3 P0-③ 暗色模式）
 *
 * 全部值取自 styles/designTokens.ts（单一事实来源），禁止硬编码颜色。
 * themeOverrides(theme) 按浅/暗返回对应覆写；App.vue 同时给 NConfigProvider
 * 传 darkTheme（naive-ui 内置）实现组件级暗色。
 */
import type { GlobalThemeOverrides } from 'naive-ui'
import { designTokens, designTokensDark, type ThemeName } from '../styles/designTokens'

export function themeOverrides(theme: ThemeName): GlobalThemeOverrides {
  const t = theme === 'dark' ? designTokensDark : designTokens
  const c = t.color
  const r = t.radius
  const f = t.font

  return {
    common: {
      // 克制主色：朱砂（点缀使用）
      primaryColor: c.primary,
      primaryColorHover: c.primaryHover,
      primaryColorPressed: c.primaryActive,
      primaryColorSuppl: c.primary,
      infoColor: c.info,
      successColor: c.success,
      warningColor: c.warning,
      errorColor: c.danger,
      // 表面
      bodyColor: c.bgPage,
      cardColor: c.bgCard,
      modalColor: c.bgCard,
      popoverColor: c.bgCard,
      inputColor: c.bgCard,
      tableColor: c.bgCard,
      tagColor: c.bgSubtle,
      actionColor: c.bgSubtle,
      // 文字层级
      textColor1: c.textPrimary,
      textColor2: c.textBody,
      textColor3: c.textSecondary,
      textColorDisabled: c.textDisabled,
      placeholderColor: c.textTertiary,
      // 边框与分割线
      borderColor: c.border,
      dividerColor: c.borderLight,
      hoverColor: c.bgHover,
      pressedColor: c.bgActive,
      // 圆角
      borderRadius: `${r.md}px`,
      borderRadiusSmall: `${r.sm}px`,
      // 字号
      fontSize: `${f.sizeBody}px`,
      fontSizeSmall: `${f.sizeAux}px`,
      fontSizeMedium: `${f.sizeBody}px`,
      fontSizeLarge: `${f.sizeTitle}px`,
      fontWeight: '500',
      fontWeightStrong: '700',
      // 克制阴影
      boxShadow1: t.shadow.card,
      boxShadow2: theme === 'dark' ? '0 4px 14px rgba(0, 0, 0, 0.35)' : '0 4px 14px rgba(76, 62, 45, 0.08)',
      boxShadow3: t.shadow.pop,
      fontFamily: f.family
    },
    // 按钮
    Button: {
      borderRadiusMedium: '10px',
      borderRadiusLarge: '12px',
      fontWeight: '600',
      heightMedium: '34px'
    },
    // 输入框
    Input: {
      borderRadius: '10px'
    },
    // 卡片
    Card: {
      borderRadius: `${r.lg}px`
    },
    // 标签
    Tag: {
      borderRadius: '999px'
    }
  }
}

/** 浅色主题覆写（默认） */
export const lightThemeOverrides = themeOverrides('light')
/** 暗色主题覆写 */
export const darkThemeOverrides = themeOverrides('dark')
