/**
 * 数据访问层（PLAN.md §4.2 store.ts / §4.5 / §10.3 持久化铁律）
 *
 * 铁律落实：
 * 1. 原子写：写 *.tmp → fs.rename 替换
 * 2. 每次写入前保留 .bak（保留最近一份）
 * 3. 启动 JSON.parse 校验全部 userData 文件，损坏自动回退 .bak 并记日志；
 *    .bak 也损坏时保留原始文件为 *.corrupt（不静默清空用户数据，§10.3#2）
 * 4. 单实例锁由 app.requestSingleInstanceLock()（src/main/index.ts）保证，本模块为进程内单例
 * 5. 串行写队列 + 同 key（文件）防抖合并——ipcMain.handle 异步并发，禁止在 handler 里直接读改写（§10.3#5）
 *
 * 本模块不依赖 electron（路径注入），可被 tests/store.test.ts 直接单测（AC-08/AC-09）。
 */
import { promises as fsp } from 'node:fs'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync
} from 'node:fs'
import { join } from 'node:path'
import type {
  AppSettings,
  Idiom,
  PendingItem,
  ProgressSaveRequest,
  QuizAnswer,
  ReviewState,
  SettingsSetRequest,
  UserProgress
} from '@shared/ipc/contracts'
import { DEFAULT_AI_BASE_URL, DEFAULT_AI_MODEL } from '@shared/ipc/contracts'

// ---------------------------------------------------------------------------
// 日志接口（由调用方注入；生产接 electron-log，测试可静默）
// ---------------------------------------------------------------------------

export interface StorageLogger {
  info(message: string): void
  warn(message: string): void
  error(message: string): void
}

const silentLogger: StorageLogger = {
  info: () => {},
  warn: () => {},
  error: () => {}
}

// ---------------------------------------------------------------------------
// 串行写队列（§10.3#5：串行 + 同 key 防抖合并）
// 所有写路径收敛到此：同 key 只保留一个待执行写任务（最终写最新内存快照），任务串行执行。
// ---------------------------------------------------------------------------

class WriteQueue {
  private chain: Promise<void> = Promise.resolve()
  private pending = new Set<string>()

  /** 入队写任务：同 key 已在队列则跳过（防抖合并，最新快照由 write 闭包读取） */
  enqueue(key: string, write: () => Promise<void>): Promise<void> {
    if (this.pending.has(key)) return this.chain
    this.pending.add(key)
    const run = this.chain.then(async () => {
      this.pending.delete(key)
      await write()
    })
    // 链上吞错防断裂；错误由 run 自身 promise 上抛给调用方
    this.chain = run.catch(() => {})
    return run
  }

  /** 等待队列排空（闪卡/自测结束时强制 flush 用） */
  flush(): Promise<void> {
    return this.chain
  }
}

// ---------------------------------------------------------------------------
// 恢复信息（§3.4 一次性提示「已从备份恢复最近数据」；ipc 层可读取）
// ---------------------------------------------------------------------------

export interface RecoveryInfo {
  /** 从 .bak 恢复的文件（basename 列表） */
  recoveredFromBackup: string[]
  /** 保留为 *.corrupt 的文件（basename 列表） */
  preservedAsCorrupt: string[]
  /** 是否存在恢复事件 */
  hasRecovery: boolean
}

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function defaultSettings(): AppSettings {
  return {
    schemaVersion: 1,
    aiMode: 'disabled',
    quickInputShortcut: 'CommandOrControl+K',
    aiBaseUrl: DEFAULT_AI_BASE_URL,
    aiModel: DEFAULT_AI_MODEL
  }
}

/** SM-2 调度默认值（v0.2，§5.6）：due=now、interval=0、ease=2.5 */
function defaultReview(): ReviewState {
  return { interval: 0, ease: 2.5, due: today() }
}

function defaultProgress(id: string): UserProgress {
  return { id, status: 'new', wrongTimes: 0, wrongTypes: {}, review: defaultReview() }
}// ---------------------------------------------------------------------------
// 存储实现
// ---------------------------------------------------------------------------

export interface StorageOptions {
  /** userData 目录（progress.json / pending.json / config.json 所在） */
  userDataDir: string
  /** 正式库目录（只读；含 idioms/ 与 scripts/，打包进 asar） */
  dataDir: string
  logger?: StorageLogger
}

