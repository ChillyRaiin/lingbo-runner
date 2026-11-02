const client = require('../../services/client')
const { loadPage, cancelLoad } = require('../../services/page-loader')
Page({ data: { ability: null, loading: true, error: '', labels: { '5k': '5 公里', '10k': '10 公里', half: '半程马拉松', marathon: '马拉松' } }, onShow() { this.reload() }, reload() { return loadPage(this, 'ability', async () => (await client.overview()).ability) }, onHide() { cancelLoad(this) }, openLog() { wx.switchTab({ url: '/pages/log/log' }) } })
