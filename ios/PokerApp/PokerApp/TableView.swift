import SwiftUI
import Combine

struct TableView: View {
    @StateObject private var socketManager = PokerSocketManager.shared
    @ObservedObject private var authManager = AuthManager.shared
    @State private var raiseAmount: Double = 20
    @State private var isSittingOut: Bool = false
    @State private var lastToggleTime: Date = Date.distantPast
    @State private var buyInAmount: Double = 1000
    @State private var showReloadPanel: Bool = false
    @State private var reloadAmount: Double = 1000
    @State private var showHostSettings: Bool = false
    @State private var setSmallBlind: Double = 1
    @State private var setMinBuyIn: Double = 100
    @State private var setMaxBuyIn: Double = 10000
    @State private var setTurnTimeLimit: Double = 30
    @State private var showSideMenu: Bool = false
    @State private var showLedgerModal: Bool = false
    @State private var showHandHistoryModal: Bool = false
    @State private var currentTime: Double = Date().timeIntervalSince1970
    let timer = Timer.publish(every: 0.5, on: .main, in: .common).autoconnect()
    
    var body: some View {
        ZStack(alignment: .trailing) {
            VStack(spacing: 0) {
            // Header
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Room: \(socketManager.currentRoom ?? "")")
                        .font(.headline)
                    if let remaining = getTimeRemaining() {
                        Text("Remaining: \(remaining)")
                            .font(.caption)
                            .foregroundColor(remaining == "Expired" ? .red : .green)
                    } else if socketManager.roomState?["createdAt"] != nil {
                        Text("Running: \(getElapsedTime())")
                            .font(.caption)
                            .foregroundColor(.gray)
                    }
                }
                Spacer()
                
                if let handCount = socketManager.gameState?["handCount"] as? Int {
                    Text("Hands Dealt: \(handCount)")
                        .font(.subheadline)
                        .foregroundColor(.gray)
                        .padding(.trailing, 10)
                }
                Button(action: {
                    withAnimation {
                        showSideMenu = true
                    }
                }) {
                    Image(systemName: "line.horizontal.3")
                        .font(.title)
                        .foregroundColor(.primary)
                }
            }
            .padding()
            .background(Color(UIColor.secondarySystemBackground))
            
            if socketManager.roomState?["pendingTableEnd"] as? Bool == true {
                Text("Table will end after this hand...")
                    .font(.caption)
                    .padding(8)
                    .frame(maxWidth: .infinity)
                    .background(Color.red.opacity(0.8))
                    .foregroundColor(.white)
            }
            
            // Poker Table Area (Flexible Space)
            GeometryReader { geo in
                let width = geo.size.width
                let height = geo.size.height
                let centerX = width / 2
                let centerY = height / 2 - 20
                
                // Dynamic table size
                let tableWidth = width - 40
                let tableHeight = height * 0.60
                
                // Orbit radii for players
                let radiusX = (tableWidth / 2) + 5
                let radiusY = (tableHeight / 2) + 10
                
                ZStack {
                    // Table background
                    Capsule()
                        .fill(Color(red: 0.1, green: 0.5, blue: 0.2)) // Casino Green
                        .frame(width: tableWidth, height: tableHeight)
                        .overlay(Capsule().stroke(Color(red: 0.4, green: 0.2, blue: 0.1), lineWidth: 12)) // Wood border
                        .shadow(color: Color.black.opacity(0.4), radius: 10, x: 0, y: 5)
                        .position(x: centerX, y: centerY)
                    
                    if socketManager.gameState?["stage"] as? String == "waiting" || socketManager.gameState == nil {
                        let handCount = socketManager.gameState?["handCount"] as? Int ?? 0
                        let seatedCount = (socketManager.gameState?["players"] as? [[String: Any]])?.count ?? 0
                        let canStart = seatedCount >= 2
                        
                        if handCount == 0 {
                            Button(action: {
                                socketManager.startGame()
                            }) {
                                Text("Start Game")
                                    .font(.title2)
                                    .bold()
                                    .padding()
                                    .background(canStart ? Color.blue : Color.gray)
                                    .foregroundColor(.white)
                                    .cornerRadius(15)
                                    .shadow(radius: 5)
                            }
                            .disabled(!canStart)
                            .position(x: centerX, y: centerY)
                        } else {
                            Text("Waiting for active players...")
                                .font(.headline)
                                .foregroundColor(.white)
                                .padding()
                                .background(Color.black.opacity(0.6))
                                .cornerRadius(10)
                                .position(x: centerX, y: centerY)
                        }
                    } else {
                        // Center Info (Pot & Community Cards & Winner)
                        VStack(spacing: 8) {
                            HStack {
                                Image(systemName: "banknote.fill").foregroundColor(.yellow)
                                let currentPot = socketManager.gameState?["pot"] as? Int ?? 0
                                let ritOriginalPot = socketManager.gameState?["ritOriginalPot"] as? Int ?? 0
                                let isRitShowdown = socketManager.gameState?["isRitShowdown"] as? Bool ?? false
                                let displayPot = (isRitShowdown && ritOriginalPot > 0) ? ritOriginalPot : currentPot
                                Text("Pot: \(displayPot)")
                                    .foregroundColor(.white)
                                    .font(.subheadline)
                                    .bold()
                            }
                            .padding(.horizontal, 12)
                            .padding(.vertical, 4)
                            .background(Color.black.opacity(0.6))
                            .cornerRadius(12)
                            
                            if let ritData = socketManager.gameState?["runItTwiceData"] as? [String: Any],
                               let b1 = ritData["board1"] as? [String: Any], let c1 = b1["communityCards"] as? [String],
                               let b2 = ritData["board2"] as? [String: Any], let c2 = b2["communityCards"] as? [String] {
                                VStack(spacing: 4) {
                                    HStack(spacing: 4) {
                                        Text("B1").foregroundColor(.white).font(.caption2).bold()
                                        ForEach(c1, id: \.self) { card in CardView(card: card, scale: 0.75) }
                                    }
                                    HStack(spacing: 4) {
                                        Text("B2").foregroundColor(.white).font(.caption2).bold()
                                        ForEach(c2, id: \.self) { card in CardView(card: card, scale: 0.75) }
                                    }
                                }
                            } else {
                                HStack {
                                    if let cards = socketManager.gameState?["communityCards"] as? [String] {
                                        ForEach(cards, id: \.self) { card in
                                            CardView(card: card)
                                        }
                                    }
                                }
                            }
                            
                            if socketManager.gameState?["stage"] as? String == "handEnd" || socketManager.gameState?["stage"] as? String == "showdown" {
                                if let ritData = socketManager.gameState?["runItTwiceData"] as? [String: Any] {
                                    VStack(spacing: 2) {
                                        Text("Run It Twice").font(.subheadline).foregroundColor(.yellow)
                                        if let b1 = ritData["board1"] as? [String: Any], let w1 = b1["winners"] as? [String: Any], let win1 = w1["winners"] as? [String] {
                                            Text("B1: \(win1.joined(separator: ", "))").font(.caption2).foregroundColor(.white)
                                        }
                                        if let b2 = ritData["board2"] as? [String: Any], let w2 = b2["winners"] as? [String: Any], let win2 = w2["winners"] as? [String] {
                                            Text("B2: \(win2.joined(separator: ", "))").font(.caption2).foregroundColor(.white)
                                        }
                                    }
                                    .padding(8)
                                    .background(Color.black.opacity(0.8))
                                    .cornerRadius(8)
                                } else if let winnerInfo = socketManager.gameState?["winnerInfo"] as? [String: Any],
                                   let winners = winnerInfo["winners"] as? [String] {
                                    VStack(spacing: 6) {
                                        Text("\(winners.joined(separator: ", ")) Wins!")
                                            .font(.headline)
                                            .foregroundColor(.yellow)
                                        Text(winnerInfo["description"] as? String ?? "")
                                            .font(.caption2)
                                            .foregroundColor(.white)
                                            .multilineTextAlignment(.center)
                                    }
                                    .padding(10)
                                    .background(Color.black.opacity(0.8))
                                    .cornerRadius(12)
                                }
                            }
                        }
                        .position(x: centerX, y: centerY)
                    }
                    
                    // Players
                    if let players = socketManager.gameState?["players"] as? [[String: Any]] {
                        let currentTurn = socketManager.gameState?["currentTurn"] as? Int ?? -1
                        let N = max(1, players.count)
                        let myIndex = players.firstIndex(where: { ($0["name"] as? String) == socketManager.localPlayerName }) ?? 0
                        
                        ForEach(Array(players.enumerated()), id: \.offset) { index, player in
                            let isTurn = (index == currentTurn) && (socketManager.gameState?["stage"] as? String != "runItTwicePrompt") && (socketManager.gameState?["stage"] as? String != "handEnd") && (socketManager.gameState?["isAllInShowdown"] as? Bool != true) && (socketManager.gameState?["isRitShowdown"] as? Bool != true)
                            let isMe = index == myIndex
                            let name = player["name"] as? String ?? "Unknown"
                            let chips = player["chips"] as? Int ?? 0
                            let bet = player["currentBet"] as? Int ?? 0
                            let status = player["status"] as? String ?? "active"
                            let isDealer = player["isDealer"] as? Bool ?? false
                            let isSB = player["isSB"] as? Bool ?? false
                            let isBB = player["isBB"] as? Bool ?? false
                            
                            // Math for radial positioning
                            let shift = (index - myIndex + N) % N
                            let angle: Double = (Double(shift) / Double(N)) * 2 * .pi + .pi / 2
                            
                            let px = centerX + CGFloat(cos(angle)) * radiusX
                            let py = centerY + CGFloat(sin(angle)) * radiusY
                            
                            // Bets sit closer to the center
                            let bx = centerX + CGFloat(cos(angle)) * (radiusX * 0.6)
                            let by = centerY + CGFloat(sin(angle)) * (radiusY * 0.55)
                            
                            // Draw Bet
                            BetNodeView(bet: bet)
                                .position(x: bx, y: by)
                            
                            // Timers
                            let turnStartTimeSec = (socketManager.gameState?["turnStartTime"] as? Double ?? 0) / 1000.0
                            let turnTimeLimitSec = socketManager.gameState?["turnTimeLimit"] as? Double ?? 30.0
                            let revealedHand = player["revealedHand"] as? [String]
                            let avatar = player["avatar"] as? String

                            // Draw Player
                            PlayerNodeView(name: name, avatar: avatar, chips: chips, status: status, isTurn: isTurn, isMe: isMe, isDealer: isDealer, isSB: isSB, isBB: isBB, turnStartTime: turnStartTimeSec, turnTimeLimit: turnTimeLimitSec, currentTime: currentTime, revealedHand: revealedHand)
                                .position(x: px, y: py)
                        }
                    }
                }
            }
            .onReceive(timer) { _ in
                currentTime = Date().timeIntervalSince1970
            }    
            
            // Determine if the local player is seated in the game
            let amISeated = (socketManager.gameState?["players"] as? [[String: Any]])?.contains(where: { ($0["name"] as? String) == socketManager.localPlayerName }) ?? false
            let myRoomPlayer = (socketManager.roomState?["players"] as? [[String: Any]])?.first(where: { ($0["name"] as? String) == socketManager.localPlayerName })
            let myCashedOutChips = myRoomPlayer?["cashedOutChips"] as? Int ?? 0
            
            if !amISeated {
                // Buy-In Panel for Spectators
                VStack(spacing: 16) {
                    Text("Join the Table")
                        .font(.headline)
                        .padding(.top, 10)
                    
                    if myCashedOutChips > 0 {
                        Text("You must return to the table with your previous stack of \(myCashedOutChips) chips.")
                            .font(.subheadline)
                            .foregroundColor(.orange)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                    } else {
                        VStack(spacing: 12) {
                            let minBuyInLimit = Double(socketManager.roomSettings?["minBuyIn"] as? Int ?? 100)
                            let maxBuyInLimit = Double(socketManager.roomSettings?["maxBuyIn"] as? Int ?? 10000)
                            let safeMax = max(minBuyInLimit, maxBuyInLimit)
                            let safeAmount = min(max(buyInAmount, minBuyInLimit), safeMax)
                            
                            HStack(spacing: 8) {
                                Button("Min") { buyInAmount = minBuyInLimit }
                                    .buttonStyle(ShortcutButtonStyle())
                                Button("Half") { buyInAmount = min(safeMax, max(minBuyInLimit, safeMax / 2)) }
                                    .buttonStyle(ShortcutButtonStyle())
                                Button("Max") { buyInAmount = safeMax }
                                    .buttonStyle(ShortcutButtonStyle())
                            }
                            
                            HStack {
                                Text("Chips:")
                                    .foregroundColor(.primary)
                                    .bold()
                                    .frame(width: 60, alignment: .leading)
                                
                                TextField("Amount", value: $buyInAmount, formatter: NumberFormatter())
                                    .textFieldStyle(RoundedBorderTextFieldStyle())
                                    .keyboardType(.numberPad)
                                    .frame(width: 80)
                                
                                Slider(value: Binding(
                                    get: { safeAmount },
                                    set: { buyInAmount = $0 }
                                ), in: minBuyInLimit...safeMax, step: 1)
                                    .accentColor(.green)
                            }
                        }
                        .padding(.horizontal)
                    }
                    
                    Button(action: {
                        if myCashedOutChips > 0 {
                            socketManager.sitAtTable(chips: myCashedOutChips)
                        } else {
                            let minBuyInLimit = Double(socketManager.roomSettings?["minBuyIn"] as? Int ?? 100)
                            let maxBuyInLimit = Double(socketManager.roomSettings?["maxBuyIn"] as? Int ?? 10000)
                            let safeMax = max(minBuyInLimit, maxBuyInLimit)
                            let safeAmount = min(max(buyInAmount, minBuyInLimit), safeMax)
                            socketManager.sitAtTable(chips: Int(safeAmount))
                        }
                    }) {
                        Text("Take Seat")
                            .font(.headline)
                            .padding()
                            .frame(maxWidth: .infinity)
                            .background(Color.blue)
                            .foregroundColor(.white)
                            .cornerRadius(10)
                    }
                    .padding(.horizontal)
                }
                .padding(.bottom, 20)
                .background(Color(UIColor.systemBackground).shadow(radius: 10))
            } else {
                // Bottom Section: Private Hand & Action Controls
                VStack(spacing: 12) {
                    if showReloadPanel {
                        VStack(spacing: 12) {
                            Text("Reload Chips")
                                .font(.headline)
                            VStack(spacing: 12) {
                                let maxBuyInLimit = Double(socketManager.roomSettings?["maxBuyIn"] as? Int ?? 10000)
                                let myGameStatePlayer = (socketManager.gameState?["players"] as? [[String: Any]])?.first(where: { ($0["name"] as? String) == socketManager.localPlayerName })
                                let myCurrentChips = myGameStatePlayer?["chips"] as? Int ?? 0
                                let myPotContribution = myGameStatePlayer?["potContribution"] as? Int ?? 0
                                let myQueuedReload = myGameStatePlayer?["queuedReload"] as? Int ?? 0
                                let myTotalCurrentChips = myCurrentChips + myPotContribution + myQueuedReload
                                
                                let maxReloadAllowed = max(0.0, maxBuyInLimit - Double(myTotalCurrentChips))
                                
                                if maxReloadAllowed <= 0 {
                                    Text("You are already at or above the maximum buy-in limit.")
                                        .font(.subheadline)
                                        .foregroundColor(.orange)
                                        .multilineTextAlignment(.center)
                                        .padding(.horizontal)
                                    Button("Close") { showReloadPanel = false }
                                        .padding(.vertical, 10)
                                        .frame(maxWidth: .infinity)
                                        .background(Color.gray)
                                        .foregroundColor(.white)
                                        .cornerRadius(8)
                                        .padding(.horizontal)
                                } else {
                                    let minBuyInLimit = min(Double(socketManager.roomSettings?["minBuyIn"] as? Int ?? 100), maxReloadAllowed)
                                    let safeAmount = min(max(reloadAmount, minBuyInLimit), maxReloadAllowed)
                                    
                                    HStack(spacing: 8) {
                                        Button("Min") { reloadAmount = minBuyInLimit }
                                            .buttonStyle(ShortcutButtonStyle())
                                        Button("Half") { reloadAmount = min(maxReloadAllowed, max(minBuyInLimit, maxReloadAllowed / 2)) }
                                            .buttonStyle(ShortcutButtonStyle())
                                        Button("Max") { reloadAmount = maxReloadAllowed }
                                            .buttonStyle(ShortcutButtonStyle())
                                    }
                                    
                                    HStack {
                                        Text("Chips:")
                                            .bold()
                                            .frame(width: 60, alignment: .leading)
                                        
                                        TextField("Amount", value: $reloadAmount, formatter: NumberFormatter())
                                            .textFieldStyle(RoundedBorderTextFieldStyle())
                                            .keyboardType(.numberPad)
                                            .frame(width: 80)
                                        
                                        Slider(value: Binding(
                                            get: { safeAmount },
                                            set: { reloadAmount = $0 }
                                        ), in: minBuyInLimit...maxReloadAllowed, step: 1)
                                            .accentColor(.green)
                                    }
                                }
                            }
                            .padding(.horizontal)
                            if (max(0.0, Double(socketManager.roomSettings?["maxBuyIn"] as? Int ?? 10000) - Double((socketManager.gameState?["players"] as? [[String: Any]])?.first(where: { ($0["name"] as? String) == socketManager.localPlayerName })?["chips"] as? Int ?? 0) - Double((socketManager.gameState?["players"] as? [[String: Any]])?.first(where: { ($0["name"] as? String) == socketManager.localPlayerName })?["potContribution"] as? Int ?? 0) - Double((socketManager.gameState?["players"] as? [[String: Any]])?.first(where: { ($0["name"] as? String) == socketManager.localPlayerName })?["queuedReload"] as? Int ?? 0)) > 0) {
                                HStack(spacing: 16) {
                                    Button("Cancel") { showReloadPanel = false }
                                        .padding(.horizontal, 20)
                                        .padding(.vertical, 10)
                                        .background(Color.gray)
                                        .foregroundColor(.white)
                                        .cornerRadius(8)
                                    Button("Confirm") {
                                        let maxBuyInLimit = Double(socketManager.roomSettings?["maxBuyIn"] as? Int ?? 10000)
                                        let myGameStatePlayer = (socketManager.gameState?["players"] as? [[String: Any]])?.first(where: { ($0["name"] as? String) == socketManager.localPlayerName })
                                        let myCurrentChips = myGameStatePlayer?["chips"] as? Int ?? 0
                                        let myPotContribution = myGameStatePlayer?["potContribution"] as? Int ?? 0
                                        let myQueuedReload = myGameStatePlayer?["queuedReload"] as? Int ?? 0
                                        let myTotalCurrentChips = myCurrentChips + myPotContribution + myQueuedReload
                                        let maxReloadAllowed = max(0.0, maxBuyInLimit - Double(myTotalCurrentChips))
                                        let minBuyInLimit = min(Double(socketManager.roomSettings?["minBuyIn"] as? Int ?? 100), maxReloadAllowed)
                                        let safeAmount = min(max(reloadAmount, minBuyInLimit), maxReloadAllowed)
                                        socketManager.reloadChips(amount: Int(safeAmount))
                                        showReloadPanel = false
                                    }
                                        .padding(.horizontal, 20)
                                        .padding(.vertical, 10)
                                        .background(Color.blue)
                                        .foregroundColor(.white)
                                        .cornerRadius(8)
                                }
                            }
                        }
                    } else {
                        // Private Hand
                        if let hand = socketManager.privateHand {
                        VStack(spacing: 4) {
                            Text("Your Hand")
                                .font(.caption)
                                .foregroundColor(.secondary)
                            HStack {
                                ForEach(hand, id: \.self) { card in
                                    CardView(card: card)
                                }
                            }
                        }
                    }
                    
                    // Action State Computation
                    let stage = socketManager.gameState?["stage"] as? String ?? "waiting"
                    let isGameRunning = stage != "waiting" && stage != "showdown"
                    
                    let isMyTurn: Bool = {
                        if !isGameRunning { return false }
                        guard let currentTurn = socketManager.gameState?["currentTurn"] as? Int,
                              let players = socketManager.gameState?["players"] as? [[String: Any]],
                              currentTurn >= 0 && currentTurn < players.count else { return false }
                        return players[currentTurn]["name"] as? String == socketManager.localPlayerName
                    }()
                    
                    let myBet: Int = {
                        guard let players = socketManager.gameState?["players"] as? [[String: Any]],
                              let me = players.first(where: { $0["name"] as? String == socketManager.localPlayerName }) else { return 0 }
                        return me["currentBet"] as? Int ?? 0
                    }()
                    
                    let myChips: Int = {
                        guard let players = socketManager.gameState?["players"] as? [[String: Any]],
                              let me = players.first(where: { $0["name"] as? String == socketManager.localPlayerName }) else { return 0 }
                        return me["chips"] as? Int ?? 0
                    }()
                    
                    let highestBet = socketManager.gameState?["currentHighestBet"] as? Int ?? 0
                    let minRaiseServer = socketManager.gameState?["currentMinRaise"] as? Int ?? 2
                    let gameType = socketManager.gameState?["gameType"] as? String ?? "holdem"
                    let totalPot = socketManager.gameState?["pot"] as? Int ?? 0
                    
                    let canCheck = myBet == highestBet
                    let canCall = myBet < highestBet
                    
                    let callAmount = highestBet - myBet
                    let minRaise = callAmount + minRaiseServer
                    
                    let maxRaise: Int = {
                        if gameType == "plo" {
                            let maxAdditional = totalPot + callAmount // Total bet = totalPot + 2*callAmount
                            return min(myChips, callAmount + maxAdditional)
                        }
                        return myChips
                    }()
                    
                    let safeMax = max(minRaise + 1, maxRaise)
                    let canRaise = myChips >= minRaise
                    
                    // Quick Raise Amounts
                    let settings = socketManager.roomState?["settings"] as? [String: Any]
                    let bbAmount = settings?["bigBlind"] as? Int ?? 2
                    
                    let amt3BB = min(max(3 * bbAmount, minRaise), maxRaise)
                    let amtPot = min(max(totalPot + (2 * callAmount), minRaise), maxRaise)
                    
                    // Raise UI
                    if isMyTurn && canRaise && isGameRunning && stage != "handEnd" {
                        VStack(spacing: 8) {
                            // Quick Raise Shortcuts
                            HStack(spacing: 8) {
                                Button("Min") { self.raiseAmount = Double(minRaise) }
                                    .buttonStyle(ShortcutButtonStyle())
                                
                                Button("3BB") { self.raiseAmount = Double(amt3BB) }
                                    .buttonStyle(ShortcutButtonStyle())
                                
                                Button("Pot") { self.raiseAmount = Double(amtPot) }
                                    .buttonStyle(ShortcutButtonStyle())
                                
                                Button("All-In") { self.raiseAmount = Double(maxRaise) }
                                    .buttonStyle(ShortcutButtonStyle())
                            }
                            
                            // Existing Slider
                            HStack {
                                Text("Raise: \(Int(raiseAmount))")
                                    .foregroundColor(.white)
                                    .bold()
                                    .frame(width: 100, alignment: .leading)
                                
                                Slider(value: Binding(
                                    get: { max(self.raiseAmount, Double(minRaise)) },
                                    set: { self.raiseAmount = $0 }
                                ), in: Double(minRaise)...Double(safeMax), step: 1)
                                    .accentColor(.green)
                            }
                        }
                        .padding(.horizontal)
                        .padding(.vertical, 8)
                        .background(Color.black.opacity(0.6))
                        .cornerRadius(10)
                        .padding(.horizontal)
                        .onAppear {
                            self.raiseAmount = Double(minRaise)
                        }
                    }
                    
                    // Action Buttons
                    if stage == "handEnd" {
                        let players = socketManager.gameState?["players"] as? [[String: Any]] ?? []
                        let me = players.first(where: { ($0["name"] as? String) == socketManager.localPlayerName })
                        let hasCards = me?["hasCards"] as? Bool ?? false
                        let revealedHand = me?["revealedHand"] as? [String] ?? []
                        
                        if hasCards && revealedHand.isEmpty {
                            HStack(spacing: 12) {
                                Button("Muck") { socketManager.sendAction(action: "muckCards") }
                                    .buttonStyle(ActionButtonStyle(color: .gray))
                                
                                Button("Show Cards") { socketManager.sendAction(action: "showCards") }
                                    .buttonStyle(ActionButtonStyle(color: .blue))
                            }
                            .padding(.horizontal)
                            .padding(.vertical, 8)
                        } else {
                            Text("Waiting for next hand...")
                                .font(.headline)
                                .foregroundColor(.secondary)
                                .padding()
                        }
                    } else if isGameRunning {
                        HStack(spacing: 12) {
                            Button("Fold") { socketManager.sendAction(action: "fold") }
                                .buttonStyle(ActionButtonStyle(color: .red))
                            
                            Button("Check") { socketManager.sendAction(action: "check") }
                                .buttonStyle(ActionButtonStyle(color: canCheck ? .blue : .gray))
                                .disabled(!canCheck)
                            
                            Button("Call") { socketManager.sendAction(action: "call") }
                                .buttonStyle(ActionButtonStyle(color: canCall ? .orange : .gray))
                                .disabled(!canCall)
                            
                            Button("Raise") { 
                                socketManager.sendAction(action: "raise", amount: Int(raiseAmount)) 
                            }
                                .buttonStyle(ActionButtonStyle(color: canRaise ? .green : .gray))
                                .disabled(!canRaise)
                        }
                        .padding(.horizontal)
                        .disabled(!isMyTurn)
                        .opacity(isMyTurn ? 1.0 : 0.6)
                    }
                    } // closes the if showReloadPanel else block
                }
                .padding(.bottom, 20)
                .background(Color(UIColor.systemBackground).shadow(radius: 10))
            }
            } // End of inner VStack
            
