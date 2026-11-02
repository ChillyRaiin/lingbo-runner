# 循跑：微信跑步训练助手框架

为ChillyRaiin与少量跑友试用而建立。产品暂名“循跑”，以《丹尼尔斯经典跑步训练法》中文第三版及同项目知识库为基础，优先支持 Apple Watch。版本：0.3.1，2026-10-13。

当前已有原生小程序、后端、Apple 健康同步接口和 iOS 伴随端源工程、带引用的知识 Agent。仍需 Mac/Xcode/iPhone 真机、真实微信登录与 HTTPS 后端完成实际健康同步；DeepSeek 密钥尚未配置，当前可用本地检索。

## 先看什么

Windows可先运行 `powershell -NoProfile -File scripts/dev.ps1 -Action doctor`，检查实际Node、Python、配置和未完成的接入项。双击 `start.cmd` 可启动；也可用标准的 `npm start`。当前验证范围为Node24，项目启动脚本会优先选择可用的Codex自带Node24解释器，或使用系统Node24。

- [你需要准备的事项](docs/YOUR-NEXT-STEPS.md)：账号、运动数据、书目和试用安排。
- [架构与扩展指南](docs/ARCHITECTURE.md)：如何加设备、训练方法、知识源和模型。
- [接口说明](docs/API.md)：登录、数据、评估与删除。
- [训练规则与来源](docs/TRAINING-AND-KNOWLEDGE.md)：原书依据、工程假设和未验证项。
- [验证记录](docs/VALIDATION.md)：实际测试与尚未测试的部分。
- [本轮开发报告](docs/DEVELOPMENT-REPORT-2026-10-13.md)：环境优化、bug复现与修复结果。
- [Apple Watch 自动同步与 Agent 配置](docs/APPLE-HEALTH-AND-AGENT.md)：本轮新增的完整接入步骤。

## 已实现 / 预留

| 模块 | 当前可用 | 后续工作 |
| --- | --- | --- |
| 小程序 | 五个主页面，加知识、授权、Agent、Apple 健康连接，共9页 | 微信开发者工具编译与真机体验 |
| 运动数据 | 手动记录、Apple 健康 XML/ZIP 与 TCX 本地转换；来源保留与去重 | FIT/GPX、分段与更多健康指标 |
| Apple Watch 自动同步 | 配对、写入范围凭据、增量更新/删除、撤销连接；HealthKit iOS工程 | Xcode编译、签名安装、HTTPS/真实微信身份与后台真机测试 |
| 微信运动 | wx.login、授权、密文上传与服务端解密代码 | 真实 AppID/域名/平台隐私指引配置及真机验证 |
| 状态与恢复 | 今日睡眠、疲劳、酸痛、不适记录；保守状态建议 | 个体基线、HRV/静息心率趋势与实际验证 |
| 训练 | 成年稳定跑者的 E 跑基础周草案；不适和缺失信息拦截 | 专项周期、T/I/R 剂量、赛前减量、伤后复出 |
| 成绩 | VDOT、E 跑近似配速、跨距离等效成绩、历史 PB | 专项耐力与环境模型、个人预测误差与区间校准 |
| 知识 | 接入 ../knowledge-base 的11本书、2946页索引、34张扩展卡、12篇补充资料；与7张内置卡共用后台检索 | 专业人类审校、向量检索和内容许可核查 |
| 跑步专家 Agent | 多轮对话、来源、局限、只读训练工具；DeepSeek V4.1 Flash适配器与授权控制 | 密钥配置后的真实模型联调与回答质量评估 |
| 账户 | 后端会话、授权记录、数据隔离、导出、撤权清除、删号 | 生产身份/域名配置、备份清除策略与运营信息 |

## 方式一：直接体验小程序

1. 安装微信开发者工具，选择“小程序”，导入本项目根目录（不是只导入 miniprogram 目录）。
2. 当前 project.config.json 的 AppID 是 touristappid；如果工具不接受它，使用测试号或自己的真实 AppID。
3. miniprogram/config.js 默认 `mode: 'demo'`，跑步示例可离线查看。默认 `agentMode: 'api'`，知识库与Agent需要启动后端；纯离线卡片可将其改为 `local`。
4. “今日”先显示示例记录；在“我的”查看数据说明并授权，保存个人档案、状态或跑步时会自动清除示例。
5. 先保存档案，再记录今日状态及近期跑步；测试成绩需明确标记为比赛/有代表性的全力测试。

