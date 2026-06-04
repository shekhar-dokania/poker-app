const { gameReducer, getInitialState } = require('./reducer');
const { ACTIONS, STAGES, STATUS } = require('./types');
const assert = require('assert');

describe('Game Reducer', () => {
    let state;

    beforeEach(() => {
        state = getInitialState('holdem', { smallBlind: 10, bigBlind: 20 });
    });

    it('Initial state is correct', () => {
        assert.strictEqual(state.stage, STAGES.WAITING);
        assert.strictEqual(state.players.length, 0);
    });

    it('ADD_PLAYER adds a player', () => {
        state = gameReducer(state, { 
            type: ACTIONS.ADD_PLAYER, 
            payload: { player: { id: 'p1', name: 'Alice', chips: 1000 } } 
        });
        assert.strictEqual(state.players.length, 1);
        assert.strictEqual(state.players[0].name, 'Alice');
        assert.strictEqual(state.players[0].status, STATUS.WAITING);
    });

    it('START_HAND with < 2 players does nothing', () => {
        state = gameReducer(state, { 
            type: ACTIONS.ADD_PLAYER, 
            payload: { player: { id: 'p1', name: 'Alice', chips: 1000 } } 
        });
        
        state = gameReducer(state, { type: ACTIONS.START_HAND });
        assert.strictEqual(state.stage, STAGES.WAITING);
    });

    it('START_HAND with 2 players correctly assigns blinds, dealer, cards', () => {
        state = gameReducer(state, { 
            type: ACTIONS.ADD_PLAYER, 
            payload: { player: { id: 'p1', name: 'Alice', chips: 1000 } } 
        });
        state = gameReducer(state, { 
            type: ACTIONS.ADD_PLAYER, 
            payload: { player: { id: 'p2', name: 'Bob', chips: 1000 } } 
        });
        
        state = gameReducer(state, { type: ACTIONS.START_HAND });
        
        assert.strictEqual(state.stage, STAGES.PREFLOP);
        assert.strictEqual(state.pot, 30); // SB 10 + BB 20
        assert.strictEqual(state.currentHighestBet, 20);
        
        // Heads-up: dealer is SB
        assert.strictEqual(state.dealerIndex, 1); // Since dealerIndex starts at 0, advances to 1
        assert.strictEqual(state.sbIndex, 1); // Bob
        assert.strictEqual(state.bbIndex, 0); // Alice

        // Check chips
        assert.strictEqual(state.players[1].chips, 990); // Bob pays 10
        assert.strictEqual(state.players[1].currentBet, 10);
        
        assert.strictEqual(state.players[0].chips, 980); // Alice pays 20
        assert.strictEqual(state.players[0].currentBet, 20);

        assert.strictEqual(state.currentTurn, 1);
        
        // Check cards
        assert.strictEqual(state.players[0].hand.length, 2);
        assert.strictEqual(state.players[1].hand.length, 2);
    });
});
