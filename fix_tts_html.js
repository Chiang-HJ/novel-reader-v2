const fs = require('fs');
let code = fs.readFileSync('src/screens/ReaderScreen.js', 'utf8');

const target = `        // Replace smart quotes with straight quotes to prevent iOS TTS NLP parsing crashes
        text = text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");`;

const replacement = `        // Replace smart quotes with straight quotes to prevent iOS TTS NLP parsing crashes
        text = text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
        // Strip any residual HTML tags from TTS string to prevent SSML parsing crashes in iOS
        text = text.replace(/<[^>]*>?/gm, '');`;

code = code.replace(target, replacement);
fs.writeFileSync('src/screens/ReaderScreen.js', code, 'utf8');
