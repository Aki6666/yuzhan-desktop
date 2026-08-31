/**
 * IPC 契约单一权威源（PLAN.md §10.4 / §4.4）
 *
 * - channel 常量：§10.4 权威清单（本文件为唯一出处，main/preload/renderer 引用同一份，防契约漂移）
 * - 统一信封：{ ok: true, data } | { ok: false, error: { code, message } }
 * - 领域类型与 §5.1（Idiom）/ §5.6（UserProgress/PendingItem）对齐；
 *   JSON Schema 严格校验见 shared/schemas（T2a，validate:data 用），本文件为 TS 侧类型契约
 */

// ---------------------------------------------------------------------------
// 领域类型
// ---------------------------------------------------------------------------

export type Emotion = '褒' | '贬' | '中性'
export type Register = '谦辞' | '敬辞' | '无'
export type Quality = 'draft' | 'user' | 'reviewed'
export type Library = 'official' | 'user'
export type ExampleKind = 'exam' | 'made'

export interface NearItem {
  word: string
  diff: string
}

export interface ExampleItem {
  text: string
  /** kind=exam 必带卷别（引用 exams.json，§5.7#3）；kind=made 可空 */
  exam?: string
  kind: ExampleKind
}

/** 成语词条（§5.1，与 shared/schemas/idiom.schema.json 的 idiomProperties 对齐） */
export interface Idiom {
  schemaVersion: number
  /** 拼音 slug + 两位序号，如 ju-gong-jin-cui-01（§5.5） */
  id: string
  word: string
  /** 全拼（带声调），如 jū gōng jìn cuì */
  pinyin: string
  /** 考试语境释义；多义项用「；」分隔 */
  meaning: string
  origin?: string
  usage?: string
  emotion: Emotion
  register: Register
  near?: NearItem[]
  opposite?: string[]
  errorTypes: string[]
  examples?: ExampleItem[]
  /** 真题频次分档 1–5（§5.4） */
  frequency: number
  exams?: string[]
  tags?: string[]
  quality: Quality
  library: Library
  /** reviewed 必填（§5.7#7） */
  updatedAt?: string
  /** reviewed 必填（§5.7#7） */
  verifiedBy?: string
}

export type ProgressStatus = 'new' | 'learning' | 'mastered'

/** 用户进度（§5.6，userData/progress.json，key=idiom id） */
export interface UserProgress {
  id: string
  status: ProgressStatus
  wrongTimes: number
  /** key 必须来自 §5.2 误用类型词表 */
  wrongTypes: Record<string, number>
  lastSeen?: string
}

/** 生词本条目（§5.6，userData/pending.json） */
export interface PendingItem {
  word: string
  addedAt: string
}

/** AI 模式状态机四态（§10.2） */
export type AiMode = 'disabled' | 'configured' | 'online' | 'error'

/** 应用设置（§5.6，userData/config.json） */
export interface AppSettings {
  schemaVersion: number
  aiMode: AiMode
  /** v0.1 应用内快捷键（窗口聚焦时生效），全局注册增强失败静默降级（§3.4） */
  quickInputShortcut: string
}

export interface QuizAnswer {
  id: string
  correct: boolean
}

// ---------------------------------------------------------------------------
// channel 常量（§10.4 权威清单）
// ---------------------------------------------------------------------------

export const IPC_CHANNELS = {
  dataList: 'data:list',
  dataGet: 'data:get',
  progressSave: 'progress:save',
  pendingList: 'pending:list',
  pendingAdd: 'pending:add',
  pendingRemove: 'pending:remove',
  quizRecord: 'quiz:record',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  appLog: 'app:log'
} as const

export type IpcChannelName = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]

// ---------------------------------------------------------------------------
// 统一信封（§10.4：全 channel 一致）
// ---------------------------------------------------------------------------

export type IpcErrorCode =
  | 'INVALID_ARGS'
  | 'NOT_FOUND'
  | 'FILE_CORRUPT'
  | 'NO_API_KEY'
  | 'IO_ERROR'
  | 'UNKNOWN'

export interface IpcError {
  code: IpcErrorCode
  message: string
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcError }

export function ipcOk<T>(data: T): IpcResult<T> {
  return { ok: true, data }
}

export function ipcErr(code: IpcErrorCode, message: string): IpcResult<never> {
  return { ok: false, error: { code, message } }
}

// ---------------------------------------------------------------------------
// 各 channel Request/Response
// ---------------------------------------------------------------------------

/** data:list → 正式库全量 + 版本号（启动一次，§10.4 策略：过滤/搜索在 renderer 内存完成） */
export interface DataListResponse {
  items: Idiom[]
  /** 语料快照版本（§5.4 corpus-version.json；缺失时兜底 '0.0.0'） */
  version: string
}

/** progress:save 入参（§10.4，与 §5.6 模型一致；均为可选 patch） */
export interface ProgressSaveRequest {
  id: string
  status?: ProgressStatus
  wrongTypes?: Record<string, number>
  wrongTimes?: number
}

/** quiz:record 入参（批量，一次 10 题，§10.4） */
export interface QuizRecordRequest {
  answers: QuizAnswer[]
}

/** settings:set 入参（patch，仅允许白名单字段） */
export interface SettingsSetRequest {
  aiMode?: AiMode
  quickInputShortcut?: string
}

/** app:log 入参（renderer 渲染错误转发 main 日志，§4.6） */
export interface AppLogRequest {
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
}

// ---------------------------------------------------------------------------
// preload 白名单 API（renderer 侧 window.api 形状；不透传 ipcRenderer，§10.4）
// ---------------------------------------------------------------------------

export interface YuzhanApi {
  data: {
    /** 启动一次性全量加载正式库 */
    list(): Promise<IpcResult<DataListResponse>>
    get(id: string): Promise<IpcResult<Idiom | null>>
  }
  progress: {
    save(payload: ProgressSaveRequest): Promise<IpcResult<null>>
  }
  pending: {
    list(): Promise<IpcResult<PendingItem[]>>
    add(word: string): Promise<IpcResult<null>>
    remove(word: string): Promise<IpcResult<null>>
  }
  quiz: {
    record(payload: QuizRecordRequest): Promise<IpcResult<null>>
  }
  settings: {
    get(): Promise<IpcResult<AppSettings>>
    set(patch: SettingsSetRequest): Promise<IpcResult<AppSettings>>
  }
  /** 渲染错误经 app:log 转发到 main 日志（§4.6） */
  log(level: AppLogRequest['level'], message: string): Promise<IpcResult<null>>
}
