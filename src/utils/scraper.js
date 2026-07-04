import { getParserForUrl } from './parsers';
import { convertS2T } from './opencc';

export const parseNovelInfo = (html, url) => {
    const parser = getParserForUrl(url);
    const info = parser.parseInfo(html, url);
    
    // 轉換書名與章節標題為繁體
    if (info) {
        if (info.title) info.title = convertS2T(info.title);
        if (info.chapters && Array.isArray(info.chapters)) {
            info.chapters = info.chapters.map(ch => ({
                ...ch,
                title: convertS2T(ch.title)
            }));
        }
    }
    if (info && !info.id) {
        // Create a safe ID from URL for file system paths
        info.id = url.replace(/[^a-zA-Z0-9]/g, '_');
    }
    return info;
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
    const text = parser.parseChapter(html, url);
    return convertS2T(text);
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
