import test from 'node:test'
import assert from 'node:assert/strict'
import { createApplication } from '../server/app.mjs'
import { engine, knowledge } from '../server/domain.mjs'

test('导入活动缺RPE时仍可独立修改比赛标记，不能凭空补RPE', t => {
  const app = createApplication(); t.after(() => app.repository.close())
  const user = app.repository.createUser()
  const activity = app.repository.saveActivity(user.id, { date: '2026-10-01', distanceKm: 5, durationSec: 1500, rpe: null, isRace: false, source: 'file', provider: 'file', externalId: 'fixture' })
  const updated = app.repository.updateActivity(user.id, activity.id, { isRace: true }, engine.validateActivity, '2026-10-13')
  assert.equal(updated.isRace, true); assert.equal(updated.rpe, null)
})
test('只撤回训练摘要授权也停止后续模型步骤和保存', async t => {
  let app, userId, count = 0
  const provider = { configured: true, model: 'deepseek-flash', complete: async request => {
    count++
    if (count === 1) {
      app.repository.setAgentSettings(userId, { enabled: true, shareTraining: false })
      return { message: { role: 'assistant', content: null, tool_calls: [{ id: 'read-summary', type: 'function', function: { name: 'get_training_summary', arguments: '{}' } }] } }
    }
    return { message: { role: 'assistant', content: JSON.stringify({ answer: '说明', citedIds: ['daniels-easy'] }) } }
  } }
  app = createApplication({ chatProvider: provider }); t.after(() => app.repository.close())
  userId = app.repository.createUser().id; app.repository.setConsent(userId, true)
  app.repository.setAgentSettings(userId, { enabled: true, shareTraining: true })
  await assert.rejects(app.agent.chat(userId, { message: '轻松跑有什么作用？', useRemoteModel: true, useTrainingContext: true }, '2026-10-13'), error => error.status === 409)
  assert.equal(count, 1); assert.equal(app.repository.getChatHistory(userId).length, 0)
})
test('回答中的来源必须出现在返回的引用列表中', t => {
  const app = createApplication(); t.after(() => app.repository.close())
  const evidence = new Map(knowledge.cards.map(card => [card.id, card]))
  assert.throws(() => app.agent.validateReply(JSON.stringify({ answer: '恢复参考 [daniels-rest]', citedIds: ['daniels-easy'] }), evidence, null, null))
})
