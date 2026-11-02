import SwiftUI
import UIKit

@MainActor final class BridgeAppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        // HealthKit后台通知到达前，在启动阶段注册观察查询。
        HealthSyncController.shared.registerObserversAtLaunch()
        return true
    }
}
@main @MainActor struct HealthBridgeApp: App {
    @UIApplicationDelegateAdaptor(BridgeAppDelegate.self) var delegate
    var body: some Scene { WindowGroup { ContentView() } }
}
