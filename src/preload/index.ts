import { contextBridge } from 'electron'

/**
 * Preload 白名单（PLAN.md §4.4/§10.4）
 * 安全基线：只暴露 shared/ipc/contracts.ts 声明的白名单 API，不透传 ipcRenderer 本体。
 * T1 为脚手架占位（空对象）；T3 按 contracts.ts 逐项实现并补齐类型（src/preload/index.d.ts）。
 */
const api = {
  // T3: data:list / data:get / progress:save / pending:list|add|remove /
  //     quiz:record / settings:get|set / app:log
}

contextBridge.exposeInMainWorld('api', api)
