import Foundation

struct BridgeAPI {
    let baseURL: URL
    init(address: String) throws {
        guard let value = URL(string: address.trimmingCharacters(in: .whitespacesAndNewlines)), value.scheme == "https", value.host != nil, value.user == nil, value.password == nil, value.query == nil, value.fragment == nil else { throw BridgeError.message("请填写你信任的 HTTPS 后端地址") }
        baseURL = value
    }
    private func post<Body: Encodable, Reply: Decodable>(_ path: String, body: Body, token: String? = nil) async throws -> Reply {
        let url = path.split(separator: "/").reduce(baseURL) { $0.appendingPathComponent(String($1)) }
        var request = URLRequest(url: url); request.httpMethod = "POST"; request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw BridgeError.message("服务响应无效") }
        guard (200..<300).contains(http.statusCode) else {
            if http.statusCode == 401 { throw BridgeError.connectionRevoked }
            if http.statusCode == 429 { throw BridgeError.message("请求过于频繁，请稍后重试") }
            throw BridgeError.message("服务暂未接受同步（\(http.statusCode)），记录尚未标为已同步")
        }
        return try JSONDecoder().decode(Reply.self, from: data)
    }
    func exchange(code: String) async throws -> BridgeCredential { struct Request: Codable { let code: String }; return try await post("v1/apple-health/exchange", body: Request(code: code)) }
    func sync(_ value: SyncPayload, token: String) async throws -> SyncReceipt { try await post("v1/apple-health/sync", body: value, token: token) }
}
