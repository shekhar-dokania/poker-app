const { gameReducer, getGameState } = require('./game/engine');
const { ACTIONS } = require('./game/types');

console.log("Testing engine...");
let state = gameReducer(null, { type: 'INIT' });
console.log("Init state stage:", state.stage);

state = gameReducer(state, { type: ACTIONS.ADD_PLAYER, payload: { player: { id: 'p1', name: 'Alice', chips: 1000 } } });
state = gameReducer(state, { type: ACTIONS.ADD_PLAYER, payload: { player: { id: 'p2', name: 'Bob', chips: 1000 } } });
const action = { type: ACTIONS.START_HAND, payload: {} };
state = gameReducer(state, action);
console.log("Success:", action.payload.success);
console.log("State stage after start:", state.stage);
console.log("State pot:", state.pot);

const gameState = getGameState(state);
console.log("GameState keys:", Object.keys(gameState));
console.log("Done");
