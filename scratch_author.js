async function test() {
    try {
        const r1 = await fetch('https://boylove.cc/home/book/capter/id/103897');
        const html = await r1.text();
        const firstMergeImgMatch = html.match(/function firstMergeImg[^\{]*\{([\s\S]*?)\}/);
        if (firstMergeImgMatch) {
            console.log("Body length:", firstMergeImgMatch[1].trim().length);
            console.log("Body:", firstMergeImgMatch[1].trim());
        }
    } catch(e) {
        console.error(e);
    }
}
test();
