const client = require('../../services/client')
const { failure } = require('../../services/ui')
Page({ data: { isDemo: client.isDemo }, async accept() { try { await client.consent(true); wx.showToast({ title: '已记录授权选择' }); wx.navigateBack() } catch (e) { failure(e) } }, back() { wx.navigateBack() }, openPlatformPrivacy() { if (typeof wx.openPrivacyContract === 'function') wx.openPrivacyContract({ fail: failure }); else failure(new Error('当前版本不能打开平台隐私指引')) } })
