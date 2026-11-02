import SwiftUI

@MainActor struct ContentView: View {
    @StateObject private var controller = HealthSyncController.shared
    @State private var address = UserDefaults.standard.string(forKey: "serverAddress") ?? ""
    @State private var code = ""
    var body: some View {
        NavigationStack {
            Form {
                Section("连接循跑小程序") {
                    Text("在小程序“我的 → Apple健康连接”生成配对码。仅填写你信任的HTTPS服务地址。")
                    TextField("https://你的服务地址", text: $address).textInputAutocapitalization(.never).autocorrectionDisabled()
                    TextField("8位配对码", text: $code).keyboardType(.numberPad)
                    Button("配对这台iPhone") { Task { await controller.connect(address: address, code: code) } }.disabled(controller.busy)
                }
                Section("申请与同步") {
                    Text("只读取跑步记录、距离和可选平均心率，不读取GPS、诊疗、体重或通讯录。首次授权由你确认。")
                    Button("申请Apple健康读取权限并启用同步") { Task { await controller.requestAccess() } }.disabled(!controller.connected || controller.busy)
                    Button("现在同步") { Task { await controller.synchronize() } }.disabled(!controller.connected || controller.busy)
                    Text(controller.status)
                    Text("最近回执：\(controller.lastSync)").font(.caption)
                    Text("后台更新由iOS调度，不保证实时；退出或系统限制后，可以打开此App手动同步。").font(.caption)
                }
                Section("停止与隐私") {
                    Button("停止本机同步", role: .destructive) { controller.stopOnThisPhone() }
                    Text("还可在小程序撤销连接，并在iPhone健康App撤回读取权限。停止连接不会自动删除已同步的跑步记录。")
                }
            }.navigationTitle("循跑健康桥接")
        }
    }
}
