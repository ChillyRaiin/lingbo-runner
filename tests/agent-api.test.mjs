import test from 'node:test'
import assert from 'node:assert/strict'
import { createApplication } from '../server/app.mjs'
test('Agent HTTP 闭环：状态、聊天、来源、授权、清除、跨用户隔离与 Apple 导入', async () => {
  const app = createApplication({ now: () => new Date('2026-10-09T02:00:00Z') })
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve))
  const base = 'http://127.0.0.1:' + app.server.address().port
  const call = async (path, method = 'GET', body, token) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: response.status, data: await response.json() }
  }
  try {
    const token = (await call('/v1/auth/demo', 'POST', {})).data.token, other = (await call('/v1/auth/demo', 'POST', {})).data.token
    const status = (await call('/v1/agent/status', 'GET', undefined, token)).data
    assert.equal(status.configured, false); assert.equal(status.model, 'deepseek-flash'); assert.equal(status.dataConsent, false)
    const message = { message: '疲劳时如何恢复？', useRemoteModel: false, useTrainingContext: false }
    assert.equal((await call('/v1/agent/chat', 'POST', message, token)).status, 403)
    await call('/v1/consent', 'POST', { granted: true }, token)
    const reply = await call('/v1/agent/chat', 'POST', message, token)
    assert.equal(reply.status, 200); assert.equal(reply.data.mode, 'local'); assert.ok(reply.data.citations.length)
    assert.equal((await call('/v1/agent/history', 'GET', undefined, token)).data.messages.length, 2)
    assert.equal((await call('/v1/agent/history', 'GET', undefined, other)).data.messages.length, 0)
    assert.equal((await call('/v1/agent/chat', 'POST', { ...message, useRemoteModel: true }, token)).status, 403)
    await call('/v1/agent/consent', 'POST', { enabled: true, shareTraining: false }, token)
    assert.match((await call('/v1/agent/chat', 'POST', { ...message, useRemoteModel: true }, token)).data.notice, /未配置/)
    assert.equal((await call('/v1/agent/chat', 'POST', { ...message, useRemoteModel: true, useTrainingContext: true }, token)).status, 403)
    const batch = { schemaVersion: 1, provider: 'apple-health', activities: [{ externalId: 'synthetic-apple-watch-run', sport: 'running', date: '2026-10-02', distanceKm: 5, durationSec: 1500, rpe: null, isRace: false, avgHr: 155 }] }
    assert.equal((await call('/v1/activities/import', 'POST', batch, token)).data.imported, 1)
    assert.equal((await call('/v1/activities/import', 'POST', batch, token)).data.duplicates, 1)
    const exported = (await call('/v1/export', 'GET', undefined, token)).data
    assert.equal(exported.activities[0].provider, 'apple-health'); assert.equal(exported.chatMessages.length, 4)
    await call('/v1/agent/history', 'DELETE', undefined, token)
    assert.equal((await call('/v1/agent/history', 'GET', undefined, token)).data.messages.length, 0)
    await call('/v1/consent', 'POST', { granted: false }, token)
    assert.equal((await call('/v1/agent/status', 'GET', undefined, token)).data.settings.enabled, false)
  } finally { await new Promise(resolve => app.server.close(resolve)); app.repository.close() }
})
