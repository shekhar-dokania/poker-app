import Foundation
import Combine
import StoreKit

class StoreManager: ObservableObject {
    static let shared = StoreManager()
    
    @Published var isPurchasing: Bool = false
    @Published var lastPurchaseError: String? = nil
    @Published var availableProducts: [Product] = []
    
    private var updatesTask: Task<Void, Never>? = nil
    
    private let productIdentifiers = [
        "com.mayhempoker.coins.100",
        "com.mayhempoker.coins.500",
        "com.mayhempoker.coins.1000"
    ]
    
    init() {
        updatesTask = listenForTransactions()
        Task {
            await fetchProducts()
        }
    }
    
    deinit {
        updatesTask?.cancel()
    }
    
    func fetchProducts() async {
        do {
            let products = try await Product.products(for: productIdentifiers)
            DispatchQueue.main.async {
                self.availableProducts = products.sorted(by: { $0.price < $1.price })
            }
        } catch {
            print("Failed to fetch products: \(error)")
        }
    }
    
    func purchaseCoins(product: Product, completion: @escaping (Bool) -> Void) {
        Task {
            DispatchQueue.main.async {
                self.isPurchasing = true
                self.lastPurchaseError = nil
            }
            
            do {
                let result = try await product.purchase()
                
                switch result {
                case .success(let verification):
                    // Check whether the transaction is verified.
                    let transaction = try checkVerified(verification)
                    
                    // The transaction is verified. Deliver content to the user.
                    await deliverContent(transaction, jws: verification.jwsRepresentation, completion: completion)
                    
                case .userCancelled:
                    DispatchQueue.main.async {
                        self.isPurchasing = false
                        self.lastPurchaseError = "Purchase cancelled"
                    }
                    completion(false)
                    
                case .pending:
                    DispatchQueue.main.async {
                        self.isPurchasing = false
                        self.lastPurchaseError = "Purchase is pending"
                    }
                    completion(false)
                    
                @unknown default:
                    DispatchQueue.main.async {
                        self.isPurchasing = false
                        self.lastPurchaseError = "Unknown purchase result"
                    }
                    completion(false)
                }
            } catch {
                DispatchQueue.main.async {
                    self.isPurchasing = false
                    self.lastPurchaseError = error.localizedDescription
                }
                completion(false)
            }
        }
    }
    
    // Wrapper for UI buttons that only know the String ID
    func purchaseCoins(productId: String, completion: @escaping (Bool) -> Void) {
        guard let product = availableProducts.first(where: { $0.id == productId }) else {
            DispatchQueue.main.async {
                self.lastPurchaseError = "Product not found. Ensure StoreKit config is loaded."
            }
            completion(false)
            return
        }
        purchaseCoins(product: product, completion: completion)
    }
    
    private func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        // Check whether the JWS passes StoreKit verification.
        switch result {
        case .unverified:
            // StoreKit failed to verify the JWS.
            throw StoreError.failedVerification
        case .verified(let safe):
            // If the transaction is verified, unwrap and return it.
            return safe
        }
    }
    
    private func listenForTransactions() -> Task<Void, Never> {
        return Task.detached {
            // Iterate through any transactions that don't come from a direct call to `purchase()`.
            for await result in Transaction.updates {
                do {
                    let transaction = try self.checkVerified(result)
                    
                    // Deliver products to the user.
                    await self.deliverContent(transaction, jws: result.jwsRepresentation) { _ in }
                    
                } catch {
                    print("Transaction failed verification")
                }
            }
        }
    }
    
    private func deliverContent(_ transaction: Transaction, jws: String, completion: @escaping (Bool) -> Void) async {
        guard let token = AuthManager.shared.jwtToken else {
            DispatchQueue.main.async {
                self.lastPurchaseError = "Not authenticated"
                self.isPurchasing = false
            }
            completion(false)
            return
        }
        
        guard let url = URL(string: "\(AppConfig.serverURL)/auth/verify-receipt") else {
            completion(false)
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body: [String: Any] = [
            "transactionId": String(transaction.id),
            "productId": transaction.productID,
            "jwsRepresentation": jws
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        
        do {
            let (data, _) = try await URLSession.shared.data(for: request)
            if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] {
                if let success = json["success"] as? Bool, success {
                    // Always finish a transaction to signal Apple it was successfully delivered.
                    await transaction.finish()
                    
                    DispatchQueue.main.async {
                        if let newCoins = json["coins"] as? Int {
                            AuthManager.shared.coins = newCoins
                        }
                        self.isPurchasing = false
                        completion(true)
                    }
                } else {
                    DispatchQueue.main.async {
                        self.lastPurchaseError = (json["error"] as? String) ?? "Verification failed"
                        self.isPurchasing = false
                        completion(false)
                    }
                }
            }
        } catch {
            DispatchQueue.main.async {
                self.lastPurchaseError = "Failed to verify with server: \(error.localizedDescription)"
                self.isPurchasing = false
                completion(false)
            }
        }
    }
}

enum StoreError: Error {
    case failedVerification
}
