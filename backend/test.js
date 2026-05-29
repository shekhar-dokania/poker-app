const { io } = require("socket.io-client");
const http = require('http');

function makePostRequest(path, data) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(data);
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
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

async function run() {
    const username = `Tester_${Math.floor(Math.random()*1000)}`;
    const auth = await makePostRequest('/auth/register', { username, password: 'password123' });
    const token = auth.token;

    const socket = io("http://localhost:3000", { auth: { token } });

    socket.on("connect", () => {
        console.log("Connected!");
        
        socket.emit("createClub", { name: "Test Club" }, (res) => {
            if (!res.success) return console.error("Club creation failed", res);
            const clubId = res.club.id;
            console.log("Created club with ID:", clubId);
            
            const settings = { smallBlind: 1, bigBlind: 2, minBuyIn: 100, maxBuyIn: 1000 };
            socket.emit("createRoom", { playerName: username, gameType: "holdem", settings, clubId }, (roomRes) => {
                console.log("Create room response:", roomRes);
                process.exit(0);
            });
        });
    });
}

run();
