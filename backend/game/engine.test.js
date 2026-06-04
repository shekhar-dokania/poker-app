const { gameReducer } = require('./engine');
const { ACTIONS, STAGES, STATUS } = require('./types');

describe('Game Engine Reducer', () => {
    let state;

    beforeEach(() => {
        state = gameReducer(null, { type: 'INIT' });
    });

    test('Initial state is waiting', () => {
        expect(state.stage).toBe(STAGES.WAITING);
    });

    test('Full hand flow using pure actions', () => {
        state = gameReducer(state, { type: ACTIONS.ADD_PLAYER, payload: { player: { id: 'p1', name: 'Alice', chips: 1000 } }});
        state = gameReducer(state, { type: ACTIONS.ADD_PLAYER, payload: { player: { id: 'p2', name: 'Bob', chips: 1000 } }});
        
        state = gameReducer(state, { type: ACTIONS.START_HAND });
        expect(state.stage).toBe(STAGES.PREFLOP);
        
        // Bob is SB, Alice is BB. Bob's turn.
        // Bob calls (10 more)
        state = gameReducer(state, { type: ACTIONS.PLAYER_ACTION, payload: { playerId: 'p2', actionData: { action: 'call' } }});
        expect(state.currentTurn).toBe(0); // Alice's turn
        
        // Alice checks
        state = gameReducer(state, { type: ACTIONS.PLAYER_ACTION, payload: { playerId: 'p1', actionData: { action: 'check' } }});
        expect(state.stage).toBe(STAGES.FLOP);
    });
});
