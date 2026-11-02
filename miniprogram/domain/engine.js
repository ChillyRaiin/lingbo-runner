// 前后端使用同一个纯函数模块，避免演示模式与后端计算漂移。
// 本模块输出保守规则建议和能力等效值；不诊断、不估计伤病概率。
const MODEL_VERSION = 'daniels-baseline-0.1.0'
const DAY = 86400000
const goals = { '5k': 5, '10k': 10, half: 21.0975, marathon: 42.195 }
class ValidationError extends Error { constructor(message) { super(message); this.name = 'ValidationError'; this.status = 400 } }
function dateKey(date) {
  return new Date(new Date(date).getTime() + 8 * 3600000).toISOString().slice(0, 10)
}
function dayDiff(a, b) { return Math.round((Date.parse(a + 'T00:00:00+08:00') - Date.parse(b + 'T00:00:00+08:00')) / DAY) }
function requireNumber(value, name, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new ValidationError(name + '需在 ' + min + '～' + max + ' 之间')
  return value
}
function validDate(date, today) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date + 'T00:00:00Z')) || new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date) throw new ValidationError('日期无效')
  if (today && date > today) throw new ValidationError('不能录入未来记录')
  return date
}
function boolean(value, name) { if (typeof value !== 'boolean') throw new ValidationError(name + '必须明确选择'); return value }
function validateActivity(input, today) {
  const value = { date: validDate(input.date, today), distanceKm: requireNumber(input.distanceKm, '距离（km）', 0.01, 500), durationSec: requireNumber(input.durationSec, '时长（秒）', 1, 172800), rpe: requireNumber(input.rpe, '主观强度 RPE', 1, 10), isRace: boolean(input.isRace, '比赛/全力测试标记'), source: 'manual' }
  requireNumber(value.durationSec / value.distanceKm, '每公里用时（秒）', 90, 1800)
  if (value.isRace && (value.distanceKm < 0.8 || value.distanceKm > 42.195)) throw new ValidationError('能力模型支持 800 米至马拉松的比赛/测试')
  if (input.avgHr !== undefined && input.avgHr !== null && input.avgHr !== '') value.avgHr = requireNumber(input.avgHr, '平均心率', 30, 240)
  return value
}
function validateCheckin(input, today) {
  return { date: validDate(input.date, today), sleepHours: requireNumber(input.sleepHours, '睡眠时长', 0, 16), fatigue: requireNumber(input.fatigue, '疲劳程度', 1, 5), soreness: requireNumber(input.soreness, '肌肉酸痛', 1, 5), pain: requireNumber(input.pain, '局部疼痛', 0, 10), illness: boolean(input.illness, '患病标记'), redFlags: boolean(input.redFlags, '胸痛/晕厥/异常气短标记') }
}
function validateProfile(input) {
  const value = { weeklyKm: requireNumber(input.weeklyKm, '近期稳定周跑量', 0, 200), daysPerWeek: requireNumber(input.daysPerWeek, '每周训练天数', 2, 6), weeksConsistent: requireNumber(input.weeksConsistent, '连续稳定训练周数', 0, 260), isAdult: boolean(input.isAdult, '成年标记'), goal: input.goal }
  if (!Number.isInteger(value.daysPerWeek) || !Number.isInteger(value.weeksConsistent) || typeof value.goal !== 'string' || !Object.prototype.hasOwnProperty.call(goals, value.goal)) throw new ValidationError('训练天数、周数或目标项目无效')
  return value
}
function formatTime(seconds) {
  const s = Math.round(seconds), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = String(s % 60).padStart(2, '0')
  return h ? h + ':' + String(m).padStart(2, '0') + ':' + sec : m + ':' + sec
}
// 速度单位 m/min、时间单位 min。Daniels-Gilbert 回归近似；与原书 8km/30min 例核对。
function vdot(distanceKm, seconds) {
  const t = seconds / 60, v = distanceKm * 1000 / t
  const oxygen = -4.6 + 0.182258 * v + 0.000104 * v * v
  const fraction = 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t)
  return oxygen / fraction
}
function equivalentSeconds(score, distanceKm) {
  let lo = distanceKm * 90, hi = distanceKm * 1800
  for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (vdot(distanceKm, mid) > score) lo = mid; else hi = mid }
  return (lo + hi) / 2
}
function paceAtFraction(score, fraction) {
  const velocity = (-0.182258 + Math.sqrt(0.182258 ** 2 + 4 * 0.000104 * (4.6 + score * fraction))) / (2 * 0.000104)
  return 60000 / velocity
}
function readiness(checkin, today) {
  if (!checkin || checkin.date !== today) return { state: 'unknown', label: '待记录今日状态', reasons: ['缺少今日睡眠、疲劳与疼痛记录'], guidance: '先完成状态记录，再决定是否训练。', confidence: '信息不足', sourceIds: ['daniels-rest'] }
  if (checkin.redFlags) return { state: 'stop', label: '暂停运动，及时就医', reasons: ['报告了胸痛、晕厥或异常气短'], guidance: '暂停运动并及时寻求医疗评估；严重或持续症状应立即求助急救。', confidence: '症状优先', sourceIds: ['exercise-redflags'] }
  if (checkin.illness || checkin.pain > 0) return { state: 'stop', label: '今天优先处理不适', reasons: [checkin.illness ? '报告了患病或发热' : '报告了局部疼痛'], guidance: '暂停自动跑步建议。持续或加重的不适请寻求专业评估；不要带伤补跑量。', confidence: '保守规则', sourceIds: ['daniels-rest'] }
  const reasons = []
  if (checkin.sleepHours < 7) reasons.push('昨晚睡眠少于 7 小时')
  if (checkin.fatigue >= 4) reasons.push('主观疲劳偏高')
  if (checkin.soreness >= 4) reasons.push('肌肉酸痛偏高')
  return reasons.length ? { state: 'easy', label: '今天降低训练负荷', reasons, guidance: '优先休息；若日常活动舒适，可酌情缩短轻松活动。', confidence: '未经临床校准的保守规则', sourceIds: ['daniels-rest', 'sleep-consensus'] }
    : { state: 'normal', label: '可考虑轻松训练', reasons: ['今日未报告明显不适'], guidance: '按当前能力训练，跑中仍需观察体感；此结果不证明已经完全恢复。', confidence: '主观记录参考', sourceIds: ['daniels-easy', 'daniels-rest'] }
}
function ability(activities, today) {
  const races = activities.filter(a => a.isRace && dayDiff(today, a.date) >= 0 && dayDiff(today, a.date) <= 60 && a.distanceKm >= 0.8 && a.distanceKm <= 42.195).sort((a, b) => b.date.localeCompare(a.date))
  if (!races.length) return { available: false, reason: '需要最近 60 天内有代表性的比赛或全力测试记录；普通慢跑不用于反推 PB。', modelVersion: MODEL_VERSION }
  const race = races[0], score = vdot(race.distanceKm, race.durationSec)
  if (score < 15 || score > 85) return { available: false, reason: '本框架支持 VDOT 15～85；记录超出校验范围，需要人工核查。', modelVersion: MODEL_VERSION }
  const fast = paceAtFraction(score, 0.74), slow = paceAtFraction(score, 0.59)
  return { available: true, score: Math.round(score * 10) / 10, basis: race, easyPace: formatTime(fast) + '–' + formatTime(slow) + ' /km', modelVersion: MODEL_VERSION, sourceIds: ['daniels-current', 'daniels-easy'], equivalents: Object.keys(goals).map(key => {
    const distanceKm = goals[key], seconds = equivalentSeconds(score, distanceKm)
    const pb = activities.filter(a => a.isRace && Math.abs(a.distanceKm - distanceKm) < 0.01).reduce((best, a) => Math.min(best, a.durationSec), Infinity)
    return { event: key, distanceKm, seconds: Math.round(seconds), time: formatTime(seconds), pace: formatTime(seconds / distanceKm) + ' /km', historicalPb: Number.isFinite(pb) ? formatTime(pb) : '暂无记录', confidence: '能力等效，未做个人预测校准', warning: distanceKm / race.distanceKm >= 2 ? '跨距离较大：专项耐力、补给和环境可能使实际成绩显著不同。' : '仅作相近条件下的能力参考。' }
  }), limitation: '这是等效成绩基线，不是比赛承诺、PB 概率或统计置信区间。首版未建模专项耐力、天气、赛道与补给。' }
}
function loadSummary(activities, today) {
  const recent = activities.filter(a => dayDiff(today, a.date) >= 0 && dayDiff(today, a.date) < 7)
  const previous = activities.filter(a => dayDiff(today, a.date) >= 7 && dayDiff(today, a.date) < 28)
  const measured = recent.filter(a => a.rpe !== null && a.rpe !== undefined)
  const previousMeasured = previous.filter(a => a.rpe !== null && a.rpe !== undefined)
  const load = measured.reduce((n, a) => n + a.durationSec / 60 * a.rpe, 0)
  const bins = Array.from({ length: 7 }, (_, i) => {
    const date = dateKey(Date.parse(today + 'T12:00:00+08:00') - (6 - i) * DAY)
    const distance = recent.filter(a => a.date === date).reduce((n, a) => n + a.distanceKm, 0)
    return { date, label: date.slice(5), distance: Math.round(distance * 10) / 10, height: Math.max(3, Math.min(100, distance * 7)) }
  })
  return { weeklyKm: Math.round(recent.reduce((n, a) => n + a.distanceKm, 0) * 10) / 10, count: recent.length, loadAu: measured.length ? Math.round(load) : null, missingRpeCount: recent.length - measured.length, previousWeeklyLoadAu: previousMeasured.length ? Math.round(previousMeasured.reduce((n, a) => n + a.durationSec / 60 * a.rpe, 0) / 3) : null, bins, explanation: 'sRPE 负荷 = 时长（分钟）× 主观强度。缺失 RPE 的活动不计入负荷合计。AU 为任意单位，不代表伤病风险。未记录不等于实际休息。' }
}
function makePlan(profile, activities, status, today) {
  const notes = ['基础周草案：E 跑与休息。尚未生成 T/I/R 高强度课、专项备赛周期或伤后复出计划。']
  if (!profile || !profile.isAdult || profile.weeksConsistent < 4 || profile.weeklyKm === 0) return { available: false, reason: '先填写成年标记、每周可跑天数与至少 4 周稳定训练经历。新手、未成年人和伤后复出方案需另行设计。', notes, days: [] }
  if (status.state === 'stop' || status.state === 'unknown') return { available: false, reason: status.guidance, notes, days: [] }
  const load = loadSummary(activities, today)
  const baseline = load.count ? Math.min(profile.weeklyKm, load.weeklyKm) : profile.weeklyKm
  if (baseline < 4) return { available: false, reason: '近期记录跑量过少，暂不生成周计划；请核对是否漏记，或由教练确定恢复起点。', notes, days: [] }
  // 不增加用户自报或观测到的周量；每次 E 跑控制在 45 分钟内。
  // 0.8 缩量系数为产品保守规则，非原书处方；状态偏疲劳再下调。
  const pace = ability(activities, today)
  const secPerKm = pace.available ? paceAtFraction(pace.score, 0.59) : 480
  const target = Math.min(baseline * (status.state === 'easy' ? 0.6 : 0.8), profile.daysPerWeek * 2700 / secPerKm)
  const runSlots = Array.from({ length: profile.daysPerWeek }, (_, i) => status.state === 'easy' ? 1 + Math.floor(i * 6 / profile.daysPerWeek) : Math.floor(i * 7 / profile.daysPerWeek))
  const perRun = Math.floor(target / profile.daysPerWeek * 10) / 10
  if (!load.count) notes.push('当前跑量来自自报信息，尚无最近一周运动记录验证。')
  notes.push('每天开始前重新记录状态。未来日期的建议只在无不适时有效；疲劳时可休息，不补欠课。')
  return { available: true, targetKm: Math.round(perRun * profile.daysPerWeek * 10) / 10, notes, sourceIds: ['daniels-purpose', 'daniels-easy', 'daniels-rest'], days: Array.from({ length: 7 }, (_, i) => {
    const date = dateKey(Date.parse(today + 'T12:00:00+08:00') + i * DAY), run = runSlots.includes(i)
    return { date, type: run ? 'E' : '休息', title: run ? '轻松跑 ' + perRun.toFixed(1) + ' km' : '休息 / 舒适日常活动', distanceKm: run ? perRun : 0, purpose: run ? '保持有氧基础，体感舒适，可交谈' : '为下一次训练保留恢复空间', pace: run && pace.available ? pace.easyPace : '以舒适体感为准', condition: i === 0 ? '开始前确认没有不适' : '当日状态正常时再执行' }
  }) }
}
function dashboard(state, today) {
  const checkin = state.checkins.find(c => c.date === today), status = readiness(checkin, today)
  if (status.state === 'normal' && state.activities.some(a => dayDiff(today, a.date) >= 0 && dayDiff(today, a.date) < 2 && (a.isRace || a.rpe >= 7))) {
    status.state = 'easy'; status.label = '近期较艰苦，今天优先恢复'; status.reasons.push('今天或昨天有比赛/高主观强度训练'); status.guidance = '先安排恢复；后续训练仍按当日体感重新评估。'; status.confidence = '保守规则'
  }
  return { today, readiness: status, load: loadSummary(state.activities, today), ability: ability(state.activities, today), plan: makePlan(state.profile, state.activities, status, today), latestSteps: state.steps.length ? state.steps[state.steps.length - 1] : null, modelVersion: MODEL_VERSION }
}
module.exports = { ValidationError, MODEL_VERSION, dateKey, dayDiff, validDate, validateActivity, validateCheckin, validateProfile, formatTime, vdot, equivalentSeconds, paceAtFraction, readiness, ability, loadSummary, makePlan, dashboard }
