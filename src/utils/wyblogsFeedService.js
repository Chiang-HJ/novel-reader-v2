import AsyncStorage from '@react-native-async-storage/async-storage';

const WYBLOGS_BASE_URL = 'https://wyblogs.eu.org/series/%E5%B0%8F%E8%AA%AA/';
const WYBLOGS_CACHE_KEY = '@wyblogs_feed_cache';
const FETCH_TIMEOUT_MS = 15000;

/**
 * Helper to perform fetch with timeout
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        return response;
    } catch (e) {
        if (e.name === 'AbortError') {
            throw new Error('網路請求逾時，請檢查網路連線');
        }
        throw e;
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * Safe URI component decoder
 */
function safeDecodeURIComponent(str) {
    if (!str) return '';
    try {
        return decodeURIComponent(str);
    } catch {
        return str;
    }
}

/**
 * Parse a single page of the wyblogs novel listing HTML.
 * Extracts article titles, URLs, and categories/tags.
 */
function parseListingPage(html) {
    if (!html || typeof html !== 'string') return [];
    const articles = [];
    
    // Match article links in h2/h5 headings pointing to /posts/
    const articleRegex = /<h[2-5][^>]*>\s*<a[^>]*href="([^"]*\/posts\/[^"]*)"[^>]*>([^<]*)<\/a>/gi;
    let match;
    
    while ((match = articleRegex.exec(html)) !== null) {
        const url = match[1];
        let title = match[2] ? match[2].trim() : '';
        
        if (!title || !url) continue;
        
        // Extract categories and tags from the surrounding card
        const categories = [];
        const tags = [];
        
        const afterMatch = html.substring(match.index, match.index + 2000);
        
        const catRegex = /href="[^"]*\/categories\/([^"]*)"[^>]*>([^<]*)<\/a>/gi;
        let catMatch;
        while ((catMatch = catRegex.exec(afterMatch)) !== null) {
            const decoded = safeDecodeURIComponent(catMatch[1]);
            if (decoded) categories.push(decoded);
        }
        
        const tagRegex = /href="[^"]*\/tags\/([^"]*)"[^>]*>([^<]*)<\/a>/gi;
        let tagMatch;
        while ((tagMatch = tagRegex.exec(afterMatch)) !== null) {
            const decoded = safeDecodeURIComponent(tagMatch[1]);
            if (decoded) tags.push(decoded);
        }
        
        // Generate a stable ID from the URL
        const urlPath = url.replace(/^https?:\/\/[^/]+/, '').replace(/\.html$/, '');
        const id = urlPath.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_');
        
        articles.push({
            id,
            title,
            url: url.startsWith('http') ? url : `https://wyblogs.eu.org${url}`,
            categories,
            tags,
        });
    }
    
    return articles;
}

/**
 * Detect total page count from the pagination HTML.
 */
function detectTotalPages(html) {
    if (!html || typeof html !== 'string') return 1;
    const lastPageRegex = /\/series\/(?:%E5%B0%8F%E8%AA%AA|小說)\/page\/(\d+)\//g;
    let maxPage = 1;
    let match;
    while ((match = lastPageRegex.exec(html)) !== null) {
        const pageNum = parseInt(match[1], 10);
        if (!isNaN(pageNum) && pageNum > maxPage) maxPage = pageNum;
    }
    return maxPage;
}

/**
 * Fetch all novel articles from wyblogs by paginating through the listing.
 */
export async function fetchAllWyblogsNovels(onProgress) {
    let allArticles = [];
    
    // Fetch first page to detect total pages
    const firstPageResponse = await fetchWithTimeout(WYBLOGS_BASE_URL);
    if (!firstPageResponse.ok) throw new Error(`HTTP ${firstPageResponse.status}`);
    const firstPageHtml = await firstPageResponse.text();
    
    const totalPages = detectTotalPages(firstPageHtml);
    const firstPageArticles = parseListingPage(firstPageHtml);
    allArticles.push(...firstPageArticles);
    
    if (onProgress) onProgress(1, totalPages);
    
    // Fetch remaining pages in batches of 5 for speed
    const BATCH_SIZE = 5;
    for (let startPage = 2; startPage <= totalPages; startPage += BATCH_SIZE) {
        const endPage = Math.min(startPage + BATCH_SIZE - 1, totalPages);
        const pagePromises = [];
        
        for (let page = startPage; page <= endPage; page++) {
            const pageUrl = `${WYBLOGS_BASE_URL}page/${page}/`;
            pagePromises.push(
                fetchWithTimeout(pageUrl)
                    .then(res => res.ok ? res.text() : '')
                    .then(html => parseListingPage(html))
                    .catch(() => [])
            );
        }
        
        const results = await Promise.all(pagePromises);
        for (const articles of results) {
            if (Array.isArray(articles)) {
                allArticles.push(...articles);
            }
        }
        
        if (onProgress) onProgress(Math.min(endPage, totalPages), totalPages);
    }
    
    // Deduplicate by id
    const seen = new Set();
    allArticles = allArticles.filter(a => {
        if (!a?.id || seen.has(a.id)) return false;
        seen.add(a.id);
        return true;
    });
    
    return allArticles;
}

/**
 * Get the cached wyblogs feed data.
 */
export async function getWyblogsCachedFeed() {
    try {
        const cached = await AsyncStorage.getItem(WYBLOGS_CACHE_KEY);
        if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed && Array.isArray(parsed.articles)) {
                return parsed;
            }
        }
    } catch (e) {
        console.warn('Failed to get wyblogs cached feed:', e);
    }
    return null;
}

