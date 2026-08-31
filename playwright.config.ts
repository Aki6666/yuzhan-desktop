/**
 * Playwright 配置（V2-I，§4.8 E2E v0.2 起）
 * 主流程 E2E「记录→复习→自测」离线模式，基于已构建产物 out/ 启动 Electron。
 */
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off'
  }
})
