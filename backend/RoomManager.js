const crypto = require('crypto');
const PokerGame = require('./PokerGame');
const { PrismaClient } = require('@prisma/client');
const { createClient } = require('redis');
const { Mutex } = require('async-mutex');

const prisma = new PrismaClient();
const redis = createClient({
  url: process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL || 'redis://localhost:6379'
});
redis.on('error', err => console.log('Redis Client Error', err));
redis.connect().catch(console.error);

class RoomManager {
  constructor(io) {
    this.io = io;
    this.locks = new Map();
    this.isShuttingDown = false;
    this.timeoutInterval = setInterval(() => this.processTimeouts(), 1000);
  }

  getLock(roomCode) {
    if (!this.locks.has(roomCode)) {
      this.locks.set(roomCode, new Mutex());
    }
    return this.locks.get(roomCode);
  }

  async withRoomLock(socketIdOrRoomCode, bySocket, fn) {
      let roomCode = socketIdOrRoomCode;
      if (bySocket) {
          roomCode = await this.getSocketRoom(socketIdOrRoomCode);
      }
      if (!roomCode) return;
      
      const lock = this.getLock(roomCode);
      return await lock.runExclusive(async () => {
          const room = await this.getRoom(roomCode);
          if (room) {
              return await fn(room, roomCode);
          }
      });
  }

  async updateTurnTimer(room) {
      if (room.game.stage === 'waiting') return;
      let limit = room.game.settings.turnTimeLimit || 30;
      if (room.game.stage === 'handEnd') {
          const hasShowdown = room.game.isAllInShowdown || room.game.isRitShowdown || room.game.players.some(p => p.revealedHand && p.revealedHand.length > 0);
          limit = hasShowdown ? 8 : 3;
      } else {
          if (room.game.isAllInShowdown) limit = 2;
          if (room.game.isRitShowdown) limit = 2;
      }
      const expireTime = room.game.turnStartTime + (limit * 1000);
      await redis.zAdd('room_turn_timeouts', [{ score: expireTime, value: room.code }]);
  }

