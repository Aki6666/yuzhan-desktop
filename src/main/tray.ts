/**
 * 托盘常驻 + 全局快捷键（PLAN.md §3.4 / §10.2，v0.2 系统能力）
 *
 * - v0.2 决策反转：v0.1 关窗即退出 → v0.2 托盘常驻（关窗最小化到托盘，退出走托盘菜单）
 * - 全局快捷键：用设置中自定义快捷键（settings.quickInputShortcut，v0.1.3）注册 globalShortcut；
 *   - 无修饰键的快捷键（默认「+」）**不注册全局**（FIX-1 根因记录：全局 '+' 会劫持其他应用
 *     与自身输入框的 '+' 输入），保持应用内触发（renderer window keydown 兜底）→ 此即「静默降级」
 *   - 带修饰键（Ctrl/Alt/Meta 组合）注册全局：触发时显示/聚焦窗口 + 合成一次 keydown 通知
 *     renderer 唤起快速记录；Windows RegisterHotKey 会在 OS 层消费该组合键，焦点窗口收不到
 *     真实 keydown，故 renderer 监听不会重复触发（防双触发，FIX-1 已实证）
 *   - 注册失败/被占用 → 静默降级为应用内，仅记日志
 * - 设置变更自动重注册：fs.watch config.json（原子写 rename 触发），防抖后按新值重注册
 * - 单实例锁 / 持久化铁律不变（src/main/index.ts / store.ts）
 */
import { app, globalShortcut, Menu, nativeImage, Tray } from 'electron'
import { readFileSync, watch } from 'node:fs'
import { join } from 'node:path'
import type { BrowserWindow, KeyboardInputEvent, MenuItemConstructorOptions } from 'electron'
import { logger } from './logger'
import { markQuitting, showMainWindow } from './window'

/** 与 renderer quickRecord.DEFAULT_SHORTCUT 保持一致（main 侧不引 renderer 代码，常量重复声明） */
export const DEFAULT_QUICK_SHORTCUT = 'Plus'

let tray: Tray | null = null
let settingsWatcher: ReturnType<typeof watch> | null = null
let currentGlobalAccelerator: string | null = null

export function isTrayActive(): boolean {
  return tray !== null
}

export function destroyTray(): void {
  settingsWatcher?.close()
  settingsWatcher = null
  tray?.destroy()
  tray = null
}

/** 托盘图标路径：开发取项目 resources/，打包取 process.resourcesPath（resources/ 已 asarUnpack） */
export function trayIconPath(): string {
  const base = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources')
  return join(base, 'icon.png')
}

// ---------------------------------------------------------------------------
// 纯函数（可单测）
// ---------------------------------------------------------------------------

export interface TrayMenuHandlers {
  show: () => void
  hide: () => void
  quit: () => void
}

/** 托盘菜单模板（显示主窗口 / 隐藏窗口 / 退出，§3.4 v0.2：退出走托盘菜单） */
export function buildTrayMenuTemplate(handlers: TrayMenuHandlers): MenuItemConstructorOptions[] {
  return [
    { label: '显示主窗口', click: handlers.show },
    { label: '隐藏窗口', click: handlers.hide },
    { type: 'separator' },
    { label: '退出', click: handlers.quit }
  ]
}

/**
 * 是否应注册全局快捷键：仅带修饰键（Ctrl/Alt/Meta/Command）的组合注册全局；
 * 无修饰键（如默认「+」）跳过（防劫持输入，FIX-1 附录 B v0.1.2 根因记录）。
 */
export function shouldRegisterGlobal(accelerator: string): boolean {
  const parts = accelerator.split('+').map((p) => p.trim()).filter(Boolean)
  return parts.some(
    (p) =>
      p === 'CommandOrControl' ||
      p === 'CmdOrCtrl' ||
      p === 'Control' ||
      p === 'Command' ||
      p === 'Cmd' ||
      p === 'Alt' ||
      p === 'Option' ||
      p === 'Meta' ||
      p === 'Super'
  )
}

/**
 * accelerator → 合成 keydown 输入事件（通知 renderer 唤起快速记录，防双触发路径）。
 * 与 renderer quickRecord.eventMatchesAccelerator 的匹配语义对齐（ctrlOrMeta/alt/shift + e.key）。
 */
export function acceleratorToInputEvent(
  accelerator: string,
  platform: NodeJS.Platform = process.platform
): KeyboardInputEvent | null {
  const parts = accelerator.split('+').map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) return null
  const modifiers: KeyboardInputEvent['modifiers'] = []
  let key = ''
  for (const p of parts) {
    if (p === 'CommandOrControl' || p === 'CmdOrCtrl' || p === 'Control') {
      modifiers.push(platform === 'darwin' ? 'command' : 'control')
    } else if (p === 'Command' || p === 'Cmd') {
      modifiers.push('command')
    } else if (p === 'Alt' || p === 'Option') {
      modifiers.push('alt')
    } else if (p === 'Shift') {
      modifiers.push('shift')
    } else if (p === 'Meta' || p === 'Super') {
      modifiers.push('meta')
    } else if (p === 'Plus') {
      key = '+'
    } else {
      key = p
    }
  }
  if (!key) return null
  // 单字母统一小写（与 renderer eventMatchesAccelerator 的 e.key.toLowerCase() 匹配对齐）；'+' 等符号原样
  return { type: 'keyDown', keyCode: /^[a-zA-Z]$/.test(key) ? key.toLowerCase() : key, modifiers }
}

