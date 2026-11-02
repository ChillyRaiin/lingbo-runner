const config = require('../config')
const engine = require('../domain/engine')
const knowledge = require('../data/knowledge')
const { createDemo, createEmpty } = require('../data/demo')
const { normalizeImport } = require('../domain/imports')
const STATE_KEY = 'xunrun-demo-v1', TOKEN_KEY = 'xunrun-api-session-v1', GUEST_KEY = 'xunrun-api-guest-v1', CHAT_KEY = 'xunrun-local-chat-v1', IDENTITY_KEY = 'xunrun-demo-identity-v1'
const usesAgentApi = () => config.agentMode === 'api' || config.mode === 'api'
const hasAgentSession = () => { const session = wx.getStorageSync(TOKEN_KEY); return usesAgentApi() && session?.authMode === config.apiAuthMode && session?.baseUrl === config.apiBaseUrl && !isGuest() }
let pendingLogin = null
const guestScope = () => config.apiAuthMode + '|' + config.apiBaseUrl
const isGuest = () => wx.getStorageSync(GUEST_KEY) === guestScope()
const today = () => engine.dateKey(new Date())
function wxCall(name, options) { return new Promise((resolve, reject) => wx[name]({ ...options, success: resolve, fail: reject })) }
function mockState() {
  let value = wx.getStorageSync(STATE_KEY)
  if (!value) { value = { ...createDemo(today()), containsExamples: true }; wx.setStorageSync(STATE_KEY, value) }
  return value
}
function persist(value) { wx.setStorageSync(STATE_KEY, value); return value }
function ownState() {
  const value = mockState()
  if (!value.consent) throw new Error('请先在“我的”中同意数据处理说明')
  // 写入真实个人信息前清除演示数据，避免混用示例进行判断。
  return value.containsExamples ? persist({ ...createEmpty(), consent: true, containsExamples: false }) : value
}
async function login(force) {
  if (isGuest()) throw new Error('账户已删除；如需重新使用，请在“我的”中重新同意数据处理说明')
  const existing = wx.getStorageSync(TOKEN_KEY)
  if (!force && existing && existing.expiresAt > Date.now() + 10000 && existing.authMode === config.apiAuthMode && existing.baseUrl === config.apiBaseUrl) return existing.token
  // 多个页面同时加载时共用一次登录，避免开发模式创建多个不同用户。
  if (!pendingLogin) pendingLogin = (async () => {
    const identity = wx.getStorageSync(IDENTITY_KEY)
    const resumeToken = identity?.baseUrl === config.apiBaseUrl ? identity.resumeToken : undefined
    const body = config.apiAuthMode === 'wechat' ? { code: (await wxCall('login', {})).code } : (resumeToken ? { resumeToken } : {})
    let result
    try { result = await rawRequest('/v1/auth/' + config.apiAuthMode, 'POST', body) }
    catch (error) {
      if (config.apiAuthMode === 'demo' && error.statusCode === 401) { wx.removeStorageSync(IDENTITY_KEY); wx.setStorageSync(GUEST_KEY, guestScope()) }
      throw error
    }
    wx.setStorageSync(TOKEN_KEY, { ...result, authMode: config.apiAuthMode, baseUrl: config.apiBaseUrl })
    if (config.apiAuthMode === 'demo' && result.resumeToken) wx.setStorageSync(IDENTITY_KEY, { resumeToken: result.resumeToken, baseUrl: config.apiBaseUrl })
    return result.token
  })()
  const attempt = pendingLogin
  try { return await attempt } finally { if (pendingLogin === attempt) pendingLogin = null }
}
async function rawRequest(path, method, data, token, timeout = 12000) {
  const response = await wxCall('request', { url: config.apiBaseUrl + path, method, data, timeout, header: { 'content-type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) } })
  if (response.statusCode < 200 || response.statusCode >= 300) {
    if (response.statusCode === 401 && wx.getStorageSync(TOKEN_KEY)?.token === token) wx.removeStorageSync(TOKEN_KEY)
    throw Object.assign(new Error(response.data?.error || '服务请求失败'), { statusCode: response.statusCode })
  }
  return response.data
}
async function request(path, method = 'GET', data) {
  const token = await login(false)
  try { return await rawRequest(path, method, data, token) }
  catch (error) {
    // 仅对只读请求重新登录后重试一次；写入和模型调用不自动重发。
    if (method === 'GET' && error.statusCode === 401) return rawRequest(path, method, data, await login(true))
    throw error
  }
}
async function state() {
  if (config.mode === 'demo') return mockState()
  if (isGuest()) return createEmpty()
  const me = await request('/v1/me')
  return me.consent ? request('/v1/state') : createEmpty()
}
async function overview() {
  if (config.mode === 'demo') return engine.dashboard(mockState(), today())
  if (isGuest()) return engine.dashboard(createEmpty(), today())
  const me = await request('/v1/me')
  // API 模式的个体分析由后端负责，替换策略后客户端直接展示新模型结果。
  return me.consent ? request('/v1/dashboard') : engine.dashboard(createEmpty(), today())
}
async function consent(granted) {
  if (!granted) await purgeCachedExport()
  if (!granted) wx.removeStorageSync(CHAT_KEY)
  if (config.mode === 'demo' && !granted && hasAgentSession()) await request('/v1/consent', 'POST', { granted: false })
  if (config.mode === 'demo') return persist(granted ? { ...mockState(), consent: true } : { ...createEmpty(), containsExamples: false })
  if (granted) wx.removeStorageSync(GUEST_KEY)
  else if (isGuest()) return { granted: false }
  return request('/v1/consent', 'POST', { granted })
}
async function saveProfile(input) {
  const value = engine.validateProfile(input)
  if (config.mode !== 'demo') return request('/v1/profile', 'PUT', value)
  const data = ownState(); data.profile = value; return persist(data)
}
async function saveActivity(input) {
  const value = engine.validateActivity(input, today())
  if (config.mode !== 'demo') return request('/v1/activities', 'POST', value)
  const data = ownState(); data.activities.unshift({ ...value, id: 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) }); return persist(data)
}
async function saveCheckin(input) {
  const value = engine.validateCheckin(input, today())
  if (config.mode !== 'demo') return request('/v1/checkins', 'POST', value)
  const data = ownState(); data.checkins = [value].concat(data.checkins.filter(c => c.date !== value.date)); return persist(data)
}
async function importActivities(batch) {
  const values = normalizeImport(batch, today())
  if (config.mode !== 'demo') return request('/v1/activities/import', 'POST', batch)
  const data = ownState(); let imported = 0
  values.forEach(value => {
    if (data.activities.some(a => a.provider === value.provider && a.externalId === value.externalId)) return
    data.activities.push({ ...value, id: 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) }); imported++
  })
  data.activities.sort((a, b) => b.date.localeCompare(a.date)); persist(data)
  return { imported, duplicates: values.length - imported }
}
async function updateActivity(id, patch) {
  if (config.mode !== 'demo') return request('/v1/activities/' + id, 'PATCH', patch)
  const data = ownState(), value = data.activities.find(a => a.id === id)
  if (!value) throw new Error('记录不存在')
  const changesRpe = Object.prototype.hasOwnProperty.call(patch, 'rpe')
  const checked = engine.validateActivity({ ...value, ...patch, rpe: changesRpe ? patch.rpe : (value.rpe ?? 1) }, today())
  Object.assign(value, { rpe: changesRpe ? checked.rpe : value.rpe, isRace: checked.isRace }); return persist(data)
}
async function deleteActivity(id) {
  if (config.mode !== 'demo') return request('/v1/activities/' + id, 'DELETE')
  const data = ownState(); data.activities = data.activities.filter(a => a.id !== id); return persist(data)
}
async function deleteAccount() {
  if ((config.mode !== 'demo' || hasAgentSession()) && !isGuest()) {
    await request('/v1/account', 'DELETE')
    wx.removeStorageSync(TOKEN_KEY)
    wx.removeStorageSync(IDENTITY_KEY)
    // 浏览页面保持游客状态，直到用户主动重新授权，避免删号后自动建号。
    wx.setStorageSync(GUEST_KEY, guestScope())
  }
  await purgeCachedExport()
  wx.removeStorageSync(CHAT_KEY)
  persist({ ...createEmpty(), containsExamples: false })
}
async function purgeCachedExport() {
  if (!wx.getFileSystemManager || !wx.env) return
  await new Promise(resolve => wx.getFileSystemManager().unlink({ filePath: wx.env.USER_DATA_PATH + '/xunrun-export.json', success: resolve, fail: resolve }))
}
async function syncWeRun() {
  if (config.mode === 'demo' || config.apiAuthMode !== 'wechat') throw new Error('微信步数需要真实 AppID、微信登录和真机；当前是体验模式')
  if (!(await state()).consent) throw new Error('请先同意运动数据处理说明')
  if (typeof wx.requirePrivacyAuthorize !== 'function') throw new Error('请更新微信后重试隐私授权')
  await wxCall('requirePrivacyAuthorize', {})
  const token = await login(true)
  await wxCall('authorize', { scope: 'scope.werun' })
  const encrypted = await wxCall('getWeRunData', {})
  return rawRequest('/v1/providers/werun/sync', 'POST', { encryptedData: encrypted.encryptedData, iv: encrypted.iv }, token)
}
async function selectImport() {
  const result = await wxCall('chooseMessageFile', { count: 1, type: 'file', extension: ['json'] })
  const file = result.tempFiles[0]
  if (file.size > 524288) throw new Error('导入文件超过 512KB，请拆分批次')
  const manager = wx.getFileSystemManager()
  const raw = await new Promise((resolve, reject) => manager.readFile({ filePath: file.path, encoding: 'utf8', success: r => resolve(r.data), fail: reject }))
  let value; try { value = JSON.parse(raw) } catch { throw new Error('导入 JSON 格式无效') }
  return importActivities(value)
}
async function exportData() {
  const value = config.mode === 'demo' ? { schemaVersion: 1, exportedAt: new Date().toISOString(), ...(await state()) } : await request('/v1/export')
  const path = wx.env.USER_DATA_PATH + '/xunrun-export.json'
  await new Promise((resolve, reject) => wx.getFileSystemManager().writeFile({ filePath: path, data: JSON.stringify(value, null, 2), encoding: 'utf8', success: resolve, fail: reject }))
  if (typeof wx.shareFileMessage === 'function') await wxCall('shareFileMessage', { filePath: path, fileName: 'xunrun-export.json' })
  else throw new Error('导出文件已生成，但此微信版本无法分享 JSON；请升级后重试')
  return path
}
async function explain(query) {
  if (usesAgentApi() && !isGuest()) return request('/v1/coach/explain', 'POST', { query })
  const citations = knowledge.searchKnowledge(query).slice(0, 3)
  return { answer: citations.length ? citations.map(c => c.summary).join('\n\n') : '现有已核对知识卡没有找到可靠依据，暂不推断。', citations }
}
async function agentStatus() {
  if (usesAgentApi() && !isGuest()) return request('/v1/agent/status')
  return { configured: false, model: 'deepseek-flash', modelLabel: 'DeepSeek V4.1 Flash', dataConsent: isGuest() ? false : mockState().consent, settings: { enabled: false, shareTraining: false }, knowledge: { strategy: 'offline-cards', reviewedCards: knowledge.cards.length, snippets: knowledge.cards.length }, guest: isGuest() }
}
async function agentDataConsent() {
  if (usesAgentApi()) { wx.removeStorageSync(GUEST_KEY); await request('/v1/consent', 'POST', { granted: true }) }
  if (config.mode === 'demo') persist({ ...mockState(), consent: true })
}
async function agentSettings(value) { return request('/v1/agent/consent', 'POST', value) }
async function agentHistory() {
  if (usesAgentApi() && !isGuest()) return (await request('/v1/agent/history')).messages
  return wx.getStorageSync(CHAT_KEY) || []
}
async function clearAgentHistory() {
  if (usesAgentApi() && !isGuest()) await request('/v1/agent/history', 'DELETE')
  wx.removeStorageSync(CHAT_KEY)
}
async function agentChat(input) {
  if (usesAgentApi()) return rawRequest('/v1/agent/chat', 'POST', input, await login(false), 110000)
  if (!mockState().consent) throw new Error('请先同意保存对话记录')
  const result = await explain(input.message)
  const reply = { ...result, mode: 'local', tools: ['search_local_knowledge'], uncertainty: '当前只检索设备内置知识卡；原书检索需连接本地服务。' }
  const messages = wx.getStorageSync(CHAT_KEY) || []
  messages.push({ id: 'q-' + Date.now(), role: 'user', content: input.message }, { ...reply, id: 'a-' + Date.now(), role: 'assistant', content: reply.answer })
  wx.setStorageSync(CHAT_KEY, messages.slice(-40)); return reply
}
async function knowledgeCatalog() { return usesAgentApi() && !isGuest() ? request('/v1/knowledge') : { cards: knowledge.cards, sources: knowledge.sources, metadata: { projectLibraryLoaded: false } } }
async function appleHealthStatus() {
  const status = await request('/v1/apple-health/status')
  return config.mode === 'demo' ? { ...status, canPair: false, setupRequired: '当前跑步页面为示例模式；真实同步需切换后端数据模式、真实微信登录和 HTTPS 服务。' } : status
}
async function appleHealthPairing() { if (config.mode === 'demo') throw new Error('请先完成真实微信登录与后端数据模式配置'); return request('/v1/apple-health/pairing', 'POST', {}) }
async function disconnectAppleHealth(deleteImported) { return request('/v1/apple-health/connection', 'DELETE', { deleteImported }) }
module.exports = { today, state, overview, consent, saveProfile, saveActivity, saveCheckin, deleteActivity, updateActivity, deleteAccount, syncWeRun, selectImport, importActivities, exportData, explain, agentStatus, agentDataConsent, agentSettings, agentHistory, clearAgentHistory, agentChat, knowledgeCatalog, appleHealthStatus, appleHealthPairing, disconnectAppleHealth, isDemo: config.mode === 'demo', knowledge, providers: () => config.mode === 'demo' || isGuest() ? Promise.resolve(require('../data/providers')) : request('/v1/providers'), resetDemo: () => persist({ ...createDemo(today()), containsExamples: true }) }