  async processTimeouts() {
      const now = Date.now();
      
      const roomsToBill = await redis.zRangeByScore('room_billing', 0, now);
      for (const roomCode of roomsToBill) {
          await this.withRoomLock(roomCode, false, async (room) => {
              if (!room) {
                  await redis.zRem('room_billing', roomCode);
                  return;
              }
              const hostId = room.host;
              
              const result = await prisma.user.updateMany({
                  where: { id: hostId, coins: { gt: 0 } },
                  data: { coins: { decrement: 1 } }
              });
              
              if (result.count > 0) {
                  // Successfully deducted 1 coin atomically
                  room.totalActiveTimeMs = (room.totalActiveTimeMs || 0) + 60000;
                  const updatedHost = await prisma.user.findUnique({ where: { id: hostId } });
                  this.io.to(`user_${hostId}`).emit('profileUpdated', { coins: updatedHost?.coins || 0 });
                  room.billingPartialMs = 0;
                  await redis.zAdd('room_billing', [{ score: now + 60000, value: roomCode }]);
                  await this.saveRoom(room);
              } else {
                  // Out of coins, pause the table
                  console.log(`Pausing room ${roomCode} - host out of coins`);
                  room.isPaused = true;
                  await this.saveRoom(room);
                  this.io.to(room.code).emit('roomUpdated', await this.getRoomState(room.code));
                  await redis.zRem('room_billing', roomCode);
              }
          });
      }

      const expiredRooms = await redis.zRangeByScore('room_turn_timeouts', 0, now);
      for (const roomCode of expiredRooms) {
          await this.withRoomLock(roomCode, false, async (room) => {
              if (room.game && room.game.stage !== 'waiting') {
                  let limit = room.game.settings.turnTimeLimit || 30;
                  if (room.game.stage === 'handEnd') {
                      const hasShowdown = room.game.isAllInShowdown || room.game.isRitShowdown || room.game.players.some(p => p.revealedHand && p.revealedHand.length > 0);
                      limit = hasShowdown ? 8 : 3;
                  } else {
                      if (room.game.isAllInShowdown) limit = 2;
                      if (room.game.isRitShowdown) limit = 2;
                  }
                  
                  const expireTime = room.game.turnStartTime + (limit * 1000);
                  
                  if (now >= expireTime) {
                      if (room.game.stage === 'handEnd') {
                          console.log(`Starting next hand in room ${room.code} after handEnd delay`);
                          await this.startNextHandInternal(room);
                      } else if (room.game.isAllInShowdown) {
                          console.log(`Advancing all-in showdown stage in room ${room.code}`);
                          room.game.advanceStage();
                          if (room.game.stage === 'handEnd') {
                              room.game.isAllInShowdown = false;
                              const history = await prisma.handHistory.create({
                                  data: { sessionId: room.sessionId, handData: room.game.toJSON() }
                              });
                              room.currentHandHistoryId = history.id;
                          }
                          await this.saveRoom(room);
                          this.io.to(room.code).emit('gameState', room.game.getGameState());
                          this.io.to(room.code).emit('roomUpdated', await this.getRoomState(room.code));
                          await this.updateTurnTimer(room);
                      } else if (room.game.isRitShowdown) {
                          console.log(`Advancing RIT showdown stage in room ${room.code}`);
                          room.game.advanceRitStage();
                          if (room.game.stage === 'handEnd') {
                              const history = await prisma.handHistory.create({
                                  data: { sessionId: room.sessionId, handData: room.game.toJSON() }
                              });
                              room.currentHandHistoryId = history.id;
                          }
                          await this.saveRoom(room);
                          this.io.to(room.code).emit('gameState', room.game.getGameState());
                          this.io.to(room.code).emit('roomUpdated', await this.getRoomState(room.code));
                          await this.updateTurnTimer(room);
                      } else if (room.game.stage === 'runItTwicePrompt') {
                          console.log(`Auto-declining RIT in room ${room.code} due to timeout`);
                          room.game.declineRunItTwice();
                          await this.saveRoom(room);
                          this.io.to(room.code).emit('gameState', room.game.getGameState());
                          this.io.to(room.code).emit('roomUpdated', await this.getRoomState(room.code));
                          await this.updateTurnTimer(room);
                          
                          if (room.game.stage === 'handEnd') {
                              const history = await prisma.handHistory.create({
                                  data: {
                                      sessionId: room.sessionId,
                                      handData: room.game.toJSON()
                                  }
                              });
                              room.currentHandHistoryId = history.id;
                              await this.saveRoom(room);
                          }
                      } else {
                          const player = room.game.players[room.game.currentTurn];
                          if (player && player.status === 'active') {
                              let action = 'fold';
                              if (player.currentBet === room.game.currentHighestBet) {
                                  action = 'check';
                              }
                              console.log(`Auto-acting ${action} for player ${player.name} in room ${room.code} due to timeout`);
                              await this.handleActionInternal(room, player.id, { action });
                          } else {
                              await this.updateTurnTimer(room);
                          }
                      }
                  } else {
                      await this.updateTurnTimer(room);
                  }
              } else {
                  await redis.zRem('room_turn_timeouts', room.code);
              }
          });
      }
  }

  async generateRoomCode() {
    let code;
    let exists;
    do {
      code = Math.random().toString(36).substring(2, 8).toUpperCase();
      exists = await redis.exists(`room:${code}`);
    } while (exists);
    return code;
  }

  async getRoom(roomCode) {
    const data = await redis.get(`room:${roomCode}`);
    if (!data) return null;
    const room = JSON.parse(data);
    if (room.game) {
        room.game = PokerGame.fromJSON(room.game);
    }
    return room;
  }

  async saveRoom(room) {
    await redis.set(`room:${room.code}`, JSON.stringify(room));
  }

  async setSocketRoom(socketId, roomCode) {
    await redis.set(`socket:${socketId}`, roomCode);
  }

  async getSocketRoom(socketId) {
    return await redis.get(`socket:${socketId}`);
  }

  async deleteSocketRoom(socketId) {
    await redis.del(`socket:${socketId}`);
  }
  
  async getPlayerBySocket(room, socketId) {
      return room.players.find(p => p.socketId === socketId);
  }

  async addUserRoom(userId, roomCode) {
      await redis.sAdd(`user_rooms:${userId}`, roomCode);
  }

  async removeUserRoom(userId, roomCode) {
      await redis.sRem(`user_rooms:${userId}`, roomCode);
  }

