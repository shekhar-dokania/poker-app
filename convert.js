const fs = require('fs');
let code = fs.readFileSync('backend/PokerGame.js', 'utf8');

// Extract the PokerGame class body
const start = code.indexOf('class PokerGame {');
const body = code.substring(start);

// Replace `this.` with `state.`
let newCode = body.replace(/this\./g, 'state.');

// Write it to a temporary file
fs.writeFileSync('backend/game/migrated_methods.js', newCode);
console.log("Done");
