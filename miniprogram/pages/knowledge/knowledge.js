const client = require('../../services/client')
const { failure } = require('../../services/ui')
Page({
  data: { query: '', cards: client.knowledge.cards, sources: client.knowledge.sources, metadata: {}, error: '', answer: '', citations: [] },
  async onShow() { try { const value = await client.knowledgeCatalog(); this.setData({ cards: value.cards, sources: value.sources, metadata: value.metadata || {}, error: '' }) } catch { this.setData({ error: '后台知识库暂未连接，当前只显示本机内置知识卡。', cards: client.knowledge.cards, sources: client.knowledge.sources, metadata: {} }) } },
  input(event) { this.setData({ query: event.detail.value }) },
  async search() { try { const result = await client.explain(this.data.query); this.setData({ answer: result.answer, citations: result.citations }) } catch (e) { failure(e) } },
  copyUrl(event) { wx.setClipboardData({ data: event.currentTarget.dataset.url }) },
  agent() { wx.navigateTo({ url: '/pages/agent/agent' }) }
})
