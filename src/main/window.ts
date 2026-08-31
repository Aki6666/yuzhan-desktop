import { join } from 'node:path'
import { BrowserWindow, shell } from 'electron'

/**
 * 应用主窗口（PLAN.md §4.2 window.ts）
 * - 安全基线：contextIsolation + sandbox + nodeIntegration:false（§4.4/§10.4）
 * - 单实例锁在 src/main/index.ts（requestSingleInstanceLock + second-instance 聚焦）
 * - v0.2 托盘常驻（§3.4 决策反转）：关窗最小化到托盘不退出，退出走托盘菜单；
 *   quitting 标记由托盘「退出」/ app.quit 前置置位，关闭事件据此放行
 *
 * 快捷键策略（FIX-1/FIX-2 + v0.2，附录 B）：
 * - 快速记录唤起：renderer 应用内 window keydown（默认「+」，设置页可自定义，动态生效）
 * - v0.2 全局快捷键：带修饰键的自定义快捷键经 globalShortcut 注册（src/main/tray.ts），
 *   触发时显示/聚焦窗口 + 合成 keydown 唤起（RegisterHotKey 消费组合键 → 无双触发）；
 *   无修饰键（默认「+」）与注册失败均静默降级为应用内
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

  // v0.2 托盘常驻：关窗最小化到托盘（退出走托盘菜单 / app.quit，见 index.ts before-quit）
  mainWindow.on('close', (e) => {
    if (shouldPreventWindowClose(isQuitting())) {
      e.preventDefault()
      mainWindow.hide()
    }
  })

  // 安全：拦截新窗口打开，一律交给系统浏览器（不放开 webview/新窗口）
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

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
 * 关窗决策（v0.2 托盘常驻，§3.4）：未进入退出流程时拦截关窗（最小化到托盘）。
 * 纯函数便于单测。
 */
export function shouldPreventWindowClose(quitting: boolean): boolean {
  return !quitting
}

// ---------------------------------------------------------------------------
// 退出标记（托盘「退出」/ before-quit 置位后，关窗事件放行真正退出）
// ---------------------------------------------------------------------------

let quitting = false

export function isQuitting(): boolean {
  return quitting
}

export function markQuitting(): void {
  quitting = true
}

/**
 * 显示/聚焦主窗口（托盘点击、全局快捷键、second-instance 共用）：
 * 最小化先还原，隐藏则显示，最后聚焦。
 */
export function showMainWindow(win: FocusableWindow & { show(): void }): void {
  if (win.isMinimized()) {
    win.restore()
  }
  win.show()
  win.focus()
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
