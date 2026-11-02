# 循跑开发报告：环境优化与缺陷修复

日期：2026-10-13（Asia/Hong_Kong）  
版本：0.3.0 → 0.3.1  
项目：D:\runner\lingbo-runner  
负责人：誉天；工程协作：凌波零

## 1. 本轮结论

本轮完成项目级环境规范、启动配置整理、会话与授权可靠性修复、数据校验与前端状态修复，并更新交付包。修复前原有40个JavaScript测试通过；新增场景仍复现了3个明确失败，说明原测试通过不能代表全部流程可靠。修复后48个JavaScript测试和5个Python测试通过。

本机启动冒烟检查确认：从项目外的D:\runner启动server/index.mjs，仍使用D:\runner\lingbo-runner下的配置与数据库，并加载同项目41张来源概括卡。环境检查issues为空；DeepSeek、真实微信与HTTPS接入仍为待配置项。

本轮没有改变VDOT公式、E跑基础周策略或Apple HealthKit权限范围，没有进行真实模型调用或读取手机健康数据。iOS工程与微信真机部分仍需独立验证。

## 2. 环境现状与优化

| 项目 | 实际检查结果 | 本轮处理 |
| --- | --- | --- |
| 系统Node | 24.14.0；npm11.9.0 | 限定Node24验证范围，加入.nvmrc/.node-version与engine-strict |
| 自带Node | 24.19.0 | Windows启动脚本优先使用可用自带Node24，否则选择系统Node24 |
| 默认python命令 | 指向WindowsApps占位启动器 | 不使用该占位路径；新增实际解释器选择工具 |
| 实际Python | 3.12.14 | 优先项目.venv、指定解释器或可用运行时；统一UTF-8输出 |
| Node第三方依赖 | 0 | 无需npm install；保持HTTP、SQLite与加密使用Node内置模块 |
| PDF提取 | pypdf6.10.0可用 | 仅PDF提取的可选依赖记录在requirements-knowledge.txt |
| Git仓库 | 当前目录不是Git仓库 | 没有产生提交；保留旧代码包快照，修正未来Git忽略规则 |
| 运行数据库 | 已存在 | 创建只读一致性SQLite备份，新增迁移只添加开发身份表 |

新增server/config.mjs集中处理.env、环境变量优先级、端口、布尔项、地址与密钥格式。数据库和知识库的相对路径按项目根解析，消除启动工作目录的影响。配置错误在写数据库前尽早说明，报告与诊断只输出“已配置/未配置”，不输出秘密值。

新增doctor、Python测试、打包与备份入口；Windows start.cmd使用可用PowerShell并选择Node24。脚本不修改系统PATH，也不更改全局执行策略。dev.ps1采用UTF-8 BOM以兼容Windows PowerShell5.1；旧Node24.14会显示SQLite实验性提示，但已通过测试，不将提示误记为失败。

## 3. 修复清单

| 编号 | 原问题与触发方式 | 修复结果 | 主要位置 / 验证 |
| --- | --- | --- | --- |
| B01 | 从D:\runner或其他目录直接启动时，数据库与知识库按当前目录解析，可能新建错误位置的库并只显示7张内置卡 | .env与相对路径固定按项目根解析；端口与配置有校验 | server/config.mjs；跨目录测试与实际启动冒烟 |
| B02 | demo访问会话过期后重新登录创建新用户，开发数据/对话看似丢失 | 新增7天滑动有效的随机恢复凭据；服务端只保存哈希，恢复到同一开发用户；访问会话仍为1小时 | 四号迁移、repository、客户端与预览；HTTP隔离/恢复测试 |
| B03 | GET遇到401只能失败；若贸然对所有请求重发可能造成写入或模型重复调用 | 只读GET重新登录后仅重试一次；写入、同步与模型请求不自动重发 | 客户端服务；401读写差异测试 |
| B04 | 导入活动没有RPE时，只修改比赛标记也要求RPE非空 | 单独校验修改字段，保留RPE缺失；不补成伪造强度或负荷 | repository、client、log页；修复前失败、修复后通过 |
| B05 | 只撤回shareTraining，enabled仍为true时，Agent可继续工具/模型步骤并保存含摘要的结果 | 每次模型/工具步骤及保存前复核当前授权；撤回后409终止，不保存晚到结果 | services/agent.mjs；修复前失败、修复后通过 |
| B06 | 回答正文引用存在于候选材料中，但未列入返回citedIds，页面无法展示对应来源 | 正文引用必须同时在候选证据与返回引用列表内，否则明确回退本地检索 | validateReply；修复前失败、修复后通过 |
| B07 | null、数组等非对象JSON可进入登录；未知内部异常被当400并返回内部错误信息 | 请求体限定JSON对象；输入校验400、未知内部异常500且返回通用说明；微信适配器区分输入与服务错误 | app、engine/imports、wechat适配器；HTTP异常测试 |
| B08 | 私有概括卡缺visibility字段时，被旧过滤规则当作可进入公开模式的卡片 | 公开模式只纳入明确public且publicServiceCleared为true的扩展卡；默认未知状态不公开 | project-knowledge适配器；缺标记回归测试 |
| B09 | goal可误接受constructor/__proto__或数组；记录页跨日保留旧日期上限；档案/聊天读取失败可残留旧数据显示 | 限定目标为字符串白名单；更新日期上限；空档案或读取失败清除陈旧显示 | engine、log/profile/agent页；输入测试与前端代码检查，真机验证待完成 |
| B10 | data/忽略模式会匹配小程序源码data目录；交付包可能纳入虚拟环境或其他.env配置 | 运行data与.private使用根锚定；保留miniprogram/data源码；打包排除虚拟环境、缓存与非示例.env文件 | .gitignore、check-project、package_project；交付ZIP检查 |

