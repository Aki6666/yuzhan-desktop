import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import { createWindow } from './window'
import { registerIpcHandlers } from './ipc'
import { initLogger, logger } from './logger'

// 开发期把 userData 指到仓库内 .runtime/，隔离开发数据、避免污染系统目录；
// 打包后（isPackaged）仍使用系统默认 userData 目录（PLAN.md §4.1）。
if (!app.isPackaged) {
  app.setPath('userData', join(app.getAppPath(), '.runtime', 'userData'))
}

// 单实例锁（PLAN.md §4.5 / §10.3）：防多开并发写同一 userData 文件
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  let mainWindow: BrowserWindow | null = null

  // 第二个实例启动：聚焦已有窗口，不重复写数据（AC-09）
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    initLogger()
    registerIpcHandlers()
    mainWindow = createWindow()
    logger.info('app ready')

    // macOS：点击 Dock 图标且无窗口时重建窗口
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow()
      }
    })
  })

  // Windows/Linux：关闭所有窗口即退出（v0.1 决策：无托盘常驻，PLAN.md §3.4）
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
