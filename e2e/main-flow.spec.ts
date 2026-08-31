/**
 * V2-I 主流程 E2E（§4.8：「记录→复习→自测」闭环，离线/无 key 模式）
 *
 * 前置：pnpm build 产出 out/（electron.launch({ args: ['.'] }) 走 package.json main）。
 * 流程：应用启动 → 成语库加载 → 快速记录（jgj 命中 鞠躬尽瘁 → 复习一次）
 *       → 闪卡（认识一张）→ 自测（10 题）→ 断言 userData/progress.json 落盘。
 */
import { test, expect, _electron as electron } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

const IDIOM_ID = 'ju-gong-jin-cui-01' // 鞠躬尽瘁

/**
 * 开发环境专用：应用使用 requestSingleInstanceLock（§4.5），残留 electron 实例会令
 * 新实例静默退出。best-effort 清理（Windows），避免 CI/本地重跑互踩；不影响用户数据。
 */
test.beforeAll(() => {
  try {
    execSync('taskkill /IM electron.exe /F', { stdio: 'ignore', windowsHide: true })
  } catch {
    /* 无残留实例属正常 */
  }
})

test.afterAll(() => {
  try {
    execSync('taskkill /IM electron.exe /F', { stdio: 'ignore', windowsHide: true })
  } catch {
    /* ignore */
  }
})

/** 从 progress.json（对象或数组两种形态兼容）取指定 id 的记录 */
function findProgressRecord(id: string): Record<string, unknown> | undefined {
  const p = join(process.cwd(), '.runtime', 'userData', 'progress.json')
  if (!existsSync(p)) return undefined
  const data = JSON.parse(readFileSync(p, 'utf8'))
  if (Array.isArray(data)) return (data as Array<Record<string, unknown>>).find((r) => r.id === id)
  if (data && typeof data === 'object') {
    const rec = (data as Record<string, unknown>)[id]
    if (rec && typeof rec === 'object') return rec as Record<string, unknown>
    // 兼容 { progress: { [id]: rec } } 包装
    const inner = (data as Record<string, unknown>).progress as Record<string, unknown> | undefined
    if (inner && typeof inner[id] === 'object') return inner[id] as Record<string, unknown>
  }
  return undefined
}

test('主流程：记录 → 复习 → 自测（离线模式，AC-02/03/06 精神）', async () => {
  const app = await electron.launch({ args: ['.'] })
  const win = await app.firstWindow()

  // ① 应用壳与成语库加载（离线本地数据，AC-02）
  await expect(win.getByTestId('search-input')).toBeVisible({ timeout: 30_000 })
  await expect(win.getByText('鞠躬尽瘁', { exact: false }).first()).toBeVisible({ timeout: 15_000 })

  // ② 记录：快速记录（顶栏按钮）→ jgj → 命中卡片 → 复习一次（AC-03 记录闭环）
  await win.locator('.quick-btn').click()
  await expect(win.getByTestId('quick-input-modal')).toBeVisible({ timeout: 15_000 })
  await win.getByTestId('quick-input').locator('input').fill('jgj')
  await expect(win.getByTestId('quick-hit-card')).toBeVisible({ timeout: 15_000 })
  await win.getByTestId('action-review').click()
  await expect(win.getByText('已复习一次：鞠躬尽瘁')).toBeVisible({ timeout: 15_000 })
  await win.keyboard.press('Escape')
  await expect(win.getByTestId('quick-input-modal')).toBeHidden({ timeout: 15_000 })

  // ③ 复习：闪卡 → 认识一张 → 翻面（AC-05 单卡流）
  await win.locator('.nav-item', { hasText: '闪卡' }).click()
  await expect(win.getByTestId('known-button').first()).toBeVisible({ timeout: 20_000 })
  await win.getByTestId('known-button').first().click()
  await expect(win.getByTestId('next-button').first()).toBeVisible({ timeout: 15_000 })
  await win.getByTestId('next-button').first().click()

  // ④ 自测：10 题 → 结果面板（AC-06）
  await win.locator('.nav-item', { hasText: '自测' }).click()
  await expect(win.getByTestId('quiz-start')).toBeVisible({ timeout: 20_000 })
  await win.getByTestId('quiz-start').click()
  for (let i = 0; i < 10; i++) {
    await expect(win.getByTestId('q-option-0')).toBeVisible({ timeout: 15_000 })
    await win.getByTestId('q-option-0').click()
    await expect(win.getByTestId('q-next')).toBeVisible({ timeout: 15_000 })
    await win.getByTestId('q-next').click()
  }
  await expect(win.getByTestId('quiz-result')).toBeVisible({ timeout: 20_000 })

  // ⑤ 断言进度持久化：progress.json 含 鞠躬尽瘁（复习一次已 flush 落盘）
  await app.close()
  const record = findProgressRecord(IDIOM_ID)
  expect(record, `progress.json 应包含 ${IDIOM_ID}（快速记录「复习一次」闭环）`).toBeDefined()
})
