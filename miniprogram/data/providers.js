module.exports = [
  { id: 'apple-health', title: 'Apple Watch / Apple 健康', status: 'available', capability: 'normalized-json-import', description: '文件导入已可用。授权与后台增量同步接口及 iOS 工程已提供；需 Mac/Xcode、iPhone 真机与 HTTPS 后端完成安装联调。', url: 'https://support.apple.com/en-gb/guide/iphone/iph5ede58c3d/ios' },
  { id: 'file', title: '运动文件', status: 'available', capability: 'normalized-json-import', description: 'TCX 经本地脚本转换后导入；FIT、GPX 原始文件解析尚未实现。' },
  { id: 'garmin', title: 'Garmin Connect', status: 'planned', capability: 'official-account-sync', description: '官方 Activity API；需核实当前申请状态、获批并完成授权接入。', url: 'https://developer.garmin.com/gc-developer-program/activity-api/' },
  { id: 'coros', title: '高驰 COROS', status: 'planned', capability: 'official-account-sync', description: '官方 Partner API / 开发者 MCP；需确认适合本项目的多用户授权方案。', url: 'https://support.coros.com/hc/en-us/articles/17085887816340-Submit-an-API-Application' },
  { id: 'suunto', title: 'Suunto 颂拓', status: 'planned', capability: 'official-account-sync', description: 'Suunto Cloud API；官方目前面向公司与组织，不提供个人用途 API。', url: 'https://apizone.suunto.com/' },
  { id: 'werun', title: '微信运动', status: 'configured-only', capability: 'daily-steps', description: '需真实 AppID、登录与授权；读取日步数，不能替代跑步训练记录。' }
]
