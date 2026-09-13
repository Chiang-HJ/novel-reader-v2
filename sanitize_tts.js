const fs = require('fs');
let code = fs.readFileSync('src/screens/ReaderScreen.js', 'utf8');

const target = `        let text = sents[index];
        // Skip empty sentences`;

const replacement = `        let text = sents[index];
        
        // Sanitize text for iOS TTS (remove zero-width chars and unpaired surrogates)
        text = text.replace(/[\\u200B-\\u200F\\uFEFF]/g, '');
        
        // Skip empty sentences`;

code = code.replace(target, replacement);
fs.writeFileSync('src/screens/ReaderScreen.js', code, 'utf8');
