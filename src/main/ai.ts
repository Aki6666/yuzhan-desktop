/**
 * AI 层（PLAN.md §10.2 / §4.2 ai.ts）
 *
 * - Provider 抽象：OpenAI 兼容 / Ollama / mock（供测试），renderer 不感知具体实现
 * - aiMode 四态状态机：disabled / configured / online / error（持久化在 settings，见 ipc.ts 接线）
 * - ai:searchWord 服务：超时 15s、失败自动重试 1 次、AbortSignal + request token 取消（防 stale）、
 *   查询 3s 冷却、缓存 userData/cache/ LRU 200（同词不重复调用、离线可看上次结果）
 * - 纯 Node（无 electron 依赖，fetch 用全局），可单测（tests/ai.test.ts）
 */
import { createHash } from 'node:crypto'
import { promises as fsp } from 'node:fs'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AiDraftResult, AiMode, Emotion, Register } from '@shared/ipc/contracts'

// ---------------------------------------------------------------------------
// aiMode 状态机（§10.2 四态）
// ---------------------------------------------------------------------------

export type AiModeEvent =
  | 'key-set' // 配置 apiKey
  | 'key-cleared' // 清除 apiKey
  | 'query-success' // 查询成功
  | 'query-failure' // 查询失败（超时/限流/网络/解析）
  | 'startup' // 启动推导（按 key 存在性）

/** 四态迁移（纯函数）：disabled→configured→online / error（§10.2） */
export function transitionAiMode(current: AiMode, event: AiModeEvent): AiMode {
  switch (event) {
    case 'key-set':
      return current === 'online' || current === 'configured' ? current : 'configured'
    case 'key-cleared':
      return 'disabled'
    case 'query-success':
      return 'online'
    case 'query-failure':
      return 'error'
    case 'startup':
      return current // 启动时按 key 存在性由调用方决定（本函数保留当前态）
    default:
      return current
  }
}

// ---------------------------------------------------------------------------
// Provider 抽象（§10.2）
// ---------------------------------------------------------------------------

export interface AiProvider {
  readonly id: 'openai' | 'ollama' | 'mock'
  /** 查询成语草稿（结构化）；signal 用于取消 */
  searchWord(word: string, signal: AbortSignal): Promise<AiDraftResult>
}

export interface AiProviderConfig {
  apiKey: string
  baseURL: string
  model: string
}

/** AI 输出 → AiDraftResult 的宽松校验/清洗（§9.3：缺字段标记不丢原文） */
export function sanitizeDraft(raw: unknown): AiDraftResult | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.word !== 'string' || r.word.length === 0) return null
  const emotions: Emotion[] = ['褒', '贬', '中性']
  const registers: Register[] = ['谦辞', '敬辞', '无']
  return {
    word: r.word,
    meaning: typeof r.meaning === 'string' ? r.meaning : '',
    origin: typeof r.origin === 'string' ? r.origin : undefined,
    usage: typeof r.usage === 'string' ? r.usage : undefined,
    emotion: emotions.includes(r.emotion as Emotion) ? (r.emotion as Emotion) : '中性',
    register: registers.includes(r.register as Register) ? (r.register as Register) : '无',
    errorTypes: Array.isArray(r.errorTypes) ? r.errorTypes.filter((x) => typeof x === 'string') : [],
    near: Array.isArray(r.near)
      ? r.near.filter(
          (x): x is { word: string; diff: string } =>
            typeof x === 'object' && x !== null && typeof (x as { word?: unknown }).word === 'string'
        )
      : undefined,
    opposite: Array.isArray(r.opposite) ? r.opposite.filter((x) => typeof x === 'string') : undefined,
    examples: Array.isArray(r.examples)
      ? r.examples.filter((x) => typeof x === 'object' && x !== null && typeof (x as { text?: unknown }).text === 'string')
      : undefined,
    frequency:
      typeof r.frequency === 'number' && r.frequency >= 1 && r.frequency <= 5 ? r.frequency : 3,
    tags: Array.isArray(r.tags) ? r.tags.filter((x) => typeof x === 'string') : undefined
  }
}

