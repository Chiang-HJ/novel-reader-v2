const fs = require('fs');
let code = fs.readFileSync('src/utils/parsers/xbanxia.js', 'utf8');

const target = `    content = content.replace(/<[^>]+>/g, '');
    
    // HTML Entity Decoding
    content = content.replace(/&nbsp;/gi, ' ');
    content = content.replace(/&lt;/gi, '<');
    content = content.replace(/&gt;/gi, '>');
    content = content.replace(/&amp;/gi, '&');
    content = content.replace(/&quot;/gi, '"');
    content = content.replace(/&#39;/gi, "'");
    content = content.replace(/&apos;/gi, "'");`;

const replacement = `    // HTML Entity Decoding first, so escaped HTML tags become real tags
    content = content.replace(/&nbsp;/gi, ' ');
    content = content.replace(/&lt;/gi, '<');
    content = content.replace(/&gt;/gi, '>');
    content = content.replace(/&amp;/gi, '&');
    content = content.replace(/&quot;/gi, '"');
    content = content.replace(/&#39;/gi, "'");
    content = content.replace(/&apos;/gi, "'");
    
    // Now strip all HTML tags (including those that were just unescaped)
    content = content.replace(/<[^>]+>/g, '');`;

code = code.replace(target, replacement);
fs.writeFileSync('src/utils/parsers/xbanxia.js', code, 'utf8');
