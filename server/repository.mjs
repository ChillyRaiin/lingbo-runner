import { DatabaseSync } from 'node:sqlite'
import { readFileSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID, randomBytes, createHash } from 'node:crypto'
const hash = value => createHash('sha256').update(value).digest('hex')
export class SqliteRepository {
  constructor(path = ':memory:') {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.db = new DatabaseSync(path)
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;')
    // 所有迁移按版本且仅运行一次；后续可新增 002-*.sql，无需修改路由。
    this.db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)')
    const directory = new URL('./migrations/', import.meta.url)
    for (const file of readdirSync(directory).filter(name => /^\d+-.*\.sql$/.test(name)).sort()) {
      const version = Number(file.split('-')[0])
      if (this.db.prepare('SELECT version FROM schema_migrations WHERE version=?').get(version)) continue
      this.db.exec('BEGIN')
      try { this.db.exec(readFileSync(new URL(file, directory), 'utf8')); this.db.prepare('INSERT INTO schema_migrations VALUES (?,?)').run(version, new Date().toISOString()); this.db.exec('COMMIT') }
      catch (error) { this.db.exec('ROLLBACK'); throw error }
    }
  }
  createUser(externalId = null) {
    if (externalId) { const row = this.db.prepare('SELECT * FROM users WHERE external_id=?').get(externalId); if (row) return row }
    const id = randomUUID()
    this.db.prepare('INSERT INTO users (id,external_id,created_at) VALUES (?,?,?)').run(id, externalId, new Date().toISOString())
    return this.getUser(id)
  }
  getUser(id) { return this.db.prepare('SELECT * FROM users WHERE id=?').get(id) }
  demoIdentity(resumeToken) {
    const expiry = Date.now() + 7 * 86400000
    if (resumeToken !== undefined) {
      if (typeof resumeToken !== 'string' || !/^[a-zA-Z0-9_-]{43}$/.test(resumeToken)) throw Object.assign(new Error('试用身份凭据无效'), { status: 400 })
      const identity = this.db.prepare('SELECT user_id FROM demo_identities WHERE credential_hash=? AND expires_at>?').get(hash(resumeToken), Date.now())
      if (!identity) throw Object.assign(new Error('试用身份已过期，请重新授权创建试用身份'), { status: 401 })
      this.db.prepare('UPDATE demo_identities SET expires_at=? WHERE credential_hash=?').run(expiry, hash(resumeToken))
      return { user: this.getUser(identity.user_id), resumeToken }
    }
    const user = this.createUser(), credential = randomBytes(32).toString('base64url')
    this.db.prepare('INSERT INTO demo_identities VALUES (?,?,?)').run(hash(credential), user.id, expiry)
    return { user, resumeToken: credential }
  }
  saveSession(token, userId, expiresAt, encryptedKey = null) {
    this.db.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now())
    this.db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(hash(token), userId, expiresAt, encryptedKey)
  }
  getSession(token) { return this.db.prepare('SELECT * FROM sessions WHERE token_hash=? AND expires_at>?').get(hash(token), Date.now()) }
  setConsent(userId, granted) {
    this.db.prepare('UPDATE users SET consent=?,consent_version=?,consent_at=? WHERE id=?').run(granted ? 1 : 0, 'pilot-v1', new Date().toISOString(), userId)
  }
  getState(userId) {
    const user = this.getUser(userId), profile = this.db.prepare('SELECT payload FROM profiles WHERE user_id=?').get(userId)
    return { consent: Boolean(user?.consent), profile: profile ? JSON.parse(profile.payload) : null, activities: this.db.prepare('SELECT id,payload FROM activities WHERE user_id=? ORDER BY date DESC,id').all(userId).map(row => ({ ...JSON.parse(row.payload), id: row.id })), checkins: this.db.prepare('SELECT payload FROM checkins WHERE user_id=? ORDER BY date DESC').all(userId).map(row => JSON.parse(row.payload)), steps: this.db.prepare('SELECT date,step FROM steps WHERE user_id=? ORDER BY date').all(userId) }
  }
  saveProfile(userId, profile) { this.db.prepare('INSERT INTO profiles VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload').run(userId, JSON.stringify(profile)) }
  saveActivity(userId, value) {
    const id = randomUUID()
    const result = this.db.prepare('INSERT OR IGNORE INTO activities VALUES (?,?,?,?,?,?)').run(id, userId, value.date, value.provider || null, value.externalId || null, JSON.stringify(value))
    return result.changes ? { ...value, id } : null
  }
  importActivities(userId, values) {
    this.db.exec('BEGIN')
    try { const saved = values.map(value => this.saveActivity(userId, value)).filter(Boolean); this.db.exec('COMMIT'); return { imported: saved.length, duplicates: values.length - saved.length } }
    catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  deleteActivity(userId, id) { return this.db.prepare('DELETE FROM activities WHERE user_id=? AND id=?').run(userId, id).changes > 0 }
  updateActivity(userId, id, patch, validator, today) {
    const row = this.db.prepare('SELECT payload FROM activities WHERE user_id=? AND id=?').get(userId, id)
    if (!row) return null
    const previous = JSON.parse(row.payload)
    const changesRpe = Object.hasOwn(patch, 'rpe')
    const checked = validator({ ...previous, ...patch, rpe: changesRpe ? patch.rpe : (previous.rpe ?? 1) }, today)
    const next = { ...previous, rpe: changesRpe ? checked.rpe : previous.rpe, isRace: checked.isRace }
    this.db.prepare('UPDATE activities SET payload=? WHERE user_id=? AND id=?').run(JSON.stringify(next), userId, id)
    return { ...next, id }
  }
  saveCheckin(userId, value) { this.db.prepare('INSERT INTO checkins VALUES (?,?,?) ON CONFLICT(user_id,date) DO UPDATE SET payload=excluded.payload').run(userId, value.date, JSON.stringify(value)) }
  saveSteps(userId, values) {
    const stmt = this.db.prepare('INSERT INTO steps VALUES (?,?,?) ON CONFLICT(user_id,date) DO UPDATE SET step=excluded.step')
    this.db.exec('BEGIN')
    try { values.forEach(v => stmt.run(userId, v.date, v.step)); this.db.exec('COMMIT') }
    catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  deleteMetrics(userId) {
    this.db.exec('BEGIN')
    try { for (const table of ['profiles', 'activities', 'checkins', 'steps', 'chat_messages', 'agent_settings', 'apple_health_pairings', 'apple_health_connections']) this.db.prepare('DELETE FROM ' + table + ' WHERE user_id=?').run(userId); this.setConsent(userId, false); this.db.exec('COMMIT') }
    catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  deleteUser(userId) { this.db.prepare('DELETE FROM users WHERE id=?').run(userId) }
  getAgentSettings(userId) {
    const row = this.db.prepare('SELECT * FROM agent_settings WHERE user_id=?').get(userId)
    return { enabled: Boolean(row?.enabled), shareTraining: Boolean(row?.share_training), version: row?.consent_version || 'agent-v1' }
  }
  setAgentSettings(userId, { enabled, shareTraining }) {
    this.db.prepare('INSERT INTO agent_settings VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled,share_training=excluded.share_training,consent_version=excluded.consent_version,consent_at=excluded.consent_at').run(userId, enabled ? 1 : 0, enabled && shareTraining ? 1 : 0, 'agent-v1', new Date().toISOString())
    return this.getAgentSettings(userId)
  }
  getChatHistory(userId, limit = 40) {
    return this.db.prepare('SELECT id,role,content,metadata,created_at FROM chat_messages WHERE user_id=? ORDER BY id DESC LIMIT ?').all(userId, Math.max(1, Math.min(limit, 40))).reverse().map(row => ({ id: row.id, role: row.role, content: row.content, createdAt: row.created_at, ...JSON.parse(row.metadata) }))
  }
  saveChatTurn(userId, question, result) {
    this.db.exec('BEGIN')
    try {
      const insert = this.db.prepare('INSERT INTO chat_messages(user_id,role,content,metadata,created_at) VALUES (?,?,?,?,?)'), time = new Date().toISOString()
      insert.run(userId, 'user', question, JSON.stringify({ originalEvidenceUsed: Boolean(result.originalEvidenceUsed) }), time)
      const { answer, ...metadata } = result
      insert.run(userId, 'assistant', answer, JSON.stringify(metadata), time)
      this.db.prepare('DELETE FROM chat_messages WHERE user_id=? AND id NOT IN (SELECT id FROM chat_messages WHERE user_id=? ORDER BY id DESC LIMIT 40)').run(userId, userId)
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  clearChatHistory(userId) { this.db.prepare('DELETE FROM chat_messages WHERE user_id=?').run(userId) }
  createApplePairing(userId, code, expiresAt, now = Date.now()) {
    this.db.prepare('DELETE FROM apple_health_pairings WHERE user_id=? OR expires_at<?').run(userId, now)
    this.db.prepare('INSERT INTO apple_health_pairings VALUES (?,?,?)').run(hash(code), userId, expiresAt)
  }
  exchangeApplePairing(code, token, now, expiresAt) {
    this.db.exec('BEGIN')
    try {
      const pairing = this.db.prepare('SELECT * FROM apple_health_pairings WHERE code_hash=? AND expires_at>?').get(hash(code), now)
      if (!pairing || !this.getUser(pairing.user_id)?.consent) { this.db.exec('ROLLBACK'); return null }
      this.db.prepare('DELETE FROM apple_health_pairings WHERE code_hash=?').run(hash(code))
      this.db.prepare('DELETE FROM apple_health_connections WHERE user_id=?').run(pairing.user_id)
      const id = randomUUID()
      this.db.prepare('INSERT INTO apple_health_connections(id,user_id,token_hash,expires_at,connected_at) VALUES (?,?,?,?,?)').run(id, pairing.user_id, hash(token), expiresAt, new Date(now).toISOString())
      this.db.exec('COMMIT'); return { id, userId: pairing.user_id }
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  getAppleCredential(token, now) { return this.db.prepare('SELECT * FROM apple_health_connections WHERE token_hash=? AND expires_at>? AND revoked_at IS NULL').get(hash(token), now) }
  getAppleConnection(userId) { return this.db.prepare('SELECT id,expires_at,connected_at,last_synced_at,revoked_at FROM apple_health_connections WHERE user_id=?').get(userId) || null }
  revokeAppleConnection(userId, deleteImported = false) {
    this.db.exec('BEGIN')
    try {
      this.db.prepare('UPDATE apple_health_connections SET revoked_at=? WHERE user_id=?').run(new Date().toISOString(), userId)
      this.db.prepare('DELETE FROM apple_health_pairings WHERE user_id=?').run(userId)
      if (deleteImported) this.db.prepare('DELETE FROM activities WHERE user_id=? AND provider=?').run(userId, 'apple-health-sync')
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  applyAppleChanges(connection, values, deletedIds, time) {
    this.db.exec('BEGIN')
    try {
      let inserted = 0, updated = 0, deleted = 0
      for (const value of values) {
        const row = this.db.prepare('SELECT id,payload FROM activities WHERE user_id=? AND provider=? AND external_id=?').get(connection.user_id, 'apple-health-sync', value.externalId)
        if (!row) { this.saveActivity(connection.user_id, value); inserted++ }
        else {
          const previous = JSON.parse(row.payload), next = { ...value, rpe: previous.rpe, isRace: previous.isRace }
          this.db.prepare('UPDATE activities SET date=?,payload=? WHERE id=? AND user_id=?').run(value.date, JSON.stringify(next), row.id, connection.user_id); updated++
        }
      }
      for (const id of deletedIds) deleted += Number(this.db.prepare('DELETE FROM activities WHERE user_id=? AND provider=? AND external_id=?').run(connection.user_id, 'apple-health-sync', id).changes)
      this.db.prepare('UPDATE apple_health_connections SET last_synced_at=? WHERE id=? AND revoked_at IS NULL').run(time, connection.id)
      this.db.exec('COMMIT'); return { inserted, updated, deleted, lastSyncedAt: time }
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  close() { this.db.close() }
}
