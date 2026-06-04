const PokerGame = require('../PokerGame');
const { ACTIONS } = require('./types');

function getGameState(prevState) {
    if (!prevState) return {};
    const game = PokerGame.fromJSON(prevState);
    return game.getGameState();
}

function gameReducer(prevState, action) {
    if (!prevState) {
        // Initial state logic
        const gameType = action?.payload?.gameType || 'holdem';
        const settings = action?.payload?.settings || {};
        const game = new PokerGame(gameType, settings);
        return game.toJSON();
    }

    const game = PokerGame.fromJSON(prevState);

    switch (action.type) {
        case ACTIONS.ADD_PLAYER:
            game.addPlayer(action.payload.player);
            break;
        case ACTIONS.REMOVE_PLAYER: {
            const index = game.players.findIndex(p => p.id === action.payload.playerId);
            if (index !== -1) {
                game.players.splice(index, 1);
            }
            break;
        }
        case ACTIONS.START_HAND:
            action.payload.success = game.startGame();
            break;
        case ACTIONS.PLAYER_ACTION:
            game.handleAction(action.payload.playerId, action.payload.actionData);
            break;
        case ACTIONS.ADVANCE_STAGE:
            game.advanceStage();
            break;
        case ACTIONS.ADVANCE_RIT:
            game.advanceRitStage();
            break;
        case ACTIONS.DECLINE_RIT:
            game.declineRunItTwice();
            break;
        case ACTIONS.RIT_VOTE:
            game.voteRunItTwice(action.payload.playerIndex, action.payload.vote);
            break;
        case ACTIONS.RESET_WAITING:
            game.resetForWaiting();
            break;
        case ACTIONS.SET_SETTINGS:
            game.settings = action.payload.settings;
            break;
        case 'FORCE_EVALUATE':
            game.evaluateWinners();
            break;
        default:
            break;
    }

    return game.toJSON();
}

module.exports = { gameReducer, getGameState };
