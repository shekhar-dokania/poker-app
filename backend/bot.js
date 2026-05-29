const { io } = require("socket.io-client");
const readline = require('readline');
const http = require('http');

const args = process.argv.slice(2);
const botName = args[0] || `Bot_${Math.floor(Math.random() * 1000)}`;
let currentRoomCode = null;

function makePostRequest(path, data) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(data);
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        };
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(JSON.parse(body)));
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

async function startBot() {
    console.log(`Authenticating bot as ${botName}...`);
    
    let token;
    let authRes = await makePostRequest('/auth/register', { username: botName, password: 'password123' });
    
    if (authRes.token) {
        token = authRes.token;
    } else {
        authRes = await makePostRequest('/auth/login', { username: botName, password: 'password123' });
        token = authRes.token;
    }
    
    if (!token) {
        console.error("Failed to authenticate bot!", authRes);
        process.exit(1);
    }
    
    const socket = io("http://localhost:3000", {
        auth: { token: token }
    });

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    socket.on("connect", () => {
        console.log(`Bot connected!`);
        promptAction();
    });

    socket.on("connect_error", (err) => {
        console.log("Connection error:", err.message);
    });

    socket.on("gameState", (state) => {
        console.log(`\n--- GAME STATE: ${state.stage.toUpperCase()} ---`);
        console.log(`Pot: ${state.pot} | Community Cards: ${state.communityCards.join(", ") || "None"}`);
        if (state.winnerInfo) {
            console.log(`WINNER: ${state.winnerInfo.winners.join(", ")} (${state.winnerInfo.description})`);
        }
        
        const activePlayers = state.players.filter(p => p.status === 'active');
        // socket.id might not match player.id anymore since player.id is Postgres User ID!
        // We need to check socketId or username
        const myPlayer = state.players.find(p => p.name === botName);
        if (myPlayer && activePlayers.length > 0 && state.players[state.currentTurn].name === botName && state.stage !== 'showdown') {
            console.log(`\n>>> IT IS YOUR TURN! (Current Bet: ${myPlayer.currentBet} / Highest: ${state.currentHighestBet}) <<<`);
        }
    });

    socket.on("privateHand", (hand) => {
        console.log(`\n[Your Hand]: ${hand.join(", ")}`);
    });

    socket.on("disconnect", () => {
        console.log("Bot disconnected");
        process.exit(0);
    });

    function promptAction() {
        rl.question('Enter action (join <room_code>, join-club <club_code>, fold, check, call, raise <amount>): ', (input) => {
            const parts = input.trim().split(" ");
            const action = parts[0].toLowerCase();
            const amount = parts.length > 1 ? parseInt(parts[1]) : 0;
            const arg = parts.length > 1 ? parts[1] : "";
            
            if (action === "join") {
                currentRoomCode = arg;
                socket.emit("joinRoom", { roomCode: currentRoomCode }, (response) => {
                    if (response.success) {
                        console.log(`Successfully joined room: ${currentRoomCode}`);
                        socket.emit("sitAtTable", 1000);
                        console.log("Bot automatically sat at the table with 1000 chips.");
                    } else {
                        console.log(`Failed to join room: ${response.message}`);
                    }
                    promptAction();
                });
                return; // Wait for callback
            } else if (action === "join-club") {
                socket.emit("requestJoinClub", { code: arg }, (response) => {
                    if (response.success) {
                        console.log(`Successfully sent join request to club: ${arg}`);
                    } else {
                        console.log(`Failed to join club: ${response.message}`);
                    }
                    promptAction();
                });
                return; // Wait for callback
            } else if (["fold", "check", "call", "raise"].includes(action)) {
                socket.emit("action", { action, amount });
            } else if (action !== "") {
                console.log("Invalid action.");
            }
            
            promptAction();
        });
    }
}

startBot();
