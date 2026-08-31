import { join } from 'node:path'
import { app } from 'electron'
import log from 'electron-log/main'

/**
 * electron-log 接线（PLAN.md §4.2 logger.ts）：日志落盘 userData/logs/。
 * T1 仅初始化；T3 扩展 renderer 端 app:log 转发与错误码记录。
 */
export function initLogger(): void {
  log.initialize()
  log.transports.file.resolvePathFn = () => join(app.getPath('userData'), 'logs', 'main.log')
  log.transports.file.maxSize = 5 * 1024 * 1024
}

export const logger = log
