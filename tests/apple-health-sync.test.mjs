import test from 'node:test'
import assert from 'node:assert/strict'
import { createApplication } from '../server/app.mjs'
import { engine } from '../server/domain.mjs'
const firstId = '11111111-1111-4111-8111-111111111111', secondId = '22222222-2222-4222-8222-222222222222'
const run = (id = firstId) => ({ externalId: id, sport: 'running', date: '2026-10-08', distanceKm: 5, durationSec: 1500, avgHr: 155 })
const batch = (values, deleted = []) => ({ schemaVersion: 1, activities: values, deletedExternalIds: deleted })
function setup(t) {
  let now = new Date('2026-10-10T02:00:00Z')
  const app = createApplication({ allowLocalHealthTest: true, publicBaseUrl: 'https://running.example', now: () => now })
  const user = app.repository.createUser(), other = app.repository.createUser()
  app.repository.setConsent(user.id, true); app.repository.setConsent(other.id, true)
  t.after(() => app.repository.close())
  return { ...app, userId: user.id, otherId: other.id, advance: seconds => { now = new Date(now.getTime() + seconds * 1000) } }
}
function connect(service, id) { return service.exchange({ code: service.pairing(id).code }) }
test('配对码一次使用、5分钟有效，同步凭据不授权读取账户', t => {
  const { appleHealth, repository, userId, advance } = setup(t)
  const code = appleHealth.pairing(userId).code
  const result = appleHealth.exchange({ code })
  assert.equal(result.scope, 'apple-health:write-running')
  assert.equal(repository.getSession(result.token), undefined)
  assert.throws(() => appleHealth.exchange({ code }), error => error.status === 401)
  const expired = appleHealth.pairing(userId).code; advance(301)
  assert.throws(() => appleHealth.exchange({ code: expired }), error => error.status === 401)
})
test('重复同步保持单条记录，保留用户的RPE和比赛标记', t => {
  const { appleHealth, repository, userId } = setup(t), credentials = connect(appleHealth, userId)
  assert.equal(appleHealth.sync(credentials.token, batch([run()])).inserted, 1)
  const activity = repository.getState(userId).activities[0]
  repository.updateActivity(userId, activity.id, { rpe: 8, isRace: true }, engine.validateActivity, '2026-10-10')
  assert.equal(appleHealth.sync(credentials.token, batch([{ ...run(), durationSec: 1490 }])).updated, 1)
  const values = repository.getState(userId).activities
  assert.equal(values.length, 1); assert.equal(values[0].durationSec, 1490); assert.equal(values[0].rpe, 8); assert.equal(values[0].isRace, true)
})
test('删除只影响当前配对用户的同步记录，手动与文件导入不受影响', t => {
  const { appleHealth, repository, userId, otherId } = setup(t)
  const a = connect(appleHealth, userId), b = connect(appleHealth, otherId)
  appleHealth.sync(a.token, batch([run()])); appleHealth.sync(b.token, batch([run()]))
  repository.saveActivity(userId, { ...engine.validateActivity({ ...run(), rpe: 3, isRace: false }, '2026-10-10'), provider: 'apple-health', externalId: firstId })
  assert.equal(appleHealth.sync(a.token, batch([], [firstId])).deleted, 1)
  assert.equal(repository.getState(userId).activities.length, 1)
  assert.equal(repository.getState(otherId).activities.length, 1)
})
test('撤销、重配对和撤回全部数据授权使旧凭据立即失效', t => {
  const { appleHealth, repository, userId } = setup(t)
  const old = connect(appleHealth, userId), current = connect(appleHealth, userId)
  assert.throws(() => appleHealth.sync(old.token, batch([run()])), error => error.status === 401)
  appleHealth.sync(current.token, batch([run()]))
  repository.revokeAppleConnection(userId)
  assert.throws(() => appleHealth.sync(current.token, batch([run()])), error => error.status === 401)
  const newer = connect(appleHealth, userId); repository.deleteMetrics(userId)
  assert.throws(() => appleHealth.sync(newer.token, batch([run()])), error => error.status === 401)
  assert.equal(repository.getState(userId).activities.length, 0)
})
test('批次预先验证且不接受客户端用户身份、伪造课型或半有效批次', t => {
  const { appleHealth, repository, userId } = setup(t), credentials = connect(appleHealth, userId)
  assert.throws(() => appleHealth.sync(credentials.token, { ...batch([run()]), userId: 'other' }), error => error.status === 400)
  assert.throws(() => appleHealth.sync(credentials.token, batch([run(), { ...run(secondId), sport: 'cycling' }])), error => error.status === 400)
  assert.equal(repository.getState(userId).activities.length, 0)
  const short = { ...run(), distanceKm: 0.1, durationSec: 30 }
  assert.equal(appleHealth.sync(credentials.token, batch([short])).inserted, 1)
})
