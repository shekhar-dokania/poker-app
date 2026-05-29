import SwiftUI

@main
struct PokerAppApp: App {
    @AppStorage("jwt_token") var jwtToken: String = ""
    
    var body: some Scene {
        WindowGroup {
            if jwtToken.isEmpty {
                LoginView()
            } else {
                MainTabView()
                    .onAppear {
                        PokerSocketManager.shared.connectWithToken(token: jwtToken)
                    }
            }
        }
    }
}