            // Side Menu Overlay
            if showSideMenu {
                Color.black.opacity(0.4)
                    .edgesIgnoringSafeArea(.all)
                    .onTapGesture {
                        withAnimation { showSideMenu = false }
                    }
                
                let amISeatedMenu = (socketManager.gameState?["players"] as? [[String: Any]])?.contains(where: { ($0["name"] as? String) == socketManager.localPlayerName }) ?? false
                
                VStack(alignment: .leading, spacing: 24) {
                    Text("Menu")
                        .font(.title2).bold()
                        .padding(.top, 40)
                        .padding(.bottom, 10)
                    
                    if amISeatedMenu {
                        Toggle("Sit Out Next Hand", isOn: Binding(
                            get: {
                                return isSittingOut
                            },
                            set: { newValue in
                                isSittingOut = newValue
                                lastToggleTime = Date()
                                socketManager.sendSitOut(isSittingOut: newValue)
                            }
                        ))
                        
                        Divider()
                        
                        Button(action: {
                            withAnimation { showSideMenu = false }
                            showReloadPanel = true
                        }) {
                            Label("Reload Chips", systemImage: "dollarsign.circle")
                                .font(.headline)
                        }
                        
                        Button(action: {
                            socketManager.standUp()
                            withAnimation { showSideMenu = false }
                        }) {
                            Label("Stand Up", systemImage: "figure.walk")
                                .font(.headline)
                        }
                    }
                    
                    Divider()
                    Button(action: {
                        withAnimation { showSideMenu = false }
                        showLedgerModal = true
                    }) {
                        Label("View Ledger", systemImage: "list.clipboard")
                            .font(.headline)
                    }
                    
                    Button(action: {
                        socketManager.fetchHandHistory()
                        withAnimation { showSideMenu = false }
                        showHandHistoryModal = true
                    }) {
                        Label("Hand History", systemImage: "clock.arrow.circlepath")
                            .font(.headline)
                    }
                    
                    if socketManager.isHost {
                        Divider()
                        Button(action: {
                            setSmallBlind = Double(socketManager.roomSettings?["smallBlind"] as? Int ?? 1)
                            setMinBuyIn = Double(socketManager.roomSettings?["minBuyIn"] as? Int ?? 100)
                            setMaxBuyIn = Double(socketManager.roomSettings?["maxBuyIn"] as? Int ?? 10000)
                            setTurnTimeLimit = Double(socketManager.roomSettings?["turnTimeLimit"] as? Int ?? 30)
                            withAnimation { showSideMenu = false }
                            showHostSettings = true
                        }) {
                            Label("Game Settings", systemImage: "gearshape")
                                .font(.headline)
                        }
                        
                        Button(action: {
                            socketManager.requestEndTable()
                            withAnimation { showSideMenu = false }
                        }) {
                            Label("End Table", systemImage: "xmark.octagon")
                                .font(.headline)
                                .foregroundColor(.red)
                        }
                    }
                    
                    Spacer()
                    Divider()
                    
                    Button(action: {
                        socketManager.currentRoom = nil
                    }) {
                        Label("Leave Room", systemImage: "rectangle.portrait.and.arrow.right")
                            .font(.headline)
                            .foregroundColor(.red)
                    }
                    .padding(.bottom, 40)
                }
                .padding(.horizontal)
                .frame(width: 260)
                .background(Color(UIColor.systemBackground))
                .edgesIgnoringSafeArea(.vertical)
                .transition(.move(edge: .trailing))
            }
            
