import test from 'node:test'
import assert from 'node:assert/strict'
import { createApplication } from '../server/app.mjs'
test('Apple 健康 HTTP配对与同步、权限隔离、撤销连接', async () => {
  const app = createApplication({ allowLocalHealthTest: true, publicBaseUrl: 'https://running.example', now: () => new Date('2026-10-10T02:00:00Z') })
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve))
  const base = 'http://127.0.0.1:' + app.server.address().port
  const call = async (path, method = 'GET', body, token) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: response.status, data: await response.json() }
  }
  try {
    const token = (await call('/v1/auth/demo', 'POST', {})).data.token, other = (await call('/v1/auth/demo', 'POST', {})).data.token
    assert.equal((await call('/v1/apple-health/pairing', 'POST', {}, token)).status, 403)
    await call('/v1/consent', 'POST', { granted: true }, token)
    const pairing = await call('/v1/apple-health/pairing', 'POST', {}, token)
    assert.equal(pairing.status, 200)
    const credentials = await call('/v1/apple-health/exchange', 'POST', { code: pairing.data.code })
    assert.equal(credentials.status, 200)
    assert.equal((await call('/v1/apple-health/exchange', 'POST', { code: pairing.data.code })).status, 401)
    const bridgeToken = credentials.data.token
    assert.equal((await call('/v1/state', 'GET', undefined, bridgeToken)).status, 401)
    const change = { schemaVersion: 1, activities: [{ externalId: '11111111-1111-4111-8111-111111111111', sport: 'running', date: '2026-10-08', distanceKm: 5, durationSec: 1500, avgHr: 155 }], deletedExternalIds: [] }
    assert.equal((await call('/v1/apple-health/sync', 'POST', change, token)).status, 401)
    assert.equal((await call('/v1/apple-health/sync', 'POST', change, bridgeToken)).data.inserted, 1)
    assert.equal((await call('/v1/apple-health/sync', 'POST', change, bridgeToken)).data.updated, 1)
    const state = (await call('/v1/state', 'GET', undefined, token)).data
    assert.equal(state.activities.length, 1); assert.equal(state.activities[0].source, 'Apple 健康授权同步')
    assert.equal((await call('/v1/apple-health/status', 'GET', undefined, other)).data.connected, false)
    assert.ok((await call('/v1/apple-health/status', 'GET', undefined, token)).data.lastSyncedAt)
    assert.equal((await call('/v1/apple-health/connection', 'DELETE', { deleteImported: false }, token)).status, 200)
    assert.equal((await call('/v1/apple-health/sync', 'POST', change, bridgeToken)).status, 401)
    assert.equal((await call('/v1/state', 'GET', undefined, token)).data.activities.length, 1)
  } finally { await new Promise(resolve => app.server.close(resolve)); app.repository.close() }
})
