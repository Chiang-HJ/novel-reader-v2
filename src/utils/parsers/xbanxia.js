export const domain = 'xbanxia.cc';
export const name = '半夏小說';

export const parseSearch = (html) => {
    // Basic fallback search if needed
    return [];
};

export const parseInfo = (html, url = '') => {
    const titleMatch = html.match(/<h1>(.*?)<\/h1>/);
    const title = titleMatch ? titleMatch[1].trim() : '未知書名';
    
    const authorMatch = html.match(/作者︰.*?<a[^>]*>(.*?)<\/a>/) || html.match(/作者︰([\s\S]*?)<\/p>/);
    const author = authorMatch ? authorMatch[1].replace(/<[^>]+>/g, '').trim() : '未知作者';

    const imgMatch = html.match(/<div class="book-img"[^>]*>[\s\S]*?<img[^>]+data-original="([^"]+)"/i) || html.match(/<div class="book-img"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/i);
    let cover = imgMatch ? imgMatch[1].trim() : null;
    if (cover && cover.startsWith('/')) {
        cover = 'http://www.xbanxia.cc' + cover;
    }
    
    const chapters = [];
    const chaptersMatch = html.match(/<div class="book-list[^>]*>[\s\S]*?<ul>([\s\S]*?)<\/ul>/i) || html.match(/<div class="dirlist clearfix">[\s\S]*?<\/div>/) || html.match(/<ul class="chapter">[\s\S]*?<\/ul>/);
    
    if (chaptersMatch) {
        const linkRegex = /<a[^>]+href=["']?([^"'\s>]+)["']?[^>]*>([\s\S]*?)<\/a>/gi;
        let match;
        const seen = new Set();
        while ((match = linkRegex.exec(chaptersMatch[0])) !== null) {
            let href = match[1].trim();
            let text = match[2].replace(/<[^>]+>/g, '').trim();
            
            if (!href.startsWith('http')) {
                if (href.startsWith('/')) href = 'http://www.xbanxia.cc' + href;
                else {
                    const baseUrl = url.split('/').slice(0, -1).join('/');
                    href = baseUrl + '/' + href;
                }
            }
            
            if (!seen.has(href)) {
                seen.add(href);
                chapters.push({
                    url: href,
                    title: text || '未知章節'
                });
            }
        }
    }
    
    const cleanUrl = (url || '').split('?')[0].split('#')[0];
    const urlParts = cleanUrl.split('/').filter(Boolean);
    const id = urlParts.length > 0 ? urlParts.pop().replace('.html', '') : 'xbanxia_' + Date.now();

    return {
        id,
        url,
        title,
        author,
        cover,
        chapters
    };
};

export const parseChapter = (html) => {
    if (!html) return '';
    
    let content = '';

    const contentMatch = html.match(/<div id="nr1"[^>]*>([\s\S]*?)<div class="outbt">/i) || html.match(/<div id="nr1"[^>]*>([\s\S]*?)<\/div>/i);
    
    if (contentMatch) {
        content = contentMatch[1];
    } else {
        const fallbackMatch = html.match(/<div class="page-content[^>]*>([\s\S]*?)<\/div>/i) ||
                              html.match(/<div[^>]*id=["']?content["']?[^>]*>([\s\S]*?)<\/div>/i);
        if (fallbackMatch) content = fallbackMatch[1];
    }
    
    if (!content) return '';
    
    // Strip ads and navigation
    content = content.replace(/<script[\s\S]*?<\/script>/gi, '');
    content = content.replace(/<style[\s\S]*?<\/style>/gi, '');
    content = content.replace(/<div class="outbt"[\s\S]*?<\/div>/gi, '');
    content = content.replace(/<div[^>]*style="height:\s*0px[^>]*>[\s\S]*?<\/div>/gi, '');
    content = content.replace(/<span[^>]*半夏小說[^<]*<\/span>/gi, ''); // their watermark
    
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
    
    content = content.replace(/[\r\n]+/g, '\n').trim();

    return content;
};
