import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC_CHANNELS,
  type AppLogRequest,
  type AppSettings,
  type DataListResponse,
  type Idiom,
  type IpcResult,
  type PendingItem,
  type ProgressSaveRequest,
  type QuizRecordRequest,
  type SettingsSetRequest,
  type YuzhanApi
} from '../../shared/ipc/contracts'

/**
 * Preload 白名单（PLAN.md §4.4/§10.4）
 * 安全基线：只暴露 shared/ipc/contracts.ts 声明的白名单 API，不透传 ipcRenderer 本体。
 * channel 常量与类型来自唯一权威源 shared/ipc/contracts.ts，防契约漂移。
 */
const api: YuzhanApi = {
  data: {
    list: (): Promise<IpcResult<DataListResponse>> => ipcRenderer.invoke(IPC_CHANNELS.dataList),
    get: (id: string): Promise<IpcResult<Idiom | null>> => ipcRenderer.invoke(IPC_CHANNELS.dataGet, id)
  },
  progress: {
    save: (payload: ProgressSaveRequest): Promise<IpcResult<null>> =>
      ipcRenderer.invoke(IPC_CHANNELS.progressSave, payload)
  },
  pending: {
    list: (): Promise<IpcResult<PendingItem[]>> => ipcRenderer.invoke(IPC_CHANNELS.pendingList),
    add: (word: string): Promise<IpcResult<null>> => ipcRenderer.invoke(IPC_CHANNELS.pendingAdd, word),
    remove: (word: string): Promise<IpcResult<null>> => ipcRenderer.invoke(IPC_CHANNELS.pendingRemove, word)
  },
  quiz: {
    record: (payload: QuizRecordRequest): Promise<IpcResult<null>> =>
      ipcRenderer.invoke(IPC_CHANNELS.quizRecord, payload)
  },
  settings: {
    get: (): Promise<IpcResult<AppSettings>> => ipcRenderer.invoke(IPC_CHANNELS.settingsGet),
    set: (patch: SettingsSetRequest): Promise<IpcResult<AppSettings>> =>
      ipcRenderer.invoke(IPC_CHANNELS.settingsSet, patch)
  },
  log: (level: AppLogRequest['level'], message: string): Promise<IpcResult<null>> =>
    ipcRenderer.invoke(IPC_CHANNELS.appLog, { level, message })
}

contextBridge.exposeInMainWorld('api', api)
