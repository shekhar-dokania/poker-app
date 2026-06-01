const PokerGame = require('./PokerGame');

function runTest() {
    console.log("Starting test...");
    const game = new PokerGame('texas_holdem');
    
    // Setup players
    game.players = [
        { id: '1', name: 'Alice', chips: 0, hand: ['Ah', 'Ad'], currentBet: 50, potContribution: 50, status: 'all-in' },
        { id: '2', name: 'Bob', chips: 0, hand: ['Kh', 'Kd'], currentBet: 50, potContribution: 50, status: 'all-in' }
    ];
    game.pot = 100;
    game.communityCards = ['2c', '3c', '4c']; // flop
    game.deck.cards = ['5c', '6c', '7c', '8c', '9c', 'Tc', 'Jc', 'Qc'];
    
    game.stage = 'runItTwicePrompt';
    game.ritVotes = {};
    
    console.log("Voting Yes...");
    game.voteRunItTwice(0, true);
    game.voteRunItTwice(1, true);
    
    console.log("Stage after votes:", game.stage);
    console.log("RIT Data:", JSON.stringify(game.runItTwiceData));
    console.log("Test finished!");
}

try {
    runTest();
} catch(e) {
    console.error("CRASHED:", e);
}
