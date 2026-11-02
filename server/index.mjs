import { createApplication } from './app.mjs'
import { readRuntimeConfig } from './config.mjs'
let app
try {
  const config = readRuntimeConfig()
  app = createApplication(config)
  app.server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? '启动失败：端口已被占用，请关闭已有服务或修改PORT。' : '启动失败：无法监听配置的地址，请检查HOST和PORT。')
    app.repository.close(); process.exitCode = 1
  })
  app.server.listen(config.port, config.host, () => console.log('循跑服务已启动：http://' + config.host + ':' + config.port + '；认证模式：' + config.authMode))
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => app.server.close(() => { app.repository.close(); process.exit(0) }))
} catch (error) {
  console.error('启动失败：' + (error.message?.includes('Invalid URL') ? '地址配置无效' : error.message))
  app?.repository.close(); process.exitCode = 1
}
