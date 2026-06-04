import Foundation
import Combine
import SwiftUI
import SocketIO

class PokerSocketManager: ObservableObject {
    static let shared = PokerSocketManager()
    
    private var manager: SocketManager!
    private var socket: SocketIOClient!
    
    @Published var isConnected = false
    @Published var currentRoom: String? = nil
    @Published var roomState: [String: Any]? = nil
    @Published var gameState: [String: Any]? = nil
    @Published var privateHand: [String]? = nil
    @Published var isHost: Bool = false
    @Published var roomSettings: [String: Any]? = nil
    @Published var finalBalances: [[String: Any]]? = nil
    @Published var myRooms: [[String: Any]] = []
    @Published var handHistory: [[String: Any]] = []
    @Published var pastGames: [[String: Any]] = []
    @Published var myClubs: [[String: Any]] = []
    
    var myId: String? {
        return socket.manager?.defaultSocket.sid
    }
    
    init() {
        // Initialization handled in connectWithToken
    }
    
    func connectWithToken(token: String) {
        guard let url = URL(string: AppConfig.serverURL) else { return }
        
        manager = SocketManager(socketURL: url, config: [.log(true), .compress, .connectParams(["token": token])])
        socket = manager.defaultSocket
        
        setupEventHandlers()
        socket.connect()
    }
    
    func disconnect() {
        if socket != nil {
            socket.disconnect()
        }
        isConnected = false
        currentRoom = nil
        myRooms = []
        roomState = nil
        gameState = nil
        privateHand = nil
        finalBalances = nil
    }
    
    private func setupEventHandlers() {
        socket.on(clientEvent: .connect) { [weak self] data, ack in
            self?.isConnected = true
            print("Socket connected")
            self?.fetchMyRooms()
            self?.fetchPastGames()
            self?.fetchMyClubs()
            
            // Rejoin current room if recovering from a background/disconnect state
            if let currentRoom = self?.currentRoom, let localPlayerName = self?.localPlayerName {
                self?.joinRoom(roomCode: currentRoom, playerName: localPlayerName)
            }
        }
        
        socket.on(clientEvent: .disconnect) { [weak self] data, ack in
            self?.isConnected = false
            print("Socket disconnected")
        }
        
        socket.on("roomUpdated") { [weak self] data, ack in
            if let state = data[0] as? [String: Any] {
                DispatchQueue.main.async {
                    self?.roomState = state
                    self?.roomSettings = state["settings"] as? [String: Any]
                }
            }
        }
        
        socket.on("gameState") { [weak self] data, ack in
            if let state = data[0] as? [String: Any] {
                DispatchQueue.main.async {
                    self?.gameState = state
                }
            }
        }
        
        socket.on("privateHand") { [weak self] data, ack in
            if let hand = data[0] as? [String] {
                DispatchQueue.main.async {
                    self?.privateHand = hand
                }
            }
        }
        
        socket.on("tableEnded") { [weak self] data, ack in
            if let balances = data[0] as? [[String: Any]] {
                DispatchQueue.main.async {
                    self?.finalBalances = balances
                }
            }
        }
        
        socket.on("myRoomsResponse") { [weak self] data, ack in
            print("myRoomsResponse received: \(data)")
            if let response = data.first as? [String: Any] {
                print("myRoomsResponse parsed as dict")
                if let success = response["success"] as? Bool, success {
                    print("myRoomsResponse success is true")
                    if let rooms = response["rooms"] as? [[String: Any]] {
                        print("myRoomsResponse extracted rooms: \(rooms.count)")
                        DispatchQueue.main.async {
                            self?.myRooms = rooms
                        }
                    } else {
                        print("myRoomsResponse failed to cast rooms array")
                    }
                }
            }
        }
        
        socket.on("pastGamesResponse") { [weak self] data, ack in
            print("pastGamesResponse received: \(data)")
            if let response = data.first as? [String: Any] {
                print("pastGamesResponse parsed as dict")
                if let success = response["success"] as? Bool, success {
                    print("pastGamesResponse success is true")
                    if let games = response["pastGames"] as? [[String: Any]] {
                        print("pastGamesResponse extracted games: \(games.count)")
                        DispatchQueue.main.async {
                            self?.pastGames = games
                        }
                    } else {
                        print("pastGamesResponse failed to cast games array")
                    }
                }
            }
        }
    }
    
    @Published var localPlayerName: String? = nil
    
    func createRoom(hostName: String, gameType: String, settings: [String: Any], clubId: String? = nil) {
        localPlayerName = hostName
        var data: [String: Any] = ["playerName": hostName, "gameType": gameType, "settings": settings]
        if let clubId = clubId {
            data["clubId"] = clubId
        }
        
        socket.emitWithAck("createRoom", data).timingOut(after: 2) { data in
            if let response = data.first as? [String: Any],
               let success = response["success"] as? Bool,
               success,
               let roomCode = response["roomCode"] as? String {
                DispatchQueue.main.async {
                    self.currentRoom = roomCode
                    self.isHost = true
                    AuthManager.shared.fetchMe() // Refresh coins
                }
            }
        }
    }
    
