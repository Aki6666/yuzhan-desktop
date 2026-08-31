export {}

declare global {
  interface Window {
    /**
     * preload 暴露的白名单 API（T3 由 shared/ipc/contracts.ts 精确化类型）
     */
    api: {
      // T3: data:list / data:get / progress:save / pending:list|add|remove /
      //     quiz:record / settings:get|set / app:log
      [key: string]: unknown
    }
  }
}
