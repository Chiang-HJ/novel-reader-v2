const fs = require('fs');
let code = fs.readFileSync('src/screens/ReaderScreen.js', 'utf8');

const target = `        // Sanitize text for iOS TTS (remove zero-width chars and unpaired surrogates)
        text = text.replace(/[\\u200B-\\u200F\\uFEFF]/g, '');`;

const replacement = `        // Sanitize text for iOS TTS (remove zero-width chars and unpaired surrogates)
        text = text.replace(/[\\u200B-\\u200F\\uFEFF]/g, '');
        // Replace smart quotes with straight quotes to prevent iOS TTS NLP parsing crashes
        text = text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");`;

code = code.replace(target, replacement);
fs.writeFileSync('src/screens/ReaderScreen.js', code, 'utf8');
