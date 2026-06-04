const STAGES = {
    WAITING: 'waiting',
    PREFLOP: 'preflop',
    FLOP: 'flop',
    TURN: 'turn',
    RIVER: 'river',
    HAND_END: 'handEnd',
    RIT_PROMPT: 'runItTwicePrompt'
};

const STATUS = {
    ACTIVE: 'active',
    FOLDED: 'folded',
    ALL_IN: 'all-in',
    SITTING_OUT: 'sitting_out',
    WAITING: 'waiting',
    ELIMINATED: 'eliminated',
    DISCONNECTED: 'disconnected'
};

const ACTIONS = {
    ADD_PLAYER: 'ADD_PLAYER',
    REMOVE_PLAYER: 'REMOVE_PLAYER',
    SIT_OUT: 'SIT_OUT',
    RETURN_TO_SEAT: 'RETURN_TO_SEAT',
    BUY_IN: 'BUY_IN',
    START_HAND: 'START_HAND',
    PLAYER_ACTION: 'PLAYER_ACTION', // { playerId, action: 'fold'|'check'|'call'|'raise', amount? }
    ADVANCE_STAGE: 'ADVANCE_STAGE', // Forced advance for all-in
    RIT_VOTE: 'RIT_VOTE', // { playerId, vote: true/false }
    ADVANCE_RIT: 'ADVANCE_RIT',
    DECLINE_RIT: 'DECLINE_RIT',
    RESET_WAITING: 'RESET_WAITING',
    SET_SETTINGS: 'SET_SETTINGS'
};

module.exports = { STAGES, STATUS, ACTIONS };
