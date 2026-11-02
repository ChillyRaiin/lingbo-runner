const { dateKey } = require('../domain/engine')
function createDemo(today) {
  const shift = n => dateKey(Date.parse(today + 'T12:00:00+08:00') - n * 86400000)
  return { consent: false, profile: { weeklyKm: 30, daysPerWeek: 4, weeksConsistent: 12, isAdult: true, goal: '10k' }, activities: [
    { id: 'demo-1', date: shift(1), distanceKm: 6, durationSec: 2340, rpe: 3, isRace: false, source: '示例' },
    { id: 'demo-2', date: shift(3), distanceKm: 5, durationSec: 1500, rpe: 9, isRace: true, source: '示例' },
    { id: 'demo-3', date: shift(5), distanceKm: 7, durationSec: 2820, rpe: 3, isRace: false, source: '示例' },
    { id: 'demo-4', date: shift(6), distanceKm: 8, durationSec: 3300, rpe: 3, isRace: false, source: '示例' }
  ], checkins: [{ date: today, sleepHours: 7.5, fatigue: 2, soreness: 2, pain: 0, illness: false, redFlags: false }], steps: [] }
}
function createEmpty() { return { consent: false, profile: null, activities: [], checkins: [], steps: [] } }
module.exports = { createDemo, createEmpty }
