const { validateActivity, ValidationError } = require('./engine')
// 文件导入身份由用户声明，不能冒充已经验证的官方设备同步。
const PROVIDERS = ['apple-health', 'garmin', 'coros', 'suunto', 'tcx', 'gpx', 'file']
function normalizeImport(batch, today) {
  if (!batch || batch.schemaVersion !== 1 || !PROVIDERS.includes(batch.provider) || !Array.isArray(batch.activities) || batch.activities.length < 1 || batch.activities.length > 100) throw new ValidationError('需要 schemaVersion=1、有效 provider 和 1～100 条活动')
  return batch.activities.map(input => {
    if (!input || typeof input.externalId !== 'string' || !input.externalId.trim() || input.externalId.length > 160) throw new ValidationError('导入记录需要 externalId（最多 160 字符）')
    if (input.sport !== 'running') throw new ValidationError('首版只导入明确标为 running 的跑步活动')
    // 设备通常不含 RPE；保留缺失，不用默认 RPE 伪造训练负荷。
    const valid = validateActivity({ ...input, rpe: input.rpe == null ? 1 : input.rpe, isRace: input.isRace === true }, today)
    return { ...valid, rpe: input.rpe == null ? null : valid.rpe, source: batch.provider + ' 文件导入', provider: batch.provider, externalId: input.externalId, sport: 'running' }
  })
}
module.exports = { PROVIDERS, normalizeImport }
