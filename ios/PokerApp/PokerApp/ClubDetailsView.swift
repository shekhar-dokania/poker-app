import SwiftUI

struct ClubDetailsView: View {
    let clubId: String
    let clubName: String
    
    @ObservedObject private var socketManager = PokerSocketManager.shared
    @AppStorage("username") var storedUsername: String = ""
    
    @State private var details: [String: Any]? = nil
    @State private var isLoading = true
    
    // Hosting game
    @State private var showingHostGame = false
    @State private var selectedGameType = "holdem"
    @State private var smallBlind: Double = 1
    @State private var minBuyIn: Double = 100
    @State private var maxBuyIn: Double = 10000
    @State private var durationHours: Double = 1
    
    @ObservedObject private var authManager = AuthManager.shared
    
    // Past Game selection for ledger
    @State private var selectedPastGame: [String: Any]? = nil
    
    func parseInt(_ value: Any?) -> Int {
        if let intVal = value as? Int { return intVal }
        if let doubleVal = value as? Double { return Int(doubleVal) }
        if let strVal = value as? String, let intVal = Int(strVal) { return intVal }
        return 0
    }
    
    var body: some View {
        ScrollView {
            if isLoading {
                ProgressView("Loading club details...")
                    .padding(.top, 50)
            } else if let club = details {
                VStack(spacing: 20) {
                    // Club Code & Admin Info
                    if let code = club["code"] as? String {
                        HStack {
                            Text("Club Code:")
                                .font(.headline)
                                .foregroundColor(.secondary)
                            Text(code)
                                .font(.title3)
                                .bold()
                                .foregroundColor(.blue)
                        }
                        .padding()
                        .frame(maxWidth: .infinity)
                        .background(Color(.systemGray6))
                        .cornerRadius(10)
                        .padding(.horizontal)
                    }
                    
                    // Host Game Button
                    Button(action: { showingHostGame.toggle() }) {
                        Text(showingHostGame ? "Cancel Host" : "Host Game in Club")
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(showingHostGame ? Color.gray : Color.orange)
                            .foregroundColor(.white)
                            .cornerRadius(10)
                    }
                    .padding(.horizontal)
                    
                    if showingHostGame {
                        VStack(spacing: 15) {
                            Picker("Game Type", selection: $selectedGameType) {
                                Text("Texas Hold'em").tag("holdem")
                                Text("Pot Limit Omaha").tag("plo")
                            }.pickerStyle(SegmentedPickerStyle())
                            
                            HStack {
                                Text("Small Blind: \(Int(smallBlind))").frame(width: 120, alignment: .leading)
                                Slider(value: $smallBlind, in: 1...100, step: 1)
                            }
                            HStack {
                                Text("Min Buy-In: \(Int(minBuyIn))").frame(width: 120, alignment: .leading)
                                Slider(value: $minBuyIn, in: 10...50000, step: 10)
                            }
                            HStack {
                                Text("Max Buy-In: \(Int(maxBuyIn))").frame(width: 120, alignment: .leading)
                                Slider(value: $maxBuyIn, in: 10...50000, step: 10)
                            }
                            
                            Text("Cost: 1 Coin / minute")
                                .font(.caption)
                                .foregroundColor(authManager.coins >= 1 ? .secondary : .red)
                            
                            Button(action: {
                                let settings: [String: Any] = [
                                    "smallBlind": Int(smallBlind),
                                    "bigBlind": Int(smallBlind) * 2,
                                    "minBuyIn": Int(minBuyIn),
                                    "maxBuyIn": max(Int(minBuyIn), Int(maxBuyIn))
                                ]
                                socketManager.createRoom(hostName: storedUsername, gameType: selectedGameType, settings: settings, clubId: clubId)
                            }) {
                                Text("Start Game")
                                    .frame(maxWidth: .infinity)
                                    .padding()
                                    .background(authManager.coins >= 1 ? Color.blue : Color.gray)
                                    .foregroundColor(.white)
                                    .cornerRadius(10)
                            }
                            .disabled(authManager.coins < 1)
                        }
                        .padding()
                        .background(Color(.systemGray6))
                        .cornerRadius(10)
                        .padding(.horizontal)
                    }
                    
                    // Active Games
                    if let activeGames = club["activeGames"] as? [[String: Any]], !activeGames.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Active Games (\(activeGames.count))")
                                .font(.headline)
                                .padding(.horizontal)
                            
                            ForEach(0..<activeGames.count, id: \.self) { i in
                                let game = activeGames[i]
                                let code = game["roomCode"] as? String ?? "Unknown"
                                let host = game["host"] as? String ?? "Unknown"
                                
                                HStack {
                                    VStack(alignment: .leading) {
                                        Text("Host: \(host)").font(.headline)
                                        Text("Code: \(code)").font(.caption).foregroundColor(.secondary)
                                        let dateStr = game["createdAt"] as? String ?? ""
                                        if !dateStr.isEmpty {
                                            Text("Started: \(formatDateTime(dateStr))").font(.caption2).foregroundColor(.gray)
                                        }
                                    }
                                    Spacer()
                                    Button(action: {
                                        socketManager.joinRoom(roomCode: code, playerName: storedUsername)
                                    }) {
                                        Text("Join")
                                            .padding(.horizontal, 16)
                                            .padding(.vertical, 8)
                                            .background(Color.green)
                                            .foregroundColor(.white)
                                            .cornerRadius(8)
                                    }
                                }
                                .padding()
                                .background(Color(.systemGray6))
                                .cornerRadius(10)
                                .padding(.horizontal)
                            }
                        }
                    }
                    
                    // Past Games
                    if let pastGames = club["pastGames"] as? [[String: Any]], !pastGames.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Past Games")
                                .font(.headline)
                                .padding(.horizontal)
                            
                            ForEach(0..<pastGames.count, id: \.self) { i in
                                let game = pastGames[i]
                                let code = game["roomCode"] as? String ?? "Unknown"
                                let host = game["host"] as? String ?? "Unknown"
                                let dateStr = game["endedAt"] as? String ?? ""
                                
                                HStack {
                                    VStack(alignment: .leading) {
                                        Text("Host: \(host)").font(.headline)
                                        Text("Code: \(code)").font(.caption).foregroundColor(.secondary)
                                        let startedAt = game["createdAt"] as? String ?? ""
                                        if !startedAt.isEmpty {
                                            Text("Started: \(formatDateTime(startedAt))").font(.caption2).foregroundColor(.gray)
                                        }
                                        if !dateStr.isEmpty {
                                            Text("Ended: \(formatDateTime(dateStr))").font(.caption2).foregroundColor(.gray)
                                        }
                                    }
                                    Spacer()
                                    Button(action: {
                                        selectedPastGame = game
                                    }) {
                                        Text("Ledger")
                                            .padding(.horizontal, 16)
                                            .padding(.vertical, 8)
                                            .background(Color.blue)
                                            .foregroundColor(.white)
                                            .cornerRadius(8)
                                    }
                                }
                                .padding()
                                .background(Color(.systemGray6))
                                .cornerRadius(10)
                                .padding(.horizontal)
                            }
                        }
                    }
                    
