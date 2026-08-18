import AsyncStorage from '@react-native-async-storage/async-storage';

const BLOG_FEED_URL = 'https://yuluji.blogspot.com/feeds/posts/summary?alt=json';
const BLOG_CACHE_KEY = '@blog_feed_cache';
const MAX_RESULTS = 500;
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
 * Fetch all articles from the Blogger JSON Feed API with automatic pagination.
 * Returns an array of article objects: { id, title, tags, publishedAt, url, summary }
 */
export async function fetchAllArticles(onProgress) {
    let allArticles = [];
    let startIndex = 1;
    let totalResults = Infinity;

    while (startIndex <= totalResults) {
        const url = `${BLOG_FEED_URL}&max-results=${MAX_RESULTS}&start-index=${startIndex}`;
        const response = await fetchWithTimeout(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();

        // Get total count on first request
        if (totalResults === Infinity) {
            const rawTotal = parseInt(data?.feed?.openSearch$totalResults?.$t || '0', 10);
            totalResults = isNaN(rawTotal) || rawTotal <= 0 ? 0 : rawTotal;
        }

        const entries = data?.feed?.entry || [];
        if (entries.length === 0) break;

        for (const entry of entries) {
            const parsed = parseEntry(entry);
            if (parsed && parsed.id) {
                allArticles.push(parsed);
            }
        }

        startIndex += entries.length;

        if (onProgress && totalResults > 0) {
            onProgress(Math.min(startIndex - 1, totalResults), totalResults);
        }
    }

    return allArticles;
}

/**
 * Parse a single Blogger feed entry into our article format.
 */
function parseEntry(entry) {
    if (!entry) return null;
    const title = entry.title?.$t || '(無標題)';
    const tags = Array.isArray(entry.category) 
        ? entry.category.map(c => c?.term || '').filter(Boolean) 
        : [];
    const publishedAt = entry.published?.$t || '';
    const linkObj = Array.isArray(entry.link) 
        ? entry.link.find(l => l?.rel === 'alternate') 
        : null;
    const url = linkObj?.href || '';
    const summary = entry.summary?.$t || '';
    const rawId = entry.id?.$t || '';
    const postId = rawId.includes('.post-') ? rawId.split('.post-')[1] : rawId;

    return { id: postId, title, tags, publishedAt, url, summary };
}

/**
 * Fetch only articles published after a given date (incremental update).
 * Uses Blogger's published-min parameter.
 */
async function fetchNewArticlesSince(sinceDate, onProgress) {
    const d = new Date(sinceDate);
    if (isNaN(d.getTime())) return [];
    const isoDate = d.toISOString();
    let newArticles = [];
    let startIndex = 1;
    let totalResults = Infinity;

    while (startIndex <= totalResults) {
        const url = `${BLOG_FEED_URL}&max-results=${MAX_RESULTS}&start-index=${startIndex}&published-min=${encodeURIComponent(isoDate)}`;
        const response = await fetchWithTimeout(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();

        if (totalResults === Infinity) {
            const rawTotal = parseInt(data?.feed?.openSearch$totalResults?.$t || '0', 10);
            totalResults = isNaN(rawTotal) || rawTotal <= 0 ? 0 : rawTotal;
        }

        const entries = data?.feed?.entry || [];
        if (entries.length === 0) break;

        for (const entry of entries) {
            const parsed = parseEntry(entry);
            if (parsed && parsed.id) {
                newArticles.push(parsed);
            }
        }

        startIndex += entries.length;

        if (onProgress && totalResults > 0) {
            onProgress(Math.min(startIndex - 1, totalResults), totalResults);
        }
    }

    return newArticles;
}

/**
 * Get the cached feed data from AsyncStorage.
 * Returns { lastUpdated: number, articles: [] } or null
 */
export async function getCachedFeed() {
    try {
        const cached = await AsyncStorage.getItem(BLOG_CACHE_KEY);
        if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed && Array.isArray(parsed.articles)) {
                return parsed;
            }
        }
    } catch (e) {
        console.warn('Failed to get cached feed:', e);
    }
    return null;
}

/**
 * Save article list to cache with current timestamp.
 */
export async function saveFeedToCache(articles) {
    try {
        const cacheData = {
            lastUpdated: Date.now(),
            articles: Array.isArray(articles) ? articles : [],
        };
        await AsyncStorage.setItem(BLOG_CACHE_KEY, JSON.stringify(cacheData));
    } catch (e) {
        console.warn('Failed to save feed to cache:', e);
    }
}

/**
 * Check if the cache is stale (older than 7 days).
 */
export function isCacheStale(lastUpdated) {
    if (!lastUpdated || typeof lastUpdated !== 'number') return true;
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    return (Date.now() - lastUpdated) > SEVEN_DAYS_MS;
}

/**
 * Refresh the feed: use incremental update if cache exists, otherwise full fetch.
 * Returns the fresh articles array.
 */