/** 从 LLM 响应文本提取 JSON（容错：剥掉 ```json 围栏与前后噪声） */
export function extractJson(text: string): unknown {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenced ? fenced[1] : trimmed
  try {
    return JSON.parse(candidate)
  } catch {
    // 尝试截取第一个 { 到最后一个 }
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

/** 构建 Provider（mock 供测试/离线；openai/ollama 走 fetch，§10.2） */
export function createProvider(type: AiProvider['id'], config: AiProviderConfig): AiProvider {
  if (type === 'mock') {
    return {
      id: 'mock',
      async searchWord(word: string, signal: AbortSignal): Promise<AiDraftResult> {
        await delay(10, signal)
        return {
          word,
          meaning: `【mock】${word} 的考试语境释义（测试用）`,
          emotion: '中性',
          register: '无',
          errorTypes: ['望文生义'],
          frequency: 3
        }
      }
    }
  }

  const isOllama = type === 'ollama'
  const endpoint = isOllama ? `${config.baseURL}/api/chat` : `${config.baseURL}/chat/completions`

  return {
    id: type,
    async searchWord(word: string, signal: AbortSignal): Promise<AiDraftResult> {
      const body = isOllama
        ? JSON.stringify({
            model: config.model,
            messages: [{ role: 'user', content: buildPrompt(word) }],
            stream: false
          })
        : JSON.stringify({
            model: config.model,
            messages: [
              { role: 'system', content: buildSystemPrompt() },
              { role: 'user', content: word }
            ],
            temperature: 0.2
          })
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (!isOllama) headers.Authorization = `Bearer ${config.apiKey}`
      const res = await fetch(endpoint, { method: 'POST', headers, body, signal })
      if (!res.ok) {
        throw new Error(`AI HTTP ${res.status}: ${res.statusText}`)
      }
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[]
        message?: { content?: string }
      }
      const content = isOllama ? json.message?.content : json.choices?.[0]?.message?.content
      if (typeof content !== 'string') throw new Error('AI 响应缺少 content')
      const draft = sanitizeDraft(extractJson(content))
      if (!draft) throw new Error('AI 响应无法解析为草稿词条')
      return draft
    }
  }
}

const SYSTEM_PROMPT = `你是资深公考言语教研员。用户输入一个成语，请输出 JSON（仅 JSON，无其他文字）：
{"word":"成语","meaning":"考试语境释义，多义项用；分隔","origin":"出处（可空）","usage":"适用对象/语境（可空）","emotion":"褒|贬|中性","register":"谦辞|敬辞|无","errorTypes":["按 §5.2 误用类型判定表，0-2 类"],"near":[{"word":"近义词","diff":"一句话核心区别"}],"opposite":["反义"],"examples":[{"text":"例句","exam":"卷别（真题必带，不可编造；自造可空）","kind":"exam|made"}],"frequency":1-5,"tags":["主题"]}
真题例句必须来自真实语料，无法确认时 examples 留空，禁止编造。`

function buildSystemPrompt(): string {
  return SYSTEM_PROMPT
}

function buildPrompt(word: string): string {
  return word
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new DOMException('Aborted', 'AbortError'))
    })
  })
}

// ---------------------------------------------------------------------------
// 缓存（userData/cache/，LRU 200，§10.2）
// ---------------------------------------------------------------------------

export interface AiCache {
  get(word: string): AiDraftResult | null
  set(word: string, result: AiDraftResult): void
  size(): number
  /** 超限清理（保留最近 max 条，按 mtime） */
  prune(max: number): void
}

interface CacheEntry {
  word: string
  savedAt: string
  data: AiDraftResult
}

function cacheFileName(word: string): string {
  return `${createHash('sha1').update(word).digest('hex')}.json`
}

export function createAiCache(cacheDir: string, maxEntries = 200): AiCache {
  mkdirSync(cacheDir, { recursive: true })

  function readEntry(word: string): AiDraftResult | null {
    const file = join(cacheDir, cacheFileName(word))
    if (!existsSync(file)) return null
    try {
      const entry = JSON.parse(readFileSync(file, 'utf8')) as CacheEntry
      if (!entry?.data || typeof entry.data.word !== 'string') return null
      // touch：更新 mtime 维持 LRU
      const now = new Date()
      writeFileSync(file, JSON.stringify({ ...entry, savedAt: now.toISOString() }, null, 2))
      return entry.data
    } catch {
      // 损坏缓存：同步删除并视为未命中（清理立即可见，测试/后续读取一致）
      try {
        rmSync(file, { force: true })
      } catch {
        /* 忽略删除失败 */
      }
      return null
    }
  }

  return {
    get(word: string): AiDraftResult | null {
      return readEntry(word)
    },

    set(word: string, result: AiDraftResult): void {
      const file = join(cacheDir, cacheFileName(word))
      const entry: CacheEntry = { word, savedAt: new Date().toISOString(), data: result }
      const tmp = `${file}.tmp`
      writeFileSync(tmp, JSON.stringify(entry, null, 2), 'utf8')
      renameSync(tmp, file)
      // 缓存级兜底：超限即清理（LRU，§10.2）
      this.prune(maxEntries)
    },

    size(): number {
      try {
        return readdirSync(cacheDir).filter((f) => f.endsWith('.json')).length
      } catch {
        return 0
      }
    },

    prune(max: number): void {
      let entries: string[]
      try {
        entries = readdirSync(cacheDir).filter((f) => f.endsWith('.json'))
      } catch {
        return
      }
      if (entries.length <= max) return
      const withMtime = entries
        .map((f) => {
          try {
            return { f, m: statSync(join(cacheDir, f)).mtimeMs }
          } catch {
            return null
          }
        })
        .filter((x): x is { f: string; m: number } => x !== null)
        // 同毫秒写入时按文件名 tiebreak，保证确定性清理
        .sort((a, b) => (a.m - b.m) || (a.f < b.f ? -1 : 1))
      const overflow = withMtime.length - max
      for (let i = 0; i < overflow; i++) {
        void fsp.rm(join(cacheDir, withMtime[i].f), { force: true }).catch(() => {})
      }
    }
  }
}