            // Ledger Overlay
            let balancesToShow = showLedgerModal ? (socketManager.roomState?["ledgerBalances"] as? [[String: Any]]) : socketManager.finalBalances
            let isFinal = socketManager.finalBalances != nil
            
            if let balances = balancesToShow {
                Color.black.opacity(0.8)
                    .edgesIgnoringSafeArea(.all)
                
                VStack(spacing: 20) {
                    Text(isFinal ? "Table Ended" : "Live Ledger")
                        .font(.largeTitle)
                        .bold()
                        .foregroundColor(.white)
                        .padding(.top, 40)
                    
                    ScrollView {
                        VStack(spacing: 12) {
                            ForEach(0..<balances.count, id: \.self) { i in
                                let b = balances[i]
                                let name = b["name"] as? String ?? "Unknown"
                                let buyIn = b["totalBuyIn"] as? Int ?? 0
                                let chips = b["chips"] as? Int ?? 0
                                let net = b["net"] as? Int ?? 0
                                
                                HStack {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(name)
                                            .font(.headline)
                                            .foregroundColor(.white)
                                        Text("Buy-in: \(buyIn)  |  Current: \(chips)")
                                            .font(.subheadline)
                                            .foregroundColor(.white.opacity(0.8))
                                    }
                                    Spacer()
                                    
                                    Text(net >= 0 ? "+\(net)" : "\(net)")
                                        .font(.title3)
                                        .bold()
                                        .foregroundColor(net >= 0 ? .green : .red)
                                }
                                .padding()
                                .background(Color(UIColor.secondarySystemBackground).opacity(0.2))
                                .cornerRadius(12)
                            }
                        }
                        .padding(.horizontal)
                    }
                    
                    if isFinal {
                        Button("Return to Lobby") {
                            socketManager.currentRoom = nil
                            socketManager.finalBalances = nil
                            showLedgerModal = false
                        }
                        .font(.headline)
                        .padding()
                        .frame(maxWidth: .infinity)
                        .background(Color.blue)
                        .foregroundColor(.white)
                        .cornerRadius(12)
                        .padding(.horizontal, 20)
                        .padding(.bottom, 40)
                    } else {
                        Button("Close") {
                            showLedgerModal = false
                        }
                        .font(.headline)
                        .padding()
                        .frame(maxWidth: .infinity)
                        .background(Color.gray)
                        .foregroundColor(.white)
                        .cornerRadius(12)
                        .padding(.horizontal, 20)
                        .padding(.bottom, 40)
                    }
                }
                .frame(maxWidth: 400)
                .background(Color(UIColor.systemBackground).opacity(0.2))
                .cornerRadius(20)
                .padding()
            }
            
            // Hand History Overlay
            if showHandHistoryModal {
                Color.black.opacity(0.8)
                    .edgesIgnoringSafeArea(.all)
                
                VStack(spacing: 16) {
                    Text("Hand History")
                        .font(.largeTitle)
                        .bold()
                        .foregroundColor(.white)
                        .padding(.top, 40)
                    
                    if socketManager.handHistory.isEmpty {
                        Spacer()
                        Text("No hands have been played yet.")
                            .foregroundColor(.white)
                        Spacer()
                    } else {
                        ScrollView {
                            VStack(spacing: 16) {
                                ForEach(0..<socketManager.handHistory.count, id: \.self) { index in
                                    let handIndex = socketManager.handHistory.count - 1 - index
                                    let hand = socketManager.handHistory[handIndex]
                                    let pot = hand["pot"] as? Int ?? 0
                                    let commCards = hand["communityCards"] as? [String] ?? []
                                    let winnerInfo = hand["winnerInfo"] as? [String: Any]
                                    let winners = winnerInfo?["winners"] as? [String] ?? []
                                    let desc = winnerInfo?["description"] as? String ?? ""
                                    
                                    VStack(alignment: .leading, spacing: 8) {
                                        Text("Hand #\(handIndex + 1)")
                                            .font(.headline)
                                            .foregroundColor(.white)
                                        
                                        HStack {
                                            Text("Pot: \(pot)")
                                                .font(.subheadline)
                                                .bold()
                                                .foregroundColor(.yellow)
                                            Spacer()
                                        }
                                        
                                        if let ritData = hand["runItTwiceData"] as? [String: Any],
                                           let b1 = ritData["board1"] as? [String: Any], let c1 = b1["communityCards"] as? [String],
                                           let b2 = ritData["board2"] as? [String: Any], let c2 = b2["communityCards"] as? [String] {
                                            VStack(alignment: .leading, spacing: 6) {
                                                Text("Run It Twice - Board 1:").font(.caption).foregroundColor(.yellow)
                                                HStack {
                                                    ForEach(c1, id: \.self) { card in CardView(card: card, scale: 0.75) }
                                                }
                                                if let w1 = b1["winners"] as? [String: Any], let win1 = w1["winners"] as? [String] {
                                                    Text("Winners: \(win1.joined(separator: ", "))").font(.caption).foregroundColor(.white)
                                                    if let desc1 = w1["description"] as? String {
                                                        Text(desc1).font(.caption2).foregroundColor(.white.opacity(0.8))
                                                    }
                                                }
                                                
                                                Text("Run It Twice - Board 2:").font(.caption).foregroundColor(.yellow).padding(.top, 4)
                                                HStack {
                                                    ForEach(c2, id: \.self) { card in CardView(card: card, scale: 0.75) }
                                                }
                                                if let w2 = b2["winners"] as? [String: Any], let win2 = w2["winners"] as? [String] {
                                                    Text("Winners: \(win2.joined(separator: ", "))").font(.caption).foregroundColor(.white)
                                                    if let desc2 = w2["description"] as? String {
                                                        Text(desc2).font(.caption2).foregroundColor(.white.opacity(0.8))
                                                    }
                                                }
                                            }
                                        } else {
                                            if !commCards.isEmpty {
                                                HStack {
                                                    ForEach(commCards, id: \.self) { card in
                                                        CardView(card: card, scale: 0.75)
                                                    }
                                                }
                                            }
                                            
                                            if !winners.isEmpty {
                                                VStack(alignment: .leading, spacing: 2) {
                                                    Text("Winners: \(winners.joined(separator: ", "))")
                                                        .font(.subheadline)
                                                        .foregroundColor(.white)
                                                    Text(desc)
                                                        .font(.caption)
                                                        .foregroundColor(.white.opacity(0.8))
                                                }
                                                .padding(.top, 4)
                                            }
                                        }
                                        
                                        let players = hand["players"] as? [[String: Any]] ?? []
                                        let revealedPlayers = players.filter { ($0["revealedHand"] as? [String])?.isEmpty == false }
                                        if !revealedPlayers.isEmpty {
                                            VStack(alignment: .leading, spacing: 4) {
                                                Text("Revealed Hands:")
                                                    .font(.subheadline)
                                                    .bold()
                                                    .foregroundColor(.white)
                                                ForEach(0..<revealedPlayers.count, id: \.self) { i in
                                                    let rp = revealedPlayers[i]
                                                    let rpName = rp["name"] as? String ?? "Unknown"
                                                    let rHand = rp["revealedHand"] as? [String] ?? []
                                                    HStack {
                                                        Text(rpName)
                                                            .font(.caption)
                                                            .foregroundColor(.white)
                                                            .frame(width: 60, alignment: .leading)
                                                        ForEach(rHand, id: \.self) { card in
                                                            CardView(card: card)
                                                        }
                                                    }
                                                }
                                            }
                                            .padding(.top, 4)
                                        }
                                    }
                                    .padding()
                                    .background(Color(UIColor.secondarySystemBackground).opacity(0.2))
                                    .cornerRadius(12)
                                }
                            }
                            .padding(.horizontal)
                        }
                    }
                    
                    Button("Close") {
                        showHandHistoryModal = false
                    }
                    .font(.headline)
                    .padding()
                    .frame(maxWidth: .infinity)
                    .background(Color.gray)
                    .foregroundColor(.white)
                    .cornerRadius(12)
                    .padding(.horizontal, 20)
                    .padding(.bottom, 40)
                }
                .frame(maxWidth: 400)
                .background(Color(UIColor.systemBackground).opacity(0.2))
                .cornerRadius(20)
                .padding()
            }
            
            if socketManager.gameState?["stage"] as? String == "runItTwicePrompt" {
                VStack(spacing: 20) {
                    Text("Run It Twice?").font(.title).foregroundColor(.white).bold()
                    
                    let turnStartTimeSec = (socketManager.gameState?["turnStartTime"] as? Double ?? 0) / 1000.0
                    let turnTimeLimitSec = 10.0 // Hardcoded to 10s to match backend RIT logic
                    let timeRemaining = max(0, turnTimeLimitSec - (currentTime - turnStartTimeSec))
                    
                    if turnStartTimeSec > 0 {
                        ProgressView(value: timeRemaining, total: turnTimeLimitSec)
                            .progressViewStyle(LinearProgressViewStyle(tint: timeRemaining < 3 ? .red : .green))
                            .padding(.horizontal, 20)
                    }
                    
                    let players = socketManager.gameState?["players"] as? [[String: Any]] ?? []
                    let me = players.first(where: { ($0["name"] as? String) == socketManager.localPlayerName })
                    let status = me?["status"] as? String ?? ""
                    let isEligible = status == "active" || status == "all-in"
                    let ritVotes = socketManager.gameState?["ritVotes"] as? [String: Any] ?? [:]
                    let myId = me?["id"] as? String ?? ""
                    let hasVoted = ritVotes[myId] != nil

                    if isEligible && !hasVoted {
                        HStack(spacing: 30) {
                            Button("Yes") {
                                socketManager.sendRitVote(vote: true)
                            }
                            .padding()
                            .frame(width: 100)
                            .background(Color.green)
                            .foregroundColor(.white)
                            .cornerRadius(10)
                            
                            Button("No") {
                                socketManager.sendRitVote(vote: false)
                            }
                            .padding()
                            .frame(width: 100)
                            .background(Color.red)
                            .foregroundColor(.white)
                            .cornerRadius(10)
                        }
                    } else {
                        Text("Waiting for players...").foregroundColor(.white)
                    }
                }
                .padding(24)
                .background(Color.black.opacity(0.85))
                .cornerRadius(16)
                .shadow(radius: 10)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
            }
        } // End of outer ZStack
        .navigationBarHidden(true)
        .edgesIgnoringSafeArea(.bottom)
        .sheet(isPresented: $showHostSettings) {
            NavigationView {
                Form {
                    Section(header: Text("Blinds")) {
                        HStack {
                            Text("Small Blind: \(Int(setSmallBlind))").frame(width: 120, alignment: .leading)
                            Slider(value: $setSmallBlind, in: 1...100, step: 1)
                        }
                        HStack {
                            Text("Big Blind: \(Int(setSmallBlind * 2))").frame(width: 120, alignment: .leading)
                                .foregroundColor(.secondary)
                            Spacer()
                        }
                    }
                    
                    Section(header: Text("Table Limits")) {
                        HStack {
                            Text("Min Buy-In: \(Int(setMinBuyIn))").frame(width: 120, alignment: .leading)
                            Slider(value: $setMinBuyIn, in: 10...50000, step: 10)
                        }
                        HStack {
                            Text("Max Buy-In: \(Int(setMaxBuyIn))").frame(width: 120, alignment: .leading)
                            Slider(value: $setMaxBuyIn, in: 10...50000, step: 10)
                        }
                        HStack {
                            Text("Turn Timer: \(Int(setTurnTimeLimit))s").frame(width: 120, alignment: .leading)
                            Slider(value: $setTurnTimeLimit, in: 10...120, step: 5)
                        }
                    }
                    
                    Section(header: Text("Table Status")) {
                        let isPaused = socketManager.roomState?["isPaused"] as? Bool ?? false
                        Button(action: {
                            socketManager.togglePauseRoom()
                            showHostSettings = false
                        }) {
                            Text(isPaused ? "Resume Table" : "Pause Table")
                                .foregroundColor(isPaused ? .green : .red)
                        }
                    }
                    
                    Section(footer: Text("Changes will take effect at the start of the next hand.")) {
                        Button("Save Settings") {
                            let newSettings: [String: Any] = [
                                "smallBlind": Int(setSmallBlind),
                                "bigBlind": Int(setSmallBlind) * 2,
                                "minBuyIn": Int(setMinBuyIn),
                                "maxBuyIn": max(Int(setMinBuyIn), Int(setMaxBuyIn)),
                                "turnTimeLimit": Int(setTurnTimeLimit)
                            ]
                            socketManager.updateSettings(settings: newSettings)
                            showHostSettings = false
                        }
                        .frame(maxWidth: .infinity, alignment: .center)
                        .foregroundColor(.blue)
                    }
                }
                .navigationTitle("Host Settings")
                .navigationBarItems(trailing: Button("Done") { showHostSettings = false })
            }
        }
        .onReceive(socketManager.$gameState) { newState in
            // Only sync from server if user hasn't toggled recently (prevents rubber-banding)
            if Date().timeIntervalSince(lastToggleTime) > 1.0 {
                if let players = newState?["players"] as? [[String: Any]],
                   let me = players.first(where: { ($0["name"] as? String) == socketManager.localPlayerName }),
                   let serverSitOut = me["isSittingOut"] as? Bool {
                   if isSittingOut != serverSitOut {
                       isSittingOut = serverSitOut
                   }
                }
            }
        }
    }
    
    private func getElapsedTime() -> String {
        guard let roomState = socketManager.roomState,
              let createdAt = roomState["createdAt"] as? Double else { return "00:00" }
        let elapsed = currentTime - (createdAt / 1000.0)
        if elapsed < 0 { return "00:00" }
        let hours = Int(elapsed) / 3600
        let minutes = (Int(elapsed) % 3600) / 60
        let seconds = Int(elapsed) % 60
        if hours > 0 {
            return String(format: "%02d:%02d:%02d", hours, minutes, seconds)
        }
        return String(format: "%02d:%02d", minutes, seconds)
    }
    
    private func getTimeRemaining() -> String? {
        guard let roomState = socketManager.roomState,
              let expiresAt = roomState["expiresAt"] as? Double else { return nil }
        let remaining = (expiresAt / 1000.0) - currentTime
        if remaining <= 0 { return "Expired" }
        let hours = Int(remaining) / 3600
        let minutes = (Int(remaining) % 3600) / 60
        let seconds = Int(remaining) % 60
        if hours > 0 {
            return String(format: "%02dh %02dm %02ds", hours, minutes, seconds)
        }
        return String(format: "%02dm %02ds", minutes, seconds)
    }
}