体验模式的数据保存在当前设备。清理小程序缓存可能丢失数据；“我的”可导出 JSON。切换 API 模式不会把本地体验数据自动上传，也不会把后端错误伪装成示例结果。

## 方式二：启动后端与本机联调

需要 Node.js 24。无第三方 Node 依赖，无需 npm install。Python 3.10+ 用于 Apple 健康/TCX 转换；重新提取PDF另需pypdf。同项目 ../knowledge-base 的索引直接复用，启动时不重复OCR。

```powershell
cd D:\runner\lingbo-runner
if (!(Test-Path .env)) { Copy-Item .env.example .env }
npm start
```

后端默认：http://127.0.0.1:8787。`/health` 用于健康检查，`/preview` 提供示例界面预览，后者不是微信模拟器。

把 miniprogram/config.js 改为：

```javascript
module.exports = {
  mode: 'api',
  apiAuthMode: 'demo',
  apiBaseUrl: 'http://127.0.0.1:8787'
}
```

仅在微信开发者工具的本地调试设置中临时关闭合法域名校验。真机无法通过手机的 127.0.0.1 访问电脑；真机试用应部署 HTTPS 后端并配置合法请求域名。demo 认证被限制为本机监听，不能直接作为公网登录入口。

## 运动手表文件导入

Apple Watch 用户先在 iPhone“健康 → 头像 → 导出所有健康数据”导出 ZIP，在电脑本地转换：

```powershell
node scripts/python-tools.mjs apple-health "D:\我的跑步\export.zip" --since 2026-07-01 --output "D:\我的跑步\apple-runs.json"
```

只输出跑步摘要，不输出姓名、其他健康记录或GPS。超过100条时分批。转换后的跑步JSON可在小程序“记录”中选择导入。自动读取与增量同步使用 iOS 伴随端路线，不需要反复导出文件，步骤见 docs/APPLE-HEALTH-AND-AGENT.md。

优先从设备平台导出含活动摘要的 TCX。不同平台与版本的导出功能需要实机确认。当前 FIT/GPX 解析尚未实现，不把路线文件误当作训练活动。

```powershell
node scripts/python-tools.mjs tcx "D:\我的跑步\run.tcx" --provider garmin --output "D:\我的跑步\run.json"
```

把转换出的 JSON 发给自己的微信，在小程序“记录 → 选择运动 JSON 文件”中导入。转换脚本不输出 GPS 坐标；设备文件通常没有 RPE，导入后点击记录补充。脚本不会自动把任何一次运动标记成比赛。

同一用户、同一 provider、同一 externalId 会去重。跨设备重复记录尚不自动合并，防止误删不同活动。examples 下的文件均为人工示例，不能作为个人训练依据。

## 真实微信登录配置

服务端 .env：`AUTH_MODE=wechat`，填写真实 `WECHAT_APP_ID`、`WECHAT_APP_SECRET` 与 32 字节随机 `SESSION_ENCRYPTION_KEY`（base64）。示例生成命令：

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

把 project.config.json 的 appid 换成真实 AppID；客户端设置 `mode: 'api'`、`apiAuthMode: 'wechat'` 和自己的 HTTPS 服务地址。平台后台需配置对应隐私保护指引、体验成员与请求合法域名。服务端 secret 与加密密钥只在服务器填写，不放小程序、不提交 Git、不发到聊天。

微信运动是日步数接口。2026-10-08 查阅的官方文档写明过去三十一天、需要 wx.login 与 scope.werun；它不直接返回跑步距离、配速、心率或训练分段。

## 验证与开发

配置、数据库和知识库的相对路径统一按项目根目录解析；从其他目录启动也不另建数据位置。`.env`由启动入口加载，外部环境变量优先。Python工具优先使用项目`.venv`、自带运行时或可用的Python3.10+，不会采用Windows应用商店占位路径。

```powershell
npm test
npm run check
npm run doctor
npm run test:python
npm run backup
npm run package
```

训练计算、数据校验与知识概括位于 miniprogram/domain 和 miniprogram/data，后端引用同一份纯函数。新设备实现适配器，新模型替换服务接口，新知识源替换检索器，不在页面中堆积规则。正式扩大用户规模前，先完成文档中的上线与模型验证工作。
