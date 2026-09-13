const fs = require('fs');
let code = fs.readFileSync('app.json', 'utf8');
code = code.replace('"deploymentTarget": "15.5"', '"deploymentTarget": "16.4"');
fs.writeFileSync('app.json', code, 'utf8');
