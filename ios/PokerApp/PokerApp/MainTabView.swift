import SwiftUI

struct MainTabView: View {
    @ObservedObject private var socketManager = PokerSocketManager.shared
    
    var body: some View {
        if socketManager.currentRoom != nil {
            TableView()
        } else {
            TabView {
                LobbyView()
                    .tabItem {
                        Label("Global Lobby", systemImage: "globe")
                    }
                
                ClubsView()
                    .tabItem {
                        Label("My Clubs", systemImage: "person.3.fill")
                    }
                
                ProfileView()
                    .tabItem {
                        Label("Profile", systemImage: "person.crop.circle")
                    }
            }
        }
    }
}
