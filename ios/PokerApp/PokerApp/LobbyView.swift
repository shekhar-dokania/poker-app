import SwiftUI

struct LobbyView: View {
    @ObservedObject private var socketManager = PokerSocketManager.shared
    @AppStorage("username") var storedUsername: String = ""
    @State private var roomCodeToJoin = ""
    @State private var selectedGameType = "holdem"
    @State private var smallBlind: Double = 1
    @State private var minBuyIn: Double = 100
    @State private var maxBuyIn: Double = 10000
    @State private var showSettings: Bool = false
    @State private var selectedPastGame: [String: Any]? = nil
    
    
    func parseInt(_ value: Any?) -> Int {
        if let intVal = value as? Int { return intVal }
        if let doubleVal = value as? Double { return Int(doubleVal) }
        if let strVal = value as? String, let intVal = Int(strVal) { return intVal }
        return 0
    }
    
    var body: some View {
        NavigationView {
            VStack(spacing: 15) {
                if !socketManager.isConnected {
                    Text("Connecting to server...")
                        .foregroundColor(.red)
                }
                
                Text("Welcome, \(storedUsername)!")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .padding(.bottom, 5)
                
                if !socketManager.myRooms.isEmpty {
                    Divider()
                    VStack(spacing: 15) {
                        Text("My Active Tables")
                            .font(.headline)
                        
                        ScrollView {
                            VStack(spacing: 10) {
                                ForEach(socketManager.myRooms, id: \.self.description) { room in
                                    if let code = room["code"] as? String,
                                       let gameType = room["gameType"] as? String {
                                        let playersCount = parseInt(room["playersCount"])
                                        
                                        HStack {
                                            VStack(alignment: .leading) {
                                                Text("Room: \(code)")
                                                    .font(.subheadline)
                                                    .bold()
                                                Text("\(gameType.uppercased()) • \(playersCount) Players")
                                                    .font(.caption)
                                                    .foregroundColor(.secondary)
                                            }
                                            Spacer()
                                            Button(action: {
                                                socketManager.joinRoom(roomCode: code, playerName: storedUsername)
                                            }) {
                                                Text("Rejoin")
                                                    .padding(.horizontal, 16)
                                                    .padding(.vertical, 8)
                                                    .background(Color.orange)
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
                        }
                        .frame(maxHeight: 180)
                    }
                }
                
                Divider()
                
                VStack(spacing: 15) {
                    Text("Create a Room")
                        .font(.headline)
                    
                    Picker("Game Type", selection: $selectedGameType) {
                        Text("Texas Hold'em").tag("holdem")
                        Text("Pot Limit Omaha").tag("plo")
                    }
                    .pickerStyle(SegmentedPickerStyle())
                    .padding(.horizontal)
                    
                    Button(action: { showSettings.toggle() }) {
                        HStack {
                            Text("Game Settings")
                            Spacer()
                            Image(systemName: showSettings ? "chevron.up" : "chevron.down")
                        }
                        .padding(.horizontal)
                    }
                    .foregroundColor(.blue)
                    
                    if showSettings {
                        VStack(spacing: 10) {
                            HStack {
                                Text("Small Blind: \(Int(smallBlind))").frame(width: 120, alignment: .leading)
                                Slider(value: $smallBlind, in: 1...100, step: 1)
                            }
                            HStack {
                                Text("Big Blind: \(Int(smallBlind * 2))").frame(width: 120, alignment: .leading)
                                    .foregroundColor(.secondary)
                                Spacer()
                            }
                            HStack {
                                Text("Min Buy-In: \(Int(minBuyIn))").frame(width: 120, alignment: .leading)
                                Slider(value: $minBuyIn, in: 10...50000, step: 10)
                            }
                            HStack {
                                Text("Max Buy-In: \(Int(maxBuyIn))").frame(width: 120, alignment: .leading)
                                Slider(value: $maxBuyIn, in: 10...50000, step: 10)
                            }
                        }
                        .padding(.horizontal)
                    }
                    
                    Button(action: {
                        if !storedUsername.isEmpty {
                            let settings: [String: Any] = [
                                "smallBlind": Int(smallBlind),
                                "bigBlind": Int(smallBlind) * 2,
                                "minBuyIn": Int(minBuyIn),
                                "maxBuyIn": max(Int(minBuyIn), Int(maxBuyIn))
                            ]
                            socketManager.createRoom(hostName: storedUsername, gameType: selectedGameType, settings: settings)
                        }
                    }) {
                        Text("Create Room")
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color.blue)
                            .foregroundColor(.white)
                            .cornerRadius(10)
                    }
                    .padding(.horizontal)
                    .disabled(storedUsername.isEmpty)
                }
                
                Divider()
                
                VStack(spacing: 15) {
                    Text("Join a Room")
                        .font(.headline)
                    
                    TextField("Room Code", text: $roomCodeToJoin)
                        .textFieldStyle(RoundedBorderTextFieldStyle())
                        .autocapitalization(.allCharacters)
                        .padding(.horizontal)
                    
                    Button(action: {
                        if !storedUsername.isEmpty && !roomCodeToJoin.isEmpty {
                            socketManager.joinRoom(roomCode: roomCodeToJoin, playerName: storedUsername)
                        }
                    }) {
                        Text("Join Room")
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color.green)
                            .foregroundColor(.white)
                            .cornerRadius(10)
                    }
                    .padding(.horizontal)
                    .disabled(storedUsername.isEmpty || roomCodeToJoin.isEmpty)
                }
                
                if !socketManager.pastGames.isEmpty {
                    Divider()
                    VStack(spacing: 15) {
                        Text("Past Games")
                            .font(.headline)
                        
                        ScrollView {
                            VStack(spacing: 10) {
                                ForEach(0..<socketManager.pastGames.count, id: \.self) { index in
                                    let game = socketManager.pastGames[index]
                                    let code = game["roomCode"] as? String ?? "Unknown"
                                    
                                    let ledger = game["ledger"] as? [[String: Any]] ?? []
                                    let myEntry = ledger.first { ($0["username"] as? String) == storedUsername }
                                    let myProfit = parseInt(myEntry?["netProfit"])
                                    
                                    HStack {
                                        VStack(alignment: .leading) {
                                            Text("Room: \(code)")
                                                .font(.subheadline)
                                                .bold()
                                            let startedAt = game["createdAt"] as? String ?? ""
                                            if !startedAt.isEmpty {
                                                Text("Started: \(formatDateTime(startedAt))")
                                                    .font(.caption2)
                                                    .foregroundColor(.gray)
                                            }
                                            Text("Net Profit: \(myProfit >= 0 ? "+" : "")\(myProfit)")
                                                .font(.caption)
                                                .foregroundColor(myProfit > 0 ? .green : (myProfit < 0 ? .red : .secondary))
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
                        .frame(maxHeight: 180)
                    }
                }
                
                Spacer()
            }
            .navigationBarTitle("Lobby", displayMode: .inline)
            .navigationBarItems(trailing: Button("Logout") {
                socketManager.disconnect()
                AuthManager.shared.logout()
                storedUsername = ""
            }.foregroundColor(.red))
            .onAppear {
                socketManager.fetchMyRooms()
                socketManager.fetchPastGames()
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
