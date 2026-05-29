import SwiftUI

struct LoginView: View {
    @State private var isLoginMode = true
    @State private var username = ""
    @State private var password = ""
    @State private var errorMessage = ""
    @AppStorage("jwt_token") var jwtToken: String = ""
    @AppStorage("username") var storedUsername: String = ""
    
    var body: some View {
        NavigationView {
            VStack(spacing: 20) {
                Picker(selection: $isLoginMode, label: Text("Picker here")) {
                    Text("Login").tag(true)
                    Text("Create Account").tag(false)
                }.pickerStyle(SegmentedPickerStyle())
                .padding()
                
                TextField("Username", text: $username)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                    .autocapitalization(.none)
                    .padding(.horizontal)
                
                SecureField("Password", text: $password)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                    .padding(.horizontal)
                
                if !errorMessage.isEmpty {
                    Text(errorMessage)
                        .foregroundColor(.red)
                        .font(.caption)
                }
                
                Button(action: handleAction) {
                    Text(isLoginMode ? "Log In" : "Create Account")
                        .font(.headline)
                        .foregroundColor(.white)
                        .padding()
                        .frame(maxWidth: .infinity)
                        .background(Color.blue)
                        .cornerRadius(10)
                }
                .padding()
                
                Spacer()
            }
            .navigationTitle(isLoginMode ? "Log In" : "Register")
        }
    }
    
    private func handleAction() {
        guard !username.isEmpty, !password.isEmpty else {
            errorMessage = "Please enter all fields."
            return
        }
        
        let endpoint = isLoginMode ? "login" : "register"
        guard let url = URL(string: "http://localhost:3000/auth/\(endpoint)") else { return }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: String] = ["username": username, "password": password]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            if let _ = error {
                DispatchQueue.main.async { self.errorMessage = "Network error" }
                return
            }
            guard let data = data else { return }
            
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                DispatchQueue.main.async {
                    if let success = json["success"] as? Bool, success, let token = json["token"] as? String {
                        self.jwtToken = token
                        self.storedUsername = username
                        PokerSocketManager.shared.connectWithToken(token: token)
                    } else if let err = json["error"] as? String {
                        self.errorMessage = err
                    }
                }
            }
        }.resume()
    }
}
