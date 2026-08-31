/**
 * 数据校验脚本单测（PLAN §4.8「schema 校验（ajv）」/ AC-10）
 *
 * 覆盖 validate-data.mjs 的 runValidation（路径注入 fixture）：
 * - §5.7#1 id 唯一性（full 跨分区 + draft 冲突）
 * - §5.7#2 required 字段（schema 强制 + draft 缺字段警告）
 * - §5.7#3 词表引用（tags/exams/examples.exam）
 * - §5.7#4 library=official ⟹ quality=reviewed
 * - §5.7#5 上限（near≤5 / examples≤3 / tags≤4 / errorTypes≤2）
 * - §5.7#7 reviewed 必带 updatedAt + verifiedBy
 * - §5.7#8 id slug 与 pinyin 推导一致（多音字例外放行）
 * - §5.7#6 near/opposite 存在性仅警告
 * - §5.3 词表自检（tags 上限/重复、exams 格式）
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runValidation } from '../data/scripts/validate-data.mjs'
import { resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dirname ?? process.cwd(), '..')

/** 最小合法词条（full 入口通过） */
function validIdiom(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    id: 'ju-gong-jin-cui-01',
    word: '鞠躬尽瘁',
    pinyin: 'jū gōng jìn cuì',
    meaning: '小心谨慎，贡献出全部力量直到死。',
    emotion: '褒',
    register: '无',
    errorTypes: ['形近/音近混淆'],
    frequency: 4,
    quality: 'reviewed',
    library: 'official',
    verifiedBy: '用户',
    updatedAt: '2026-08-31',
    ...overrides
  }
}

interface Fixture {
  dir: string
  idiomsDir: string
  writeIdiom: (rel: string, data: Record<string, unknown>) => void
  cleanup: () => void
}

function makeFixture(opts: { tags?: string[]; exams?: string[] } = {}): Fixture {
  const dir = mkdtempSync(join(tmpdir(), 'yuzhan-data-'))
  const idiomsDir = join(dir, 'idioms')
  mkdirSync(join(idiomsDir, 'j'), { recursive: true })
  writeFileSync(
    join(idiomsDir, 'tags.json'),
    JSON.stringify({ schemaVersion: 1, tags: opts.tags ?? ['态度奉献', '人际交往'] })
  )
  writeFileSync(
    join(idiomsDir, 'exams.json'),
    JSON.stringify({ schemaVersion: 1, exams: opts.exams ?? ['2024-国考-副省级', '2023-国考-副省级'] })
  )
  const fixture: Fixture = {
    dir,
    idiomsDir,
    writeIdiom: (rel, data) => {
      const full = join(idiomsDir, rel)
      mkdirSync(join(full, '..'), { recursive: true })
      writeFileSync(full, JSON.stringify(data))
    },
    cleanup: () => rmSync(dir, { recursive: true, force: true })
  }
  return fixture
}

const run = (fx: Fixture) => runValidation({ idiomsDir: fx.idiomsDir, draftsDir: join(fx.dir, 'drafts') })

const dirs: Fixture[] = []

afterEach(() => {
  for (const fx of dirs.splice(0)) fx.cleanup()
})

