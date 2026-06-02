import Foundation
import Combine

class AuthManager: ObservableObject {
    static let shared = AuthManager()
    
    @Published var isAuthenticated: Bool = false
    @Published var jwtToken: String? = nil
    
    private let service = "com.pokerapp.auth"
    private let account = "jwt_token"
    
    private init() {
        checkAuthStatus()
    }
    
    func checkAuthStatus() {
        if let token = KeychainHelper.shared.readString(service: service, account: account) {
            self.jwtToken = token
            self.isAuthenticated = true
        } else {
            self.isAuthenticated = false
        }
    }
    
    func login(token: String) {
        KeychainHelper.shared.save(token, service: service, account: account)
        self.jwtToken = token
        self.isAuthenticated = true
    }
    
    func logout() {
        KeychainHelper.shared.delete(service: service, account: account)
        self.jwtToken = nil
        self.isAuthenticated = false
    }
}
