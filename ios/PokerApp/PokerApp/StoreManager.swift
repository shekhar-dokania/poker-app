import Foundation
import Combine

class StoreManager: ObservableObject {
    static let shared = StoreManager()
    
    @Published var isPurchasing: Bool = false
    @Published var lastPurchaseError: String? = nil
    
    // In the future, this will hook into Apple's StoreKit.
    // For now, it makes a direct API call to the mock backend endpoint.
    func purchaseCoins(productId: String, completion: @escaping (Bool) -> Void) {
        guard let token = AuthManager.shared.jwtToken else {
            self.lastPurchaseError = "Not authenticated"
            completion(false)
            return
        }
        
        DispatchQueue.main.async {
            self.isPurchasing = true
            self.lastPurchaseError = nil
        }
        
        // Mock API call to backend
        guard let url = URL(string: "\(AppConfig.serverURL)/auth/buy-coins") else {
            completion(false)
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body: [String: Any] = ["productId": productId]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                self.isPurchasing = false
                
                if let error = error {
                    self.lastPurchaseError = error.localizedDescription
                    completion(false)
                    return
                }
                
                guard let data = data else {
                    self.lastPurchaseError = "No data received"
                    completion(false)
                    return
                }
                
                do {
                    if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] {
                        if let success = json["success"] as? Bool, success {
                            // Update local user state if needed
                            if let newCoins = json["coins"] as? Int {
                                AuthManager.shared.coins = newCoins
                            }
                            completion(true)
                        } else {
                            self.lastPurchaseError = (json["error"] as? String) ?? "Purchase failed"
                            completion(false)
                        }
                    }
                } catch {
                    self.lastPurchaseError = "Failed to parse response"
                    completion(false)
                }
            }
        }.resume()
    }
}
