/**
 * 检索纯函数单测（AC-07 核心逻辑：汉字/全拼/首字母/模糊，命中优先级 精确→前缀→子串→编辑距离≤1，同分取频次高者）
 * 覆盖 shared/lib/search.ts（§10.2：pinyin-pro multiple:true 全读音索引）
 */
import { describe, it, expect } from 'vitest'
import { createSearchIndex, search, searchDetailed, SearchTier } from '../shared/lib/search'
import type { Idiom } from '../shared/ipc/contracts'

function idiom(partial: Partial<Idiom> & { id: string; word: string; pinyin: string }): Idiom {
  return {
    schemaVersion: 1,
    meaning: '测试释义',
    emotion: '中性',
    register: '无',
    errorTypes: ['望文生义'],
    quality: 'reviewed',
    library: 'official',
    updatedAt: '2026-01-01',
    verifiedBy: 'test',
    ...partial
  }
}

const fixture: Idiom[] = [
  idiom({ id: 'ju-gong-jin-cui-01', word: '鞠躬尽瘁', pinyin: 'jū gōng jìn cuì', frequency: 5 }),
  idiom({ id: 'ju-an-si-wei-01', word: '居安思危', pinyin: 'jū ān sī wēi', frequency: 4 }),
  idiom({ id: 'bu-luo-ke-jiu-01', word: '不落窠臼', pinyin: 'bù luò kē jiù', frequency: 3 }),
  idiom({ id: 'le-bu-si-shu-01', word: '乐不思蜀', pinyin: 'lè bù sī shǔ', frequency: 2 }),
  idiom({ id: 'jin-xin-jie-li-01', word: '尽心竭力', pinyin: 'jìn xīn jié lì', frequency: 1 })
]

const index = createSearchIndex(fixture)

describe('命中优先级：精确 → 前缀 → 子串 → 编辑距离', () => {
  it('汉字精确命中', () => {
    const r = search(index, '鞠躬尽瘁')
    expect(r[0]?.id).toBe('ju-gong-jin-cui-01')
    expect(searchDetailed(index, '鞠躬尽瘁')[0]?.tier).toBe(SearchTier.Exact)
  })

  it('全拼精确命中', () => {
    const r = search(index, 'ju gong jin cui')
    expect(r[0]?.id).toBe('ju-gong-jin-cui-01')
    expect(searchDetailed(index, 'ju gong jin cui')[0]?.tier).toBe(SearchTier.Exact)
  })

  it('多音字全读音兜底（multiple:true）：乐不思蜀 用 yuè 读音命中', () => {
    const r = search(index, 'yue bu si shu')
    expect(r[0]?.id).toBe('le-bu-si-shu-01')
    expect(searchDetailed(index, 'yue bu si shu')[0]?.tier).toBe(SearchTier.Exact)
  })

  it('首字母命中', () => {
    const r = search(index, 'jgj')
    expect(r[0]?.id).toBe('ju-gong-jin-cui-01')
    expect(searchDetailed(index, 'jgj')[0]?.tier).toBe(SearchTier.Prefix)
  })

  it('拼音前缀：同层级按频次降序（ju → 鞠躬尽瘁 f5 在 居安思危 f4 前）', () => {
    const r = search(index, 'ju')
    expect(r.map((i) => i.id)).toEqual(['ju-gong-jin-cui-01', 'ju-an-si-wei-01'])
    expect(r[0]?.id).toBe('ju-gong-jin-cui-01')
  })

  it('汉字前缀命中', () => {
    const r = search(index, '鞠躬')
    expect(r[0]?.id).toBe('ju-gong-jin-cui-01')
    expect(searchDetailed(index, '鞠躬')[0]?.tier).toBe(SearchTier.Prefix)
  })

  it('子串命中（汉字子串 + 拼音去空格子串）', () => {
    const byHanzi = search(index, '尽瘁')
    expect(byHanzi[0]?.id).toBe('ju-gong-jin-cui-01')
    expect(searchDetailed(index, '尽瘁')[0]?.tier).toBe(SearchTier.Substring)

    const byPinyin = search(index, 'jincui')
    expect(byPinyin[0]?.id).toBe('ju-gong-jin-cui-01')
    expect(searchDetailed(index, 'jincui')[0]?.tier).toBe(SearchTier.Substring)
  })

  it('编辑距离 ≤1：错别字提示（不落巢臼 → 不落窠臼）', () => {
    const r = search(index, '不落巢臼')
    const hit = r.find((i) => i.id === 'bu-luo-ke-jiu-01')
    expect(hit).toBeDefined()
    const detail = searchDetailed(index, '不落巢臼').find((i) => i.idiom.id === 'bu-luo-ke-jiu-01')
    expect(detail?.tier).toBe(SearchTier.EditDistance)
  })

  it('编辑距离 ≤1：拼音笔误（ju gong jin ci → 鞠躬尽瘁）', () => {
    const r = search(index, 'ju gong jin ci')
    expect(r[0]?.id).toBe('ju-gong-jin-cui-01')
    expect(searchDetailed(index, 'ju gong jin ci')[0]?.idiom.id).toBe('ju-gong-jin-cui-01')
    expect(searchDetailed(index, 'ju gong jin ci')[0]?.tier).toBe(SearchTier.EditDistance)
  })

  it('优先级：精确命中排在最前（乐不思蜀 汉字精确）', () => {
    const r = search(index, '乐不思蜀')
    expect(r[0]?.id).toBe('le-bu-si-shu-01')
    expect(searchDetailed(index, '乐不思蜀')[0]?.tier).toBe(SearchTier.Exact)
  })

  it('同分取频次高者：编辑距离层内也按频次排序', () => {
    // 'ju gong jin ci' 编辑距离 1：鞠躬尽瘁 f5 与 尽心竭力 f1 的拼音 'jin xin jie li' 距离更远不参与
    const detail = searchDetailed(index, 'ju gong jin ci')
    expect(detail[0]?.idiom.id).toBe('ju-gong-jin-cui-01')
  })

  it('空白/空查询返回空数组', () => {
    expect(search(index, '')).toEqual([])
    expect(search(index, '   ')).toEqual([])
  })

  it('limit 生效', () => {
    const r = search(index, 'ju', 1)
    expect(r).toHaveLength(1)
    expect(r[0]?.id).toBe('ju-gong-jin-cui-01')
  })

  it('查询首尾空白自动归一化', () => {
    const r = search(index, '  鞠躬尽瘁  ')
    expect(r[0]?.id).toBe('ju-gong-jin-cui-01')
  })
})