  async updateUserProfile(userId, profileUpdates) {
      const roomCodes = await redis.sMembers(`user_rooms:${userId}`);
      for (const roomCode of roomCodes) {
          await this.withRoomLock(roomCode, false, async (room) => {
              let updated = false;
              const player = room.players.find(p => p.id === userId);
              if (player) {
                  if (profileUpdates.name) player.name = profileUpdates.name;
                  if (profileUpdates.avatar) player.avatar = profileUpdates.avatar;
                  updated = true;
              }
              
              if (room.game) {
                  const gamePlayer = room.game.players.find(p => p.id === userId);
                  if (gamePlayer) {
                      if (profileUpdates.name) gamePlayer.name = profileUpdates.name;
                      if (profileUpdates.avatar) gamePlayer.avatar = profileUpdates.avatar;
                      updated = true;
                  }
              }
              
              if (updated) {
                  await this.saveRoom(room);
                  this.io.to(roomCode).emit('gameState', room.game ? room.game.getGameState() : {});
                  this.io.to(roomCode).emit('roomUpdated', await this.getRoomState(roomCode));
              }
          });
      }
  }

  async getUserRooms(userId) {
      const roomCodes = await redis.sMembers(`user_rooms:${userId}`);
      const activeRooms = [];
      for (const code of roomCodes) {
          const room = await this.getRoom(code);
          if (room) {
              activeRooms.push({
                  code: room.code,
                  gameType: room.gameType,
                  hostId: room.host,
                  playersCount: room.players.length,
                  createdAt: room.createdAt
              });
          } else {
              await this.removeUserRoom(userId, code);
          }
      }
      return activeRooms;
  }

  async getHandHistory(roomCode) {
      const room = await this.getRoom(roomCode);
      if (!room || !room.sessionId) return [];
      
      const history = await prisma.handHistory.findMany({
          where: { sessionId: room.sessionId },
          orderBy: { createdAt: 'asc' }
      });
      
      return history.map(h => h.handData);
  }

  async getPastGames(userId) {
      const games = await prisma.gameSession.findMany({
          where: {
              ledger: {
                  some: { userId: userId }
              }
          },
          include: {
              ledger: {
                  include: { user: true }
              }
          },
          orderBy: {
              createdAt: 'desc'
          }
      });
      
      return games.map(g => ({
          roomCode: g.roomCode,
          createdAt: g.createdAt.toISOString(),
          endedAt: g.endedAt ? g.endedAt.toISOString() : null,
          settings: g.settings,
          ledger: g.ledger.map(l => ({
              userId: l.userId,
              username: l.user.username,
              totalBuyIn: l.totalBuyIn,
              finalChips: l.finalChips,
              netProfit: l.netProfit
          }))
      }));
  }

  async createRoom(user, gameType, settings, socket, clubId = null) {
    if (this.isShuttingDown) throw new Error("Server is shutting down. Cannot create new rooms.");
    
    // Check if host has at least 1 coin to start
    const dbUser = await prisma.user.findUnique({ where: { id: user.userId } });
    if (dbUser.coins < 1) {
        throw new Error(`Insufficient coins to host. You need at least 1 Mayhem Coin to start.`);
    }
    
    const roomCode = await this.generateRoomCode();
    
    const dbSession = await prisma.gameSession.create({
        data: {
            roomCode,
            hostId: user.userId,
            clubId: clubId,
            settings: settings
        }
    });

    const newRoom = {
      code: roomCode,
      sessionId: dbSession.id,
      host: user.userId, 
      clubId: clubId, 
      createdAt: Date.now(),
      gameType: gameType || 'holdem',
      players: [],
      settings: settings || { smallBlind: 1, bigBlind: 2, minBuyIn: 100, maxBuyIn: 10000 },
      game: new PokerGame(gameType, settings || {}),
      pendingTableEnd: false,
      isPaused: false,
      billingPartialMs: 0
    };
    
    await this.saveRoom(newRoom);
    await this.addUserRoom(user.userId, roomCode);
    await this.joinRoom(roomCode, user, socket);
    return roomCode;
  }

  async togglePauseRoom(roomCode, user) {
      const lock = this.getLock(roomCode);
      return await lock.runExclusive(async () => {
         const room = await this.getRoom(roomCode);
         if (!room) throw new Error("Room not found");
         if (room.host !== user.userId) throw new Error("Only host can toggle pause");
         
         if (room.isPaused) {
             const dbUser = await prisma.user.findUnique({ where: { id: user.userId } });
             if (dbUser.coins < 1) throw new Error("Insufficient coins to resume.");
             room.isPaused = false;
         } else {
             room.isPaused = true;
             
             // Pause timer if running
             const score = await redis.zScore('room_billing', room.code);
             if (score) {
                 const remainingMs = score - Date.now();
                 room.billingPartialMs = Math.max(0, 60000 - remainingMs);
                 await redis.zRem('room_billing', room.code);
             }
         }
         
         await this.saveRoom(room);
         this.io.to(room.code).emit('roomUpdated', await this.getRoomState(room.code));
         
         if (!room.isPaused && room.game.stage === 'waiting') {
             await this.startNextHandInternal(room);
         }
         return { success: true, isPaused: room.isPaused };
      });
  }

