import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@shared': resolve('shared')
    }
  },
  test: {
    // jsdom 环境：覆盖组件测试需求（@vue/test-utils + .vue 单文件组件）
    environment: 'jsdom',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts', 'src/**/*.spec.ts'],
    css: false
  }
})
