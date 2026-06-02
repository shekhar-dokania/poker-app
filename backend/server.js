const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const RoomManager = require('./RoomManager');
const ClubManager = require('./ClubManager');

const app = express();
app.use(cors());
app.use(express.json()); // Added for body parsing

const { authRouter, JWT_SECRET } = require('./auth');
const jwt = require('jsonwebtoken');

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const roomManager = new RoomManager(io);
const clubManager = new ClubManager(io);

app.use((req, res, next) => {
    req.roomManager = roomManager;
    next();
});
app.use('/auth', authRouter);

io.use((socket, next) => {
    let token = socket.handshake.auth?.token;
    if (!token) {
        // Try getting it from connection string params (iOS SocketManager connectParams)
        token = socket.handshake.query?.token;
    }
    
    if (token) {
        jwt.verify(token, JWT_SECRET, (err, decoded) => {
            if (err) return next(new Error('Authentication error'));
            socket.user = decoded;
            next();
        });
    } else {
        next(new Error('Authentication error'));
    }
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.user.username} (socket: ${socket.id})`);

  socket.on('createRoom', async (data, callback) => {
     try {
        const { gameType, settings, clubId } = data;
        const roomCode = await roomManager.createRoom(socket.user, gameType, settings, socket, clubId);
        callback({ success: true, roomCode });
     } catch (error) {
      console.error("createRoom error:", error);
      callback({ success: false, message: error.message });
    }
  });

  socket.on('joinRoom', async (data, callback) => {
    try {
      const roomInfo = await roomManager.joinRoom(data.roomCode, socket.user, socket);
      const isHost = roomInfo.host === socket.user.userId;
      callback({ success: true, roomInfo, isHost });
    } catch (error) {
      callback({ success: false, message: error.message });
    }
  });

  socket.on('getMyRooms', async () => {
    console.log(`[EVENT] getMyRooms called for user ${socket.user.userId}`);
    try {
      const activeRooms = await roomManager.getUserRooms(socket.user.userId);
      console.log(`[DB] activeRooms for ${socket.user.userId}:`, activeRooms.length);
      socket.emit('myRoomsResponse', { success: true, rooms: activeRooms });
    } catch (error) {
      console.error('getMyRooms error:', error);
      socket.emit('myRoomsResponse', { success: false, message: error.message });
    }
  });

  socket.on('getPastGames', async () => {
    console.log(`[EVENT] getPastGames called for user ${socket.user.userId}`);
    try {
      const pastGames = await roomManager.getPastGames(socket.user.userId);
      console.log(`[DB] pastGames for ${socket.user.userId}:`, pastGames.length);
      socket.emit('pastGamesResponse', { success: true, pastGames });
    } catch (error) {
      console.error('getPastGames error:', error);
      socket.emit('pastGamesResponse', { success: false, message: error.message });
    }
  });

  socket.on('getHandHistory', async (callback) => {
    try {
      const roomCode = await roomManager.getSocketRoom(socket.id);
      if (!roomCode) throw new Error("Not in a room");
      const history = await roomManager.getHandHistory(roomCode);
      callback({ success: true, history });
    } catch (error) {
      callback({ success: false, message: error.message });
    }
  });

  // --- CLUB ENDPOINTS ---
  socket.on('createClub', async (data, callback) => {
     try {
         const club = await clubManager.createClub(socket.user, data.name);
         callback({ success: true, club });
     } catch (error) {
         callback({ success: false, message: error.message });
     }
  });

  socket.on('requestJoinClub', async (data, callback) => {
     try {
         const result = await clubManager.requestJoinClub(socket.user, data.code);
         callback(result);
     } catch (error) {
         callback({ success: false, message: error.message });
     }
  });

  socket.on('resolveClubRequest', async (data, callback) => {
     try {
         const result = await clubManager.resolveJoinRequest(socket.user, data.memberId, data.status);
         callback(result);
     } catch (error) {
         callback({ success: false, message: error.message });
     }
  });

  socket.on('removeClubMember', async (data, callback) => {
     try {
         const result = await clubManager.removeClubMember(socket.user, data.memberId);
         callback(result);
     } catch (error) {
         callback({ success: false, message: error.message });
     }
  });

  socket.on('getMyClubs', async (callback) => {
      try {
          const clubs = await clubManager.getUserClubs(socket.user.userId);
          callback({ success: true, clubs });
      } catch (error) {
          callback({ success: false, message: error.message });
      }
  });

  socket.on('getClubDetails', async (data, callback) => {
      try {
          const details = await clubManager.getClubDetails(socket.user.userId, data.clubId);
          callback({ success: true, details });
      } catch (error) {
          callback({ success: false, message: error.message });
      }
  });
  // ----------------------
  
  socket.on('action', async (data) => {
     await roomManager.handleAction(socket.id, data);
  });

  socket.on('voteRunItTwice', async (vote) => {
     await roomManager.handleRitVote(socket.id, vote);
  });

  socket.on('setSittingOut', async (isSittingOut) => {
     await roomManager.handleSitOut(socket.id, isSittingOut);
  });

  socket.on('sitAtTable', async (chips) => {
     await roomManager.handleSitAtTable(socket.id, chips);
  });

  socket.on('standUp', async () => {
     await roomManager.handleStandUp(socket.id);
  });

  socket.on('reloadChips', async (amount) => {
     await roomManager.handleReloadChips(socket.id, amount);
  });

  socket.on('updateSettings', async (settings) => {
     await roomManager.updateSettings(socket.id, settings);
  });

  socket.on('requestEndTable', async () => {
     await roomManager.requestEndTable(socket.id);
  });

  socket.on('startGame', async (data, callback) => {
     try {
        await roomManager.startGame(socket.id);
        if (callback) callback({ success: true });
     } catch (error) {
        if (callback) callback({ success: false, message: error.message });
     }
  });

  socket.on('disconnect', async () => {
    console.log(`User disconnected: ${socket.user.username}`);
    await roomManager.handleDisconnect(socket);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

// --- FAULT TOLERANCE & GRACEFUL SHUTDOWN ---

let isShuttingDown = false;
const handleShutdown = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log('Graceful shutdown initiated...');
    
    // Stop accepting new connections
    server.close();
    io.emit('serverShutdownWarning', { message: 'Server is restarting. Hands will finish, then games will pause.' });
    
    await roomManager.shutdown();
    console.log('Shutdown complete.');
    process.exit(0);
};

process.on('SIGTERM', handleShutdown);
process.on('SIGINT', handleShutdown);

process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
    handleShutdown();
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED REJECTION:', reason);
});
