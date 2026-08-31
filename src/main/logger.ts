import { join } from 'node:path'
import { app } from 'electron'
import log from 'electron-log/main'

/**
 * electron-log 接线（PLAN.md §4.2 logger.ts / §4.6 错误三层兜底）
 * - 日志落盘 userData/logs/main.log
 * - renderer 渲染错误经 app:log channel（ipc.ts）转发到这里落盘
 * - 主进程全部异常写 electron-log
 */
export function initLogger(): void {
  log.initialize()
  log.transports.file.resolvePathFn = () => join(app.getPath('userData'), 'logs', 'main.log')
  log.transports.file.maxSize = 5 * 1024 * 1024
}

export const logger = log
