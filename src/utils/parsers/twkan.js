export const domain = 'twkan.com';
export const name = '台灣看書 (TWKan)';

export const parseSearchHtml = (html) => {
    try {
        const results = [];
        const blocks = html.split('bookinfo').slice(1);
        
        blocks.forEach(block => {
            const urlMatch = block.match(/href\s*=\s*["']([^"']*\/book\/[^"']*)["']/i);
            const titleMatch = block.match(/bookname["'][^>]*>(?:<a[^>]*>)?([\s\S]*?)(?:<\/a>)?<\//i);
            const authorMatch = block.match(/作者[：:]\s*([\s\S]*?)(?:<\/div>|<span|<\/p>)/i);
            const imgMatch = block.match(/<img[^>]*src\s*=\s*["']([^"']+)["']/i);
            
            if (urlMatch && titleMatch) {
                let extractedUrl = urlMatch[1].trim();
                let extractedCover = imgMatch ? imgMatch[1].trim() : '';
                
                // Try to clean title heavily
                let cleanTitle = titleMatch[1].replace(/<[^>]+>/g, '').trim();
                if (!cleanTitle && titleMatch[0]) {
                    // fallback if regex grouped empty
                     cleanTitle = titleMatch[0].replace(/<[^>]+>/g, '').trim();
                }

                results.push({
                    site: name,
                    url: extractedUrl.startsWith('http') ? extractedUrl : `https://twkan.com${extractedUrl}`,
                    title: cleanTitle,
                    author: authorMatch ? authorMatch[1].replace(/<[^>]+>/g, '').trim() : '未知作者',
                    cover: extractedCover.startsWith('http') ? extractedCover : (extractedCover ? `https://twkan.com${extractedCover}` : null)
                });
            }
        });
        return results;
    } catch (e) {
        console.error('TWKan Parse Search Error:', e);
        return [];
    }
};

export const parseInfo = (html, url) => {
    // Example regex for info page
    const titleMatch = html.match(/<meta property="og:novel:book_name" content="([^"]+)"/);
    const title = titleMatch ? titleMatch[1] : '未知書名';
    
    const imgMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
    const cover = imgMatch ? imgMatch[1] : null;
    
    const chapters = [];
    const linkRegex = /<a[^>]+href=["']?([^"'\s>]+)["']?[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    const seen = new Set();
    while ((match = linkRegex.exec(html)) !== null) {
        let href = match[1].trim();
        let text = match[2].replace(/<[^>]+>/g, '').trim();
        
        // Match twkan chapter pattern (typically ends with .html)
        // Avoid matching the novel info page itself or unrelated links
        if (href.match(/\.html(?:#.*)?$/) && href !== url && !seen.has(href) && href.length > 5) {
            seen.add(href);
            chapters.push({
                url: href.startsWith('http') ? href : `https://twkan.com${href}`,
                title: text || '未知章節'
            });
        }
    }
    
    return {
        id: url ? url.split('/').filter(Boolean).pop() : 'unknown',
        url,
        title,
        cover,
        chapters
    };
};

export const parseChapter = (html) => {
    const contentMatch = html.match(/<div id="content"[^>]*>([\s\S]*?)<\/div>/);
    if (!contentMatch) return '';
    
    let content = contentMatch[1];
    content = content.replace(/<script[\s\S]*?<\/script>/gi, '');
    content = content.replace(/<br\s*\/?>/gi, '\n');
    content = content.replace(/<[^>]+>/g, '');
    content = content.replace(/&nbsp;/g, ' ');
    content = content.replace(/[\r\n]+/g, '\n');
    return content.trim();
};
