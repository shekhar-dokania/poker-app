import SwiftUI
import AuthenticationServices

struct LoginView: View {
    @State private var isLoginMode = true
    @State private var showingForgotPassword = false
    @State private var username = ""
    @State private var email = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var errorMessage = ""
    @State private var isLoading = false
    
    @AppStorage("username") var storedUsername: String = ""
    
    var body: some View {
        NavigationView {
            ScrollView {
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
                    
                    if !isLoginMode {
                        TextField("Email", text: $email)
                            .keyboardType(.emailAddress)
                            .textFieldStyle(RoundedBorderTextFieldStyle())
                            .autocapitalization(.none)
                            .padding(.horizontal)
                    }
                    
                    SecureField("Password", text: $password)
                        .textFieldStyle(RoundedBorderTextFieldStyle())
                        .padding(.horizontal)
                        
                    if !isLoginMode {
                        SecureField("Confirm Password", text: $confirmPassword)
                            .textFieldStyle(RoundedBorderTextFieldStyle())
                            .padding(.horizontal)
                    }
                    
                    if !errorMessage.isEmpty {
                        Text(errorMessage)
                            .foregroundColor(.red)
                            .font(.caption)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                    }
                    
                    if isLoading {
                        ProgressView()
                            .padding()
                    } else {
                        VStack(spacing: 16) {
                            Button(action: handleAction) {
                                Text(isLoginMode ? "Log In" : "Create Account")
                                    .font(.headline)
                                    .foregroundColor(.white)
                                    .padding()
                                    .frame(maxWidth: .infinity)
                                    .background(Color.blue)
                                    .cornerRadius(10)
                            }
                            
                            HStack {
                                VStack { Divider().background(Color.gray) }
                                Text("OR")
                                    .font(.caption)
                                    .foregroundColor(.gray)
                                VStack { Divider().background(Color.gray) }
                            }
                            
                            SignInWithAppleButton(
                                .signIn,
                                onRequest: { request in
                                    request.requestedScopes = [.fullName, .email]
                                },
                                onCompletion: { result in
                                    handleAppleLogin(result: result)
                                }
                            )
                            .signInWithAppleButtonStyle(.black)
                            .frame(height: 50)
                        }
                        .padding()
                    }
                    
                    if isLoginMode {
                        Button(action: { showingForgotPassword = true }) {
                            Text("Forgot Password?")
                                .font(.subheadline)
                                .foregroundColor(.blue)
                        }
                    }
                    
                    Spacer()
                }
                .navigationTitle(isLoginMode ? "Log In" : "Register")
            }
        }
        .sheet(isPresented: $showingForgotPassword) {
            ForgotPasswordView()
        }
    }
    
    private func isValidPassword(_ pass: String) -> Bool {
        // Min 8 chars, 1 uppercase, 1 number
        let passwordRegex = "^(?=.*[A-Z])(?=.*\\d)[A-Za-z\\d@$!%*?&]{8,}$"
        return NSPredicate(format: "SELF MATCHES %@", passwordRegex).evaluate(with: pass)
    }
    
    private func isValidEmail(_ emailStr: String) -> Bool {
        let emailRegEx = "[A-Z0-9a-z._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,64}"
        return NSPredicate(format: "SELF MATCHES %@", emailRegEx).evaluate(with: emailStr)
    }
    
    private func handleAction() {
        if username.isEmpty || password.isEmpty {
            errorMessage = "Please enter username and password."
            return
        }
        
        if !isLoginMode {
            if email.isEmpty {
                errorMessage = "Please enter an email address."
                return
            }
            if !isValidEmail(email) {
                errorMessage = "Please enter a valid email address."
                return
            }
            if password != confirmPassword {
                errorMessage = "Passwords do not match."
                return
            }
            if !isValidPassword(password) {
                errorMessage = "Password must be at least 8 characters, with 1 uppercase letter and 1 number."
                return
            }
        }
        
        errorMessage = ""
        isLoading = true
        
        let endpoint = isLoginMode ? "login" : "register"
        guard let url = URL(string: "\(AppConfig.serverURL)/auth/\(endpoint)") else {
            isLoading = false
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        var bodyData: [String: String] = ["username": username, "password": password]
        if !isLoginMode {
            bodyData["email"] = email
        }
        
        request.httpBody = try? JSONSerialization.data(withJSONObject: bodyData)
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                self.isLoading = false
                
                if let _ = error {
                    self.errorMessage = "Network error. Please try again."
                    return
                }
                guard let data = data else { return }
                
                if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                    if let success = json["success"] as? Bool, success, let token = json["token"] as? String {
                        self.storedUsername = username
                        AuthManager.shared.login(token: token)
                    } else if let err = json["error"] as? String {
                        self.errorMessage = err
                    } else {
                        self.errorMessage = "An unknown error occurred."
                    }
                }
            }
        }.resume()
    }

    private func handleAppleLogin(result: Result<ASAuthorization, Error>) {
        switch result {
        case .success(let authorization):
            if let appleIDCredential = authorization.credential as? ASAuthorizationAppleIDCredential {
                guard let identityTokenData = appleIDCredential.identityToken,
                      let identityToken = String(data: identityTokenData, encoding: .utf8) else {
                    self.errorMessage = "Unable to read Apple token"
                    return
                }
                
                let fullName = [appleIDCredential.fullName?.givenName, appleIDCredential.fullName?.familyName]
                    .compactMap { $0 }
                    .joined(separator: " ")
                
                self.isLoading = true
                self.errorMessage = ""
                
                guard let url = URL(string: "\(AppConfig.serverURL)/auth/apple") else {
                    self.isLoading = false
                    return
                }
                
                var request = URLRequest(url: url)
                request.httpMethod = "POST"
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                
                let bodyData: [String: String] = [
                    "identityToken": identityToken,
                    "fullName": fullName
                ]
                
                request.httpBody = try? JSONSerialization.data(withJSONObject: bodyData)
                
                URLSession.shared.dataTask(with: request) { data, response, error in
                    DispatchQueue.main.async {
                        self.isLoading = false
                        
                        if let _ = error {
                            self.errorMessage = "Network error. Please try again."
                            return
                        }
                        guard let data = data else { return }
                        
                        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                            if let success = json["success"] as? Bool, success, let token = json["token"] as? String {
                                if let user = json["user"] as? [String: Any], let uname = user["username"] as? String {
                                    self.storedUsername = uname
                                }
                                AuthManager.shared.login(token: token)
                            } else if let err = json["error"] as? String {
                                self.errorMessage = err
                            } else {
                                self.errorMessage = "An unknown error occurred."
                            }
                        }
                    }
                }.resume()
            }
        case .failure(let error):
            if (error as NSError).code != ASAuthorizationError.canceled.rawValue {
                self.errorMessage = "Apple Sign-In failed: \(error.localizedDescription)"
            }
        }
    }
}

