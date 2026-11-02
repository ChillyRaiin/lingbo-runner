import test from 'node:test'
import assert from 'node:assert/strict'
import { join, resolve } from 'node:path'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { readRuntimeConfig, PROJECT_ROOT } from '../server/config.mjs'
test('跨目录运行仍使用项目数据库和同项目知识库', () => {
  const previous = process.cwd()
  try {
    process.chdir(resolve(PROJECT_ROOT, '..'))
    const config = readRuntimeConfig({}, { loadDotenv: false })
    assert.equal(config.databasePath, resolve(PROJECT_ROOT, 'data/runner.sqlite'))
    assert.equal(config.projectKnowledgeDirectory, resolve(PROJECT_ROOT, '../knowledge-base'))
  } finally { process.chdir(previous) }
})
test('项目.env按固定目录加载，外部环境变量优先，不暴露错误地址内的秘密', () => {
  const qa = join(PROJECT_ROOT, '.private/qa'); mkdirSync(qa, { recursive: true })
  const root = mkdtempSync(join(qa, 'environment-'))
  writeFileSync(join(root, '.env'), 'PORT=9001\nHOST=127.0.0.1\nDATABASE_PATH=storage/runner.sqlite\n')
  assert.equal(readRuntimeConfig({ PORT: '9002' }, { root }).port, 9002)
  assert.equal(readRuntimeConfig({}, { root }).databasePath, join(root, 'storage/runner.sqlite'))
  for (const environment of [{ PORT: '0' }, { PORT: 'NaN' }, { PORT: '3.5' }, { KNOWLEDGE_PRIVATE_ENABLED: 'yes' }, { HOST: '0.0.0.0' }]) assert.throws(() => readRuntimeConfig(environment, { loadDotenv: false }))
  assert.throws(() => readRuntimeConfig({ DEEPSEEK_BASE_URL: 'bad-synthetic-secret' }, { loadDotenv: false }), error => !String(error).includes('synthetic-secret'))
})