// Subcomponents

struct PlayerNodeView: View {
    let name: String
    let avatar: String?
    let chips: Int
    let status: String
    let isTurn: Bool
    let isMe: Bool
    let isDealer: Bool
    let isSB: Bool
    let isBB: Bool
    let turnStartTime: Double
    let turnTimeLimit: Double
    let currentTime: Double
    let revealedHand: [String]?
    
    var body: some View {
        VStack(spacing: 4) {
            ZStack {
                // Outer ring for turn timer
                if isTurn && turnStartTime > 0 && (status == "active" || status == "all-in") {
                    let timeRemaining = max(0, turnTimeLimit - (currentTime - turnStartTime))
                    let progress = timeRemaining / turnTimeLimit
                    let color = timeRemaining > 10 ? Color.green : (timeRemaining > 5 ? Color.yellow : Color.red)
                    
                    Circle()
                        .stroke(Color.gray.opacity(0.3), lineWidth: 4)
                        .frame(width: 72, height: 72)
                    
                    Circle()
                        .trim(from: 0, to: CGFloat(progress))
                        .stroke(color, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                        .frame(width: 72, height: 72)
                        .rotationEffect(.degrees(-90))
                        .animation(.linear(duration: 0.5), value: progress)
                }
                
                // Avatar image
                if let avatar = avatar, UIImage(named: avatar) != nil {
                    Image(avatar)
                        .resizable()
                        .scaledToFill()
                        .frame(width: 64, height: 64)
                        .clipShape(Circle())
                        .opacity(status == "folded" ? 0.5 : 1.0)
                } else if let avatar = avatar {
                    Text(avatar)
                        .font(.system(size: 44))
                        .frame(width: 64, height: 64)
                        .background(Circle().fill(Color.black.opacity(0.6)))
                        .opacity(status == "folded" ? 0.5 : 1.0)
                } else {
                    Image(systemName: "person.crop.circle.fill")
                        .resizable()
                        .frame(width: 64, height: 64)
                        .foregroundColor(status == "folded" ? Color.gray : Color.white)
                        .background(Circle().fill(Color.black.opacity(0.6)))
                }
                
                // Dim overlay for folded/eliminated
                if status == "folded" || status == "eliminated" {
                    Circle()
                        .fill(Color.black.opacity(0.4))
                        .frame(width: 64, height: 64)
                }
                
                // Badges (D, SB, BB)
                HStack(spacing: 2) {
                    if isDealer {
                        Text("D")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(.black)
                            .frame(width: 16, height: 16)
                            .background(Color.white)
                            .clipShape(Circle())
                            .overlay(Circle().stroke(Color.black, lineWidth: 1))
                    }
                    if isSB {
                        Text("SB")
                            .font(.system(size: 8, weight: .bold))
                            .foregroundColor(.white)
                            .frame(width: 16, height: 16)
                            .background(Color.blue)
                            .clipShape(Circle())
                    } else if isBB {
                        Text("BB")
                            .font(.system(size: 8, weight: .bold))
                            .foregroundColor(.white)
                            .frame(width: 16, height: 16)
                            .background(Color.purple)
                            .clipShape(Circle())
                    }
                }
                .offset(x: 24, y: -26)
                
                // Status overlay (FOLD, ALL-IN, AWAY, OUT)
                if status == "eliminated" || status == "sitting_out" || status == "all-in" || status == "folded" {
                    let text = status == "eliminated" ? "OUT" : (status == "sitting_out" ? "AWAY" : (status == "all-in" ? "ALL-IN" : "FOLD"))
                    let color = status == "all-in" ? Color.red : Color.black.opacity(0.8)
                    Text(text)
                        .font(.system(size: 8, weight: .black))
                        .foregroundColor(.white)
                        .padding(.horizontal, 4)
                        .padding(.vertical, 2)
                        .background(color)
                        .cornerRadius(4)
                        .offset(y: 14)
                }
            }
            
            // Name and Chips Pill
            VStack(spacing: 0) {
                Text(name)
                    .font(.system(size: 11, weight: isMe ? .bold : .medium))
                    .foregroundColor(.white)
                    .lineLimit(1)
                Text("$\(chips)")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.yellow)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Color.black.opacity(0.6))
            .cornerRadius(10)
            
            if let hand = revealedHand, !hand.isEmpty {
                HStack(spacing: 2) {
                    ForEach(hand, id: \.self) { cardStr in
                        MiniCardView(card: cardStr)
                    }
                }
                .padding(.top, 2)
            }
        }
        .shadow(radius: isTurn ? 4 : 2)
        .opacity((status == "folded" || status == "eliminated" || status == "sitting_out") ? 0.6 : 1.0)
    }
}

