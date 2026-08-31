/**
 * 托盘 + 全局快捷键纯函数单测（V2-G，§3.4/§10.2）
 * - buildTrayMenuTemplate / shouldRegisterGlobal / acceleratorToInputEvent /
 *   readQuickInputShortcut（tray.ts）+ shouldPreventWindowClose / showMainWindow（window.ts）
 * - electron 与 electron-log 依赖 vi.mock（仅测试纯逻辑，不触碰真实 Tray/globalShortcut）
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: () => 'tmp', getAppPath: () => '.', on: vi.fn(), quit: vi.fn() },
  BrowserWindow: class {},
  globalShortcut: { register: vi.fn(() => true), unregister: vi.fn(), unregisterAll: vi.fn() },
  Menu: { buildFromTemplate: vi.fn((t: unknown) => t) },
  nativeImage: { createFromPath: vi.fn(() => ({ isEmpty: () => true })) },
  Tray: class {
    setToolTip(): void {}
    setContextMenu(): void {}
    on(): void {}
    destroy(): void {}
  },
  shell: { openExternal: vi.fn() }
}))

vi.mock('../src/main/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  initLogger: vi.fn()
}))

import {
  acceleratorToInputEvent,
  buildTrayMenuTemplate,
  readQuickInputShortcut,
  shouldRegisterGlobal
} from '../src/main/tray'
import { shouldPreventWindowClose, showMainWindow } from '../src/main/window'

const dirs: string[] = []
function makeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'yuzhan-tray-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('托盘菜单模板', () => {
  it('菜单含 显示主窗口 / 隐藏窗口 / 退出（分隔线隔开），处理器接线', () => {
    const show = vi.fn()
    const hide = vi.fn()
    const quit = vi.fn()
    const template = buildTrayMenuTemplate({ show, hide, quit })
    expect(template.map((i) => i.label)).toEqual(['显示主窗口', '隐藏窗口', undefined, '退出'])
    expect(template[1]?.type).toBe('separator')
    template[0]?.click?.({} as never, undefined as never, {} as never)
    template[1]?.click?.({} as never, undefined as never, {} as never)
    template[3]?.click?.({} as never, undefined as never, {} as never)
    expect(show).toHaveBeenCalledTimes(1)
    expect(hide).toHaveBeenCalledTimes(1)
    expect(quit).toHaveBeenCalledTimes(1)
  })
})

describe('全局快捷键注册决策（防劫持输入，FIX-1 根因）', () => {
  it('无修饰键（默认「+」）跳过全局注册', () => {
    expect(shouldRegisterGlobal('Plus')).toBe(false)
    expect(shouldRegisterGlobal('')).toBe(false)
  })

  it('带修饰键注册全局', () => {
    expect(shouldRegisterGlobal('Control+Shift+K')).toBe(true)
    expect(shouldRegisterGlobal('CommandOrControl+K')).toBe(true)
    expect(shouldRegisterGlobal('Alt+X')).toBe(true)
    expect(shouldRegisterGlobal('Control+Plus')).toBe(true)
  })
})

describe('accelerator → 合成 keydown（防双触发唤起路径）', () => {
  it('Control+Shift+K（win）→ keyCode k + control/shift', () => {
    expect(acceleratorToInputEvent('Control+Shift+K', 'win32')).toEqual({
      type: 'keyDown',
      keyCode: 'k',
      modifiers: ['control', 'shift']
    })
  })

  it('CommandOrControl 按平台映射（win→control / darwin→command）', () => {
    expect(acceleratorToInputEvent('CommandOrControl+K', 'win32')?.modifiers).toEqual(['control'])
    expect(acceleratorToInputEvent('CommandOrControl+K', 'darwin')?.modifiers).toEqual(['command'])
  })

  it('Plus → keyCode + 无修饰键', () => {
    expect(acceleratorToInputEvent('Plus', 'win32')).toEqual({ type: 'keyDown', keyCode: '+', modifiers: [] })
  })

  it('无效 accelerator → null', () => {
    expect(acceleratorToInputEvent('', 'win32')).toBeNull()
    expect(acceleratorToInputEvent('Control', 'win32')).toBeNull() // 只有修饰键无主键
  })
})

describe('readQuickInputShortcut', () => {
  it('从 config.json 读取自定义快捷键', () => {
    const dir = makeDir()
    writeFileSync(join(dir, 'config.json'), JSON.stringify({ quickInputShortcut: 'Control+Shift+K' }))
    expect(readQuickInputShortcut(dir)).toBe('Control+Shift+K')
  })

  it('缺失/损坏 → 回退默认 Plus', () => {
    const dir = makeDir()
    expect(readQuickInputShortcut(dir)).toBe('Plus')
    writeFileSync(join(dir, 'config.json'), '{corrupt')
    expect(readQuickInputShortcut(dir)).toBe('Plus')
  })
})

describe('窗口行为（v0.2 托盘常驻）', () => {
  it('未退出 → 拦截关窗（最小化到托盘）', () => {
    expect(shouldPreventWindowClose(false)).toBe(true)
  })

  it('退出流程（markQuitting 后）→ 放行关窗', () => {
    expect(shouldPreventWindowClose(true)).toBe(false)
  })

  it('showMainWindow：最小化先还原 + 显示 + 聚焦', () => {
    const restore = vi.fn()
    const show = vi.fn()
    const focus = vi.fn()
    showMainWindow({ isMinimized: () => true, restore, show, focus })
    expect(restore).toHaveBeenCalledTimes(1)
    expect(show).toHaveBeenCalledTimes(1)
    expect(focus).toHaveBeenCalledTimes(1)
  })

  it('showMainWindow：非最小化仅显示 + 聚焦', () => {
    const show = vi.fn()
    const focus = vi.fn()
    const restore = vi.fn()
    showMainWindow({ isMinimized: () => false, restore, show, focus })
    expect(restore).not.toHaveBeenCalled()
    expect(show).toHaveBeenCalledTimes(1)
    expect(focus).toHaveBeenCalledTimes(1)
  })
})
