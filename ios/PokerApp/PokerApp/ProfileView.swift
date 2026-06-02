import SwiftUI

struct ProfileView: View {
    @ObservedObject private var authManager = AuthManager.shared
    
    @State private var isEditingUsername = false
    @State private var editedUsername = ""
    @State private var errorMessage = ""
    
    let avatars = [
        "poker_shark", "poker_cowboy", "poker_hoodie", "poker_king",
        "poker_tuxedo", "poker_steampunk", "poker_mobster", "poker_flapper",
        "poker_alien", "poker_wizard", "poker_pirate", "poker_ninja",
        "poker_robot", "poker_vampire", "poker_astronaut", "poker_knight",
        "poker_dog"
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
                            if UIImage(named: authManager.avatar) != nil {
                                Image(authManager.avatar)
                                    .resizable()
                                    .scaledToFill()
                                    .frame(width: 80, height: 80)
                                    .clipShape(Circle())
                                    .shadow(radius: 10)
                            } else {
                                Text(authManager.avatar)
                                    .font(.system(size: 80))
                                    .padding()
                                    .background(Circle().fill(Color.white.opacity(0.1)))
                                    .shadow(radius: 10)
                            }
                            
                            if isEditingUsername {
                                HStack {
                                    TextField("Username", text: $editedUsername)
                                        .textFieldStyle(RoundedBorderTextFieldStyle())
                                        .foregroundColor(.black)
                                        .frame(width: 180)
                                    
                                    Button("Save") {
                                        if editedUsername.trimmingCharacters(in: .whitespaces).isEmpty {
                                            errorMessage = "Cannot be empty"
                                            return
                                        }
                                        authManager.updateUsername(newUsername: editedUsername) { success, error in
                                            if success {
                                                isEditingUsername = false
                                                errorMessage = ""
                                            } else {
                                                errorMessage = error ?? "Error saving username"
                                            }
                                        }
                                    }
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 6)
                                    .background(Color.blue)
                                    .foregroundColor(.white)
                                    .cornerRadius(6)
                                    
                                    Button("Cancel") {
                                        isEditingUsername = false
                                        errorMessage = ""
                                    }
                                    .foregroundColor(.gray)
                                }
                                if !errorMessage.isEmpty {
                                    Text(errorMessage)
                                        .foregroundColor(.red)
                                        .font(.caption)
                                }
                            } else {
                                HStack {
                                    Text(authManager.username)
                                        .font(.title)
                                        .bold()
                                        .foregroundColor(.white)
                                        
                                    Button(action: {
                                        editedUsername = authManager.username
                                        isEditingUsername = true
                                    }) {
                                        Image(systemName: "pencil.circle.fill")
                                            .foregroundColor(.gray)
                                            .font(.title2)
                                    }
                                }
                            }
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
                                        if UIImage(named: avatar) != nil {
                                            Image(avatar)
                                                .resizable()
                                                .scaledToFill()
                                                .frame(width: 60, height: 60)
                                                .clipShape(Circle())
                                                .overlay(
                                                    Circle()
                                                        .stroke(authManager.avatar == avatar ? Color.blue : Color.clear, lineWidth: 3)
                                                )
                                        } else {
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
