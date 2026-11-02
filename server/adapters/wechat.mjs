import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
const invalid = message => Object.assign(new Error(message), { status: 400 })
const unavailable = () => Object.assign(new Error('微信登录服务暂时不可用'), { status: 502 })
export async function codeToSession(code, config) {
  if (typeof code !== 'string' || code.length < 1 || code.length > 256) throw invalid('微信登录 code 无效')
  const url = new URL('https://api.weixin.qq.com/sns/jscode2session')
  url.search = new URLSearchParams({ appid: config.appId, secret: config.appSecret, js_code: code, grant_type: 'authorization_code' }).toString()
  let response
  try { response = await fetch(url, { signal: AbortSignal.timeout(10000) }) }
  catch { throw unavailable() }
  if (!response.ok) throw unavailable()
  let data; try { data = await response.json() } catch { throw unavailable() }
  if (data.errcode || !data.openid || !data.session_key) throw invalid('微信登录失效，请重新登录')
  return { externalId: 'wechat:' + data.openid, sessionKey: data.session_key }
}
export function encryptSessionKey(value, key) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64')
}
export function decryptSessionKey(value, key) {
  const data = Buffer.from(value, 'base64'), decipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12))
  decipher.setAuthTag(data.subarray(12, 28))
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8')
}
export function decryptWeRun({ encryptedData, iv }, sessionKey, appId, today, dateKey) {
  if (typeof encryptedData !== 'string' || encryptedData.length > 100000 || typeof iv !== 'string') throw invalid('微信运动密文无效')
  let data
  try {
    const aes = createDecipheriv('aes-128-cbc', Buffer.from(sessionKey, 'base64'), Buffer.from(iv, 'base64'))
    data = JSON.parse(Buffer.concat([aes.update(Buffer.from(encryptedData, 'base64')), aes.final()]).toString('utf8'))
  } catch { throw invalid('运动数据解密失败，请重新登录后同步') }
  if (data.watermark?.appid !== appId) throw invalid('运动数据来源校验失败')
  if (!Array.isArray(data.stepInfoList) || data.stepInfoList.length > 32) throw invalid('步数数据结构无效')
  return data.stepInfoList.map(item => {
    if (!Number.isInteger(item.timestamp) || item.timestamp < 0 || item.timestamp > Date.now() / 1000 + 86400 || !Number.isInteger(item.step) || item.step < 0 || item.step > 200000) throw invalid('步数数据无效')
    const date = dateKey(new Date(item.timestamp * 1000))
    if (date > today) throw invalid('步数日期无效')
    return { date, step: item.step }
  })
}
