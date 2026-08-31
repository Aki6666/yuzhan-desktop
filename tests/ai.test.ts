/**
 * AI 层单测（V2-C，§10.2）：Provider 抽象 / aiMode 迁移 / 缓存 LRU / 服务（超时/重试/冷却/取消）
 * - createAiService 不依赖 electron（fetch 走全局），可注入 mock provider 与临时缓存目录
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createAiCache,
  createAiService,
  createProvider,
  extractJson,
  sanitizeDraft,
  transitionAiMode,
  type AiProvider,
  type AiService
} from '../src/main/ai'
import type { AiDraftResult, AiMode } from '../shared/ipc/contracts'

const dirs: string[] = []
function makeDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'yuzhan-ai-'))
  dirs.push(d)
  return d
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  vi.unstubAllGlobals()
})

const draft = (word: string, extra: Partial<AiDraftResult> = {}): AiDraftResult => ({
  word,
  meaning: `释义${word}`,
  emotion: '中性',
  register: '无',
  errorTypes: ['望文生义'],
  frequency: 3,
  ...extra
})

// ---------------------------------------------------------------------------
// aiMode 状态机（§10.2 四态）
// ---------------------------------------------------------------------------

describe('transitionAiMode（四态状态机）', () => {
  it('key-set：disabled/error → configured；online/configured 保持', () => {
    expect(transitionAiMode('disabled', 'key-set')).toBe('configured')
    expect(transitionAiMode('error', 'key-set')).toBe('configured')
    expect(transitionAiMode('configured', 'key-set')).toBe('configured')
    expect(transitionAiMode('online', 'key-set')).toBe('online')
  })

  it('key-cleared → disabled', () => {
    expect(transitionAiMode('online', 'key-cleared')).toBe('disabled')
    expect(transitionAiMode('error', 'key-cleared')).toBe('disabled')
  })

  it('query-success → online；query-failure → error', () => {
    expect(transitionAiMode('configured', 'query-success')).toBe('online')
    expect(transitionAiMode('online', 'query-failure')).toBe('error')
  })
})

// ---------------------------------------------------------------------------
// AI 输出解析与清洗
// ---------------------------------------------------------------------------

describe('extractJson / sanitizeDraft', () => {
  it('extractJson：纯 JSON / 围栏 JSON / 前后噪声', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 })
    expect(extractJson('```json\n{"a":2}\n```')).toEqual({ a: 2 })
    expect(extractJson('好的，结果如下：{"a":3} 完')).toEqual({ a: 3 })
    expect(extractJson('not json')).toBeNull()
  })

  it('sanitizeDraft：合法草稿保留关键字段', () => {
    const d = sanitizeDraft({ word: '鞠躬尽瘁', meaning: 'm', emotion: '褒', register: '无', errorTypes: ['对象误用'], frequency: 5 })
    expect(d?.word).toBe('鞠躬尽瘁')
    expect(d?.emotion).toBe('褒')
    expect(d?.errorTypes).toEqual(['对象误用'])
    expect(d?.frequency).toBe(5)
  })

  it('sanitizeDraft：缺 word → null；非法枚举回退默认', () => {
    expect(sanitizeDraft({ meaning: 'x' })).toBeNull()
    expect(sanitizeDraft('nope')).toBeNull()
    const d = sanitizeDraft({ word: 'x', emotion: '超级褒', register: '皇帝', frequency: 99 })
    expect(d?.emotion).toBe('中性')
    expect(d?.register).toBe('无')
    expect(d?.frequency).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// Provider（mock + OpenAI 兼容 fetch 校验）
// ---------------------------------------------------------------------------

describe('createProvider', () => {
  it('mock：返回该词草稿（供测试/离线）', async () => {
    const p = createProvider('mock', { apiKey: '', baseURL: '', model: '' })
    const r = await p.searchWord('鞠躬尽瘁', new AbortController().signal)
    expect(r.word).toBe('鞠躬尽瘁')
  })

  it('openai：POST chat/completions，Authorization Bearer，解析 choices[0].message.content', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(draft('不落窠臼')) } }]
      })
    }))
    vi.stubGlobal('fetch', fetchMock)

    const p = createProvider('openai', { apiKey: 'sk-test', baseURL: 'https://example.com/v1', model: 'gpt-x' })
    const r = await p.searchWord('不落窠臼', new AbortController().signal)
    expect(r.word).toBe('不落窠臼')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://example.com/v1/chat/completions')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer sk-test')
    const body = JSON.parse(String(init.body)) as { model: string }
    expect(body.model).toBe('gpt-x')
  })

  it('openai：HTTP 错误 → 抛出（服务层重试）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, statusText: 'ERR', json: async () => ({}) }))
    )
    const p = createProvider('openai', { apiKey: 'sk', baseURL: 'https://x/v1', model: 'm' })
    await expect(p.searchWord('x', new AbortController().signal)).rejects.toThrow('AI HTTP 500')
  })
})

// ---------------------------------------------------------------------------
// 缓存 LRU（§10.2：同词不重复调用、上限清理）
// ---------------------------------------------------------------------------

describe('createAiCache（LRU 200）', () => {
  it('set/get 回读；未命中 → null；损坏 → null 并清理', () => {
    const cache = createAiCache(makeDir(), 200)
    cache.set('鞠躬尽瘁', draft('鞠躬尽瘁'))
    expect(cache.get('鞠躬尽瘁')?.word).toBe('鞠躬尽瘁')
    expect(cache.get('不存在的词')).toBeNull()
    expect(cache.size()).toBe(1)
  })

  it('超限 LRU 清理：只保留最近 max 条', async () => {
    const dir = makeDir()
    const cache = createAiCache(dir, 3)
    for (let i = 1; i <= 5; i++) {
      cache.set(`词${i}`, draft(`词${i}`))
      await new Promise((r) => setTimeout(r, 3)) // mtime 可区分（确定性 LRU）
    }
    expect(cache.size()).toBe(3)
    // 最旧的 词1/词2 被清理
    expect(cache.get('词1')).toBeNull()
    expect(cache.get('词2')).toBeNull()
    expect(cache.get('词3')).toBeTruthy()
    expect(cache.get('词4')).toBeTruthy()
    expect(cache.get('词5')).toBeTruthy()
  })

  it('损坏缓存文件 → get 返回 null 且文件被清理', () => {
    const dir = makeDir()
    const cache = createAiCache(dir, 200)
    cache.set('词X', draft('词X'))
    const files = readdirSync(dir)
    expect(files.length).toBe(1)
    writeFileSync(join(dir, files[0]), '{corrupt')
    expect(cache.get('词X')).toBeNull()
    expect(readdirSync(dir).length).toBe(0) // 损坏文件被清理
  })
})

// ---------------------------------------------------------------------------
// AI 服务（超时/重试/冷却/取消/缓存，§10.2）
// ---------------------------------------------------------------------------

interface MockProvider extends AiProvider {
  calls: number
}

function mockProvider(opts: { hang?: boolean; failFirst?: number; result?: AiDraftResult } = {}): MockProvider {
  let fails = opts.failFirst ?? 0
  const p = {
    id: 'mock' as const,
    calls: 0,
    async searchWord(word: string, signal: AbortSignal): Promise<AiDraftResult> {
      p.calls += 1
      if (opts.hang) {
        return new Promise<AiDraftResult>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        })
      }
      if (fails > 0) {
        fails -= 1
        throw new Error('network boom')
      }
      await new Promise((r) => setTimeout(r, 1))
      return opts.result ?? draft(word)
    }
  }
  return p
}

function makeService(opts: {
  provider?: MockProvider
  getConfig?: () => { apiKey: string; baseURL: string; model: string } | null
  timeoutMs?: number
  cooldownMs?: number
} = {}): { svc: AiService; provider: MockProvider; modes: AiMode[] } {
  const provider = opts.provider ?? mockProvider()
  const modes: AiMode[] = []
  const svc = createAiService({
    cacheDir: makeDir(),
    getProviderConfig: opts.getConfig ?? (() => ({ apiKey: 'sk-test', baseURL: 'https://x/v1', model: 'm' })),
    onAiModeChange: (m) => modes.push(m),
    timeoutMs: opts.timeoutMs ?? 5000,
    cooldownMs: opts.cooldownMs ?? 100,
    cacheMax: 200,
    logger: { info: () => {}, warn: () => {}, error: () => {} }
  })
  svc._setProviderForTest?.(provider)
  return { svc, provider, modes }
}

describe('createAiService', () => {
  it('无 key → no-key（降级生词本）且 aiMode → disabled', async () => {
    const { svc, modes } = makeService({ getConfig: () => null })
    const r = await svc.searchWord('鞠躬尽瘁')
    expect(r.status).toBe('no-key')
    expect(modes.at(-1)).toBe('disabled')
  })

  it('正常查询 → ok（非缓存），同词二次 → 缓存命中且 provider 不再调用', async () => {
    const { svc, provider } = makeService()
    const r1 = await svc.searchWord('鞠躬尽瘁')
    expect(r1.status).toBe('ok')
    if (r1.status === 'ok') expect(r1.cached).toBe(false)
    expect(provider.calls).toBe(1)

    const r2 = await svc.searchWord('鞠躬尽瘁')
    expect(r2.status).toBe('ok')
    if (r2.status === 'ok') expect(r2.cached).toBe(true)
    expect(provider.calls).toBe(1) // 同词不重复调用
  })

  it('失败自动重试 1 次后成功', async () => {
    const provider = mockProvider({ failFirst: 1 })
    const { svc } = makeService({ provider })
    const r = await svc.searchWord('重试词')
    expect(r.status).toBe('ok')
    expect(provider.calls).toBe(2)
  })

  it('超时（15s 可配）→ timeout；aiMode → error', async () => {
    const provider = mockProvider({ hang: true })
    const { svc, modes } = makeService({ provider, timeoutMs: 60 })
    const r = await svc.searchWord('慢词')
    expect(r.status).toBe('timeout')
    expect(modes.at(-1)).toBe('error')
  })

  it('3s 冷却：冷却期内新词查询 → rate-limited', async () => {
    const { svc, provider } = makeService({ cooldownMs: 5000 })
    await svc.searchWord('词A')
    const r2 = await svc.searchWord('词B') // 不同词（避开缓存）
    expect(r2.status).toBe('rate-limited')
    expect(provider.calls).toBe(1)
  })

  it('stale 防护：同词并发新查询中止旧请求（request token）', async () => {
    const provider = mockProvider({ hang: true })
    const { svc } = makeService({ provider, timeoutMs: 60 })
    const p1 = svc.searchWord('并发词')
    const p2 = svc.searchWord('并发词') // 中止 p1
    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1.status).toBe('error') // 旧请求被替换中止
    expect(r2.status).toBe('timeout') // 新请求自身超时
  })
})