  async joinRoom(roomCode, user, socket) {
    const lock = this.getLock(roomCode);
    return await lock.runExclusive(async () => {
        const room = await this.getRoom(roomCode);
        if (!room) {
          throw new Error('Room not found');
        }

        if (room.clubId) {
            const membership = await prisma.clubMember.findUnique({
                where: { clubId_userId: { clubId: room.clubId, userId: user.userId } }
            });
            if (!membership || membership.status !== 'APPROVED') {
                throw new Error("You are not an approved member of this club");
            }
        }

        const dbUser = await prisma.user.findUnique({ where: { id: user.userId } });
        const avatar = dbUser ? dbUser.avatar : '👽';

        let player = room.players.find(p => p.id === user.userId);
        if (!player) {
            player = {
              id: user.userId,
              name: user.username,
              avatar: avatar,
              socketId: socket.id,
              chips: 0,
              totalBuyIn: 0,
              connected: true
            };
            room.players.push(player);
        } else {
            player.avatar = avatar; // Update in case it changed
            player.name = dbUser.username;
            player.connected = true;
            player.socketId = socket.id;
            
            if (room.game) {
                const gamePlayer = room.game.players.find(p => p.id === player.id);
                if (gamePlayer) {
                    gamePlayer.name = dbUser.username;
                    gamePlayer.avatar = avatar;
                    if (gamePlayer.status === 'disconnected') {
                        gamePlayer.status = 'waiting';
                    }
                }
            }
        }

        await this.setSocketRoom(socket.id, roomCode);
        await this.addUserRoom(user.userId, roomCode);
        await this.saveRoom(room);
        
        socket.join(roomCode);
        
        this.io.to(roomCode).emit('roomUpdated', await this.getRoomState(roomCode));
        this.io.to(roomCode).emit('gameState', room.game.getGameState());
        await this.broadcastPrivateHands(room);
        
        return await this.getRoomState(roomCode);
    });
  }

  async handleAction(socketId, actionData) {
     await this.withRoomLock(socketId, true, async (room) => {
         if (!room.game) return;

         // Idempotency Tracking
         if (actionData.actionId) {
            room.processedActions = room.processedActions || [];
            if (room.processedActions.includes(actionData.actionId)) return;
            room.processedActions.push(actionData.actionId);
            if (room.processedActions.length > 50) room.processedActions.shift();
         }

         const p = await this.getPlayerBySocket(room, socketId);
         if(!p) return;

         await this.handleActionInternal(room, p.id, actionData);
     });
  }

  async handleRitVote(socketId, voteData) {
      await this.withRoomLock(socketId, true, async (room) => {
          if (!room.game) return;
          
          if (voteData.actionId) {
             room.processedActions = room.processedActions || [];
             if (room.processedActions.includes(voteData.actionId)) return;
             room.processedActions.push(voteData.actionId);
             if (room.processedActions.length > 50) room.processedActions.shift();
          }

          const p = await this.getPlayerBySocket(room, socketId);
          if(!p) return;

          const playerIndex = room.game.players.findIndex(gp => gp.id === p.id);
          if (playerIndex === -1) return;

          const vote = voteData.vote !== undefined ? voteData.vote : voteData;

          const previousStage = room.game.stage;
          room.game.voteRunItTwice(playerIndex, vote);
          
          if (previousStage !== 'handEnd' && room.game.stage === 'handEnd') {
              const history = await prisma.handHistory.create({
                  data: {
                      sessionId: room.sessionId,
                      handData: room.game.toJSON()
                  }
              });
              room.currentHandHistoryId = history.id;
          }
          
          await this.saveRoom(room);
          this.io.to(room.code).emit('gameState', room.game.getGameState());
          this.io.to(room.code).emit('roomUpdated', await this.getRoomState(room.code));
          await this.updateTurnTimer(room);
      });
  }

