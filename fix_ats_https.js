const fs = require('fs');
let code = fs.readFileSync('src/context/DownloadContext.js', 'utf8');

const target = `        let finalUrl = (task.url || '').trim();
        if (!finalUrl.startsWith('http')) {
            finalUrl = 'https://' + finalUrl;
        }`;

const replacement = `        let finalUrl = (task.url || '').trim();
        if (!finalUrl.startsWith('http')) {
            finalUrl = 'https://' + finalUrl;
        }
        
        // Upgrade HTTP to HTTPS for iOS ATS compatibility
        if (finalUrl.startsWith('http://')) {
            finalUrl = finalUrl.replace('http://', 'https://');
        }`;

code = code.replace(target, replacement);
fs.writeFileSync('src/context/DownloadContext.js', code, 'utf8');
