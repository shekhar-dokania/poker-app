const { STAGES, STATUS, ACTIONS } = require('./types');

// --- Utilities ---
function createDeck() {
    const cards = [];
    const suits = ['h', 'd', 's', 'c'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
    for (let suit of suits) {
        for (let rank of ranks) {
            cards.push(`${rank}${suit}`);
        }
    }
    for (let i = cards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
}

function getInitialState(gameType = 'holdem', settings = {}) {
    return {
        gameType,
        settings: {
            smallBlind: settings.smallBlind || 1,
            bigBlind: settings.bigBlind || 2,
            minBuyIn: settings.minBuyIn || 100,
            maxBuyIn: settings.maxBuyIn || 10000,
            turnTimeLimit: settings.turnTimeLimit || 30
        },
        players: [],
        deck: [],
        communityCards: [],
        pot: 0,
        currentTurn: -1,
        dealerIndex: 0,
        sbIndex: 0,
        bbIndex: 0,
        currentHighestBet: 0,
        currentMinRaise: settings.bigBlind || 2,
        handCount: 0,
        stage: STAGES.WAITING,
        turnStartTime: null,
        winnerInfo: null,
        isAllInShowdown: false,
        isRitShowdown: false,
        ritStage: 'board1',
        ritOriginalPot: 0,
        ritOriginalContributions: [],
        baseCommunityCards: [],
        runItTwicePromptStartTime: null,
        runItTwiceData: null,
        ritVotes: {}
    };
}

// --- Mutations (Pure if passed a cloned state) ---

function resetForWaiting(state) {
    state.stage = STAGES.WAITING;
    state.communityCards = [];
    state.pot = 0;
    state.currentHighestBet = 0;
    state.deck = createDeck();
    state.winnerInfo = null;
    state.runItTwicePromptStartTime = null;
    state.runItTwiceData = null;
    state.isAllInShowdown = false;
    state.isRitShowdown = false;
    
    state.players.forEach(p => {
        p.hand = [];
        p.revealedHand = [];
        p.currentBet = 0;
        p.potContribution = 0;
        p.hasActed = false;
        p.runItTwiceVote = null;
        
        if (p.chips <= 0 && p.status !== STATUS.DISCONNECTED) {
            p.status = STATUS.ELIMINATED;
        } else if (p.status === STATUS.FOLDED || p.status === STATUS.ALL_IN || p.status === STATUS.ACTIVE) {
            p.status = STATUS.WAITING;
        }
    });
}

function startHand(state, action) {
    // Process queued reloads before hand starts
    state.players.forEach(p => {
        if (p.queuedReload && p.queuedReload > 0) {
            p.chips += p.queuedReload;
            p.queuedReload = 0;
        }
    });

    state.players.forEach(p => {
       p.hand = [];
       p.revealedHand = [];
       p.currentBet = 0;
       p.potContribution = 0;
       p.hasActed = false;
       
       if (p.chips > 0 && p.status === STATUS.ELIMINATED) {
           p.status = STATUS.WAITING;
       }
        if (p.chips <= 0 && p.status !== STATUS.DISCONNECTED) {
            p.status = STATUS.ELIMINATED;
        } else if (p.isSittingOut && p.status !== STATUS.DISCONNECTED && p.status !== STATUS.ELIMINATED) {
            p.status = STATUS.SITTING_OUT;
        }
     });

     state.communityCards = [];
     state.pot = 0;
     state.currentHighestBet = 0;
     state.winnerInfo = null;
     state.runItTwiceData = null;
     state.ritVotes = {};
     state.currentTurn = -1;
     state.turnStartTime = null;
     state.isAllInShowdown = false;
     state.isRitShowdown = false;
     state.ritStage = 'board1';
     state.ritOriginalPot = 0;
     state.ritOriginalContributions = [];

    const activePlayers = state.players.filter(p => p.status !== STATUS.DISCONNECTED && p.status !== STATUS.ELIMINATED && !p.isSittingOut);
    if (activePlayers.length < 2) return false;
    
    state.players.forEach(p => {
      if (p.status !== STATUS.DISCONNECTED && p.status !== STATUS.ELIMINATED && !p.isSittingOut) {
        p.status = STATUS.ACTIVE;
      }
    });

    state.deck = action.payload?.deck || createDeck();
    state.currentMinRaise = state.settings.bigBlind;
    state.handCount++;
    state.stage = STAGES.PREFLOP;
    
    // Deal cards
    state.players.filter(p => p.status === STATUS.ACTIVE).forEach(p => {
      p.hand = state.deck.splice(0, state.gameType === 'plo' ? 4 : 2);
    });

    // Advance dealer button
    state.dealerIndex = (state.dealerIndex + 1) % state.players.length;
    while(state.players[state.dealerIndex].status !== STATUS.ACTIVE) {
       state.dealerIndex = (state.dealerIndex + 1) % state.players.length;
    }

    // Assign Small Blind / Big Blind
    let sbIndex, bbIndex;
    if (activePlayers.length === 2) {
       sbIndex = state.dealerIndex;
       bbIndex = (state.dealerIndex + 1) % state.players.length;
       while(state.players[bbIndex].status !== STATUS.ACTIVE) {
          bbIndex = (bbIndex + 1) % state.players.length;
       }
    } else {
       sbIndex = (state.dealerIndex + 1) % state.players.length;
       while(state.players[sbIndex].status !== STATUS.ACTIVE) {
          sbIndex = (sbIndex + 1) % state.players.length;
       }
       bbIndex = (sbIndex + 1) % state.players.length;
       while(state.players[bbIndex].status !== STATUS.ACTIVE) {
          bbIndex = (bbIndex + 1) % state.players.length;
       }
    }
    
    state.sbIndex = sbIndex;
    state.bbIndex = bbIndex;
    
    const sbAmount = Math.min(state.settings.smallBlind, state.players[sbIndex].chips);
    state.players[sbIndex].chips -= sbAmount;
    state.players[sbIndex].currentBet = sbAmount;
    state.players[sbIndex].potContribution += sbAmount;
    state.players[sbIndex].hasActed = false;
    if (state.players[sbIndex].chips === 0) state.players[sbIndex].status = STATUS.ALL_IN;
    
    const bbAmount = Math.min(state.settings.bigBlind, state.players[bbIndex].chips);
    state.players[bbIndex].chips -= bbAmount;
    state.players[bbIndex].currentBet = bbAmount;
    state.players[bbIndex].potContribution += bbAmount;
    state.players[bbIndex].hasActed = false;
    if (state.players[bbIndex].chips === 0) state.players[bbIndex].status = STATUS.ALL_IN;
    
    state.pot += sbAmount + bbAmount;
    state.currentHighestBet = state.settings.bigBlind;
    
    // Action starts after BB
    state.currentTurn = (bbIndex + 1) % state.players.length;
    while(state.players[state.currentTurn].status !== STATUS.ACTIVE) {
       state.currentTurn = (state.currentTurn + 1) % state.players.length;
    }
    
    state.turnStartTime = action.payload?.now || Date.now();
    return true;
}

// --- Core Reducer ---
function gameReducer(prevState, action) {
    if (!prevState) return getInitialState();
    
    // Deep clone the state to act as a pure reducer (simulating Immer)
    const state = JSON.parse(JSON.stringify(prevState));

    switch (action.type) {
        case ACTIONS.ADD_PLAYER: {
            const { player } = action.payload;
            state.players.push({
                ...player,
                hand: [],
                revealedHand: [],
                currentBet: 0,
                potContribution: 0,
                status: STATUS.WAITING,
                hasActed: false,
                isSittingOut: false,
                runItTwiceVote: null,
                queuedReload: 0
            });
            break;
        }
        case ACTIONS.RESET_WAITING: {
            resetForWaiting(state);
            break;
        }
        case ACTIONS.START_HAND: {
            startHand(state, action);
            break;
        }
    }

    return state;
}

module.exports = { gameReducer, getInitialState, createDeck };