  async handleActionInternal(room, playerId, actionData) {
        const previousStage = room.game.stage;
        room.game.handleAction(playerId, actionData);
        
        if (previousStage !== 'handEnd' && room.game.stage === 'handEnd' && room.game.winnerInfo) {
            const history = await prisma.handHistory.create({
                data: {
                    sessionId: room.sessionId,
                    handData: room.game.toJSON()
                }
            });
            room.currentHandHistoryId = history.id;
        } else if (previousStage === 'handEnd' && room.game.stage === 'handEnd' && room.currentHandHistoryId) {
            await prisma.handHistory.update({
                where: { id: room.currentHandHistoryId },
                data: { handData: room.game.toJSON() }
            });
        }
        
        await this.saveRoom(room);

        this.io.to(room.code).emit('gameState', room.game.getGameState());
        this.io.to(room.code).emit('roomUpdated', await this.getRoomState(room.code));
        await this.broadcastPrivateHands(room);
        await this.updateTurnTimer(room);
        
        if (actionData.action === 'buyIn' && room.game.stage === 'waiting' && room.game.handCount > 0) {
            await this.startNextHandInternal(room);
        }
  }

  async handleSitOut(socketId, data) {
     await this.withRoomLock(socketId, true, async (room) => {
         if (!room.game) return;
         
         const isSittingOut = data.isSittingOut !== undefined ? data.isSittingOut : data;
         
         if (data.actionId) {
            room.processedActions = room.processedActions || [];
            if (room.processedActions.includes(data.actionId)) return;
            room.processedActions.push(data.actionId);
            if (room.processedActions.length > 50) room.processedActions.shift();
         }

         const sp = await this.getPlayerBySocket(room, socketId);
         if(!sp) return;
         
         const player = room.game.players.find(p => p.id === sp.id);
         if (player) {
             player.isSittingOut = isSittingOut;
             if (room.game.stage === 'waiting' || room.game.stage === 'handEnd') {
                 if (isSittingOut && player.status !== 'eliminated') {
                     player.status = 'sitting_out';
                 } else if (!isSittingOut && player.status === 'sitting_out') {
                     player.status = 'waiting';
                 }
             }
             await this.saveRoom(room);
             this.io.to(room.code).emit('gameState', room.game.getGameState());
             this.io.to(room.code).emit('roomUpdated', await this.getRoomState(room.code));
             
             if (room.game.stage === 'waiting' && room.game.handCount > 0 && !isSittingOut) {
                 await this.startNextHandInternal(room);
             }
         }
     });
  }

  async startNextHand(roomCode) {
     await this.withRoomLock(roomCode, false, async (room) => {
         await this.startNextHandInternal(room);
     });
  }

  async startNextHandInternal(room) {
      if (this.isShuttingDown || room.pendingTableEnd) {
          await this.finalizeTableInternal(room);
          return;
      }
      
      room.game.players.filter(p => p.isStandingUp).forEach(gp => {
          const sp = room.players.find(p => p.id === gp.id);
          if (sp) {
              sp.cashedOutChips = (sp.cashedOutChips || 0) + gp.chips;
              sp.chips = 0;
          }
      });
      
      if (room.isPaused) {
          console.log(`Cannot start next hand in room ${room.code} - paused`);
          room.game.resetForWaiting();
          await this.saveRoom(room);
          this.io.to(room.code).emit('gameState', room.game.getGameState());
          this.io.to(room.code).emit('roomUpdated', await this.getRoomState(room.code));
          return;
      }
      
      const success = room.game.startGame();
      if (success) {
         const score = await redis.zScore('room_billing', room.code);
         if (!score) {
             const partial = room.billingPartialMs || 0;
             const nextBillingMs = Math.max(0, 60000 - partial);
             await redis.zAdd('room_billing', [{ score: Date.now() + nextBillingMs, value: room.code }]);
             room.billingPartialMs = 0;
         }
         await this.saveRoom(room);
         this.io.to(room.code).emit('gameState', room.game.getGameState());
         this.io.to(room.code).emit('roomUpdated', await this.getRoomState(room.code));
         await this.broadcastPrivateHands(room);
         await this.updateTurnTimer(room);
      } else {
         console.log("Not enough players to start next hand in room: " + room.code);
         room.game.resetForWaiting();
         
         // Pause billing timer
         const score = await redis.zScore('room_billing', room.code);
         if (score) {
             const remainingMs = score - Date.now();
             room.billingPartialMs = Math.max(0, 60000 - remainingMs);
             await redis.zRem('room_billing', room.code);
         }
         
         await this.saveRoom(room);
         this.io.to(room.code).emit('gameState', room.game.getGameState());
         this.io.to(room.code).emit('roomUpdated', await this.getRoomState(room.code));
         await this.broadcastPrivateHands(room);
      }
  }

