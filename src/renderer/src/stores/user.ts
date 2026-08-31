/**
 * 个人库 store（v0.2.6 迭代，§16.3 P0-④ 个人库落盘）
 *
 * - 事实源：quickRecord 的会话内注册表（检索/去重纯函数不动，测试兼容）；
 *   本 store 提供**响应式快照**（shallowRef）供快速输入检索池等消费。
 * - load()：user:list 全量恢复 → initPersonalLibrary（注册表）+ items（响应式）
 * - add()：quickRecord.addPersonalItem（注册表 + user:add 异步落盘）→ 刷新 items
 */
import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import type { Idiom } from '@shared/ipc/contracts'
import {
  addPersonalItem as quickAdd,
  initPersonalLibrary,
  listPersonalLibrary
} from '@renderer/lib/quickRecord'

export const useUserStore = defineStore('user', () => {
  const items = shallowRef<Idiom[]>([])
  const loaded = ref(false)

  /** 启动/进入页面时恢复个人库（user:list；失败静默，注册表保持空） */
  async function load(): Promise<void> {
    if (loaded.value) return
    try {
      const res = await window.api.user.list()
      if (res.ok) {
        initPersonalLibrary(res.data.items)
        items.value = listPersonalLibrary()
      }
    } catch {
      /* user:list 不可用（旧版/测试）：注册表保持会话内行为 */
    }
    loaded.value = true
  }

  /** 登记个人词条（注册表 + 异步落盘）并刷新响应式快照；返回是否新增 */
  function add(idiom: Idiom): boolean {
    const ok = quickAdd(idiom)
    if (ok) items.value = listPersonalLibrary()
    return ok
  }

  return { items, loaded, load, add }
})
