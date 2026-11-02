import test from 'node:test'
import assert from 'node:assert/strict'
import { createApplication } from '../server/app.mjs'
import { DeepSeekChatAdapter } from '../server/adapters/deepseek.mjs'
import { LocalKnowledgeRetriever } from '../server/adapters/local-knowledge.mjs'
import { knowledge } from '../server/domain.mjs'
const today = '2026-10-09'
const input = { message: '轻松跑为什么有助于恢复？', useRemoteModel: false, useTrainingContext: false }
function setup(t, provider) {
  const app = createApplication({ chatProvider: provider })
  const user = app.repository.createUser(), other = app.repository.createUser()
  app.repository.setConsent(user.id, true); app.repository.setConsent(other.id, true)
  t.after(() => app.repository.close())
  return { ...app, userId: user.id, otherId: other.id }
}
const modelReply = (id, answer = '轻松跑需要保持舒适，可交谈。') => ({ message: { role: 'assistant', content: JSON.stringify({ answer, citedIds: [id], uncertainty: '需结合个人情况。' }) } })

test('无密钥仍可本地多轮检索，聊天按用户隔离并随撤权清除', async t => {
  const { agent, repository, userId, otherId } = setup(t)
  const result = await agent.chat(userId, input, today)
  assert.equal(result.mode, 'local'); assert.ok(result.citations.length)
  assert.equal(repository.getChatHistory(userId).length, 2)
  assert.equal(repository.getChatHistory(otherId).length, 0)
  await agent.chat(userId, { ...input, message: '那它应该跑多久？' }, today)
  assert.equal(repository.getChatHistory(userId).length, 4)
  repository.deleteMetrics(userId)
  assert.equal(repository.getChatHistory(userId).length, 0)
  assert.equal(repository.getAgentSettings(userId).enabled, false)
})
test('远程解释与训练摘要分别检查授权；客户端不能指定其他用户或历史', async t => {
  let calls = 0
  const { agent, repository, userId } = setup(t, { model: 'deepseek-flash', configured: true, complete: async () => { calls++; return modelReply('daniels-easy') } })
  await assert.rejects(agent.chat(userId, { ...input, useRemoteModel: true }, today), error => error.status === 403)
  repository.setAgentSettings(userId, { enabled: true, shareTraining: false })
  await assert.rejects(agent.chat(userId, { ...input, useRemoteModel: true, useTrainingContext: true }, today), error => error.status === 403)
  await assert.rejects(agent.chat(userId, { ...input, userId: 'other' }, today), error => error.status === 400)
  await assert.rejects(agent.chat(userId, { ...input, history: [] }, today), error => error.status === 400)
  assert.equal(calls, 0)
})
test('模型可以调用本地检索工具，未授权摘要工具被拒绝', async t => {
  const requests = []; let count = 0
  const provider = { model: 'deepseek-flash', configured: true, complete: async request => {
    requests.push(structuredClone(request)); count++
    if (count === 1) return { message: { role: 'assistant', content: null, tool_calls: [{ id: 'call-search', type: 'function', function: { name: 'search_local_knowledge', arguments: '{"query":"轻松跑配速"}' } }] } }
    if (count === 2) return { message: { role: 'assistant', content: null, tool_calls: [{ id: 'call-summary', type: 'function', function: { name: 'get_training_summary', arguments: '{}' } }] } }
    const source = JSON.parse(requests[1].messages.find(message => message.role === 'tool').content).citations[0]
    return modelReply(source.id)
  } }
  const { agent, repository, userId } = setup(t, provider)
  repository.setAgentSettings(userId, { enabled: true, shareTraining: false })
  const reply = await agent.chat(userId, { ...input, useRemoteModel: true }, today)
  assert.equal(reply.mode, 'deepseek'); assert.ok(reply.tools.includes('search_local_knowledge'))
  assert.ok(requests[2].messages.some(message => message.role === 'tool' && JSON.parse(message.content).error))
  assert.equal(reply.trainingContextUsed, false)
  assert.equal(JSON.stringify(requests).includes(userId), false)
})
test('伪造引用触发可见回退，不把模型失败冒充有效回答', async t => {
  const { agent, repository, userId } = setup(t, { model: 'deepseek-flash', configured: true, complete: async () => modelReply('fabricated-source') })
  repository.setAgentSettings(userId, { enabled: true, shareTraining: false })
  const reply = await agent.chat(userId, { ...input, useRemoteModel: true }, today)
  assert.equal(reply.mode, 'local-fallback'); assert.match(reply.notice, /未完成有效回答/)
  assert.equal(reply.failureCode, 'invalid-model-output')
})
test('当前疼痛优先保留规则结论，模型不能重写今日跑步建议', async t => {
  let called = false
  const { agent, repository, userId } = setup(t, { model: 'deepseek-flash', configured: true, complete: async () => { called = true } })
  repository.setAgentSettings(userId, { enabled: true, shareTraining: true })
  repository.saveCheckin(userId, { date: today, sleepHours: 8, fatigue: 2, soreness: 2, pain: 3, illness: false, redFlags: false })
  const reply = await agent.chat(userId, { message: '我今天能跑步吗，怎样恢复？', useRemoteModel: true, useTrainingContext: true }, today)
  assert.equal(called, false); assert.equal(reply.trainingFacts.readiness.state, 'stop'); assert.equal(reply.mode, 'local')
})
test('模型调用过程中撤权，不保存晚到的回答', async t => {
  let release, started
  const ready = new Promise(resolve => { started = resolve })
  const provider = { configured: true, model: 'deepseek-flash', complete: async request => { started(); await new Promise(resolve => { release = resolve }); const source = JSON.parse(request.messages.at(-1).content).localEvidence[0]; return modelReply(source.id) } }
  const { agent, repository, userId } = setup(t, provider)
  repository.setAgentSettings(userId, { enabled: true, shareTraining: false })
  const pending = agent.chat(userId, { ...input, useRemoteModel: true }, today)
  await ready; repository.deleteMetrics(userId); release()
  await assert.rejects(pending, error => error.status === 409)
  assert.equal(repository.getChatHistory(userId).length, 0)
})
test('本地检索返回来源而不返回内部索引，未知主题不捏造依据', () => {
  const retriever = new LocalKnowledgeRetriever({ catalog: knowledge })
  const values = retriever.search('轻松跑配速')
  assert.ok(values.some(value => value.sourceId === 'daniels-3-cn'))
  assert.ok(values.every(value => value.frequency === undefined && value.searchText === undefined))
  assert.equal(retriever.search('量子计算芯片制造工艺').length, 0)
})
test('先前本地原书检索对话不会作为历史自动发送至模型', async t => {
  let request
  const { agent, repository, userId } = setup(t, { model: 'deepseek-flash', configured: true, complete: async value => { request = value; return modelReply('daniels-easy') } })
  repository.saveChatTurn(userId, 'local-only-book-question', { answer: 'local-only-raw-book-excerpt', mode: 'local', citations: [], originalEvidenceUsed: true })
  repository.setAgentSettings(userId, { enabled: true, shareTraining: false })
  await agent.chat(userId, { ...input, useRemoteModel: true }, today)
  assert.equal(JSON.stringify(request).includes('local-only'), false)
  await assert.rejects(agent.chat(userId, { ...input, useRemoteModel: true, includeOriginal: true }, today), error => error.status === 400)
})
test('DeepSeek 请求使用官方 flash 标识、禁用思考，密钥不进入正文和返回值', async () => {
  let request
  const provider = new DeepSeekChatAdapter({ apiKey: 'synthetic-test-secret', fetchImpl: async (url, options) => { request = { url, ...options }; return { ok: true, json: async () => ({ choices: [{ message: { role: 'assistant', content: '{"answer":"说明"}', reasoning_content: 'internal thought' } }], usage: { prompt_tokens: 10, completion_tokens: 20 } }) } } })
  const result = await provider.complete({ messages: [{ role: 'user', content: '测试' }], final: true })
  assert.equal(request.url, 'https://api.deepseek.com/chat/completions')
  const payload = JSON.parse(request.body)
  assert.equal(payload.model, 'deepseek-flash'); assert.equal(payload.thinking.type, 'disabled')
  assert.equal(payload.response_format.type, 'json_object')
  assert.equal(request.body.includes('synthetic-test-secret'), false)
  assert.equal(result.message.reasoning_content, undefined)
  assert.throws(() => new DeepSeekChatAdapter({ baseUrl: 'http://example.com' }), /官方/)
})