环境规范与B01/B10属于项目级可靠性改进。B04～B06有明确的“先失败、后通过”记录；其他问题由源代码路径检查与新增行为用例验证。没有将代码阅读等同于微信或iOS真机验证。

## 4. 测试与实际验证

| 检查 | 结果 | 边界 |
| --- | --- | --- |
| 原版本JavaScript基线 | 40/40通过 | 原测试未覆盖本轮新增缺陷 |
| 三项缺陷复现用例 | 修复前0/3通过；修复后3/3通过 | RPE字段耦合、摘要撤权、引用列表一致性 |
| 修复后JavaScript套件 | 48/48通过 | 本机HTTP、环境、隔离、开发身份、聊天与知识库 |
| Python套件 | 5/5通过 | 合成Apple健康XML/ZIP和TCX，没有真实手表样本 |
| 环境诊断 | issues=0 | 有待配置项，不表示手机接入已完成 |
| JSON/JS/页面注册检查 | 通过，共9页 | 不替代WXML编译 |
| 预览内联脚本语法 | 通过 | 本轮没有新增微信真机布局验收 |
| 新转换入口 | Apple健康与TCX各完成1条合成记录转换 | 不依赖默认WindowsApps python启动器 |
| 跨目录启动与HTTP冒烟 | /health返回0.3.1；预览加载41张卡 | 只读取健康检查和合成预览，不读取用户训练数据 |
| 备份与交付包 | SQLite备份完整性通过；ZIP结构与敏感文件排除检查 | .private备份不进入交付包 |

所用版本为系统Node24.14.0与自带Node24.19.0、Python3.12.14。没有为了减少输出隐藏SQLite实验性警告；系统运行时的警告与测试结果分别记录。未开展严格的启动耗时、并发负载或内存性能基准，不宣称百分比性能提升。

Windows PowerShell5.1诊断在受限沙箱中曾被AuthorizationManager拦截；正常权限复测通过。PowerShell7入口也通过；没有为通过检查修改全局执行策略。

## 5. 数据、兼容性与回滚

新增四号迁移demo_identities，不删除已有用户、活动、聊天或Apple连接。删号仍通过外键级联删除相关恢复凭据；撤回运动数据授权保留用户身份，但清除训练、聊天与设备连接。开发恢复凭据只在回环demo模式使用，不能替代公网真实微信身份。

旧0.3.0匿名会话没有恢复凭据。首次切换到新机制时，已经失效或清理的旧会话不能自动证明属于哪个用户；本轮没有猜测关联或合并旧匿名数据。新会话建立恢复凭据后，在7天滑动有效期内可以跨访问会话恢复；生产微信用户仍通过OpenID恢复同一账户。

旧代码快照：.private/baseline/0.3.0-framework.zip。SHA256：

`6BC826BCA0D6EFE279F71A24B7520C8B208E17FCCF2EAC26AEDF90C09EF5104F`

运行数据库备份：.private/backups/runner-20261013-094509.sqlite。使用SQLite只读backup接口并做完整性检查。备份仅在本机，含运行数据，不随源码打包。恢复前停止服务，核对代码/数据库版本与备份，避免覆盖正在运行的数据库；本轮没有自动执行回滚。

已经发送至模型服务的数据无法因后续撤权追回。本轮修复阻止后续步骤和结果保存；没有用真实模型调用测试服务端保留行为。

## 6. 使用与维护命令

在项目根目录运行：

```powershell
npm run doctor
npm start
npm test
npm run test:python
npm run check
npm run backup
npm run package
```

Windows在Node PATH不可靠时可使用：

```powershell
powershell -NoProfile -File scripts/dev.ps1 -Action doctor
powershell -NoProfile -File scripts/dev.ps1 -Action start
powershell -NoProfile -File scripts/dev.ps1 -Action test
powershell -NoProfile -File scripts/dev.ps1 -Action python-test
```

可设置XUNRUN_NODE/XUNRUN_PYTHON为实际解释器路径。Python虚拟环境是可选项，只有重新提取PDF需要pypdf；跑步摘要转换和Python测试使用标准库。配置变化后重启服务；npm run dev观察代码变化，不承诺自动重读.env或知识库文件。

实际文件转换可使用 `node scripts/python-tools.mjs apple-health <文件> --output <目标>` 或 `node scripts/python-tools.mjs tcx <文件> --output <目标>`。打包在目录遍历阶段直接剪掉私有数据、缓存和虚拟环境，避免先扫描再逐文件丢弃。

## 7. 剩余问题与下一阶段

1. DeepSeek密钥、真实微信身份与HTTPS后端当前未配置；没有真实模型质量、延迟和费用评估。
2. iOS伴随端尚未在Xcode编译、签名安装或iPhone执行；后台唤醒和关联心率读取待真机验证，Windows测试不能证明已读取手机数据。
3. 小程序仍需WXML编译与真机权限/弱网验证。前端状态清理已改，完整交互与草稿体验仍需设备验收。
4. 基础训练仍为保守E跑与休息；完整周期、高强度剂量、个体恢复校准与实赛PB误差需独立验证。
5. 知识库来源核对与OCR没有升级为人类专业审校，也没有将私有全文直接公开。
6. 生产负载、异步队列、数据库全盘加密与长期备份清除未验收。本地启动和用例通过仅支持本轮维护结论。

建议下一阶段先做真实微信/HTTPS与iPhone联调，再用少量跑友数据核对导入一致性与专家回答来源，随后扩展训练算法和预测功能。
