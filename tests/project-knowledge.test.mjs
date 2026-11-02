import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { knowledge } from '../server/domain.mjs'
import { loadProjectKnowledge } from '../server/adapters/project-knowledge.mjs'
import { LocalKnowledgeRetriever } from '../server/adapters/local-knowledge.mjs'
function fixture(hash = '482a513539dadc7539f5d71bd3df1374ac036d60c399297867f2f8ffb5db3655') {
  const qa = fileURLToPath(new URL('../.private/qa/', import.meta.url)); mkdirSync(qa, { recursive: true })
  const root = mkdtempSync(join(qa, 'kb-')); mkdirSync(join(root, 'exports')); mkdirSync(join(root, 'data'))
  const source = { id: 'daniels', title: '原书', pageCount: 286, sha256: hash, path: 'private/full/path.pdf', visibility: 'local-private', review: { contentHumanReview: { humanReviewed: false } } }
  const card = { id: 'strength', title: '力量与跑步经济性', topic: '跑者力量', summary: '力量训练需匹配目标。', keywords: ['力量', '经济性'], sourceId: 'daniels', pdfPages: [14], citations: [{ sourceId: 'daniels', pdfPages: [14], contentHumanReviewed: false }], reviewStatus: 'ai-source-checked-summary', review: { contentHumanReview: { humanReviewed: false } }, visibility: 'local-private', limits: '个体方法需验证' }
  writeFileSync(join(root, 'exports/sources.json'), JSON.stringify([source])); writeFileSync(join(root, 'exports/knowledge-cards.json'), JSON.stringify([card]))
  writeFileSync(join(root, 'exports/retrieval-chunks-v1.jsonl'), JSON.stringify({ id: 'p20-c0', sourceId: 'daniels', pdfPage: 20, text: '肌糖原'.repeat(40), documentSha256: hash }) + '\n')
  writeFileSync(join(root, 'data/build-report.json'), JSON.stringify({ books: 1, indexedPages: 286, external: 0, topics: 1 }))
  return root
}
test('整合保留人类未审校、局限和多来源引用，并隐藏原书路径', () => {
  const value = loadProjectKnowledge({ baseCatalog: knowledge, directory: fixture(), includePrivate: true })
  const card = value.catalog.cards.find(card => card.id === 'kb-strength')
  assert.equal(card.contentHumanReviewed, false); assert.equal(card.reviewStatus, 'ai-source-checked-summary')
  assert.equal(card.limits, '个体方法需验证'); assert.equal(card.citations[0].sourceId, 'daniels-3-cn')
  assert.equal(value.catalog.sources.find(source => source.id === 'daniels-3-cn').path, undefined)
  const retriever = new LocalKnowledgeRetriever({ catalog: value.catalog, additionalDocuments: value.documents })
  assert.ok(retriever.search('力量').some(hit => hit.id === 'kb-strength'))
  assert.equal(retriever.search('肌糖原').some(hit => hit.visibility === 'private'), false)
  assert.ok(retriever.search('肌糖原', { includeRaw: true }).some(hit => hit.reviewStatus === 'machine-unreviewed'))
})
test('不同Daniels版本不共享来源ID，私有资料未自动进入公开模式', () => {
  const root = fixture('different-file-hash')
  const privateValue = loadProjectKnowledge({ baseCatalog: knowledge, directory: root, includePrivate: true })
  assert.equal(privateValue.catalog.cards.find(card => card.id === 'kb-strength').sourceId, 'library-daniels')
  const publicValue = loadProjectKnowledge({ baseCatalog: knowledge, directory: root, includePrivate: false })
  assert.equal(publicValue.catalog.cards.length, knowledge.cards.length); assert.equal(publicValue.documents.length, 0)
})
test('缺失可见性标记不等于已获准公开发布', () => {
  const root = fixture(), path = join(root, 'exports/knowledge-cards.json')
  const cards = JSON.parse(readFileSync(path, 'utf8')); delete cards[0].visibility
  writeFileSync(path, JSON.stringify(cards))
  assert.equal(loadProjectKnowledge({ baseCatalog: knowledge, directory: root, includePrivate: false }).catalog.cards.length, knowledge.cards.length)
})