export interface Storage {
  // 正式库（只读，§4.1）
  listOfficial(): { items: Idiom[]; version: string }
  getOfficial(id: string): Idiom | null
  // 进度（§5.6）
  getProgress(): Record<string, UserProgress>
  getProgressItem(id: string): UserProgress | undefined
  saveProgress(payload: ProgressSaveRequest): Promise<void>
  recordQuizAnswers(answers: QuizAnswer[]): Promise<void>
  // 生词本（§5.6）
  listPending(): PendingItem[]
  addPending(word: string): Promise<void>
  removePending(word: string): Promise<void>
  // 设置（§5.6 config.json）
  getSettings(): AppSettings
  saveSettings(patch: SettingsSetRequest): Promise<AppSettings>
  // 恢复信息（§3.4 UI 一次性提示）
  getRecoveryInfo(): RecoveryInfo
  // 等待所有写队列排空
  flush(): Promise<void>
}

export function createStorage(options: StorageOptions): Storage {
  const { userDataDir, dataDir } = options
  const logger = options.logger ?? silentLogger
  const queue = new WriteQueue()

  mkdirSync(userDataDir, { recursive: true })

  // -------------------------------------------------------------------------
  // 文件级读写（原子写 + .bak）
  // -------------------------------------------------------------------------

  async function atomicWriteJson(fileName: string, data: unknown): Promise<void> {
    const filePath = join(userDataDir, fileName)
    const tmpPath = `${filePath}.tmp`
    const json = JSON.stringify(data, null, 2)
    if (existsSync(filePath)) {
      copyFileSync(filePath, `${filePath}.bak`) // 写入前保留最近一份 .bak
    }
    await fsp.writeFile(tmpPath, json, 'utf8') // 原子写第一步：写 tmp
    await fsp.rename(tmpPath, filePath) // 原子写第二步：rename 替换
  }

  /**
   * 启动校验加载（§4.5#3 / §10.3#3）：
   * 1) 主文件 JSON.parse 通过 → 正常
   * 2) 损坏且 .bak 可解析 → 回退 .bak（覆盖主文件）并记录
   * 3) 损坏且无可用 .bak → 主文件保留为 *.corrupt，返回 fallback（不静默清空）
   */
  function loadJsonWithRecovery<T>(fileName: string, fallback: T): { data: T; recovery: Partial<RecoveryInfo> } {
    const filePath = join(userDataDir, fileName)
    const bakPath = `${filePath}.bak`
    const recovery: Partial<RecoveryInfo> = { recoveredFromBackup: [], preservedAsCorrupt: [] }

    if (!existsSync(filePath)) return { data: fallback, recovery }

    const parse = (p: string): T | null => {
      try {
        return JSON.parse(readFileSync(p, 'utf8')) as T
      } catch {
        return null
      }
    }

    const main = parse(filePath)
    if (main !== null) return { data: main, recovery }

    // 主文件损坏 → 尝试 .bak
    const bak = existsSync(bakPath) ? parse(bakPath) : null
    if (bak !== null) {
      copyFileSync(bakPath, filePath) // 回退
      recovery.recoveredFromBackup = [fileName]
      logger.warn(`[store] ${fileName} 损坏，已从 ${fileName}.bak 回退`)
      return { data: bak, recovery }
    }

    // .bak 也损坏/缺失 → 保留原始为 .corrupt（§10.3#2）
    try {
      renameSync(filePath, `${filePath}.corrupt`)
    } catch {
      logger.error(`[store] ${fileName} 保留 .corrupt 失败`)
    }
    recovery.preservedAsCorrupt = [fileName]
    logger.error(`[store] ${fileName} 与 .bak 均损坏，原始保留为 ${fileName}.corrupt，按空数据启动`)
    return { data: fallback, recovery }
  }

  /** 清理残留 *.tmp（上次写入中断遗留） */
  function cleanupStaleTmp(): void {
    for (const name of ['progress.json', 'pending.json', 'config.json']) {
      const tmp = join(userDataDir, `${name}.tmp`)
      if (existsSync(tmp)) {
        try {
          renameSync(tmp, join(userDataDir, `${name}.tmp.stale`))
          logger.warn(`[store] 清理残留 ${name}.tmp`)
        } catch {
          /* 忽略 */
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // 启动加载（校验 + 回退 + .corrupt 保留）
  // -------------------------------------------------------------------------

  cleanupStaleTmp()

  const recoveryInfo: RecoveryInfo = { recoveredFromBackup: [], preservedAsCorrupt: [], hasRecovery: false }

  const progressFile = loadJsonWithRecovery<Record<string, UserProgress>>('progress.json', {})
  let progress = progressFile.data
  mergeRecovery(progressFile.recovery)

  const pendingFile = loadJsonWithRecovery<PendingItem[]>('pending.json', [])
  let pending = Array.isArray(pendingFile.data) ? pendingFile.data : []
  mergeRecovery(pendingFile.recovery)

  const settingsFile = loadJsonWithRecovery<AppSettings>('config.json', defaultSettings())
  let settings = sanitizeSettings(settingsFile.data)
  mergeRecovery(settingsFile.recovery)

  // -------------------------------------------------------------------------
  // SM-2 迁移（v0.2，§5.6）：旧记录无 review 字段 → 启动补默认值
  // （due=now / interval=0 / ease=2.5），幂等（有 review 即跳过）+ 日志 + 落盘。
  // 对回退 .bak 恢复出的数据同样生效；持久化铁律（原子写/队列）不变。
  // -------------------------------------------------------------------------
  let migratedCount = 0
  for (const item of Object.values(progress)) {
    if (item && typeof item === 'object' && !item.review) {
      item.review = defaultReview()
      migratedCount += 1
    }
  }
  if (migratedCount > 0) {
    logger.info(`[store] progress.json 迁移：${migratedCount} 条旧记录补 SM-2 默认字段（due=now/interval=0/ease=2.5）`)
    // 迁移结果落盘（幂等：下次启动 review 已存在跳过）；失败仅记日志（幂等可重试，不产生未处理拒绝）
    void queue
      .enqueue('progress.json', () => atomicWriteJson('progress.json', progress))
      .catch((e) => logger.error(`[store] SM-2 迁移落盘失败（幂等，下次启动重试）: ${String(e)}`))
  }

  function mergeRecovery(partial: Partial<RecoveryInfo>): void {
    if (partial.recoveredFromBackup?.length) {
      recoveryInfo.recoveredFromBackup.push(...partial.recoveredFromBackup)
    }
    if (partial.preservedAsCorrupt?.length) {
      recoveryInfo.preservedAsCorrupt.push(...partial.preservedAsCorrupt)
    }
    recoveryInfo.hasRecovery =
      recoveryInfo.recoveredFromBackup.length > 0 || recoveryInfo.preservedAsCorrupt.length > 0
  }

  function sanitizeSettings(raw: AppSettings): AppSettings {
    const def = defaultSettings()
    if (!raw || typeof raw !== 'object') return def
    const aiMode =
      raw.aiMode === 'disabled' || raw.aiMode === 'configured' || raw.aiMode === 'online' || raw.aiMode === 'error'
        ? raw.aiMode
        : def.aiMode
    return {
      schemaVersion: typeof raw.schemaVersion === 'number' ? raw.schemaVersion : def.schemaVersion,
      aiMode,
      quickInputShortcut:
        typeof raw.quickInputShortcut === 'string' && raw.quickInputShortcut.length > 0
          ? raw.quickInputShortcut
          : def.quickInputShortcut,
      aiBaseUrl: typeof raw.aiBaseUrl === 'string' && raw.aiBaseUrl.length > 0 ? raw.aiBaseUrl : def.aiBaseUrl,
      aiModel: typeof raw.aiModel === 'string' && raw.aiModel.length > 0 ? raw.aiModel : def.aiModel
    }
  }

  // -------------------------------------------------------------------------
  // 正式库（只读，data/idioms/**/*.json，§5.5 按首字拼音分区）
  // -------------------------------------------------------------------------

  let officialCache: { items: Idiom[]; version: string } | null = null

  function loadOfficial(): { items: Idiom[]; version: string } {
    if (officialCache) return officialCache
    const items: Idiom[] = []
    let version = '0.0.0'

    const idiomsDir = join(dataDir, 'idioms')
    if (existsSync(idiomsDir)) {
      collectJsonFiles(idiomsDir, (filePath, baseName) => {
        // 词表文件非词条（§5.3）
        if (baseName === 'tags.json' || baseName === 'exams.json') return
        try {
          const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as Idiom
          if (parsed && typeof parsed.id === 'string' && typeof parsed.word === 'string') {
            items.push(parsed)
          }
        } catch {
          logger.warn(`[store] 跳过无法解析的词条文件: ${filePath}`)
        }
      })
    }

    // 语料快照版本（§5.4）
    try {
      const corpusFile = join(dataDir, 'scripts', 'corpus-version.json')
      if (existsSync(corpusFile)) {
        const corpus = JSON.parse(readFileSync(corpusFile, 'utf8')) as { corpus?: string; version?: string }
        version = corpus?.corpus ?? corpus?.version ?? '0.0.0'
      }
    } catch {
      /* 版本缺失走兜底 */
    }

    items.sort((a, b) => (a.id < b.id ? -1 : 1))
    officialCache = { items, version }
    return officialCache
  }

  function collectJsonFiles(dir: string, onFile: (filePath: string, baseName: string) => void): void {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(dir, entry)
      let stat
      try {
        stat = statSync(full)
      } catch {
        continue
      }
      if (stat.isDirectory()) {
        collectJsonFiles(full, onFile)
      } else if (entry.endsWith('.json')) {
        onFile(full, entry)
      }
    }
  }

  // -------------------------------------------------------------------------
  // 对外 API
  // -------------------------------------------------------------------------

  return {
    listOfficial() {
      return loadOfficial()
    },

    getOfficial(id: string): Idiom | null {
      return loadOfficial().items.find((i) => i.id === id) ?? null
    },

    getProgress() {
      return progress
    },

    getProgressItem(id: string): UserProgress | undefined {
      return progress[id]
    },

    async saveProgress(payload: ProgressSaveRequest): Promise<void> {
      const id = payload.id
      const current = progress[id] ?? defaultProgress(id)
      const next: UserProgress = { ...current }
      if (payload.status) next.status = payload.status
      if (payload.wrongTypes) next.wrongTypes = { ...current.wrongTypes, ...payload.wrongTypes }
      if (payload.wrongTimes !== undefined) next.wrongTimes = payload.wrongTimes
      // SM-2 调度字段 patch 合并（v0.2，§5.6）
      if (payload.review) {
        next.review = { ...(current.review ?? defaultReview()), ...payload.review }
      }
      next.lastSeen = today()
      progress = { ...progress, [id]: next } // 先改内存快照，再入队写盘
      return queue.enqueue('progress.json', () => atomicWriteJson('progress.json', progress))
    },

    async recordQuizAnswers(answers: QuizAnswer[]): Promise<void> {
      let changed = false
      for (const answer of answers) {
        if (answer.correct) continue
        const current = progress[answer.id] ?? defaultProgress(answer.id)
        const next: UserProgress = {
          ...current,
          status: current.status === 'mastered' ? 'learning' : current.status, // 答错降级（§3.3）
          wrongTimes: current.wrongTimes + 1,
          lastSeen: today()
        }
        progress = { ...progress, [answer.id]: next }
        changed = true
      }
      if (changed) {
        return queue.enqueue('progress.json', () => atomicWriteJson('progress.json', progress))
      }
    },

    listPending(): PendingItem[] {
      return pending
    },

    async addPending(word: string): Promise<void> {
      const trimmed = word.trim()
      if (!trimmed) return
      if (!pending.some((p) => p.word === trimmed)) {
        pending = [...pending, { word: trimmed, addedAt: new Date().toISOString() }]
        return queue.enqueue('pending.json', () => atomicWriteJson('pending.json', pending))
      }
    },

    async removePending(word: string): Promise<void> {
      const next = pending.filter((p) => p.word !== word.trim())
      if (next.length !== pending.length) {
        pending = next
        return queue.enqueue('pending.json', () => atomicWriteJson('pending.json', pending))
      }
    },

    getSettings(): AppSettings {
      return settings
    },

    async saveSettings(patch: SettingsSetRequest): Promise<AppSettings> {
      const next: AppSettings = {
        ...settings,
        ...(patch.aiMode !== undefined ? { aiMode: patch.aiMode } : {}),
        ...(patch.quickInputShortcut !== undefined ? { quickInputShortcut: patch.quickInputShortcut } : {}),
        ...(patch.aiBaseUrl !== undefined ? { aiBaseUrl: patch.aiBaseUrl } : {}),
        ...(patch.aiModel !== undefined ? { aiModel: patch.aiModel } : {})
      }
      const sanitized = sanitizeSettings(next)
      // 幂等 no-op：内容无变化不写盘（避免无意义队列写入与 teardown 竞态）
      if (JSON.stringify(sanitized) === JSON.stringify(settings)) {
        return settings
      }
      settings = sanitized
      await queue.enqueue('config.json', () => atomicWriteJson('config.json', settings))
      return settings
    },

    getRecoveryInfo(): RecoveryInfo {
      return recoveryInfo
    },

    flush(): Promise<void> {
      return queue.flush()
    }
  }
}
