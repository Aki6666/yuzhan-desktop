/**
 * F10 备份纯函数单测（JSON 导出 payload 与文件名）
 */
import { describe, it, expect } from 'vitest'
import { backupFileName, buildBackupPayload } from '../src/renderer/src/lib/backup'
import type { AppSettings, PendingItem, UserProgress } from '../shared/ipc/contracts'

const settings: AppSettings = { schemaVersion: 1, aiMode: 'disabled', quickInputShortcut: 'Plus' }
const pending: PendingItem[] = [{ word: '不落窠臼', addedAt: '2026-08-31T00:00:00.000Z' }]
const progress: Record<string, UserProgress> = {
  'ju-gong-jin-cui-01': { id: 'ju-gong-jin-cui-01', status: 'mastered', wrongTimes: 0, wrongTypes: {} }
}

describe('buildBackupPayload', () => {
  it('包含 app 标识 / 导出时间 / 三份数据 / v0.2 说明', () => {
    const payload = buildBackupPayload({ name: 'yuzhan', version: '0.1.0', settings, pending, progress })
    expect(payload.app).toEqual({ name: 'yuzhan', version: '0.1.0' })
    expect(payload.exportedAt).toBeTruthy()
    expect(payload.settings).toEqual(settings)
    expect(payload.pending).toEqual(pending)
    expect(payload.progress).toEqual(progress)
    expect(payload.note).toContain('v0.2 必补项')
  })

  it('可 JSON 序列化（含中文）', () => {
    const payload = buildBackupPayload({ name: 'yuzhan', version: '0.1.0', settings, pending, progress })
    const json = JSON.stringify(payload)
    expect(json).toContain('不落窠臼')
    expect(() => JSON.parse(json)).not.toThrow()
  })
})

describe('backupFileName', () => {
  it('格式 yuzhan-backup-YYYYMMDD.json', () => {
    expect(backupFileName(new Date('2026-08-31T12:00:00Z'))).toBe('yuzhan-backup-20260831.json')
  })
})
