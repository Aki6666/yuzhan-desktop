/**
 * IPC 路由注册（PLAN.md §4.2 ipc.ts / §10.4）
 *
 * - 权威 channel 清单与类型：shared/ipc/contracts.ts（唯一来源，main/preload/renderer 共用）
 * - 统一信封：{ ok: true, data } | { ok: false, error: { code, message } }
 * - 入参 schema 校验（轻量守卫；T2a 的 ajv 校验针对数据文件，本层管 IPC 入参）
 * - 写操作一律走 store 串行写队列（§10.3#5），禁止在 handler 里直接读改写
 * - 错误码约定：INVALID_ARGS / NOT_FOUND / FILE_CORRUPT / NO_API_KEY / AI_TIMEOUT /
 *   RATE_LIMITED / AI_ERROR / IO_ERROR / UNKNOWN（§4.6）
 * - AI（v0.2）：ai:searchWord 走 aiService（超时/重试/取消/冷却/缓存 LRU，§10.2）；
 *   apiKey 经 settingsService safeStorage 加密（§4.4）；aiMode 迁移持久化到 config.json
 */
import { app, ipcMain, safeStorage } from 'electron'
import { join } from 'node:path'
import {
  IPC_CHANNELS,
  ipcErr,
  ipcOk,
  type AiMode,
  type AppLogRequest,
  type AppSettings,
  type IpcResult,
  type ProgressSaveRequest,
  type ProgressStatus,
  type QuizRecordRequest,
  type SettingsSetRequest
} from '@shared/ipc/contracts'
import { createStorage, type Storage } from './store'
import { createSettingsService } from './settings'
import { createAiService, transitionAiMode, type AiService } from './ai'
import { logger } from './logger'
const PROGRESS_STATUSES: ProgressStatus[] = ['new', 'learning', 'mastered']
const AI_MODES: AiMode[] = ['disabled', 'configured', 'online', 'error']
const LOG_LEVELS: AppLogRequest['level'][] = ['debug', 'info', 'warn', 'error']

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isString(v: unknown): v is string {
  return typeof v === 'string'
}

function fail(code: Parameters<typeof ipcErr>[0], message: string): IpcResult<never> {
  return ipcErr(code, message)
}

/** 构造存储（路径注入：userData 与打包后 data/ 位置） */
function createAppStorage(): Storage {
  const dataDir = app.isPackaged
    ? join(process.resourcesPath, 'data')
    : join(app.getAppPath(), 'data')
  return createStorage({
    userDataDir: app.getPath('userData'),
    dataDir,
    logger: {
      info: (m) => logger.info(m),
      warn: (m) => logger.warn(m),
      error: (m) => logger.error(m)
    }
  })
}

/** 构造 AI 服务（Provider 惰性解析 + aiMode 迁移持久化；§10.2） */
function createAppAiService(
  storage: Storage,
  settingsService: ReturnType<typeof createSettingsService>
): AiService {
  return createAiService({
    cacheDir: join(app.getPath('userData'), 'cache'),
    getProviderConfig: () => {
      const key = settingsService.getApiKey()
      if (!key) return null
      const s = storage.getSettings()
      return { apiKey: key, baseURL: s.aiBaseUrl ?? '', model: s.aiModel ?? '' }
    },
    onAiModeChange: (mode) => {
      // 仅在模式变化时写盘（幂等 no-op 跳过）：避免 fire-and-forget 写入与测试 teardown 竞态
      if (mode !== storage.getSettings().aiMode) {
        void storage.saveSettings({ aiMode: mode })
      }
    },
    logger: {
      info: (m) => logger.info(m),
      warn: (m) => logger.warn(m),
      error: (m) => logger.error(m)
    }
  })
}

