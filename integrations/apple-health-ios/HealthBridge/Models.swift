import Foundation

struct BridgeCredential: Codable {
    let token: String
    let expiresAt: Double
    let connectionId: String
    let scope: String
}

struct RunningSummary: Encodable {
    let externalId: String
    let sport = "running"
    let date: String
    let distanceKm: Double
    let durationSec: Double
    let avgHr: Double?
}

struct SyncPayload: Encodable {
    let schemaVersion = 1
    let activities: [RunningSummary]
    let deletedExternalIds: [String]
}

struct SyncReceipt: Codable {
    let inserted: Int
    let updated: Int
    let deleted: Int
    let lastSyncedAt: String
}

enum BridgeError: LocalizedError {
    case message(String)
    case connectionRevoked
    var errorDescription: String? {
        switch self {
        case let .message(value): return value
        case .connectionRevoked: return "连接已过期或撤销，请重新配对"
        }
    }
}
