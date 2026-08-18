export function splitTextIntoChapters(textData, splitMode, splitStr, defaultTitle = '全一章') {
    if (textData === null || textData === undefined) {
        return [{ title: defaultTitle || '全一章', text: '' }];
    }

    const safeText = typeof textData === 'string' ? textData : String(textData);
    if (!safeText.trim()) {
        return [{ title: defaultTitle || '全一章', text: '' }];
    }

    let finalRegexStr = splitStr;
    if (splitMode === 'example') {
        if (!splitStr || !splitStr.trim()) {
            throw new Error('範例不能為空');
        }
        const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const replaced = escapeRegExp(splitStr.trim()).replace(/\d+/g, '\\d+');
        // Anchor to start of line to prevent splitting mid-sentence (e.g. at random numbers)
        if (replaced === '\\d+') {
            // User inputted a pure number, be more strict: must be followed by space, punctuation, or end of line
            finalRegexStr = '^\\s*\\d+(?:\\s+.*|[、.．：:]\\s*.*|$)';
        } else {
            // Replace literal spaces with \s+ to be more forgiving
            finalRegexStr = '^\\s*' + replaced.replace(/\s+/g, '\\s+') + '.*';
        }
    }

    if (!finalRegexStr || !finalRegexStr.trim()) {
        return [{ title: defaultTitle || '全一章', text: safeText.trim() }];
    }

    let headingRegex;
    try {
        const flags = splitMode === 'example' ? 'gm' : 'g';
        headingRegex = new RegExp('(' + finalRegexStr + ')', flags);
    } catch (e) {
        throw new Error('規則錯誤：您輸入的規則不合法。');
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

