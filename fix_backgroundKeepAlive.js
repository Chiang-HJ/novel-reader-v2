const fs = require('fs');
let code = fs.readFileSync('src/utils/backgroundKeepAlive.js', 'utf8');

code = code.replace('InterruptionModeIOS?.MixWithOthers ?? 1', '1');
code = code.replace('InterruptionModeAndroid?.DuckOthers ?? 2', '2');

fs.writeFileSync('src/utils/backgroundKeepAlive.js', code, 'utf8');
