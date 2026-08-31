import { join } from 'node:path'
import { app, BrowserWindow, globalShortcut, shell } from 'electron'
import { logger } from './logger'

/**
 * 应用主窗口（PLAN.md §4.2 window.ts）
 * - 安全基线：contextIsolation + sandbox + nodeIntegration:false（§4.4/§10.4）
 * - 单实例锁在 src/main/index.ts（requestSingleInstanceLock + second-instance 聚焦）
 * - 快捷键：v0.1 应用内快捷键为主（T6 renderer 侧处理）；globalShortcut 注册为增强，
 *   失败静默降级（§3.4/§10.2）
 */
export function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: '语栈',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // 安全：拦截新窗口打开，一律交给系统浏览器（不放开 webview/新窗口）
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 全局快捷键增强（失败静默降级为应用内快捷键，T6 renderer 侧兜底）
  registerQuickInputShortcut(() => mainWindow)

  // 开发模式走 Vite dev server（HMR），生产加载打包产物
  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

/**
 * 双开聚焦辅助（AC-09）：第二个实例启动时聚焦已有窗口。
 * 独立导出便于单测（tests/store.test.ts 覆盖；index.ts 的 second-instance 使用同等逻辑）。
 */
export interface FocusableWindow {
  isMinimized(): boolean
  restore(): void
  focus(): void
}

export function focusWindow(win: FocusableWindow): void {
  if (win.isMinimized()) {
    win.restore()
  }
  win.focus()
}

/**
 * Ctrl+K 全局快捷键注册（增强项）：注册成功则触发窗口聚焦（实际快速输入弹层由 T6
 * renderer 侧实现，窗口聚焦时应用内快捷键优先）；失败/异常静默降级并记日志（§3.4）。
 * 退出时统一 unregister。
 */
function registerQuickInputShortcut(getMainWindow: () => BrowserWindow | null): void {
  const handler = (): void => {
    const win = getMainWindow()
    if (win) {
      focusWindow(win)
      logger.info('[window] global shortcut CommandOrControl+K triggered')
    }
  }
  try {
    const ok = globalShortcut.register('CommandOrControl+K', handler)
    if (ok) {
      logger.info('[window] globalShortcut CommandOrControl+K registered')
    } else {
      logger.warn('[window] globalShortcut 注册失败（可能被占用），静默降级为应用内快捷键')
    }
  } catch (e) {
    logger.warn(`[window] globalShortcut 注册异常，静默降级: ${String(e)}`)
  }

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
  })
}
