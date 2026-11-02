const client = require('../../services/client')
const { failure, confirm } = require('../../services/ui')
const viewMessages = values => values.map(value => ({ ...value, modeLabel: value.mode === 'deepseek' ? 'DeepSeek · 有来源解释' : value.mode === 'local-fallback' ? '本地检索 · 模型回退' : '本地知识检索' }))
Page({
  data: { status: null, messages: [], input: '', busy: false, error: '', useRemoteModel: false, useTrainingContext: false, includeOriginal: false, trainingAvailable: !client.isDemo, toMessage: '', starters: ['乳酸门槛跑和间歇训练有什么区别？', '疲劳时应该怎么调整训练？', 'VDOT 等效成绩为什么不等于实际 PB？'] },
  onShow() { this.refresh() },
  async refresh() {
    try { const status = await client.agentStatus(), messages = await client.agentHistory(); this.setData({ status, messages: viewMessages(messages), useRemoteModel: status.settings.enabled && status.configured, error: '', toMessage: messages.length ? 'message-' + messages[messages.length - 1].id : '' }) }
    catch (error) { this.setData({ error: error.message || error.errMsg || '尚未连接对话服务，请启动项目后端后重试。', status: null, messages: [] }) }
  },
  input(event) { this.setData({ input: event.detail.value }) },
  starter(event) { this.setData({ input: event.currentTarget.dataset.text }) },
  async dataConsent() {
    if (this.data.status?.dataConsent) return true
    if (!(await confirm('保存对话记录', '问题与回答将保存在本项目配置的服务中，最多保留最近 40 条，可随时清除。此步骤不启用 DeepSeek。'))) return false
    await client.agentDataConsent(); await this.refresh()
    if (!this.data.status?.dataConsent) throw new Error('授权状态尚未确认，请重新连接后再发送')
    return true
  },
  async remote(event) {
    try {
      if (!event.detail.value) { await client.agentSettings({ enabled: false, shareTraining: false }); this.setData({ useRemoteModel: false }); await this.refresh(); return }
      if (!this.data.status?.configured) { this.setData({ useRemoteModel: false }); throw new Error('尚未配置 DeepSeek 密钥；现在可以使用本地检索') }
      if (!(await this.dataConsent())) { this.setData({ useRemoteModel: false }); return }
      if (!(await confirm('使用 DeepSeek 解释', '将当前问题、最近对话和检索到的少量知识片段发送至 DeepSeek API。训练摘要默认不发送，模型调用按你的 API 账户计费。'))) { this.setData({ useRemoteModel: false }); return }
      await client.agentSettings({ enabled: true, shareTraining: false }); this.setData({ useRemoteModel: true, useTrainingContext: false, includeOriginal: false }); await this.refresh()
    } catch (error) { failure(error); this.setData({ useRemoteModel: false }) }
  },
  async context(event) {
    try {
      if (event.detail.value && this.data.useRemoteModel && !this.data.status.settings.shareTraining) {
        if (!(await confirm('允许使用训练摘要', '这次对话将参考已记录的近期跑量、能力与状态；启用 DeepSeek 时，这些摘要会一并发送至 DeepSeek。原始健康导出文件不会发送。'))) { this.setData({ useTrainingContext: false }); return }
        await client.agentSettings({ enabled: true, shareTraining: true }); await this.refresh()
      }
      this.setData({ useTrainingContext: event.detail.value })
    } catch (error) { failure(error); this.setData({ useTrainingContext: false }) }
  },
  original(event) { this.setData({ includeOriginal: event.detail.value }) },
  async send() {
    const message = this.data.input.trim()
    if (this.data.busy || !message || !this.data.status) return
    this.setData({ busy: true, error: '' })
    try {
      if (!(await this.dataConsent())) return
      await client.agentChat({ message, useRemoteModel: this.data.useRemoteModel, useTrainingContext: this.data.useTrainingContext, includeOriginal: this.data.includeOriginal })
      this.setData({ input: '' }); await this.refresh()
    } catch (error) { this.setData({ error: error.message || error.errMsg || '发送失败，消息尚未自动重发' }) }
    finally { this.setData({ busy: false }) }
  },
  async clear() { if (this.data.busy) return; if (await confirm('清除对话', '删除本项目保存的对话记录；已经发送给模型服务的数据需按该服务的政策处理。')) { try { await client.clearAgentHistory(); await this.refresh() } catch (error) { failure(error) } } },
  copySource(event) { wx.setClipboardData({ data: event.currentTarget.dataset.url }) },
  knowledge() { wx.navigateTo({ url: '/pages/knowledge/knowledge' }) }
})
