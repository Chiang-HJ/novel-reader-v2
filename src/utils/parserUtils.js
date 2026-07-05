export function splitTextIntoChapters(textData, splitMode, splitStr, defaultTitle = '全一章') {
    let finalRegexStr = splitStr;
    if (splitMode === 'example') {
        if (!splitStr || !splitStr.trim()) {
            throw new Error('範例不能為空');
        }
        const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        finalRegexStr = escapeRegExp(splitStr.trim()).replace(/\d+/g, '\\d+');
    }

    let headingRegex;
    try {
        headingRegex = new RegExp('(' + finalRegexStr + ')', 'g');
    } catch (e) {
        throw new Error('規則錯誤：您輸入的規則不合法。');
    }

    const parts = textData.split(headingRegex);
    const newChaptersData = [];

    if (parts.length > 1) {
        if (parts[0].trim().length > 0) {
            newChaptersData.push({ title: '前言/簡介', text: parts[0].trim() });
        }

        for (let i = 1; i < parts.length; i += 2) {
            const chTitle = parts[i].trim();
            const textContent = parts[i + 1] ? parts[i + 1].trim() : '';
            
            if (textContent.length === 0) continue;

            newChaptersData.push({ title: chTitle, text: textContent });
        }
    } else {
        newChaptersData.push({ title: defaultTitle, text: textData.trim() });
    }

    return newChaptersData;
}
