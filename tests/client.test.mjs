import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
test('本地体验在保存个人信息前清除示例；撤权后停止写入', async () => {
  const storage = new Map()
  globalThis.wx = { getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, structuredClone(value)), removeStorageSync: key => storage.delete(key) }
  const client = require('../miniprogram/services/client.js')
  const initial = await client.state()
  assert.equal(initial.containsExamples, true); assert.equal(initial.activities.length, 4)
  await assert.rejects(client.saveProfile({ weeklyKm: 30, daysPerWeek: 4, weeksConsistent: 10, isAdult: true, goal: '10k' }), /先/)
  await client.consent(true)
  await client.saveProfile({ weeklyKm: 30, daysPerWeek: 4, weeksConsistent: 10, isAdult: true, goal: '10k' })
  assert.equal((await client.state()).activities.length, 0)
  assert.equal((await client.state()).containsExamples, false)
  await client.consent(false)
  assert.equal((await client.state()).profile, null)
  await assert.rejects(client.saveActivity({ date: client.today(), distanceKm: 5, durationSec: 1500, rpe: 5, isRace: false }), /先/)
  delete globalThis.wx
})
