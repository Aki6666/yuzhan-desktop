/**
 * IPC handler 校验与错误码单测（PLAN §4.8 测试矩阵「IPC: Vitest（mock fs/ipcMain）handler 校验与错误码」）
 *
 * 覆盖：
 * - 统一信封 { ok, error }（§10.4）：非法入参 → INVALID_ARGS；合法 → ok
 * - data:get id 校验（非空字符串）
 * - progress:save / quiz:record / settings:set / app:log 入参守卫
 * - pending:add / pending:remove word 校验
 * - 错误码约定 §4.6：INVALID_ARGS
 *
 * 方法：vi.mock('electron') 捕获 ipcMain.handle 注册的 handler，直接以任意入参调用，
 * 断言返回值信封（不依赖真实 userData 目录内容，storage 路径注入临时目录）。
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

type Handler = (...args: unknown[]) => unknown
const handlers = new Map<string, Handler>()

// mock 后由模块内 createAppStorage 读取（app.getPath 的闭包引用）
let mockUserDataDir = ''
// dataDir 解析自 app.getAppPath()（getAppPath/data ），指向空临时目录避免加载真实正式库
let mockAppPath = ''

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: () => mockUserDataDir,
    getAppPath: () => mockAppPath,
    on: vi.fn()
  },
  ipcMain: {
    handle: (channel: string, fn: Handler) => {
      handlers.set(channel, fn)
    }
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (plain: string) => Buffer.from(`enc:${plain}`, 'utf8'),
    decryptString: (buf: Buffer) => buf.toString('utf8').replace(/^enc:/, '')
  }
}))

import { registerIpcHandlers } from '../src/main/ipc'
import { IPC_CHANNELS } from '../shared/ipc/contracts'

const dirs: string[] = []
function makeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'yuzhan-ipc-'))
  dirs.push(dir)
  return dir
}

beforeEach(() => {
  mockUserDataDir = makeDir()
  mockAppPath = makeDir()
  handlers.clear()
  registerIpcHandlers()
})

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  vi.restoreAllMocks()
})

const call = async (channel: string, ...args: unknown[]): Promise<unknown> => {
  const h = handlers.get(channel)
  if (!h) throw new Error(`handler 未注册: ${channel}`)
  return await h(undefined, ...args)
}

const INVALID = { ok: false, error: { code: 'INVALID_ARGS', message: expect.any(String) } }

describe('IPC 入参校验与错误码（§4.6 / §10.4）', () => {
  it('channel 全集注册（权威清单 §10.4）', () => {
    const expected = Object.values(IPC_CHANNELS)
    for (const ch of expected) {
      expect(handlers.has(ch), `channel ${ch} 应已注册`).toBe(true)
    }
    expect(handlers.size).toBe(expected.length)
  })

  it('data:get：空 id / 非字符串 → INVALID_ARGS', async () => {
    await expect(call(IPC_CHANNELS.dataGet, '')).resolves.toEqual(INVALID)
    await expect(call(IPC_CHANNELS.dataGet, 123)).resolves.toEqual(INVALID)
  })

  it('data:get：合法 id → ok（库空返回 null）', async () => {
    const r = (await call(IPC_CHANNELS.dataGet, 'ju-gong-jin-cui-01')) as { ok: boolean; data: unknown }
    expect(r.ok).toBe(true)
    expect(r.data).toBeNull()
  })

  it('data:list：返回 ok 信封', async () => {
    const r = (await call(IPC_CHANNELS.dataList)) as { ok: boolean; data: { items: unknown[]; version: string } }
    expect(r.ok).toBe(true)
    expect(r.data.items).toEqual([])
    expect(typeof r.data.version).toBe('string')
  })

  it('progress:save：缺 id → INVALID_ARGS', async () => {
    await expect(call(IPC_CHANNELS.progressSave, { status: 'learning' })).resolves.toEqual(INVALID)
  })

  it('progress:save：status 非法枚举 → INVALID_ARGS', async () => {
    await expect(call(IPC_CHANNELS.progressSave, { id: 'a-01', status: 'expert' })).resolves.toEqual(INVALID)
  })

  it('progress:save：wrongTimes 负数 → INVALID_ARGS', async () => {
    await expect(call(IPC_CHANNELS.progressSave, { id: 'a-01', wrongTimes: -1 })).resolves.toEqual(INVALID)
  })

  it('progress:save：合法 patch → ok:true', async () => {
    const r = (await call(IPC_CHANNELS.progressSave, { id: 'a-01', status: 'learning', wrongTimes: 1 })) as {
      ok: boolean
    }
    expect(r.ok).toBe(true)
  })

  it('quiz:record：缺 answers 数组 → INVALID_ARGS', async () => {
    await expect(call(IPC_CHANNELS.quizRecord, {})).resolves.toEqual(INVALID)
    await expect(call(IPC_CHANNELS.quizRecord, { answers: 'nope' })).resolves.toEqual(INVALID)
  })

  it('quiz:record：answers 元素缺字段/类型错 → INVALID_ARGS', async () => {
    await expect(call(IPC_CHANNELS.quizRecord, { answers: [{ id: 'a-01' }] })).resolves.toEqual(INVALID)
    await expect(call(IPC_CHANNELS.quizRecord, { answers: [{ id: 1, correct: true }] })).resolves.toEqual(INVALID)
  })

  it('quiz:record：合法 answers → ok:true', async () => {
    const r = (await call(IPC_CHANNELS.quizRecord, {
      answers: [
        { id: 'a-01', correct: true },
        { id: 'a-02', correct: false }
      ]
    })) as { ok: boolean }
    expect(r.ok).toBe(true)
  })

  it('pending:add：空串/空白 → INVALID_ARGS', async () => {
    await expect(call(IPC_CHANNELS.pendingAdd, '')).resolves.toEqual(INVALID)
    await expect(call(IPC_CHANNELS.pendingAdd, '   ')).resolves.toEqual(INVALID)
  })

  it('pending:remove：空串 → INVALID_ARGS', async () => {
    await expect(call(IPC_CHANNELS.pendingRemove, '')).resolves.toEqual(INVALID)
  })

  it('pending:add 合法词 → ok:true', async () => {
    const r = (await call(IPC_CHANNELS.pendingAdd, '不落窠臼')) as { ok: boolean }
    expect(r.ok).toBe(true)
  })

  it('settings:set：aiMode 非法枚举 → INVALID_ARGS', async () => {
    await expect(call(IPC_CHANNELS.settingsSet, { aiMode: 'hacked' })).resolves.toEqual(INVALID)
  })

  it('settings:set：quickInputShortcut 空串 → INVALID_ARGS', async () => {
    await expect(call(IPC_CHANNELS.settingsSet, { quickInputShortcut: '' })).resolves.toEqual(INVALID)
  })

  it('settings:set：合法 patch → ok:true 且返回合并后设置', async () => {
    const r = (await call(IPC_CHANNELS.settingsSet, { aiMode: 'online' })) as {
      ok: boolean
      data: { aiMode: string; quickInputShortcut: string }
    }
    expect(r.ok).toBe(true)
    expect(r.data.aiMode).toBe('online')
    expect(r.data.quickInputShortcut).toBe('CommandOrControl+K')
  })

  it('settings:get → ok:true 默认设置', async () => {
    const r = (await call(IPC_CHANNELS.settingsGet)) as { ok: boolean; data: { aiMode: string } }
    expect(r.ok).toBe(true)
    expect(r.data.aiMode).toBe('disabled')
  })

  it('app:log：非法 level / 缺 message → INVALID_ARGS', async () => {
    await expect(call(IPC_CHANNELS.appLog, { level: 'trace', message: 'x' })).resolves.toEqual(INVALID)
    await expect(call(IPC_CHANNELS.appLog, { level: 'info' })).resolves.toEqual(INVALID)
    await expect(call(IPC_CHANNELS.appLog, 'just-a-string')).resolves.toEqual(INVALID)
  })

  it('app:log：合法 { level, message } → ok:true', async () => {
    const r = (await call(IPC_CHANNELS.appLog, { level: 'warn', message: 'renderer error' })) as { ok: boolean }
    expect(r.ok).toBe(true)
  })
})

describe('AI（v0.2，§10.2/§10.4 ai:searchWord）', () => {
  it('ai:searchWord：入参校验（缺 word / 空白）→ INVALID_ARGS', async () => {
    await expect(call(IPC_CHANNELS.aiSearchWord, {})).resolves.toEqual(INVALID)
    await expect(call(IPC_CHANNELS.aiSearchWord, { word: '   ' })).resolves.toEqual(INVALID)
    await expect(call(IPC_CHANNELS.aiSearchWord, 'word')).resolves.toEqual(INVALID)
  })

  it('ai:searchWord：无 apiKey → NO_API_KEY（renderer 降级生词本）', async () => {
    const r = (await call(IPC_CHANNELS.aiSearchWord, { word: '鞠躬尽瘁' })) as { ok: boolean; error?: { code: string } }
    expect(r.ok).toBe(false)
    expect(r.error?.code).toBe('NO_API_KEY')
  })

  it('settings:set 配置 apiKey → 加密存储，settings:get 返回掩码与 hasApiKey', async () => {
    const setR = (await call(IPC_CHANNELS.settingsSet, { apiKey: 'sk-test-123456' })) as {
      ok: boolean
      data?: { hasApiKey?: boolean; apiKeyMasked?: string; aiMode?: string }
    }
    expect(setR.ok).toBe(true)
    expect(setR.data?.hasApiKey).toBe(true)
    expect(setR.data?.apiKeyMasked).toBe('sk-t****')
    expect(setR.data?.aiMode).toBe('configured') // key-set → configured（§10.2）

    const getR = (await call(IPC_CHANNELS.settingsGet)) as {
      ok: boolean
      data: { hasApiKey?: boolean; apiKeyMasked?: string }
    }
    expect(getR.data.hasApiKey).toBe(true)
    expect(getR.data.apiKeyMasked).toBe('sk-t****')
  })

  it('settings:set 清除 apiKey（空串）→ hasApiKey false、aiMode → disabled', async () => {
    await call(IPC_CHANNELS.settingsSet, { apiKey: 'sk-x' })
    const clearR = (await call(IPC_CHANNELS.settingsSet, { apiKey: '' })) as {
      ok: boolean
      data?: { hasApiKey?: boolean; aiMode?: string }
    }
    expect(clearR.data?.hasApiKey).toBe(false)
    expect(clearR.data?.aiMode).toBe('disabled')
  })

  it('settings:set：aiBaseUrl/aiModel 可配；空串 → INVALID_ARGS', async () => {
    const r = (await call(IPC_CHANNELS.settingsSet, { aiBaseUrl: 'https://ollama.local/v1', aiModel: 'qwen' })) as {
      ok: boolean
      data?: { aiBaseUrl?: string; aiModel?: string }
    }
    expect(r.ok).toBe(true)
    expect(r.data?.aiBaseUrl).toBe('https://ollama.local/v1')
    expect(r.data?.aiModel).toBe('qwen')
    await expect(call(IPC_CHANNELS.settingsSet, { aiBaseUrl: '' })).resolves.toEqual(INVALID)
    await expect(call(IPC_CHANNELS.settingsSet, { aiModel: '' })).resolves.toEqual(INVALID)
  })
})
