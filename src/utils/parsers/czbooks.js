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
        console.error('CZBooks Parse Search Error:', e);
        return [];
    }
};

export const parseInfo = (html, url = '') => {
    const titleMatch = html.match(/<span class="title">(.+?)<\/span>/);
    const title = titleMatch ? titleMatch[1] : '未知書名';
    
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
        cover,
        chapters
    };
};

export const parseChapter = (html) => {
    const contentMatch = html.match(/<div class="content">([\s\S]*?)<\/div>/);
    if (!contentMatch) return '';
    
    let content = contentMatch[1];
    content = content.replace(/<script[\s\S]*?<\/script>/gi, '');
    content = content.replace(/<br\s*\/?>/gi, '\n');
    content = content.replace(/<[^>]+>/g, '');
    content = content.replace(/&nbsp;/g, ' ');
    content = content.replace(/[\r\n]+/g, '\n');
    return content.trim();
};