                    // Leaderboard
                    if let leaderboard = club["leaderboard"] as? [[String: Any]], !leaderboard.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Club Leaderboard")
                                .font(.headline)
                                .padding(.horizontal)
                            
                            VStack(spacing: 0) {
                                ForEach(0..<leaderboard.count, id: \.self) { i in
                                    let entry = leaderboard[i]
                                    let user = entry["username"] as? String ?? "Unknown"
                                    let profit = entry["netProfit"] as? Int ?? 0
                                    let gamesCount = entry["gamesPlayed"] as? Int ?? 0
                                    
                                    HStack {
                                        Text("\(i + 1).").font(.subheadline).foregroundColor(.secondary).frame(width: 25)
                                        Text(user).font(.headline)
                                        Spacer()
                                        VStack(alignment: .trailing) {
                                            Text("\(profit >= 0 ? "+" : "")\(profit)")
                                                .font(.headline)
                                                .foregroundColor(profit > 0 ? .green : (profit < 0 ? .red : .gray))
                                            Text("\(gamesCount) games").font(.caption).foregroundColor(.secondary)
                                        }
                                    }
                                    .padding()
                                    Divider()
                                }
                            }
                            .background(Color(.systemGray6))
                            .cornerRadius(10)
                            .padding(.horizontal)
                        }
                    }
                    
                    // Admin Panel
                    if let isOwner = club["isOwner"] as? Bool, isOwner,
                       let requests = club["pendingRequests"] as? [[String: Any]], !requests.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Pending Join Requests")
                                .font(.headline)
                                .padding(.horizontal)
                            
                            ForEach(0..<requests.count, id: \.self) { i in
                                let req = requests[i]
                                let rId = req["id"] as? String ?? ""
                                let uName = req["username"] as? String ?? "Unknown"
                                
                                HStack {
                                    Text(uName).font(.headline)
                                    Spacer()
                                    Button(action: {
                                        socketManager.resolveClubRequest(memberId: rId, status: "REJECTED") { _ in refresh() }
                                    }) {
                                        Image(systemName: "xmark.circle.fill").foregroundColor(.red).font(.title2)
                                    }
                                    Button(action: {
                                        socketManager.resolveClubRequest(memberId: rId, status: "APPROVED") { _ in refresh() }
                                    }) {
                                        Image(systemName: "checkmark.circle.fill").foregroundColor(.green).font(.title2)
                                    }
                                }
                                .padding()
                                .background(Color(.systemGray6))
                                .cornerRadius(10)
                                .padding(.horizontal)
                            }
                        }
                    }
                    
                    // Members List
                    if let members = club["approvedMembers"] as? [[String: Any]], !members.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Club Members (\(members.count))")
                                .font(.headline)
                                .padding(.horizontal)
                            
                            let isOwner = club["isOwner"] as? Bool ?? false
                            
                            ForEach(0..<members.count, id: \.self) { i in
                                let member = members[i]
                                let rId = member["id"] as? String ?? ""
                                let uName = member["username"] as? String ?? "Unknown"
                                let role = member["role"] as? String ?? "MEMBER"
                                
                                HStack {
                                    VStack(alignment: .leading) {
                                        Text(uName).font(.headline)
                                        Text(role).font(.caption).foregroundColor(role == "OWNER" ? .blue : .secondary)
                                    }
                                    Spacer()
                                    if isOwner && role != "OWNER" {
                                        Button(action: {
                                            socketManager.removeClubMember(memberId: rId) { _ in refresh() }
                                        }) {
                                            Text("Remove")
                                                .font(.caption)
                                                .padding(.horizontal, 10)
                                                .padding(.vertical, 6)
                                                .background(Color.red.opacity(0.1))
                                                .foregroundColor(.red)
                                                .cornerRadius(6)
                                        }
                                    }
                                }
                                .padding()
                                .background(Color(.systemGray6))
                                .cornerRadius(10)
                                .padding(.horizontal)
                            }
                        }
                    }
                }
                .padding(.vertical)
            } else {
                Text("Failed to load club details.")
                    .foregroundColor(.red)
                    .padding(.top, 50)
            }
        }
        .navigationTitle(clubName)
        .onAppear {
            refresh()
        }
        .sheet(isPresented: Binding(
            get: { selectedPastGame != nil },
            set: { if !$0 { selectedPastGame = nil } }
        )) {
            if let game = selectedPastGame {
                VStack(spacing: 20) {
                    Text("Game Ledger")
                        .font(.largeTitle)
                        .bold()
                    
                    Text("Room Code: \(game["roomCode"] as? String ?? "")")
                        .font(.headline)
                        .foregroundColor(.secondary)
                    
                    if let ledger = game["ledger"] as? [[String: Any]] {
                        ScrollView {
                            VStack(spacing: 15) {
                                ForEach(0..<ledger.count, id: \.self) { i in
                                    let entry = ledger[i]
                                    let name = entry["username"] as? String ?? "Unknown"
                                    let buyIn = entry["totalBuyIn"] as? Int ?? 0
                                    let chips = entry["finalChips"] as? Int ?? 0
                                    let profit = entry["netProfit"] as? Int ?? 0
                                    
                                    HStack {
                                        Text(name)
                                            .font(.headline)
                                        Spacer()
                                        VStack(alignment: .trailing) {
                                            Text("Buy In: \(buyIn)")
                                                .font(.caption)
                                            Text("Cash Out: \(chips)")
                                                .font(.caption)
                                            Text("\(profit >= 0 ? "+" : "")\(profit)")
                                                .font(.headline)
                                                .foregroundColor(profit > 0 ? .green : (profit < 0 ? .red : .gray))
                                        }
                                    }
                                    .padding()
                                    .background(Color(.systemGray6))
                                    .cornerRadius(10)
                                }
                            }
                        }
                        .frame(maxHeight: 300)
                    } else {
                        Text("No ledger data available for this game.")
                            .foregroundColor(.secondary)
                    }
                    
                    Button("Close") {
                        selectedPastGame = nil
                    }
                    .padding()
                    .frame(maxWidth: .infinity)
                    .background(Color.blue)
                    .foregroundColor(.white)
                    .cornerRadius(10)
                }
                .padding()
            }
        }
    }
    
    private func refresh() {
        isLoading = true
        socketManager.fetchClubDetails(clubId: clubId) { fetchedDetails in
            self.details = fetchedDetails
            self.isLoading = false
        }
    }
    
    private func formatDateTime(_ isoString: String) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSSZ"
        if let d = formatter.date(from: isoString) {
            let out = DateFormatter()
            out.dateStyle = .medium
            out.timeStyle = .short
            return out.string(from: d)
        }
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ssZ"
        if let d = formatter.date(from: isoString) {
            let out = DateFormatter()
            out.dateStyle = .medium
            out.timeStyle = .short
            return out.string(from: d)
        }
        return String(isoString.prefix(16).replacingOccurrences(of: "T", with: " "))
    }
}
