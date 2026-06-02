import SwiftUI

@main
struct PokerAppApp: App {
    @StateObject private var authManager = AuthManager.shared
    
    var body: some Scene {
        WindowGroup {
            if !authManager.isAuthenticated {
                LoginView()
            } else {
                MainTabView()
                    .onAppear {
                        if let token = authManager.jwtToken {
                            PokerSocketManager.shared.connectWithToken(token: token)
                        }
                    }
            }
        }
    }
}
