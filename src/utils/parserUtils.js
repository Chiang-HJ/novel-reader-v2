function extractSequentialHeadings(text, exampleStr, strictMatch) {
    const trimStr = exampleStr.trim();
    if (!trimStr) return [];
    
    const numMatch = trimStr.match(/^(.*?)(\d+)(.*)$/);
    const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    if (!numMatch) {
        let finalRegexStr = '^\\s*' + escapeRegExp(trimStr).replace(/\s+/g, '\\s+') + '.*';
        const regexObj = new RegExp('(' + finalRegexStr + ')', 'gm');
        const matches = text.match(regexObj);
        return matches ? matches.map(m => m.trim()) : [];
    }

    const prefix = numMatch[1];
    const startNumStr = numMatch[2];
    const suffix = numMatch[3];
    const startNum = parseInt(startNumStr, 10);
    const padLen = startNumStr.length;
    
    const isPureNumber = !prefix && !suffix;
    
    let regexPattern = '^\\s*';
    if (prefix) regexPattern += escapeRegExp(prefix).replace(/\s+/g, '\\s*') + '\\s*';
    // Require at least padLen digits (e.g., '001' means at least 3 digits)
    regexPattern += '(\\d{' + padLen + ',})';
    if (suffix) regexPattern += '\\s*' + escapeRegExp(suffix).replace(/\s+/g, '\\s*');
    
    if (isPureNumber) {
        if (strictMatch) {
            regexPattern += '(?:\\s+.*|[、.．：:]\\s*.*|$)';
        } else {
            regexPattern += '.*';
        }
    } else {
        regexPattern += '.*';
    }
    regexPattern += '$';
    
    const regex = new RegExp(regexPattern, 'gm');
    let match;
    const allMatches = [];
    
    while ((match = regex.exec(text)) !== null) {
        allMatches.push({
            line: match[0].trim(),
            num: parseInt(match[1], 10)
        });
    }
    
    const results = [];
    let expectedNum = startNum;
    let currentIndex = 0;
    
    while (currentIndex < allMatches.length) {
        let bestMatchIdx = -1;
        let minNum = Infinity;
        
        for (let i = currentIndex; i < allMatches.length; i++) {
            const m = allMatches[i];
            
            const targetNum = results.length === 0 ? startNum : expectedNum - 1;
            const expectedExact = results.length === 0 ? startNum : expectedNum;
            
            if (m.num >= targetNum) {
                if (m.num < minNum) {
                    minNum = m.num;
                    bestMatchIdx = i;
                }
                if (minNum === expectedExact) {
                    break;
                }
            }
        }
        
        if (bestMatchIdx !== -1) {
            results.push(allMatches[bestMatchIdx].line);
            expectedNum = allMatches[bestMatchIdx].num + 1;
            currentIndex = bestMatchIdx + 1;
        } else {
            break;
        }
    }
    
    return results;
}

export function splitTextIntoChapters(textData, splitMode, splitStr, defaultTitle = '全一章', strictMatch = false) {
    if (textData === null || textData === undefined) {
        return [{ title: defaultTitle || '全一章', text: '' }];
    }

    const safeText = typeof textData === 'string' ? textData : String(textData);
    if (!safeText.trim()) {
        return [{ title: defaultTitle || '全一章', text: '' }];
    }

    let headingRegex;
    
    if (splitMode === 'example') {
        const validHeadings = extractSequentialHeadings(safeText, splitStr, strictMatch);
        if (validHeadings.length === 0) {
             return [{ title: defaultTitle || '全一章', text: safeText.trim() }];
        }
        const uniqueHeadings = [...new Set(validHeadings)];
        uniqueHeadings.sort((a, b) => b.length - a.length);
        const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const finalRegexStr = uniqueHeadings.map(l => escapeRegExp(l)).join('|');
        headingRegex = new RegExp('(' + finalRegexStr + ')', 'g');
    } else if (splitMode === 'list') {
        if (!splitStr || !splitStr.trim()) {
            throw new Error('自訂清單不能為空');
        }
        const lines = splitStr.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length === 0) throw new Error('自訂清單不能為空');
        lines.sort((a, b) => b.length - a.length);
        const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const finalRegexStr = lines.map(l => escapeRegExp(l)).join('|');
        headingRegex = new RegExp('(' + finalRegexStr + ')', 'g');
    } else {
        if (!splitStr || !splitStr.trim()) {
            return [{ title: defaultTitle || '全一章', text: safeText.trim() }];
        }
        try {
            headingRegex = new RegExp('(' + splitStr + ')', 'g');
        } catch (e) {
            throw new Error('規則錯誤：您輸入的規則不合法。');
        }
    }

    const parts = safeText.split(headingRegex);
    const newChaptersData = [];

    if (parts && parts.length > 1) {
        if (parts[0] && parts[0].trim().length > 0) {
            newChaptersData.push({ title: '前言/簡介', text: parts[0].trim() });
        }

        for (let i = 1; i < parts.length; i += 2) {
            const chTitle = parts[i] ? parts[i].trim() : `第 ${Math.floor(i / 2) + 1} 章`;
            const textContent = parts[i + 1] ? parts[i + 1].trim() : '';
            
            if (textContent.length === 0) continue;

            newChaptersData.push({ title: chTitle, text: textContent });
        }
    }

    if (newChaptersData.length === 0) {
        newChaptersData.push({ title: defaultTitle || '全一章', text: safeText.trim() });
    }

    return newChaptersData;
}

export function previewMatchedHeadings(textData, splitMode, splitStr, strictMatch = false) {
    if (!textData) return [];
    const safeText = typeof textData === 'string' ? textData : String(textData);
    if (!safeText.trim()) return [];

    if (splitMode === 'example') {
        return extractSequentialHeadings(safeText, splitStr, strictMatch);
    }

    if (!splitStr || !splitStr.trim()) {
        return [];
    }

    try {
        const headingRegexObj = new RegExp('(' + splitStr + ')', 'gm');
        const matches = safeText.match(headingRegexObj);
        return matches ? matches.map(m => m.trim()) : [];
    } catch (e) {
        throw new Error('規則錯誤：您輸入的規則不合法。');
    }
}