struct ForgotPasswordView: View {
    @Environment(\.presentationMode) var presentationMode
    @State private var email = ""
    @State private var message = ""
    @State private var isLoading = false
    
    var body: some View {
        NavigationView {
            VStack(spacing: 20) {
                Text("Enter your email address to receive a password reset link.")
                    .multilineTextAlignment(.center)
                    .padding()
                
                TextField("Email", text: $email)
                    .keyboardType(.emailAddress)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                    .autocapitalization(.none)
                    .padding(.horizontal)
                
                if !message.isEmpty {
                    Text(message)
                        .foregroundColor(message.contains("sent") ? .green : .red)
                        .font(.caption)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }
                
                if isLoading {
                    ProgressView()
                } else {
                    Button(action: sendResetLink) {
                        Text("Send Reset Link")
                            .font(.headline)
                            .foregroundColor(.white)
                            .padding()
                            .frame(maxWidth: .infinity)
                            .background(Color.blue)
                            .cornerRadius(10)
                    }
                    .padding(.horizontal)
                }
                
                Spacer()
            }
            .navigationTitle("Forgot Password")
            .navigationBarItems(trailing: Button("Close") {
                presentationMode.wrappedValue.dismiss()
            })
        }
    }
    
    private func sendResetLink() {
        if email.isEmpty {
            message = "Please enter your email."
            return
        }
        
        isLoading = true
        message = ""
        
        guard let url = URL(string: "\(AppConfig.serverURL)/auth/forgot-password") else {
            isLoading = false
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["email": email])
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                self.isLoading = false
                if let _ = error {
                    self.message = "Network error."
                    return
                }
                guard let data = data else { return }
                
                if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                    if let msg = json["message"] as? String {
                        self.message = msg
                        if let token = json["devToken"] as? String {
                            print("DEV ONLY: Reset Token: \(token)")
                        }
                    } else if let err = json["error"] as? String {
                        self.message = err
                    }
                }
            }
        }.resume()
    }
}
