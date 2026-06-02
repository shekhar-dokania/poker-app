const crypto = require('crypto');
const PokerGame = require('./PokerGame');
const { PrismaClient } = require('@prisma/client');
const { createClient } = require('redis');

const prisma = new PrismaClient();
const redis = createClient({
  url: process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL || 'redis://localhost:6379'
});
redis.on('error', err => console.log('Redis Client Error', err));
redis.connect().catch(console.error);

class RoomManager {
  constructor(io) {
    this.io = io;
    setInterval(() => this.processTimeouts(), 1000);
  }

  async updateTurnTimer(room) {
      if (room.game.stage === 'waiting') return;
      let limit = room.game.settings.turnTimeLimit || 30;
      if (room.game.stage === 'handEnd') limit = 10;
      if (room.game.isAllInShowdown) limit = 2;
      const expireTime = room.game.turnStartTime + (limit * 1000);
      await redis.zAdd('room_turn_timeouts', [{ score: expireTime, value: room.code }]);
  }

  async processTimeouts() {
      const now = Date.now();
      const expiredRooms = await redis.zRangeByScore('room_turn_timeouts', 0, now);
      for (const roomCode of expiredRooms) {
          const room = await this.getRoom(roomCode);
          if (room && room.game && room.game.stage !== 'waiting') {
              let limit = room.game.settings.turnTimeLimit || 30;
              if (room.game.stage === 'handEnd') limit = 10;
              if (room.game.isAllInShowdown) limit = 2; // 2 seconds delay between cards
              
              const expireTime = room.game.turnStartTime + (limit * 1000);
              
              if (now >= expireTime) {
                  if (room.game.stage === 'handEnd') {
                      console.log(`Starting next hand in room ${room.code} after handEnd delay`);
                      await this.startNextHand(roomCode);
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
                      this.io.to(roomCode).emit('gameState', room.game.getGameState());
                      this.io.to(roomCode).emit('roomUpdated', await this.getRoomState(roomCode));
                      await this.updateTurnTimer(room);
                  } else if (room.game.stage === 'runItTwicePrompt') {
                      console.log(`Auto-declining RIT in room ${room.code} due to timeout`);
                      room.game.declineRunItTwice();
                      await this.saveRoom(room);
                      this.io.to(roomCode).emit('gameState', room.game.getGameState());
                      this.io.to(roomCode).emit('roomUpdated', await this.getRoomState(roomCode));
                      
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
              await redis.zRem('room_turn_timeouts', roomCode);
          }
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
              // Cleanup dangling room code
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
    const roomCode = await this.generateRoomCode();
    const game = new PokerGame(gameType, settings);
    
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
      host: user.userId, // Postgres UUID
      clubId: clubId, // Save clubId to enforce membership
      createdAt: Date.now(),
      gameType: gameType || 'holdem',
      players: [],
      settings: settings || { smallBlind: 1, bigBlind: 2, minBuyIn: 100, maxBuyIn: 10000 },
      game: new PokerGame(gameType, settings || {}),
      pendingTableEnd: false
    };
    
    await this.saveRoom(newRoom);
    await this.addUserRoom(user.userId, roomCode);
    await this.joinRoom(roomCode, user, socket);
    return roomCode;
  }

  async joinRoom(roomCode, user, socket) {
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

    let player = room.players.find(p => p.id === user.userId);
    if (!player) {
        player = {
          id: user.userId,
          name: user.username,
          socketId: socket.id,
          chips: 0,
          totalBuyIn: 0,
          connected: true
        };
        room.players.push(player);
    } else {
        player.connected = true;
        player.socketId = socket.id;
    }

    await this.setSocketRoom(socket.id, roomCode);
    await this.addUserRoom(user.userId, roomCode);
    await this.saveRoom(room);
    
    socket.join(roomCode);
    
    this.io.to(roomCode).emit('roomUpdated', await this.getRoomState(roomCode));
    this.io.to(roomCode).emit('gameState', room.game.getGameState());
    await this.broadcastPrivateHands(room);
    
    return await this.getRoomState(roomCode);
  }

  async handleAction(socketId, actionData) {
     const roomCode = await this.getSocketRoom(socketId);
     if (!roomCode) return;
     
     const room = await this.getRoom(roomCode);
     if (room && room.game) {
        const p = await this.getPlayerBySocket(room, socketId);
        if(!p) return;

        await this.handleActionInternal(room, p.id, actionData);
     }
  }

  async handleRitVote(socketId, vote) {
      const roomCode = await this.getSocketRoom(socketId);
      if (!roomCode) return;
      
      const room = await this.getRoom(roomCode);
      if (room && room.game) {
         const p = await this.getPlayerBySocket(room, socketId);
         if(!p) return;

         const playerIndex = room.game.players.findIndex(gp => gp.id === p.id);
         if (playerIndex === -1) return;

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
         this.io.to(roomCode).emit('gameState', room.game.getGameState());
         this.io.to(roomCode).emit('roomUpdated', await this.getRoomState(roomCode));

         if (room.game.stage === 'handEnd' && !room.game.handEndTimer) {
            // Schedule next hand if RIT caused it to transition to handEnd
            room.game.handEndTimer = setTimeout(async () => {
               await this.startNextHand(roomCode);
            }, 5000);
         }
      }
  }

  async handleActionInternal(room, playerId, actionData) {
        const previousStage = room.game.stage;
        room.game.handleAction(playerId, actionData);
        
        // If hand just completed, save HandHistory
        if (previousStage !== 'handEnd' && room.game.stage === 'handEnd' && room.game.winnerInfo) {
            const history = await prisma.handHistory.create({
                data: {
                    sessionId: room.sessionId,
                    handData: room.game.toJSON()
                }
            });
            room.currentHandHistoryId = history.id;
        } else if (previousStage === 'handEnd' && room.game.stage === 'handEnd' && room.currentHandHistoryId) {
            // Update existing hand history if a player reveals/mucks
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
        
        // If a player bought in and the game is waiting to resume, try to auto-start
        if (actionData.action === 'buyIn' && room.game.stage === 'waiting' && room.game.handCount > 0) {
            await this.startNextHand(room.code);
        }
  }

  async handleSitOut(socketId, isSittingOut) {
     const roomCode = await this.getSocketRoom(socketId);
     if (!roomCode) return;
     
     const room = await this.getRoom(roomCode);
     if (room && room.game) {
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
            this.io.to(roomCode).emit('gameState', room.game.getGameState());
            this.io.to(roomCode).emit('roomUpdated', await this.getRoomState(roomCode));
            
            // Try to auto-start if in waiting and game has already begun once
            if (room.game.stage === 'waiting' && room.game.handCount > 0 && !isSittingOut) {
                await this.startNextHand(roomCode);
            }
        }
     }
  }

   async startNextHand(roomCode) {
      const room = await this.getRoom(roomCode);
      if (room && room.game) {
         if (room.pendingTableEnd) {
             await this.finalizeTable(roomCode);
             return;
         }
         const success = room.game.startGame();
         if (success) {
            await this.saveRoom(room);
            this.io.to(roomCode).emit('gameState', room.game.getGameState());
            this.io.to(roomCode).emit('roomUpdated', await this.getRoomState(roomCode));
            await this.broadcastPrivateHands(room);
            await this.updateTurnTimer(room);
         } else {
            console.log("Not enough players to start next hand in room: " + roomCode);
            room.game.stage = 'waiting';
            await this.saveRoom(room);
            this.io.to(roomCode).emit('gameState', room.game.getGameState());
            this.io.to(roomCode).emit('roomUpdated', await this.getRoomState(roomCode));
         }
      }
   }

  async startGame(socketId) {
     const roomCode = await this.getSocketRoom(socketId);
     if (!roomCode) return;
     const room = await this.getRoom(roomCode);
     if (room && room.game) {
        if (room.pendingTableEnd) {
            await this.finalizeTable(roomCode);
            return;
        }

        room.game.players.filter(p => p.isStandingUp).forEach(gp => {
            const sp = room.players.find(p => p.id === gp.id);
            if (sp) sp.chips = gp.chips;
        });

        const success = room.game.startGame();
        if (success) {
           await this.saveRoom(room);
           this.io.to(roomCode).emit('gameState', room.game.getGameState());
           this.io.to(roomCode).emit('roomUpdated', await this.getRoomState(roomCode));
           await this.broadcastPrivateHands(room);
           await this.updateTurnTimer(room);
        } else {
           throw new Error("Not enough players to start");
        }
     }
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
      const room = await this.getRoom(roomCode);
      if (room) {
        const player = await this.getPlayerBySocket(room, socket.id);
        if (player) {
          player.connected = false;
          await this.saveRoom(room);
          this.io.to(roomCode).emit('roomUpdated', await this.getRoomState(roomCode));
        }
      }
      await this.deleteSocketRoom(socket.id);
    }
  }

  async getRoomState(roomCode) {
    const room = await this.getRoom(roomCode);
    if (!room) return null;
    return {
      code: room.code,
      host: room.host,
      gameType: room.gameType,
      createdAt: room.createdAt,
      settings: room.settings,
      pendingTableEnd: room.pendingTableEnd,
      players: room.players.map(p => {
          const gp = room.game.players.find(gameP => gameP.id === p.id);
          return { id: p.id, name: p.name, chips: p.chips, connected: p.connected, isSittingOut: gp ? gp.isSittingOut : false };
      }),
      ledgerBalances: room.players
          .filter(p => p.totalBuyIn && p.totalBuyIn > 0)
          .map(p => {
              const gp = room.game.players.find(gameP => gameP.id === p.id);
              const currentChips = gp ? gp.chips + (gp.queuedReload || 0) : p.chips;
              return {
                  name: p.name,
                  totalBuyIn: p.totalBuyIn,
                  chips: currentChips,
                  net: currentChips - p.totalBuyIn
              };
          })
    };
  }

  async handleSitAtTable(socketId, chips) {
     const roomCode = await this.getSocketRoom(socketId);
     if (!roomCode) return;
     
     const room = await this.getRoom(roomCode);
     if (room && room.game) {
        const spectator = await this.getPlayerBySocket(room, socketId);
        if (!spectator) return;
        
        const alreadySeated = room.game.players.find(p => p.id === spectator.id);
        if (alreadySeated) return;
        
        const minBuyIn = room.settings.minBuyIn || 100;
        const maxBuyIn = room.settings.maxBuyIn || 10000;
        const finalChips = Math.max(minBuyIn, Math.min(chips, maxBuyIn));
        
        spectator.totalBuyIn = (spectator.totalBuyIn || 0) + finalChips;
        spectator.chips = finalChips;
        room.game.addPlayer({
            id: spectator.id,
            name: spectator.name,
            chips: finalChips
        });
        
        await this.saveRoom(room);
        this.io.to(roomCode).emit('gameState', room.game.getGameState());
        this.io.to(roomCode).emit('roomUpdated', await this.getRoomState(roomCode));
     }
  }

  async handleStandUp(socketId) {
     const roomCode = await this.getSocketRoom(socketId);
     if (!roomCode) return;
     
     const room = await this.getRoom(roomCode);
     if (room && room.game) {
        const sp = await this.getPlayerBySocket(room, socketId);
        if(!sp) return;
        
        const gpIndex = room.game.players.findIndex(p => p.id === sp.id);
        if (gpIndex !== -1) {
            const gp = room.game.players[gpIndex];
            if (room.game.stage === 'waiting' || room.game.stage === 'handEnd') {
                sp.chips = gp.chips;
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
            this.io.to(roomCode).emit('gameState', room.game.getGameState());
            this.io.to(roomCode).emit('roomUpdated', await this.getRoomState(roomCode));
        }
     }
  }

  async handleReloadChips(socketId, amount) {
     const roomCode = await this.getSocketRoom(socketId);
     if (!roomCode) return;
     
     const room = await this.getRoom(roomCode);
     if (room && room.game) {
        const sp = await this.getPlayerBySocket(room, socketId);
        if(!sp) return;

        const gpIndex = room.game.players.findIndex(p => p.id === sp.id);
        if (gpIndex !== -1) {
            const gp = room.game.players[gpIndex];
            
            const minBuyIn = room.settings.minBuyIn || 100;
            const maxBuyIn = room.settings.maxBuyIn || 10000;
            const finalAmount = Math.max(minBuyIn, Math.min(amount, maxBuyIn));
            
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
            this.io.to(roomCode).emit('gameState', room.game.getGameState());
            this.io.to(roomCode).emit('roomUpdated', await this.getRoomState(roomCode));
            
            if (room.game.stage === 'waiting' && room.game.handCount > 0) {
                await this.startNextHand(roomCode);
            }
        }
     }
  }

  async updateSettings(socketId, newSettings) {
     const roomCode = await this.getSocketRoom(socketId);
     if (!roomCode) return;
     
     const room = await this.getRoom(roomCode);
     if (room) {
         const sp = await this.getPlayerBySocket(room, socketId);
         if (sp && room.host === sp.id) {
             room.settings = { ...room.settings, ...newSettings };
             room.game.settings = room.settings;
             await this.saveRoom(room);
             this.io.to(roomCode).emit('roomUpdated', await this.getRoomState(roomCode));
         }
     }
  }

  async requestEndTable(socketId) {
     const roomCode = await this.getSocketRoom(socketId);
     if (!roomCode) return;
     
     const room = await this.getRoom(roomCode);
     if (room) {
         const sp = await this.getPlayerBySocket(room, socketId);
         if (sp && room.host === sp.id) {
             if (room.game.stage === 'waiting' || room.game.stage === 'showdown') {
                 await this.finalizeTable(roomCode);
             } else {
                 room.pendingTableEnd = true;
                 await this.saveRoom(room);
                 this.io.to(roomCode).emit('roomUpdated', await this.getRoomState(roomCode));
             }
         }
     }
  }

  async finalizeTable(roomCode) {
     const room = await this.getRoom(roomCode);
     if (!room) return;
     
     room.game.players.forEach(gp => {
         const sp = room.players.find(p => p.id === gp.id);
         if (sp) sp.chips = gp.chips;
     });
     
     const roomState = await this.getRoomState(roomCode);
     const finalBalances = roomState.ledgerBalances;
     
     // Write to Postgres Ledger
     try {
         for (let player of room.players) {
             if (player.totalBuyIn > 0) {
                 const netProfit = player.chips - player.totalBuyIn;
                 await prisma.ledgerEntry.create({
                     data: {
                         sessionId: room.sessionId,
                         userId: player.id,
                         totalBuyIn: player.totalBuyIn,
                         finalChips: player.chips,
                         netProfit: netProfit
                     }
                 });

                 // Update user's lifetime profit
                 await prisma.user.update({
                     where: { id: player.id },
                     data: { totalProfit: { increment: netProfit } }
                 });
             }
         }

         await prisma.gameSession.update({
             where: { id: room.sessionId },
             data: { status: 'ended', endedAt: new Date() }
         });
     } catch (err) {
         console.error('Error finalizing table DB state:', err);
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
