import { getParserForUrl } from './parsers';
import { convertS2T } from './opencc';

// Removed globalWebviewFetcher

const fetchWithTimeout = async (url, options = {}, timeoutMs = 15000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        return response;
    } finally {
        clearTimeout(id);
    }
};

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
        const response = await fetchWithTimeout(url, { headers }, 5000);
        const html = await response.text();
        const lowerHtml = html.toLowerCase();
        
        // Detect Cloudflare block
        if (
            response.status === 403 || 
            response.status === 503 || 
            lowerHtml.includes('enable javascript and cookies to continue') ||
            lowerHtml.includes('just a moment...') ||
            lowerHtml.includes('cloudflare')
        ) {
            throw new Error('存取被 Cloudflare 拒絕。由於這是一個需要進階驗證的網站，自動下載功能已停用。請使用瀏覽器開啟。');
        }
        
        return parseNovelInfo(html, url);
    } catch (e) {
        if (e.name === 'AbortError') {
            throw new Error('存取被 Cloudflare 拒絕 (超時)。由於這是一個需要進階驗證的網站，自動下載功能已停用。請使用瀏覽器開啟。');
        }
        throw new Error(e.message || '無法取得小說資訊，請確認網址正確');
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
        const response = await fetchWithTimeout(chapterUrl, { headers });
        let html = await response.text();
        const lowerHtml = html.toLowerCase();

        // Detect Cloudflare block
        if (
            response.status === 403 || 
            response.status === 503 || 
            lowerHtml.includes('enable javascript and cookies to continue') ||
            lowerHtml.includes('just a moment...') ||
            lowerHtml.includes('cloudflare')
        ) {
            if (globalWebviewFetcher) {
                console.log('Cloudflare detected in fetchChapterText, falling back to WebView...');
                const webviewHtml = await globalWebviewFetcher(chapterUrl);
                if (webviewHtml) {
                    return parseChapterText(webviewHtml, chapterUrl);
                }
            }
        }
        
        return parseChapterText(html, chapterUrl);
    } catch (e) {
        return '本章節下載失敗。';
    }
};
