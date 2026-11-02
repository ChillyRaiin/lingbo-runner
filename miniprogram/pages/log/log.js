const client = require('../../services/client')
const engine = require('../../domain/engine')
const { failure, number, confirm } = require('../../services/ui')
Page({
  data: { date: client.today(), maxDate: client.today(), activities: [], run: { distanceKm: '', durationMin: '', rpe: '', avgHr: '', isRace: false }, checkin: { sleepHours: '', fatigue: '', soreness: '', pain: '', illness: false, redFlags: false } },
  onShow() { const current = client.today(); this.setData({ maxDate: current, ...(!this._dateChosen ? { date: current } : {}) }); this.refresh() },
  async refresh() { this.setData({ activities: [] }); try { const state = await client.state(); this.setData({ activities: state.activities.map(a => ({ ...a, timeLabel: engine.formatTime(a.durationSec) })) }) } catch (e) { failure(e) } },
  setDate(event) { this._dateChosen = true; this.setData({ date: event.detail.value }) },
  input(event) { const group = event.currentTarget.dataset.group, key = event.currentTarget.dataset.key; this.setData({ [group + '.' + key]: event.detail.value }) },
  toggle(event) { this.setData({ [event.currentTarget.dataset.group + '.' + event.currentTarget.dataset.key]: event.detail.value }) },
  async saveRun() {
    try { const r = this.data.run; await client.saveActivity({ date: this.data.date, distanceKm: number(r.distanceKm, '距离'), durationSec: number(r.durationMin, '时长') * 60, rpe: number(r.rpe, 'RPE'), isRace: r.isRace, avgHr: r.avgHr === '' ? null : number(r.avgHr, '心率') }); wx.showToast({ title: '跑步已保存' }); this.refresh() } catch (e) { failure(e) }
  },
  async saveCheckin() {
    try { const c = this.data.checkin; await client.saveCheckin({ date: client.today(), sleepHours: number(c.sleepHours, '睡眠时长'), fatigue: number(c.fatigue, '疲劳程度'), soreness: number(c.soreness, '酸痛程度'), pain: number(c.pain, '局部疼痛'), illness: c.illness, redFlags: c.redFlags }); wx.showToast({ title: '今日状态已保存' }); this.refresh() } catch (e) { failure(e) }
  },
  async importFile() { try { const result = await client.selectImport(); wx.showModal({ title: '导入完成', content: '新增 ' + result.imported + ' 条，重复 ' + result.duplicates + ' 条。缺少 RPE 的活动可在记录中补充。', showCancel: false }); this.refresh() } catch (e) { failure(e) } },
  async edit(event) {
    const value = this.data.activities.find(a => a.id === event.currentTarget.dataset.id)
    wx.showActionSheet({ itemList: ['补充 / 修改 RPE', value.isRace ? '取消比赛 / 全力测试标记' : '标记为比赛 / 全力测试', '删除记录'], success: async result => {
      try {
        if (result.tapIndex === 0) wx.showModal({ title: '整次训练的主观强度', content: '填写 1～10，1 为很轻松，10 为最大努力。', editable: true, placeholderText: 'RPE', success: async r => { if (r.confirm) { try { await client.updateActivity(value.id, { rpe: number(r.content, 'RPE') }); this.refresh() } catch (e) { failure(e) } } } })
        else if (result.tapIndex === 1) {
          if (!value.isRace && !(await confirm('确认测试性质', '只对近期有代表性的比赛或全力测试进行能力计算。普通训练不应标记。'))) return
          await client.updateActivity(value.id, { isRace: !value.isRace }); this.refresh()
        } else if (await confirm('删除记录', '删除后可重新导入或录入。')) { await client.deleteActivity(value.id); this.refresh() }
      } catch (e) { failure(e) }
    } })
  }
})