export function registerIpcHandlers(): void {
  const storage = createAppStorage()
  const settingsService = createSettingsService({
    userDataDir: app.getPath('userData'),
    safeStorage
  })
  const aiService = createAppAiService(storage, settingsService)

  // 启动推导 aiMode（§10.2）：有 key 且当前 disabled → configured；无 key → disabled
  {
    const hasKey = settingsService.hasApiKey()
    const current = storage.getSettings().aiMode
    const desired = hasKey ? transitionAiMode(current, 'key-set') : 'disabled'
    if (desired !== current) void storage.saveSettings({ aiMode: desired })
  }

  // data:list — 启动一次性全量（§10.4 策略：过滤/搜索在 renderer 内存完成）
  ipcMain.handle(IPC_CHANNELS.dataList, (): IpcResult<ReturnType<Storage['listOfficial']>> => {
    try {
      return ipcOk(storage.listOfficial())
    } catch (e) {
      logger.error(`[ipc] data:list 失败: ${String(e)}`)
      return fail('IO_ERROR', '正式库加载失败')
    }
  })

  // data:get — 单条（详情页/快速输入命中展示）
  ipcMain.handle(IPC_CHANNELS.dataGet, (_e, id: unknown): IpcResult<unknown> => {
    if (!isString(id) || id.length === 0) return fail('INVALID_ARGS', 'id 必须为非空字符串')
    const item = storage.getOfficial(id)
    return ipcOk(item ?? null)
  })

  // progress:save — 进度写入（renderer 节流 ≤1 次/2s，本侧串行队列兜底）
  ipcMain.handle(IPC_CHANNELS.progressSave, async (_e, payload: unknown): Promise<IpcResult<null>> => {
    const err = validateProgressSave(payload)
    if (err) return err
    try {
      await storage.saveProgress(payload as ProgressSaveRequest)
      return ipcOk(null)
    } catch (e) {
      logger.error(`[ipc] progress:save 失败: ${String(e)}`)
      return fail('IO_ERROR', '进度写入失败')
    }
  })

  // pending:list / add / remove — 生词本（即时写）
  ipcMain.handle(IPC_CHANNELS.pendingList, (): IpcResult<unknown> => {
    try {
      return ipcOk(storage.listPending())
    } catch (e) {
      logger.error(`[ipc] pending:list 失败: ${String(e)}`)
      return fail('IO_ERROR', '生词本读取失败')
    }
  })

  ipcMain.handle(IPC_CHANNELS.pendingAdd, async (_e, word: unknown): Promise<IpcResult<null>> => {
    if (!isString(word) || word.trim().length === 0) return fail('INVALID_ARGS', 'word 必须为非空字符串')
    try {
      await storage.addPending(word)
      return ipcOk(null)
    } catch (e) {
      logger.error(`[ipc] pending:add 失败: ${String(e)}`)
      return fail('IO_ERROR', '生词本写入失败')
    }
  })

  ipcMain.handle(IPC_CHANNELS.pendingRemove, async (_e, word: unknown): Promise<IpcResult<null>> => {
    if (!isString(word) || word.trim().length === 0) return fail('INVALID_ARGS', 'word 必须为非空字符串')
    try {
      await storage.removePending(word)
      return ipcOk(null)
    } catch (e) {
      logger.error(`[ipc] pending:remove 失败: ${String(e)}`)
      return fail('IO_ERROR', '生词本写入失败')
    }
  })

  // quiz:record — 批量错题记录（一次 10 题，§10.4）
  ipcMain.handle(IPC_CHANNELS.quizRecord, async (_e, payload: unknown): Promise<IpcResult<null>> => {
    const err = validateQuizRecord(payload)
    if (err) return err
    try {
      await storage.recordQuizAnswers((payload as QuizRecordRequest).answers)
      return ipcOk(null)
    } catch (e) {
      logger.error(`[ipc] quiz:record 失败: ${String(e)}`)
      return fail('IO_ERROR', '自测记录写入失败')
    }
  })

  // settings:get / set — 设置读写（apiKey 经 safeStorage 加密，不入 config.json；§4.4）
  ipcMain.handle(IPC_CHANNELS.settingsGet, (): IpcResult<AppSettings> => {
    try {
      return ipcOk({
        ...storage.getSettings(),
        apiKeyMasked: settingsService.getApiKeyMasked(),
        hasApiKey: settingsService.hasApiKey()
      })
    } catch (e) {
      logger.error(`[ipc] settings:get 失败: ${String(e)}`)
      return fail('IO_ERROR', '设置读取失败')
    }
  })

  ipcMain.handle(IPC_CHANNELS.settingsSet, async (_e, patch: unknown): Promise<IpcResult<AppSettings>> => {
    const err = validateSettingsSet(patch)
    if (err) return err
    try {
      const p = patch as SettingsSetRequest
      // apiKey 单独处理：safeStorage 加密存储 + aiMode 迁移（不入 config.json 明文）
      if (p.apiKey !== undefined) {
        await settingsService.setApiKey(p.apiKey || null)
        const nextMode = transitionAiMode(storage.getSettings().aiMode, p.apiKey ? 'key-set' : 'key-cleared')
        await storage.saveSettings({ aiMode: nextMode })
      }
      const updated = await storage.saveSettings({
        ...(p.aiMode !== undefined ? { aiMode: p.aiMode } : {}),
        ...(p.quickInputShortcut !== undefined ? { quickInputShortcut: p.quickInputShortcut } : {}),
        ...(p.aiBaseUrl !== undefined ? { aiBaseUrl: p.aiBaseUrl } : {}),
        ...(p.aiModel !== undefined ? { aiModel: p.aiModel } : {})
      })
      return ipcOk({ ...updated, apiKeyMasked: settingsService.getApiKeyMasked(), hasApiKey: settingsService.hasApiKey() })
    } catch (e) {
      logger.error(`[ipc] settings:set 失败: ${String(e)}`)
      return fail('IO_ERROR', '设置写入失败')
    }
  })

  // ai:searchWord — AI 联网查询（v0.2，§10.2：超时/重试/取消/冷却/缓存；无 key → NO_API_KEY 降级生词本）
  ipcMain.handle(IPC_CHANNELS.aiSearchWord, async (_e, payload: unknown): Promise<IpcResult<unknown>> => {
    const err = validateAiSearchWord(payload)
    if (err) return err
    const { word } = payload as { word: string }
    let result: Awaited<ReturnType<AiService['searchWord']>>
    try {
      result = await aiService.searchWord(word)
    } catch (e) {
      logger.error(`[ipc] ai:searchWord 内部异常: ${String(e)}`)
      return fail('AI_ERROR', 'AI 查询内部错误')
    }
    switch (result.status) {
      case 'ok':
        return ipcOk({ draft: result.data, cached: result.cached })
      case 'no-key':
        return fail('NO_API_KEY', '未配置 API Key（降级为生词本）')
      case 'timeout':
        return fail('AI_TIMEOUT', 'AI 查询超时（15s）')
      case 'rate-limited':
        return fail('RATE_LIMITED', '查询过于频繁（3s 冷却）')
      default:
        return fail('AI_ERROR', result.message || 'AI 查询失败')
    }
  })

  // app:log — renderer 渲染错误转发 main 日志（§4.6）
  ipcMain.handle(IPC_CHANNELS.appLog, (_e, payload: unknown): IpcResult<null> => {
    if (!isRecord(payload) || !LOG_LEVELS.includes(payload.level as AppLogRequest['level']) || !isString(payload.message)) {
      return fail('INVALID_ARGS', 'app:log 入参必须为 { level, message }')
    }
    const { level, message } = payload as unknown as AppLogRequest
    logger[level](`[renderer] ${message}`)
    return ipcOk(null)
  })

  // 恢复事件记录（§4.5#3：损坏回退记日志；UI 一次性提示待 T9 设置页/启动引导消费）
  const recovery = storage.getRecoveryInfo()
  if (recovery.recoveredFromBackup.length > 0) {
    logger.warn(`[store] 已从备份恢复: ${recovery.recoveredFromBackup.join(', ')}`)
  }
  if (recovery.preservedAsCorrupt.length > 0) {
    logger.error(`[store] 数据损坏保留为 .corrupt: ${recovery.preservedAsCorrupt.join(', ')}`)
  }
}

