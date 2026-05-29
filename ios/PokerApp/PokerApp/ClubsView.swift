import SwiftUI

struct ClubsView: View {
    @ObservedObject private var socketManager = PokerSocketManager.shared
    @State private var showingCreateModal = false
    @State private var showingJoinModal = false
    @State private var newClubName = ""
    @State private var joinClubCode = ""
    @State private var alertMessage = ""
    @State private var showingAlert = false
    
    var body: some View {
        NavigationView {
            VStack {
                if socketManager.myClubs.isEmpty {
                    Spacer()
                    VStack(spacing: 20) {
                        Image(systemName: "person.3.fill")
                            .font(.system(size: 60))
                            .foregroundColor(.secondary)
                        Text("You aren't in any clubs yet.")
                            .font(.headline)
                            .foregroundColor(.secondary)
                    }
                    Spacer()
                } else {
                    List(socketManager.myClubs, id: \.description) { club in
                        if let clubId = club["id"] as? String,
                           let name = club["name"] as? String,
                           let role = club["role"] as? String,
                           let count = club["memberCount"] as? Int {
                            
                            NavigationLink(destination: ClubDetailsView(clubId: clubId, clubName: name)) {
                                VStack(alignment: .leading, spacing: 5) {
                                    Text(name).font(.headline)
                                    HStack {
                                        Text(role).font(.caption).foregroundColor(.blue).bold()
                                        Text("• \(count) members").font(.caption).foregroundColor(.secondary)
                                    }
                                }
                                .padding(.vertical, 5)
                            }
                        }
                    }
                }
                
                HStack(spacing: 20) {
                    Button(action: { showingCreateModal = true }) {
                        Text("Create Club")
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color.blue)
                            .foregroundColor(.white)
                            .cornerRadius(10)
                    }
                    
                    Button(action: { showingJoinModal = true }) {
                        Text("Join Club")
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color.green)
                            .foregroundColor(.white)
                            .cornerRadius(10)
                    }
                }
                .padding()
            }
            .navigationTitle("My Clubs")
            .onAppear {
                socketManager.fetchMyClubs()
            }
            .alert(isPresented: $showingAlert) {
                Alert(title: Text("Notice"), message: Text(alertMessage), dismissButton: .default(Text("OK")))
            }
            .sheet(isPresented: $showingCreateModal) {
                VStack(spacing: 20) {
                    Text("Create New Club").font(.title).bold()
                    TextField("Club Name", text: $newClubName)
                        .textFieldStyle(RoundedBorderTextFieldStyle())
                        .padding(.bottom, 10)
                    
                    Button(action: {
                        if !newClubName.isEmpty {
                            socketManager.createClub(name: newClubName) { success, msg in
                                if let msg = msg { alertMessage = msg; showingAlert = true }
                                if success { 
                                    showingCreateModal = false 
                                    newClubName = ""
                                }
                            }
                        }
                    }) {
                        Text("Create")
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color.blue)
                            .foregroundColor(.white)
                            .cornerRadius(10)
                    }
                    
                    Button("Cancel") { showingCreateModal = false }
                        .foregroundColor(.red)
                }
                .padding(30)
            }
            .sheet(isPresented: $showingJoinModal) {
                VStack(spacing: 20) {
                    Text("Join a Club").font(.title).bold()
                    TextField("Enter 6-digit Code", text: $joinClubCode)
                        .textFieldStyle(RoundedBorderTextFieldStyle())
                        .autocapitalization(.allCharacters)
                        .padding(.bottom, 10)
                    
                    Button(action: {
                        if !joinClubCode.isEmpty {
                            socketManager.requestJoinClub(code: joinClubCode.uppercased()) { success, msg in
                                if let msg = msg { alertMessage = msg; showingAlert = true }
                                if success { 
                                    showingJoinModal = false 
                                    joinClubCode = ""
                                }
                            }
                        }
                    }) {
                        Text("Request to Join")
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color.green)
                            .foregroundColor(.white)
                            .cornerRadius(10)
                    }
                    
                    Button("Cancel") { showingJoinModal = false }
                        .foregroundColor(.red)
                }
                .padding(30)
            }
        }
    }
}
