# 循跑健康桥接 iOS 工程

直接用 Mac/Xcode 打开 `XunrunHealthBridge.xcodeproj`，选择自己的签名Team、唯一Bundle ID和iPhone设备，再构建。无第三方运行库；`generate_project.py`可在Python3中重建项目，`project.yml`仅作为可选XcodeGen配置。

要求iOS17+，权限只有读取跑步、距离与心率，带HealthKit Background Delivery entitlement。首次申请由本人确认；后台事件由iOS调度。Observer在AppDelegate启动阶段注册，Anchored查询分批增量读取，回执成功后才推进Keychain锚点。

后端需真实微信身份与HTTPS服务。配对码在小程序“我的 → Apple健康连接”生成，一次使用且5分钟有效。App填入服务地址和配对码后申请健康权限。首次读取最近90天，缺失距离或当前校验范围以外的记录会计入跳过数量，不能当成已导入。

在Mac可先做不签名编译检查：

```bash
xcodebuild -project XunrunHealthBridge.xcodeproj -scheme HealthBridge -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build
```

实际后台投递必须在iPhone验证，模拟器不能替代。当前代码只在Windows核对plist/entitlements/scheme结构，未声称已经通过Swift编译或读取过誉天的手机数据。

完整设置与验收见 `../../docs/APPLE-HEALTH-AND-AGENT.md`。