  async startGame(socketId) {
     await this.withRoomLock(socketId, true, async (room) => {
        if (!room.game) return;
        if (this.isShuttingDown || room.pendingTableEnd) {
            await this.finalizeTableInternal(room);
            return;
        }

        room.game.players.filter(p => p.isStandingUp).forEach(gp => {
            const sp = room.players.find(p => p.id === gp.id);
            if (sp) {
                sp.cashedOutChips = (sp.cashedOutChips || 0) + gp.chips;
                sp.chips = 0;
            }
        });

        if (room.isPaused) {
            throw new Error("Table is paused. Please resume first.");
        }
        
        const success = room.game.startGame();
        if (success) {
           const score = await redis.zScore('room_billing', room.code);
           if (!score) {
               const partial = room.billingPartialMs || 0;
               const nextBillingMs = Math.max(0, 60000 - partial);
               await redis.zAdd('room_billing', [{ score: Date.now() + nextBillingMs, value: room.code }]);
               room.billingPartialMs = 0;
           }
           await this.saveRoom(room);
           this.io.to(room.code).emit('gameState', room.game.getGameState());
           this.io.to(room.code).emit('roomUpdated', await this.getRoomState(room.code));
           await this.broadcastPrivateHands(room);
           await this.updateTurnTimer(room);
           return true;
        } else {
           throw new Error("Not enough players to start");
        }
     });
  }

  async broadcastPrivateHands(room) {
      room.players.forEach(p => {
          const gamePlayer = room.game.players.find(gp => gp.id === p.id);
          if (gamePlayer && gamePlayer.hand && p.socketId) {
              this.io.to(p.socketId).emit('privateHand', gamePlayer.hand);
          }
      });
  }

  async handleDisconnect(socket) {
    const roomCode = await this.getSocketRoom(socket.id);
    if (roomCode) {
      await this.withRoomLock(roomCode, false, async (room) => {
          const player = await this.getPlayerBySocket(room, socket.id);
          if (player) {
            player.connected = false;
            await this.saveRoom(room);
            this.io.to(roomCode).emit('roomUpdated', await this.getRoomState(roomCode));
          }
      });
      await this.deleteSocketRoom(socket.id);
    }
  }

  async getRoomState(roomCode) {
    const room = await this.getRoom(roomCode);
    if (!room) return null;
    const score = await redis.zScore('room_billing', roomCode);
    let runningActiveMs = 0;
    if (score) {
        runningActiveMs = Math.max(0, 60000 - (score - Date.now()));
    }
    
    return {
      code: room.code,
      host: room.host,
      gameType: room.gameType,
      createdAt: room.createdAt,
      totalActiveTimeMs: (room.totalActiveTimeMs || 0) + (room.billingPartialMs || 0) + runningActiveMs,
      isTimerRunning: !!score,
      serverTime: Date.now(),
      settings: room.settings,
      pendingTableEnd: room.pendingTableEnd,
      isPaused: room.isPaused,
      players: room.players.map(p => {
          const gp = room.game.players.find(gameP => gameP.id === p.id);
          return { id: p.id, name: p.name, chips: p.chips, cashedOutChips: p.cashedOutChips || 0, connected: p.connected, isSittingOut: gp ? gp.isSittingOut : false };
      }),
      ledgerBalances: room.players
          .filter(p => p.totalBuyIn && p.totalBuyIn > 0)
          .map(p => {
              const gp = room.game.players.find(gameP => gameP.id === p.id);
              const tableChips = gp ? gp.chips + (gp.queuedReload || 0) + (gp.potContribution || 0) : p.chips;
              const totalAssetValue = tableChips + (p.cashedOutChips || 0);
              return {
                  name: p.name,
                  totalBuyIn: p.totalBuyIn,
                  chips: totalAssetValue,
                  net: totalAssetValue - p.totalBuyIn
              };
          })
    };
  }