// ---------------------------------------------------------------------------
// 入参校验（轻量守卫；统一 INVALID_ARGS）
// ---------------------------------------------------------------------------

function validateProgressSave(payload: unknown): IpcResult<never> | null {
  if (!isRecord(payload)) return fail('INVALID_ARGS', 'progress:save 入参必须为对象')
  if (!isString(payload.id) || payload.id.length === 0) return fail('INVALID_ARGS', 'id 必须为非空字符串')
  if (payload.status !== undefined && !PROGRESS_STATUSES.includes(payload.status as ProgressStatus)) {
    return fail('INVALID_ARGS', `status 必须为 ${PROGRESS_STATUSES.join('/')}`)
  }
  if (payload.wrongTypes !== undefined && !isRecord(payload.wrongTypes)) {
    return fail('INVALID_ARGS', 'wrongTypes 必须为对象')
  }
  if (payload.wrongTimes !== undefined && (typeof payload.wrongTimes !== 'number' || payload.wrongTimes < 0)) {
    return fail('INVALID_ARGS', 'wrongTimes 必须为非负整数')
  }
  return null
}

function validateQuizRecord(payload: unknown): IpcResult<never> | null {
  if (!isRecord(payload) || !Array.isArray(payload.answers)) return fail('INVALID_ARGS', 'quiz:record 入参必须为 { answers: [...] }')
  for (const a of payload.answers) {
    if (!isRecord(a) || !isString(a.id) || typeof a.correct !== 'boolean') {
      return fail('INVALID_ARGS', 'answers 每项必须为 { id: string, correct: boolean }')
    }
  }
  return null
}

function validateSettingsSet(patch: unknown): IpcResult<never> | null {
  if (!isRecord(patch)) return fail('INVALID_ARGS', 'settings:set 入参必须为对象')
  if (patch.aiMode !== undefined && !AI_MODES.includes(patch.aiMode as AiMode)) {
    return fail('INVALID_ARGS', `aiMode 必须为 ${AI_MODES.join('/')}`)
  }
  if (patch.quickInputShortcut !== undefined && (!isString(patch.quickInputShortcut) || patch.quickInputShortcut.length === 0)) {
    return fail('INVALID_ARGS', 'quickInputShortcut 必须为非空字符串')
  }
  if (patch.apiKey !== undefined && typeof patch.apiKey !== 'string') {
    return fail('INVALID_ARGS', 'apiKey 必须为字符串（空串/空白 = 清除）')
  }
  if (patch.aiBaseUrl !== undefined && (!isString(patch.aiBaseUrl) || patch.aiBaseUrl.length === 0)) {
    return fail('INVALID_ARGS', 'aiBaseUrl 必须为非空字符串')
  }
  if (patch.aiModel !== undefined && (!isString(patch.aiModel) || patch.aiModel.length === 0)) {
    return fail('INVALID_ARGS', 'aiModel 必须为非空字符串')
  }
  return null
}

function validateAiSearchWord(payload: unknown): IpcResult<never> | null {
  if (!isRecord(payload) || !isString(payload.word) || payload.word.trim().length === 0) {
    return fail('INVALID_ARGS', 'ai:searchWord 入参必须为 { word: string }')
  }
  return null
}
