const fs = require('fs');
let code = fs.readFileSync('src/screens/ReaderScreen.js', 'utf8');

const target = `        let utteranceDone = false;
        
        // Watchdog timer to catch iOS TTS silent hangs`;

const replacement = `        // Strip any residual HTML tags from TTS string to prevent SSML parsing crashes in iOS
        text = text.replace(/<[^>]*>?/gm, '');
        // Neutralize smart quotes to prevent NLP loop crashes in iOS 16+
        text = text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");

        let utteranceDone = false;
        
        // Watchdog timer to catch iOS TTS silent hangs`;

if (code.includes(target)) {
    code = code.replace(target, replacement);
    fs.writeFileSync('src/screens/ReaderScreen.js', code, 'utf8');
    console.log("SUCCESS");
} else {
    console.log("FAILED to find target");
}
