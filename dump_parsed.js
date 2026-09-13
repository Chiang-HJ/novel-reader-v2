const fs = require('fs');
const text = fs.readFileSync('ch_test_parsed.txt', 'utf8');
console.log(text.substring(0, 1500));
