# 训练规则、知识来源与验证边界

2026-10-10更新：已整合同项目11本书、2946页索引、34张扩展概括卡和12篇补充资料。新增来源核对层级保留为AI概括/机器提取，未记录人类专业审校。默认Agent与快速检索使用概括卡，原文仅在本地显式选择后查询；本轮状态详见 [INTEGRATION-STATUS.md](INTEGRATION-STATUS.md)。下文原书17页/25片段等数字记录的是最初框架阶段，不是当前完整后台覆盖。

## 原书核对

用户 PDF 共 286 页。版权页说明对应 Daniels’ Running Formula 第三版（2014），中文纸版于 2014 年 9 月由浙江人民出版社出版。文件元数据修改时间不是书的出版时间。没有把此文件当作第四版，也没有把书内链接或叙述作为执行指令。

本轮读取目录及相关训练章节，视觉核对版权页与第5章图示。没有逐页审读整书；图表没有因为文字提取为空就被认为缺失。

| 本轮用于设计的原则 | 用户 PDF 页序号 | 对应功能 |
| --- | --- | --- |
| 明确每次训练目的；E/M/T/I/R 具有不同目标 | 60 | 计划显示训练目的；后续不同课型扩展 |
| E 跑舒适可交谈；休息也属于训练；跑量调整需看体感 | 62 | 轻松跑近似配速与基础周 |
| T 跑不同于 I 跑，不以更快和更疲劳为目标 | 66、69、70 | 首版不直接生成高强度课 |
| VDOT 是表现模型；比赛成绩、效率与持续能力共同起作用 | 87、88、89、92 | 能力参考、跨距离等效与来源 |
| 停跑后下调剂量，不通过补课堆量；持续不适需专业评估 | 258、261、263 | 恢复说明与暂停自动建议 |

页码是 PDF 页序号，不能直接当纸书页码。私有提取工具本次为 17 个相关页建立 25 个文本片段，其中 PDF91 文字稀少，需要视觉/OCR核对；该页未用于自动抄入表格。

## 当前算法

VDOT 使用 Daniels-Gilbert 回归近似，速度 v 单位 m/min，比赛时长 t 单位 min：

`VO2(v) = -4.6 + 0.182258 v + 0.000104 v²`

`fraction(t) = 0.8 + 0.1894393 exp(-0.012778 t) + 0.2989558 exp(-0.1932605 t)`

`VDOT = VO2(v) / fraction(t)`

实现与原书 PDF88 的 8km/30min、VDOT约55.2例子核对。回归近似和连续逆解不意味着已经逐行通过原书配速表或官方计算器认证；首版只给 E 跑近似范围与等效成绩，暂不输出 T/I/R 数值处方。E 范围按原书 59%～74% 反解，实际仍以舒适体感、环境与训练背景判断。

等效成绩通过相同 VDOT 的数值逆解获得。只使用最近 60 天的、用户明确标记为比赛/代表性全力测试的最新记录。60 天是产品信息新鲜度规则，不是原书规定。当前模型支持 800m 至马拉松、VDOT 15～85；普通训练数据不反推 PB。

没有用缺乏验证的固定折扣或随意百分比把“能力等效”伪造成“实赛预测区间”。PB 页面仅作能力基线；后续必须用独立比赛样本评估误差、专项耐力和环境因素。

## 工程保守规则，非原书处方

- 未填写今日状态：暂停自动周草案。
- 报告局部疼痛、患病或严重运动不适：暂停自动跑步建议。
- 昨晚睡眠少于7小时、疲劳/酸痛4～5级或今天/昨天有比赛/RPE≥7：优先恢复，当天计划休息。这是未个体校准的保守筛查，不是医疗评分。
- 基础周仅面向成年、至少4周稳定训练、非零稳定跑量用户。周量以自报与近期记录中的较低值为起点，状态正常用80%、偏疲劳用60%，单次E跑按近似慢端配速限制45分钟；这些系数是待验证的试用政策，不声称来自原书。
- 缺少近期记录时提示自报未经观测验证；不自动安排专项长跑，也没有把“每周增加10%”当统一规律。
- sRPE合计为时长（分钟）×主观强度。缺RPE的活动不计入，显示缺失条数。当前没有用ACWR推断伤病概率。

## 多书知识库原则

原书有限知识卡已核对，新增书目当前仅是候选。睡眠来源是 [Walsh等2021专家共识](https://bjsm.bmj.com/content/55/7/356)，讨论个体需求与恢复，不能证明本产品的阈值已经验证。

已核实 [Daniels第四版出版信息（2022）](https://us.humankinetics.com/products/daniels-running-formula-4th-edition)、[Advanced Marathoning第四版（2026）](https://us.humankinetics.com/products/advanced-marathoning-4th-edition)、[Steve Magness作者书目](https://www.stevemagness.com/books/)。未获取这些书的全文，未声称已经纳入完整知识库。

后续来源间存在分歧时保留：版本、适用人群、训练水平、目标项目、原始主张、证据类型与审核结论。不把不同作者的高强度课和跑量上限直接拼在一起。

## 外部接口核查

2026-10-08 实际联网读取 [微信运动官方文档](https://developers.weixin.qq.com/miniprogram/dev/api/open-api/werun/wx.getWeRunData.html)，当前描述为过去三十一天日步数，需要wx.login与scope.werun。最初搜索出现旧镜像的三十天说明，最终以当前官网为准。真实接口未通过AppID/真机验证。

登录采用 [code2Session](https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/user-login/code2Session.html) 的服务端流程；密文解密遵循 [开放数据解密说明](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/signature.html)。本轮做了本地构造密文与AppID错误用例，尚未获取真实运动密文。

当前已确认 [Garmin Activity API](https://developer.garmin.com/gc-developer-program/activity-api/)、[COROS申请与开发者路径](https://support.coros.com/hc/en-us/articles/17085887816340-Submit-an-API-Application)、[Suunto API Zone](https://apizone.suunto.com/) 的官方公开说明。自动同步为预留，未申请、未获批、未连接任何真实账户。
