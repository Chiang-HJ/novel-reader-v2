const fs = require('fs');
fetch('https://boylove.cc/home/book/index/id/22817', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
})
.then(res => res.text())
.then(html => {
    let chapters = [];
    const chapterListMatch = html.match(/JSON\.parse\("(\{\\"list\\":\[.*?\]\})"/);
    if (chapterListMatch) {
        try {
            const parsedStr = chapterListMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
            const chapterData = JSON.parse(parsedStr);
            if (chapterData && chapterData.list) {
                chapters = chapterData.list;
            }
        } catch (e) {
            console.error("boylove parse JSON error:", e);
        }
    }
    console.log("Chapters length (method 1):", chapters.length);

    // Alternative method:
    const dataMatch = html.match(/let\s+data\s*=\s*'([^']+)'/);
    if (dataMatch) {
        console.log("Found data string length:", dataMatch[1].length);
    }
});
