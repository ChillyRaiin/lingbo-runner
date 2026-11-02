// 规则输出是事实与边界。未来的 LLM 只能解释它，不能改写剂量与禁训结论。
export class CoachService {
  constructor({ repository, engine, knowledgeRetriever }) { this.repository = repository; this.engine = engine; this.knowledgeRetriever = knowledgeRetriever }
  overview(userId, today) { return this.engine.evaluate(this.repository.getState(userId), today) }
  async explain(query) {
    const citations = (await this.knowledgeRetriever.search(query)).slice(0, 3)
    return { mode: 'curated-retrieval', answer: citations.length ? citations.map(c => c.summary + (c.limits ? '\n条件与局限：' + c.limits : '')).join('\n\n') : '现有知识卡没有找到可靠依据，暂不推断。', citations, limitation: '快速检索只使用概括卡；AI来源核对不等于人类专业审校。模型解释可在知识助手中另行启用。' }
  }
}