  async handleSitAtTable(socketId, data) {
     await this.withRoomLock(socketId, true, async (room) => {
         if (!room.game) return;
         
         const chips = data.chips !== undefined ? data.chips : data;
         
         if (data.actionId) {
            room.processedActions = room.processedActions || [];
            if (room.processedActions.includes(data.actionId)) return;
            room.processedActions.push(data.actionId);
            if (room.processedActions.length > 50) room.processedActions.shift();
         }

         const spectator = await this.getPlayerBySocket(room, socketId);
         if (!spectator) return;
         
         const alreadySeated = room.game.players.find(p => p.id === spectator.id);
         if (alreadySeated) return;
         
         let finalChips;
         if (spectator.cashedOutChips && spectator.cashedOutChips > 0) {
             finalChips = spectator.cashedOutChips;
             spectator.cashedOutChips = 0;
         } else {
             const minBuyIn = room.settings.minBuyIn || 100;
             const maxBuyIn = room.settings.maxBuyIn || 10000;
             finalChips = Math.max(minBuyIn, Math.min(chips, maxBuyIn));
             spectator.totalBuyIn = (spectator.totalBuyIn || 0) + finalChips;
         }
         
         spectator.chips = finalChips;
         room.game.addPlayer({
             id: spectator.id,
             name: spectator.name,
             avatar: spectator.avatar,
             chips: finalChips
         });
         
         await this.saveRoom(room);
         this.io.to(room.code).emit('gameState', room.game.getGameState());
         this.io.to(room.code).emit('roomUpdated', await this.getRoomState(room.code));
     });
  }

  async handleStandUp(socketId, data = {}) {
     await this.withRoomLock(socketId, true, async (room) => {
         if (!room.game) return;
         
         if (data.actionId) {
            room.processedActions = room.processedActions || [];
            if (room.processedActions.includes(data.actionId)) return;
            room.processedActions.push(data.actionId);
            if (room.processedActions.length > 50) room.processedActions.shift();
         }

         const sp = await this.getPlayerBySocket(room, socketId);
         if(!sp) return;
         
         const gpIndex = room.game.players.findIndex(p => p.id === sp.id);
         if (gpIndex !== -1) {
             const gp = room.game.players[gpIndex];
             if (room.game.stage === 'waiting' || room.game.stage === 'handEnd') {
                 sp.cashedOutChips = (sp.cashedOutChips || 0) + gp.chips;
                 sp.chips = 0;
                 room.game.players.splice(gpIndex, 1);
             } else {
                 gp.isStandingUp = true;
                 if (gp.status === 'active') {
                     if (room.game.players[room.game.currentTurn] && room.game.players[room.game.currentTurn].id === sp.id) {
                         room.game.handleAction(sp.id, {action: 'fold'});
                     } else {
                         gp.status = 'folded';
                     }
                 }
             }
             await this.saveRoom(room);
             this.io.to(room.code).emit('gameState', room.game.getGameState());
             this.io.to(room.code).emit('roomUpdated', await this.getRoomState(room.code));
         }
     });
  }

  async handleReloadChips(socketId, data) {
     await this.withRoomLock(socketId, true, async (room) => {
         if (!room.game) return;
         
         const amount = data.amount !== undefined ? data.amount : data;
         if (data.actionId) {
            room.processedActions = room.processedActions || [];
            if (room.processedActions.includes(data.actionId)) return;
            room.processedActions.push(data.actionId);
            if (room.processedActions.length > 50) room.processedActions.shift();
         }

         const sp = await this.getPlayerBySocket(room, socketId);
         if(!sp) return;

         const gpIndex = room.game.players.findIndex(p => p.id === sp.id);
         if (gpIndex !== -1) {
             const gp = room.game.players[gpIndex];
             const minBuyIn = room.settings.minBuyIn || 100;
             const maxBuyIn = room.settings.maxBuyIn || 10000;
             
             const currentTableChips = gp.chips + (gp.queuedReload || 0) + (gp.potContribution || 0);
             const maxAllowedToAdd = Math.max(0, maxBuyIn - currentTableChips);
             
             if (maxAllowedToAdd <= 0) return; // Cannot reload if already at maxBuyIn
             
             const minAllowedToAdd = Math.min(minBuyIn, maxAllowedToAdd);
             const finalAmount = Math.max(minAllowedToAdd, Math.min(amount, maxAllowedToAdd));
             
             sp.totalBuyIn = (sp.totalBuyIn || 0) + finalAmount;
             
             if (!gp.queuedReload) gp.queuedReload = 0;
             gp.queuedReload += finalAmount;
             
             if (room.game.stage === 'waiting' || room.game.stage === 'showdown' || room.game.stage === 'handEnd') {
                 gp.chips += gp.queuedReload;
                 gp.queuedReload = 0;
                 if (gp.status === 'eliminated') {
                     gp.status = 'waiting';
                 }
             }
             await this.saveRoom(room);
             this.io.to(room.code).emit('gameState', room.game.getGameState());
             this.io.to(room.code).emit('roomUpdated', await this.getRoomState(room.code));
             
             if (room.game.stage === 'waiting' && room.game.handCount > 0) {
                 await this.startNextHandInternal(room);
             }
         }
     });
  }

