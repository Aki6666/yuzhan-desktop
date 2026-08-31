import { join } from 'node:path'
import { app, BrowserWindow, globalShortcut } from 'electron'
import { createWindow, markQuitting, showMainWindow } from './window'
import { registerIpcHandlers } from './ipc'
import { initLogger, logger } from './logger'
import {
  createTray,
  destroyTray,
  isTrayActive,
  readQuickInputShortcut,
  registerGlobalShortcut,
  watchSettingsForShortcut
} from './tray'

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

  // 第二个实例启动：显示/聚焦已有窗口，不重复写数据（AC-09；v0.2 隐藏态也唤起）
  app.on('second-instance', () => {
    if (mainWindow) showMainWindow(mainWindow)
  })

  app.whenReady().then(() => {
    initLogger()
    registerIpcHandlers()
    mainWindow = createWindow()

    // v0.2 托盘常驻 + 全局快捷键（§3.4/§10.2；关窗最小化到托盘，退出走托盘菜单）
    createTray(() => mainWindow)
    const accel = readQuickInputShortcut(app.getPath('userData'))
    registerGlobalShortcut(accel, () => mainWindow)
    // 设置页改快捷键后自动重注册全局（应用内路径由 renderer 动态监听立即生效）
    watchSettingsForShortcut(app.getPath('userData'), (next) => {
      registerGlobalShortcut(next, () => mainWindow)
    })

    logger.info('app ready')

    // macOS：点击 Dock 图标时显示/重建窗口
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow()
      } else if (mainWindow) {
        showMainWindow(mainWindow)
      }
    })
  })

  // v0.2 托盘常驻：关窗最小化到托盘，不随窗口关闭退出（§3.4 决策反转）；
  // 无托盘（创建失败等异常场景）时兜底退出
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && !isTrayActive()) {
      app.quit()
    }
  })

  // 退出流程：置位 quitting（放行关窗）→ 清理全局快捷键与托盘
  app.on('before-quit', () => {
    markQuitting()
    globalShortcut.unregisterAll()
    destroyTray()
  })
}
