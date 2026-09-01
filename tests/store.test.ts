/**
 * store 持久化单测（AC-08 损坏回退 / AC-09 双开聚焦；§4.5/§10.3 铁律）
 * - createStorage 不依赖 electron（路径注入），可直接单测
 * - window.ts 的 focusWindow 依赖 electron 包，vi.mock 掉
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('electron', () => ({
  app: { on: vi.fn(), isPackaged: false, getPath: () => 'tmp', getAppPath: () => '.' },
  BrowserWindow: class {},
  globalShortcut: { register: vi.fn(() => true), unregisterAll: vi.fn() },
  shell: { openExternal: vi.fn() }
}))

import { createStorage } from '../src/main/store'
import { focusWindow } from '../src/main/window'

const dirs: string[] = []

function makeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'yuzhan-store-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const d of dirs.splice(0)) {
    try {
      rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    } catch {
      /* 残留临时目录交由系统清理，不阻塞用例 */
    }
  }
})

describe('store 持久化铁律', () => {
  it('AC-08: progress.json 损坏 → 启动自动回退 .bak，不崩溃且数据可恢复', async () => {
    const dir = makeDir()
    const s1 = createStorage({ userDataDir: dir, dataDir: join(dir, 'data') })
    await s1.saveProgress({ id: 'a-01', status: 'learning', wrongTimes: 1 })
    await s1.flush()
    // 第二次写产生 .bak（内容=第一次状态）
    await s1.saveProgress({ id: 'a-01', status: 'mastered', wrongTimes: 2 })
    await s1.flush()

    // 人为破坏 progress.json（AC-08 场景）
    writeFileSync(join(dir, 'progress.json'), '{corrupt json!!!')

    const s2 = createStorage({ userDataDir: dir, dataDir: join(dir, 'data') })
    const recovered = s2.getProgressItem('a-01')
    // .bak 是最新一份的上一状态（learning/wrongTimes:1）
    expect(recovered?.status).toBe('learning')
    expect(recovered?.wrongTimes).toBe(1)
    expect(s2.getRecoveryInfo().recoveredFromBackup).toContain('progress.json')
    expect(s2.getRecoveryInfo().hasRecovery).toBe(true)
    // 主文件已被 .bak 覆盖为合法 JSON
    expect(() => JSON.parse(readFileSync(join(dir, 'progress.json'), 'utf8'))).not.toThrow()
  })

  it('原子写：写后无 *.tmp 残留；.bak 保留最近一份', async () => {
    const dir = makeDir()
    const s = createStorage({ userDataDir: dir, dataDir: join(dir, 'data') })
    await s.saveProgress({ id: 'b-01', status: 'learning', wrongTimes: 1 })
    await s.flush()
    expect(existsSync(join(dir, 'progress.json.tmp'))).toBe(false)

    await s.saveProgress({ id: 'b-01', status: 'mastered', wrongTimes: 2 })
    await s.flush()
    expect(existsSync(join(dir, 'progress.json.bak'))).toBe(true)
    const bak = JSON.parse(readFileSync(join(dir, 'progress.json.bak'), 'utf8')) as Record<string, { status: string }>
    expect(bak['b-01'].status).toBe('learning') // .bak = 写入前状态
    const main = JSON.parse(readFileSync(join(dir, 'progress.json'), 'utf8')) as Record<string, { status: string }>
    expect(main['b-01'].status).toBe('mastered')
  })

  it('.bak 也损坏 → 原始保留为 *.corrupt，按空数据启动不崩溃（§10.3#2）', async () => {
    const dir = makeDir()
    const s1 = createStorage({ userDataDir: dir, dataDir: join(dir, 'data') })
    await s1.saveProgress({ id: 'c-01', status: 'learning' })
    await s1.flush()

    writeFileSync(join(dir, 'progress.json'), 'garbage{')
    writeFileSync(join(dir, 'progress.json.bak'), 'also garbage{')

    const s2 = createStorage({ userDataDir: dir, dataDir: join(dir, 'data') })
    expect(s2.getProgress()).toEqual({})
    expect(existsSync(join(dir, 'progress.json.corrupt'))).toBe(true)
    expect(s2.getRecoveryInfo().preservedAsCorrupt).toContain('progress.json')
    expect(s2.getRecoveryInfo().hasRecovery).toBe(true)
  })

  it('写队列：并发同 key 写串行合并，最终文件为最后一次状态', async () => {
    const dir = makeDir()
    const s = createStorage({ userDataDir: dir, dataDir: join(dir, 'data') })
    await Promise.all([
      s.saveProgress({ id: 'd-01', status: 'new' }),
      s.saveProgress({ id: 'd-01', status: 'learning' }),
      s.saveProgress({ id: 'd-01', status: 'mastered', wrongTimes: 3 })
    ])
    await s.flush()
    const main = JSON.parse(readFileSync(join(dir, 'progress.json'), 'utf8')) as Record<
      string,
      { status: string; wrongTimes: number }
    >
    expect(main['d-01'].status).toBe('mastered')
    expect(main['d-01'].wrongTimes).toBe(3)
    expect(existsSync(join(dir, 'progress.json.tmp'))).toBe(false)
  })

  it('quiz:record：答错累计 wrongTimes 且 mastered 降级 learning；答对不动', async () => {
    const dir = makeDir()
    const s = createStorage({ userDataDir: dir, dataDir: join(dir, 'data') })
    await s.saveProgress({ id: 'q-01', status: 'mastered' })
    await s.flush()
    await s.recordQuizAnswers([
      { id: 'q-01', correct: false },
      { id: 'q-02', correct: true }
    ])
    await s.flush()
    const item = s.getProgressItem('q-01')
    expect(item?.wrongTimes).toBe(1)
    expect(item?.status).toBe('learning')
    expect(s.getProgressItem('q-02')).toBeUndefined()
  })

  it('生词本：add 幂等、remove、跨实例持久化', async () => {
    const dir = makeDir()
    const s1 = createStorage({ userDataDir: dir, dataDir: join(dir, 'data') })
    await s1.addPending('不落窠臼')
    await s1.addPending('不落窠臼')
    await s1.flush()
    expect(s1.listPending()).toHaveLength(1)

    const s2 = createStorage({ userDataDir: dir, dataDir: join(dir, 'data') })
    expect(s2.listPending()).toHaveLength(1)
    expect(s2.listPending()[0].word).toBe('不落窠臼')

    await s2.removePending('不落窠臼')
    await s2.flush()
    expect(s2.listPending()).toHaveLength(0)
    const s3 = createStorage({ userDataDir: dir, dataDir: join(dir, 'data') })
    expect(s3.listPending()).toHaveLength(0)
  })

  it('设置：默认值 + patch 更新并跨实例持久化', async () => {
    const dir = makeDir()
    const s1 = createStorage({ userDataDir: dir, dataDir: join(dir, 'data') })
    expect(s1.getSettings().aiMode).toBe('disabled')
    expect(s1.getSettings().quickInputShortcut).toBe('Plus')
    await s1.saveSettings({ aiMode: 'online' })
    await s1.flush()

    const s2 = createStorage({ userDataDir: dir, dataDir: join(dir, 'data') })
    expect(s2.getSettings().aiMode).toBe('online')
    expect(s2.getSettings().quickInputShortcut).toBe('Plus')
  })

  it('正式库：按首字分区扫描（跳过 tags/exams 词表）+ 语料版本', () => {
    const dir = makeDir()
    const dataDir = join(dir, 'data')
    mkdirSync(join(dataDir, 'idioms', 'j'), { recursive: true })
    mkdirSync(join(dataDir, 'scripts'), { recursive: true })
    writeFileSync(
      join(dataDir, 'idioms', 'j', 'ju-gong-jin-cui-01.json'),
      JSON.stringify({ id: 'ju-gong-jin-cui-01', word: '鞠躬尽瘁', pinyin: 'jū gōng jìn cuì', frequency: 5 })
    )
    writeFileSync(join(dataDir, 'idioms', 'tags.json'), JSON.stringify({ tags: ['态度'] }))
    writeFileSync(join(dataDir, 'idioms', 'exams.json'), JSON.stringify({ exams: ['2023-国考-副省级'] }))
    writeFileSync(join(dataDir, 'scripts', 'corpus-version.json'), JSON.stringify({ corpus: '2025.1' }))

    const s = createStorage({ userDataDir: join(dir, 'ud'), dataDir })
    const { items, version } = s.listOfficial()
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe('ju-gong-jin-cui-01')
    expect(version).toBe('2025.1')
    expect(s.getOfficial('ju-gong-jin-cui-01')?.word).toBe('鞠躬尽瘁')
    expect(s.getOfficial('not-exist')).toBeNull()
  })

  it('正式库：data 目录缺失 → 空列表兜底', () => {
    const dir = makeDir()
    const s = createStorage({ userDataDir: join(dir, 'ud'), dataDir: join(dir, 'no-data') })
    expect(s.listOfficial().items).toEqual([])
  })
})

