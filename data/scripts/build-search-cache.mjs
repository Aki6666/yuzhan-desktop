#!/usr/bin/env node
/**
 * 预生成检索索引缓存（性能优化：避免启动时对 2600+ 词条逐个跑 pinyin-pro 全读音计算）
 * 输出：data/search-index.json（words: [{w, v, f, i}]，w=word, v=全拼候选项, f=去空格全拼, i=首字母）
 * 由 main store 随 data:list 返回，renderer 以 createSearchIndexFromCache 快速重建（用户要求 #1）。
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSearchIndex } from '../../shared/lib/search.ts'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const IDIOMS_DIR = join(SCRIPT_DIR, '..', 'idioms')
const OUT = join(SCRIPT_DIR, '..', 'search-index.json')

const items = []
function walk(dir) {
  if (!existsSync(dir)) return
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, ent.name)
    if (ent.isDirectory()) walk(full)
    else if (ent.isFile() && ent.name.endsWith('.json') && ent.name !== 'tags.json' && ent.name !== 'exams.json') {
      try {
        const o = JSON.parse(readFileSync(full, 'utf8'))
        if (o && typeof o.id === 'string' && typeof o.word === 'string') items.push(o)
      } catch {
        /* skip */
      }
    }
  }
}
walk(IDIOMS_DIR)
items.sort((a, b) => (a.id < b.id ? -1 : 1))

const index = createSearchIndex(items)
const words = index.entries.map((e) => ({
  w: e.word,
  v: e.pinyinVariants,
  f: e.pinyinFlat,
  i: e.initials
}))

const out = {
  schemaVersion: 1,
  updatedAt: new Date().toISOString().slice(0, 10),
  count: words.length,
  words
}
writeFileSync(OUT, JSON.stringify(out), 'utf8')
console.log(`search-index.json 生成完成：${words.length} 词，${(Buffer.byteLength(JSON.stringify(out)) / 1024).toFixed(0)} KB`)
