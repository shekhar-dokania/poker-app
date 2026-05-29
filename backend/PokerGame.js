const Hand = require('pokersolver').Hand;

class Deck {
  constructor() {
    this.cards = [];
    this.reset();
  }

  reset() {
    this.cards = [];
    const suits = ['h', 'd', 's', 'c'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
    
    for (let suit of suits) {
      for (let rank of ranks) {
        this.cards.push(`${rank}${suit}`);
      }
    }
    this.shuffle();
  }

  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  deal(num) {
    return this.cards.splice(0, num);
  }

  toJSON() {
    return { cards: this.cards };
  }

  static fromJSON(data) {
    const deck = new Deck();
    if (data && data.cards) {
        deck.cards = data.cards;
    }
    return deck;
  }
}

class PokerGame {
  constructor(gameType = 'holdem', settings = {}) {
    this.gameType = gameType; // 'holdem' or 'plo'
    this.settings = {
        smallBlind: settings.smallBlind || 1,
        bigBlind: settings.bigBlind || 2,
        minBuyIn: settings.minBuyIn || 100,
        maxBuyIn: settings.maxBuyIn || 10000,
        turnTimeLimit: settings.turnTimeLimit || 30
    };
    this.players = []; // { id, name, chips, hand: [], currentBet: 0, potContribution: 0, status: 'active' | 'folded' | 'waiting' | 'all-in' | 'eliminated' }
    this.deck = new Deck();
    this.communityCards = [];
    this.pot = 0;
    this.currentTurn = 0;
    this.dealerIndex = 0;
    this.currentHighestBet = 0;
    this.currentMinRaise = this.settings.bigBlind; // Default to Big Blind
    this.handCount = 0;
    this.stage = 'waiting'; // waiting, preflop, flop, turn, river, handEnd
    this.turnStartTime = null;
    this.winnerInfo = null; // Store winner info
  }

  addPlayer(player) {
    // Only allow joining before the game starts or put them in 'waiting' state
    this.players.push({
      ...player,
      hand: [],
      currentBet: 0,
      potContribution: 0,
      isSittingOut: false,
      status: this.stage === 'waiting' ? 'active' : 'waiting'
    });
  }

  startGame() {
    // Remove players who stood up mid-hand
    this.players = this.players.filter(p => !p.isStandingUp);

    // Process queued reloads
    this.players.forEach(p => {
        if (p.queuedReload > 0) {
            p.chips += p.queuedReload;
            p.queuedReload = 0;
        }
    });

    // Clear hands and eliminate players with 0 chips
    this.players.forEach(p => {
       p.hand = [];
       p.revealedHand = [];
       if (p.chips > 0 && p.status === 'eliminated') {
           p.status = 'waiting';
       }
       if (p.chips <= 0 && p.status !== 'disconnected') {
           p.status = 'eliminated';
       } else if (p.isSittingOut && p.status !== 'disconnected' && p.status !== 'eliminated') {
           p.status = 'sitting_out';
       }
    });

    const activePlayers = this.players.filter(p => p.status !== 'disconnected' && p.status !== 'eliminated' && !p.isSittingOut);
    if (activePlayers.length < 2) return false;
    
    this.players.forEach(p => {
      if (p.status !== 'disconnected' && p.status !== 'eliminated' && !p.isSittingOut) {
        p.status = 'active';
        p.currentBet = 0;
        p.potContribution = 0;
      }
    });

    this.deck.reset();
    this.communityCards = [];
    this.pot = 0;
    this.currentHighestBet = 0;
    this.currentMinRaise = this.settings.bigBlind;
    this.winnerInfo = null;
    this.handCount++;
    this.stage = 'preflop';
    
    // Deal cards
    this.players.filter(p => p.status === 'active').forEach(p => {
      p.hand = this.deck.deal(this.gameType === 'plo' ? 4 : 2);
    });

    // Advance dealer button
    this.dealerIndex = (this.dealerIndex + 1) % this.players.length;
    while(this.players[this.dealerIndex].status !== 'active') {
       this.dealerIndex = (this.dealerIndex + 1) % this.players.length;
    }

    // Assign Small Blind / Big Blind
    let sbIndex, bbIndex;
    if (activePlayers.length === 2) {
       // Heads-up rules: Dealer is SB, other is BB
       sbIndex = this.dealerIndex;
       bbIndex = (this.dealerIndex + 1) % this.players.length;
       while(this.players[bbIndex].status !== 'active') {
          bbIndex = (bbIndex + 1) % this.players.length;
       }
    } else {
       sbIndex = (this.dealerIndex + 1) % this.players.length;
       while(this.players[sbIndex].status !== 'active') {
          sbIndex = (sbIndex + 1) % this.players.length;
       }
       bbIndex = (sbIndex + 1) % this.players.length;
       while(this.players[bbIndex].status !== 'active') {
          bbIndex = (bbIndex + 1) % this.players.length;
       }
    }
    
    this.sbIndex = sbIndex;
    this.bbIndex = bbIndex;
    
    const sbAmount = Math.min(this.settings.smallBlind, this.players[sbIndex].chips);
    this.players[sbIndex].chips -= sbAmount;
    this.players[sbIndex].currentBet = sbAmount;
    this.players[sbIndex].potContribution += sbAmount;
    this.players[sbIndex].hasActed = false;
    if (this.players[sbIndex].chips === 0) this.players[sbIndex].status = 'all-in';
    
    const bbAmount = Math.min(this.settings.bigBlind, this.players[bbIndex].chips);
    this.players[bbIndex].chips -= bbAmount;
    this.players[bbIndex].currentBet = bbAmount;
    this.players[bbIndex].potContribution += bbAmount;
    this.players[bbIndex].hasActed = false;
    if (this.players[bbIndex].chips === 0) this.players[bbIndex].status = 'all-in';
    
    this.pot += sbAmount + bbAmount;
    this.currentHighestBet = this.settings.bigBlind; // Treat BB size as highest bet for game logic

    // Action starts after BB
    this.currentTurn = (bbIndex + 1) % this.players.length;
    while(this.players[this.currentTurn].status !== 'active') {
       this.currentTurn = (this.currentTurn + 1) % this.players.length;
    }
    
    this.turnStartTime = Date.now();
    return true;
  }

