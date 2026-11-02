import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

const stopWords = new Set(['什么', '怎么', '如何', '一下', '可以', '我的', '今天', '这个', '那个', '请问', '帮我', '告诉', '一个', '需要', '应该'])
const aliases = [['乳酸门槛','阈值','threshold','t跑'],['间歇训练','interval','i跑'],['重复训练','repetition','r跑'],['轻松跑','慢跑','easy','e跑'],['力量','抗阻','strength'],['恢复','recovery'],['睡眠','sleep'],['碳水','补给','carbohydrate','fuel'],['经济性','economy'],['减量','taper'],['热身','warmup'],['耐久性','durability'],['跑量','负荷','load']]
const paceTopics = [{ words: ['乳酸门槛','阈值','threshold','t跑'], prefix: 't跑' }, { words: ['间歇训练','interval','i跑'], prefix: 'i跑' }, { words: ['重复训练','repetition','r跑'], prefix: 'r跑' }, { words: ['轻松跑','easy','e跑'], prefix: 'e跑' }, { words: ['马拉松配速','m跑'], prefix: 'm跑' }]
function tokens(value) {
  const text = String(value || '').toLowerCase(), result = []
  for (const match of text.matchAll(/[a-z]+\d*|[\u4e00-\u9fff]+/g)) {
    const term = match[0]
    if (/^[a-z]/.test(term)) result.push(term)
    else for (let i = 0; i + 1 < term.length; i++) { const token = term.slice(i, i + 2); if (!stopWords.has(token)) result.push(token) }
  }
  return result
}
function cleanText(text) { return String(text).replace(/更多精彩\s*PDF电子书[^\n]*/g, '').trim() }

export class LocalKnowledgeRetriever {
  constructor({ catalog, directory, includePrivate = false, additionalDocuments = [] }) {
    this.catalog = catalog
    this.documents = catalog.cards.map(card => ({ ...card, text: card.summary, title: card.title, visibility: 'curated', reviewStatus: card.reviewStatus || 'reviewed', contentHumanReviewed: card.contentHumanReviewed === true, searchText: card.title + ' ' + card.keywords.join(' ') + ' ' + card.summary + ' ' + (card.why || '') + ' ' + (card.application || '') + ' ' + (card.limits || '') }))
    this.documents.push(...additionalDocuments)
    if (includePrivate && directory && existsSync(directory)) {
      const allowedSources = new Map(catalog.sources.map(source => [source.id, source]))
      for (const file of readdirSync(directory).filter(name => name.endsWith('.jsonl')).sort()) {
        const path = join(directory, file)
        if (statSync(path).size > 20 * 1024 * 1024) throw new Error('知识索引超过 20MB，请拆分')
        for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
          if (!line.trim()) continue
          const chunk = JSON.parse(line), source = allowedSources.get(chunk.sourceId)
          if (!source || !Number.isInteger(chunk.pdfPage) || chunk.pdfPage < 16 || typeof chunk.text !== 'string') continue
          const text = cleanText(chunk.text).slice(0, 1600)
          if (text.length < 80) continue
          const digest = createHash('sha256').update(text).digest('hex').slice(0, 12)
          this.documents.push({ id: 'pdf-' + chunk.sourceId + '-p' + chunk.pdfPage + '-' + digest, sourceId: source.id, title: source.title, chapter: '用户 PDF 页序号 ' + chunk.pdfPage, pdfPages: [chunk.pdfPage], text, evidence: '本地原书文本提取，尚需人工复核', reviewStatus: 'extracted-not-reviewed', visibility: 'private', searchText: text })
          if (this.documents.length > 10000) throw new Error('本地知识索引超过 10000 片段')
        }
      }
    }
    this.frequencies = new Map()
    for (const document of this.documents) {
      const words = tokens(document.searchText), frequency = new Map()
      for (const word of words) frequency.set(word, (frequency.get(word) || 0) + 1)
      document.frequency = frequency; document.length = Math.max(words.length, 1)
      for (const word of frequency.keys()) this.frequencies.set(word, (this.frequencies.get(word) || 0) + 1)
    }
    this.averageLength = this.documents.reduce((sum, doc) => sum + doc.length, 0) / Math.max(this.documents.length, 1)
  }
  search(query, { limit = 4, includeRaw = false } = {}) {
    const normalized = String(query || '').toLowerCase().replace(/\s+/g, '')
    const expanded = aliases.filter(group => group.some(term => normalized.includes(term))).flat().join(' ')
    const words = [...new Set(tokens(String(query || '') + ' ' + expanded))], total = this.documents.length
    const ranked = this.documents.filter(document => includeRaw || document.visibility !== 'private').map(document => {
      let score = 0, matches = 0
      for (const word of words) {
        const count = document.frequency.get(word) || 0
        if (!count) continue
        matches++
        const idf = Math.log(1 + (total - this.frequencies.get(word) + 0.5) / (this.frequencies.get(word) + 0.5))
        score += idf * count * 2.2 / (count + 1.2 * (0.25 + 0.75 * document.length / this.averageLength))
      }
      // 已有来源核对的概括卡优先；不升级其人类审校状态。
      if (['reviewed', 'source-checked-synthesis', 'ai-source-checked-summary'].includes(document.reviewStatus)) score *= 1.8
      const title = document.title.toLowerCase().replace(/\s+/g, '')
      // 区分 T 巡航间歇与 I 训练，不能仅因两者都含“间歇”便混为同一课型。
      if (document.visibility !== 'private') for (const topic of paceTopics) if (topic.words.some(word => normalized.includes(word)) && title.startsWith(topic.prefix)) score += 30
      return { document, score, matches }
    }).filter(item => item.matches > 0).sort((a, b) => b.score - a.score)
    const result = [], seenPages = new Set()
    for (const item of ranked) {
      const document = item.document, pageKey = document.visibility === 'private' ? document.sourceId + ':' + document.pdfPages[0] : document.id
      if (seenPages.has(pageKey)) continue
      seenPages.add(pageKey)
      const { frequency, length, searchText, ...citation } = document
      result.push({ ...citation, text: document.text.slice(0, 700), summary: document.summary || document.text.slice(0, 280) })
      if (result.length >= limit) break
    }
    return result
  }
  status() {
    const privateDocuments = this.documents.filter(doc => doc.visibility === 'private')
    return { strategy: 'local-bm25', snippets: this.documents.length, reviewedCards: this.catalog.cards.length, privateSnippets: privateDocuments.length, extractedPages: new Set(privateDocuments.map(doc => doc.sourceId + ':' + doc.pdfPages[0])).size, includesPrivate: privateDocuments.length > 0, projectLibrary: this.catalog.metadata || {}, note: '本地词法检索；文本提取不等于图表或全文内容已核对。' }
  }
}
