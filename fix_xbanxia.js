const fs = require('fs');
let code = fs.readFileSync('src/utils/parsers/xbanxia.js', 'utf8');

const target = `    let content = '';

    const contentMatch = html.match(/<div id="nr1"[^>]*>([\\s\\S]*?)<div class="outbt">/i) || html.match(/<div id="nr1"[^>]*>([\\s\\S]*?)<\\/div>/i);
    
    if (contentMatch) {
        content = contentMatch[1];
    } else {
        const fallbackMatch = html.match(/<div class="page-content[^>]*>([\\s\\S]*?)<\\/div>/i) ||
                              html.match(/<div[^>]*id=["']?content["']?[^>]*>([\\s\\S]*?)<\\/div>/i);
        if (fallbackMatch) content = fallbackMatch[1];
    }`;

const replacement = `    let content = '';

    // Robust HTML element extraction by ID to avoid truncation on nested divs
    const extractById = (htmlStr, id) => {
        const startRegex = new RegExp(\`<div[^>]*id=["']?\\s*\${id}\\s*["']?[^>]*>\`, 'i');
        const match = htmlStr.match(startRegex);
        if (!match) return null;
        
        let startIdx = match.index + match[0].length;
        let depth = 1;
        let currIdx = startIdx;
        
        while (depth > 0 && currIdx < htmlStr.length) {
            const nextDivStart = htmlStr.indexOf('<div', currIdx);
            const nextDivEnd = htmlStr.indexOf('</div', currIdx);
            
            if (nextDivEnd === -1) break; // Malformed HTML
            
            if (nextDivStart !== -1 && nextDivStart < nextDivEnd) {
                depth++;
                currIdx = nextDivStart + 4;
            } else {
                depth--;
                if (depth === 0) {
                    return htmlStr.substring(startIdx, nextDivEnd);
                }
                currIdx = nextDivEnd + 5;
            }
        }
        return null;
    };

    const outbtMatch = html.match(/<div id="nr1"[^>]*>([\\s\\S]*?)<div class="outbt">/i);
    if (outbtMatch) {
        content = outbtMatch[1];
    } else {
        content = extractById(html, 'nr1');
    }

    if (!content) {
        const fallbackMatch = html.match(/<div class="page-content[^>]*>([\\s\\S]*?)<\\/div>/i) ||
                              html.match(/<div[^>]*id=["']?content["']?[^>]*>([\\s\\S]*?)<\\/div>/i);
        if (fallbackMatch) content = fallbackMatch[1];
    }`;

code = code.replace(target, replacement);
fs.writeFileSync('src/utils/parsers/xbanxia.js', code, 'utf8');