    func extendRoomTime(additionalHours: Int) {
        guard let code = currentRoom else { return }
        let data: [String: Any] = ["roomCode": code, "additionalHours": additionalHours]
        socket.emitWithAck("extendRoomTime", data).timingOut(after: 2) { data in
            if let response = data.first as? [String: Any],
               let success = response["success"] as? Bool,
               success {
                AuthManager.shared.fetchMe() // Refresh coins
            } else {
                let msg = (data.first as? [String: Any])?["message"] as? String ?? "Failed"
                print("Extend room time failed: \(msg)")
            }
        }
    }
    
    func joinRoom(roomCode: String, playerName: String) {
        localPlayerName = playerName
        socket.emitWithAck("joinRoom", ["roomCode": roomCode, "playerName": playerName]).timingOut(after: 2) { data in
            if let response = data.first as? [String: Any],
               let success = response["success"] as? Bool,
               success {
                DispatchQueue.main.async {
                    self.currentRoom = roomCode
                    self.isHost = response["isHost"] as? Bool ?? false
                }
            } else {
                print("Failed to join room")
            }
        }
    }
    
    func fetchMyRooms() {
        socket.emit("getMyRooms")
    }
    
    func fetchHandHistory() {
        socket.emitWithAck("getHandHistory").timingOut(after: 5) { data in
            if let response = data.first as? [String: Any],
               let success = response["success"] as? Bool,
               success,
               let history = response["history"] as? [[String: Any]] {
                DispatchQueue.main.async {
                    self.handHistory = history
                }
            }
        }
    }
    
    func fetchPastGames() {
        socket.emit("getPastGames")
    }
    
    func sendAction(action: String, amount: Int = 0) {
        socket.emit("action", ["action": action, "amount": amount])
    }
    
    func sendRitVote(vote: Bool) {
        socket.emit("voteRunItTwice", vote)
    }
    
    func startGame() {
        socket.emitWithAck("startGame", [:]).timingOut(after: 2) { data in
            if let response = data.first as? [String: Any],
               let success = response["success"] as? Bool,
               success {
                print("Game started successfully")
            } else {
                print("Failed to start game")
            }
        }
    }
    
    func sendSitOut(isSittingOut: Bool) {
        socket.emit("setSittingOut", isSittingOut)
    }
    
    func sitAtTable(chips: Int) {
        socket.emit("sitAtTable", chips)
    }
    
    func standUp() {
        socket.emit("standUp")
    }
    
    func reloadChips(amount: Int) {
        socket.emit("reloadChips", amount)
    }
    
    func updateSettings(settings: [String: Any]) {
        socket.emit("updateSettings", settings)
    }
    
    func requestEndTable() {
        socket.emit("requestEndTable")
    }

    // MARK: - Club Methods

    func fetchMyClubs() {
        socket.emitWithAck("getMyClubs").timingOut(after: 5) { data in
            if let response = data.first as? [String: Any],
               let success = response["success"] as? Bool, success,
               let clubs = response["clubs"] as? [[String: Any]] {
                DispatchQueue.main.async {
                    self.myClubs = clubs
                }
            }
        }
    }

    func createClub(name: String, completion: @escaping (Bool, String?) -> Void) {
        socket.emitWithAck("createClub", ["name": name]).timingOut(after: 5) { data in
            if let response = data.first as? [String: Any], let success = response["success"] as? Bool {
                if success {
                    self.fetchMyClubs()
                    completion(true, nil)
                } else {
                    completion(false, response["message"] as? String)
                }
            } else {
                completion(false, "Timeout")
            }
        }
    }

    func requestJoinClub(code: String, completion: @escaping (Bool, String?) -> Void) {
        socket.emitWithAck("requestJoinClub", ["code": code]).timingOut(after: 5) { data in
            if let response = data.first as? [String: Any], let success = response["success"] as? Bool {
                if success {
                    completion(true, response["message"] as? String)
                } else {
                    completion(false, response["message"] as? String)
                }
            } else {
                completion(false, "Timeout")
            }
        }
    }

    func resolveClubRequest(memberId: String, status: String, completion: @escaping (Bool) -> Void) {
        let data: [String: Any] = ["memberId": memberId, "status": status]
        socket.emitWithAck("resolveClubRequest", data).timingOut(after: 2) { data in
            if let response = data.first as? [String: Any], let success = response["success"] as? Bool, success {
                completion(true)
            } else {
                completion(false)
            }
        }
    }
    
    func removeClubMember(memberId: String, completion: @escaping (Bool) -> Void) {
        let data: [String: Any] = ["memberId": memberId]
        socket.emitWithAck("removeClubMember", data).timingOut(after: 2) { data in
            if let response = data.first as? [String: Any], let success = response["success"] as? Bool, success {
                completion(true)
            } else {
                completion(false)
            }
        }
    }

    func fetchClubDetails(clubId: String, completion: @escaping ([String: Any]?) -> Void) {
        socket.emitWithAck("getClubDetails", ["clubId": clubId]).timingOut(after: 5) { data in
            if let response = data.first as? [String: Any],
               let success = response["success"] as? Bool, success,
               let details = response["details"] as? [String: Any] {
                completion(details)
            } else {
                completion(nil)
            }
        }
    }
}
