export const domain = 'wyblogs.eu.org';
export const name = 'wyblogs';

export const parseSearchHtml = (html) => {
    return [];
};

const extractBalancedTag = (html, startPattern, tag = 'div') => {
    const match = html.match(startPattern);
    if (!match) return null;
    const startIndex = match.index + match[0].length;
    let depth = 1;
    const tagRegex = new RegExp(`</?${tag}\\b[^>]*>`, 'gi');
    tagRegex.lastIndex = startIndex;
    let tagMatch;
    while ((tagMatch = tagRegex.exec(html)) !== null) {
        if (tagMatch[0].startsWith('</')) {
            depth--;
            if (depth === 0) {
                return html.substring(startIndex, tagMatch.index);
            }
        } else {
            depth++;
        }
    }
    return html.substring(startIndex);
};

export const parseInfo = (html, url = '') => {
    let titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    let title = titleMatch ? titleMatch[1].replace('- sexy gay wyblogs', '').trim() : '未知書名';

    let content = extractBalancedTag(html, /<article[^>]*>/i, 'article');
    if (!content) {
        content = extractBalancedTag(html, /<div[^>]*class="[^"]*post-body[^"]*"[^>]*>/i, 'div');
    }
    if (!content) {
        content = extractBalancedTag(html, /<div[^>]*class="[^"]*post-content[^"]*"[^>]*>/i, 'div');
    }
    if (!content) {
        content = extractBalancedTag(html, /<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>/i, 'div');
    }
    if (!content) {
        content = html;
    }

    let chapters = [];

    if (content) {
        let cleanContent = content.replace(/<ul[\s\S]*?<\/ul>/gi, '')
                                  .replace(/<ol[\s\S]*?<\/ol>/gi, '')
                                  .replace(/<br\s*\/?>/gi, '\n')
                                  .replace(/<\/p>/gi, '\n')
                                  .replace(/<\/div>/gi, '\n')
                                  .replace(/&nbsp;/gi, ' ')
                                  .replace(/<[^>]+>/g, '')
                                  .trim();
        
        if (!cleanContent) return null;

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
    return {
        id: url.replace(/[^a-zA-Z0-9]/g, '_'),
        url: cleanUrl,
        title,
        cover: null,
        chapters
    };
};

export const parseChapter = (html, url = '') => {
    let content = extractBalancedTag(html, /<article[^>]*>/i, 'article');
    if (!content) {
        content = extractBalancedTag(html, /<div[^>]*class="[^"]*post-body[^"]*"[^>]*>/i, 'div');
    }
    if (!content) {
        content = extractBalancedTag(html, /<div[^>]*class="[^"]*post-content[^"]*"[^>]*>/i, 'div');
    }
    if (!content) {
        content = extractBalancedTag(html, /<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>/i, 'div');
    }
    if (!content) {
        content = html;
    }
    
    // 清理廣告與不必要的標籤
    content = content.replace(/<ul[\s\S]*?<\/ul>/gi, '');
    content = content.replace(/<ol[\s\S]*?<\/ol>/gi, '');
    content = content.replace(/<script[\s\S]*?<\/script>/gi, '');
    content = content.replace(/<style[\s\S]*?<\/style>/gi, '');
    content = content.replace(/<ins[\s\S]*?<\/ins>/gi, '');
    
    content = content.replace(/<br\s*\/?>/gi, '\n');
    content = content.replace(/<\/p>/gi, '\n');
    content = content.replace(/<\/div>/gi, '\n');
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
