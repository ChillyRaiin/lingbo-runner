function failure(error) { wx.showToast({ title: error.message || error.errMsg || '操作失败', icon: 'none', duration: 3000 }) }
function number(value, name) { if (String(value).trim() === '') throw new Error('请填写' + name); const n = Number(value); if (!Number.isFinite(n)) throw new Error(name + '需要数字'); return n }
function confirm(title, content) { return new Promise(resolve => wx.showModal({ title, content, success: result => resolve(result.confirm), fail: () => resolve(false) })) }
module.exports = { failure, number, confirm }
