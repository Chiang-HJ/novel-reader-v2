const fs = require('fs');
let lines = fs.readFileSync('src/screens/HomeScreen.js', 'utf8').split('\n');
lines[790] = '                                  : `\u5269\u9918\u5230\u671f\u6642\u9593: ${Math.floor(sideloadDaysLeft)} \u5929 ${Math.floor((sideloadDaysLeft % 1) * 24)} \u5c0f\u6642`)';
fs.writeFileSync('src/screens/HomeScreen.js', lines.join('\n'), 'utf8');
