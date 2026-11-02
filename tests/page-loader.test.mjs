import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { loadPage, cancelLoad } = require('../miniprogram/services/page-loader.js')
const page = () => ({ data: { plan: { recommendation: '旧建议' } }, setData(value) { Object.assign(this.data, value) } })
test('网络错误移除旧建议，显示错误并结束加载', async () => {
  const target = page()
  await loadPage(target, 'plan', async () => { throw new Error('网络不可用') })
  assert.equal(target.data.plan, null); assert.equal(target.data.error, '网络不可用'); assert.equal(target.data.loading, false)
})
test('较早的慢响应不能覆盖较新的暂停建议', async () => {
  const target = page(); let resolveOld
  const pending = loadPage(target, 'plan', () => new Promise(resolve => { resolveOld = resolve }))
  await loadPage(target, 'plan', async () => ({ recommendation: '暂停跑步' }))
  resolveOld({ recommendation: '旧轻松跑' }); await pending
  assert.equal(target.data.plan.recommendation, '暂停跑步')
})
test('离开页面后不写入晚到的响应', async () => {
  const target = page(); let resolve
  const pending = loadPage(target, 'plan', () => new Promise(r => { resolve = r }))
  cancelLoad(target); resolve({ recommendation: '离页后的响应' }); await pending
  assert.equal(target.data.plan, null)
})