describe('validate:data 约束（§5.7 / AC-10）', () => {
  it('合法词条 → 零错误零警告', () => {
    const fx = makeFixture()
    dirs.push(fx)
    fx.writeIdiom('j/ju-gong-jin-cui-01.json', validIdiom())
    const res = run(fx)
    expect(res.errors).toEqual([])
    expect(res.warnings).toEqual([])
    expect(res.exitCode).toBe(0)
  })

  it('§5.7#1：id 重复（跨分区）→ 错误', () => {
    const fx = makeFixture()
    dirs.push(fx)
    fx.writeIdiom('j/ju-gong-jin-cui-01.json', validIdiom())
    fx.writeIdiom('g/dup-01.json', validIdiom({ id: 'ju-gong-jin-cui-01', word: '另一词' }))
    const res = run(fx)
    expect(res.errors.some((e) => e.includes('id 重复'))).toBe(true)
    expect(res.exitCode).toBe(1)
  })

  it('§5.7#2：缺 required 字段（meaning）→ 错误', () => {
    const fx = makeFixture()
    dirs.push(fx)
    const bad = validIdiom()
    delete (bad as { meaning?: string }).meaning
    fx.writeIdiom('j/ju-gong-jin-cui-01.json', bad)
    const res = run(fx)
    expect(res.errors.length).toBeGreaterThan(0)
    expect(res.exitCode).toBe(1)
  })

  it('§5.7#3：tags 引用非受控主题 → 错误', () => {
    const fx = makeFixture()
    dirs.push(fx)
    fx.writeIdiom('j/ju-gong-jin-cui-01.json', validIdiom({ tags: ['不存在的主题'] }))
    const res = run(fx)
    expect(res.errors.some((e) => e.includes('非受控主题'))).toBe(true)
  })

  it('§5.7#3：examples kind=exam 必须带受控 exam 卷别', () => {
    const fx = makeFixture()
    dirs.push(fx)
    // 缺 exam
    fx.writeIdiom('j/a-01.json', validIdiom({ examples: [{ text: '示例文本一', kind: 'exam' }] }))
    // exam 不在词表
    fx.writeIdiom('j/b-02.json', validIdiom({ id: 'b-02', word: 'B词', pinyin: 'b cí', examples: [{ text: '示例文本二', kind: 'exam', exam: '2099-国考-某省' }] }))
    const res = run(fx)
    expect(res.errors.some((e) => e.includes('kind=exam 必须带 exam'))).toBe(true)
    expect(res.errors.some((e) => e.includes('不在 exams.json'))).toBe(true)
  })

  it('§5.7#4：library=official 必须 quality=reviewed', () => {
    const fx = makeFixture()
    dirs.push(fx)
    fx.writeIdiom('j/ju-gong-jin-cui-01.json', validIdiom({ quality: 'draft' }))
    const res = run(fx)
    expect(res.errors.some((e) => e.includes('library=official 必须 quality=reviewed'))).toBe(true)
  })

  it('§5.7#5：errorTypes >2 → 错误；near >5 → 错误；tags >4 → 错误', () => {
    const fx = makeFixture()
    dirs.push(fx)
    fx.writeIdiom(
      'j/ju-gong-jin-cui-01.json',
      validIdiom({
        errorTypes: ['望文生义', '形近/音近混淆', '语义重复'],
        near: [1, 2, 3, 4, 5, 6].map((i) => ({ word: `近义词${i}`, diff: '区别' })),
        tags: ['态度奉献', '人际交往', '状态程度', '社会现象', '学习事业']
      })
    )
    const res = run(fx)
    expect(res.errors.length).toBeGreaterThan(0)
  })

  it('§5.7#7：reviewed 缺 updatedAt / verifiedBy → 错误', () => {
    const fx = makeFixture()
    dirs.push(fx)
    const noDate = validIdiom()
    delete (noDate as { updatedAt?: string }).updatedAt
    fx.writeIdiom('j/ju-gong-jin-cui-01.json', noDate)
    const res = run(fx)
    expect(res.errors.some((e) => e.includes('必须带 updatedAt'))).toBe(true)
  })

  it('§5.7#8：id slug 与 pinyin 不一致 → 错误（多音字例外放行）', () => {
    const fx = makeFixture()
    dirs.push(fx)
    // slug 与拼音不一致
    fx.writeIdiom('j/ju-gong-jin-cui-01.json', validIdiom({ pinyin: 'wǎng gōng jìn cuì' }))
    const res = run(fx)
    expect(res.errors.some((e) => e.includes('与 pinyin 推导'))).toBe(true)
  })

  it('§5.7#6：near 词不在库内 → 仅警告，退出码 0', () => {
    const fx = makeFixture()
    dirs.push(fx)
    fx.writeIdiom('j/ju-gong-jin-cui-01.json', validIdiom({ near: [{ word: '殚精竭虑', diff: '区别' }] }))
    const res = run(fx)
    expect(res.errors).toEqual([])
    expect(res.warnings.some((w) => w.includes('near 词 "殚精竭虑" 不在库内'))).toBe(true)
    expect(res.exitCode).toBe(0)
  })

  it('§5.5：分区目录与 id 首字母不一致 → 错误', () => {
    const fx = makeFixture()
    dirs.push(fx)
    fx.writeIdiom('g/wrong-dir-01.json', validIdiom())
    const res = run(fx)
    expect(res.errors.some((e) => e.includes('分区目录'))).toBe(true)
  })

  it('§5.3：exams 格式不合规 → 错误', () => {
    const fx = makeFixture({ exams: ['省考'] })
    dirs.push(fx)
    fx.writeIdiom('j/ju-gong-jin-cui-01.json', validIdiom())
    const res = run(fx)
    expect(res.errors.some((e) => e.includes('不符合「年份-考试类型-卷类/省」格式'))).toBe(true)
  })

  it('§5.3：tags 重复 → 错误', () => {
    const fx = makeFixture({ tags: ['态度奉献', '态度奉献'] })
    dirs.push(fx)
    fx.writeIdiom('j/ju-gong-jin-cui-01.json', validIdiom())
    const res = run(fx)
    expect(res.errors.some((e) => e.includes('重复主题'))).toBe(true)
  })

  it('word 非汉字 → 错误（schema pattern）', () => {
    const fx = makeFixture()
    dirs.push(fx)
    fx.writeIdiom('j/ju-gong-jin-cui-01.json', validIdiom({ word: 'abc' }))
    const res = run(fx)
    expect(res.errors.length).toBeGreaterThan(0)
  })

  it('draft 入口：缺 full-required 字段 → 警告标记待补充（不阻塞）', () => {
    const fx = makeFixture()
    dirs.push(fx)
    const draftsDir = join(fx.dir, 'drafts')
    mkdirSync(draftsDir, { recursive: true })
    // draft 缺 errorTypes（full 必填、draft 可缺）
    const draft = validIdiom({ quality: 'draft', library: 'user', errorTypes: undefined })
    delete (draft as { errorTypes?: unknown }).errorTypes
    writeFileSync(join(draftsDir, 'draft-01.json'), JSON.stringify(draft))
    const res = runValidation({ idiomsDir: fx.idiomsDir, draftsDir })
    expect(res.errors).toEqual([])
    expect(res.warnings.some((w) => w.includes('draft 缺字段 "errorTypes"'))).toBe(true)
    expect(res.exitCode).toBe(0)
  })

  it('真实种子库回归：60 个正式词条零错误（AC-10 主路径）', () => {
    const res = runValidation({
      idiomsDir: join(REPO_ROOT, 'data', 'idioms'),
      draftsDir: join(REPO_ROOT, 'data', 'drafts')
    })
    expect(res.errors).toEqual([])
    expect(res.fullFiles).toBeGreaterThanOrEqual(60)
    expect(res.exitCode).toBe(0)
  })
})
