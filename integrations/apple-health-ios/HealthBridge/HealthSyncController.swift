import Foundation
import HealthKit
import Combine

struct WorkoutChanges {
    let workouts: [HKWorkout]
    let deleted: [String]
    let anchor: HKQueryAnchor?
    let sampleCount: Int
}

@MainActor final class HealthSyncController: ObservableObject {
    static let shared = HealthSyncController()
    @Published var status = "请先在小程序生成配对码"
    @Published var lastSync = "尚未同步"
    @Published var busy = false
    @Published var connected = false
    private let store = HKHealthStore()
    private var observer: HKObserverQuery?
    private var syncAgain = false
    private var syncTask: Task<Void, Never>?
    private var syncID: UUID?
    private var credential: BridgeCredential?
    private var api: BridgeAPI?
    private init() {
        if let data = KeychainStore.load("credential"), let value = try? JSONDecoder().decode(BridgeCredential.self, from: data), let address = UserDefaults.standard.string(forKey: "serverAddress"), let endpoint = try? BridgeAPI(address: address) {
            credential = value; api = endpoint; connected = true; status = "已配对，等待健康数据更新"
        }
    }

    func connect(address: String, code: String) async {
        guard !busy else { return }; busy = true; defer { busy = false }
        do {
            guard code.count == 8 && code.allSatisfy(\.isNumber) else { throw BridgeError.message("配对码需为8位数字") }
            if let observer { store.stop(observer); self.observer = nil }
            UserDefaults.standard.set(false, forKey: "autoSyncEnabled")
            let endpoint = try BridgeAPI(address: address), value = try await endpoint.exchange(code: code)
            try KeychainStore.save(JSONEncoder().encode(value), account: "credential")
            KeychainStore.remove("anchor")
            UserDefaults.standard.set(address, forKey: "serverAddress")
            UserDefaults.standard.set(Date().addingTimeInterval(-90 * 86400), forKey: "initialCutoff")
            credential = value; api = endpoint; connected = true; status = "配对完成，请申请健康读取权限"
        } catch { status = error.localizedDescription }
    }

