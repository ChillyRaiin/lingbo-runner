import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { engine, knowledge, imports, demo } from './domain.mjs'
import { SqliteRepository } from './repository.mjs'
import { codeToSession, encryptSessionKey, decryptSessionKey, decryptWeRun } from './adapters/wechat.mjs'
import { providerCapabilities } from './adapters/providers.mjs'
import { CoachService } from './services/coach.mjs'
import { RuleTrainingEngine } from './adapters/training.mjs'
import { LocalKnowledgeRetriever } from './adapters/local-knowledge.mjs'
import { DeepSeekChatAdapter } from './adapters/deepseek.mjs'
import { RunningAgentService } from './services/agent.mjs'
import { loadProjectKnowledge } from './adapters/project-knowledge.mjs'
import { AppleHealthService } from './services/apple-health.mjs'
import { APP_VERSION } from './config.mjs'
const error = (status, message) => Object.assign(new Error(message), { status })
async function readBody(request) {
  if (!String(request.headers['content-type'] || '').startsWith('application/json')) throw error(415, '需要 application/json')
  let size = 0; const chunks = []
  for await (const chunk of request) { size += chunk.length; if (size > 524288) throw error(413, '请求超过 512KB'); chunks.push(chunk) }
  let body
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') }
  catch { throw error(400, 'JSON 格式无效') }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw error(400, '请求体必须是JSON对象')
  return body
}
export function createApplication(config = {}) {
  const settings = { authMode: 'demo', host: '127.0.0.1', ...config }
  if (!['demo', 'wechat'].includes(settings.authMode)) throw new Error('AUTH_MODE 仅支持 demo 或 wechat')
  if (settings.authMode === 'demo' && !['127.0.0.1', 'localhost', '::1'].includes(settings.host)) throw new Error('demo 认证只能监听本机；公开部署请使用 wechat')
  if (settings.authMode === 'wechat' && (!settings.appId || !settings.appSecret || !Buffer.isBuffer(settings.encryptionKey) || settings.encryptionKey.length !== 32)) throw new Error('真实模式需要 AppID、AppSecret 和 32 字节服务端加密密钥')
  const repository = config.repository || new SqliteRepository(config.databasePath || ':memory:')
  const projectKnowledge = loadProjectKnowledge({ baseCatalog: knowledge, directory: config.projectKnowledgeDirectory, includePrivate: settings.authMode === 'demo' || config.privateLibraryAccess === true })
  const activeCatalog = projectKnowledge.catalog
  const appleHealth = new AppleHealthService({ repository, authMode: settings.authMode, publicBaseUrl: config.publicBaseUrl, allowLocalTest: config.allowLocalHealthTest === true && settings.host === '127.0.0.1', now: config.now })
  const agentRetriever = config.agentKnowledgeRetriever || new LocalKnowledgeRetriever({ catalog: activeCatalog, directory: config.knowledgeDirectory, includePrivate: settings.authMode === 'demo' && config.privateKnowledgeEnabled !== false, additionalDocuments: projectKnowledge.documents })
  const coach = new CoachService({ repository, engine: config.trainingEngine || new RuleTrainingEngine(engine), knowledgeRetriever: config.knowledgeRetriever || agentRetriever })
  const agent = new RunningAgentService({ repository, knowledgeRetriever: agentRetriever, trainingEngine: config.trainingEngine || new RuleTrainingEngine(engine), provider: config.chatProvider || new DeepSeekChatAdapter({ apiKey: config.deepseekApiKey, model: config.deepseekModel || 'deepseek-flash', baseUrl: config.deepseekBaseUrl || 'https://api.deepseek.com' }) })
  const limits = new Map()
  const pairingLimits = new Map()
  const server = createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    const send = (status, value) => { response.writeHead(status); response.end(JSON.stringify(value)) }
    try {
      const path = new URL(request.url, 'http://localhost').pathname, method = request.method
      const ip = request.socket.remoteAddress, now = Date.now()
      for (const [key, window] of limits) if (now - window.start > 60000) limits.delete(key)
      const window = limits.get(ip) || { start: now, count: 0 }; window.count++; limits.set(ip, window)
      if (window.count > 120) throw error(429, '请求过于频繁，请稍后重试')
      if (method === 'POST' && path === '/v1/apple-health/exchange') {
        for (const [key, limit] of pairingLimits) if (now - limit.start > 600000) pairingLimits.delete(key)
        const limit = pairingLimits.get(ip) || { start: now, count: 0 }; limit.count++; pairingLimits.set(ip, limit)
        if (limit.count > 10) throw error(429, '配对尝试过多，请10分钟后重试')
        return send(200, appleHealth.exchange(await readBody(request)))
      }
      if (method === 'POST' && path === '/v1/apple-health/sync') {
        const token = request.headers.authorization?.replace(/^Bearer /, '')
        return send(200, appleHealth.sync(token, await readBody(request)))
      }
      // 只给本机演示提供静态预览；不是已部署的网站或小程序模拟器。
      if (method === 'GET' && path === '/preview' && settings.authMode === 'demo') {
        response.setHeader('Content-Type', 'text/html; charset=utf-8')
        response.end(await readFile(new URL('../preview/index.html', import.meta.url))); return
      }
      if (method === 'GET' && path === '/preview-data' && settings.authMode === 'demo') {
        const today = engine.dateKey(config.now ? config.now() : new Date()), sample = demo.createDemo(today)
        const scenario = new URL(request.url, 'http://localhost').searchParams.get('scenario')
        if (scenario === 'tired') sample.checkins[0].fatigue = 5
        if (scenario === 'pain') sample.checkins[0].pain = 3
        if (scenario === 'missing') sample.checkins = []
        return send(200, { overview: engine.dashboard(sample, today), activities: sample.activities, knowledge: activeCatalog.cards, sources: activeCatalog.sources })
      }
      if (method === 'GET' && path === '/health') return send(200, { ok: true, version: APP_VERSION, authMode: settings.authMode })
      if (method === 'POST' && (path === '/v1/auth/demo' || path === '/v1/auth/wechat')) {
        const body = await readBody(request)
        let identity, sessionKey = null, resumeToken
        if (path.endsWith('/demo')) {
          if (settings.authMode !== 'demo') throw error(404, '入口不存在')
          if (Object.keys(body).some(key => key !== 'resumeToken')) throw error(400, '试用登录参数无效')
          const login = repository.demoIdentity(body.resumeToken); identity = login.user; resumeToken = login.resumeToken
        }
        else { if (settings.authMode !== 'wechat') throw error(409, '未启用微信真实登录'); const result = await codeToSession(body.code, settings); identity = repository.createUser(result.externalId); sessionKey = result.sessionKey }
        const token = randomBytes(32).toString('base64url'), expiresAt = now + 3600000
        repository.saveSession(token, identity.id, expiresAt, sessionKey ? encryptSessionKey(sessionKey, settings.encryptionKey) : null)
        return send(200, { token, expiresAt, mode: settings.authMode, consent: Boolean(identity.consent), ...(resumeToken ? { resumeToken } : {}) })
      }
      const token = request.headers.authorization?.replace(/^Bearer /, '')
      const session = token && repository.getSession(token)
      if (!session) throw error(401, '请重新登录')
      const userId = session.user_id, user = repository.getUser(userId), today = engine.dateKey(config.now ? config.now() : new Date())
      if (method === 'GET' && path === '/v1/me') return send(200, { consent: Boolean(user.consent), consentVersion: user.consent_version, mode: settings.authMode })
      if (method === 'GET' && path === '/v1/providers') return send(200, providerCapabilities)
      if (method === 'GET' && path === '/v1/apple-health/status') return send(200, appleHealth.status(userId))
      if (method === 'POST' && path === '/v1/apple-health/pairing') { const body = await readBody(request); if (Object.keys(body).length) throw error(400, '配对入口不接收用户身份'); return send(200, appleHealth.pairing(userId)) }
      if (method === 'DELETE' && path === '/v1/apple-health/connection') {
        const body = await readBody(request)
        if (typeof body.deleteImported !== 'boolean') throw error(400, '请明确是否清除已同步记录')
        repository.revokeAppleConnection(userId, body.deleteImported); return send(200, { disconnected: true })
      }
      if (method === 'GET' && path === '/v1/knowledge') return send(200, { cards: activeCatalog.cards, sources: activeCatalog.sources, metadata: activeCatalog.metadata })
      if (method === 'GET' && path === '/v1/agent/status') return send(200, agent.status(userId))
      if (method === 'POST' && path === '/v1/agent/consent') {
        if (!user.consent) throw error(403, '请先同意保存与处理对话记录')
        const body = await readBody(request)
        if (typeof body.enabled !== 'boolean' || typeof body.shareTraining !== 'boolean' || Object.keys(body).some(key => !['enabled', 'shareTraining'].includes(key))) throw error(400, '模型授权参数无效')
        return send(200, repository.setAgentSettings(userId, body))
      }
      if (method === 'GET' && path === '/v1/agent/history') return send(200, { messages: user.consent ? repository.getChatHistory(userId) : [] })
      if (method === 'DELETE' && path === '/v1/agent/history') { if (agent.running.has(userId)) throw error(409, '回答仍在处理中，请完成后清除对话'); repository.clearChatHistory(userId); return send(200, { cleared: true }) }
      if (method === 'POST' && path === '/v1/agent/chat') return send(200, await agent.chat(userId, await readBody(request), today))
      if (method === 'POST' && path === '/v1/coach/explain') { const body = await readBody(request); if (typeof body.query !== 'string' || body.query.length > 300) throw error(400, '查询限 300 字符'); return send(200, await coach.explain(body.query)) }
      if (method === 'POST' && path === '/v1/consent') {
        const body = await readBody(request)
        if (typeof body.granted !== 'boolean') throw error(400, '需要明确授权选择')
        if (body.granted) repository.setConsent(userId, true); else repository.deleteMetrics(userId)
        return send(200, { granted: body.granted, version: 'pilot-v1' })
      }
      if (method === 'DELETE' && path === '/v1/account') { repository.deleteUser(userId); return send(200, { deleted: true }) }
      if (!user.consent) throw error(403, '请先同意运动数据处理说明')
      if (method === 'GET' && path === '/v1/state') return send(200, repository.getState(userId))
      if (method === 'GET' && path === '/v1/dashboard') return send(200, coach.overview(userId, today))
      if (method === 'GET' && path === '/v1/export') return send(200, { schemaVersion: 1, exportedAt: new Date().toISOString(), ...repository.getState(userId), chatMessages: repository.getChatHistory(userId), agentSettings: repository.getAgentSettings(userId) })
      if (method === 'PUT' && path === '/v1/profile') { repository.saveProfile(userId, engine.validateProfile(await readBody(request))); return send(200, { saved: true }) }
      if (method === 'POST' && path === '/v1/activities') return send(201, repository.saveActivity(userId, engine.validateActivity(await readBody(request), today)))
      if (method === 'POST' && path === '/v1/activities/import') return send(200, repository.importActivities(userId, imports.normalizeImport(await readBody(request), today)))
      const match = /^\/v1\/activities\/([a-zA-Z0-9-]+)$/.exec(path)
      if (method === 'DELETE' && match) { if (!repository.deleteActivity(userId, match[1])) throw error(404, '记录不存在'); return send(200, { deleted: true }) }
      if (method === 'PATCH' && match) {
        const body = await readBody(request)
        if (Object.keys(body).some(key => !['rpe', 'isRace'].includes(key))) throw error(400, '此入口仅修改 RPE 和比赛标记')
        const updated = repository.updateActivity(userId, match[1], body, engine.validateActivity, today)
        if (!updated) throw error(404, '记录不存在')
        return send(200, updated)
      }
      if (method === 'POST' && path === '/v1/checkins') { repository.saveCheckin(userId, engine.validateCheckin(await readBody(request), today)); return send(200, { saved: true }) }
      if (method === 'POST' && path === '/v1/providers/werun/sync') {
        if (settings.authMode !== 'wechat' || !session.encrypted_session_key) throw error(409, '需要真实微信登录')
        const values = decryptWeRun(await readBody(request), decryptSessionKey(session.encrypted_session_key, settings.encryptionKey), settings.appId, today, engine.dateKey)
        repository.saveSteps(userId, values); return send(200, { synced: values.length, dataType: 'daily-steps' })
      }
      throw error(404, '接口不存在')
    } catch (cause) {
      // 绝不把 SQL、登录 URL、AppSecret 或 session_key 写入返回值/日志。
      const status = Number.isInteger(cause.status) && cause.status >= 400 && cause.status <= 599 ? cause.status : 500
      send(status, { error: status >= 500 ? '服务异常，请稍后重试' : cause.message })
    }
  })
  return { server, repository, coach, agent, appleHealth }
}
