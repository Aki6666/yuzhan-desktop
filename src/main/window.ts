import { join } from 'node:path'
import { BrowserWindow, shell } from 'electron'

/**
 * 应用主窗口（PLAN.md §4.2 window.ts）
 * - 安全基线：contextIsolation + sandbox + nodeIntegration:false（§4.4/§10.4）
 * - 单实例锁在 src/main/index.ts（requestSingleInstanceLock + second-instance 聚焦）
 *
 * 快捷键策略（FIX-1，附录 B v0.1.2）：
 * - 快速记录唤起完全走 **renderer 应用内快捷键**（窗口聚焦时 window keydown：
 *   Ctrl+K 与「+」键，见 QuickInputModal / quickRecord.ts），main 侧不注册 globalShortcut。
 * - 根因记录：旧实现在此注册 globalShortcut('CommandOrControl+K')——Windows 下
 *   RegisterHotKey 会在 OS 层**消费**该组合键，焦点窗口收不到 keydown，导致真实应用中
 *   Ctrl+K 无法唤起快速记录（renderer 链路本身正确，测试因合成事件无法暴露此问题）。
 *   「+」键不做全局注册：全局 '+' 会劫持其他应用内的 '+' 输入，故仅应用内触发。
 * - focusWindow 保留供单实例锁 second-instance 聚焦使用（AC-09）。
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
