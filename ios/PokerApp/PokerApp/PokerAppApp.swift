import SwiftUI

@main
struct PokerAppApp: App {
    @StateObject private var authManager = AuthManager.shared
    @StateObject private var socketManager = PokerSocketManager.shared
    
    var body: some Scene {
        WindowGroup {
            ZStack {
                if !authManager.isAuthenticated {
                    LoginView()
                } else {
                    MainTabView()
                        .onAppear {
                            if let token = authManager.jwtToken {
                                socketManager.connectWithToken(token: token)
                            }
                        }
                }
            }
            .overlay(
                Group {
                    if authManager.isAuthenticated && !socketManager.isConnected {
                        SplashOverlayView()
                            .transition(.opacity)
                            .zIndex(1)
                    }
                }
            )
            .animation(.easeInOut(duration: 0.4), value: socketManager.isConnected)
            .preferredColorScheme(.dark)
        }
    }
}