  async updateSettings(socketId, newSettings) {
     await this.withRoomLock(socketId, true, async (room) => {
         const sp = await this.getPlayerBySocket(room, socketId);
         if (sp && room.host === sp.id) {
             room.settings = { ...room.settings, ...newSettings };
             room.game.settings = room.settings;
             await this.saveRoom(room);
             this.io.to(room.code).emit('roomUpdated', await this.getRoomState(room.code));
         }
     });
  }

  async requestEndTable(socketId) {
     await this.withRoomLock(socketId, true, async (room) => {
         const sp = await this.getPlayerBySocket(room, socketId);
         if (sp && room.host === sp.id) {
             if (room.game.stage === 'waiting' || room.game.stage === 'showdown') {
                 await this.finalizeTableInternal(room);
             } else {
                 room.pendingTableEnd = true;
                 await this.saveRoom(room);
                 this.io.to(room.code).emit('roomUpdated', await this.getRoomState(room.code));
             }
         }
     });
  }

  async finalizeTable(roomCode) {
     await this.withRoomLock(roomCode, false, async (room) => {
         await this.finalizeTableInternal(room);
     });
  }

  async shutdown() {
      this.isShuttingDown = true;
      clearInterval(this.timeoutInterval);
      const shutdownStart = Date.now();
      while(Date.now() - shutdownStart < 8000) {
          const keys = await redis.keys("room:*");
          let hasActiveHands = false;
          for (const key of keys) {
              const code = key.split(":")[1];
              const room = await this.getRoom(code);
              if (room && room.game && room.game.stage !== "waiting") {
                  hasActiveHands = true;
                  break;
              }
          }
          if (!hasActiveHands) break;
          await new Promise(r => setTimeout(r, 500));
      }
      const finalKeys = await redis.keys("room:*");
      for (const key of finalKeys) {
          const code = key.split(":")[1];
          await this.finalizeTable(code);
      }
      await prisma.$disconnect();
      await redis.disconnect();
  }

  async finalizeTableInternal(room) {
     if (!room) return;
     
     room.game.players.forEach(gp => {
         const sp = room.players.find(p => p.id === gp.id);
         if (sp) sp.chips = gp.chips;
     });
     
     // Remove timeouts
     await redis.zRem('room_turn_timeouts', room.code);
     
     // Pause Billing Timer
     const score = await redis.zScore('room_billing', room.code);
     if (score) {
         const remainingMs = score - Date.now();
         if (remainingMs > 0) {
             room.billingPartialMs = 60000 - remainingMs;
         } else {
             room.billingPartialMs = 0;
         }
         await redis.zRem('room_billing', room.code);
     }
     
     const roomCode = room.code;
     const roomState = await this.getRoomState(roomCode);
     const finalBalances = [];
     
     // Write to Postgres Ledger using $transaction for ACID compliance
     try {
         await prisma.$transaction(async (tx) => {
             for (const player of room.players) {
                 const gp = room.game.players.find(g => g.id === player.id);
                 if (gp) player.chips = gp.chips; // sync back
                 
                 if (player.totalBuyIn > 0) {
                     const netProfit = player.chips + (player.cashedOutChips || 0) - player.totalBuyIn;
                     
                     // Add to Final Balances array
                     finalBalances.push({
                         name: player.name,
                         totalBuyIn: player.totalBuyIn,
                         chips: player.chips,
                         net: netProfit
                     });
                     
                     if (room.sessionId && player.id) {
                         await tx.ledgerEntry.create({
                             data: {
                                 sessionId: room.sessionId,
                                 userId: player.id,
                                 totalBuyIn: player.totalBuyIn,
                                 finalChips: player.chips + (player.cashedOutChips || 0),
                                 netProfit: netProfit
                             }
                         });
    
                         await tx.user.update({
                             where: { id: player.id },
                             data: { totalProfit: { increment: netProfit } }
                         });
                     }
                 }
             }
    
             await tx.gameSession.update({
                 where: { id: room.sessionId },
                 data: { status: 'ended', endedAt: new Date() }
             });
         });
     } catch (err) {
         console.error(`[FATAL] Error finalizing table DB state for room ${roomCode}:`, err);
     }
         
     this.io.to(roomCode).emit('tableEnded', finalBalances);
     
     // Cleanup Redis
     for (let player of room.players) {
         await this.removeUserRoom(player.id, roomCode);
     }
     await redis.del(`room:${roomCode}`);
  }
}

module.exports = RoomManager;
