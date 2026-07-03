import { getParserForUrl } from './parsers';

export const parseNovelInfo = (html, url) => {
    const parser = getParserForUrl(url);
    return parser.parseInfo(html, url);
};

export const fetchNovelInfo = async (url) => {
    try {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)',
            'Accept': 'text/html'
        };
        const response = await fetch(url, { headers });
        const html = await response.text();
        return parseNovelInfo(html, url);
    } catch (e) {
        console.error('fetchNovelInfo Error:', e);
        throw new Error('無法取得小說資訊，請確認網址正確');
    }
};

export const parseChapterText = (html, url) => {
    const parser = getParserForUrl(url);
    return parser.parseChapter(html);
};

export const fetchChapterText = async (chapterUrl) => {
    try {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)',
            'Accept': 'text/html'
        };
        const response = await fetch(chapterUrl, { headers });
        let html = await response.text();
        return parseChapterText(html, chapterUrl);
    } catch (e) {
        console.error('fetchChapterText Error:', e);
        return '本章節下載失敗。';
    }
};
