export const domain = 'wyblogs.eu.org';
export const name = 'wyblogs';

export const parseSearchHtml = (html) => {
    return []; // Search is not implemented yet
};

export const parseInfo = (html, url = '') => {
    let titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    let title = titleMatch ? titleMatch[1].replace('- sexy gay wyblogs', '').trim() : '未知書名';

    let contentMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
                       html.match(/<div[^>]*class=["'][^"']*post-content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ||
                       html.match(/<div[^>]*class=["'][^"']*post-body[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ||
                       html.match(/<div[^>]*class=["'][^"']*entry-content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    let chapters = [];

    if (!contentMatch) {
        // If we can't find the article tag, it might be blocked by Cloudflare or a network error.
        // Returning null prevents the app from saving a corrupted '未知書名' book.
        return null;
    }

    if (contentMatch) {
        let content = contentMatch[1].replace(/<br\s*\/?>/gi, '\n').replace(/&nbsp;/gi, ' ').replace(/<[^>]+>/g, '');
        const headingRegex = /(第[零一二三四五六七八九十百千万0-9]+章[^\n]*)/g;
        const parts = content.split(headingRegex);

        if (parts.length > 1) {
            const numChapters = (parts.length - 1) / 2;
            for (let i = 0; i < numChapters; i++) {
                const chapterTitle = parts[1 + i * 2].trim();
                chapters.push({
                    url: `${url.split('#')[0]}#${i}`,
                    title: chapterTitle
                });
            }
        }
    }

    if (chapters.length === 0) {
        chapters.push({
            url: `${url.split('#')[0]}#0`,
            title: '全文'
        });
    }

    const cleanUrl = (url || '').split('?')[0].split('#')[0];
    const urlParts = cleanUrl.split('/').filter(Boolean);
    return {
        id: urlParts.length > 0 ? urlParts.pop().replace('.html', '') : 'unknown',
        url: cleanUrl,
        title,
        cover: null,
        chapters
    };
};

export const parseChapter = (html, url = '') => {
    let contentMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
                       html.match(/<div[^>]*class=["'][^"']*post-content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ||
                       html.match(/<div[^>]*class=["'][^"']*entry-content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ||
                       [null, html]; // Fallback to full HTML if tags are missing or modified by JS

    let content = contentMatch[1];
    
    // 清理廣告與不必要的標籤
    content = content.replace(/<script[\s\S]*?<\/script>/gi, '');
    content = content.replace(/<style[\s\S]*?<\/style>/gi, '');
    content = content.replace(/<ins[\s\S]*?<\/ins>/gi, '');
    
    content = content.replace(/<br\s*\/?>/gi, '\n');
    content = content.replace(/&nbsp;/g, ' ');
    content = content.replace(/<[^>]+>/g, '');
    content = content.replace(/[\r\n]+/g, '\n');

    const hashMatch = url.match(/#(\d+)$/);
    const idx = hashMatch ? parseInt(hashMatch[1], 10) : 0;

    const headingRegex = /(第[零一二三四五六七八九十百千万0-9]+章[^\n]*)/g;
    const parts = content.split(headingRegex);

    if (parts.length > 1) {
        const titleIndex = 1 + idx * 2;
        const contentIndex = 2 + idx * 2;
        if (titleIndex < parts.length && contentIndex < parts.length) {
            return parts[titleIndex].trim() + '\n\n' + parts[contentIndex].trim();
        }
    }

    return content.trim();
};
