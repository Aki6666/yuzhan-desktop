/**
 * IPC 路由注册（T1 脚手架占位；T3 落地完整实现）
 *
 * 权威 channel 清单与统一信封见 PLAN.md §10.4：
 *   data:list / data:get / progress:save / pending:list|add|remove /
 *   quiz:record / settings:get|set / ai:searchWord / app:log
 * 类型契约单一权威源：shared/ipc/contracts.ts（T3 创建，main/preload/renderer 共用）
 * 信封：{ ok: true, data } | { ok: false, error: { code, message } }
 * 安全基线：IPC 入参过 schema 校验；路径白名单限定 data/ 与 userData/（§10.4）
 */
export function registerIpcHandlers(): void {
  // T3：ipcMain.handle 注册 + 入参 schema 校验 + 写队列（串行 + 同 key 防抖合并）
}
