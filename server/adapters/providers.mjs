import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
// 前后端共用能力目录，避免新增设备时出现两份接入进度。
export const providerCapabilities = require('../../miniprogram/data/providers.js')
export class NotConnectedProvider {
  constructor(id) { this.id = id }
  async beginAuthorization() { throw new Error(this.id + ' 官方同步尚未接入') }
  async exchangeAuthorization() { throw new Error(this.id + ' 官方同步尚未接入') }
  async pullActivities() { throw new Error(this.id + ' 官方同步尚未接入') }
  async revoke() { throw new Error(this.id + ' 官方同步尚未接入') }
}
