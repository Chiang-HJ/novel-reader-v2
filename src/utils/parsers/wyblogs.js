export const domain = 'wyblogs.eu.org';
export const name = 'wyblogs';

export const parseSearchHtml = (html) => {
    return []; // Search is not implemented yet
};

export const parseInfo = (html, url = '') => {
    let titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    let title = titleMatch ? titleMatch[1].replace('- sexy gay wyblogs', '').trim() : '未知書名';

    let content = '';
    const articleStart = html.indexOf('<article');
    const postBodyStart = html.indexOf('post-body');
    const postContentStart = html.indexOf('post-content');
    const entryContentStart = html.indexOf('entry-content');
    
    let startIndex = -1;
    let endStr = '';

    if (articleStart !== -1) {
        startIndex = html.indexOf('>', articleStart) + 1;
        endStr = '</article>';
    } else if (postBodyStart !== -1) {
        startIndex = html.indexOf('>', postBodyStart) + 1;
        endStr = '</div>';
    } else if (postContentStart !== -1) {
        startIndex = html.indexOf('>', postContentStart) + 1;
        endStr = '</div>';
    } else if (entryContentStart !== -1) {
        startIndex = html.indexOf('>', entryContentStart) + 1;
        endStr = '</div>';
    }

    if (startIndex !== -1 && startIndex !== 0) {
        const endIndex = html.indexOf(endStr, startIndex);
        if (endIndex !== -1) {
            content = html.substring(startIndex, endIndex);
        }
    }

    let chapters = [];

    if (!content) {
        // If we can't find the content tag, it might be blocked by Cloudflare or a network error.
        // Returning null prevents the app from saving a corrupted '未知書名' book.
        return null;
    }

    if (content) {
        let cleanContent = content.replace(/<br\s*\/?>/gi, '\n').replace(/&nbsp;/gi, ' ').replace(/<[^>]+>/g, '');
        const headingRegex = /(第[零一二三四五六七八九十百千万0-9]+章[^\n]*)/g;
        const parts = cleanContent.split(headingRegex);

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
    let content = '';
    const articleStart = html.indexOf('<article');
    const postBodyStart = html.indexOf('post-body');
    const postContentStart = html.indexOf('post-content');
    const entryContentStart = html.indexOf('entry-content');
    
    let startIndex = -1;
    let endStr = '';

    if (articleStart !== -1) {
        startIndex = html.indexOf('>', articleStart) + 1;
        endStr = '</article>';
    } else if (postBodyStart !== -1) {
        startIndex = html.indexOf('>', postBodyStart) + 1;
        endStr = '</div>';
    } else if (postContentStart !== -1) {
        startIndex = html.indexOf('>', postContentStart) + 1;
        endStr = '</div>';
    } else if (entryContentStart !== -1) {
        startIndex = html.indexOf('>', entryContentStart) + 1;
        endStr = '</div>';
    }

    if (startIndex !== -1 && startIndex !== 0) {
        const endIndex = html.indexOf(endStr, startIndex);
        if (endIndex !== -1) {
            content = html.substring(startIndex, endIndex);
        }
    }

    if (!content) {
        content = html; // Fallback
    }
    
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
