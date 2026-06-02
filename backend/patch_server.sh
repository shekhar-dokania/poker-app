#!/bin/bash
set -e

# Insert shutdown method into RoomManager.js
sed -i '' '/async finalizeTableInternal(room) {/i\
  async shutdown() {\
      this.isShuttingDown = true;\
      clearInterval(this.timeoutInterval);\
      const shutdownStart = Date.now();\
      while(Date.now() - shutdownStart < 8000) {\
          const keys = await redis.keys("room:*");\
          let hasActiveHands = false;\
          for (const key of keys) {\
              const code = key.split(":")[1];\
              const room = await this.getRoom(code);\
              if (room && room.game && room.game.stage !== "waiting") {\
                  hasActiveHands = true;\
                  break;\
              }\
          }\
          if (!hasActiveHands) break;\
          await new Promise(r => setTimeout(r, 500));\
      }\
      const finalKeys = await redis.keys("room:*");\
      for (const key of finalKeys) {\
          const code = key.split(":")[1];\
          await this.finalizeTable(code);\
      }\
      await prisma.$disconnect();\
      await redis.disconnect();\
  }\
' RoomManager.js

# Append Graceful Shutdown to server.js
cat << 'SERVER_PATCH' >> server.js

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
SERVER_PATCH

echo "Patched server.js and RoomManager.js"