struct BetNodeView: View {
    let bet: Int
    
    var body: some View {
        if bet > 0 {
            HStack(spacing: 4) {
                Image(systemName: "circle.circle.fill")
                    .foregroundColor(.yellow)
                    .shadow(radius: 1)
                Text("\(bet)")
                    .font(.caption)
                    .bold()
                    .foregroundColor(.white)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Color.black.opacity(0.7))
            .cornerRadius(10)
        } else {
            EmptyView()
        }
    }
}

struct CardView: View {
    let card: String
    var scale: CGFloat = 1.0
    
    var rank: String {
        return String(card.prefix(1))
    }
    
    var suitSymbol: String {
        if card.contains("h") { return "♥" }
        if card.contains("d") { return "♦" }
        if card.contains("s") { return "♠" }
        if card.contains("c") { return "♣" }
        return ""
    }
    
    var body: some View {
        Text("\(rank)\(suitSymbol)")
            .font(scale < 1.0 ? .caption : .title2)
            .fontWeight(.semibold)
            .frame(width: 45 * scale, height: 65 * scale)
            .background(Color.white)
            .foregroundColor(card.contains("h") || card.contains("d") ? .red : .black)
            .cornerRadius(6 * scale)
            .overlay(RoundedRectangle(cornerRadius: 6 * scale).stroke(Color.black, lineWidth: 1))
            .shadow(radius: 2 * scale)
    }
}

