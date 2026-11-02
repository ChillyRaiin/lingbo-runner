import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

function fixture(t, consent = true) {
  const config = require('../miniprogram/config.js'), savedConfig = { ...config }
  Object.assign(config, { mode: 'api', apiAuthMode: 'demo', apiBaseUrl: 'http://test.invalid' })
  const storage = new Map(), calls = [], model = { modelVersion: 'custom-server-engine', plan: { available: false, reason: '服务端策略结果' } }
  let loginCount = 0, granted = consent
  globalThis.wx = {
    getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, structuredClone(value)), removeStorageSync: key => storage.delete(key),
    request(options) {
      const path = new URL(options.url).pathname; calls.push({ path, method: options.method, token: options.header.Authorization })
      queueMicrotask(() => {
        let data
        if (path === '/v1/auth/demo') data = { token: 'test-' + (++loginCount), expiresAt: Date.now() + 3600000 }
        else if (path === '/v1/me') data = { consent: granted }
        else if (path === '/v1/dashboard') data = model
        else if (path === '/v1/state') data = { consent: granted, profile: null, activities: [], checkins: [], steps: [] }
        else if (path === '/v1/providers') data = []
        else if (path === '/v1/account') data = { deleted: true }
        else if (path === '/v1/consent') { granted = options.data.granted; data = { granted } }
        else throw new Error('Unexpected route: ' + path)
        options.success({ statusCode: 200, data })
      })
    }
  }
  delete require.cache[require.resolve('../miniprogram/services/client.js')]
  const client = require('../miniprogram/services/client.js')
  t.after(() => { Object.assign(config, savedConfig); delete globalThis.wx; delete require.cache[require.resolve('../miniprogram/services/client.js')] })
  return { client, calls, model, loginCount: () => loginCount }
}

test('API 页面采用后端替换后的训练引擎结果，不下载活动重算', async t => {
  const { client, calls, model } = fixture(t)
  assert.deepEqual(await client.overview(), model)
  assert.ok(calls.some(c => c.path === '/v1/dashboard'))
  assert.equal(calls.some(c => c.path === '/v1/state'), false)
})
test('并发页面调用共用一次登录与同一个会话', async t => {
  const { client, calls, loginCount } = fixture(t)
  await Promise.all([client.state(), client.providers(), client.overview()])
  assert.equal(loginCount(), 1)
  assert.ok(calls.filter(c => c.path !== '/v1/auth/demo').every(c => c.token === 'Bearer test-1'))
})
test('未同意数据处理时只显示空状态，不获取个体分析', async t => {
  const { client, calls } = fixture(t, false)
  const value = await client.overview()
  assert.equal(value.readiness.state, 'unknown')
  assert.equal(calls.some(c => c.path === '/v1/dashboard'), false)
})
test('删号后浏览保持游客状态，主动重新授权才建立新会话', async t => {
  const { client, calls, loginCount } = fixture(t)
  await client.state(); await client.deleteAccount()
  const requestCount = calls.length
  const [state, overview] = await Promise.all([client.state(), client.overview(), client.providers(), client.explain('轻松跑')])
  assert.equal(state.consent, false); assert.equal(overview.readiness.state, 'unknown')
  assert.equal(calls.length, requestCount)
  await assert.rejects(client.saveProfile({ weeklyKm: 30, daysPerWeek: 4, weeksConsistent: 8, isAdult: true, goal: '10k' }), /账户已删除/)
  assert.equal(calls.length, requestCount)
  await client.consent(true)
  assert.equal(loginCount(), 2)
  assert.equal((await client.state()).consent, true)
})
test('只读请求遇到一次401可恢复，写入失败不会自动重发', async t => {
  const { client } = fixture(t)
  const original = wx.request
  let failed = false, profileWrites = 0
  wx.request = options => {
    const path = new URL(options.url).pathname
    if (path === '/v1/me' && !failed) { failed = true; queueMicrotask(() => options.success({ statusCode: 401, data: { error: 'expired' } })); return }
    if (path === '/v1/profile') { profileWrites++; queueMicrotask(() => options.success({ statusCode: 401, data: { error: 'write-not-confirmed' } })); return }
    original(options)
  }
  assert.equal((await client.state()).consent, true)
  await assert.rejects(client.saveProfile({ weeklyKm: 30, daysPerWeek: 4, weeksConsistent: 8, isAdult: true, goal: '10k' }), /write-not-confirmed/)
  assert.equal(profileWrites, 1)
})
