export const domain = 'czbooks.net';
export const name = 'CZBooks';

export const parseSearchHtml = (html) => {
    try {
        const results = [];
        const blocks = html.split('novel-item-wrapper').slice(1);
        
        blocks.forEach(block => {
            const urlMatch = block.match(/href\s*=\s*["']([^"']*czbooks\.net\/n\/[^"']*)["']/i);
            const titleMatch = block.match(/novel-item-title["'][^>]*>([\s\S]*?)<\/div>/i);
            const imgMatch = block.match(/<img[^>]*src\s*=\s*["']([^"']+)["']/i);
            const authorMatch = block.match(/novel-item-author["'][^>]*>([\s\S]*?)<\/div>/i);
            
            if (urlMatch && titleMatch) {
                results.push({
                    site: name,
                    cover: imgMatch ? imgMatch[1].trim() : null,
                    url: urlMatch[1].trim(),
                    title: titleMatch[1].replace(/<[^>]+>/g, '').trim(),
                    author: authorMatch ? authorMatch[1].replace(/<[^>]+>/g, '').trim() : '未知作者'
                });
            }
        });
        return results;
    } catch (e) {

        return [];
    }
};

export const parseInfo = (html, url = '') => {
    const titleMatch = html.match(/<span class="title">(.+?)<\/span>/);
    const title = titleMatch ? titleMatch[1].trim() : '未知書名';
    
    const authorMatch = html.match(/<span class="author">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i) || html.match(/<span class="author">([\s\S]*?)<\/span>/i);
    const author = authorMatch ? authorMatch[1].replace(/<[^>]+>/g, '').trim() : '未知作者';

    const imgMatch = html.match(/<div class="thumbnail">.*?<img src="(https:\/\/img\.czbooks\.net.+?)"/);
    const cover = imgMatch ? imgMatch[1] : null;
    
    const chapters = [];
    
    // Attempt to isolate the chapter list to avoid "Latest Chapters" causing out-of-order bugs
    let chapterArea = html;
    const listMatch = html.match(/id="chapter-list"[^>]*>([\s\S]*?)<\/ul>/i) || html.match(/章節列表[\s\S]*?(<ul[^>]*>[\s\S]*?<\/ul>)/i);
    if (listMatch) {
        chapterArea = listMatch[1];
    }
    
    const linkRegex = /<a[^>]+href=["']?([^"'\s>]+)["']?[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    const seen = new Set();
    while ((match = linkRegex.exec(chapterArea)) !== null) {
        let href = match[1].trim();
        let text = match[2].replace(/<[^>]+>/g, '').trim();
        
        // Match czbooks chapter pattern: /n/xxxx/yyyy
        if (href.match(/\/n\/[a-zA-Z0-9]+\/\w+/) && !seen.has(href)) {
            // Cycle detection: If catalog restarts from Chapter 1 after a substantial list (e.g. 50+ chapters), stop duplicate cycle
            if (chapters.length >= 50 && text && chapters[0].title) {
                const normText = text.replace(/\s+/g, '');
                const normFirst = chapters[0].title.replace(/\s+/g, '');
                if (normText === normFirst || (normText.startsWith('第1章') && normFirst.startsWith('第1章'))) {
                    break;
                }
            }
            seen.add(href);
            chapters.push({
                url: href.startsWith('http') ? href : (href.startsWith('//') ? `https:${href}` : `https://czbooks.net${href}`),
                title: text || '未知章節'
            });
        }
    }
    
    const cleanUrl = (url || '').split('?')[0].split('#')[0];
    const urlParts = cleanUrl.split('/').filter(Boolean);
    return {
        id: urlParts.length > 0 ? urlParts.pop() : 'unknown',
        url,
        title,
        author,
        cover,
        chapters
    };
};

export const parseChapter = (html) => {
    if (!html) return '';
    
    const lower = html.toLowerCase();
    // Explicitly reject Cloudflare / Captcha / Turnstile challenge pages
    if (
        lower.includes('enable javascript and cookies to continue') ||
        lower.includes('just a moment...') ||
        lower.includes('attention required! | cloudflare') ||
        lower.includes('cf-browser-verification') ||
        lower.includes('challenge-running') ||
        lower.includes('turnstile') ||
        lower.includes('verify you are human')
    ) {
        return '';
    }

    // Explicitly reject novel directory / overview / tag notice pages
    if (html.includes('id="chapter-list"') || html.includes('class="novel-detail"') || html.includes('小說標籤功能上線')) {
        if (!html.includes('chapter-detail') && !html.includes('chapter-nav')) {
            return '';
        }
    }

    let content = '';

    // First try: look for content inside chapter-detail
    const chapterDetailMatch = html.match(/<div[^>]*class=["'][^"']*chapter-detail[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<div[^>]*class=["'](?:chapter-nav|footer|comment)/i) ||
                               html.match(/<div[^>]*class=["'][^"']*chapter-detail[^"']*["'][^>]*>([\s\S]*)/i);
    
    const scope = chapterDetailMatch ? chapterDetailMatch[1] : html;

    const contentIndex = scope.search(/<div[^>]*class=["'][^"']*content[^"']*["'][^>]*>/i);
    if (contentIndex !== -1) {
        const startTagEnd = scope.indexOf('>', contentIndex);
        if (startTagEnd !== -1) {
            const rest = scope.substring(startTagEnd + 1);
            const endMatch = rest.search(/<div[^>]*class=["'](?:chapter-nav|nav|comment|footer|pagination|chapter-detail)/i);
            if (endMatch !== -1) {
                content = rest.substring(0, endMatch);
            } else {
                let depth = 1;
                const tagRegex = /<\/?div[^>]*>/gi;
                let match;
                while ((match = tagRegex.exec(rest)) !== null) {
                    if (match[0].startsWith('</')) {
                        depth--;
                        if (depth === 0) {
                            content = rest.substring(0, match.index);
                            break;
                        }
                    } else {
                        depth++;
                    }
                }
                if (!content) {
                    content = rest.split(/<\/body>/i)[0];
                }
            }
        }
    }

    if (!content) {
        const fallbackMatch = html.match(/<div[^>]*class=["']?[^"']*post-content[^"']*["']?[^>]*>([\s\S]*?)<\/div>/i) ||
                              html.match(/<div[^>]*id=["']?content["']?[^>]*>([\s\S]*?)<\/div>/i);
        if (fallbackMatch) content = fallbackMatch[1];
    }
    
    if (!content) return '';
    
    // Strip ads and navigation
    content = content.replace(/<script[\s\S]*?<\/script>/gi, '');
    content = content.replace(/<style[\s\S]*?<\/style>/gi, '');
    content = content.replace(/<ins[\s\S]*?<\/ins>/gi, '');
    content = content.replace(/<div[^>]*class=["'](?:ad|advertisement|banner)[^"']*["'][\s\S]*?<\/div>/gi, '');
    content = content.replace(/<br\s*\/?>/gi, '\n');
    content = content.replace(/<\/p>/gi, '\n');
    content = content.replace(/<\/div>/gi, '\n');
    content = content.replace(/<[^>]+>/g, '');
    
    // HTML Entity Decoding
    content = content.replace(/&nbsp;/gi, ' ');
    content = content.replace(/&lt;/gi, '<');
    content = content.replace(/&gt;/gi, '>');
    content = content.replace(/&amp;/gi, '&');
    content = content.replace(/&quot;/gi, '"');
    content = content.replace(/&#39;/gi, "'");
    content = content.replace(/&apos;/gi, "'");
    content = content.replace(/&(?:ldquo|#8220);/gi, '“');
    content = content.replace(/&(?:rdquo|#8221);/gi, '”');
    content = content.replace(/&(?:lsquo|#8216);/gi, '‘');
    content = content.replace(/&(?:rsquo|#8217);/gi, '’');
    content = content.replace(/&(?:hellip|#8230);/gi, '…');
    content = content.replace(/&(?:mdash|#8212);/gi, '—');
    content = content.replace(/&(?:ndash|#8211);/gi, '–');
    content = content.replace(/&(?:middot|#183);/gi, '·');
    content = content.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));

    content = content.replace(/[\r\n]+/g, '\n').trim();

    // If result contains the announcement text or bot warning text, reject it!
    const lowerContent = content.toLowerCase();
    if (
        content.includes('小說標籤功能上線') ||
        content.includes('替小說新增標籤喔') ||
        lowerContent.includes('enable javascript and cookies to continue') ||
        lowerContent.includes('just a moment') ||
        lowerContent.includes('attention required') ||
        lowerContent.includes('cloudflare') ||
        lowerContent.includes('challenge-running') ||
        lowerContent.includes('verify you are human')
    ) {
        return '';
    }

    return content;
};
