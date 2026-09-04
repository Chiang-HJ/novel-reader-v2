const fs = require('fs');
let lines = fs.readFileSync('src/screens/HomeScreen.js', 'utf8').split('\n');
lines[790] = '                                  : `剩��~刌珟時間: ${Math.floor(sideloadDaysLeft)} 天 ${Math.floor((sideloadDaysLeft % 1) * 24)} 小時`)';
fs.writeFileSync('src/screens/HomeScreen.js', lines.join('\n'), 'utf8');