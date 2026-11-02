const client = require('../../services/client')
const { loadPage, cancelLoad } = require('../../services/page-loader')
Page({
  data: { isDemo: client.isDemo, loading: true, error: '', overview: null },
  onShow() { this.reload() },
  reload() { return loadPage(this, 'overview', () => client.overview()) },
  onHide() { cancelLoad(this) },
  openLog() { wx.switchTab({ url: '/pages/log/log' }) },
  openPlan() { wx.switchTab({ url: '/pages/plan/plan' }) },
  openKnowledge() { wx.navigateTo({ url: '/pages/knowledge/knowledge' }) },
  openAgent() { wx.navigateTo({ url: '/pages/agent/agent' }) }
})