/** 从 config.json 读取当前快捷键（缺省/损坏回退默认 'Plus'；与 store 的 sanitize 语义一致） */
export function readQuickInputShortcut(userDataDir: string): string {
  try {
    const raw = JSON.parse(readFileSync(join(userDataDir, 'config.json'), 'utf8')) as {
      quickInputShortcut?: unknown
    }
    if (typeof raw?.quickInputShortcut === 'string' && raw.quickInputShortcut.length > 0) {
      return raw.quickInputShortcut
    }
  } catch {
    /* 文件缺失/损坏 → 默认 */
  }
  return DEFAULT_QUICK_SHORTCUT
}

// ---------------------------------------------------------------------------
// 全局快捷键注册（main 侧，Electron 集成）
// ---------------------------------------------------------------------------

export interface GlobalShortcutResult {
  registered: boolean
  accelerator: string
  /** 未注册原因：no-modifier（无修饰键跳过）/ register-failed（被占用或异常）/ invalid */
  reason?: 'no-modifier' | 'register-failed' | 'invalid'
}

/**
 * 按当前设置注册/重注册全局快捷键。
 * 触发行为：显示/聚焦主窗口 + 合成一次 keydown 唤起快速记录（跨窗口唤起，防双触发见文件头）。
 */
export function registerGlobalShortcut(
  accelerator: string,
  getMainWindow: () => BrowserWindow | null
): GlobalShortcutResult {
  if (currentGlobalAccelerator === accelerator) {
    return { registered: true, accelerator } // 已注册同键 → no-op（避免重复注册被判占用）
  }
  if (currentGlobalAccelerator) {
    globalShortcut.unregister(currentGlobalAccelerator)
    currentGlobalAccelerator = null
  }
  if (!shouldRegisterGlobal(accelerator)) {
    logger.info(`[tray] 快捷键「${accelerator}」无修饰键，跳过全局注册（防劫持输入），应用内路径兜底`)
    return { registered: false, accelerator, reason: 'no-modifier' }
  }
  const inputEvent = acceleratorToInputEvent(accelerator)
  if (!inputEvent) {
    logger.warn(`[tray] 快捷键「${accelerator}」无法解析，全局注册跳过`)
    return { registered: false, accelerator, reason: 'invalid' }
  }
  try {
    const ok = globalShortcut.register(accelerator, () => {
      const win = getMainWindow()
      if (!win) return
      showMainWindow(win)
      // 防双触发：RegisterHotKey 已消费真实 keydown（renderer 收不到），合成一次唤起
      win.webContents.sendInputEvent(inputEvent)
      logger.info(`[tray] 全局快捷键触发：${accelerator}`)
    })
    if (ok) {
      currentGlobalAccelerator = accelerator
      logger.info(`[tray] 全局快捷键已注册：${accelerator}`)
      return { registered: true, accelerator }
    }
    logger.warn(`[tray] 全局快捷键「${accelerator}」注册失败（可能被占用），静默降级为应用内`)
    return { registered: false, accelerator, reason: 'register-failed' }
  } catch (e) {
    logger.warn(`[tray] 全局快捷键「${accelerator}」注册异常，静默降级为应用内: ${String(e)}`)
    return { registered: false, accelerator, reason: 'register-failed' }
  }
}

/** 监听 config.json 变更（设置页改快捷键后自动重注册全局快捷键） */
export function watchSettingsForShortcut(
  userDataDir: string,
  onAccelerator: (accelerator: string) => void
): void {
  settingsWatcher?.close()
  let timer: ReturnType<typeof setTimeout> | null = null
  const configPath = join(userDataDir, 'config.json')
  try {
    settingsWatcher = watch(configPath, (_event, fileName) => {
      // 原子写 rename 触发（.bak/.tmp 写入也会触发，按文件名过滤）
      if (fileName !== 'config.json') return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        const accel = readQuickInputShortcut(userDataDir)
        onAccelerator(accel)
      }, 200)
    })
    logger.info('[tray] config.json 变更监听已启动（快捷键自动重注册）')
  } catch (e) {
    logger.warn(`[tray] config.json 监听启动失败: ${String(e)}`)
    settingsWatcher = null
  }
}

// ---------------------------------------------------------------------------
// 托盘创建
// ---------------------------------------------------------------------------

export function createTray(getMainWindow: () => BrowserWindow | null): void {
  if (tray) return
  let icon = nativeImage.createFromPath(trayIconPath())
  if (icon.isEmpty()) {
    // 兜底：开发环境 build/ 图标
    icon = nativeImage.createFromPath(join(app.getAppPath(), 'build', 'icon.ico'))
  }
  tray = new Tray(icon)
  tray.setToolTip('语栈')
  tray.setContextMenu(
    Menu.buildFromTemplate(
      buildTrayMenuTemplate({
        show: () => {
          const win = getMainWindow()
          if (win) showMainWindow(win)
        },
        hide: () => {
          const win = getMainWindow()
          if (win) win.hide()
        },
        quit: () => {
          markQuitting()
          app.quit()
        }
      })
    )
  )
  // 点击托盘图标：显示/聚焦主窗口（Windows 惯例）
  tray.on('click', () => {
    const win = getMainWindow()
    if (win) showMainWindow(win)
  })
  logger.info('[tray] 托盘已创建')
}
