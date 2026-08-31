import type { YuzhanApi } from '../../shared/ipc/contracts'

export {}

declare global {
  interface Window {
    /** preload 暴露的白名单 API（shared/ipc/contracts.ts 为唯一权威源，§10.4） */
    api: YuzhanApi
  }
}
