import { DatabaseSync } from 'node:sqlite'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { readRuntimeConfig, PROJECT_ROOT } from '../server/config.mjs'
import { findPython } from './python-tools.mjs'
const major = Number(process.versions.node.split('.')[0])
const report = { node: { version: process.versions.node, executable: process.execPath, supported: major === 24 }, projectRoot: PROJECT_ROOT, issues: [], pending: [] }
if (major !== 24) report.issues.push('本项目当前验证范围为Node24，请使用该版本')
try { const db = new DatabaseSync(':memory:'); db.prepare('SELECT 1').get(); db.close(); report.sqlite = 'available' } catch { report.issues.push('node:sqlite不可用') }
try {
  const config = readRuntimeConfig()
  report.config = { authMode: config.authMode, host: config.host, port: config.port, databasePath: config.databasePath, projectKnowledgeDirectory: config.projectKnowledgeDirectory, deepseekConfigured: Boolean(config.deepseekApiKey), wechatConfigured: Boolean(config.appId && config.appSecret && config.encryptionKey), httpsConfigured: Boolean(config.publicBaseUrl) }
  if (!existsSync(resolve(config.projectKnowledgeDirectory, 'exports/knowledge-cards.json'))) report.pending.push('同项目知识库导出未找到，当前只会使用内置卡')
  if (!config.deepseekApiKey) report.pending.push('DeepSeek密钥未配置，当前使用本地检索')
  if (config.authMode !== 'wechat' || !config.publicBaseUrl) report.pending.push('Apple健康真机同步还需要真实微信身份与HTTPS服务')
} catch (error) { report.issues.push(error.message) }
try { report.python = findPython() } catch (error) { report.pending.push(error.message) }
console.log(JSON.stringify(report, null, 2))
process.exitCode = report.issues.length ? 1 : 0
