/**
 * 数据备份纯函数（F10 设置页：userData JSON 导出）
 * v0.1 简版：导出 renderer 可及的会话数据快照（设置/生词本/进度会话态）。
 * ⚠ 全量 userData 备份（含重启前完整 progress.json）需新增 data:export channel，
 *   记录为 v0.2 必补项（PLAN §11.4 检查单 6）。
 */
import type { AppSettings, PendingItem, UserProgress } from '@shared/ipc/contracts'

export interface BackupPayload {
  app: { name: string; version: string }
  exportedAt: string
  settings: AppSettings
  pending: PendingItem[]
  progress: Record<string, UserProgress>
  note: string
}

export interface BackupInput {
  name: string
  version: string
  settings: AppSettings
  pending: PendingItem[]
  progress: Record<string, UserProgress>
}

export function buildBackupPayload(input: BackupInput): BackupPayload {
  return {
    app: { name: input.name, version: input.version },
    exportedAt: new Date().toISOString(),
    settings: input.settings,
    pending: input.pending,
    progress: input.progress,
    note: '语栈 v0.1 简版备份（会话数据快照：设置 + 生词本 + 进度会话态）。全量 userData 备份（含重启前完整 progress.json）为 v0.2 必补项（§11.4 检查单 6）。'
  }
}

export function backupFileName(date: Date = new Date()): string {
  const d = date.toISOString().slice(0, 10).replace(/-/g, '')
  return `yuzhan-backup-${d}.json`
}