    func requestAccess() async {
        guard connected else { status = "先完成配对"; return }
        guard HKHealthStore.isHealthDataAvailable() else { status = "此设备无法使用 HealthKit"; return }
        do {
            let read: Set<HKObjectType> = [HKObjectType.workoutType(), HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning)!, HKObjectType.quantityType(forIdentifier: .heartRate)!]
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                store.requestAuthorization(toShare: [], read: read) { success, error in
                    if let error { continuation.resume(throwing: error) }
                    else if success { continuation.resume() }
                    else { continuation.resume(throwing: BridgeError.message("健康授权请求未完成")) }
                }
            }
            // success 表示授权请求完成，并不能证明用户授予了所有读取权限。
            UserDefaults.standard.set(true, forKey: "autoSyncEnabled")
            registerObserversAtLaunch()
            try await store.enableBackgroundDelivery(for: HKObjectType.workoutType(), frequency: .immediate)
            await synchronize()
        } catch { status = error.localizedDescription }
    }

    func registerObserversAtLaunch() {
        guard connected && UserDefaults.standard.bool(forKey: "autoSyncEnabled") && observer == nil && HKHealthStore.isHealthDataAvailable() else { return }
        let query = HKObserverQuery(sampleType: HKObjectType.workoutType(), predicate: nil) { [weak self] _, completion, error in
            Task { @MainActor in
                defer { completion() }
                guard let self else { return }
                if let error { self.status = error.localizedDescription; return }
                await self.synchronize()
            }
        }
        observer = query; store.execute(query)
    }

    private func loadAnchor() -> HKQueryAnchor? {
        guard let data = KeychainStore.load("anchor") else { return nil }
        return try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: data)
    }
    private func changes(anchor: HKQueryAnchor?) async throws -> WorkoutChanges {
        let cutoff = UserDefaults.standard.object(forKey: "initialCutoff") as? Date ?? Date().addingTimeInterval(-90 * 86400)
        let predicate = NSCompoundPredicate(andPredicateWithSubpredicates: [HKQuery.predicateForWorkouts(with: .running), HKQuery.predicateForSamples(withStart: cutoff, end: nil)])
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKAnchoredObjectQuery(type: HKObjectType.workoutType(), predicate: predicate, anchor: anchor, limit: 100) { _, samples, deleted, newAnchor, error in
                if let error { continuation.resume(throwing: error); return }
                continuation.resume(returning: WorkoutChanges(workouts: (samples as? [HKWorkout]) ?? [], deleted: (deleted ?? []).map { $0.uuid.uuidString.lowercased() }, anchor: newAnchor, sampleCount: samples?.count ?? 0))
            }
            store.execute(query)
        }
    }
    private func averageHeartRate(_ workout: HKWorkout) async -> Double? {
        guard let type = HKQuantityType.quantityType(forIdentifier: .heartRate) else { return nil }
        return await withCheckedContinuation { continuation in
            let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: HKQuery.predicateForObjects(from: workout), options: .discreteAverage) { _, statistics, _ in
                let value = statistics?.averageQuantity()?.doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
                continuation.resume(returning: value.flatMap { $0.isFinite && (30...240).contains($0) ? $0.rounded() : nil })
            }
            store.execute(query)
        }
    }
    private func runningSummary(_ workout: HKWorkout) async -> RunningSummary? {
        let distanceType = HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning)!
        guard let distance = (workout.statistics(for: distanceType)?.sumQuantity() ?? workout.totalDistance)?.doubleValue(for: .meter()) else { return nil }
        let km = distance / 1000, duration = workout.duration, pace = duration / km
        guard km.isFinite, duration.isFinite, (0.01...500).contains(km), (1...172800).contains(duration), (90...1800).contains(pace) else { return nil }
        let formatter = DateFormatter(); formatter.dateFormat = "yyyy-MM-dd"; formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.timeZone = TimeZone(secondsFromGMT: 8 * 3600)
        return RunningSummary(externalId: workout.uuid.uuidString.lowercased(), date: formatter.string(from: workout.startDate), distanceKm: km, durationSec: duration, avgHr: await averageHeartRate(workout))
    }

    func synchronize() async {
        guard UserDefaults.standard.bool(forKey: "autoSyncEnabled") else { status = "先申请健康读取权限并启用同步"; return }
        if let task = syncTask { syncAgain = true; await task.value; return }
        let generation = UUID()
        syncID = generation
        let task = Task { @MainActor in await self.performSync() }
        syncTask = task
        await task.value
        guard syncID == generation else { return }
        syncTask = nil
        syncID = nil
        if syncAgain { await synchronize() }
    }
    private func performSync() async {
        guard let credential, let api else { status = "尚未配对"; return }
        guard credential.expiresAt > Date().timeIntervalSince1970 * 1000 else { status = "连接已过期，请重新配对"; return }
        busy = true; defer { busy = false }
        do {
            var total = 0, skipped = 0
            repeat {
                syncAgain = false
                let batch = try await changes(anchor: loadAnchor())
                try Task.checkCancellation()
                var summaries: [RunningSummary] = []
                for workout in batch.workouts {
                    if let value = await runningSummary(workout) { summaries.append(value) } else { skipped += 1 }
                }
                try Task.checkCancellation()
                let receipt = try await api.sync(SyncPayload(activities: summaries, deletedExternalIds: batch.deleted), token: credential.token)
                try Task.checkCancellation()
                // 收到服务端成功回执后才推进锚点。网络失败时下次可重发，服务端按UUID去重。
                if let anchor = batch.anchor { try KeychainStore.save(NSKeyedArchiver.archivedData(withRootObject: anchor, requiringSecureCoding: true), account: "anchor") }
                total += receipt.inserted + receipt.updated; lastSync = receipt.lastSyncedAt
                if batch.sampleCount + batch.deleted.count >= 100 { syncAgain = true }
            } while syncAgain
            status = total > 0 ? "本轮同步 \(total) 条跑步，\(skipped) 条摘要缺失或超出当前范围" : "本轮没有新跑步；若预期有数据，请在健康App检查读取权限"
        } catch BridgeError.connectionRevoked {
            stopOnThisPhone(); status = "服务端连接已过期或撤销，已停止自动同步；请重新配对"
        } catch { if !Task.isCancelled { status = "未完成同步，稍后可重试：\(error.localizedDescription)" } }
    }

    func stopOnThisPhone() {
        syncTask?.cancel(); syncTask = nil; syncID = nil; syncAgain = false
        if let observer { store.stop(observer); self.observer = nil }
        store.disableBackgroundDelivery(for: HKObjectType.workoutType()) { _, _ in }
        UserDefaults.standard.set(false, forKey: "autoSyncEnabled")
        KeychainStore.remove("credential"); KeychainStore.remove("anchor")
        credential = nil; api = nil; connected = false; status = "已停止本机同步；可在小程序撤销服务端连接，在健康App撤回读取权限"
    }
}