describe('SM-2 迁移与调度字段（v0.2，§5.6）', () => {
  /** 运行时 today（UTC）；因 due=now 是运行时时间，在断言处即时计算，避免收集期/运行期跨日偏差 */
  const todayNow = (): string => new Date().toISOString().slice(0, 10)

  it('旧记录（无 review）启动迁移补默认值：due=now/interval=0/ease=2.5，旧字段保留', async () => {
    const dir = makeDir()
    // v0.1 旧格式：无 review 字段
    const legacy = {
      'ju-gong-jin-cui-01': {
        id: 'ju-gong-jin-cui-01',
        status: 'learning',
        wrongTimes: 2,
        wrongTypes: { 褒贬误用: 1 },
        lastSeen: '2026-08-30'
      }
    }
    writeFileSync(join(dir, 'progress.json'), JSON.stringify(legacy))
    const s = createStorage({ userDataDir: dir, dataDir: join(dir, 'data') })
    await s.flush() // 迁移写盘完成后再断言/teardown，避免队列微任务竞态
    const item = s.getProgressItem('ju-gong-jin-cui-01')
    // 旧数据兼容：v0.1 字段原样保留
    expect(item?.status).toBe('learning')
    expect(item?.wrongTimes).toBe(2)
    expect(item?.wrongTypes).toEqual({ 褒贬误用: 1 })
    expect(item?.lastSeen).toBe('2026-08-30')
    // 迁移补默认：interval/ease 精确断言；due=now 运行时近似（格式 + 与即时 today 一致）
    expect(item?.review).toBeDefined()
    expect(item?.review?.interval).toBe(0)
    expect(item?.review?.ease).toBe(2.5)
    expect(item?.review?.due).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(item?.review?.due).toBe(todayNow())
  })

  it('迁移幂等：不重复迁移、结果落盘、二次启动不覆盖', async () => {
    const dir = makeDir()
    writeFileSync(
      join(dir, 'progress.json'),
      JSON.stringify({ 'a-01': { id: 'a-01', status: 'new', wrongTimes: 0, wrongTypes: {} } })
    )
    const s1 = createStorage({ userDataDir: dir, dataDir: join(dir, 'data') })
    await s1.flush() // 迁移结果写盘
    const onDisk = JSON.parse(readFileSync(join(dir, 'progress.json'), 'utf8'))
    expect(onDisk['a-01'].review).toEqual({ interval: 0, ease: 2.5, due: todayNow() })

    const s2 = createStorage({ userDataDir: dir, dataDir: join(dir, 'data') })
    expect(s2.getProgressItem('a-01')?.review?.interval).toBe(0)
    expect(s2.getProgressItem('a-01')?.review?.ease).toBe(2.5)
    expect(s2.getProgressItem('a-01')?.review?.due).toBe(todayNow())
  })

  it('SM-2 字段持久化：saveProgress review patch → 跨实例读回', async () => {
    const dir = makeDir()
    const s1 = createStorage({ userDataDir: dir, dataDir: join(dir, 'data') })
    await s1.saveProgress({
      id: 'b-01',
      review: { interval: 3, ease: 2.8, due: '2026-09-03', reviewAt: '2026-08-31T10:00:00.000Z' }
    })
    await s1.flush()
    const s2 = createStorage({ userDataDir: dir, dataDir: join(dir, 'data') })
    expect(s2.getProgressItem('b-01')?.review).toEqual({
      interval: 3,
      ease: 2.8,
      due: '2026-09-03',
      reviewAt: '2026-08-31T10:00:00.000Z'
    })
  })

  it('review patch 部分更新：与现有字段合并，不丢其余字段', async () => {
    const dir = makeDir()
    const s = createStorage({ userDataDir: dir, dataDir: join(dir, 'data') })
    await s.saveProgress({ id: 'c-01', review: { interval: 5, ease: 2.6, due: '2026-09-10' } })
    await s.saveProgress({ id: 'c-01', review: { interval: 7 } }) // 只改 interval
    await s.flush()
    const item = s.getProgressItem('c-01')
    expect(item?.review).toEqual({ interval: 7, ease: 2.6, due: '2026-09-10' })
  })

  it('损坏回退 .bak 恢复出的旧数据同样执行迁移（铁律不变）', async () => {
    const dir = makeDir()
    const legacy = { 'd-01': { id: 'd-01', status: 'learning', wrongTimes: 1, wrongTypes: {} } }
    writeFileSync(join(dir, 'progress.json'), '{corrupt!!!')
    writeFileSync(join(dir, 'progress.json.bak'), JSON.stringify(legacy))
    const s = createStorage({ userDataDir: dir, dataDir: join(dir, 'data') })
    expect(s.getRecoveryInfo().recoveredFromBackup).toContain('progress.json')
    await s.flush() // 迁移写盘完成后再 teardown，避免队列微任务竞态
    const item = s.getProgressItem('d-01')
    expect(item?.status).toBe('learning') // 回退数据旧字段保留
    expect(item?.review).toEqual({ interval: 0, ease: 2.5, due: todayNow() }) // 迁移补默认
  })
})

