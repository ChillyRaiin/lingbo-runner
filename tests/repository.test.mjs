import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { SqliteRepository } from '../server/repository.mjs'
test('数据库重启后保留记录，迁移只运行一次', () => {
  const directory = new URL('../.private/qa/', import.meta.url); mkdirSync(directory, { recursive: true })
  const path = fileURLToPath(new URL('repository-' + randomUUID() + '.sqlite', directory))
  let repository = new SqliteRepository(path)
  const user = repository.createUser('synthetic-persistence-test')
  repository.setConsent(user.id, true)
  repository.saveActivity(user.id, { date: '2026-10-01', distanceKm: 5, durationSec: 1500, rpe: 3, isRace: false, source: 'synthetic-test' })
  repository.close()
  repository = new SqliteRepository(path)
  assert.equal(repository.getState(user.id).activities.length, 1)
  assert.equal(repository.getState(user.id).consent, true)
  assert.equal(repository.db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n, 4)
  assert.deepEqual(repository.getAgentSettings(user.id), { enabled: false, shareTraining: false, version: 'agent-v1' })
  repository.close()
})
