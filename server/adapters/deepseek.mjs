export class DeepSeekChatAdapter {
  constructor({ apiKey = '', model = 'deepseek-flash', baseUrl = 'https://api.deepseek.com', fetchImpl = fetch, timeoutMs = 25000 }) {
    const url = new URL(baseUrl)
    if (url.protocol !== 'https:' || url.hostname !== 'api.deepseek.com' || url.username || url.password || url.search || url.hash || !['/', '/v1', '/v1/'].includes(url.pathname)) throw new Error('DeepSeek 地址需为官方 HTTPS API 根地址或 /v1')
    this.apiKey = apiKey; this.model = model; this.baseUrl = baseUrl.replace(/\/$/, ''); this.fetch = fetchImpl; this.timeoutMs = timeoutMs
  }
  get configured() { return Boolean(this.apiKey) }
  async complete({ messages, tools, final = false }) {
    if (!this.configured) throw Object.assign(new Error('尚未配置 DeepSeek 密钥'), { code: 'not-configured' })
    const request = { model: this.model, messages, thinking: { type: 'disabled' }, max_tokens: 2200, temperature: 0.3, stream: false }
    if (final) request.response_format = { type: 'json_object' }
    else request.tools = tools
    let response
    try { response = await this.fetch(this.baseUrl + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + this.apiKey }, body: JSON.stringify(request), signal: AbortSignal.timeout(this.timeoutMs), redirect: 'error' }) }
    catch { throw Object.assign(new Error('DeepSeek 连接超时或不可用'), { code: 'unavailable' }) }
    if (!response.ok) throw Object.assign(new Error(response.status === 401 ? 'DeepSeek 密钥验证失败' : response.status === 429 ? 'DeepSeek 请求受限' : 'DeepSeek 请求失败'), { code: 'http-' + response.status })
    let data
    try { data = await response.json() } catch { throw Object.assign(new Error('DeepSeek 返回格式无效'), { code: 'invalid-response' }) }
    const message = data.choices?.[0]?.message
    if (!message || (typeof message.content !== 'string' && !Array.isArray(message.tool_calls))) throw Object.assign(new Error('DeepSeek 返回内容为空'), { code: 'invalid-response' })
    // reasoning_content 不存储、不展示。用户看到的是最终回答与实际工具名称。
    return { message: { role: 'assistant', content: message.content || null, ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}) }, usage: data.usage ? { promptTokens: data.usage.prompt_tokens, completionTokens: data.usage.completion_tokens } : null }
  }
}
