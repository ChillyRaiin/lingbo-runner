# API v1

0.3.1更新：demo登录可提交可选resumeToken恢复同一开发身份；其7天有效期在使用时延长，访问会话仍为1小时。恢复凭据仅保存哈希，删号后失效。所有JSON请求体必须为对象；输入错误400，未知内部异常500且不返回内部明细。完整维护记录见DEVELOPMENT-REPORT-2026-10-13.md。

后端默认 http://127.0.0.1:8787。请求体为 application/json，最大 512KB；授权头为 `Authorization: Bearer <token>`。会话有效期一小时；401 后重新登录。每 IP 每分钟最多 120 请求，生产限流后续应由网关和用户配额共同实现。

| 方法 | 路径 | 行为 |
| --- | --- | --- |
| GET | /health | 健康与认证模式 |
| POST | /v1/auth/demo | 本机新建身份，或用resumeToken续接同一开发身份；无真实微信身份 |
| POST | /v1/auth/wechat | `{code}` 换服务端会话；仅 wechat 模式 |
| GET | /v1/me | 授权状态 |
| POST | /v1/consent | `{granted:true/false}`；false 清除运动数据 |
| GET | /v1/state | 获取本人完整状态；需运动数据授权 |
| GET | /v1/dashboard | 聚合状态、负荷、能力与基础周草案 |
| PUT | /v1/profile | `{weeklyKm,daysPerWeek,weeksConsistent,isAdult,goal}` |
| POST | /v1/activities | `{date,distanceKm,durationSec,rpe,isRace,avgHr?}` |
| POST | /v1/activities/import | 标准 ImportBatch v1，最多 100 条；返回 imported/duplicates |
| PATCH | /v1/activities/:id | 只更新本人记录的 rpe/isRace |
| DELETE | /v1/activities/:id | 删除本人单次记录 |
| POST | /v1/checkins | `{date,sleepHours,fatigue,soreness,pain,illness,redFlags}` |
| GET | /v1/providers | 设备接入能力与真实进度 |
| GET | /v1/apple-health/status | 本人Apple健康连接、最近回执与配置缺口 |
| POST | /v1/apple-health/pairing | 空对象；生成本人5分钟、一次性配对码 |
| POST | /v1/apple-health/exchange | `{code}`；iOS端换取限定跑步写入的90天凭据 |
| POST | /v1/apple-health/sync | 使用桥接凭据提交 `{schemaVersion:1,activities,deletedExternalIds}` |
| DELETE | /v1/apple-health/connection | `{deleteImported:false}`；撤销连接，可明确选择清除已同步记录 |
| POST | /v1/providers/werun/sync | `{encryptedData,iv}`；AppID 校验后保存步数 |
| GET | /v1/knowledge | 已核对知识卡与书目 |
| POST | /v1/coach/explain | `{query}`，最多 300 字符；当前为知识卡检索 |
| GET | /v1/agent/status | 模型配置、知识库覆盖、模型与数据授权 |
| GET | /v1/agent/history | 最近40条本人对话 |
| DELETE | /v1/agent/history | 清除本人对话；回答进行中返回409 |
| POST | /v1/agent/consent | `{enabled,shareTraining}`；模型和训练摘要授权 |
| POST | /v1/agent/chat | `{message,useRemoteModel,useTrainingContext,includeOriginal?}`；最多1500字符 |
| GET | /v1/export | 导出本人数据，不含平台身份、密钥或会话 |
| DELETE | /v1/account | 删号；级联删除活动、档案、状态、步数和会话 |

未经授权仍可查看知识与设备能力。未知用户不可访问本人数据；所有运动数据读写使用服务端会话 user_id，不接受客户端传入他人的用户 ID。

错误形态：`{"error":"可读说明"}`。典型状态码：400 输入无效、401 未登录、403 未授权、404 不存在/不是本人的记录、409 未配置的接入、413 体积超限、415 媒体类型错误、429 请求过多。

设备文件结构示例见 examples/running-import.json。实际导入 source 文本由系统生成，不能由文件声称“官方已验证”。字段单位需在适配器转换：km、sec、bpm；日期是运动开始日在当前试用时区 UTC+8 的日期。

Apple同步凭据无法访问普通账户接口，普通微信会话也不能冒充HealthKit桥接凭据。HealthKit UUID绑定当前连接所属用户；仅接受running，一批最多100条。相同UUID更新保留用户的RPE/比赛标记，删除事件仅影响`apple-health-sync`来源记录。配对交换入口另限每IP10次/10分钟。

Agent历史由后端按用户读取，客户端不能上传系统消息、工具指令或指定其他用户。默认只检索概括卡；`includeOriginal=true`仅允许本地模式。原书本地查询轮次不会自动成为后续远程模型上下文。原文提取与专业人类审校状态分别保留。
