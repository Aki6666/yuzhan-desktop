import { describe, expect, it } from 'vitest'
import { collapseWhitespace, truncate } from '../shared/lib/format'

describe('truncate', () => {
  it('短文本原样返回，不追加省略号', () => {
    expect(truncate('鞠躬尽瘁', 10)).toBe('鞠躬尽瘁')
  })

  it('超长文本按 maxLen 截断并追加省略号（含省略号不超过 maxLen）', () => {
    expect(truncate('殚精竭虑、鞠躬尽瘁、呕心沥血', 5)).toBe('殚精竭虑…')
  })

  it('边界：长度恰好等于 maxLen 时不截断', () => {
    expect(truncate('守株待兔', 4)).toBe('守株待兔')
  })

  it('maxLen 小于等于 0 时返回空串', () => {
    expect(truncate('守株待兔', 0)).toBe('')
    expect(truncate('守株待兔', -3)).toBe('')
  })

  it('按码点计数，不切断代理对（emoji）', () => {
    const text = '成语📚测试' // 共 5 个码点（📚 为增补平面代理对）
    // maxLen=4 → 保留 3 个码点 + 省略号 = 4 码点；📚 整体保留，不被切碎
    const out = truncate(text, 4)
    expect(out).toBe('成语📚…')
    expect(Array.from(out).length).toBe(4)
    expect(out.includes('📚')).toBe(true)
  })

  it('支持自定义省略号', () => {
    expect(truncate('近义辨析测试', 4, '...')).toBe('近...')
  })
})

describe('collapseWhitespace', () => {
  it('折叠连续空格并去除首尾空白', () => {
    expect(collapseWhitespace('  一  言   九鼎 ')).toBe('一 言 九鼎')
  })

  it('折叠制表符与换行为单个空格', () => {
    expect(collapseWhitespace('相提\n并论\t不分  伯仲')).toBe('相提 并论 不分 伯仲')
  })

  it('空串与纯空白输入返回空串', () => {
    expect(collapseWhitespace('')).toBe('')
    expect(collapseWhitespace('   \t\n ')).toBe('')
  })
})
