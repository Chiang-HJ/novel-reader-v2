const fs = require('fs');
let lines = fs.readFileSync('src/screens/HomeScreen.js', 'utf8').split('\n');
lines[789] = '                                  ? "\u26a0\ufe0f \u7c3d\u540d\u5df2\u5230\u671f\uff0c\u8acb\u63a5\u4e0a\u96fb\u8166\u91cd\u65b0\u9a57\u8b49/\u7c3d\u540d\u3002"';
lines[790] = '                                  : `\u5269\u9918\u5230\t671f\u6642\u9593: ${Math.floor(sideloadDaysLeft)} \u5929 ${Math.floor((sideloadDaysLeft % 1) * 24)} \u5c0f\t6642`)';
lines[791] = "                                : '\u8a08\u7b97\u4e2d...'}";
fs.writeFileSync('src/screens/HomeScreen.js', lines.join('\n'), 'utf8');