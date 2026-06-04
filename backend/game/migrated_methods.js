class PokerGame {
  constructor(gameType = 'holdem', settings = {}) {
    state.gameType = gameType; // 'holdem' or 'plo'
    state.settings = {
        smallBlind: settings.smallBlind || 1,
        bigBlind: settings.bigBlind || 2,
        minBuyIn: settings.minBuyIn || 100,
        maxBuyIn: settings.maxBuyIn || 10000,
        turnTimeLimit: settings.turnTimeLimit || 30
    };
    state.players = []; // { id, name, chips, hand: [], currentBet: 0, potContribution: 0, status: 'active' | 'folded' | 'waiting' | 'all-in' | 'eliminated' }
    state.deck = new Deck();
    state.communityCards = [];
    state.pot = 0;
    state.currentTurn = 0;
    state.dealerIndex = 0;
    state.currentHighestBet = 0;
    state.currentMinRaise = state.settings.bigBlind; // Default to Big Blind
    state.handCount = 0;
    state.stage = 'waiting'; // waiting, preflop, flop, turn, river, handEnd
    state.turnStartTime = null;
    state.winnerInfo = null; // Store winner info
  }

  addPlayer(player) {
    // Only allow joining before the game starts or put them in 'waiting' state
    state.players.push({
      ...player,
      hand: [],
      currentBet: 0,
      potContribution: 0,
      isSittingOut: false,
      status: state.stage === 'waiting' ? 'active' : 'waiting'
    });
  }

  startGame() {
    // Remove players who stood up mid-hand
    state.players = state.players.filter(p => !p.isStandingUp);

    // Process queued reloads
    state.players.forEach(p => {
        if (p.queuedReload > 0) {
            p.chips += p.queuedReload;
            p.queuedReload = 0;
        }
    });

    // Clear hands and eliminate players with 0 chips
    state.players.forEach(p => {
       p.hand = [];
       p.revealedHand = [];
       p.currentBet = 0;
       p.potContribution = 0;
       p.hasActed = false;
       
       if (p.chips > 0 && p.status === 'eliminated') {
           p.status = 'waiting';
       }
        if (p.chips <= 0 && p.status !== 'disconnected') {
            p.status = 'eliminated';
        } else if (p.isSittingOut && p.status !== 'disconnected' && p.status !== 'eliminated') {
            p.status = 'sitting_out';
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

    const activePlayers = state.players.filter(p => p.status !== 'disconnected' && p.status !== 'eliminated' && !p.isSittingOut);
    if (activePlayers.length < 2) return false;
    
    state.players.forEach(p => {
      if (p.status !== 'disconnected' && p.status !== 'eliminated' && !p.isSittingOut) {
        p.status = 'active';
      }
    });

    state.deck.reset();
    state.currentMinRaise = state.settings.bigBlind;
    state.handCount++;
    state.stage = 'preflop';
    
    // Deal cards
    state.players.filter(p => p.status === 'active').forEach(p => {
      p.hand = state.deck.deal(state.gameType === 'plo' ? 4 : 2);
    });

    // Advance dealer button
    state.dealerIndex = (state.dealerIndex + 1) % state.players.length;
    while(state.players[state.dealerIndex].status !== 'active') {
       state.dealerIndex = (state.dealerIndex + 1) % state.players.length;
    }

    // Assign Small Blind / Big Blind
    let sbIndex, bbIndex;
    if (activePlayers.length === 2) {
       // Heads-up rules: Dealer is SB, other is BB
       sbIndex = state.dealerIndex;
       bbIndex = (state.dealerIndex + 1) % state.players.length;
       while(state.players[bbIndex].status !== 'active') {
          bbIndex = (bbIndex + 1) % state.players.length;
       }
    } else {
       sbIndex = (state.dealerIndex + 1) % state.players.length;
       while(state.players[sbIndex].status !== 'active') {
          sbIndex = (sbIndex + 1) % state.players.length;
       }
       bbIndex = (sbIndex + 1) % state.players.length;
       while(state.players[bbIndex].status !== 'active') {
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
    if (state.players[sbIndex].chips === 0) state.players[sbIndex].status = 'all-in';
    
    const bbAmount = Math.min(state.settings.bigBlind, state.players[bbIndex].chips);
    state.players[bbIndex].chips -= bbAmount;
    state.players[bbIndex].currentBet = bbAmount;
    state.players[bbIndex].potContribution += bbAmount;
    state.players[bbIndex].hasActed = false;
    if (state.players[bbIndex].chips === 0) state.players[bbIndex].status = 'all-in';
    
    state.pot += sbAmount + bbAmount;
    state.currentHighestBet = state.settings.bigBlind; // Treat BB size as highest bet for game logic

    // Action starts after BB
    state.currentTurn = (bbIndex + 1) % state.players.length;
    while(state.players[state.currentTurn].status !== 'active') {
       state.currentTurn = (state.currentTurn + 1) % state.players.length;
    }
    
    state.turnStartTime = Date.now();
    return true;
  }

  resetForWaiting() {
    state.stage = 'waiting';
    state.communityCards = [];
    state.pot = 0;
    state.currentHighestBet = 0;
    state.deck = new Deck();
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
        
        if (p.chips <= 0 && p.status !== 'disconnected') {
            p.status = 'eliminated';
        } else if (p.status === 'folded' || p.status === 'all-in' || p.status === 'active') {
            p.status = 'waiting';
        }
    });
  }

  handleAction(socketId, actionData) {
    const player = state.players.find(p => p.socketId === socketId || p.id === socketId);
    if (!player) return;

    if (state.stage === 'handEnd') {
        if (actionData.action === 'showCards') {
            player.revealedHand = player.hand;
        } else if (actionData.action === 'muckCards') {
            player.hand = []; // Clear hand so hasCards becomes false
        }
        return;
    }
    if (state.stage === 'waiting') return;
    if (state.players[state.currentTurn].id !== socketId) return; // Not their turn
    
    const { action, amount } = actionData;

    let validAction = false;

    if (action === 'fold') {
      player.status = 'folded';
      validAction = true;
    } else if (action === 'check') {
      if (player.currentBet === state.currentHighestBet) {
        validAction = true;
      }
    } else if (action === 'call') {
      const callAmount = state.currentHighestBet - player.currentBet;
      const actualCallAmount = Math.min(callAmount, player.chips);
      if (actualCallAmount >= 0) { // 0 for checking a check
        player.chips -= actualCallAmount;
        player.currentBet += actualCallAmount;
        player.potContribution += actualCallAmount;
        state.pot += actualCallAmount;
        validAction = true;
        if (player.chips === 0) player.status = 'all-in';
      }
    } else if (action === 'raise') {
      const totalAmountToPutIn = amount; // The additional chips added to currentBet
      const raiseToAmount = player.currentBet + totalAmountToPutIn;
      
      // Enforce PLO max limits
      let maxAllowedRaise = Infinity;
      if (state.gameType === 'plo') {
         const callAmount = state.currentHighestBet - player.currentBet;
         const mockPotAfterCall = state.pot + callAmount;
         maxAllowedRaise = state.currentHighestBet + mockPotAfterCall;
      }
      
      if (player.chips >= totalAmountToPutIn && raiseToAmount <= maxAllowedRaise) {
         const increment = raiseToAmount - state.currentHighestBet;
         if (increment >= state.currentMinRaise || player.chips === totalAmountToPutIn) { // Must meet min raise or go all in
             player.chips -= totalAmountToPutIn;
             player.currentBet += totalAmountToPutIn;
             player.potContribution += totalAmountToPutIn;
             
             if (raiseToAmount > state.currentHighestBet) {
                 state.currentMinRaise = Math.max(state.currentMinRaise, raiseToAmount - state.currentHighestBet);
                 state.currentHighestBet = raiseToAmount;
             }
             
             state.pot += totalAmountToPutIn;
             validAction = true;
             if (player.chips === 0) player.status = 'all-in';
         }
      }
    }

    if (validAction) {
       player.hasActed = true;
       state.advanceTurn();
    }
  }

  advanceTurn() {
    const activePlayers = state.players.filter(p => p.status === 'active');
    const allInPlayers = state.players.filter(p => p.status === 'all-in');
    const playersInHand = state.players.filter(p => p.status === 'active' || p.status === 'all-in');
    
    // Check if only 1 player left (everyone else folded or disconnected)
    if (playersInHand.length === 1) {
       state.stage = 'handEnd';
       state.winnerInfo = { winners: [playersInHand[0].name], description: "Default winner (others folded or disconnected)" };
       playersInHand[0].chips += state.pot;
       state.turnStartTime = Date.now();
       return;
    }

    // Check if betting round is over
    const allMatched = activePlayers.every(p => p.currentBet === state.currentHighestBet);
    const allActed = activePlayers.every(p => p.hasActed);
    
    if (allMatched && allActed) {
        state.returnUnmatchedBets();
        
        // Check if betting is effectively over for the hand (fast-forward to handEnd or RIT)
        if (activePlayers.length <= 1 && allInPlayers.length > 0) {
            if (state.communityCards.length < 5) {
                state.players.forEach(p => p.currentBet = 0);
                state.stage = 'runItTwicePrompt';
                state.ritVotes = {};
                state.turnStartTime = Date.now();
                if (state.turnTimer) clearTimeout(state.turnTimer);
            } else {
                state.isAllInShowdown = true;
                state.advanceStage();
            }
        } else {
            state.advanceStage();
        }
        return;
    }

    // Find next player
    do {
      state.currentTurn = (state.currentTurn + 1) % state.players.length;
    } while (state.players[state.currentTurn].status !== 'active');
    state.turnStartTime = Date.now();
  }
  returnUnmatchedBets() {
      const playersInHand = state.players.filter(p => p.status === 'active' || p.status === 'all-in');
      if (playersInHand.length < 2) return;

      const sortedByContrib = [...playersInHand].sort((a, b) => b.potContribution - a.potContribution);
      
      const highestContrib = sortedByContrib[0].potContribution;
      const secondHighestContrib = sortedByContrib[1].potContribution;

      if (highestContrib > secondHighestContrib) {
          const refundAmount = highestContrib - secondHighestContrib;
          sortedByContrib[0].potContribution -= refundAmount;
          sortedByContrib[0].currentBet -= refundAmount;
          sortedByContrib[0].chips += refundAmount;
          state.pot -= refundAmount;
      }
  }

  advanceStage() {
    // Reset bets and hasActed for the new round
    state.players.forEach(p => { 
        p.currentBet = 0; 
        if (p.status === 'active') p.hasActed = false;
    });
    state.currentHighestBet = 0;
    state.currentMinRaise = state.settings.bigBlind; // Reset min raise to BB size for the next round
    
    // First active player after dealer starts
    const activePlayers = state.players.filter(p => p.status === 'active');
    if (activePlayers.length > 0) {
        let nextStarter = (state.dealerIndex + 1) % state.players.length;
        while(state.players[nextStarter].status !== 'active') {
           nextStarter = (nextStarter + 1) % state.players.length;
        }
        state.currentTurn = nextStarter;
        state.turnStartTime = Date.now();
    }

    if (state.stage === 'preflop') {
      state.stage = 'flop';
      state.communityCards = state.deck.deal(3);
    } else if (state.stage === 'flop') {
      state.stage = 'turn';
      state.communityCards.push(...state.deck.deal(1));
    } else if (state.stage === 'turn') {
      state.stage = 'river';
      state.communityCards.push(...state.deck.deal(1));
    } else if (state.stage === 'river') {
      state.stage = 'handEnd';
      state.turnStartTime = Date.now();
      state.evaluateWinners();
    }

    if (state.isAllInShowdown && state.stage !== 'handEnd') {
        state.turnStartTime = Date.now();
    }
  }

  evaluateWinners() {
    const eligiblePlayers = state.players.filter(p => p.status === 'active' || p.status === 'all-in');
    
    // Pre-calculate solved hands for eligible players
    eligiblePlayers.forEach(p => {
        if (state.gameType === 'holdem') {
            const cardStrings = [...p.hand, ...state.communityCards];
            p.solvedHand = Hand.solve(cardStrings);
        } else {
            let bestPlayerHand = null;
            const holeCombos = getCombinations(p.hand, 2);
            const commCombos = getCombinations(state.communityCards, 3);
            
            holeCombos.forEach(hc => {
               commCombos.forEach(cc => {
                   const comboCards = [...hc, ...cc];
                   const solvedHand = Hand.solve(comboCards);
                   if (!bestPlayerHand || solvedHand.rank > bestPlayerHand.rank || (solvedHand.rank === bestPlayerHand.rank && solvedHand.value > bestPlayerHand.value)) {
                       if (!bestPlayerHand) {
                           bestPlayerHand = solvedHand;
                       } else {
                           const win = Hand.winners([bestPlayerHand, solvedHand]);
                           if (win[0] === solvedHand) bestPlayerHand = solvedHand;
                       }
                   }
               });
            });
            p.solvedHand = bestPlayerHand;
        }
    });

    let remainingPlayers = [...eligiblePlayers];
    remainingPlayers.sort((a, b) => a.potContribution - b.potContribution);
    
    const overallWinners = [];
    let bestHandDesc = "";

    let remainingPot = state.pot;

    // Iteratively resolve side pots
    while (remainingPlayers.length > 0 && remainingPot > 0) {
        const smallestCap = remainingPlayers[0].potContribution;
        
        if (smallestCap === 0) {
            remainingPlayers.shift();
            continue;
        }

        let sidePot = 0;
        let contributorsCount = 0;
        state.players.forEach(p => {
            if (p.potContribution > 0) {
                const deduction = Math.min(p.potContribution, smallestCap);
                p.potContribution -= deduction;
                sidePot += deduction;
                remainingPot -= deduction;
                contributorsCount++;
            }
        });

        const hands = remainingPlayers.map(p => {
            p.solvedHand.player = p;
            return p.solvedHand;
        });
        const winners = Hand.winners(hands);
        
        if (bestHandDesc === "") {
            bestHandDesc = winners[0].descr; // Capture the description of the main pot winner
        }
        
        const splitAmount = Math.floor(sidePot / winners.length);
        winners.forEach(w => {
            w.player.chips += splitAmount;
            w.player.revealedHand = w.player.hand;
            if (contributorsCount > 1) {
                if (!overallWinners.includes(w.player.name)) {
                    overallWinners.push(w.player.name);
                }
            }
        });

        // Filter out players who have no more contribution remaining
        remainingPlayers = remainingPlayers.filter(p => p.potContribution > 0);
    }

    state.winnerInfo = {
       winners: overallWinners,
       description: bestHandDesc
    };
  }

  declineRunItTwice() {
      if (state.stage !== 'runItTwicePrompt') return;
      if (state.turnTimer) clearTimeout(state.turnTimer);
      
      const cards = state.communityCards.length;
      if (cards === 0) state.stage = 'preflop';
      else if (cards === 3) state.stage = 'flop';
      else if (cards === 4) state.stage = 'turn';
      else state.stage = 'river';

      state.isAllInShowdown = true;
      state.advanceStage();
  }

  voteRunItTwice(playerIndex, vote) {
      if (state.stage !== 'runItTwicePrompt') return;
      
      const eligiblePlayers = state.players.filter(p => p.status === 'active' || p.status === 'all-in');
      const player = state.players[playerIndex];
      if (!eligiblePlayers.includes(player)) return;

      if (vote === false) {
          state.declineRunItTwice();
          return;
      }

      state.ritVotes[player.id] = true;
      
      const allVotedYes = eligiblePlayers.every(p => state.ritVotes[p.id]);
      if (allVotedYes) {
          state.executeRunItTwice();
      }
  }

  executeRunItTwice() {
      if (state.turnTimer) clearTimeout(state.turnTimer);
      
      state.ritOriginalPot = state.pot;
      state.ritOriginalContributions = state.players.map(p => p.potContribution);
      state.baseCommunityCards = [...state.communityCards];
      
      state.runItTwiceData = {
          board1: { communityCards: [...state.baseCommunityCards], winners: [] },
          board2: { communityCards: [...state.baseCommunityCards], winners: [] }
      };

      state.stage = 'ritShowdown';
      state.isRitShowdown = true;
      state.ritStage = 'board1';
      state.advanceRitStage();
  }

  advanceRitStage() {
      if (!state.isRitShowdown) return;
      
      const cardsNeeded = 5 - state.baseCommunityCards.length;
      
      if (state.ritStage === 'board1') {
          if (state.runItTwiceData.board1.communityCards.length < 5) {
              const cardsToDeal = state.runItTwiceData.board1.communityCards.length === 0 ? 3 : 1;
              state.runItTwiceData.board1.communityCards.push(...state.deck.deal(cardsToDeal));
          } else {
              // Board 1 complete, evaluate winners
              state.players.forEach((p, i) => {
                  p.potContribution = Math.ceil(state.ritOriginalContributions[i] / 2);
              });
              const tempComm = state.communityCards;
              state.communityCards = state.runItTwiceData.board1.communityCards;
              state.evaluateWinners();
              state.runItTwiceData.board1.winners = state.winnerInfo;
              state.communityCards = tempComm;
              
              state.ritStage = 'board2';
          }
      } else if (state.ritStage === 'board2') {
          if (state.runItTwiceData.board2.communityCards.length < 5) {
              const cardsToDeal = state.runItTwiceData.board2.communityCards.length === 0 ? 3 : 1;
              state.runItTwiceData.board2.communityCards.push(...state.deck.deal(cardsToDeal));
          } else {
              // Board 2 complete
              state.players.forEach((p, i) => {
                  p.potContribution = Math.floor(state.ritOriginalContributions[i] / 2);
              });
              const tempComm = state.communityCards;
              state.communityCards = state.runItTwiceData.board2.communityCards;
              state.evaluateWinners();
              state.runItTwiceData.board2.winners = state.winnerInfo;
              state.communityCards = tempComm;
              
              state.pot = state.ritOriginalPot;
              state.stage = 'handEnd';
              state.isRitShowdown = false;
          }
      }
      state.turnStartTime = Date.now();
  }

  getGameState() {
    return {
      stage: state.stage,
      communityCards: state.communityCards,
      pot: state.pot,
      currentTurn: (state.isAllInShowdown || state.isRitShowdown || state.stage === 'runItTwicePrompt' || state.stage === 'handEnd') ? -1 : state.currentTurn,
      currentHighestBet: state.currentHighestBet,
      currentMinRaise: state.currentMinRaise,
      gameType: state.gameType,
      turnStartTime: state.turnStartTime,
      turnTimeLimit: state.stage === 'runItTwicePrompt' ? 10 : state.settings.turnTimeLimit,
      winnerInfo: state.winnerInfo,
      runItTwiceData: state.runItTwiceData,
      ritVotes: state.ritVotes,
      handCount: state.handCount,
      isAllInShowdown: state.isAllInShowdown,
      isRitShowdown: state.isRitShowdown,
      ritOriginalPot: state.ritOriginalPot,
      ritStage: state.ritStage,
      players: state.players.map((p, i) => ({
         id: p.id,
         name: p.name,
         avatar: p.avatar,
         chips: p.chips,
         currentBet: p.currentBet,
         status: p.status,
         hasCards: p.hand.length > 0,
         revealedHand: p.revealedHand || [],
         isDealer: i === state.dealerIndex,
         isSB: i === state.sbIndex,
         isBB: i === state.bbIndex,
         isSittingOut: p.isSittingOut
      }))
    };
  }

  toJSON() {
    return {
      gameType: state.gameType,
      settings: {
          ...state.settings,
          turnTimeLimit: state.stage === 'runItTwicePrompt' ? 10 : state.settings.turnTimeLimit
      },
      players: state.players.map(p => {
          // Remove solvedHand to prevent circular JSON issues
          const { solvedHand, ...rest } = p;
          return rest;
      }),
      deck: state.deck.toJSON(),
      communityCards: state.communityCards,
      pot: state.pot,
      currentTurn: (state.isAllInShowdown || state.isRitShowdown || state.stage === 'runItTwicePrompt' || state.stage === 'handEnd') ? -1 : state.currentTurn,
      dealerIndex: state.dealerIndex,
      sbIndex: state.sbIndex,
      bbIndex: state.bbIndex,
      currentHighestBet: state.currentHighestBet,
      currentMinRaise: state.currentMinRaise,
      stage: state.stage,
      turnStartTime: state.turnStartTime,
      winnerInfo: state.winnerInfo,
      runItTwiceData: state.runItTwiceData,
      ritVotes: state.ritVotes,
      handCount: state.handCount,
      isAllInShowdown: state.isAllInShowdown,
      isRitShowdown: state.isRitShowdown,
      ritStage: state.ritStage,
      ritOriginalPot: state.ritOriginalPot,
      ritOriginalContributions: state.ritOriginalContributions,
      baseCommunityCards: state.baseCommunityCards
    };
  }

  static fromJSON(data) {
    if (!data) return null;
    const game = new PokerGame(data.gameType, data.settings);
    game.players = data.players || [];
    game.deck = Deck.fromJSON(data.deck || {});
    game.communityCards = data.communityCards || [];
    game.pot = data.pot || 0;
    game.currentTurn = data.currentTurn || 0;
    game.dealerIndex = data.dealerIndex || 0;
    game.sbIndex = data.sbIndex || 0;
    game.bbIndex = data.bbIndex || 0;
    game.currentHighestBet = data.currentHighestBet || 0;
    game.currentMinRaise = data.currentMinRaise || game.settings.bigBlind;
    game.stage = data.stage || 'waiting';
    game.turnStartTime = data.turnStartTime || null;
    game.winnerInfo = data.winnerInfo || null;
    game.runItTwiceData = data.runItTwiceData || null;
    game.ritVotes = data.ritVotes || {};
    game.handCount = data.handCount || 0;
    game.isAllInShowdown = data.isAllInShowdown || false;
    game.isRitShowdown = data.isRitShowdown || false;
    game.ritStage = data.ritStage || 'board1';
    game.ritOriginalPot = data.ritOriginalPot || 0;
    game.ritOriginalContributions = data.ritOriginalContributions || [];
    game.baseCommunityCards = data.baseCommunityCards || [];
    return game;
  }
}

// Utility for PLO combinations
function getCombinations(arr, size) {
    if (size === 1) return arr.map(val => [val]);
    const combos = [];
    arr.forEach((val, i) => {
        const smallerCombos = getCombinations(arr.slice(i + 1), size - 1);
        smallerCombos.forEach(sc => {
            combos.push([val, ...sc]);
        });
    });
    return combos;
}

module.exports = PokerGame;