  handleAction(socketId, actionData) {
    const player = this.players.find(p => p.socketId === socketId || p.id === socketId);
    if (!player) return;

    if (this.stage === 'handEnd') {
        if (actionData.action === 'showCards') {
            player.revealedHand = player.hand;
        } else if (actionData.action === 'muckCards') {
            player.hand = []; // Clear hand so hasCards becomes false
        }
        return;
    }
    if (this.stage === 'waiting') return;
    if (this.players[this.currentTurn].id !== socketId) return; // Not their turn
    
    const { action, amount } = actionData;

    let validAction = false;

    if (action === 'fold') {
      player.status = 'folded';
      validAction = true;
    } else if (action === 'check') {
      if (player.currentBet === this.currentHighestBet) {
        validAction = true;
      }
    } else if (action === 'call') {
      const callAmount = this.currentHighestBet - player.currentBet;
      const actualCallAmount = Math.min(callAmount, player.chips);
      if (actualCallAmount >= 0) { // 0 for checking a check
        player.chips -= actualCallAmount;
        player.currentBet += actualCallAmount;
        player.potContribution += actualCallAmount;
        this.pot += actualCallAmount;
        validAction = true;
        if (player.chips === 0) player.status = 'all-in';
      }
    } else if (action === 'raise') {
      const totalAmountToPutIn = amount; // The additional chips added to currentBet
      const raiseToAmount = player.currentBet + totalAmountToPutIn;
      
      // Enforce PLO max limits
      let maxAllowedRaise = Infinity;
      if (this.gameType === 'plo') {
         const callAmount = this.currentHighestBet - player.currentBet;
         const mockPotAfterCall = this.pot + callAmount;
         maxAllowedRaise = this.currentHighestBet + mockPotAfterCall;
      }
      
      if (player.chips >= totalAmountToPutIn && raiseToAmount <= maxAllowedRaise) {
         const increment = raiseToAmount - this.currentHighestBet;
         if (increment >= this.currentMinRaise || player.chips === totalAmountToPutIn) { // Must meet min raise or go all in
             player.chips -= totalAmountToPutIn;
             player.currentBet += totalAmountToPutIn;
             player.potContribution += totalAmountToPutIn;
             
             if (raiseToAmount > this.currentHighestBet) {
                 this.currentMinRaise = Math.max(this.currentMinRaise, raiseToAmount - this.currentHighestBet);
                 this.currentHighestBet = raiseToAmount;
             }
             
             this.pot += totalAmountToPutIn;
             validAction = true;
             if (player.chips === 0) player.status = 'all-in';
         }
      }
    }

    if (validAction) {
       player.hasActed = true;
       this.advanceTurn();
    }
  }

  advanceTurn() {
    const activePlayers = this.players.filter(p => p.status === 'active');
    const allInPlayers = this.players.filter(p => p.status === 'all-in');
    
    // Check if only 1 player left (everyone else folded)
    if (activePlayers.length === 1 && allInPlayers.length === 0) {
       this.stage = 'handEnd';
       this.winnerInfo = { winners: [activePlayers[0].name], description: "Default winner (others folded)" };
       activePlayers[0].chips += this.pot;
       this.turnStartTime = Date.now();
       return;
    }

    // Check if betting round is over
    const allMatched = activePlayers.every(p => p.currentBet === this.currentHighestBet);
    const allActed = activePlayers.every(p => p.hasActed);
    
    if (allMatched && allActed) {
        // Check if betting is effectively over for the hand (fast-forward to handEnd)
        if (activePlayers.length <= 1 && allInPlayers.length > 0) {
            while (this.stage !== 'handEnd') {
               this.advanceStage();
            }
        } else {
            this.advanceStage();
        }
        return;
    }

    // Find next player
    do {
      this.currentTurn = (this.currentTurn + 1) % this.players.length;
    } while (this.players[this.currentTurn].status !== 'active');
    this.turnStartTime = Date.now();
  }

