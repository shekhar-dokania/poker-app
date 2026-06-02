import SwiftUI

struct ProfileView: View {
    @ObservedObject private var authManager = AuthManager.shared
    
    let avatars = [
        "👽", "🐶", "🐱", "🦊", "🐻", "🐼", "🐯", "🦁", "🐸", "🐵",
        "🦄", "🐙", "👻", "🤖", "🤡", "🤠", "🎃", "💩", "😎", "🤓"
    ]
    
    let columns = [
        GridItem(.adaptive(minimum: 60))
    ]
    
    var body: some View {
        NavigationView {
            ZStack {
                Color(red: 0.1, green: 0.1, blue: 0.1).edgesIgnoringSafeArea(.all)
                
                ScrollView {
                    VStack(spacing: 24) {
                        // Current Profile Section
                        VStack(spacing: 12) {
                            Text(authManager.avatar)
                                .font(.system(size: 80))
                                .padding()
                                .background(Circle().fill(Color.white.opacity(0.1)))
                                .shadow(radius: 10)
                            
                            Text(authManager.username)
                                .font(.title)
                                .bold()
                                .foregroundColor(.white)
                        }
                        .padding(.top, 40)
                        
                        Divider().background(Color.white.opacity(0.3)).padding(.horizontal)
                        
                        // Avatar Selection Section
                        VStack(alignment: .leading, spacing: 16) {
                            Text("Choose your Avatar")
                                .font(.headline)
                                .foregroundColor(.gray)
                                .padding(.horizontal)
                            
                            LazyVGrid(columns: columns, spacing: 20) {
                                ForEach(avatars, id: \.self) { avatar in
                                    Button(action: {
                                        authManager.updateAvatar(newAvatar: avatar)
                                    }) {
                                        Text(avatar)
                                            .font(.system(size: 40))
                                            .padding(10)
                                            .background(
                                                Circle()
                                                    .fill(authManager.avatar == avatar ? Color.blue.opacity(0.3) : Color.clear)
                                            )
                                            .overlay(
                                                Circle()
                                                    .stroke(authManager.avatar == avatar ? Color.blue : Color.clear, lineWidth: 2)
                                            )
                                    }
                                }
                            }
                            .padding(.horizontal)
                        }
                        
                        Spacer(minLength: 40)
                        
                        Button(action: {
                            authManager.logout()
                        }) {
                            Text("Logout")
                                .bold()
                                .frame(maxWidth: .infinity)
                                .padding()
                                .background(Color.red.opacity(0.8))
                                .foregroundColor(.white)
                                .cornerRadius(10)
                        }
                        .padding(.horizontal)
                    }
                }
            }
            .navigationTitle("Profile")
            .navigationBarTitleDisplayMode(.inline)
        }
        .onAppear {
            authManager.fetchMe()
        }
    }
}
