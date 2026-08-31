/**
 * 基础文本工具纯函数（PLAN.md §4.8 纯函数清单首例）
 *
 * 本文件只含纯函数：无 DOM/Node 依赖、无副作用、可确定性单测，
 * 供 renderer（列表/详情/检索展示）与测试复用。
 */

/**
 * 按显示长度截断文本，超长时以省略号收尾。
 *
 * - 按 Unicode 码点计数（不切断代理对/emoji 等增补平面字符）
 * - 当文本未超长时原样返回
 * - 截断后总长度不超过 maxLen（含省略号）
 *
 * @param text 原始文本
 * @param maxLen 允许的最大码点长度（含省略号）；<= 0 时返回空串
 * @param ellipsis 省略号，默认「…」
 */
export function truncate(text: string, maxLen: number, ellipsis = '…'): string {
  if (maxLen <= 0) return ''
  const chars = Array.from(text)
  if (chars.length <= maxLen) return text
  const ellipsisLen = Array.from(ellipsis).length
  const headLen = Math.max(0, maxLen - ellipsisLen)
  return chars.slice(0, headLen).join('') + ellipsis
}

/**
 * 将连续空白（空格/制表符/换行等）折叠为单个空格，并去除首尾空白。
 */
export function collapseWhitespace(text: string): string {
  return text.trim().replace(/\s+/g, ' ')
}
