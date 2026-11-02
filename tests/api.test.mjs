import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, createCipheriv } from 'node:crypto'
import { createApplication } from '../server/app.mjs'
import { encryptSessionKey, decryptSessionKey, decryptWeRun } from '../server/adapters/wechat.mjs'
import { engine } from '../server/domain.mjs'
test('HTTP 闭环：授权、记录、去重、跨用户隔离、撤权、删号', async () => {
  const app = createApplication({ now: () => new Date('2026-10-08T02:00:00Z') })
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve))
  const base = 'http://127.0.0.1:' + app.server.address().port
  const call = async (path, method = 'GET', body, token) => { const result = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: result.status, data: await result.json() } }
  try {
    assert.equal((await call('/v1/state')).status, 401)
    const first = (await call('/v1/auth/demo', 'POST', {})).data.token, second = (await call('/v1/auth/demo', 'POST', {})).data.token
    assert.notEqual(first, second)
    assert.equal((await call('/v1/activities', 'POST', {}, first)).status, 403)
    for (const token of [first, second]) assert.equal((await call('/v1/consent', 'POST', { granted: true }, token)).status, 200)
    const activity = { date: '2026-10-07', distanceKm: 5, durationSec: 1500, rpe: 9, isRace: true }
    const saved = await call('/v1/activities', 'POST', activity, first)
    assert.equal(saved.status, 201)
    assert.equal((await call('/v1/state', 'GET', undefined, second)).data.activities.length, 0)
    assert.equal((await call('/v1/activities/' + saved.data.id, 'DELETE', undefined, second)).status, 404)
    assert.equal((await call('/v1/activities/' + saved.data.id, 'PATCH', { rpe: 3 }, second)).status, 404)
    assert.equal((await call('/v1/activities/' + saved.data.id, 'PATCH', { rpe: 8 }, first)).data.rpe, 8)
    const batch = { schemaVersion: 1, provider: 'coros', activities: [{ ...activity, rpe: null, externalId: 'watch-1', sport: 'running' }] }
    assert.equal((await call('/v1/activities/import', 'POST', batch, first)).data.imported, 1)
    assert.equal((await call('/v1/activities/import', 'POST', batch, first)).data.duplicates, 1)
    assert.equal((await call('/v1/activities/import', 'POST', batch, second)).data.imported, 1)
    assert.equal((await call('/v1/profile', 'PUT', { weeklyKm: 30, daysPerWeek: 4, weeksConsistent: 12, goal: '10k', isAdult: true }, first)).status, 200)
    assert.equal((await call('/v1/checkins', 'POST', { date: '2026-10-08', sleepHours: 8, fatigue: 2, soreness: 2, pain: 0, illness: false, redFlags: false }, first)).status, 200)
    const overview = await call('/v1/dashboard', 'GET', undefined, first)
    assert.equal(overview.status, 200); assert.equal(overview.data.readiness.state, 'easy'); assert.equal(overview.data.load.missingRpeCount, 1)
    const exported = (await call('/v1/export', 'GET', undefined, first)).data
    assert.equal(exported.activities.length, 2); assert.equal(exported.external_id, undefined); assert.equal(exported.token, undefined)
    assert.equal((await call('/v1/providers/werun/sync', 'POST', {}, first)).status, 409)
    assert.equal((await call('/v1/coach/explain', 'POST', { query: '恢复' }, first)).data.mode, 'curated-retrieval')
    assert.equal((await call('/v1/consent', 'POST', { granted: false }, first)).status, 200)
    assert.equal((await call('/v1/state', 'GET', undefined, first)).status, 403)
    await call('/v1/consent', 'POST', { granted: true }, first)
    assert.equal((await call('/v1/state', 'GET', undefined, first)).data.activities.length, 0)
    assert.equal((await call('/v1/state', 'GET', undefined, second)).data.activities.length, 1)
    await call('/v1/account', 'DELETE', undefined, first)
    assert.equal((await call('/v1/me', 'GET', undefined, first)).status, 401)
  } finally { await new Promise(resolve => app.server.close(resolve)); app.repository.close() }
})
test('真实部署拒绝不完整密钥，demo 不允许公开监听', () => {
  assert.throws(() => createApplication({ authMode: 'wechat' }), /AppID/)
  assert.throws(() => createApplication({ authMode: 'demo', host: '0.0.0.0' }), /本机/)
})
test('微信运动 AES 解密校验 AppID，服务端 session_key 加密往返', () => {
  const key = randomBytes(32), sessionKey = randomBytes(16).toString('base64')
  assert.equal(decryptSessionKey(encryptSessionKey(sessionKey, key), key), sessionKey)
  const iv = randomBytes(16), cipher = createCipheriv('aes-128-cbc', Buffer.from(sessionKey, 'base64'), iv)
  const data = { watermark: { appid: 'test-app' }, stepInfoList: [{ timestamp: 1791417600, step: 8000 }] }
  const encrypted = { encryptedData: Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final()]).toString('base64'), iv: iv.toString('base64') }
  assert.equal(decryptWeRun(encrypted, sessionKey, 'test-app', '2026-10-09', engine.dateKey)[0].step, 8000)
  assert.throws(() => decryptWeRun(encrypted, sessionKey, 'other-app', '2026-10-09', engine.dateKey), /来源/)
})
