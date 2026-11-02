const client = require('../../services/client')
const { number, failure, confirm } = require('../../services/ui')
const goals = ['5k', '10k', 'half', 'marathon']
Page({
  data: { isDemo: client.isDemo, granted: false, containsExamples: false, form: { weeklyKm: '', daysPerWeek: '', weeksConsistent: '', isAdult: false }, goalIndex: 1, goalLabels: ['5 公里', '10 公里', '半程马拉松', '马拉松'], providers: [] },
  async onShow() { try { const state = await client.state(); this.setData({ granted: state.consent, containsExamples: Boolean(state.containsExamples), providers: await client.providers() }); if (state.profile) this.setData({ form: state.profile, goalIndex: goals.indexOf(state.profile.goal) }); else this.clearForm() } catch (e) { this.setData({ granted: false, containsExamples: false }); this.clearForm(); failure(e) } },
  input(event) { this.setData({ ['form.' + event.currentTarget.dataset.key]: event.detail.value }) },
  adult(event) { this.setData({ 'form.isAdult': event.detail.value }) },
  goal(event) { this.setData({ goalIndex: Number(event.detail.value) }) },
  async save() { try { const f = this.data.form; await client.saveProfile({ weeklyKm: number(f.weeklyKm, '稳定周跑量'), daysPerWeek: number(f.daysPerWeek, '训练天数'), weeksConsistent: number(f.weeksConsistent, '稳定训练周数'), goal: goals[this.data.goalIndex], isAdult: f.isAdult }); wx.showToast({ title: '档案已保存' }); this.onShow() } catch (e) { failure(e) } },
  privacy() { wx.navigateTo({ url: '/pages/privacy/privacy' }) },
  knowledge() { wx.navigateTo({ url: '/pages/knowledge/knowledge' }) },
  appleHealth() { wx.navigateTo({ url: '/pages/apple-health/apple-health' }) },
  async syncSteps() { try { const result = await client.syncWeRun(); wx.showToast({ title: '已同步 ' + result.synced + ' 天步数', icon: 'none' }) } catch (e) { failure(e) } },
  async exportData() { try { await client.exportData() } catch (e) { failure(e) } },
  async revoke() { if (await confirm('撤回数据处理授权', '将清除已保存的档案、跑步、状态与步数数据，并停止处理新数据。')) { try { await client.consent(false); this.clearForm(); this.onShow() } catch (e) { failure(e) } } },
  async remove() { if (await confirm('删除全部账户数据', '将删除档案、运动数据、授权与服务端会话。已由你另行分享或下载的副本需要自行删除。')) { try { await client.deleteAccount(); this.clearForm(); this.onShow() } catch (e) { failure(e) } } },
  clearForm() { this.setData({ form: { weeklyKm: '', daysPerWeek: '', weeksConsistent: '', isAdult: false }, goalIndex: 1 }) },
  async resetDemo() { if (await confirm('恢复示例数据', '此操作会替换本地体验数据，请先导出需要保留的个人记录。')) { client.resetDemo(); this.onShow() } }
})
