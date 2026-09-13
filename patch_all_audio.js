const fs = require('fs');

const patchFile = (filepath) => {
    try {
        let code = fs.readFileSync(filepath, 'utf8');
        code = code.replace(/import\s+\{.*\}\s+from\s+['"]expo-av['"];/g, "import { Audio } from '../utils/safeAudio';");
        fs.writeFileSync(filepath, code, 'utf8');
        console.log('Patched ' + filepath);
    } catch(e) { console.log(e.message); }
};

patchFile('src/screens/VaultScreen.js');

let code2 = fs.readFileSync('src/utils/backgroundKeepAlive.js', 'utf8');
code2 = code2.replace(/import\s+\{.*\}\s+from\s+['"]expo-av['"];/g, "import { Audio } from './safeAudio';");
fs.writeFileSync('src/utils/backgroundKeepAlive.js', code2, 'utf8');
console.log('Patched src/utils/backgroundKeepAlive.js');

