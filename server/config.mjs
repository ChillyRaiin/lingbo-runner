import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
export const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url))
export const APP_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
export function readRuntimeConfig(environment = process.env, { root = PROJECT_ROOT, loadDotenv = true } = {}) {
  const dotenv = resolve(root, '.env')
  const values = { ...(loadDotenv && existsSync(dotenv) ? parseEnv(readFileSync(dotenv, 'utf8').replace(/^\uFEFF/, '')) : {}), ...environment }
  const string = (key, fallback = '') => String(values[key] ?? fallback).trim()
  const boolean = (key, fallback) => { const value = string(key, String(fallback)).toLowerCase(); if (!['true', 'false'].includes(value)) throw new Error(key + ' 需要 true 或 false'); return value === 'true' }
  const port = Number(string('PORT', '8787'))
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT 需要1～65535的整数')
  const authMode = string('AUTH_MODE', 'demo'), host = string('HOST', '127.0.0.1')
  if (!['demo', 'wechat'].includes(authMode)) throw new Error('AUTH_MODE 仅支持 demo 或 wechat')
  if (authMode === 'demo' && !['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('demo 模式只能监听本机回环地址')
  const url = (key, fallback, official = false) => {
    const raw = string(key, fallback)
    if (!raw) return ''
    let parsed; try { parsed = new URL(raw) } catch { throw new Error(key + ' 不是有效地址') }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || (official && (parsed.hostname !== 'api.deepseek.com' || !['/', '/v1', '/v1/'].includes(parsed.pathname)))) throw new Error(key + ' 需要有效HTTPS地址，不得含凭据或查询参数')
    return raw.replace(/\/$/, '')
  }
  const encryption = string('SESSION_ENCRYPTION_KEY'), encryptionKey = encryption ? Buffer.from(encryption, 'base64') : null
  if (encryption && (encryptionKey.length !== 32 || encryptionKey.toString('base64') !== encryption)) throw new Error('SESSION_ENCRYPTION_KEY 需要32字节密钥的标准base64值')
  const appId = string('WECHAT_APP_ID'), appSecret = string('WECHAT_APP_SECRET')
  if (authMode === 'wechat' && (!appId || !appSecret || !encryptionKey)) throw new Error('wechat 模式需要AppID、AppSecret与服务端加密密钥')
  return { root, port, host, authMode, appId, appSecret, encryptionKey,
    databasePath: resolve(root, string('DATABASE_PATH', './data/runner.sqlite')),
    knowledgeDirectory: resolve(root, string('KNOWLEDGE_DIRECTORY', './.private/knowledge')),
    projectKnowledgeDirectory: resolve(root, string('PROJECT_KNOWLEDGE_DIRECTORY', '../knowledge-base')),
    privateKnowledgeEnabled: boolean('KNOWLEDGE_PRIVATE_ENABLED', true), privateLibraryAccess: boolean('PRIVATE_LIBRARY_ACCESS', false),
    deepseekApiKey: string('DEEPSEEK_API_KEY'), deepseekModel: string('DEEPSEEK_MODEL', 'deepseek-flash'),
    deepseekBaseUrl: url('DEEPSEEK_BASE_URL', 'https://api.deepseek.com', true), publicBaseUrl: url('PUBLIC_BASE_URL', '') }
}
