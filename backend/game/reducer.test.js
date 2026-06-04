const { gameReducer, getInitialState } = require('./reducer');
const { ACTIONS, STAGES, STATUS } = require('./types');

describe('Game Reducer', () => {
    let state;

    beforeEach(() => {
        state = getInitialState('holdem', { smallBlind: 10, bigBlind: 20 });
    });

    test('Initial state is correct', () => {
        expect(state.stage).toBe(STAGES.WAITING);
        expect(state.players.length).toBe(0);
    });

    test('ADD_PLAYER adds a player', () => {
        state = gameReducer(state, { 
            type: ACTIONS.ADD_PLAYER, 
            payload: { player: { id: 'p1', name: 'Alice', chips: 1000 } } 
        });
        expect(state.players.length).toBe(1);
        expect(state.players[0].name).toBe('Alice');
        expect(state.players[0].status).toBe(STATUS.WAITING);
    });

    test('START_HAND with < 2 players does nothing', () => {
        state = gameReducer(state, { 
            type: ACTIONS.ADD_PLAYER, 
            payload: { player: { id: 'p1', name: 'Alice', chips: 1000 } } 
        });
        
        state = gameReducer(state, { type: ACTIONS.START_HAND });
        expect(state.stage).toBe(STAGES.WAITING);
    });

    test('START_HAND with 2 players correctly assigns blinds, dealer, cards', () => {
        state = gameReducer(state, { 
            type: ACTIONS.ADD_PLAYER, 
            payload: { player: { id: 'p1', name: 'Alice', chips: 1000 } } 
        });
        state = gameReducer(state, { 
            type: ACTIONS.ADD_PLAYER, 
            payload: { player: { id: 'p2', name: 'Bob', chips: 1000 } } 
        });

        // Set them to active or waiting so they get picked up
        // Wait, ADD_PLAYER sets to waiting. START_HAND picks up waiting players.
        
        state = gameReducer(state, { type: ACTIONS.START_HAND });
        
        expect(state.stage).toBe(STAGES.PREFLOP);
        expect(state.pot).toBe(30); // SB 10 + BB 20
        expect(state.currentHighestBet).toBe(20);
        
        // Heads-up: dealer is SB
        expect(state.dealerIndex).toBe(1); // Since dealerIndex starts at 0, advances to 1
        expect(state.sbIndex).toBe(1); // Bob
        expect(state.bbIndex).toBe(0); // Alice

        // Check chips
        expect(state.players[1].chips).toBe(990); // Bob pays 10
        expect(state.players[1].currentBet).toBe(10);
        
        expect(state.players[0].chips).toBe(980); // Alice pays 20
        expect(state.players[0].currentBet).toBe(20);

        // Turn is to Bob (SB acts first preflop in heads-up, which is player 1)
        // Wait, bbIndex is 0. Turn is bbIndex + 1 = 1. So Bob acts first. Correct.
        expect(state.currentTurn).toBe(1);
        
        // Check cards
        expect(state.players[0].hand.length).toBe(2);
        expect(state.players[1].hand.length).toBe(2);
    });
});
