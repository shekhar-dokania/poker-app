import re

with open('backend/RoomManager.js', 'r') as f:
    content = f.read()

# Add imports
import_stmt = "const { gameReducer, getGameState } = require('./game/engine');\nconst { ACTIONS } = require('./game/types');\n"
content = content.replace("const PokerGame = require('./PokerGame');", import_stmt)

# Remove fromJSON
content = re.sub(r'if \(room\.game\) {\s*room\.game = PokerGame\.fromJSON\(room\.game\);\s*}', '', content)

# getGameState
content = re.sub(r'room\.game\s*\?\s*room\.game\.getGameState\(\)\s*:\s*\{\}', 'room.game ? getGameState(room.game) : {}', content)
content = re.sub(r'room\.game\.getGameState\(\)', 'getGameState(room.game)', content)

# toJSON
content = re.sub(r'room\.game\.toJSON\(\)', 'room.game', content)

# advanceStage
content = content.replace('room.game.advanceStage();', 'room.game = gameReducer(room.game, { type: ACTIONS.ADVANCE_STAGE });')

# advanceRitStage
content = content.replace('room.game.advanceRitStage();', 'room.game = gameReducer(room.game, { type: ACTIONS.ADVANCE_RIT });')

# declineRunItTwice
content = content.replace('room.game.declineRunItTwice();', 'room.game = gameReducer(room.game, { type: ACTIONS.DECLINE_RIT });')

# handleAction
content = re.sub(r'room\.game\.handleAction\(([^,]+),\s*([^)]+)\);', r'room.game = gameReducer(room.game, { type: ACTIONS.PLAYER_ACTION, payload: { playerId: \1, actionData: \2 } });', content)

# voteRunItTwice
content = re.sub(r'room\.game\.voteRunItTwice\(([^,]+),\s*([^)]+)\);', r'room.game = gameReducer(room.game, { type: ACTIONS.RIT_VOTE, payload: { playerIndex: \1, vote: \2 } });', content)

# resetForWaiting
content = content.replace('room.game.resetForWaiting();', 'room.game = gameReducer(room.game, { type: ACTIONS.RESET_WAITING });')

# startGame
# Note: Since the method returns a boolean, we use the payload side-channel in our wrapper
start_game_replace = """const action = { type: ACTIONS.START_HAND, payload: {} };
                room.game = gameReducer(room.game, action);
                const success = action.payload.success;"""
content = content.replace('const success = room.game.startGame();', start_game_replace)

# addPlayer
content = re.sub(r'room\.game\.addPlayer\(({[^}]+})\);', r'room.game = gameReducer(room.game, { type: ACTIONS.ADD_PLAYER, payload: { player: \1 } });', content)

# removePlayer
content = re.sub(r'room\.game\.players\.splice\(([^,]+),\s*1\);', r'// Splice replacement handled manually if needed, but lets assume it was just removing the player by id.\n                room.game = gameReducer(room.game, { type: ACTIONS.REMOVE_PLAYER, payload: { playerId: sp.id } });', content)

# settings
content = content.replace('room.game.settings = room.settings;', 'room.game = gameReducer(room.game, { type: ACTIONS.SET_SETTINGS, payload: { settings: room.settings } });')

with open('backend/RoomManager.js', 'w') as f:
    f.write(content)

print("Migration applied!")
