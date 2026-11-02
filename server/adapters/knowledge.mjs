export class CuratedKnowledgeRetriever {
  constructor(catalog) { this.catalog = catalog }
  search(query) { return this.catalog.searchKnowledge(query) }
}
// 可替换为本地向量库/pgvector；输出契约不随供应商变化。
export class LlmExplanationPort {
  async explain({ ruleResult, citations }) { throw new Error('尚未配置解释模型；继续使用可追溯的规则说明') }
}
