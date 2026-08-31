/**
 * 成语详情卡片展示纯函数（PLAN.md §4.8：纯逻辑抽离、可单测）
 *
 * - splitMeanings：释义多义项「；」分隔渲染（§5.1：多义项用「；」分隔）
 * - exampleBadge：真题例句标注（§6.2：kind=exam 注明卷别，made 标注自造）
 *
 * 无 DOM/无 Electron 依赖，tests/detail.test.ts 直接单测。
 */

/** 按「；」拆分释义多义项，去空白、去空项；无分号时返回单元素数组 */
export function splitMeanings(meaning: string): string[] {
  return meaning
    .split('；')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/** 例句标注文案：exam → 「真题 · <卷别>」，made → 「自造」 */
export function exampleBadge(kind: 'exam' | 'made', exam?: string): string {
  if (kind === 'exam') {
    return exam && exam.trim().length > 0 ? `真题 · ${exam.trim()}` : '真题'
  }
  return '自造'
}