// ---------------------------------------------------------------------------
// AI 服务（超时/重试/取消/冷却 + 缓存，§10.2）
// ---------------------------------------------------------------------------

export interface AiServiceConfig {
  cacheDir: string
  /** 当前 provider 配置（动态读取，key 变更即生效） */
  getProviderConfig: () => AiProviderConfig | null
  /** aiMode 迁移回调（persist 到 settings） */
  onAiModeChange: (mode: AiMode) => void
  timeoutMs?: number
  cooldownMs?: number
  cacheMax?: number
  logger?: { info(msg: string): void; warn(msg: string): void; error(msg: string): void }
}

export type AiServiceResult =
  | { status: 'ok'; data: AiDraftResult; cached: boolean }
  | { status: 'no-key' }
  | { status: 'timeout' }
  | { status: 'rate-limited' }
  | { status: 'error'; message: string }

export interface AiService {
  searchWord(word: string): Promise<AiServiceResult>
  getCacheSize(): number
  /** 注入 provider（测试用；生产由 createProvider 构建） */
  _setProviderForTest?: (p: AiProvider) => void
}

const silentLogger = { info: () => {}, warn: () => {}, error: () => {} }

export function createAiService(config: AiServiceConfig): AiService {
  const timeoutMs = config.timeoutMs ?? 15000
  const cooldownMs = config.cooldownMs ?? 3000
  const cacheMax = config.cacheMax ?? 200
  const logger = config.logger ?? silentLogger
  const cache = createAiCache(config.cacheDir, cacheMax)

  let testProvider: AiProvider | null = null
  let lastQueryAt = 0
  /** 同词在途请求（stale 防护：新请求中止旧请求） */
  const inFlight = new Map<string, AbortController>()

  function resolveProvider(): AiProvider | null {
    if (testProvider) return testProvider
    const cfg = config.getProviderConfig()
    if (!cfg) return null
    // 按 baseURL/model 惰性构建（配置变更生效）
    return createProvider(cfg.baseURL.includes('ollama') || cfg.baseURL.includes(':11434') ? 'ollama' : 'openai', cfg)
  }

  async function attempt(word: string, signal: AbortSignal, retriesLeft: number): Promise<AiDraftResult> {
    const p = resolveProvider()
    if (!p) throw new Error('provider 不可用')
    try {
      return await p.searchWord(word, signal)
    } catch (e) {
      const aborted = signal.aborted
      if (!aborted && retriesLeft > 0 && !isTimeoutError(e)) {
        logger.warn(`[ai] 查询失败，重试剩余 ${retriesLeft}: ${String(e)}`)
        return attempt(word, signal, retriesLeft - 1)
      }
      throw e
    }
  }

  return {
    async searchWord(word: string): Promise<AiServiceResult> {
      const trimmed = word.trim()
      if (!trimmed) return { status: 'error', message: '空查询' }

      const cfg = config.getProviderConfig()
      if (!cfg) {
        config.onAiModeChange('disabled')
        return { status: 'no-key' }
      }

      // 缓存命中：同词不重复调用、离线可看上次结果（§10.2；缓存读不受冷却限制）
      const cached = cache.get(trimmed)
      if (cached) {
        config.onAiModeChange('online')
        return { status: 'ok', data: cached, cached: true }
      }

      // 冷却（查询按钮 3s 冷却，§10.2）
      const now = Date.now()
      if (now - lastQueryAt < cooldownMs) {
        config.onAiModeChange('error')
        return { status: 'rate-limited' }
      }

      // stale 防护：同词新请求中止旧请求（§10.2 request token）
      inFlight.get(trimmed)?.abort()
      const controller = new AbortController()
      inFlight.set(trimmed, controller)

      // 超时 15s（timedOut 标志区分「超时中止」与「新请求替换中止」）
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        controller.abort()
      }, timeoutMs)
      try {
        const data = await attempt(trimmed, controller.signal, 1)
        cache.set(trimmed, data)
        cache.prune(cacheMax)
        lastQueryAt = Date.now()
        config.onAiModeChange('online')
        return { status: 'ok', data, cached: false }
      } catch (e) {
        lastQueryAt = Date.now()
        config.onAiModeChange('error')
        if (timedOut) return { status: 'timeout' }
        if (isAbortError(e)) {
          // 被新请求中止：非用户可感知错误
          return { status: 'error', message: '已取消（新查询替换）' }
        }
        return { status: 'error', message: String(e) }
      } finally {
        clearTimeout(timer)
        inFlight.delete(trimmed)
      }
    },

    getCacheSize(): number {
      return cache.size()
    },

    _setProviderForTest(p: AiProvider): void {
      testProvider = p
    }
  }
}

function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError'
}

function isTimeoutError(e: unknown): boolean {
  // 超时由 AbortController 触发，不进入重试
  return e instanceof DOMException && e.name === 'AbortError'
}
