const client = require('../../services/client')
const { loadPage, cancelLoad } = require('../../services/page-loader')
Page({ data: { plan: null, loading: true, error: '' }, onShow() { this.reload() }, reload() { return loadPage(this, 'plan', async () => (await client.overview()).plan) }, onHide() { cancelLoad(this) }, openKnowledge() { wx.navigateTo({ url: '/pages/knowledge/knowledge' }) }, openProfile() { wx.switchTab({ url: '/pages/profile/profile' }) } })