export async function refreshFeed(onProgress) {
    const cached = await getCachedFeed();

    if (cached && Array.isArray(cached.articles) && cached.articles.length > 0) {
        // Find the newest article's publish date from cache
        const newestDate = cached.articles.reduce((latest, a) => {
            if (!a?.publishedAt) return latest;
            const d = new Date(a.publishedAt).getTime();
            return !isNaN(d) && d > latest ? d : latest;
        }, 0);

        if (newestDate > 0) {
            if (onProgress) onProgress(0, 1, '檢查新文章...');
            const newArticles = await fetchNewArticlesSince(newestDate, onProgress);

            if (newArticles.length > 0) {
                // Merge: add new articles, deduplicate by id
                const existingIds = new Set(cached.articles.map(a => a.id));
                const uniqueNew = newArticles.filter(a => a?.id && !existingIds.has(a.id));
                const merged = [...uniqueNew, ...cached.articles];
                await saveFeedToCache(merged);
                return merged;
            } else {
                // No new articles, just refresh timestamp
                await saveFeedToCache(cached.articles);
                return cached.articles;
            }
        }
    }

    // No usable cache, do full fetch
    const articles = await fetchAllArticles(onProgress);
    await saveFeedToCache(articles);
    return articles;
}

/**
 * Get articles, using cache if fresh enough, otherwise fetching from network.
 * Returns { articles: [], lastUpdated: number, fromCache: boolean }
 */
export async function getArticles(onProgress) {
    const cached = await getCachedFeed();

    if (cached && !isCacheStale(cached.lastUpdated)) {
        return { articles: cached.articles, lastUpdated: cached.lastUpdated, fromCache: true };
    }

    try {
        const articles = await refreshFeed(onProgress);
        return { articles, lastUpdated: Date.now(), fromCache: false };
    } catch (e) {
        // If network fails but we have stale cache, use it
        if (cached) {
            return { articles: cached.articles, lastUpdated: cached.lastUpdated, fromCache: true };
        }
        throw e;
    }
}

/**
 * Fetch the full HTML content of a single blog post by its URL,
 * then strip HTML tags and return clean text.
 */
export async function fetchArticleContent(articleUrl) {
    if (!articleUrl) {
        throw new Error('未提供文章網址');
    }

    const response = await fetchWithTimeout(articleUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const html = await response.text();

    // Extract the post body from Blogger HTML
    let content = '';

    const startMatch = html.match(/<div[^>]*class=['"][^'"]*(?:post-body|entry-content)[^'"]*['"][^>]*>/i);
    if (startMatch) {
        const startIndex = startMatch.index + startMatch[0].length;
        let openDivs = 1;
        let endIndex = startIndex;
        
        const divRegex = /<\/?div[^>]*>/gi;
        divRegex.lastIndex = startIndex;
        
        let match;
        while ((match = divRegex.exec(html)) !== null) {
            if (match[0].toLowerCase().startsWith('</div')) {
                openDivs--;
            } else {
                openDivs++;
            }
            
            if (openDivs === 0) {
                endIndex = match.index;
                break;
            }
        }
        
        if (openDivs === 0) {
            content = html.substring(startIndex, endIndex);
        } else {
            // Fallback if divs are unbalanced for some reason
            content = html.substring(startIndex);
        }
    }

    if (!content) {
        throw new Error('無法解析文章內容，網頁結構可能已改變');
    }

    // Strip HTML to plain text
    let text = content;

    // Remove anti-scraping jammers (e.g., class="jammer" or display: none)
    text = text.replace(/<[^>]*class=['"]jammer['"][^>]*>[\s\S]*?<\/[a-zA-Z0-9]+>/gi, '');
    text = text.replace(/<[^>]*style=['"][^'"]*display:\s*none[^'"]*['"][^>]*>[\s\S]*?<\/[a-zA-Z0-9]+>/gi, '');
    // Also remove elements with font-size: 0px or opacity: 0
    text = text.replace(/<[^>]*style=['"][^'"]*(font-size:\s*0px|opacity:\s*0)[^'"]*['"][^>]*>[\s\S]*?<\/[a-zA-Z0-9]+>/gi, '');

    // Remove scripts and styles
    text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
    // Convert <br> and block elements to newlines
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/p>/gi, '\n\n');
    text = text.replace(/<\/div>/gi, '\n');
    text = text.replace(/<\/h[1-6]>/gi, '\n\n');
    text = text.replace(/<\/li>/gi, '\n');
    // Remove remaining tags
    text = text.replace(/<[^>]+>/g, '');
    // Decode HTML entities
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#39;/g, "'");
    text = text.replace(/&#x([0-9a-fA-F]+);/gi, (m, h) => String.fromCharCode(parseInt(h, 16)));
    text = text.replace(/&#(\d+);/g, (m, code) => String.fromCharCode(code));
    // Clean up whitespace
    text = text.replace(/\n{3,}/g, '\n\n');
    text = text.trim();

    return text;
}
