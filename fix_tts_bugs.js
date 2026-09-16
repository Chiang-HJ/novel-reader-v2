const fs = require('fs');
let code = fs.readFileSync('src/screens/ReaderScreen.js', 'utf8');

// 1. Fix watchdog timer
const watchdogOld = 'const maxExpectedDurationMs = Math.max(8000, text.length * 80);';
const watchdogNew = 'const maxExpectedDurationMs = Math.max(15000, text.length * 500); // 500ms per char max to prevent cutting off slow speech';
if (code.includes(watchdogOld)) {
    code = code.replace(watchdogOld, watchdogNew);
    console.log('Fixed watchdog timer');
}

// 2. Strip HTML entities
const sanitizeOld = `        // Strip any residual HTML tags from TTS string to prevent SSML parsing crashes in iOS\r
        text = text.replace(/<[^>]*>?/gm, '');\r
        // Neutralize smart quotes to prevent NLP loop crashes in iOS 16+\r
        text = text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");`;
const sanitizeNew = `        // Strip any residual HTML tags from TTS string to prevent SSML parsing crashes in iOS\r
        text = text.replace(/<[^>]*>?/gm, '');\r
        // Strip leftover HTML entities (like &#160;, &emsp;) which TTS might read out loud as "m160" or weird codes\r
        text = text.replace(/&[#a-zA-Z0-9]+;/g, ' ');\r
        // Neutralize smart quotes to prevent NLP loop crashes in iOS 16+\r
        text = text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");`;
        
if (code.includes(sanitizeOld)) {
    code = code.replace(sanitizeOld, sanitizeNew);
    console.log('Fixed TTS sanitization (CRLF)');
} else {
    // try LF
    const sanitizeOldLF = sanitizeOld.replace(/\r/g, '');
    const sanitizeNewLF = sanitizeNew.replace(/\r/g, '');
    if (code.includes(sanitizeOldLF)) {
        code = code.replace(sanitizeOldLF, sanitizeNewLF);
        console.log('Fixed TTS sanitization (LF)');
    } else {
        console.log('WARNING: TTS sanitization target not found');
    }
}

fs.writeFileSync('src/screens/ReaderScreen.js', code, 'utf8');