  advanceStage() {
    // Reset bets and hasActed for the new round
    this.players.forEach(p => { 
        p.currentBet = 0; 
        if (p.status === 'active') p.hasActed = false;
    });
    this.currentHighestBet = 0;
    this.currentMinRaise = this.settings.bigBlind; // Reset min raise to BB size for the next round
    
    // First active player after dealer starts
    const activePlayers = this.players.filter(p => p.status === 'active');
    if (activePlayers.length > 0) {
        let nextStarter = (this.dealerIndex + 1) % this.players.length;
        while(this.players[nextStarter].status !== 'active') {
           nextStarter = (nextStarter + 1) % this.players.length;
        }
        this.currentTurn = nextStarter;
        this.turnStartTime = Date.now();
    }

    if (this.stage === 'preflop') {
      this.stage = 'flop';
      this.communityCards = this.deck.deal(3);
    } else if (this.stage === 'flop') {
      this.stage = 'turn';
      this.communityCards.push(...this.deck.deal(1));
    } else if (this.stage === 'turn') {
      this.stage = 'river';
      this.communityCards.push(...this.deck.deal(1));
    } else if (this.stage === 'river') {
      this.stage = 'handEnd';
      this.turnStartTime = Date.now();
      this.evaluateWinners();
    }
  }

  evaluateWinners() {
    const eligiblePlayers = this.players.filter(p => p.status === 'active' || p.status === 'all-in');
    
    // Pre-calculate solved hands for eligible players
    eligiblePlayers.forEach(p => {
        if (this.gameType === 'holdem') {
            const cardStrings = [...p.hand, ...this.communityCards];
            p.solvedHand = Hand.solve(cardStrings);
        } else {
            let bestPlayerHand = null;
            const holeCombos = getCombinations(p.hand, 2);
            const commCombos = getCombinations(this.communityCards, 3);
            
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

    let remainingPot = this.pot;

    // Iteratively resolve side pots
    while (remainingPlayers.length > 0 && remainingPot > 0) {
        const smallestCap = remainingPlayers[0].potContribution;
        
        if (smallestCap === 0) {
            remainingPlayers.shift();
            continue;
        }

        let sidePot = 0;
        this.players.forEach(p => {
            if (p.potContribution > 0) {
                const deduction = Math.min(p.potContribution, smallestCap);
                p.potContribution -= deduction;
                sidePot += deduction;
                remainingPot -= deduction;
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
            if (!overallWinners.includes(w.player.name)) {
                overallWinners.push(w.player.name);
            }
        });

        // Filter out players who have no more contribution remaining
        remainingPlayers = remainingPlayers.filter(p => p.potContribution > 0);
    }

    this.winnerInfo = {
       winners: overallWinners,
       description: bestHandDesc
    };
  }

  getGameState() {
    return {
      stage: this.stage,
      communityCards: this.communityCards,
      pot: this.pot,
      currentTurn: this.currentTurn,
      currentHighestBet: this.currentHighestBet,
      currentMinRaise: this.currentMinRaise,
      gameType: this.gameType,
      turnStartTime: this.turnStartTime,
      turnTimeLimit: this.settings.turnTimeLimit,
      winnerInfo: this.winnerInfo,
      handCount: this.handCount,
      players: this.players.map((p, i) => ({
         id: p.id,
         name: p.name,
         chips: p.chips,
         currentBet: p.currentBet,
         status: p.status,
         hasCards: p.hand.length > 0,
         revealedHand: p.revealedHand || [],
         isDealer: i === this.dealerIndex,
         isSB: i === this.sbIndex,
         isBB: i === this.bbIndex,
         isSittingOut: p.isSittingOut
      }))
    };
  }

  toJSON() {
    return {
      gameType: this.gameType,
      settings: this.settings,
      players: this.players.map(p => {
          // Remove solvedHand to prevent circular JSON issues
          const { solvedHand, ...rest } = p;
          return rest;
      }),
      deck: this.deck.toJSON(),
      communityCards: this.communityCards,
      pot: this.pot,
      currentTurn: this.currentTurn,
      dealerIndex: this.dealerIndex,
      sbIndex: this.sbIndex,
      bbIndex: this.bbIndex,
      currentHighestBet: this.currentHighestBet,
      currentMinRaise: this.currentMinRaise,
      stage: this.stage,
      turnStartTime: this.turnStartTime,
      winnerInfo: this.winnerInfo,
      handCount: this.handCount
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
    game.handCount = data.handCount || 0;
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
