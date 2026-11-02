// 刷新时移除旧建议。页面离开或再次刷新后，较早的响应不能覆盖新状态。
async function loadPage(page, field, getValue) {
  const revision = (page._loadRevision || 0) + 1
  page._loadRevision = revision
  page.setData({ [field]: null, loading: true, error: '' })
  try {
    const value = await getValue()
    if (page._loadRevision === revision) page.setData({ [field]: value })
  } catch (error) {
    if (page._loadRevision === revision) page.setData({ error: error.message || error.errMsg || '读取失败，请检查网络后重试' })
  } finally {
    if (page._loadRevision === revision) page.setData({ loading: false })
  }
}
function cancelLoad(page) { page._loadRevision = (page._loadRevision || 0) + 1 }
module.exports = { loadPage, cancelLoad }
