/**
 * 设置服务（PLAN.md §4.2 settings.ts / §4.4 safeStorage 坑位）
 *
 * - apiKey 经 safeStorage 加密存储到 userData/ai-key.bin（不进 config.json 明文）
 * - §4.4 已知坑处理：
 *   ① 必须在 app.whenReady() 之后调用（由 registerIpcHandlers 时机保证）
 *   ② Windows DPAPI 绑定用户账户，跨用户/系统迁移后解密失败 → 视为「无 key」降级，不崩不丢数据
 *   ③ safeStorage 不可用（Linux 无密钥环 / 测试环境）→ 静默降级 plaintext 存储（设置页提示风险）
 * - 原子写（*.tmp → rename）+ .bak 保留（持久化铁律，§4.5）
 */
import { promises as fsp } from 'node:fs'
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** 可注入的 safeStorage（测试用 mock；真实场景为 electron.safeStorage） */
export interface SafeStorageLike {
  isEncryptionAvailable?(): boolean
  encryptString?(plain: string): Buffer
  decryptString?(buffer: Buffer): string
}

export interface SettingsServiceOptions {
  userDataDir: string
  /** electron.safeStorage；不可用/缺失时静默降级 plaintext（§4.4#3） */
  safeStorage?: SafeStorageLike | null
}

export interface SettingsService {
  /** 解密读取 apiKey；无 key / 解密失败 → null（§4.4#2 降级不崩） */
  getApiKey(): string | null
  /** 加密存储 apiKey；null/空串 → 删除（清除配置） */
  setApiKey(plain: string | null): Promise<void>
  /** 掩码展示：前 4 位 + ****；无 key → '' */
  getApiKeyMasked(): string
  hasApiKey(): boolean
}

export function createSettingsService(options: SettingsServiceOptions): SettingsService {
  const { userDataDir, safeStorage } = options
  const keyFile = join(userDataDir, 'ai-key.bin')

  mkdirSync(userDataDir, { recursive: true })

  /** safeStorage 可用且为加密态（§4.4#3：不可用降级 plaintext） */
  function canEncrypt(): boolean {
    return typeof safeStorage?.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable()
  }

  async function writeKeyFile(buffer: Buffer): Promise<void> {
    const tmp = `${keyFile}.tmp`
    if (existsSync(keyFile)) copyFileSync(keyFile, `${keyFile}.bak`)
    await fsp.writeFile(tmp, buffer)
    await fsp.rename(tmp, keyFile)
  }

  function getApiKey(): string | null {
    if (!existsSync(keyFile)) return null
    try {
      const buf = readFileSync(keyFile)
      if (canEncrypt() && typeof safeStorage?.decryptString === 'function') {
        return safeStorage.decryptString(buf)
      }
      // 降级路径：plaintext JSON（Linux 无密钥环 / 测试环境，§4.4#3）
      const parsed = JSON.parse(buf.toString('utf8')) as { plain?: string }
      return typeof parsed.plain === 'string' && parsed.plain.length > 0 ? parsed.plain : null
    } catch {
      // 解密失败（DPAPI 跨用户迁移等）→ 视为无 key，不崩不丢数据（§4.4#2）
      return null
    }
  }

  async function setApiKey(plain: string | null): Promise<void> {
    const value = plain?.trim()
    if (!value) {
      if (existsSync(keyFile)) await fsp.rm(keyFile, { force: true })
      return
    }
    const buf =
      canEncrypt() && typeof safeStorage?.encryptString === 'function'
        ? safeStorage.encryptString(value)
        : Buffer.from(JSON.stringify({ plain: value }), 'utf8')
    await writeKeyFile(buf)
  }

  return {
    getApiKey,
    setApiKey,
    getApiKeyMasked(): string {
      const key = getApiKey()
      if (!key) return ''
      return key.length > 4 ? `${key.slice(0, 4)}****` : '****'
    },
    hasApiKey(): boolean {
      return getApiKey() !== null
    }
  }
}