struct MiniCardView: View {
    let card: String
    
    private var rank: String { String(card.prefix(card.count - 1)) }
    private var suitSymbol: String {
        if card.contains("h") { return "♥" }
        if card.contains("d") { return "♦" }
        if card.contains("s") { return "♠" }
        if card.contains("c") { return "♣" }
        return ""
    }
    
    var body: some View {
        Text("\(rank)\(suitSymbol)")
            .font(.system(size: 10, weight: .bold))
            .frame(width: 20, height: 28)
            .background(Color.white)
            .foregroundColor(card.contains("h") || card.contains("d") ? .red : .black)
            .cornerRadius(3)
            .overlay(RoundedRectangle(cornerRadius: 3).stroke(Color.black, lineWidth: 1))
    }
}

struct ActionButtonStyle: ButtonStyle {
    let color: Color
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity)
            .background(color)
            .foregroundColor(.white)
            .font(.subheadline.bold())
            .cornerRadius(10)
            .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
            .shadow(radius: configuration.isPressed ? 1 : 3)
    }
}

struct ShortcutButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 12, weight: .bold))
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 6)
            .background(Color.gray.opacity(0.5))
            .cornerRadius(6)
            .opacity(configuration.isPressed ? 0.7 : 1.0)
            .shadow(radius: configuration.isPressed ? 1 : 3)
    }
}
