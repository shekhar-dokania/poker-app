import Foundation
import Combine

class AuthManager: ObservableObject {
    static let shared = AuthManager()
    
    @Published var isAuthenticated: Bool = false
    @Published var jwtToken: String? = nil
    @Published var username: String = ""
    @Published var avatar: String = "👽"
    
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
            self.username = user["username"] as? String ?? ""
            self.avatar = user["avatar"] as? String ?? "👽"
        }
        self.isAuthenticated = true
        fetchMe()
    }
    
    func logout() {
        KeychainHelper.shared.delete(service: service, account: account)
        self.jwtToken = nil
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
                    self.username = user["username"] as? String ?? self.username
                    self.avatar = user["avatar"] as? String ?? "👽"
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
}
