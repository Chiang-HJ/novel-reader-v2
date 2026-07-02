export const parseNovelInfo = (html, url) => {
    // Extract title
    const titleMatch = html.match(/<span class="title">(.+?)<\/span>/);
    const title = titleMatch ? titleMatch[1] : '未知書名';
    
    // Extract cover image
    const imgMatch = html.match(/<div class="thumbnail">.*?<img src="(https:\/\/img\.czbooks\.net.+?)"/);
    const cover = imgMatch ? imgMatch[1] : null;
    
    // Extract chapters
    const chapters = [];
    const regex = /<li><a href="(https:\/\/czbooks\.net\/n\/[a-zA-Z0-9]+\/\w+)">(.+?)<\/a><\/li>/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
        chapters.push({
            url: match[1],
            title: match[2]
        });
    }
    
    return {
        id: url.split('/').pop(),
        url,
        title,
        cover,
        chapters
    };
};

export const fetchNovelInfo = async (url) => {
    try {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
            'Cache-Control': 'no-cache'
        };
        const response = await fetch(url, { headers });
        const html = await response.text();
        return parseNovelInfo(html, url);
    } catch (e) {
        console.error('fetchNovelInfo Error:', e);
        throw new Error('無法取得小說資訊，請確認網址正確');
    }
};

export const parseChapterText = (html) => {
    // Extract the content block
    const contentMatch = html.match(/<div class="content">([\s\S]*?)<\/div>/);
    if (!contentMatch) return '';
    
    let content = contentMatch[1];
    // Remove line breaks formatting, script tags, etc.
    content = content.replace(/<script[\s\S]*?<\/script>/gi, '');
    content = content.replace(/<br\s*\/?>/gi, '\n');
    content = content.replace(/<[^>]+>/g, '');
    
    // Basic cleanup
    content = content.replace(/&nbsp;/g, ' ');
    content = content.replace(/[\r\n]+/g, '\n'); // Normalize newlines
    return content.trim();
};

export const fetchChapterText = async (chapterUrl) => {
    try {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7'
        };
        const response = await fetch(chapterUrl, { headers });
        let html = await response.text();
        return parseChapterText(html);
    } catch (e) {
        console.error('fetchChapterText Error:', e);
        return '本章節下載失敗。';
    }
};
