import test from 'node:test'
import assert from 'node:assert/strict'
import { engine, imports, knowledge } from '../server/domain.mjs'
import { CoachService } from '../server/services/coach.mjs'
const today = '2026-10-08'
const activity = { date: '2026-10-01', distanceKm: 5, durationSec: 1500, rpe: 9, isRace: true }
const checkin = { date: today, sleepHours: 8, fatigue: 2, soreness: 2, pain: 0, illness: false, redFlags: false }
test('VDOT 与原书 PDF88 的 8km/30min 示例一致（允许书中四舍五入）', () => assert.ok(Math.abs(engine.vdot(8, 1800) - 55.2) < 0.2))
test('同距离逆解恢复输入，跨距离符合单调关系', () => {
  const value = engine.vdot(5, 1500)
  assert.ok(Math.abs(engine.equivalentSeconds(value, 5) - 1500) < 1e-5)
  assert.ok(engine.equivalentSeconds(value, 10) > 3000)
  assert.ok(engine.vdot(5, 1400) > value)
})
test('睡眠信息缺失、过期记录、症状优先级不会生成正常状态', () => {
  assert.equal(engine.readiness(null, today).state, 'unknown')
  assert.equal(engine.readiness({ ...checkin, date: '2026-10-07' }, today).state, 'unknown')
  assert.equal(engine.readiness({ ...checkin, pain: 1 }, today).state, 'stop')
  assert.equal(engine.readiness({ ...checkin, redFlags: true, sleepHours: 8 }, today).state, 'stop')
  assert.equal(engine.readiness({ ...checkin, sleepHours: 5 }, today).state, 'easy')
})
test('普通慢跑、陈旧成绩、缺乏信息不会伪造预测', () => {
  assert.equal(engine.ability([{ ...activity, isRace: false }], today).available, false)
  assert.equal(engine.ability([{ ...activity, date: '2026-01-01' }], today).available, false)
  const report = engine.ability([activity], today)
  assert.equal(report.equivalents.length, 4)
  assert.match(report.equivalents[3].warning, /专项耐力/)
  assert.match(report.limitation, /未建模/)
})
test('基础周不增量、不越过症状和新手条件，疲劳当天休息', () => {
  const profile = { weeklyKm: 30, daysPerWeek: 4, weeksConsistent: 12, isAdult: true, goal: '10k' }
  const value = engine.makePlan(profile, [], engine.readiness(checkin, today), today)
  assert.ok(value.targetKm <= 30)
  assert.equal(value.days.filter(d => d.type === 'E').length, 4)
  assert.ok(value.days.every(d => ['E', '休息'].includes(d.type)))
  assert.equal(engine.makePlan(profile, [], engine.readiness({ ...checkin, pain: 2 }, today), today).available, false)
  assert.equal(engine.makePlan({ ...profile, weeksConsistent: 0 }, [], engine.readiness(checkin, today), today).available, false)
  const easy = engine.makePlan(profile, [], engine.readiness({ ...checkin, fatigue: 4 }, today), today)
  assert.equal(easy.days[0].type, '休息')
  assert.equal(easy.days.filter(d => d.type === 'E').length, 4)
})
test('近期艰苦活动影响建议；缺失 RPE 不按零或默认值推负荷', () => {
  const result = engine.dashboard({ profile: null, activities: [{ ...activity, date: today }], checkins: [checkin], steps: [] }, today)
  assert.equal(result.readiness.state, 'easy')
  const load = engine.loadSummary([{ ...activity, date: today, rpe: null }], today)
  assert.equal(load.weeklyKm, 5); assert.equal(load.loadAu, null); assert.equal(load.missingRpeCount, 1)
})
test('输入拒绝未来日期、字符串数值、无效日期与不合理配速', () => {
  assert.throws(() => engine.validateActivity({ ...activity, date: '2026-10-09' }, today))
  assert.throws(() => engine.validateActivity({ ...activity, date: '2026-02-30' }, today))
  assert.throws(() => engine.validateActivity({ ...activity, distanceKm: '5' }, today))
  assert.throws(() => engine.validateActivity({ ...activity, durationSec: 60 }, today))
  assert.throws(() => engine.validateProfile({ weeklyKm: 30, daysPerWeek: 3.5, weeksConsistent: 10, isAdult: true, goal: '10k' }))
  for (const goal of ['constructor', '__proto__', ['5k']]) assert.throws(() => engine.validateProfile({ weeklyKm: 30, daysPerWeek: 4, weeksConsistent: 10, isAdult: true, goal }))
})
test('跨 UTC 日期仍按中国时区计算，导入活动保留来源与 RPE 缺失', () => {
  assert.equal(engine.dateKey('2026-10-07T23:30:00Z'), today)
  const values = imports.normalizeImport({ schemaVersion: 1, provider: 'coros', activities: [{ ...activity, sport: 'running', externalId: 'a', rpe: null, source: '官方已验证' }] }, today)
  assert.equal(values[0].rpe, null); assert.equal(values[0].source, 'coros 文件导入')
  assert.throws(() => imports.normalizeImport({ schemaVersion: 1, provider: 'coros', activities: [{ ...activity, sport: 'cycling', externalId: 'a' }] }, today))
})
test('知识检索有出处，未知主题不猜测', () => {
  assert.ok(knowledge.searchKnowledge('疲劳如何恢复').some(c => c.id === 'daniels-rest'))
  assert.equal(knowledge.searchKnowledge('量子计算芯片').length, 0)
  const ids = new Set(knowledge.cards.map(c => c.id))
  for (const c of [checkin, { ...checkin, redFlags: true }, { ...checkin, fatigue: 5 }]) for (const id of engine.readiness(c, today).sourceIds) assert.ok(ids.has(id))
})
test('检索器与训练策略可以独立注入，支持异步检索', async () => {
  const service = new CoachService({ repository: { getState: () => ({ sample: true }) }, engine: { evaluate: state => ({ custom: state.sample }) }, knowledgeRetriever: { search: async () => [knowledge.cards[0]] } })
  assert.deepEqual(service.overview('u', today), { custom: true })
  assert.equal((await service.explain('训练')).citations[0].id, 'daniels-purpose')
})
