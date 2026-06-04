import Foundation
import Combine

class AuthManager: ObservableObject {
    static let shared = AuthManager()
    
    @Published var isAuthenticated: Bool = false
    @Published var jwtToken: String? = nil
    @Published var userId: String? = nil
    @Published var username: String = ""
    @Published var avatar: String = "👽"
    @Published var coins: Int = 0
    @Published var lastFreeClaim: String? = nil
    
    var canClaimDailyCoins: Bool {
        guard let lastClaimStr = lastFreeClaim, !lastClaimStr.isEmpty else { return true }
        
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSSZ"
        var date = formatter.date(from: lastClaimStr)
        
        if date == nil {
            formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ssZ"
            date = formatter.date(from: lastClaimStr)
        }
        
        guard let lastClaimDate = date else {
            print("Failed to parse lastFreeClaim date string: \(lastClaimStr)")
            return false // Safe fallback: if they have a claim string, don't let them claim
        }
        
        let elapsed = Date().timeIntervalSince(lastClaimDate)
        return elapsed >= 86400
    }
    
    private let service = "com.pokerapp.auth"
    private let account = "jwt_token"
    
    private init() {
        checkAuthStatus()
    }
    
    func checkAuthStatus() {
        if let token = KeychainHelper.shared.readString(service: service, account: account) {
            self.jwtToken = token
            self.isAuthenticated = true
            fetchMe()
        } else {
            self.isAuthenticated = false
        }
    }
    
    func login(token: String, user: [String: Any]? = nil) {
        KeychainHelper.shared.save(token, service: service, account: account)
        self.jwtToken = token
        if let user = user {
            self.userId = user["id"] as? String
            self.username = user["username"] as? String ?? ""
            self.avatar = user["avatar"] as? String ?? "👽"
        }
        self.isAuthenticated = true
        fetchMe()
    }
    
    func logout() {
        KeychainHelper.shared.delete(service: service, account: account)
        self.jwtToken = nil
        self.userId = nil
        self.isAuthenticated = false
        self.username = ""
        self.avatar = "👽"
    }
    
    func fetchMe() {
        guard let token = jwtToken, let url = URL(string: "\(AppConfig.serverURL)/auth/me") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            if let data = data, let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let user = json["user"] as? [String: Any] {
                DispatchQueue.main.async {
                    self.userId = user["id"] as? String ?? self.userId
                    self.username = user["username"] as? String ?? self.username
                    self.avatar = user["avatar"] as? String ?? "👽"
                    self.coins = user["coins"] as? Int ?? self.coins
                    self.lastFreeClaim = user["lastFreeClaim"] as? String
                }
            }
        }.resume()
    }
    
    func updateAvatar(newAvatar: String) {
        guard let token = jwtToken, let url = URL(string: "\(AppConfig.serverURL)/auth/avatar") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: Any] = ["avatar": newAvatar]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            if let data = data, let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let success = json["success"] as? Bool, success {
                DispatchQueue.main.async {
                    self.avatar = newAvatar
                }
            }
        }.resume()
    }
    
    func claimFreeCoins(completion: @escaping (Bool, String?) -> Void) {
        guard let token = jwtToken, let url = URL(string: "\(AppConfig.serverURL)/auth/claim-free-coins") else {
            completion(false, "Invalid URL or Token")
            return
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                DispatchQueue.main.async { completion(false, error.localizedDescription) }
                return
            }
            if let data = data, let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                DispatchQueue.main.async {
                    if let success = json["success"] as? Bool, success {
                        self.coins = json["coins"] as? Int ?? self.coins
                        self.lastFreeClaim = json["lastFreeClaim"] as? String
                        completion(true, nil)
                    } else {
                        completion(false, json["error"] as? String ?? "Failed to claim coins")
                    }
                }
            }
        }.resume()
    }
    
    func buyMockCoins(completion: @escaping (Bool, String?) -> Void) {
        guard let token = jwtToken, let url = URL(string: "\(AppConfig.serverURL)/auth/buy-coins-mock") else {
            completion(false, "Invalid URL or Token")
            return
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                DispatchQueue.main.async { completion(false, error.localizedDescription) }
                return
            }
            if let data = data, let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                DispatchQueue.main.async {
                    if let success = json["success"] as? Bool, success {
                        self.coins = json["coins"] as? Int ?? self.coins
                        completion(true, nil)
                    } else {
                        completion(false, json["error"] as? String ?? "Failed to buy coins")
                    }
                }
            }
        }.resume()
    }

    func updateUsername(newUsername: String, completion: @escaping (Bool, String?) -> Void) {
        guard let token = jwtToken, let url = URL(string: "\(AppConfig.serverURL)/auth/username") else {
            completion(false, "Invalid URL or Token")
            return
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: Any] = ["username": newUsername]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                DispatchQueue.main.async { completion(false, error.localizedDescription) }
                return
            }
            if let data = data, let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                if let success = json["success"] as? Bool, success {
                    DispatchQueue.main.async {
                        self.username = newUsername
                        UserDefaults.standard.set(newUsername, forKey: "username")
                        completion(true, nil)
                    }
                } else {
                    let errMsg = json["error"] as? String ?? "Unknown error"
                    DispatchQueue.main.async { completion(false, errMsg) }
                }
            } else {
                DispatchQueue.main.async { completion(false, "Invalid response") }
            }
        }.resume()
    }
}
