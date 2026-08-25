function extractSequentialHeadings(text, exampleStr) {
    const numMatch = exampleStr.trim().match(/^(.*?)(\d+)(.*)$/);
    const startNum = parseInt(numMatch[2], 10);
    const regex = new RegExp('^\\s*(\\d+).*$', 'gm');
    const allMatches = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
        allMatches.push({ line: match[0].trim(), num: parseInt(match[1], 10) });
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
                if (m.num < minNum) { minNum = m.num; bestMatchIdx = i; }
                if (minNum === expectedExact) break;
            }
        }
        if (bestMatchIdx !== -1) {
            results.push(allMatches[bestMatchIdx].line);
            expectedNum = allMatches[bestMatchIdx].num + 1;
            currentIndex = bestMatchIdx + 1;
        } else { break; }
    }
    return results;
}
const text = "030\n030(2)\n030(3)\n030(4)\n068\n031\n032";
console.log(extractSequentialHeadings(text, "030"));