describe('AC-09 双开聚焦', () => {
  it('第二实例：最小化窗口 → restore + focus；非最小化 → 仅 focus', () => {
    const restore = vi.fn()
    const focus = vi.fn()
    focusWindow({ isMinimized: () => true, restore, focus })
    expect(restore).toHaveBeenCalledTimes(1)
    expect(focus).toHaveBeenCalledTimes(1)

    const focus2 = vi.fn()
    const restore2 = vi.fn()
    focusWindow({ isMinimized: () => false, restore: restore2, focus: focus2 })
    expect(restore2).not.toHaveBeenCalled()
    expect(focus2).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// v0.2.6 迭代（§16.3 P0-④/P0-③）：个人库落盘 + 主题设置
// ---------------------------------------------------------------------------

describe('个人库落盘 + 主题设置（v0.2.6 P0-④/P0-③）', () => {
  function makeUserIdiom(word: string, id: string) {
    return {
      schemaVersion: 1,
      id,
      word,
      pinyin: 'xīn cí',
      meaning: '新释义',
      emotion: '中性',
      register: '无',
      errorTypes: [],
      frequency: 3,
      quality: 'user',
      library: 'user'
    }
  }

  it('个人库：add 幂等（按词形去重）、跨实例持久化（重启可加载）', async () => {
    const dir = makeDir()
    const s1 = createStorage({ userDataDir: dir, dataDir: join(dir, 'data') })
    await expect(s1.addUserIdiom(makeUserIdiom('新词甲', 'xin-ci-u1') as never)).resolves.toBe(true)
    // 同词形不同 id → 去重拒绝
    await expect(s1.addUserIdiom(makeUserIdiom('新词甲', 'xin-ci-u2') as never)).resolves.toBe(false)
    await expect(s1.addUserIdiom(makeUserIdiom('新词乙', 'xin-ci-u3') as never)).resolves.toBe(true)
    await s1.flush()

    // 新实例（重启）：个人库恢复
    const s2 = createStorage({ userDataDir: dir, dataDir: join(dir, 'data') })
    const items = s2.listUserIdioms()
    expect(items).toHaveLength(2)
    expect(items.map((i) => i.word)).toEqual(['新词甲', '新词乙'])
  })

  it('个人库文件损坏 → 回退 .bak 不崩溃（复用持久化铁律）', async () => {
    const dir = makeDir()
    const s1 = createStorage({ userDataDir: dir, dataDir: join(dir, 'data') })
    await s1.addUserIdiom(makeUserIdiom('新词甲', 'xin-ci-u1') as never)
    await s1.addUserIdiom(makeUserIdiom('新词乙', 'xin-ci-u2') as never) // 产生 .bak
    await s1.flush()
    writeFileSync(join(dir, 'idioms-user.json'), '{corrupt!!!')

    const s2 = createStorage({ userDataDir: dir, dataDir: join(dir, 'data') })
    // .bak = 上一次状态（仅 新词甲）
    expect(s2.listUserIdioms().map((i) => i.word)).toEqual(['新词甲'])
  })

  it('主题：默认 light；saveSettings({ theme: dark }) 持久化跨实例', async () => {
    const dir = makeDir()
    const s1 = createStorage({ userDataDir: dir, dataDir: join(dir, 'data') })
    expect(s1.getSettings().theme).toBe('light')
    await s1.saveSettings({ theme: 'dark' })
    await s1.flush()
    const s2 = createStorage({ userDataDir: dir, dataDir: join(dir, 'data') })
    expect(s2.getSettings().theme).toBe('dark')
    // 非法 theme 清洗回默认
    writeFileSync(join(dir, 'config.json'), JSON.stringify({ ...s2.getSettings(), theme: 'hacked' }))
    const s3 = createStorage({ userDataDir: dir, dataDir: join(dir, 'data') })
    expect(s3.getSettings().theme).toBe('light')
  })

  it('全量导出（v0.2.6 P1-③）：exportUserDataJson 含全部主 .json，排除 .bak/.tmp', async () => {
    const dir = makeDir()
    const s1 = createStorage({ userDataDir: dir, dataDir: join(dir, 'data') })
    await s1.saveProgress({ id: 'a-01', status: 'learning' })
    await s1.addPending('未收录词甲')
    await s1.saveSettings({ theme: 'dark' })
    await s1.flush()
    const files = s1.exportUserDataJson()
    expect(files['progress.json']).toContain('a-01')
    expect(files['pending.json']).toContain('未收录词甲')
    expect(files['config.json']).toContain('dark')
    // 备份/临时文件不入导出
    expect(Object.keys(files).some((n) => n.endsWith('.bak') || n.endsWith('.tmp'))).toBe(false)
  })
})