/**
 * Save wyblogs article list to cache.
 */
export async function saveWyblogsFeedToCache(articles) {
    try {
        const cacheData = {
            lastUpdated: Date.now(),
            articles: Array.isArray(articles) ? articles : [],
        };
        await AsyncStorage.setItem(WYBLOGS_CACHE_KEY, JSON.stringify(cacheData));
    } catch (e) {
        console.warn('Failed to save wyblogs feed to cache:', e);
    }
}

/**
 * Check if cache is stale (older than 7 days).
 */
export function isWyblogsCacheStale(lastUpdated) {
    if (!lastUpdated || typeof lastUpdated !== 'number') return true;
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    return (Date.now() - lastUpdated) > SEVEN_DAYS_MS;
}

/**
 * Refresh the wyblogs feed: fetch from network and update cache.
 */
export async function refreshWyblogsFeed(onProgress) {
    const articles = await fetchAllWyblogsNovels(onProgress);
    await saveWyblogsFeedToCache(articles);
    return articles;
}

/**
 * Get wyblogs articles, using cache if fresh enough.
 */
export async function getWyblogsArticles(onProgress) {
    const cached = await getWyblogsCachedFeed();
    
    if (cached && !isWyblogsCacheStale(cached.lastUpdated)) {
        return { articles: cached.articles, lastUpdated: cached.lastUpdated, fromCache: true };
    }
    
    try {
        const articles = await refreshWyblogsFeed(onProgress);
        return { articles, lastUpdated: Date.now(), fromCache: false };
    } catch (e) {
        if (cached) {
            return { articles: cached.articles, lastUpdated: cached.lastUpdated, fromCache: true };
        }
        throw e;
    }
}

/**
 * Fetch full article content from a wyblogs article URL.
 */
export async function fetchWyblogsArticleContent(articleUrl) {
    if (!articleUrl) {
        throw new Error('未提供小說網址');
    }

    const response = await fetchWithTimeout(articleUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    
    // Extract content from article tag
    let content = '';
    const lowerHtml = html.toLowerCase();
    const articleStart = lowerHtml.indexOf('<article');
    
    if (articleStart !== -1) {
        const innerStart = lowerHtml.indexOf('>', articleStart) + 1;
        const endIndex = lowerHtml.indexOf('</article>', innerStart);
        if (endIndex !== -1) {
            content = html.substring(innerStart, endIndex);
        }
    }
    
    if (!content) {
        for (const cls of ['post-body', 'post-content', 'entry-content']) {
            const idx = lowerHtml.indexOf(cls);
            if (idx !== -1) {
                const start = lowerHtml.indexOf('>', idx) + 1;
                const end = lowerHtml.indexOf('</div>', start);
                if (end !== -1) {
                    content = html.substring(start, end);
                    break;
                }
            }
        }
    }
    
    if (!content) content = html;
    
    // Clean HTML to plain text
    let text = content;
    text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
    text = text.replace(/<ins[\s\S]*?<\/ins>/gi, '');
    text = text.replace(/<ul[\s\S]*?<\/ul>/gi, '');
    text = text.replace(/<ol[\s\S]*?<\/ol>/gi, '');
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/p>/gi, '\n\n');
    text = text.replace(/<\/div>/gi, '\n');
    text = text.replace(/<\/h[1-6]>/gi, '\n\n');
    text = text.replace(/<[^>]+>/g, '');
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#x([0-9a-fA-F]+);/gi, (m, h) => String.fromCharCode(parseInt(h, 16)));
    text = text.replace(/&#(\d+);/g, (m, code) => String.fromCharCode(code));
    text = text.replace(/[\r\n]{3,}/g, '\n\n');
    text = text.trim();
    
    return text;
}
