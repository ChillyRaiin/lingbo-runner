import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

// 同项目 knowledge-base 是独立维护的数据源。这里只适配其稳定导出，不改写原库。
export function loadProjectKnowledge({ baseCatalog, directory, includePrivate }) {
  const cardsPath = directory && join(directory, 'exports', 'knowledge-cards.json')
  const sourcesPath = directory && join(directory, 'exports', 'sources.json')
  if (!cardsPath || !existsSync(cardsPath) || !existsSync(sourcesPath)) return { catalog: { ...baseCatalog, metadata: { projectLibraryLoaded: false } }, documents: [] }
  const rawCards = readFileSync(cardsPath, 'utf8'), rawSources = readFileSync(sourcesPath, 'utf8')
  const cards = JSON.parse(rawCards), sources = JSON.parse(rawSources)
  if (!Array.isArray(cards) || !Array.isArray(sources)) throw new Error('知识库导出格式无效')
  // 只有文件指纹一致才把原库 Daniels 映射为既有版本，避免混用不同版次。
  const danielsHash = '482a513539dadc7539f5d71bd3df1374ac036d60c399297867f2f8ffb5db3655'
  const sameDaniels = sources.find(source => source.id === 'daniels')?.sha256 === danielsHash
  const sourceId = id => id === 'daniels' && sameDaniels ? 'daniels-3-cn' : 'library-' + id
  const mappedSources = sources.map(source => ({ id: sourceId(source.id), title: source.title, author: source.author, edition: source.edition || (source.year ? String(source.year) : '待确认'), year: source.year, type: source.type || '本地书籍', scope: source.readingRole || source.summary || source.topic, status: source.readStatus || source.editionStatus || '来源核对层级待确认', limits: source.limits || '原书未逐页人工审校，OCR与表格数字需回看原页。', visibility: source.visibility || 'metadata', rights: source.visibility === 'local-private' ? '本地研究资料；公开服务的全文使用许可待确认' : '公开书目信息；不表示已获全文再分发许可', pdfPageCount: source.pageCount, sha256: source.sha256, ...(source.url ? { url: source.url } : {}), origin: 'project-knowledge-base' }))
  const byId = new Map(mappedSources.map(source => [source.id, source]))
  const mappedCards = cards.filter(card => includePrivate || (card.visibility === 'public' && card.usePolicy?.publicServiceCleared === true)).map(card => {
    const citations = (card.citations || []).map(reference => {
      const id = sourceId(reference.sourceId), source = byId.get(id)
      if (!source) throw new Error('知识卡引用未知来源')
      return { ...reference, sourceId: id, title: source.title, pdfPages: reference.pdfPages || [], readStatus: source.status, ...(source.url ? { url: source.url } : {}) }
    })
    return { id: 'kb-' + card.id, title: card.title, topic: card.topic, summary: card.summary, why: card.why, application: card.application, keywords: card.keywords || [], evidence: card.evidence || 'AI 来源核对概括，未经过人类内容审校', sourceId: sourceId(card.sourceId), pdfPages: card.pdfPages || [], citations, limits: card.limits, review: card.review, usePolicy: card.usePolicy, contentHumanReviewed: card.review?.contentHumanReview?.humanReviewed === true, visibility: card.visibility || 'local-private', reviewStatus: card.reviewStatus || 'ai-source-checked-summary', chapter: citations.map(ref => ref.title + (ref.pdfPages.length ? '，PDF页序号 ' + ref.pdfPages.join('、') : '')).join('；'), origin: 'project-knowledge-base' }
  })
  const documents = [], stableChunks = join(directory, 'exports', 'retrieval-chunks-v1.jsonl'), chunksPath = existsSync(stableChunks) ? stableChunks : join(directory, 'data', 'chunks.jsonl')
  if (includePrivate && existsSync(chunksPath)) {
    for (const line of readFileSync(chunksPath, 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue
      const chunk = JSON.parse(line), source = byId.get(sourceId(chunk.sourceId))
      if (!source || !Number.isInteger(chunk.pdfPage) || chunk.pdfPage < 1 || chunk.pdfPage > (source.pdfPageCount || 100000) || typeof chunk.text !== 'string') continue
      if (source.sha256 && chunk.documentSha256 !== source.sha256) throw new Error('知识库片段与来源文件指纹不一致，请重建导出')
      const text = chunk.text.trim().slice(0, 1600)
      if (text.length < 80) continue
      documents.push({ id: 'library-' + chunk.id, sourceId: source.id, title: source.title, chapter: '用户 PDF 页序号 ' + chunk.pdfPage, pdfPages: [chunk.pdfPage], text, evidence: '机器文字/OCR提取，未逐页人工审校', reviewStatus: 'machine-unreviewed', visibility: 'private', extractionMethod: chunk.method, documentSha256: chunk.documentSha256, searchText: text })
      if (documents.length > 10000) throw new Error('项目知识库片段超过10000条')
    }
  }
  const reportPath = join(directory, 'data', 'build-report.json'), report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : {}
  const mergedSources = new Map(baseCatalog.sources.map(source => [source.id, source]))
  mappedSources.forEach(source => { const original = sources.find(item => sourceId(item.id) === source.id); mergedSources.set(source.id, { ...(mergedSources.get(source.id) || {}), ...source, review: original?.review, rightsRecord: original?.rights, usePolicy: original?.usePolicy }) })
  return { catalog: { ...baseCatalog, cards: [...baseCatalog.cards, ...mappedCards], sources: [...mergedSources.values()], metadata: { projectLibraryLoaded: true, version: createHash('sha256').update(rawCards + rawSources).digest('hex').slice(0, 16), importedCards: mappedCards.length, books: report.books || 0, indexedPages: report.indexedPages || 0, externalSources: report.external || 0, topics: report.topics || 0, includePrivate, licenseStatus: '本地研究；公开服务许可需逐来源确认' } }, documents }
}
