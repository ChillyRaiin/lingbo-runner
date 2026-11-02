import test from 'node:test'
import assert from 'node:assert/strict'
import { createApplication } from '../server/app.mjs'
test('开发身份跨访问会话恢复、异常请求分级且不泄漏内部错误', async () => {
  const app = createApplication({ trainingEngine: { evaluate() { throw new Error('private-internal-fixture') } } })
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve))
  const base = 'http://127.0.0.1:' + app.server.address().port
  const call = async (path, method = 'GET', body, token) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: response.status, data: await response.json() }
  }
  try {
    for (const body of [null, [], 42, 'text', false]) assert.equal((await call('/v1/auth/demo', 'POST', body)).status, 400)
    const first = (await call('/v1/auth/demo', 'POST', {})).data
    await call('/v1/consent', 'POST', { granted: true }, first.token)
    await call('/v1/activities', 'POST', { date: '2026-10-01', distanceKm: 5, durationSec: 1500, rpe: 3, isRace: false }, first.token)
    app.repository.db.prepare('UPDATE sessions SET expires_at=0').run()
    const second = (await call('/v1/auth/demo', 'POST', { resumeToken: first.resumeToken })).data
    assert.notEqual(first.token, second.token)
    assert.equal((await call('/v1/state', 'GET', undefined, second.token)).data.activities.length, 1)
    const isolated = (await call('/v1/auth/demo', 'POST', {})).data
    await call('/v1/consent', 'POST', { granted: true }, isolated.token)
    assert.equal((await call('/v1/state', 'GET', undefined, isolated.token)).data.activities.length, 0)
    const failed = await call('/v1/dashboard', 'GET', undefined, second.token)
    assert.equal(failed.status, 500); assert.equal(JSON.stringify(failed.data).includes('private-internal-fixture'), false)
    assert.equal((await call('/v1/activities', 'POST', { date: 'bad' }, second.token)).status, 400)
    await call('/v1/account', 'DELETE', undefined, second.token)
    assert.equal((await call('/v1/auth/demo', 'POST', { resumeToken: second.resumeToken })).status, 401)
  } finally { await new Promise(resolve => app.server.close(resolve)); app.repository.close() }
})
