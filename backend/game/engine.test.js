const { gameReducer } = require('./engine');
const { ACTIONS, STAGES, STATUS } = require('./types');
const assert = require('assert');

describe('Game Engine Reducer', () => {
    let state;

    beforeEach(() => {
        state = gameReducer(null, { type: 'INIT' });
    });

    it('Initial state is waiting', () => {
        assert.strictEqual(state.stage, STAGES.WAITING);
    });

    it('Full hand flow using pure actions', () => {
        state = gameReducer(state, { type: ACTIONS.ADD_PLAYER, payload: { player: { id: 'p1', name: 'Alice', chips: 1000 } }});
        state = gameReducer(state, { type: ACTIONS.ADD_PLAYER, payload: { player: { id: 'p2', name: 'Bob', chips: 1000 } }});
        
        state = gameReducer(state, { type: ACTIONS.START_HAND });
        assert.strictEqual(state.stage, STAGES.PREFLOP);
        
        // Bob is SB, Alice is BB. Bob's turn.
        // Bob calls (10 more)
        state = gameReducer(state, { type: ACTIONS.PLAYER_ACTION, payload: { playerId: 'p2', actionData: { action: 'call' } }});
        assert.strictEqual(state.currentTurn, 0); // Alice's turn
        
        // Alice checks
        state = gameReducer(state, { type: ACTIONS.PLAYER_ACTION, payload: { playerId: 'p1', actionData: { action: 'check' } }});
        assert.strictEqual(state.stage, STAGES.FLOP);
    });
});
