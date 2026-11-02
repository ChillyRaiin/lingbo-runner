import { randomBytes, randomInt } from 'node:crypto'
import { engine } from '../domain.mjs'
const fail = (status, message) => Object.assign(new Error(message), { status })
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class AppleHealthService {
  constructor({ repository, authMode, publicBaseUrl = '', allowLocalTest = false, now = () => new Date() }) {
    this.repository = repository; this.now = () => new Date(now()).getTime(); this.publicBaseUrl = publicBaseUrl.replace(/\/$/, '')
    const url = publicBaseUrl ? new URL(publicBaseUrl) : null
    if (url && (url.username || url.password || url.search || url.hash)) throw new Error('公开服务地址不能包含身份、查询参数或片段')
    this.canPair = authMode === 'wechat' && url?.protocol === 'https:' || allowLocalTest
  }
  status(userId) {
    const row = this.repository.getAppleConnection(userId), connected = Boolean(row && !row.revoked_at && row.expires_at > this.now())
    return { provider: 'apple-health-sync', connected, canPair: Boolean(this.canPair), publicBaseUrl: this.publicBaseUrl, lastSyncedAt: row?.last_synced_at || null, expiresAt: connected ? row.expires_at : null, description: '由 iOS 伴随端在用户授权后读取 HealthKit。小程序通过后端读取同步记录。', limitation: '后台唤醒由 iOS 决定；首次权限需本人确认，模拟器无法验证后台投递。', setupRequired: this.canPair ? null : '需要真实微信登录、可从 iPhone 访问的 HTTPS 后端，以及安装 iOS 伴随端。' }
  }
  pairing(userId) {
    if (!this.canPair) throw fail(409, '先配置真实微信登录和 HTTPS 后端，再进行 iPhone 配对')
    if (!this.repository.getUser(userId)?.consent) throw fail(403, '请先同意处理跑步数据')
    const code = String(randomInt(10000000, 100000000)), expiresAt = this.now() + 5 * 60000
    this.repository.createApplePairing(userId, code, expiresAt, this.now())
    return { code, expiresAt, publicBaseUrl: this.publicBaseUrl, instructions: '在循跑健康桥接 iOS App 中填写服务地址和配对码，再申请健康读取权限。配对码5分钟有效且仅可使用一次。' }
  }
  exchange(input) {
    if (!this.canPair || typeof input?.code !== 'string' || !/^\d{8}$/.test(input.code) || Object.keys(input).some(key => key !== 'code')) throw fail(400, '配对参数无效')
    const token = randomBytes(32).toString('base64url'), expiresAt = this.now() + 90 * 86400000
    const connection = this.repository.exchangeApplePairing(input.code, token, this.now(), expiresAt)
    if (!connection) throw fail(401, '配对码已失效或已使用')
    return { token, expiresAt, connectionId: connection.id, scope: 'apple-health:write-running' }
  }
  sync(token, input) {
    const connection = token && this.repository.getAppleCredential(token, this.now())
    if (!connection || !this.repository.getUser(connection.user_id)?.consent) throw fail(401, '同步连接已撤销或过期，请重新配对')
    if (!input || input.schemaVersion !== 1 || !Array.isArray(input.activities) || input.activities.length > 100 || !Array.isArray(input.deletedExternalIds) || input.deletedExternalIds.length > 100 || Object.keys(input).some(key => !['schemaVersion', 'activities', 'deletedExternalIds'].includes(key))) throw fail(400, '增量同步格式无效，一批最多100条')
    const today = engine.dateKey(this.now())
    const values = input.activities.map(value => {
      if (!uuidPattern.test(value.externalId || '') || value.sport !== 'running') throw fail(400, '只接收具有 HealthKit UUID 的跑步记录')
      const checked = engine.validateActivity({ ...value, rpe: 1, isRace: false }, today)
      return { ...checked, rpe: null, isRace: false, provider: 'apple-health-sync', externalId: value.externalId.toLowerCase(), sport: 'running', source: 'Apple 健康授权同步' }
    })
    const deleted = input.deletedExternalIds.map(id => { if (typeof id !== 'string' || !uuidPattern.test(id)) throw fail(400, '删除标识无效'); return id.toLowerCase() })
    return this.repository.applyAppleChanges(connection, values, deleted, new Date(this.now()).toISOString())
  }
}
