const fs = require('fs');
let code = fs.readFileSync('src/screens/ReaderScreen.js', 'utf8');

code = code.replace("import { Audio } from 'expo-av';", "import { Audio } from '../utils/safeAudio';");

fs.writeFileSync('src/screens/ReaderScreen.js', code, 'utf8');
