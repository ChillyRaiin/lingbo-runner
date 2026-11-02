const client = require('../../services/client')
const { failure, confirm } = require('../../services/ui')
Page({
  data: { status: null, pairing: null, loading: false, error: '' },
  onShow() { this.refresh() },
  async refresh() { this.setData({ loading: true, error: '' }); try { this.setData({ status: await client.appleHealthStatus() }) } catch (error) { this.setData({ error: error.message || '请先启动后端服务', status: null }) } finally { this.setData({ loading: false }) } },
  async pair() {
    if (this.data.loading) return
    try {
      const state = await client.state()
      if (!state.consent) { wx.navigateTo({ url: '/pages/privacy/privacy' }); return }
      this.setData({ loading: true }); const value = await client.appleHealthPairing()
      this.setData({ pairing: value })
    } catch (error) { failure(error) } finally { this.setData({ loading: false }) }
  },
  copyAddress() { wx.setClipboardData({ data: this.data.pairing?.publicBaseUrl || this.data.status?.publicBaseUrl || '' }) },
  copyCode() { if (this.data.pairing) wx.setClipboardData({ data: this.data.pairing.code }) },
  async disconnect() {
    if (!(await confirm('撤销 Apple 健康连接', '此设备的同步凭据立即失效。已同步跑步记录保留；需要清除全部数据时，可在“我的”中撤回授权。'))) return
    try { await client.disconnectAppleHealth(false); this.setData({ pairing: null }); await this.refresh() } catch (error) { failure(error) }
  }
})
